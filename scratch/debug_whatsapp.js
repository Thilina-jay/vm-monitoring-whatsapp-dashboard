import * as baileys from '@whiskeysockets/baileys';
import pino from 'pino';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');

const makeWASocket = baileys.default;
const { useMultiFileAuthState } = baileys;

async function debug() {
  console.log('--- STARTING VERBOSE WHATSAPP SOCKET DEBUGGER ---');
  
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    console.log('Initializing WASocket...');
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'debug' }), // Set log level to debug to see all internal frames!
      printQRInTerminal: true,
      browser: ['Windows', 'Chrome', '110.0.0.0'],
      syncFullHistory: false
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log('Connection update received:', { connection, qr: qr ? 'exists' : 'null' });
      
      if (connection === 'close') {
        const err = lastDisconnect?.error;
        console.error('Connection closed details:');
        console.error('- Message:', err?.message);
        console.error('- Code/Status:', err?.output?.statusCode);
        console.error('- Payload:', err?.output?.payload);
        console.error('- Complete Error Object:', JSON.stringify(err, null, 2));
        console.error('- Stack Trace:', err?.stack);
        process.exit(1);
      } else if (connection === 'open') {
        console.log('Successfully connected to WhatsApp Web socket!');
        process.exit(0);
      }
    });
  } catch (err) {
    console.error('Crash in debugger boot:', err);
    process.exit(1);
  }
}

debug();
