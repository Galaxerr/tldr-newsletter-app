import * as SecureStore from 'expo-secure-store';
import { fetchWithTimeout } from './network';
import { createAuthStore } from './authStore';
import { SecurityError } from './securityErrors';

// Load Google native code when needed and report a safe error if it is unavailable.
let google;
export const getGoogleModule = () => {
  if (!google) {
    try {
      google = require('react-native-nitro-google-signin');
    } catch {
      throw new SecurityError('NATIVE_BUILD');
    }
  }
  return google;
};
let configured = false;
const native = () => {
  const api = getGoogleModule().GoogleOneTapSignIn;
  if (!configured) {
    // Client IDs are public identifiers. No app secret or refresh token is bundled.
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    if (!webClientId) {
      throw new SecurityError('GOOGLE_CONFIG');
    }
    api.configure({ webClientId, offlineAccess: false, autoSelectOnSignIn: false });
    configured = true;
  }
  return api;
};
// Preserve only machine-readable SDK codes. Native exception text can contain PII.
const call = async (work) => {
  try {
    return await work(native());
  } catch (error) {
    if (error instanceof SecurityError) throw error;

    const knownCodes = ['DEVELOPER_ERROR', 'PLAY_SERVICES_NOT_AVAILABLE', 'SIGN_IN_REQUIRED', 'SIGN_IN_CANCELLED', 'ONE_TAP_START_FAILED'];
    throw new SecurityError(knownCodes.includes(error?.code) ? error.code : 'AUTH');
  }
};

export const authStore = createAuthStore({
  // SDK credentials stay in its native storage. This record is only the offline profile.
  storage: {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  sdk: {
    signIn: () => call(async (api) => {
      await api.checkPlayServices();
      return api.presentExplicitSignIn();
    }),
    signOut: () => call((api) => api.signOut()),
    requestScopes: (scopes) => call((api) => api.requestScopes(scopes)),
    getTokens: () => call((api) => api.getTokens()),
    clearToken: (token) => call((api) => api.clearCachedAccessToken(token)),
    // Android restores its previous Google user from the native SDK’s storage.
    currentUser: () => call((api) => api.getCurrentUser()),
    profile: async (token, signal) => {
      const response = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        throw new SecurityError(denied ? 'SESSION' : 'NETWORK', { status: response.status });
      }
      return response.json();
    },
  },
});
