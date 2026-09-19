const path = require('node:path');
const { check } = require('./android-config.cjs');

// Validate the standalone APK configuration before uploading a cloud build.
try {
  check(path.resolve(__dirname, '..'));
  console.log('Android configuration verified. Google Cloud must include the package and the actual signing key SHA-1.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
