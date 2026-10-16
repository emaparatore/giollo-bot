# Armonia Assistente

Applicazione desktop Windows per consultare la guida dell’Accademia Musicale Armonia con un modello locale esposto da **LM Studio**. La documentazione descrive una scuola immaginaria.

## Avvio rapido

### 1. Prepara LM Studio

1. Carica un **modello di chat/instruct** che comprenda l’italiano, compatibile con le risorse del tuo PC.
2. Nella scheda **Developer**, avvia il server locale. L’indirizzo abituale è `http://localhost:1234/v1`.
3. Per il contesto, considera che l’app invia passaggi della guida, istruzioni, una cronologia limitata e richiede fino a 1.600 token di risposta. Come punto di partenza prova un contesto di almeno 8.192 token, se supportato dal modello e dalla memoria disponibile. Il numero di caratteri non equivale al numero di token.

### 2. Apri l’app

Per l’app già compilata, usa l’installer `release/Armonia-Assistente-1.0.0-Setup.exe` oppure l’eseguibile `release/win-unpacked/Armonia Assistente.exe`.

Per avviare il progetto in sviluppo, servono **Node.js 24 o successivo** e npm:

```powershell
npm ci
npm run dev
```

### 3. Configura il collegamento

Apri **Impostazioni**:

1. Controlla l’indirizzo del server.
2. Inserisci una chiave API soltanto se hai abilitato l’autenticazione in LM Studio.
3. Premi **Verifica connessione**: l’app legge i modelli da `/v1/models` e propone un modello disponibile. Scegli un modello di chat, non uno per embeddings. È possibile inserire anche l’identificativo manualmente.
4. Salva e invia una domanda.

La verifica connessione controlla la raggiungibilità e l’elenco modelli; la capacità effettiva di generare una risposta viene verificata inviando una domanda.

## Funzioni

- Chat in italiano, risposta progressiva e pulsante di interruzione.
- Ricerca locale BM25 con normalizzazione, sinonimi mirati e recupero del contesto nelle domande successive brevi.
- Recupero congiunto di retta e quota annuale per le domande sui prezzi.
- Fonti `[S1]`, `[S2]`, ecc. apribili con titolo, righe e testo originale.
- Indicazione dei passaggi consultati, distinta dalla presenza di citazioni puntuali del modello.
- Nuova conversazione e ricaricamento della guida.
- Gestione di errori di connessione, autenticazione, modello e contesto insufficiente.

Le istruzioni distinguono disponibilità storiche e dati live, prezzi annuali e residui, e dati generali e informazioni personali. La correttezza delle risposte dipende anche dal modello: apri i riferimenti per controllare che le informazioni siano sostenute dai passaggi. Il chatbot non effettua iscrizioni o operazioni sulla posizione degli allievi.

## Documentazione e aggiornamenti

Il file originale è `DOCUMENTAZIONE_SCUOLA_MUSICA_ARMONIA.md`, indicizzato in memoria all’apertura dell’app. La ricerca non richiede embeddings, un database esterno o una connessione Internet.

- **In sviluppo:** modifica il file nella radice del progetto e premi **Ricarica documento**.
- **App compilata:** il file si trova nella sottocartella `resources` accanto all’eseguibile. Dopo averlo aggiornato, premi **Ricarica documento**. In un’installazione protetta potrebbero servire i permessi di scrittura sulla cartella.
- Il ricaricamento avvia una nuova conversazione, così le risposte precedenti non vengono confuse con la nuova versione della guida.
- Il file deve mantenere intestazioni Markdown `##` e `###`. L’estrattore conserva tabelle e riferimenti alle righe; non è un importatore di PDF o Word.
- Se aggiorni anno didattico o regole fondamentali, aggiorna anche le istruzioni in `src/main/llm.ts`, attualmente specifiche della guida 2026–2027.

## Dati e connessioni

Il processo principale di Electron legge la guida, esegue la ricerca e chiama il server configurato. L’interfaccia non ha accesso diretto a Node.js. Le chiavi eventualmente inserite sono salvate tramite `safeStorage` di Electron, con protezione delle credenziali di Windows; non vengono scritte in chiaro nel file delle impostazioni.

Le impostazioni sono in `settings.json` nella cartella dati utente dell’app, normalmente `%APPDATA%/armonia-assistente`. Le conversazioni restano solo in memoria: chiudendo l’app o avviando una nuova chat vengono cancellate. Non sono presenti analytics, font remoti o servizi AI cloud preconfigurati.

Con l’indirizzo predefinito, le richieste restano sul PC. Se imposti un indirizzo di rete o remoto, domanda, passaggi selezionati e parte della cronologia vengono inviati a quel server.

## Comandi

```powershell
npm run typecheck      # Controllo TypeScript
npm test               # Ricerca sulla guida reale e client HTTP con server simulato
npm run build          # Compila in out/
npm run test:desktop   # Prova l’app Electron compilata con server simulato
npm run dist:win       # Compila e crea l’installer Windows x64 in release/
npm run test:packaged  # Verifica l’eseguibile generato e la guida inclusa
```

`test:desktop` richiede una sessione grafica Windows e una build aggiornata (`npm run build`). Usa Electron tramite Playwright, senza scaricare un browser separato. Verifica impostazioni, cifratura della chiave, chat, citazioni, annullamento, ricaricamento e gestione della connessione assente. Usa una cartella temporanea isolata sotto `%TEMP%/opencode` (la cartella `opencode` deve esistere) e non modifica le impostazioni normali dell’app.

I test automatizzati non misurano la qualità del tuo modello locale. Per la verifica reale, prova almeno:

| Domanda | Risultato da controllare |
|---|---|
| Quanto costa un anno di piano da 30 minuti? | €800 di retta + €60 d’iscrizione = €860, distinto dal residuo |
| Posso iniziare piano martedì alle 18? | Fascia esclusa: Ada Ricci insegna teoria tra le 17 e le 19 |
| Ci sono posti a batteria? | Completo nella fotografia del 15 ottobre 2026; verifica in segreteria |
| Posso sommare sconto famiglia e secondo corso? | Nessun cumulo sulla stessa retta |
| Ho pagato la mia ultima rata? | Nessun accesso alla posizione personale |
| Quanto costa iscriversi a gennaio? | Richiesta dei dati mancanti, senza inventare il numero di lezioni residue |

## Struttura

```text
src/main/          Finestra Electron, impostazioni, ricerca, client LM Studio
src/preload/       API IPC esposta all’interfaccia
src/shared/        Tipi condivisi
src/renderer/      Interfaccia React e stili
tests/             Test di ricerca e protocollo HTTP/streaming
scripts/           Prova automatizzata dell’app desktop
```

La distribuzione attuale è un prototipo per un PC Windows con un server LM Studio già installato. Il modello e LM Studio non sono inclusi nell’installer. I pacchetti creati localmente non sono firmati digitalmente.
