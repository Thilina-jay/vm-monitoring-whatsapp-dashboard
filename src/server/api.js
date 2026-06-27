import express from 'express';
import db from './db.js';
import { pollVM, pollAllVMs } from './poller.js';
import { getWhatsAppStatus, initWhatsApp } from './whatsapp.js';

const router = express.Router();

// --- VM Routes ---

// Get all VMs
router.get('/vms', async (req, res) => {
  try {
    const vms = await db.all('SELECT * FROM vms ORDER BY name ASC');
    res.json(vms.map(vm => ({
      ...vm,
      metrics: vm.metrics ? JSON.parse(vm.metrics) : null
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a new VM
router.post('/vms', async (req, res) => {
  const { name, host, type, port, username, auth_method, password_or_key } = req.body;
  if (!name || !host || !type || !port) {
    return res.status(400).json({ error: 'Name, host, type, and port are required.' });
  }

  try {
    const result = await db.run(
      `INSERT INTO vms (name, host, type, port, username, auth_method, password_or_key) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, host, type, port, username || null, auth_method || null, password_or_key || null]
    );
    
    // Poll the VM immediately to fetch initial status
    const newVm = await db.get('SELECT * FROM vms WHERE id = ?', [result.id]);
    const updatedVm = await pollVM(newVm);

    res.status(201).json(updatedVm);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'A VM with this name already exists.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update a VM
router.put('/vms/:id', async (req, res) => {
  const { id } = req.params;
  const { name, host, type, port, username, auth_method, password_or_key } = req.body;

  if (!name || !host || !type || !port) {
    return res.status(400).json({ error: 'Name, host, type, and port are required.' });
  }

  try {
    const existing = await db.get('SELECT * FROM vms WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'VM not found' });
    }

    await db.run(
      `UPDATE vms 
       SET name = ?, host = ?, type = ?, port = ?, username = ?, auth_method = ?, password_or_key = ?
       WHERE id = ?`,
      [name, host, type, port, username || null, auth_method || null, password_or_key || null, id]
    );

    // Repoll the VM
    const updated = await db.get('SELECT * FROM vms WHERE id = ?', [id]);
    const repolled = await pollVM(updated);

    res.json(repolled);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a VM
router.delete('/vms/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.get('SELECT * FROM vms WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'VM not found' });
    }

    await db.run('DELETE FROM vms WHERE id = ?', [id]);
    res.json({ message: 'VM deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Poll all VMs manually
router.post('/vms/poll', async (req, res) => {
  try {
    const results = await pollAllVMs();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Poll a single VM manually
router.post('/vms/:id/poll', async (req, res) => {
  const { id } = req.params;
  try {
    const vm = await db.get('SELECT * FROM vms WHERE id = ?', [id]);
    if (!vm) {
      return res.status(404).json({ error: 'VM not found' });
    }
    const result = await pollVM(vm);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Settings Routes ---

// Get all settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await db.all('SELECT * FROM settings');
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
router.post('/settings', async (req, res) => {
  const updates = req.body;
  try {
    for (const [key, value] of Object.entries(updates)) {
      await db.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(value)]
      );
    }
    
    // Automatically trigger WhatsApp gateway initialization if enabled
    if (updates.whatsapp_enabled === 'true') {
      const waStatus = getWhatsAppStatus();
      if (waStatus.status === 'disconnected') {
        console.log('Detected WhatsApp toggle ON. Starting WhatsApp connection gateway...');
        initWhatsApp().catch(console.error);
      }
    }
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- WhatsApp Status Route ---
router.get('/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

// --- Alert Logs Route ---
router.get('/alerts', async (req, res) => {
  try {
    const logs = await db.all(`
      SELECT alert_logs.*, vms.name as vm_name 
      FROM alert_logs 
      JOIN vms ON alert_logs.vm_id = vms.id 
      ORDER BY alert_logs.timestamp DESC 
      LIMIT 50
    `);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
