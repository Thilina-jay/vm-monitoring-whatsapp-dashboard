import * as baileys from '@whiskeysockets/baileys';

const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason } = baileys;

console.log('makeWASocket type:', typeof makeWASocket);
console.log('useMultiFileAuthState type:', typeof useMultiFileAuthState);
console.log('DisconnectReason type:', typeof DisconnectReason);
