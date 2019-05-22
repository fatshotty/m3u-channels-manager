Manage M3U TV Channels list and XMLTV EPG
#### This module is for Italian M3U channels list only

Questo modulo divide una lista di canali televisi m3u suddividendola per `group-title`.
- Fornisce un url univoco per singolo canale
- Fornisce un url univoco per ogni gruppo di canali
- Consente di cercare un canale all'interno della lista
- Permette di costruire url dinamici suddivisi per 1 o più gruppi di canali
- Recupera le informazioni EPG per ogni canale
- Salva il file EPG in cache
- Permette la scrittura del file XMLTV su file .sock (utile per TvHeadEnd Server)
- Fornisce il time-shift dinamico dei programmi elencati nel file XMLTV (es. `Rai1`, `Rai1 +1` ...)

#### Installazione
Prima di tutto installate node (consigliata vers 10.x)
```bash
mkdir tv-channels
cd tv-channels
npm install tv-channels-manager-ita
tv-channels-manager-ita [args...]
```


#### File di Configurazione
Nella stessa cartella in cui viene eseguito il comando, verrà creato un file
di configurazione. Modificatelo in base alle vostre esigenze
```js
{
  "Log": "./manager.log",  // log file
  "LocalIp": "192.168.0.2", // indirizzo ip interno del dispositivo
  "M3U": {
    "Url": "http://path/to/list.m3u",  // url della lista m3u
    "ExcludeGroups": ["-unknown-"] // lista dei gruppi da escludere dalla lista
  },
  "Port": 3000,   // Porta su cui far partire il server locale HTTP
  "Path": "./cache", // cartella usata per i file di cache
  "EPG": {
    "bulk": 3   // numero di request parallele per recuperare i dati dell'EPG
    "Sock": '' // file .sock su cui scrivere il file XMLTV
  }
}
```


#### Command line
Ogni comando ha 2 output secondo il formato richiesto: `json` , `m3u` oppure `xml`
```bash
$0 [--m3u|--epg] --format json|m3u|xml
```

## Modulo M3U
##### Attivazione del module M3U
Attivazione del modulo M3U
```bash
$0 --m3u
```
###### Aggiornamento della lista in cache
Aggiornamento della lista canali in cache
```bash
$0 --m3u --refresh
```

###### Gruppi
Mostrare tutti i gruppi disponibili
```bash
$0 --m3u --list-groups
```

###### Lista canali
Mostra tutti i canali della lista
```bash
$0 --m3u --list
```

###### Lista canali per gruppi
Mostra tutti i canali filtrati per gruppi (indicare l'ID del gruppo)
```bash
$0 --m3u --groups DIGITALE --groups SATELLITE
```

###### Lista canali per singolo gruppo
Mostra tutti i canali di un singolo gruppo
```bash
$0 --m3u --group DIGITALE
```

###### Stream-Url per canale
Mostra il link di streaming del canale (indicare l'ID del canale desiderato)
```bash
$0 --m3u --stream-url Rai__1__Full__HD
```


## Modulo EPG
##### Attivazione del module EPG
Attivazione del modulo EPG
```bash
$0 --epg
```
###### Aggiornamento del file XMLTV in cache
Aggiornamento del file XMLTV in cache. Questo comando supporta le seguenti options:
* today YYYYMMDD (default: data odierna)
* days 2
* shift 1 2 24
* yest

Tutti questi flag possono essere combinati tra loro
```bash
# recupera l'EPG del giorno 10 maggio 2019
$0 --epg --update --today 20190510

# recupera le informazioni di "domani" e "dopo domani" con il flag `days` (max: 3)
$0 --epg --update --days 2

# recupera le informazioni di "ieri"
$0 --epg --update --yest

# costruisce l'EPG shiftando gli orari in base alle ore specificate. Usato ad esempio per i canali "Rai 1", "Rai 1 +1", "Rai 1 +2" e "Rai 1 +24"
$0 --epg --update --shift 1 --shift 2 --shift 24
```
```bash
# Recupera le inforazioni EPG dei giorni 9-10-11-12 maggio costruendo un XMLTV che comprende gli orari +1 e +24
$0 --epg --update --today 20191005 --days 2 --shift 1 --shift 24 --yest
```
###### Mostra il file XMLTV in cache
Mostra il file XMLTV in cache
```bash
$0 --epg --show
```

## HTTP server
Carica il modulo HTTP
```bash
$0 --serve
```
È necessario abilitare almeno uno dei moduli precedentemente elencati
```bash
$0 --serve --epg --m3u
```


## Known Issues
Mancano il palinsesto di alcuni programmi Rai:
`Rai Premium`, `Rai movie`, `Rai 4`, `Rai 5`

