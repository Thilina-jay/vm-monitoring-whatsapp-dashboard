import pkg from '@whiskeysockets/baileys';

console.log('Baileys keys:', Object.keys(pkg));
if (pkg.default) {
  console.log('Baileys default keys:', Object.keys(pkg.default));
}
