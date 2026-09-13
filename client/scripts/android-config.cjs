// Shared, testable setup/check helpers. Only public identifiers enter build profiles.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const CLIENT_KEY = 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const validate = (clientId, packageName) => {
  if (!/^\d+-[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId || '')) {
    throw new Error('Inserisci un vero client OAuth di tipo Web application (ID pubblico, non secret). Esegui npm run setup:android.');
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName || '')) {
    throw new Error('Package Android non valido: usa ad esempio com.mionome.tldr, con lettere minuscole.');
  }
};
const readLocalEnv = (root) => {
  const file = path.join(root, '.env');
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
};

// Back up previous local settings before replacing obsolete credential-based builds.
// The backup directory is ignored by Git and excluded from EAS uploads.
const writeSetup = (root, clientId, packageName) => {
  validate(clientId, packageName);
  const app = readJson(path.join(root, 'app.json'));
  const eas = readJson(path.join(root, 'eas-placeholder.json'));
  fs.mkdirSync(path.join(root, '.local-build-backups'), { recursive: true });
  const backup = fs.mkdtempSync(path.join(root, '.local-build-backups', 'setup-'));
  for (const name of ['.env', 'eas.json', 'app.json']) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(backup, name));
  }
  app.expo.android.package = packageName;
  // Reset the project's owner/link so a fork can initialize its own Expo project.
  delete app.expo.owner;
  if (app.expo.extra?.eas) delete app.expo.extra.eas.projectId;
  for (const profile of Object.values(eas.build)) profile.env = { [CLIENT_KEY]: clientId };
  fs.writeFileSync(path.join(root, '.env'), `${CLIENT_KEY}=${clientId}\n`);
  fs.writeFileSync(path.join(root, 'eas.json'), JSON.stringify(eas, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify(app, null, 2) + '\n');
  return backup;
};

// Fail before uploading a build when configuration is missing or inconsistent.
const check = (root, { local = false, environment = process.env } = {}) => {
  const app = readJson(path.join(root, 'app.json')).expo;
  const clientId = (environment[CLIENT_KEY] || readLocalEnv(root)[CLIENT_KEY] || '').trim();
  validate(clientId, app.android?.package);
  if (JSON.stringify(app.platforms) !== '["android"]') throw new Error('app.json deve dichiarare soltanto platforms: ["android"].');
  if (local) return;
  const file = path.join(root, 'eas.json');
  if (!fs.existsSync(file)) throw new Error('Configurazione APK mancante. Esegui npm run setup:android.');
  const profile = readJson(file).build?.apk;
  if (profile?.android?.buildType !== 'apk' || profile.developmentClient !== false) {
    throw new Error('Il profilo apk deve produrre un APK autonomo. Esegui npm run setup:android.');
  }
  if (profile.env?.[CLIENT_KEY] !== clientId) {
    throw new Error('Il client Google di .env e quello del profilo APK non coincidono. Esegui npm run setup:android.');
  }
  if (!app.extra?.eas?.projectId) throw new Error('Collega il tuo progetto Expo con npm run project:android prima di compilare.');
};
module.exports = { CLIENT_KEY, readJson, readLocalEnv, validate, writeSetup, check };
