# Repository Guidelines

## Project Structure & Module Organization

This is a React Native/Expo app that reads TLDR newsletters directly from Gmail; there is no backend service.

- `client/App.js`: navigation, offline startup, and global providers.
- `client/src/screens/`: latest editions, archive, and newsletter details.
- `client/src/components/`: reusable cards, error boundary, and network banner.
- `client/src/services/`: OAuth (`auth.js`), Gmail requests (`gmail.js`), and HTML extraction (`parser.js`).
- `client/src/context/`: shared library state and toast notifications.
- `client/src/theme/`: shared colors and component/screen styles in `css/` (JavaScript StyleSheet modules).
- `client/assets/`: app icons and splash images. `client/tests/`: automated tests and synthetic fixtures.

## Build, Test, and Development Commands

Run commands from `client/`:

```bash
npm install        # Install dependencies
npm start          # Start the Expo development server
npm run android    # Build and run Android locally
npm run ios        # Build and run iOS locally; requires macOS/Xcode
npm run web        # Start Expo's web development target
npm test           # Run Node service and persistence tests
```

Android builds require the Android SDK. Tests require Node.js 20.19+. There are no dedicated production-build, lint, or formatting scripts.

## Coding Style & Naming Conventions

Follow existing JavaScript/JSX: two-space indentation, single quotes, semicolons, functional components, and hooks. Use PascalCase for component files (`ArticleCard.js`), camelCase for services/functions, and uppercase constants. Keep styles in matching `*Styles.js` modules and reuse `theme/colors.js`. Preserve Italian UI copy. Keep fetching and parsing logic outside presentation components. No ESLint or Prettier configuration is checked in.

## Testing Guidelines

Use `node:test` with `*.test.js` files under `client/tests/`; run `npm test`. No coverage threshold is configured. Cover parser boundaries, pagination failures, and durable library state with synthetic fixtures and mocked services. Manually verify refresh, filters/search, bookmarks, read status, summary modals, and cold offline startup. Keep real emails and credentials out of tests.

## Commit & Pull Request Guidelines

History uses short descriptive messages, mostly Italian, without a Conventional Commits prefix. Follow that pattern and keep commits focused. PRs should explain the problem, resulting behavior, and validation performed; link relevant issues and include screenshots for visible UI changes. Preserve unrelated working-tree edits.

## Security & Configuration

Keep credentials in ignored local configuration; see `README.md` for current variable names. Never commit tokens or real email fixtures. `EXPO_PUBLIC_` values are bundled into the app: the current refresh-token/client-secret approach must be replaced before distributing builds.
