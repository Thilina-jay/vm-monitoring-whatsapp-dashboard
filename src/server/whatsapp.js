import * as baileys from '@whiskeysockets/baileys';
import QRCode from 'qrcode-terminal';
import pino from 'pino';
import db from './db.js';

const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason } = baileys;

let sock = null;
let qrCodeData = null;
let connectionStatus = 'disconnected'; // 'disconnected', 'connecting', 'qr', 'connected'
let statusListener = null;

// Track user VM list menu sessions in-memory
const userSessions = new Map(); // JID -> Array of VM objects

export function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    qr: qrCodeData
  };
}

export function setStatusListener(listener) {
  statusListener = listener;
  // Trigger callback immediately with current status
  if (statusListener) {
    statusListener(getWhatsAppStatus());
  }
}

function broadcastWhatsAppStatus() {
  if (statusListener) {
    statusListener(getWhatsAppStatus());
  }
}

export async function initWhatsApp() {
  try {
    connectionStatus = 'connecting';
    broadcastWhatsAppStatus();

    // Dynamically fetch the latest WhatsApp Web version to prevent 405 Connection Failure
    const { fetchLatestWaWebVersion } = baileys;
    let version = [2, 3000, 1042254818]; // Fallback version
    try {
      const latest = await fetchLatestWaWebVersion();
      if (latest && latest.version) {
        version = latest.version;
        console.log(`Fetched latest WhatsApp Web version: ${version.join('.')}`);
      }
    } catch (err) {
      console.warn('Failed to fetch latest WhatsApp Web version. Using fallback:', err.message);
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Create WhatsApp socket with minimal logging to keep console clean
    sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false, // We will print it manually
      browser: ['Windows', 'Chrome', '110.0.0.0'],
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrCodeData = qr;
        connectionStatus = 'qr';
        console.log('\n--- SCAN THIS WHATSAPP QR CODE ---');
        QRCode.generate(qr, { small: true });
        console.log('----------------------------------\n');
        broadcastWhatsAppStatus();
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || lastDisconnect?.error || 'Unknown error';
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`WhatsApp connection closed. Reconnecting: ${shouldReconnect}. Code: ${statusCode}, Error: ${errorMsg}`);
        connectionStatus = 'disconnected';
        qrCodeData = null;
        broadcastWhatsAppStatus();
        
        if (shouldReconnect) {
          setTimeout(initWhatsApp, 5000); // Wait 5s before reconnecting
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        qrCodeData = null;
        console.log('WhatsApp connection successfully opened and ready!');
        broadcastWhatsAppStatus();
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        const sender = msg.key.remoteJid;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const cleanText = text.trim().toLowerCase();

        if (cleanText === '!status' || cleanText === '!vms' || cleanText === 'status' || cleanText === 'vms') {
          await sendVMList(sender);
        } else if (/^\d+$/.test(cleanText)) {
          await handleVMSelection(sender, parseInt(cleanText));
        }
      }
    });

  } catch (error) {
    console.error('Failed to initialize WhatsApp:', error);
    connectionStatus = 'disconnected';
    broadcastWhatsAppStatus();
  }
}

// Format JID to match WhatsApp requirements
function formatJid(phone) {
  if (!phone) return null;
  phone = phone.trim();
  if (phone.endsWith('@s.whatsapp.net') || phone.endsWith('@g.us')) {
    return phone;
  }
  const cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.length > 0) {
    return `${cleaned}@s.whatsapp.net`;
  }
  return null;
}

// Send list of VMs to user
async function sendVMList(sender) {
  try {
    const vms = await db.all('SELECT * FROM vms ORDER BY name ASC');
    if (vms.length === 0) {
      await sock.sendMessage(sender, { 
        text: "🤖 *VM Monitor System* 🤖\n\nNo Virtual Machines are currently registered on the dashboard. Add some from the web panel first!" 
      });
      return;
    }

    userSessions.set(sender, vms);

    let response = "🤖 *VM Monitor System* 🤖\n\nReply with the number of the VM to view its detailed report:\n\n";
    vms.forEach((vm, index) => {
      const statusEmoji = vm.status === 'online' ? '🟢' : '🔴';
      response += `*${index + 1}* - ${vm.name} (${statusEmoji} ${vm.status.toUpperCase()})\n`;
    });
    response += "\n_Type '!status' at any time to refresh._";

    await sock.sendMessage(sender, { text: response });
  } catch (error) {
    console.error('Error sending VM list over WhatsApp:', error);
  }
}

// Handle VM selection number
async function handleVMSelection(sender, num) {
  try {
    const sessionVms = userSessions.get(sender);
    if (!sessionVms) {
      await sock.sendMessage(sender, { 
        text: "⚠️ Please request the VM list first by sending *!status*." 
      });
      return;
    }

    const index = num - 1;
    if (index < 0 || index >= sessionVms.length) {
      await sock.sendMessage(sender, { 
        text: `⚠️ Invalid selection. Please enter a number between 1 and ${sessionVms.length}.` 
      });
      return;
    }

    const selectedVm = sessionVms[index];
    const vm = await db.get('SELECT * FROM vms WHERE id = ?', [selectedVm.id]);

    if (!vm) {
      await sock.sendMessage(sender, { text: "❌ Selected VM no longer exists." });
      return;
    }

    await sendVMDetailReport(sender, vm);
  } catch (error) {
    console.error('Error handling VM selection over WhatsApp:', error);
  }
}

function formatUptime(seconds) {
  if (!seconds || isNaN(seconds)) return 'Unknown';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) return `${seconds}s`;
  return parts.join(' ');
}

// Send detailed VM report card
async function sendVMDetailReport(sender, vm) {
  let metrics = {};
  try {
    metrics = JSON.parse(vm.metrics || '{}');
  } catch (e) {}

  const statusEmoji = vm.status === 'online' ? '🟢' : '🔴';
  let report = `📊 *VM System Report: ${vm.name}* 📊\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `🖥️ *OS:* ${metrics.os || 'Unknown'}\n`;
  report += `🌐 *Host:* ${vm.host}:${vm.port}\n`;
  report += `🔌 *Status:* ${statusEmoji} ${vm.status.toUpperCase()}\n`;
  report += `⏱️ *Uptime:* ${formatUptime(metrics.uptime)}\n`;
  report += `🕒 *Last Check:* ${vm.last_checked ? new Date(vm.last_checked).toLocaleTimeString() : 'Never'}\n\n`;

  if (vm.status === 'online' && metrics.cpu !== undefined) {
    const ramUsedGb = (metrics.ram.used / (1024 * 1024 * 1024)).toFixed(1);
    const ramTotalGb = (metrics.ram.total / (1024 * 1024 * 1024)).toFixed(1);
    const diskUsedGb = (metrics.disk.used / (1024 * 1024 * 1024)).toFixed(1);
    const diskTotalGb = (metrics.disk.total / (1024 * 1024 * 1024)).toFixed(1);

    report += `📈 *Resources Usage:* \n`;
    report += `- *CPU Load:* ${metrics.cpu}%\n`;
    report += `- *RAM:* ${metrics.ram.percent}% (${ramUsedGb}/${ramTotalGb} GB)\n`;
    report += `- *Disk:* ${metrics.disk.percent}% (${diskUsedGb}/${diskTotalGb} GB)\n`;
  } else {
    report += `❌ _Metrics unavailable because VM is offline._\n`;
  }

  await sock.sendMessage(sender, { text: report });
}

// Send alert message
export async function triggerAlert(vm, metric, value, limit) {
  try {
    const isEnabled = await db.get("SELECT value FROM settings WHERE key = 'whatsapp_enabled'");
    if (!isEnabled || isEnabled.value !== 'true') return;

    const recipientRow = await db.get("SELECT value FROM settings WHERE key = 'alert_phone'");
    const recipient = recipientRow ? formatJid(recipientRow.value) : null;
    if (!recipient || !sock || connectionStatus !== 'connected') return;

    let text = '';
    if (metric === 'connection') {
      text = `🔴 *VM OFFLINE ALERT* 🔴\n\n`;
      text += `*VM Name:* ${vm.name}\n`;
      text += `*Host:* ${vm.host}\n`;
      text += `*Status:* Connection Lost (Offline)\n`;
      text += `*Time:* ${new Date().toLocaleString()}\n\n`;
      text += `⚠️ Please check the server status immediately.`;
    } else {
      text = `⚠️ *VM RESOURCE ALERT: ${vm.name}* ⚠️\n\n`;
      text += `*VM Name:* ${vm.name}\n`;
      text += `*Host:* ${vm.host}\n`;
      text += `*Metric:* ${metric.toUpperCase()}\n`;
      text += `*Current Value:* ${value}%\n`;
      text += `*Threshold Limit:* ${limit}%\n`;
      text += `*Time:* ${new Date().toLocaleString()}\n\n`;
      text += `⚡ Resource usage has exceeded critical thresholds.`;
    }

    await sock.sendMessage(recipient, { text });
    console.log(`Alert sent to ${recipient} for ${vm.name} - ${metric}`);
  } catch (error) {
    console.error('Error sending WhatsApp alert:', error.message);
  }
}

// Send alert recovery message
export async function resolveAlert(vm, metric, value) {
  try {
    const isEnabled = await db.get("SELECT value FROM settings WHERE key = 'whatsapp_enabled'");
    if (!isEnabled || isEnabled.value !== 'true') return;

    const recipientRow = await db.get("SELECT value FROM settings WHERE key = 'alert_phone'");
    const recipient = recipientRow ? formatJid(recipientRow.value) : null;
    if (!recipient || !sock || connectionStatus !== 'connected') return;

    let text = '';
    if (metric === 'connection') {
      text = `🟢 *VM RECOVERED* 🟢\n\n`;
      text += `*VM Name:* ${vm.name}\n`;
      text += `*Host:* ${vm.host}\n`;
      text += `*Status:* Online / Connected\n`;
      text += `*Time:* ${new Date().toLocaleString()}\n\n`;
      text += `✅ Connection re-established successfully.`;
    } else {
      text = `✅ *VM ALERT RESOLVED: ${vm.name}* ✅\n\n`;
      text += `*VM Name:* ${vm.name}\n`;
      text += `*Metric:* ${metric.toUpperCase()}\n`;
      text += `*Current Value:* ${value}%\n`;
      text += `*Time:* ${new Date().toLocaleString()}\n\n`;
      text += `👍 Resource usage is back within normal levels.`;
    }

    await sock.sendMessage(recipient, { text });
    console.log(`Recovery alert sent to ${recipient} for ${vm.name} - ${metric}`);
  } catch (error) {
    console.error('Error sending WhatsApp recovery alert:', error.message);
  }
}
