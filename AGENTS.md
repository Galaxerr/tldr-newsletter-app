# Repository Guidelines

## Project Structure & Module Organization

This Android-only React Native/Expo app reads TLDR newsletters directly from Gmail, without a backend.

- `client/App.js`: navigation, login gate and providers.
- `client/src/screens/` and `components/`: screens and reusable UI.
- `client/src/services/`: Google authentication, Gmail imports, parsing and persistent libraries.
- `client/src/context/`: React adapters for authentication, library state and notifications.
- `client/src/theme/`: colors and matching `css/*Styles.js` modules.
- `client/scripts/`: personal Android setup and APK configuration checks.
- `client/assets/`: Android icons and splash assets.

## Build, Test, and Development Commands

Run from `client/` using Node 22 LTS:

```bash
npm ci                  # Install locked dependencies
npm run setup:android   # Configure public OAuth ID, package and EAS profiles
npm run check:android   # Validate standalone APK configuration
npm run build:apk       # Build a signed standalone APK with EAS
```

Cloud builds require personal Expo and Google Cloud setup; see `README.md`. No local device-development, test, lint or formatting scripts are configured.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, semicolons, functional components and hooks. Use PascalCase component filenames, camelCase services/functions and uppercase constants. Keep styles in matching StyleSheet modules and reuse shared colors. Preserve Italian UI copy. Keep fetching and parsing outside presentation components; comment non-obvious behavior.

## Testing Guidelines

Run `npm run check:android` before building. Manually verify Google consent, account switching, refresh, search, bookmarks, offline startup and updates in the standalone APK. Keep any temporary validation data synthetic and out of the build archive.

## Commit & Pull Request Guidelines

History uses short descriptive messages, mostly Italian, without Conventional Commits prefixes. Keep commits focused and preserve unrelated edits. PRs should explain the problem, resulting behavior and validation; link relevant issues and include screenshots for visible changes.

## Security & Configuration

Never commit tokens, real emails, keystores or setup backups. Only the public Google Web client ID belongs in `EXPO_PUBLIC_` configuration; Android native login requires this OAuth client type. Keep libraries scoped by Google account ID. Do not commit a shared EAS project ID or owner. Preserve each builder’s signing key for APK updates.
