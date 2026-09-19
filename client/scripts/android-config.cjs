// Shared, testable setup/check helpers. Only public identifiers enter build profiles.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const CLIENT_KEY = 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('Unable to read JSON configuration. Check the local file. (CONFIG-01)');
  }
};
const validate = (clientId, packageName) => {
  if (!/^\d+-[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId || '')) {
    throw new Error('Enter a valid Web application OAuth client (public ID, not a secret). Run npm run setup:android.');
  }
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName || '')) {
    throw new Error('Invalid Android package: use lowercase letters, for example com.yourname.tldr.');
  }
};
const readLocalEnv = (root) => {
  const file = path.join(root, '.env');
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : {};
};

// Initialize a fresh clone from the sanitized template. A builder's existing
// package, ownership, version and project remain the source of truth on updates.
const readApp = (root) => {
  const file = fs.existsSync(path.join(root, 'app.json')) ? 'app.json' : 'app-placeholder.json';
  return readJson(path.join(root, file));
};
const secureApp = (app) => {
  app.expo.platforms = ['android'];
  app.expo.android ||= {};
  app.expo.android.allowBackup = false;
  const unnecessaryPermissions = [
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.VIBRATE',
  ];
  app.expo.android.blockedPermissions = [...new Set([
    ...(app.expo.android.blockedPermissions || []),
    ...unnecessaryPermissions,
  ])];

  app.expo.plugins = (app.expo.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return !['expo-secure-store', './plugins/withSecurity.cjs'].includes(name);
  });
  app.expo.plugins.push(['expo-secure-store', { configureAndroidBackup: false }], './plugins/withSecurity.cjs');
  return app;
};
// Check for the provided environment variables to be the correct ones
const assertPublicEnvironment = (env) => {
  if (Object.keys(env || {}).some((name) => name.startsWith('EXPO_PUBLIC_') && name !== CLIENT_KEY) ||
    Object.entries(env || {}).some(([name, value]) => /(?:GOOGLE.*(?:SECRET|TOKEN)|CLIENT_SECRET|REFRESH_TOKEN)/i.test(name) || /GOCSPX-|ya29\.|1\/\//.test(String(value)))) {
    throw new Error('Private configuration is not allowed in the build. Remove unexpected EXPO_PUBLIC_ variables.');
  }
};

// Backups are local/private. Existing project ownership and signing configuration
// belong to the builder and must survive security updates and repeated setup.
const writeSetup = (root, clientId, packageName) => {
  validate(clientId, packageName);
  const app = secureApp(readApp(root));
  const eas = readJson(path.join(root, fs.existsSync(path.join(root, 'eas.json')) ? 'eas.json' : 'eas-placeholder.json'));
  const directory = path.join(root, '.local-build-backups');

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);

  const backup = fs.mkdtempSync(path.join(directory, 'setup-'));
  for (const name of ['.env', 'eas.json', 'app.json']) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) {
      const target = path.join(backup, name);
      fs.copyFileSync(source, target);
      fs.chmodSync(target, 0o600);
    }
  }
  app.expo.android.package = packageName;

  for (const profile of Object.values(eas.build)) {
    profile.env = { [CLIENT_KEY]: clientId };
  }

  const files = { '.env': `${CLIENT_KEY}=${clientId}\n`, 'eas.json': JSON.stringify(eas, null, 2) + '\n', 'app.json': JSON.stringify(app, null, 2) + '\n' };

  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.writeFileSync(file, content, { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  }
  return backup;
};

// Fail before uploading a build when configuration is missing or inconsistent.
const check = (root, { environment = process.env } = {}) => {
  const app = readJson(path.join(root, 'app.json')).expo;
  assertPublicEnvironment(environment);

  for (const name of fs.readdirSync(root).filter((name) => /^\.env(?:\.|$)/.test(name))) {
    assertPublicEnvironment(parseEnv(fs.readFileSync(path.join(root, name), 'utf8')));
  }

  assertPublicEnvironment({ APP_CONFIG: JSON.stringify(app) });

  if (app.android?.allowBackup !== false || !app.plugins?.includes('./plugins/withSecurity.cjs')) throw new Error('Apply the security configuration with npm run setup:android.');

  const clientId = (environment[CLIENT_KEY] || readLocalEnv(root)[CLIENT_KEY] || '').trim();
  validate(clientId, app.android?.package);
  if (JSON.stringify(app.platforms) !== '["android"]') throw new Error('app.json must declare only platforms: ["android"].');

  const file = path.join(root, 'eas.json');
  if (!fs.existsSync(file)) throw new Error('APK configuration is missing. Run npm run setup:android.');

  const config = readJson(file);
  for (const value of Object.values(config.build || {})) assertPublicEnvironment(value.env);

  const profile = config.build?.apk;
  if (profile?.android?.buildType !== 'apk' || profile.developmentClient !== false ||
    (profile.android.gradleCommand && profile.android.gradleCommand !== ':app:assembleRelease')) {
    throw new Error('The apk profile must produce a standalone APK. Run npm run setup:android.');
  }
  if (profile.env?.[CLIENT_KEY] !== clientId) {
    throw new Error('The Google client in .env does not match the APK profile. Run npm run setup:android.');
  }
  if (!app.extra?.eas?.projectId) throw new Error('Link your Expo project with npm run project:android before building.');
};
module.exports = { CLIENT_KEY, readJson, readLocalEnv, validate, writeSetup, check, readApp, secureApp, assertPublicEnvironment };
