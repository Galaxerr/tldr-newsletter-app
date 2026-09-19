const path = require('node:path');
const readline = require('node:readline/promises');
const { CLIENT_KEY, readApp, readLocalEnv, writeSetup, validate } = require('./android-config.cjs');
const root = path.resolve(__dirname, '..');

// Run explicitly by the builder; never prompt during npm ci or a remote build.
async function main() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Personal Android setup. You will need a public OAuth ID and an Android package name.');
    console.log('Previous configuration is saved in .local-build-backups/. The Expo project link and signing key are preserved.');
    const previous = readLocalEnv(root)[CLIENT_KEY] || '';
    const clientId = (await prompt.question(`Google Web application client ID${previous ? ' (press Enter to keep the current value)' : ''}: `)).trim() || previous;
    const currentPackage = readApp(root).expo.android.package;
    const packageName = (await prompt.question(`Android package [${currentPackage}]: `)).trim() || currentPackage;
    validate(clientId, packageName);
    writeSetup(root, clientId, packageName);
    console.log('Configured .env, eas.json, and app.json. No secret or refresh token required.');
    console.log('Next: npm run expo:login, npm run project:android, npm run credentials:android.');
    console.log('Register the package and APK signing key SHA-1 in Google Cloud, then run npm run build:apk.');
  } finally {
    prompt.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
