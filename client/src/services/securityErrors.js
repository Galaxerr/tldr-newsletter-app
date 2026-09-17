// Only errors created here may supply UI copy; native/network exceptions are opaque.
const MESSAGES = {
  SESSION: 'Accedi nuovamente da Account per collegare Gmail. (AUTH-01)',
  AUTH: 'Accesso non riuscito. Verifica connessione e configurazione Google. (AUTH-02)',
  NATIVE_BUILD: 'Google richiede l’APK Android. Esegui npm run build:apk e installa la nuova build. (AUTH-03)',
  GOOGLE_CONFIG: 'Configura il client OAuth Web con npm run setup:android e ricrea la build. (AUTH-04)',
  DEVELOPER_ERROR: 'Verifica client OAuth Web, package e SHA-1 della chiave di firma nel progetto Google. (AUTH-05)',
  PLAY_SERVICES_NOT_AVAILABLE: 'Aggiorna o abilita Google Play Services sul dispositivo. (AUTH-06)',
  SIGN_IN_REQUIRED: 'Accedi nuovamente da Account per collegare Gmail. (AUTH-01)',
  SIGN_IN_CANCELLED: 'Accesso annullato. Puoi riprovare da Account. (AUTH-07)',
  ONE_TAP_START_FAILED: 'Accesso Google non disponibile. Riprova da Account. (AUTH-08)',
  LOGOUT_PENDING: 'Accesso locale bloccato. Uscita non completata: riprova prima di chiudere l’app. (AUTH-09)',
  STORAGE: 'Archivio locale non leggibile. Riprova oppure elimina i dati locali di questo account. (DATA-01)',
  STORAGE_FORMAT: 'Formato dei dati cifrati non leggibile. Riprova; i dati salvati non verranno cancellati. (DATA-03)',
  STORAGE_DECRYPT: 'Impossibile decifrare la libreria locale. Riprova; i dati salvati non verranno cancellati. (DATA-04)',
  LIMIT: 'Messaggio troppo grande o complesso. (MAIL-01)',
  NETWORK: 'Gmail non disponibile. Controlla la connessione e riprova. (NET-01)',
  SYNC: 'Sincronizzazione non riuscita. Riprova. (SYNC-01)',
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
