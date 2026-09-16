const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
const excludes = domains.map((domain) => `    <exclude domain="${domain}" path="."/>`).join('\n');
const backupRules = `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>\n${excludes}\n</full-backup-content>\n`;
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules>\n  <cloud-backup>\n${excludes}\n  </cloud-backup>\n  <device-transfer>\n${excludes}\n  </device-transfer>\n</data-extraction-rules>\n`;
const configureManifest = (manifest) => {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  Object.assign(app.$, {
    'android:allowBackup': 'false',
    'android:usesCleartextTraffic': 'false',
    'android:fullBackupContent': '@xml/tldr_backup_rules',
    'android:dataExtractionRules': '@xml/tldr_extraction_rules',
  });
  return manifest;
};
const withSecurity = (config) => {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = configureManifest(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const directory = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'tldr_backup_rules.xml'), backupRules);
    await fs.writeFile(path.join(directory, 'tldr_extraction_rules.xml'), extractionRules);
    return mod;
  }]);
};
module.exports = withSecurity;
module.exports.configureManifest = configureManifest;
module.exports.backupRules = backupRules;
module.exports.extractionRules = extractionRules;
