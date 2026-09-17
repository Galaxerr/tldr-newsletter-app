const path = require('node:path');
const { check } = require('./android-config.cjs');

// Validate the standalone APK configuration before uploading a cloud build.
try {
  check(path.resolve(__dirname, '..'));
  console.log('Configurazione Android verificata. Google Cloud deve avere package e SHA-1 della firma effettiva.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
