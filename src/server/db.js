import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log(`Database connected successfully at: ${dbPath}`);
  }
});

// Helper functions to wrap sqlite3 with promises
export function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

export function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

export function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Initialize tables and default settings
export async function initDb() {
  // Create VMs table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS vms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      host TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ssh', 'agent')),
      port INTEGER NOT NULL,
      username TEXT,
      auth_method TEXT CHECK(auth_method IN ('password', 'key')),
      password_or_key TEXT,
      status TEXT DEFAULT 'unknown',
      metrics TEXT,
      last_checked TEXT
    )
  `);

  // Create Settings table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create Alert Logs table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS alert_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vm_id INTEGER NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(vm_id) REFERENCES vms(id) ON DELETE CASCADE
    )
  `);

  // Insert default settings if they don't exist
  const defaultSettings = [
    { key: 'whatsapp_enabled', value: 'false' },
    { key: 'alert_phone', value: '' }, // WhatsApp JID or group ID to send alerts to
    { key: 'threshold_cpu', value: '90' },
    { key: 'threshold_ram', value: '90' },
    { key: 'threshold_disk', value: '90' },
    { key: 'polling_interval', value: '30' } // polling interval in seconds
  ];

  for (const setting of defaultSettings) {
    await dbRun(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [setting.key, setting.value]
    );
  }

  console.log('Database schemas initialized successfully.');
}

export default {
  run: dbRun,
  all: dbAll,
  get: dbGet,
  init: initDb
};
