Manage M3U TV Channels list and XMLTV EPG
#### This module is for Italian M3U channels list only
#### Installazione
```bash
mkdir m3u-channels-manager
cd m3u-channels-manager
npm install m3u-channels-manager
```


#### File di Configurazione
Creare il file `config.json` nella cartella, seguendo questo esempio:
```js
{
  "Log": "./manager.log",  // log file
  "M3U": {
    "Url": "http://path/to/m3u",  // url della lista m3u
    "ExcludeGroups": ["-unknown-"] // lista dei gruppi da escludere dalla lista
  },
  "Port": 3000,   // Porta su cui far girare il server locale HTTP
  "Path": "./cache", // cartella usata per i file di cache
  "EPG": {
    "bulk": 3   // numero di request parallele per recuperare i dati dell'EPG
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
m3u-channels-manager --m3u
```
###### Aggiornamento della lista in cache
Aggiornamento della lista canali in cache
```bash
m3u-channels-manager --m3u --refresh
```

###### Gruppi
Mostrare tutti i gruppi disponibili
```bash
m3u-channels-manager --m3u --list-groups
```

###### Lista canali
Mostra tutti i canali della lista
```bash
m3u-channels-manager --m3u --list
```

###### Lista canali per gruppi
Mostra tutti i canali filtrati per gruppi (indicare l'ID del gruppo)
```bash
m3u-channels-manager --m3u --groups DIGITALE --groups SATELLITE
```

###### Lista canali per singolo gruppo
Mostra tutti i canali di un singolo gruppo
```bash
m3u-channels-manager --m3u --group DIGITALE
```

###### Stream-Url per canale
Mostra il link di streaming del canale (indicare l'ID del canale desiderato)
```bash
m3u-channels-manager --m3u --stream-url Rai__1__Full__HD
```


## Modulo EPG
##### Attivazione del module EPG
Attivazione del modulo EPG
```bash
m3u-channels-manager --epg
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
m3u-channels-manager --epg --update --today 20190510

# recupera le informazioni di "domani" e "dopo domani" (max: 3)
m3u-channels-manager --epg --update --days 2

# recuper le informazioni di "ieri"
m3u-channels-manager --epg --update --yest 2

# costruisce l'EPG shiftando gli orari in base alle ore specificate. Usato ad esempio per i canali "Rai 1", "Rai 1 +1", "Rai 1 +2" e "Rai 1 +24"
m3u-channels-manager --epg --update --shift 1 --shift 2 --shift 24
```
```bash
# Recupera le inforazioni EPG dei giorni 9-10-11-12 maggio costruendo un XMLTV che comprende gli orari +1 e +24
m3u-channels-manager --epg --update --today 20191005 --days 2 --shift 1 --shift 24 --yest
```
###### Mostra il file XMLTV in cache
Mostra il file XMLTV in cache
```bash
m3u-channels-manager --epg --show
```

## HTTP server
Carica il modulo HTTP
```bash
m3u-channels-manager --serve
```
È necessario abilitare almeno uno dei moduli precedentemente elencati
```bash
m3u-channels-manager --serve --epg --m3u
```
