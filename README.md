# TLDR Newsletter per Android

App React Native/Expo per leggere le newsletter TLDR ricevute nel proprio account Gmail. Ogni utente compila il proprio **APK Android**, lo scarica e lo installa direttamente sul telefono. Il profilo `apk` include JavaScript e risorse: dopo l’installazione non serve un server di sviluppo.

## Funzionalità

- Accesso Google con scelta dell’account e consenso alla lettura di Gmail.
- Feed unificato, ricerca, categorie, segnalibri e stato di lettura per articolo.
- Sommari offline, librerie separate per account, cambio account e uscita.
- Importazione paginata degli ultimi 30 giorni e caricamento della cronologia precedente.
- Estrazione degli articoli con tempo di lettura esplicito; lettura e segnalibri non modificano Gmail.

## Compilare il proprio APK

### 1. Prerequisiti

Installa **Git** e **Node.js 22 LTS** (22.13 o successivo), con npm. `.nvmrc` seleziona Node 22 se usi nvm. Crea un account personale [Expo](https://expo.dev/signup) e un progetto [Google Cloud](https://console.cloud.google.com/). Il percorso principale usa EAS Build nel cloud: non richiede Android Studio, un SDK Android locale o un account Google Play Developer. Disponibilità, quote e code dipendono dal servizio Expo.

Clona questo repository, entra nella cartella `client/` ed esegui:

```bash
npm ci
```

Usa `npm ci` per installare le versioni del lockfile. Il CLI EAS è incluso e fissato a una versione: non occorre installarlo globalmente.

### 2. Configura Google Cloud

Nel **tuo progetto** abilita **Gmail API**. In **Google Auth Platform** configura Branding (nome e contatto), Audience e Data Access. Per uso personale in modalità Testing, aggiungi il tuo indirizzo Gmail agli utenti di prova e lo scope `https://www.googleapis.com/auth/gmail.readonly`. Aggiungi anche gli altri tuoi account che vorrai selezionare. [Guida Google al consenso](https://developers.google.com/workspace/guides/configure-oauth-consent).

Crea un client OAuth di tipo **Web application** in **Clients**. Questo nome è imposto da Google: Android Credential Manager usa quel client ID per il login nativo; non è un target browser. Per questo flusso non occorrono redirect URI da configurare. Conserva soltanto il **client ID pubblico**. Non inserire secret o refresh token nell’app. [Integrazione Google per Expo](https://docs.expo.dev/guides/google-authentication/).

Successivamente creerai anche un client di tipo **Android**, nello stesso progetto, usando il package e la firma del tuo APK. Il client Web da solo non basta.

### 3. Genera la configurazione personale

```bash
npm run setup:android
```

Il comando chiede l’ID pubblico del client Web e il package Android, ad esempio `com.mionome.tldr`. Scrivilo esattamente nello stesso modo anche su Google Cloud e mantienilo per gli aggiornamenti.

Il comando:

- Crea `.env` con il solo `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- Genera `eas.json` dal modello `eas-placeholder.json`, includendo lo stesso ID pubblico nei profili remoti. Il solo `.env` locale, ignorato da Git, non configura il server EAS.
- Aggiorna il package in `app.json` e azzera eventuali collegamenti a progetti Expo di altre persone.
- Conserva i precedenti `.env`, `eas.json` e `app.json` in `.local-build-backups/`, ignorata da Git. I backup possono contenere vecchie credenziali: non condividerli.

Il setup va eseguito alla prima configurazione o per cambiare ID/package; non prima di ogni build, perché azzera il collegamento Expo. Rimuovi eventuali vecchi override Google nei file `.env.*.local` o nelle variabili del tuo account EAS. Non copiare i vecchi secret/token in nuovi profili.

### 4. Collega Expo e registra la firma Android

```bash
npm run expo:login
npm run project:android
npm run credentials:android
```

Accedi al **tuo account Expo** e crea/seleziona il **tuo progetto** quando richiesto. `project:android` salva il collegamento in `app.json`; il repository non impone un proprietario o un progetto condiviso.

Nel menu delle credenziali scegli il profilo **apk**, quindi **Keystore** e la creazione di una nuova chiave, se non ne hai già una. Lascia che EAS generi e gestisca la chiave. Nello stesso menu puoi visualizzare la **SHA-1** del certificato; è disponibile anche nella pagina Credentials del tuo progetto Expo.

Torna in Google Cloud e crea il client OAuth **Android** con:

- Il package scelto nel setup, visibile in `app.json` → `expo.android.package`.
- La **SHA-1 della chiave EAS** che firmerà l’APK.

Il client Android deve appartenere allo stesso progetto del client Web. Non occorre copiare il suo ID nel JavaScript. Conserva la stessa chiave per gli aggiornamenti; cambiarla può impedire di aggiornare l’app già installata e richiede una nuova registrazione OAuth. [Credenziali Android gestite da Expo](https://docs.expo.dev/app-signing/managed-credentials/).

### 5. Compila, scarica e installa

```bash
npm run check:android
npm run build:apk
```

Il controllo blocca configurazioni mancanti, client ID incoerenti e profili che non producono un APK autonomo. Non può verificare la registrazione package/SHA-1 nel tuo account Google Cloud.

EAS firma l’APK e fornisce il link al risultato. Apri il link sul telefono, scarica il file `.apk` e autorizza l’installazione da quella sorgente quando Android lo chiede. Non serve pubblicarlo su uno store. Il profilo incrementa automaticamente il version code per gli aggiornamenti. [Build e installazione APK](https://docs.expo.dev/build-reference/apk/).

Apri l’app, scegli l’account Google e consenti l’accesso a Gmail. Il dispositivo deve avere Google Play Services. Per aggiornare una tua modifica al codice, riesegui `npm run build:apk` usando lo stesso progetto, package e keystore.

## Problemi frequenti

| Sintomo | Controllo |
| --- | --- |
| `DEVELOPER_ERROR` o selettore che si chiude | Verifica client di tipo Web, progetto Google comune, package e SHA-1 della firma effettiva. |
| Accesso negato o Gmail 403 | Abilita Gmail API, registra l’account tra i test user e accetta il permesso Gmail. Un’organizzazione Workspace può applicare restrizioni. |
| Configurazione precedente dopo una modifica | Ricompila l’APK. Le variabili `EXPO_PUBLIC_` sono incorporate nella build. |
| Progetto Expo non accessibile | Esegui il setup una volta per rimuovere il vecchio collegamento, poi login e inizializzazione nel tuo account. |
| APK che richiede un server | Usa il profilo `apk` tramite `build:apk`; `development` serve soltanto a sviluppare. |
| Android rifiuta un aggiornamento | Controlla package e keystore. Disinstallare una vecchia app elimina i suoi dati locali: mantieni la chiave per evitarlo. |

Il consenso Gmail è relativo alla casella intera; l’app limita le proprie ricerche alle newsletter. `gmail.readonly` è uno scope **restricted**. Per un servizio pubblico condiviso, verifica i requisiti OAuth di Google; compilare personalmente non aggira le regole del progetto Google o di Workspace. [Scope e requisiti Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Sviluppo e test

Per modificare l’app con aggiornamenti rapidi, installa Android Studio, il relativo SDK e il JDK richiesto dalla toolchain Expo/React Native. Collega un dispositivo con debug USB oppure avvia un emulatore con Google Play Services:

```bash
npm run android
npm start
npm test
```

La build locale di sviluppo può avere una firma diversa da quella EAS: registra anche la sua SHA-1 in un client Android. Dopo `npm run prebuild:android`, ottienila da `android/` con `./gradlew signingReport` (`gradlew.bat signingReport` su Windows). Expo Go non contiene il modulo Google nativo. `npm run build:development` crea invece un development APK tramite EAS.

I test `node:test` sono inclusi nel repository e usano soltanto dati sintetici: parsing, paginazione, sessioni, isolamento account, rinnovo token, storage e configurazione APK. Su dispositivo verifica scelta tra due account, consenso negato, logout durante un import, riapertura offline e installazione di un aggiornamento firmato con la stessa chiave.

## Organizzazione e dati

`auth.js` adatta Google e SecureStore; `authStore.js` gestisce la sessione; `AuthContext.js` la espone a React. Il SDK nativo gestisce le credenziali, SecureStore conserva il profilo offline e l’app tiene temporaneamente il token in memoria. Gmail viene interrogato direttamente dal telefono.

`library.js` trasforma i dati, `libraryStore.js` coordina importazioni e scritture, `libraryStorage.js` salva edizioni e stato sotto l’ID Google. AsyncStorage non è cifrato. Uscire chiude la libreria ma conserva i dati per il successivo accesso dello stesso account. I vecchi dati senza provenienza di account non vengono migrati automaticamente.
