# TLDR Newsletter App

Applicazione mobile React Native (Expo) serverless per aggregare, categorizzare e leggere le newsletter di **TLDR** più facilmente dal telefono.

## 🚀 Funzionalità Principali
* **Categorizzazione Automatica**: Algoritmo di rilevamento per smistare le edizioni in **Tech**, **AI**, **InfoSec**, **Dev**, **IT** e **Hardware**.
* **Feed unificato**: Articoli di tutte le edizioni, ordinati per ricezione; i link ripetuti vengono raggruppati mantenendo le categorie di provenienza.
* **Ricerca locale**: Cerca nei titoli e nei sommari importati, anche offline; combina categoria e stato di lettura.
* **Salvati e lettura**: Salva articoli e segnali esplicitamente come letti/da leggere. Lo stato è condiviso tra feed, salvati ed edizioni; non modifica Gmail.
* **Sommari offline**: Le edizioni e gli stati sono conservati con AsyncStorage. L'app apre la libreria locale prima di autenticarsi online.
* **Edizioni e archivio**: Ultima edizione per categoria e archivio persistente, inclusa Hardware.
* **Importazione paginata**: Prima sincronizzazione degli ultimi 30 giorni, con tutte le pagine Gmail. Il pulsante “Carica 30 giorni precedenti” estende l'archivio senza eliminare i contenuti già salvati.

## 🛠️ Configurazione file `.env`
L'applicazione ed il suo funzionamento si basano sull'utilizzo delle variabili fornite da Google Cloud Console per accedere a Gmail.

Crea un file `.env` dentro la cartella `client`:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=tuo_client_id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_SECRET=GOCSPX-tuo_client_secret
EXPO_PUBLIC_GOOGLE_REFRESH_TOKEN=1//tuo_refresh_token
```