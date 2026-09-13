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
- `client/tests/`: Node tests and synthetic fixtures.

## Build, Test, and Development Commands

Run from `client/` using Node 22 LTS:

```bash
npm ci                  # Install locked dependencies
npm run setup:android   # Configure public OAuth ID, package and EAS profiles
npm run check:android   # Validate standalone APK configuration
npm run build:apk       # Build a signed standalone APK with EAS
npm run android         # Build and run Android locally
npm start               # Start Metro for Android development
npm test                # Run synthetic service and configuration tests
```

Cloud builds require personal Expo and Google Cloud setup; see `README.md`. Local development additionally requires Android SDK/JDK tooling. No lint or formatting scripts are configured.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, semicolons, functional components and hooks. Use PascalCase component filenames, camelCase services/functions and uppercase constants. Keep styles in matching StyleSheet modules and reuse shared colors. Preserve Italian UI copy. Keep fetching and parsing outside presentation components; comment non-obvious behavior.

## Testing Guidelines

Use `node:test` with `client/tests/*.test.js`; no coverage threshold is configured. Cover parser boundaries, pagination failures, session/account isolation, durable storage and APK configuration. Use synthetic fixtures and mocked services. Manually verify Google consent, account switching, refresh, search, bookmarks, offline startup and APK updates.

## Commit & Pull Request Guidelines

History uses short descriptive messages, mostly Italian, without Conventional Commits prefixes. Keep commits focused and preserve unrelated edits. PRs should explain the problem, resulting behavior and validation; link relevant issues and include screenshots for visible changes.

## Security & Configuration

Never commit tokens, real emails, keystores or setup backups. Only the public Google Web client ID belongs in `EXPO_PUBLIC_` configuration; Android native login requires this OAuth client type. Keep libraries scoped by Google account ID. Do not commit a shared EAS project ID or owner. Preserve each builder’s signing key for APK updates.
