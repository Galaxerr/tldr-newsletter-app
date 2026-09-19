# TLDR Newsletter for Android

I really didn't like getting several TLDR emails a day instead of having the news in an app, so I built one myself.

A React Native/Expo app for reading TLDR newsletters from your Gmail account, with offline summaries, search, and bookmarks. Each user builds their own **Android APK**: once installed, no development server is needed.

## Build your own APK

### 1. Prepare the project

Install **Git** and **Node.js 22 LTS** (22.13 or later), with npm. Create an [Expo](https://expo.dev/signup) account and a [Google Cloud](https://console.cloud.google.com/) project. Builds run in the cloud with EAS Build: Android Studio is not required.

Clone this repository, open a terminal in the project folder, and run:

```bash
cd client
npm ci
```

### 2. Configure Google

In your Google Cloud project:

1. Enable the **Gmail API**.
2. In **Google Auth Platform**, configure Branding, Audience, and Data Access. For personal use in Testing mode, add your Gmail accounts as test users and add the scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Create a **Web application** OAuth client and copy its **public client ID**. Android sign-in uses this ID; no secret, refresh token, or redirect URI is needed.

### 3. Generate the app configuration

```bash
npm run setup:android
```

Enter the Web client ID and choose a personal Android package name, such as `com.yourname.tldr`. The command prepares `.env`, `app.json`, and `eas.json`; if they already exist, it preserves the Expo project link, versions, and signing settings. Keep the same package name for updates.

### 4. Link Expo and register the signing key

```bash
npm run expo:login
npm run project:android
npm run credentials:android
```

Sign in to your Expo account and create or select your project. In the credentials menu, choose the **apk** profile, then **Keystore**: let EAS generate a key only if you do not already have one. Copy the certificate **SHA-1** shown in the credentials.

Return to Google Cloud and, in the **same project as the Web client**, create an **Android** OAuth client with:

- The package name chosen during setup, found in `app.json` → `expo.android.package`.
- The SHA-1 of the EAS key that will sign the APK.

You do not need to copy the Android client ID into the app. Keep the signing key so you can update the installed app.

### 5. Build and install

```bash
npm run check:android
npm run build:apk
```

When the build finishes, open the link provided by EAS on your phone, download the APK, and allow installation from that source when Android prompts you.

Open the app, choose the configured Google account, and allow Gmail read access. Your phone must have Google Play Services. To create updates, run `npm run build:apk` again with the same Expo project, package name, and keystore.

## Reading and retention

The app imports a rolling seven days of Gmail newsletters, using Gmail arrival time. **Editions** and **Feed** show only the newest edition from each category within that window. Feed search covers those latest editions; Saved search covers all bookmarked articles.

**Archive** contains all editions from the last seven days, plus complete older editions with at least one saved article. Removing the last bookmark makes an older edition eligible for deletion. If it is open in Detail or the article reader, deletion waits until reading closes; saving it again keeps it. Expiry also runs offline, on startup, when returning to the app, and while the app remains active. Cleanup affects local app data only, never Gmail messages.

Screen modules load on first use. Startup, Editions, and Archive read a metadata index rather than every article summary. Feed loads only its latest editions, Detail loads one edition, and Saved loads bookmarked editions when opened. Lists remain virtualized; searches wait for their complete local scope to load. Inactive screens release their bodies and derived lists, with up to 12 inactive edition bodies cached for quick return visits.

## Storage and development checks

Each Google account has its own encrypted metadata index and immutable edition revisions in AsyncStorage, with its encryption key in SecureStore. Writes save changed bodies before committing the index, then remove expired and superseded revisions. Failed cleanup is retried. Read and bookmark changes update only the index. Older storage formats migrate once, with encrypted read-back verification before source records are removed; the first startup after upgrading may therefore take longer.

Run with Node.js 22 LTS from `client/`:

```bash
npm test
npm run check:android
```