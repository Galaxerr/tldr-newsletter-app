// Redacted local scan. Never prints matched values or contacts credential providers.
// This script performs a defensive repository scan for common credential patterns
// without exposing secret content in the console output.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Common credential patterns that should be treated as sensitive and therefore
// reported without revealing their actual values.
const RULES = {
  'google-client-secret': /GOCSPX-[A-Za-z0-9_-]{15,}/g,
  'google-refresh-token': /1\/\/[A-Za-z0-9_-]{25,}/g,
  'google-access-token': /ya29\.[A-Za-z0-9_.-]{20,}/g,
  'google-api-key': /AIza[0-9A-Za-z_-]{35}/g,
  'private-key': /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  'github-token': /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g,
  'aws-key': /AKIA[0-9A-Z]{16}/g,
  'slack-token': /xox[baprs]-[A-Za-z0-9-]{20,}/g,
};

// Scan a buffer or string for all configured secret patterns.
// Each match is recorded with the relative location and the approximate line number.
const scan = (data, location) => {
  const text = data.toString('utf8');
  const findings = [];

  for (const [rule, pattern] of Object.entries(RULES)) {
    pattern.lastIndex = 0;

    for (const match of text.matchAll(pattern)) {
      findings.push({
        ...location,
        rule,
        line: text.slice(0, match.index).split('\n').length,
      });
    }
  }

  return findings;
};

// Scan current files and optional artifacts only; Git history is outside scope.
// Reject unsupported options rather than silently reporting a partial scan.
const parseArguments = (args) => {
  const options = { artifacts: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--artifact' && args[i + 1] && !args[i + 1].startsWith('--')) {
      options.artifacts.push(args[++i]);
    } else {
      throw new Error('Invalid options. Use --artifact <path>. (SCAN-02)');
    }
  }
  return options;
};

const run = (args = process.argv.slice(2), { cwd = process.cwd() } = {}) => {
  const options = parseArguments(args);
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  const findings = [];
  const skipped = [];
  const artifacts = [];
  const maxBytes = 128 * 1024 * 1024;
  let scanned = 0;

  // Both discovered archives and --artifact targets use this inspection path.
  // Bounded subprocess output/time limits zip bombs; no member reaches disk.
  const inspectArchive = (archive, location) => {
    artifacts.push(location.path);
    try {
      const members = execFileSync('unzip', ['-Z1', archive], {
        encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).split('\n').filter((name) => name && !name.endsWith('/'));
      if (members.length > 50000) throw new Error('Archive member limit');

      for (const member of members) {
        const content = execFileSync('unzip', ['-p', archive, member], {
          maxBuffer: maxBytes, timeout: 30000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        findings.push(...scan(content, { ...location, source: 'archive', member }));
        scanned++;
      }
    } catch {
      skipped.push({ ...location, reason: 'archive-inspection-incomplete' });
    }
  };

  const inspectFile = (file, location) => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) {
      skipped.push({ ...location, reason: 'not-a-regular-file' });
      return;
    }
    if (stat.size > maxBytes) {
      skipped.push({ ...location, reason: 'over-128-MiB' });
    } else {
      findings.push(...scan(fs.readFileSync(file), location));
      scanned++;
    }
    if (/\.(apk|aab|zip)$/i.test(file)) inspectArchive(file, location);
  };

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules', '.expo'].includes(entry.name)) walk(file);
      } else {
        inspectFile(file, { source: 'worktree', path: path.relative(root, file) });
      }
    }
  };
  walk(root);

  for (const target of options.artifacts) {
    const file = path.resolve(cwd, target);
    inspectFile(file, { source: 'artifact', path: file });
  }

  return {
    scanned,
    excludedDirectories: ['.git', 'node_modules (dependency audit separately)', '.expo'],
    artifacts,
    findings,
    skipped,
  };
};

if (require.main === module) {
  try {
    const report = run();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.findings.length || report.skipped.length ? 1 : 0;
  } catch {
    console.error(
      'Scan incomplete. Check options (--artifact <path>), files, and Git/unzip. (SCAN-01)'
    );
    process.exitCode = 2;
  }
}
