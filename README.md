# TLDR Newsletter App

Applicazione mobile React Native (Expo) serverless per aggregare, categorizzare e leggere le newsletter di **TLDR** più facilmente dal telefono.

## 🚀 Funzionalità Principali
* **Categorizzazione Automatica**: Algoritmo di rilevamento per smistare le edizioni in **Tech**, **AI**, **InfoSec**, **Dev** e **IT**.
* **Feed & Archivio 7 Giorni**: Schermata principale con gli ultimi aggiornamenti e sezione Archivio con filtri per categoria.

## 🛠️ Configurazione file `.env`
L'applicazione ed il suo funzionamento si basano sull'utilizzo delle variabili fornite da Google Cloud Console per accedere a Gmail.

Crea un file `.env` dentro la cartella `client`:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=tuo_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_SECRET=GOCSPX-tuo_client_secret
EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN=1//tuo_refresh_token
```