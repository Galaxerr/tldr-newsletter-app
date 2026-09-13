import * as SecureStore from 'expo-secure-store';
import { fetchWithTimeout } from './gmail';
import { createAuthStore } from './authStore';

// Load native code only when needed, allowing a useful setup error in Expo Go.
let google;
export const getGoogleModule = () => {
  if (!google) {
    try { google = require('react-native-nitro-google-signin'); } catch {
      throw new Error('Google richiede una build nativa. Avvia npm run android; Expo Go non è supportato.');
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
      throw new Error('Configura i client OAuth Google indicati nel README e ricrea la build.');
    }
    api.configure({ webClientId, offlineAccess: false, autoSelectOnSignIn: false });
    configured = true;
  }
  return api;
};
// Translate native failures without exposing token responses or platform internals.
const call = async (work) => {
  try { return await work(native()); } catch (error) {
    const messages = {
      DEVELOPER_ERROR: 'Configurazione Google non valida: verifica client Web, package Android e SHA-1 nel README.',
      PLAY_SERVICES_NOT_AVAILABLE: 'Google Play Services non disponibile. Aggiornalo per accedere.',
      SIGN_IN_REQUIRED: 'Accedi nuovamente da Account per collegare Gmail.',
      ONE_TAP_START_FAILED: 'Google non ha completato l’accesso. Controlla la connessione e la configurazione OAuth.',
    };
    if (messages[error.code]) throw Object.assign(new Error(messages[error.code]), { code: error.code });
    throw error;
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
    signIn: () => call(async (api) => { await api.checkPlayServices(); return api.presentExplicitSignIn(); }),
    signOut: () => call((api) => api.signOut()),
    requestScopes: (scopes) => call((api) => api.requestScopes(scopes)),
    getTokens: () => call((api) => api.getTokens()),
    clearToken: (token) => call((api) => api.clearCachedAccessToken(token)),
    // Android restores its previous Google user from the native SDK’s storage.
    currentUser: () => call((api) => api.getCurrentUser()),
    profile: async (token) => {
      const response = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw Object.assign(new Error(response.status === 403
        ? 'Gmail non autorizzato. Consenti la lettura delle email e verifica che Gmail API sia attiva nel progetto Google.'
        : 'Impossibile verificare l’account Gmail. Controlla la connessione e riprova.'), { status: response.status });
      return response.json();
    },
  },
});
