import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeSetup, check } = require('../scripts/android-config.cjs');
const read = (root, name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const template = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

test('EAS commands use the exact CLI version required by the configuration template', () => {
  const version = template('eas-placeholder.json').cli.version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const { scripts } = template('package.json');
  for (const name of ['expo:login', 'project:android', 'credentials:android', 'build:apk']) {
    assert.equal(scripts[name].match(/\bnpx eas-cli@([^\s]+)/)?.[1], version, name);
  }
});

test('Android setup drops empty status-bar plugins while preserving personal build identities and settings', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'tldr-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = template('app-placeholder.json');
  app.expo.owner = 'synthetic-owner';
  app.expo.extra = { eas: { projectId: 'synthetic-project' } };
  app.expo.android.package = 'com.synthetic.reader';
  app.expo.android.versionCode = 42;
  app.expo.plugins.push('expo-status-bar', ['expo-status-bar', {}]);
  const eas = template('eas-placeholder.json');
  const clientId = '123-synthetic.apps.googleusercontent.com';
  eas.build.apk.env = { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: clientId };
  eas.build.apk.android.credentialsSource = 'local';
  eas.build.apk.channel = 'synthetic-channel';
  writeFileSync(join(root, 'app.json'), JSON.stringify(app));
  writeFileSync(join(root, 'eas.json'), JSON.stringify(eas));
  const backup = writeSetup(root, clientId, app.expo.android.package);
  const expected = structuredClone(app);
  expected.expo.plugins = expected.expo.plugins.filter((plugin) =>
    (Array.isArray(plugin) ? plugin[0] : plugin) !== 'expo-status-bar');
  assert.deepEqual(read(root, 'app.json'), expected);
  assert.deepEqual(read(root, 'eas.json'), eas);
  assert.deepEqual(read(backup, 'app.json'), app);
  assert.doesNotThrow(() => check(root, { environment: {} }));
});
