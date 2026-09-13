const path = require('node:path');
const { check } = require('./android-config.cjs');

// The same validation is used by the cloud APK command and local development.
try {
  check(path.resolve(__dirname, '..'), { local: process.argv.includes('--local') });
  console.log('Configurazione Android verificata. Google Cloud deve avere package e SHA-1 della firma effettiva.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
