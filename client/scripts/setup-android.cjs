const path = require('node:path');
const readline = require('node:readline/promises');
const { CLIENT_KEY, readJson, readLocalEnv, writeSetup, validate } = require('./android-config.cjs');
const root = path.resolve(__dirname, '..');

// Run explicitly by the builder; never prompt during npm ci or a remote build.
async function main() {
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Configurazione Android personale. Servono un ID OAuth pubblico e il package Android.');
    console.log('La configurazione precedente viene conservata in .local-build-backups/. Il collegamento Expo viene azzerato.');
    const previous = readLocalEnv(root)[CLIENT_KEY] || '';
    const clientId = (await prompt.question(`Client ID Google di tipo Web application${previous ? ' (Invio per mantenere quello attuale)' : ''}: `)).trim() || previous;
    const currentPackage = readJson(path.join(root, 'app.json')).expo.android.package;
    const packageName = (await prompt.question(`Package Android [${currentPackage}]: `)).trim() || currentPackage;
    validate(clientId, packageName);
    writeSetup(root, clientId, packageName);
    console.log('Configurati .env, eas.json e app.json. Nessun secret o refresh token richiesto.');
    console.log('Ora: npm run expo:login, npm run project:android, npm run credentials:android.');
    console.log('Registra in Google Cloud il package e la SHA-1 della chiave APK, poi esegui npm run build:apk.');
  } finally {
    prompt.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
