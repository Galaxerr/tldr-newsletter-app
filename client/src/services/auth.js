// src/services/auth.js
export const getAutomaticAccessToken = async () => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Configurazione OAuth incompleta: verifica EXPO_PUBLIC_GOOGLE_CLIENT_ID, EXPO_PUBLIC_GOOGLE_CLIENT_SECRET e EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN nel profilo Expo usato.'
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

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