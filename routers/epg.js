const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Utils = require('../utils');
const Moment = require('moment');
const EpgModule = require('../modules/epg');
const Net = require('net');


const Log = Utils.Log;

let Watcher = null;
let WatcherAssociation = null;
let WatchTimer = null;
let WatchAssociationTimer = null;

let ASSOCIATIONS = {};

const EPG = EpgModule;

const MOUNT_PATH = '/epg';

const EPG_CACHE_FILE = Path.join( Config.Path , 'epg_cache.json' );
const EPG_CACHE_FILE_ASSOCIATIONS = Path.join( Config.Path , 'epg_cache_associations.json' );



let LoadingChannels = false;
let ChlPromise = null;


function parseCommand(Argv, cb) {

  if ( Argv.update ) {
    updateAndReturnEPG(Argv.shift, Argv.format, Argv.full, Argv.association, cb);

  } else if ( Argv.show ) {
    returnCachedEPGFormatted(Argv.shift, Argv.format, Argv.full, Argv.association, cb);
  }

}


function loadFromCache() {
  if ( FS.existsSync(EPG_CACHE_FILE) ) {
    Log.info('Loading EPG file from cache...')
    let data = FS.readFileSync( EPG_CACHE_FILE, {encoding: 'utf-8'} );
    try {
      data = JSON.parse(data);
    } catch(e) {
      Log.error(`Cache file ${EPG_CACHE_FILE} seems to be corrupted, ${e}`);
      return;
    }

    EPG.clear();

    EPG.reloadFromCache(data);

    Log.info(`EPG file correctly reloaded from cache`);

  } else {
    FS.writeFileSync(EPG_CACHE_FILE, '{}', {encoding: 'utf-8'} );
    Log.info('No EPG cache file found, create a new one...');
  }
}
loadFromCache();


function loadAssociations() {
  if ( FS.existsSync(EPG_CACHE_FILE_ASSOCIATIONS) ) {
    let data = FS.readFileSync( EPG_CACHE_FILE_ASSOCIATIONS, {encoding: 'utf-8'} );
    ASSOCIATIONS = JSON.parse(data);
  } else {
    FS.writeFileSync(EPG_CACHE_FILE_ASSOCIATIONS, '{}', {encoding: 'utf-8'} );
    Log.warn('No associations file found, create a new one');
  }
}

loadAssociations();

function fileWatcher() {
  Log.debug('EPG making file watchable');
  if ( Watcher ) Watcher.close();
  Watcher = FS.watch(EPG_CACHE_FILE, 'utf-8', (eventType, filename) => {
    Log.debug('EPG file watcher triggered');
    if ( eventType == 'change' ) {
      clearTimeout(WatchTimer);
      WatchTimer = setTimeout( () => {
        Log.info('--- epg file has been changed - reloading!')
        loadFromCache();
      }, 1000);
    }
  });

  if ( WatcherAssociation ) WatcherAssociation.close();
  WatcherAssociation = FS.watch(EPG_CACHE_FILE_ASSOCIATIONS, 'utf-8', (eventType, filename) => {
    Log.debug('ASSOCIATION file watcher triggered');
    if ( eventType == 'change' ) {
      clearTimeout(WatchAssociationTimer);
      WatchAssociationTimer = setTimeout( () => {
        Log.info('--- epg associations file has been changed - reloading!')
        loadAssociations();
      }, 1000);
    }
  });

}


process.on('exit', () => {
  if ( Watcher ) {
    Watcher.close();
  }
  if ( WatcherAssociation ) {
    WatcherAssociation.close();
  }
})


function loadChannels(skip_save) {
  if ( LoadingChannels ) {
    Log.error('Channels are still in loading');
    return;
  }
  LoadingChannels = true;
  EPG.clear();
  ChlPromise = EPG.loadChannels(null, Config.EPG.bulk).then( () => {
    LoadingChannels = false;
    // write EPG to disk
    if ( !skip_save ) {
      FS.writeFileSync( EPG_CACHE_FILE, JSON.stringify(EPG.EPG), {encoding: 'utf-8'});
    }
  }, () => {LoadingChannels = false;} );
}


function updateEPG(details, cb) {

  let today = Moment();
  today.hour(0).minute(0).seconds(0).millisecond(0);
  today = today.toDate();


  let dates = [ today ];

  loadChannels(true);

  const loadByDate = (index) => {
    const date = dates[ index++ ];
    if ( date ) {
      ChlPromise.then( () => {
        const onFinally = () => {
          Log.info(`Loading new date...`);
          loadByDate(index);
        };
        EPG.scrapeEpg(date, !!details, Config.EPG.bulk).then( onFinally, onFinally );
      });
    } else {
      // write file cache
      Log.info(`No more dates, completed in ${Date.now() - starttime}ms`);
      let _epg_ = EPG.EPG;
      FS.writeFileSync( EPG_CACHE_FILE, JSON.stringify(_epg_), {encoding: 'utf-8'});
      cb(_epg_);
    }
  };
  let starttime = Date.now()
  loadByDate(0);
}


function updateAndReturnEPG(shift, format, details, association, cb) {
  let ass =  null;
  if ( association ) {
    if ( ! (association in ASSOCIATIONS ) ) {
      ass = ASSOCIATIONS[ association ];
      shift = ass.shift;
      details = ass.detailed;

      Log.info(`update EPG using association ${association}`);
    } else {
      Log.warn(`cannot found association ${association}`);
      cb(`- cannot found association ${association} -`);
      return;
    }
  }

  let shifts = Array.isArray(shift) ? shift : shift.split(',');

  shifts = shifts.map( (s) => {
    return parseInt(s, 10)
  }).filter( (s) => {
    return !isNaN( s );
  });

  updateEPG( !!details, (result) => {
    switch( format ) {
      case 'json':
        cb(JSON.stringify(result) );
        break;
      default:
        cb( Utils.createXMLTV(result, shifts, details, ass && ass.channels).toString() );
    }
  });
}

Router.get('/channels/update', (req, res, next) => {
  if ( Argv.ro ) {
    res.status(412).end('Operation not permitted');
    return;
  }
  loadChannels();
  ChlPromise.then( () => {
    res.status(204).end();
  }, (err) => {
    res.status(500).end(`Si è verificato un errore ${err}`);
  });
});

Router.get('/update.:format?', (req, res, next) => {

  if ( Argv.ro ) {
    res.status(412).end('Operation not permitted');
    return;
  }

  let shift = req.query.shift || '0';
  let details = !!(req.query.details || false);
  const format = req.params.format

  try {
    updateAndReturnEPG( shift, format, details, null, (result) => {
      res.status(200);

      switch( format ) {
        case 'json':
          res.set('content-type', 'application/json')
          break;
        default:
          res.set('content-type', 'application/xml')
          //result = Pretty.xml( result );
      }
      res.end( result );
    });
  } catch( e ) {
    res.status(400).end( `${e}`);
  }

});

Router.get('/write', (req, res, next) => {

  if ( Argv.ro ) {
    res.status(412).end('Operation not permitted');
    return;
  }

  let shift = req.query.shift || '0';
  let shifts = Array.isArray(shift) ? shift : shift.split(',');
  shifts = shifts.map( (s) => {
    return parseInt(s, 10)
  }).filter( (s) => {
    return !isNaN( s );
  });

  if ( Config.EPG.Sock ) {
    Log.info(`Writing XMLTV with Time-Shift ${shifts} to ${Config.EPG.Sock}`);
    const resp = Utils.createXMLTV(returnCachedEPG(), shifts).toString();
    const Client = Net.connect( {path: Config.EPG.Sock }, function () {
      Client.write( resp );
      Client.end();
      Client.unref();
      Log.info('XMLTV has been written');
    });
    res.status(204).end('');
    return;
  }
  Log.error('No SOCK file specified');
  res.status(422).end('No SOCK file specified');
})


function returnCachedEPG() {
  // reload from cache because other process can update the epg
  loadFromCache();
  return EPG.EPG;
}

function returnCachedEPGFormatted(shift, format, detailed, association_name, cb) {
  const json = returnCachedEPG();

  let shifts = Array.isArray(shift) ? shift : (shift || '').split(',');

  let association = null;

  if ( association_name ) {
    if ( ! (association_name in ASSOCIATIONS) ) {
      Log.error(`no association found under name ${association_name}`);
      cb( `- no association found under name ${association_name} -` )
      return;
    }

    Log.info(`use association: ${association_name}`);
    association = ASSOCIATIONS[ association_name ];
    shifts = association.shift.split(',');
    detailed = association.detailed;
  }

  shifts = shifts.map( (s) => {
    return parseInt(s, 10)
  }).filter( (s) => {
    return !isNaN( s );
  });


  switch( format ) {
    case 'json':
      cb(  JSON.stringify( json ) );
      break;
    default:
      cb( Utils.createXMLTV(json, shifts, detailed, association.channels).toString() );
  }
}

// Router.get('/show.:format?', (req, res, next) => {

//   let shift = req.query.shift || '0';
//   let format = req.params.format
//   let groups = req.query.g;

//   let channels = req.query.channels;

//   res.status(200);

//   returnCachedEPGFormatted(shift, format, [detailed], channels, (result) => {
//     switch( format ) {
//       case 'json':
//         res.set('content-type', 'application/json')
//         break;
//       default:
//         // res.set('content-disposition', `attachment; filename=\"epg-${Moment().format('DD-MM-YYYY')}.xml\"`)
//         res.set('content-type', 'application/xml')
//     }
//     res.end( result );
//   });

// });





function saveAssociation(name, data) {

  ASSOCIATIONS[ name ] = data;

  FS.writeFileSync( EPG_CACHE_FILE_ASSOCIATIONS, JSON.stringify(ASSOCIATIONS, null, 2), {encoding: 'utf-8'});

}


Router.post('/associations/:assname', (req, res, next) => {

  let assname = req.params.assname;
  saveAssociation(assname, req.body);

  res.status(204).end();

});


Router.get('/associations/:assname', (req, res, next) => {

  let association = ASSOCIATIONS[ req.params.assname ];

  if ( association ) {
    res.set('content-type', 'application/json');
    res.status(200).end( JSON.stringify(association) );
  } else {
    res.status(404).end('Association not found');
  }

});


Router.get('/xmltv.:format', (req, res, next) => {
  // show entire epg
  let format = req.params.format || 'xml'
  let shifts = req.query.shift;
  let detailed = req.query.full;

  if ( detailed !== undefined ) {
    detailed = !!detailed;
  }

  returnCachedEPGFormatted(shifts, format, detailed, association, (result) => {

    switch( format ) {
      case 'json':
        res.set('content-type', 'application/json')
        break;
      case 'gz':
        // TODO: gz compression
      default:
        res.set('content-type', 'application/xml')
    }
    res.end( result );
  });
})

Router.get('/xmltv/:assname.:format', (req, res, next) => {
  // show entire epg using association
  let assname = req.params.assname;
  let format = req.params.format || 'xml'

  // if ( ! (assname in ASSOCIATIONS) ) {
  //   res.status(404).end(`- no association found under name ${assname} -`);
  //   return;
  // }

  // let association = ASSOCIATIONS[ assname ];


  returnCachedEPGFormatted(null, 'xml', null, assname, (result) => {

    switch( format ) {
      case 'gz':
        // TODO: gz compression
        // res.set('content-type', 'application/json')
        // break;
      default:
        res.set('content-type', 'application/xml')
    }
    res.end( result );
  });


})


Router.get('/', (req, res, next) => {
  res.render('epg/index', {
    hasSockFile: Config.EPG.Sock,
    RO: Argv.ro,
    EPG,
    currentDate: Moment().format('YYYY-MM-DD'),
    maxDate: Moment().add(2, 'days').format('YYYY-MM-DD')
  });
})


function info(mountpath) {

  console.log(' ## EPG router mounted');
  console.log(` - GET ${mountpath}/update.:format?`);
  console.log(`     Updates epg and respond the XMLTV. format can be one of 'xml', 'json'`);
  console.log(`     querystring parameters:`);
  console.log(`     \t- 'shift': Number of hours of time-shift. E.g. FoxHD -> FoxHD+1`);
  console.log(`     \t- 'full': Specifies if epg will be fullfilled or not`);

  console.log(` - GET ${mountpath}/xmltv.:format?`);
  console.log(`     Shows cached epg and respond the XMLTV. format can be one of 'xml', 'json'`);
  console.log(`     \t- 'shift': Number of hours of time-shift. E.g. FoxHD -> FoxHD+1`);

  console.log(` - GET ${mountpath}/xmltv/:association_name.xml`);
  console.log(`     Shows cached epg and respond the XMLTV using specified association name`);

}

module.exports = {Router, MountPath: MOUNT_PATH, EPG, loadChannels, returnCachedEPG, parseCommand, info, fileWatcher};
