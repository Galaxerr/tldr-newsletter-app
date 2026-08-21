// src/services/auth.js
export const getAutomaticAccessToken = async () => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN;

  if (!refreshToken || !clientId) {
    throw new Error('Credenziali mancanti nel file .env');
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
    throw new Error(data.error_description || 'Errore nel rinnovo automatico del token');
  }

  return data.access_token;
};