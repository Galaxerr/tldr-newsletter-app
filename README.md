# TLDR Newsletter for Android

An Android app for reading TLDR newsletters from your Gmail account, built with React Native and Expo. Browse editions, search article summaries, track your reading, and save articles for offline access. The app connects directly to Gmail and stores your library on your device, with no application backend.

Each user configures their own Google Cloud and Expo projects and builds a standalone Android APK. Once installed, the app runs without a development server. Native Google sign-in requires the APK; Expo Go, iOS, and web are not supported by this project.

## Features

- Read newsletters in six categories: **Tech, AI, InfoSec, Dev, IT, and Hardware**.
- Browse the latest edition in each category or explore a combined article feed.
- Search titles and summaries, filter by category, and track read or unread articles.
- Bookmark articles and keep their editions beyond the normal retention window.
- Read imported summaries offline, with a separate local library for each Google account.

## How it works

Sign in with Google and grant Gmail read access. The app retrieves TLDR messages from a rolling seven-day window, based on their arrival time in Gmail. It checks sender and Gmail authentication headers, rejects evidence of forwarding, and parses supported HTML newsletters into editions and article summaries. Messages in Spam or Trash, messages that fail verification, and unsupported or oversized content are skipped.

Recent editions are stored in an encrypted local library. Editions older than seven days are removed unless they contain at least one bookmarked article; a bookmark keeps the complete edition available in **Archive**. Removing an older edition's last bookmark makes it eligible for cleanup. If that edition or an article from it is open, cleanup waits until reading closes. Retention also runs offline.

Synchronization and cleanup never change or delete messages in Gmail. The summaries come from the newsletters; the original articles remain on their publishers' websites.

## Build and install

### 1. Prepare your accounts and computer

You will need:

- Git and **Node.js 22 LTS, version 22.13 or later**, with npm. The project also includes `client/.nvmrc` for Node version managers.
- An [Expo account](https://expo.dev/signup) and a [Google Cloud project](https://console.cloud.google.com/).
- An Android phone with Google Play Services enabled.
- A Gmail account subscribed to one or more supported TLDR newsletters, delivered directly to that account. The app does not subscribe you or import a public newsletter archive.

Builds run in the cloud through EAS Build, so Android Studio is not required for this workflow. Clone this repository, open a terminal in the project directory, and run:

```bash
cd client
npm ci
```

Run all remaining commands from `client/`.

### 2. Configure Gmail access

In your Google Cloud project:

1. Enable the **Gmail API** under **APIs & Services → Library**.
2. Open **Google Auth Platform** and configure **Branding**, including the app name and contact details. For a personal Gmail account, choose the **External** audience, keep the publishing status as **Testing**, and add each Gmail account you intend to use under **Audience → Test users**.
3. Under **Data Access**, add `https://www.googleapis.com/auth/gmail.readonly`.
4. Under **Clients**, create an OAuth client of type **Web application** and copy its public client ID.

Google documents these settings in its [OAuth consent setup guide](https://developers.google.com/workspace/guides/configure-oauth-consent) and [OAuth client guide](https://support.google.com/cloud/answer/15549257).

The native sign-in integration uses the **Web application client ID** even though this app runs on Android. Leave JavaScript origins and redirect URIs empty for this integration. You do not need a client secret, API key, or manually supplied token.

While your Google project is in Testing, Gmail authorizations expire after seven days. Reconnect through **Account** when prompted; your local library remains available. See Google's [audience and publishing status guidance](https://support.google.com/cloud/answer/15549945).

### 3. Generate your local configuration

```bash
npm run setup:android
```

Enter the Web client ID and choose a personal Android package name, such as `com.yourname.tldr`. Setup creates `.env`, `app.json`, and `eas.json` from the included templates. The public ID is stored as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and included in the APK build profile.

On subsequent runs, setup preserves your existing Expo project link, app versions, and signing settings, and saves local configuration backups. Keep the generated configuration and backups private to your build environment; they are excluded from Git. Keep the same package name for updates.

### 4. Link Expo and register the signing certificate

```bash
npm run expo:login
npm run project:android
npm run credentials:android
```

Sign in to Expo and create or select your own EAS project. In the credentials menu, select the **apk** profile and the Android **Keystore** options. Let EAS generate a signing key for your first build, or use your existing key when updating an installed app. Copy the certificate's **SHA-1** fingerprint from the credentials details.

In **Google Auth Platform → Clients**, create a second OAuth client of type **Android**, in the **same Google Cloud project** as the Web client. Enter:

- **Package name:** the value in `app.json` at `expo.android.package`.
- **SHA-1 certificate fingerprint:** the fingerprint of the EAS key that will sign your APK.

The Android client registers the package and signing certificate; its client ID does not go into `.env`. Keep the Web client ID there. Google's [Android OAuth client instructions](https://support.google.com/cloud/answer/15549257) describe the package and certificate fields.

Preserve your signing key for future updates. Use the credentials command to manage or download it, and store any backup securely outside the repository. See Expo's [app credentials documentation](https://docs.expo.dev/app-signing/app-credentials/).

### 5. Validate, build, and install

```bash
npm run check:android
npm run check:secrets
npm run build:apk
```

`check:android` validates local configuration; Google Cloud must still contain the matching package and signing certificate. `build:apk` repeats the Android configuration check before starting a signed, standalone APK build with the `apk` profile.

When EAS finishes, open the APK link on your phone, download the file, and allow installation from that source when Android asks. Install and open **TLDR Newsletter**, select an account configured in Google Cloud, and grant Gmail read access. Use **Sync** to import your recent editions. Expo also documents [installing an APK on a physical device](https://docs.expo.dev/build-reference/apk/#physical-device).

## Using the app

| Tab | Purpose |
| --- | --- |
| **Editions** | Open the newest edition in each category within the seven-day window. |
| **Feed** | Browse articles from the latest editions, search, filter, and reveal older editions. |
| **Saved** | Read and search all bookmarked articles, including those retained from older editions. |
| **Archive** | Browse all retained editions by category. |
| **Account** | Switch accounts, reconnect Gmail, sign out, delete local data, or open Google permission settings. |

### Sync, search, and reading

Tap **Sync** or pull down on a list in **Editions**, **Feed**, **Saved**, or **Archive** to check Gmail for recent newsletters. When online, the app also syncs on startup and when you return to it, unless it synced or tried to sync recently. Sync status shows import progress, errors, and skipped-message counts.

**Feed** begins with the latest editions. At the bottom, **Load more articles** reveals the next older imported edition in the selected category, or one per available category when **All** is selected. This works offline and stops at the seven-day boundary. The button disappears when there are no more eligible editions. Your revealed history survives filter changes and tab navigation during the current app session; refreshing adds newer editions without collapsing it.

Feed search covers the articles revealed so far. Load more editions to expand that search. **Saved** search covers all bookmarked articles, including older retained editions. Search and read/unread filters do not change which edition loads next.

Tap an article to read its newsletter summary. Use **Save** to bookmark it and the **Read/Unread** control to change its reading status. Opening a summary or its source does not automatically mark it read. Reading status and bookmarks are local to the app and do not alter Gmail's read status.

### Offline use

After an import, summaries, search, bookmarks, and reading status work offline, including when reopening the app with a retained session. Signing in, syncing Gmail, and using **Read original source** require an internet connection. Original websites are opened externally and are not downloaded for offline reading.

## Privacy and account controls

The requested Gmail permission, `gmail.readonly`, allows reading mailbox messages and settings; it is not restricted by Google to TLDR messages. The app limits its imports to matching TLDR newsletters and does not request mail modification or sending permissions. Google's [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) describes the permission.

Each account's library is encrypted with AES-256-GCM, with encryption keys stored in Expo SecureStore. Native Google sign-in manages OAuth credentials; no client secret or refresh token is bundled in the app. Account checks isolate sessions and local libraries. Android build settings disable app backup, device transfer of app data, and cleartext traffic within the app. Article links are validated before opening; external HTTP links require confirmation.

Use **Account** to manage access:

- **Switch Google account:** opens the selected account's separate library.
- **Sign out:** closes the current library while keeping its local data for the next sign-in. Google permissions remain granted.
- **Delete local data for this account:** removes that account's summaries, bookmarks, and reading status from this device and signs you out. Gmail messages remain untouched.
- **Manage or revoke Google permissions:** opens Google account settings, where you can revoke access separately. Revocation does not delete the local library.

Bookmarks and reading status are device-local, with no cross-device synchronization or restore feature. Deleting app data or uninstalling the app loses that local state. A later import can retrieve eligible recent messages again, but cannot restore your bookmarks or reading history.

## Updates and maintenance

For updates, install the locked dependencies with `npm ci`, run the validation commands, and build another APK using the **same Expo project, Android package, and signing key**. Install it over the existing app to retain local data. The included build profile increments the Android version code through EAS.

| Command | Purpose |
| --- | --- |
| `npm run setup:android` | Create or update personal Android and OAuth configuration. |
| `npm run check:android` | Validate the standalone APK configuration and public environment variables. |
| `npm run check:secrets` | Scan current repository files for common credential patterns, with redacted results. |
| `npm run expo:login` | Sign in to the builder's Expo account. |
| `npm run project:android` | Link the builder's EAS project. |
| `npm run credentials:android` | Manage Android signing credentials. |
| `npm run build:apk` | Validate configuration and build a signed APK through EAS. |

The secret scanner includes local ignored files and inspects APK, AAB, and ZIP archives when present; archive inspection requires `unzip`. It reports incomplete scans as failures and does not audit Git history or dependencies. Keep tokens, real email samples, keystores, credential exports, and setup backups out of commits and build uploads. Only the public Web OAuth client ID belongs in `EXPO_PUBLIC_` configuration.

EAS commands are pinned to CLI version `24.7.0`. Keep the versions in `package.json`, `eas-placeholder.json`, and your local `eas.json` aligned when upgrading the CLI.

Verify Google consent, account switching, refresh, search, bookmarks, offline startup, and installation over an existing version in the standalone APK when preparing an update.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Sign-in configuration error (`AUTH-04` or `AUTH-05`) | Confirm the Web client ID, Android package, and actual APK signing key SHA-1. Both OAuth clients must belong to the same Google Cloud project. After changing the embedded client ID, run setup and rebuild the APK. |
| Native sign-in unavailable (`AUTH-03`) | Install the standalone APK built by `npm run build:apk`. |
| Google Play Services error (`AUTH-06`) | Enable or update Google Play Services on the phone. |
| Google denies access | Confirm the Gmail API is enabled, the account is listed under Test users for a Testing project, and Gmail read access was granted. Workspace accounts may also require administrator approval. |
| Gmail needs reconnection (`AUTH-01`) | Open **Account → Reconnect Google**. Testing authorizations expire after seven days; local summaries remain available. |
| No editions or skipped messages | Confirm the chosen account receives supported TLDR newsletters directly and has arrivals within the last seven days, outside Spam and Trash. Check sync counters for verification or size rejections. Forwarded and unsupported messages may be skipped. |
| An article is missing from search | Clear category and read/unread filters. In Feed, load more editions; use Saved for older bookmarked articles. |
| Sync fails (`NET-01` or `SYNC-01`) | Check connectivity and tap **Try again**. Reconnect from Account if prompted. |
| Local library or decryption error (`DATA-01`, `DATA-03`, or `DATA-04`) | Retry first. Deleting local data is a reset that also removes bookmarks and reading status; it does not recover them. |
| Android refuses an update | Check that the new APK uses the same package and signing key and a higher version code. Preserve the original keystore. |
