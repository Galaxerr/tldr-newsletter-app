// src/services/auth.js
import { fetchWithTimeout } from './gmail';

// Exchange the configured refresh token for a short-lived access token on sync.
// Offline startup does not call this function; tokens are not part of the library.
export const getAutomaticAccessToken = async () => {
  // Existing development configuration. EXPO_PUBLIC values are included in builds;
  // this credential arrangement must be replaced before distributing the app.
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Configurazione OAuth incompleta: verifica EXPO_PUBLIC_GOOGLE_CLIENT_ID, EXPO_PUBLIC_GOOGLE_CLIENT_SECRET e EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN nel profilo Expo usato.'
    );
  }

  // Form-encoded OAuth request with the same timeout as Gmail requests.
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  // Reject unsuccessful or incomplete responses so sync cannot proceed with no token.
  const data = await response.json();
  if (!response.ok) {
    const detail = data.error_description || data.error || 'risposta non specificata';
    throw new Error(`Google OAuth (${response.status}): ${detail}`);
  }

  if (!data.access_token) {
    throw new Error('Google OAuth: la risposta non contiene un access token');
  }

  return data.access_token;
};
