import * as baileys from '@whiskeysockets/baileys';

const { fetchLatestWaWebVersion } = baileys;

async function checkVersion() {
  if (typeof fetchLatestWaWebVersion !== 'function') {
    console.error('fetchLatestWaWebVersion is not exported by baileys!');
    process.exit(1);
  }
  
  try {
    const { version, isLatest } = await fetchLatestWaWebVersion();
    console.log(`Fetched version: ${version.join('.')}, isLatest: ${isLatest}`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to fetch WA version:', err.message);
    process.exit(1);
  }
}

checkVersion();
