# TLDR Newsletter per Android

Non mi piaceva il fatto che la newsletter TLDR mandasse più mail al giorno invece che mettere le news in una app, così l'ho costruita io.

App React Native/Expo per leggere le newsletter TLDR del proprio account Gmail, con sommari offline, ricerca e segnalibri. Ogni utente compila il proprio **APK Android**: una volta installato, non serve un server di sviluppo.

## Creare il proprio APK

### 1. Prepara il progetto

Installa **Git** e **Node.js 22 LTS** (22.13 o successivo), con npm. Crea un account [Expo](https://expo.dev/signup) e un progetto [Google Cloud](https://console.cloud.google.com/). La compilazione avviene nel cloud con EAS Build: non serve Android Studio.

Clona questo repository, apri un terminale nella cartella del progetto ed esegui:

```bash
cd client
npm ci
```

### 2. Configura Google

Nel tuo progetto Google Cloud:

1. Abilita **Gmail API**.
2. In **Google Auth Platform**, configura Branding, Audience e Data Access. Per uso personale in modalità Testing, aggiungi i tuoi account Gmail agli utenti di prova e lo scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Crea un client OAuth di tipo **Web application** e copia il suo **client ID pubblico**. Il login Android usa questo ID; non servono secret, refresh token o redirect URI.

### 3. Genera la configurazione dell’app

```bash
npm run setup:android
```

Inserisci il client ID Web e scegli un package Android personale, ad esempio `com.mionome.tldr`. Il comando prepara `.env`, `app.json` ed `eas.json`; se esistono già, conserva il collegamento Expo, le versioni e le impostazioni di firma. Mantieni lo stesso package per gli aggiornamenti.

### 4. Collega Expo e registra la firma

```bash
npm run expo:login
npm run project:android
npm run credentials:android
```

Accedi al tuo account Expo e crea o seleziona il tuo progetto. Nel menu delle credenziali scegli il profilo **apk**, quindi **Keystore**: lascia generare una chiave a EAS soltanto se non ne hai già una. Copia la **SHA-1** del certificato mostrata nelle credenziali.

Torna in Google Cloud e, nello **stesso progetto del client Web**, crea un client OAuth di tipo **Android** con:

- Il package scelto durante il setup, presente in `app.json` → `expo.android.package`.
- La SHA-1 della chiave EAS che firmerà l’APK.

Non occorre copiare nell’app l’ID del client Android. Conserva la chiave di firma per poter aggiornare l’app già installata.

### 5. Compila e installa

```bash
npm run check:android
npm run build:apk
```

Al termine della build, apri sul telefono il link fornito da EAS, scarica l’APK e autorizza l’installazione da quella sorgente quando Android lo richiede.

Apri l’app, scegli l’account Google configurato e consenti la lettura di Gmail. Il telefono deve avere Google Play Services. Per creare aggiornamenti, ripeti `npm run build:apk` mantenendo lo stesso progetto Expo, package e keystore.
