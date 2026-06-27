import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dns from 'dns';

// Force Node to prefer IPv4 resolution to prevent connection hangs/failures
dns.setDefaultResultOrder('ipv4first');

import db from './db.js';
import apiRouter from './api.js';
import { initWhatsApp, setStatusListener } from './whatsapp.js';
import { startPoller, pollAllVMs } from './poller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// API endpoints
app.use('/api', apiRouter);

// Serve static frontend files in production
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));

// Fallback all non-API routing to index.html for React SPA compatibility
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.resolve(distPath, 'index.html'), (err) => {
    if (err) {
      // If index.html is missing (e.g. in dev mode before building), send fallback message
      res.status(200).send(`
        <html>
          <head><title>VM Dashboard</title></head>
          <body style="background:#0b0d19;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;">
            <h1>Dashboard Backend is Running</h1>
            <p>Vite development client is running separately on port 5173.</p>
            <p style="color:#6d7080;">Build the frontend using <code>npm run build</code> to serve it from this port.</p>
          </body>
        </html>
      `);
    }
  });
});

// --- WebSocket Real-Time Communication ---

// List of connected clients
const clients = new Set();

wss.on('connection', async (ws) => {
  clients.add(ws);
  console.log(`WebSocket client connected. Total clients: ${clients.size}`);

  // Send current WhatsApp status immediately on connect
  const wsStatus = await db.get("SELECT value FROM settings WHERE key = 'whatsapp_enabled'");
  const isWaEnabled = wsStatus ? wsStatus.value === 'true' : false;
  
  // Get WhatsApp connection status
  const apiStatus = await import('./whatsapp.js').then(m => m.getWhatsAppStatus());
  
  ws.send(JSON.stringify({
    type: 'whatsapp_status',
    payload: {
      enabled: isWaEnabled,
      ...apiStatus
    }
  }));

  // Send current VM statuses immediately on connect
  try {
    const vms = await db.all('SELECT * FROM vms ORDER BY name ASC');
    ws.send(JSON.stringify({
      type: 'vms_update',
      payload: vms.map(vm => ({
        ...vm,
        metrics: vm.metrics ? JSON.parse(vm.metrics) : null
      }))
    }));
  } catch (err) {
    console.error('Error fetching VMs for new WS client:', err.message);
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
  });
});

// Broadcast helper
function broadcast(message) {
  const payload = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Hook WhatsApp state changes into WebSocket broadcasts
setStatusListener((status) => {
  db.get("SELECT value FROM settings WHERE key = 'whatsapp_enabled'").then((row) => {
    const enabled = row ? row.value === 'true' : false;
    broadcast({
      type: 'whatsapp_status',
      payload: {
        enabled,
        ...status
      }
    });
  });
});

// Periodically broadcast updated VM status (e.g. every 5 seconds) to keep dashboard snappy
setInterval(async () => {
  if (clients.size === 0) return;
  try {
    const vms = await db.all('SELECT * FROM vms ORDER BY name ASC');
    broadcast({
      type: 'vms_update',
      payload: vms.map(vm => ({
        ...vm,
        metrics: vm.metrics ? JSON.parse(vm.metrics) : null
      }))
    });
  } catch (err) {
    console.error('Error in periodic VM WebSocket broadcast:', err.message);
  }
}, 5000);

// --- Bootstrap services ---
async function bootstrap() {
  try {
    // 1. Initialize SQLite Database
    await db.init();

    // 2. Start VM Polling engine
    await startPoller();

    // 3. Initialize WhatsApp connection
    const waEnabledSetting = await db.get("SELECT value FROM settings WHERE key = 'whatsapp_enabled'");
    if (waEnabledSetting && waEnabledSetting.value === 'true') {
      console.log('WhatsApp is enabled in settings. Initializing gateway connection...');
      await initWhatsApp();
    } else {
      console.log('WhatsApp is disabled in settings. Skipping initialization.');
    }

    // 4. Start HTTP Server
    server.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`  Central VM Monitoring Dashboard Backend Started`);
      console.log(`  - Local:   http://localhost:${PORT}`);
      console.log(`=================================================`);
    });

  } catch (error) {
    console.error('Failed during server bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();
