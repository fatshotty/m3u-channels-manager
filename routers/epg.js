const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Utils = require('../utils');
const Moment = require('moment');
const EpgModule = require('../modules/epg');
const Net = require('net');


const Log = Utils.Log;

const EPG = EpgModule;
// const SkyChannel = EpgModule.Channel;
// const SkyEvent = EpgModule.Event;

const EPG_CACHE_FILE = Path.join( Config.Path , 'epg_cache.json' );

// const EPG = new SkyEpg()

let LoadingChannels = false;
let ChlPromise = null;


function parseCommand(Argv, cb) {

  if ( Argv.update ) {
    updateAndReturnEPG(Argv.today, Argv.days, Argv.yest, Argv.shift, Argv.format, Argv.full, (resp) => {
      cb(resp);
    })

  } else if ( Argv.show ) {
    returnCachedEPGFormatted(Argv.shift, Argv.format, Argv.cgs, null, cb);
  }

}


function loadFromCache() {
  if ( FS.existsSync(EPG_CACHE_FILE) ) {
    Log.info('Loading EPG file from cache...')
    let data = FS.readFileSync( EPG_CACHE_FILE, {encoding: 'utf-8'} );
    try {
      data = JSON.parse(data);
    } catch(e) {
      Log.error(`Cache file ${EPG_CACHE_FILE} seems to be corrupted`);
      return;
    }

    EPG.clear();

    EPG.reloadFromCache(data);

    Log.info(`EPG file correctly reloaded from cache`);
    // Log.debug(`Found ${EPG._channels.length} channels`);

  } else {
    Log.info('No EPG cache file found...');
  }
}
loadFromCache();



function loadChannels() {
  if ( LoadingChannels ) {
    Log.error('Channels are still in loading');
    return;
  }
  LoadingChannels = true;
  EPG.clear();
  ChlPromise = EPG.loadChannels(null, Config.EPG.bulk).then( () => {
    LoadingChannels = false;
    // write EPG to disk
    FS.writeFileSync( EPG_CACHE_FILE, JSON.stringify(EPG.EPG), {encoding: 'utf-8'});
  }, () => {LoadingChannels = false;} );
}


function updateEPG(today, days, yesterday, details, cb) {

  today = ( today ? Moment(today, 'YYYYMMDD') : Moment() );
  today.hour(0).minute(0).seconds(0).millisecond(0);
  today = today.toDate();

  if ( isNaN( today.getTime() ) ) {
    throw `invalid 'today' arguments`;
  }

  days = Math.abs( parseInt(days, 10) );
  const dates = new Array( (days > 2 ? 2 : days) + 1 );
  for( let [i, d] of dates.entries() ) {
    dates[i] = Moment(today).add(i, 'days').toDate();
  }

  if ( yesterday ) {
    dates.unshift( Moment(today).subtract(1, 'days').toDate() );
  }

  loadChannels();

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
      cb(EPG.XMLTV);
    }
  };
  let starttime = Date.now()
  loadByDate(0);
}


function updateAndReturnEPG(today, days, yesterday, shift, format, details, cb) {

  let shifts = Array.isArray(shift) ? shift : shift.split(',');
  shifts = shifts.map( (s) => {
    return parseInt(s, 10)
  }).filter( (s) => {
    return !isNaN( s );
  });

  updateEPG( today, days, yesterday, !!details, (result) => {
    switch( format ) {
      case 'json':
        cb(JSON.stringify(result) );
        break;
      default:
        cb( Utils.createXMLTV(result, shifts).toString() );
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

  let today = req.query.today;
  let days = parseInt(req.query.days || 0, 10);
  let yesterday = req.query.y || false;
  let shift = req.query.shift || '0';
  let details = !!(req.query.details || false);
  const format = req.params.format

  try {
    updateAndReturnEPG( today, days, yesterday, shift, format, details, (result) => {
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
  return EPG.XMLTV;
}

function returnCachedEPGFormatted(shift, format, groups, associations, cb) {
  const json = returnCachedEPG();

  let shifts = Array.isArray(shift) ? shift : (shift || '').split(',');
  shifts = shifts.map( (s) => {
    return parseInt(s, 10)
  }).filter( (s) => {
    return !isNaN( s );
  });

  groups = Array.isArray(groups) ? groups : (groups || '').split(',');
  groups = groups.map( (g) => {
    return g.trim();
  }).filter( (g) => {
    return !!g;
  });


  if ( associations ) {
    if ( typeof associations == 'string' ) {
      associations = associations.trim().split(';');
    }
    let _associations = {};
    for( let ass of associations ) {
      let matches = ass.match( /^(.*)=(.*)$/i );
      if ( matches ) {
        _associations[ matches[1].trim() ] = matches[2].trim();
      }
    }
    associations = _associations
  }


  switch( format ) {
    case 'json':
      cb(  JSON.stringify( json ) );
      break;
    default:
      cb( Utils.createXMLTV(json, shifts, groups, associations).toString() );
  }
}

Router.get('/show.:format?', (req, res, next) => {

  let shift = req.query.shift || '0';
  let format = req.params.format
  let groups = req.query.g;

  let channels = req.query.channels;

  res.status(200);

  returnCachedEPGFormatted(shift, format, groups, channels, (result) => {
    switch( format ) {
      case 'json':
        res.set('content-type', 'application/json')
        break;
      default:
        res.set('content-disposition', `attachment; filename=\"epg-${Moment().format('DD-MM-YYYY')}.xml\"`)
        res.set('content-type', 'application/xml')
    }
    res.end( result );
  });

});




Router.get('/', (req, res, next) => {
  res.render('epg/index', {
    RO: Argv.ro,
    EPG,
    currentDate: Moment().format('YYYY-MM-DD'),
    maxDate: Moment().add(2, 'days').format('YYYY-MM-DD')
  });
})


function info(mountpath) {

  console.log('## EPG router mounted');
  console.log(`- GET ${mountpath}/update.:format?`);
  console.log(`Updates epg and respond the XMLTV. format can be one of 'xml', 'json'`);
  console.log(`querystring parameters:`);
  console.log(`\t- 'today': Date you want to load expressed in YYYYDDMM (default today)`);
  console.log(`\t- 'days': Number of days after, relative to 'today' (default 0, only today. Max 2 'til tomorrow after)`);
  console.log(`\t- 'y': Check if include yesterday or not`);
  console.log(`\t- 'shift': Number of hours of time-shift. E.g. FoxHD -> FoxHD+1`);

  console.log(`- GET ${mountpath}/show.:format?`);
  console.log(`Shows cached epg and respond the XMLTV. format can be one of 'xml', 'json'`);
  console.log(`\t- 'shift': Number of hours of time-shift. E.g. FoxHD -> FoxHD+1`);

}

module.exports = {Router, EPG, loadChannels, returnCachedEPG, parseCommand, info};
