import * as pkg from '@whiskeysockets/baileys';

console.log('Baileys namespace keys:', Object.keys(pkg));
if (pkg.useMultiFileAuthState) {
  console.log('useMultiFileAuthState found directly on namespace!');
}
if (pkg.default && pkg.default.useMultiFileAuthState) {
  console.log('useMultiFileAuthState found on default!');
}
