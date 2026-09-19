// Only errors created here may supply UI copy; native/network exceptions are opaque.
const MESSAGES = {
  SESSION: 'Sign in again from Account to connect Gmail. (AUTH-01)',
  AUTH: 'Sign-in failed. Check your connection and Google configuration. (AUTH-02)',
  NATIVE_BUILD: 'Google sign-in requires the Android APK. Run npm run build:apk and install the new build. (AUTH-03)',
  GOOGLE_CONFIG: 'Configure the Web OAuth client with npm run setup:android and rebuild the app. (AUTH-04)',
  DEVELOPER_ERROR: 'Check the Web OAuth client, package, and signing key SHA-1 in your Google project. (AUTH-05)',
  PLAY_SERVICES_NOT_AVAILABLE: 'Update or enable Google Play Services on your device. (AUTH-06)',
  SIGN_IN_REQUIRED: 'Sign in again from Account to connect Gmail. (AUTH-01)',
  SIGN_IN_CANCELLED: 'Sign-in canceled. You can try again from Account. (AUTH-07)',
  ONE_TAP_START_FAILED: 'Google sign-in is unavailable. Try again from Account. (AUTH-08)',
  LOGOUT_PENDING: 'Local access is blocked. Sign-out is incomplete: try again before closing the app. (AUTH-09)',
  STORAGE: 'Unable to read local storage. Try again or delete local data for this account. (DATA-01)',
  STORAGE_FORMAT: 'Unable to read the encrypted data format. Try again; saved data will not be deleted. (DATA-03)',
  STORAGE_DECRYPT: 'Unable to decrypt the local library. Try again; saved data will not be deleted. (DATA-04)',
  LIMIT: 'Message too large or complex. (MAIL-01)',
  NETWORK: 'Gmail is unavailable. Check your connection and try again. (NET-01)',
  SYNC: 'Sync failed. Try again. (SYNC-01)',
};

const knownCode = (code) => Object.hasOwn(MESSAGES, code) ? code : 'SYNC';

export class SecurityError extends Error {
  constructor(code, options = {}) {
    super(MESSAGES[knownCode(code)]);
    this.code = knownCode(code);
    this.status = options.status;
  }
}
// Read only the static catalog, even if a caller has changed an Error's message.
export const safeMessage = (error, fallback = 'SYNC') =>
  MESSAGES[knownCode(error instanceof SecurityError ? error.code : fallback)];
