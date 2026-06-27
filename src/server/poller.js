import { Client } from 'ssh2';
import db from './db.js';
import { triggerAlert, resolveAlert } from './whatsapp.js';

let pollingTimer = null;

// Helper to run commands over SSH
function runSshCommand(config, cmd) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let errOutput = '';
    
    // Set a connection timeout of 10 seconds
    const timeoutTimer = setTimeout(() => {
      conn.end();
      reject(new Error('SSH Connection Timeout'));
    }, 10000);

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timeoutTimer);
          conn.end();
          return reject(err);
        }
        stream.on('data', (data) => {
          output += data.toString();
        });
        stream.stderr.on('data', (data) => {
          errOutput += data.toString();
        });
        stream.on('close', (code) => {
          clearTimeout(timeoutTimer);
          conn.end();
          if (code !== 0) {
            reject(new Error(`Command exited with code ${code}. Error: ${errOutput}`));
          } else {
            resolve(output);
          }
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeoutTimer);
      reject(err);
    });

    const connConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 10000
    };

    if (config.auth_method === 'password') {
      connConfig.password = config.password_or_key;
    } else {
      connConfig.privateKey = config.password_or_key;
    }

    conn.connect(connConfig);
  });
}

// Parse SSH command output for Linux
export function parseSshOutput(rawOutput) {
  const sections = {};
  let currentSection = null;
  const lines = rawOutput.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('===')) {
      currentSection = line.replace(/===/g, '').trim();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  // 1. Memory Parse
  let ramPercent = 0;
  let ramTotalBytes = 0;
  let ramUsedBytes = 0;
  if (sections['MEMINFO']) {
    let memTotal = 0;
    let memAvailable = 0;
    for (const line of sections['MEMINFO']) {
      if (line.startsWith('MemTotal:')) {
        memTotal = parseInt(line.match(/\d+/)[0]) * 1024; // KB to Bytes
      }
      if (line.startsWith('MemAvailable:')) {
        memAvailable = parseInt(line.match(/\d+/)[0]) * 1024; // KB to Bytes
      }
    }
    if (memTotal > 0) {
      ramTotalBytes = memTotal;
      ramUsedBytes = memTotal - memAvailable;
      ramPercent = Math.round((ramUsedBytes / ramTotalBytes) * 100 * 10) / 10;
    }
  }

  // 2. Uptime Parse
  let uptimeSeconds = 0;
  if (sections['UPTIME'] && sections['UPTIME'].length > 0) {
    const parts = sections['UPTIME'][0].split(/\s+/);
    if (parts.length > 0) {
      uptimeSeconds = Math.round(parseFloat(parts[0]));
    }
  }

  // 3. Disk Parse
  let diskPercent = 0;
  let diskTotalBytes = 0;
  let diskUsedBytes = 0;
  if (sections['DISK'] && sections['DISK'].length > 1) {
    // Second line of df contains target metrics
    const dataLine = sections['DISK'][1];
    const parts = dataLine.split(/\s+/);
    if (parts.length >= 5) {
      const totalKb = parseInt(parts[1]);
      const usedKb = parseInt(parts[2]);
      if (totalKb > 0) {
        diskTotalBytes = totalKb * 1024;
        diskUsedBytes = usedKb * 1024;
        diskPercent = Math.round((diskUsedBytes / diskTotalBytes) * 100 * 10) / 10;
      }
    }
  }

  // 4. CPU Parse
  let cpuPercent = 0;
  if (sections['CPU'] && sections['CPU'].length > 0) {
    // vmstat output has table headers (lines 0, 1) and data (line 2)
    const dataLine = sections['CPU'][sections['CPU'].length - 1];
    const parts = dataLine.trim().split(/\s+/);
    // vmstat 15th column (out of 17) is CPU idle 'id' (1-based index 15)
    if (parts.length >= 15) {
      const idle = parseInt(parts[14]);
      if (!isNaN(idle)) {
        cpuPercent = 100 - idle;
      }
    }
  }

  // 5. OS Parse
  let osName = 'Linux VM';
  if (sections['OS']) {
    for (const line of sections['OS']) {
      if (line.startsWith('PRETTY_NAME=')) {
        osName = line.replace('PRETTY_NAME=', '').replace(/"/g, '');
        break;
      }
    }
  }

  return {
    cpu: cpuPercent,
    ram: {
      total: ramTotalBytes,
      used: ramUsedBytes,
      percent: ramPercent
    },
    disk: {
      total: diskTotalBytes,
      used: diskUsedBytes,
      percent: diskPercent
    },
    uptime: uptimeSeconds,
    os: osName
  };
}

// Poll metrics from SSH VM
async function pollSsh(vm) {
  // Combine commands into a single run to optimize performance and reduce SSH handshakes
  const cmd = 'echo "===MEMINFO===" && cat /proc/meminfo && echo "===UPTIME===" && cat /proc/uptime && echo "===DISK===" && df -k / && echo "===CPU===" && vmstat 1 2 && echo "===OS===" && cat /etc/os-release';
  const rawOutput = await runSshCommand(vm, cmd);
  return parseSshOutput(rawOutput);
}

// Poll metrics from Agent-based VM (Windows/Linux)
async function pollAgent(vm) {
  const url = `http://${vm.host}:${vm.port}/metrics`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000); // 8 second timeout

  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(id);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  return await response.json();
}

// Main VM polling routine
export async function pollVM(vm) {
  try {
    let metrics;
    if (vm.type === 'ssh') {
      metrics = await pollSsh(vm);
    } else {
      metrics = await pollAgent(vm);
    }

    const lastChecked = new Date().toISOString();
    
    // Save to database
    await db.run(
      'UPDATE vms SET status = ?, metrics = ?, last_checked = ? WHERE id = ?',
      ['online', JSON.stringify(metrics), lastChecked, vm.id]
    );

    // Evaluate thresholds
    await checkThresholds(vm, metrics);

    return { ...vm, status: 'online', metrics, last_checked: lastChecked };
  } catch (error) {
    console.error(`Error polling VM ${vm.name} (${vm.host}):`, error.message);
    const lastChecked = new Date().toISOString();
    
    await db.run(
      'UPDATE vms SET status = ?, last_checked = ? WHERE id = ?',
      ['offline', lastChecked, vm.id]
    );

    // Handle VM offline alert
    await handleOfflineAlert(vm);

    return { ...vm, status: 'offline', last_checked: lastChecked };
  }
}

// Threshold Check & WhatsApp alerting logic
async function checkThresholds(vm, metrics) {
  // Get threshold configurations
  const thresholdRows = await db.all("SELECT key, value FROM settings WHERE key LIKE 'threshold_%'");
  const thresholds = {};
  thresholdRows.forEach(row => {
    thresholds[row.key] = parseFloat(row.value);
  });

  const alerts = [
    { metric: 'cpu', current: metrics.cpu, limit: thresholds['threshold_cpu'] },
    { metric: 'ram', current: metrics.ram.percent, limit: thresholds['threshold_ram'] },
    { metric: 'disk', current: metrics.disk.percent, limit: thresholds['threshold_disk'] }
  ];

  for (const alert of alerts) {
    if (alert.current >= alert.limit) {
      // Check if alert was already triggered recently
      const existingAlert = await db.get(
        "SELECT id FROM alert_logs WHERE vm_id = ? AND metric = ? AND status = 'triggered'",
        [vm.id, alert.metric]
      );

      if (!existingAlert) {
        // Log alert in DB
        const timestamp = new Date().toISOString();
        await db.run(
          "INSERT INTO alert_logs (vm_id, metric, value, timestamp, status) VALUES (?, ?, ?, ?, 'triggered')",
          [vm.id, alert.metric, alert.current, timestamp]
        );
        // Dispatch WhatsApp Alert
        await triggerAlert(vm, alert.metric, alert.current, alert.limit);
      }
    } else {
      // Metric is back in normal range. Let's see if we need to resolve an existing alert
      const existingAlert = await db.get(
        "SELECT id FROM alert_logs WHERE vm_id = ? AND metric = ? AND status = 'triggered'",
        [vm.id, alert.metric]
      );

      if (existingAlert) {
        const timestamp = new Date().toISOString();
        // Mark alert as resolved
        await db.run(
          "UPDATE alert_logs SET status = 'resolved', timestamp = ? WHERE id = ?",
          [timestamp, existingAlert.id]
        );
        // Send WhatsApp notification that VM recovered
        await resolveAlert(vm, alert.metric, alert.current);
      }
    }
  }
}

// Alert logic if VM becomes offline
async function handleOfflineAlert(vm) {
  const existingAlert = await db.get(
    "SELECT id FROM alert_logs WHERE vm_id = ? AND metric = 'connection' AND status = 'triggered'",
    [vm.id]
  );

  if (!existingAlert && vm.status === 'online') {
    // Only alert if transitioning from online to offline
    const timestamp = new Date().toISOString();
    await db.run(
      "INSERT INTO alert_logs (vm_id, metric, value, timestamp, status) VALUES (?, 'connection', 0, ?, 'triggered')",
      [vm.id, timestamp]
    );
    await triggerAlert(vm, 'connection', 0, 0);
  }
}

// Poll all VMs and coordinate background timers
export async function pollAllVMs() {
  const vms = await db.all('SELECT * FROM vms');
  const results = [];
  for (const vm of vms) {
    const res = await pollVM(vm);
    results.push(res);
  }
  return results;
}

export async function startPoller() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
  }

  const intervalSetting = await db.get("SELECT value FROM settings WHERE key = 'polling_interval'");
  const intervalSeconds = intervalSetting ? parseInt(intervalSetting.value) : 30;

  console.log(`Starting VM Poller loop. Interval: ${intervalSeconds}s`);
  
  // Run once immediately
  pollAllVMs().catch(console.error);

  pollingTimer = setInterval(() => {
    pollAllVMs().catch(console.error);
  }, intervalSeconds * 1000);
}

export function stopPoller() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('VM Poller loop stopped.');
  }
}
