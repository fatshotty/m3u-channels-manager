const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Utils = require('../utils');
const Moment = require('moment');
const EpgModule = require('../modules/epg');
const Net = require('net');
const Pretty = require('pretty-data').pd;


const Log = Utils.Log;

const SkyEpg = EpgModule.SkyEpg;
const SkyChannel = EpgModule.Channel;
const SkyEvent = EpgModule.Event;

const EPG_CACHE_FILE = Path.join( Config.Path , 'epg_cache.json' );

const EPG = new SkyEpg()

let LoadingChannels = false;
let ChlPromise = null;



function parseCommand(Argv, cb) {

  if ( Argv.update ) {
    updateAndReturnEPG(Argv.today, Argv.days, Argv.yest, Argv.shift, Argv.format, Argv.full, (resp) => {
      cb(resp);
    })

  } else if ( Argv.show ) {
    returnCachedEPGFormatted(Argv.shift, Argv.format, cb);
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

    for( let chl_data of data ) {

      const chl_epg = chl_data.Epg;
      const epg_keys = Object.keys( chl_epg );

      const Chl = new SkyChannel( chl_data );

      for ( let epgK of epg_keys ) {
        const events = chl_epg[ epgK ];
        const arr_events = Chl._epg[ epgK ] = [];
        for( let evt of events ) {
          const Event = new SkyEvent(evt);
          if ( evt._start ) {
            Event._start = new Date( evt._start );
          }
          arr_events.push( Event );
        }

      }

      EPG._channels.push( Chl );
    }

    Log.info(`EPG file correctly loaded`);
    Log.debug(`Found ${EPG._channels.length} channels`);

  } else {
    Log.info('No EPG cache file found...');
  }
}
loadFromCache();



function loadChannles() {
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

  loadChannles();

  const loadByDate = (index) => {
    const date = dates[ index++ ];
    if ( date ) {
      ChlPromise.then( () => {
        const onFinally = () => {
          loadByDate(index);
        };
        EPG.scrapeEpg(date, !!details, Config.EPG.bulk).then( onFinally, onFinally );
      });
    } else {
      // write file cache
      FS.writeFileSync( EPG_CACHE_FILE, JSON.stringify(EPG.EPG), {encoding: 'utf-8'});
      cb(EPG.EPG);
    }
  };
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
    if ( Config.EPG.Sock ) {
      const Client = Net.connect( {path: Config.EPG.Sock }, function () {
        Client.write( Utils.createXMLTV(result, shifts).toString() );
        Client.end();
        Client.unref();
      });
    }
  });
}

Router.get('/update.:format?', (req, res, next) => {

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
          result = Pretty.xml( result );
      }
      res.end( result );
    });
  } catch( e ) {
    res.status(400).end( `${e}`);
  }

});


function returnCachedEPG() {
  return EPG.EPG;
}

function returnCachedEPGFormatted(shift, format, cb) {
  const json = returnCachedEPG();

  let shifts = Array.isArray(shift) ? shift : shift.split(',');
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
      cb( Utils.createXMLTV(json, shifts).toString() );
  }
}

Router.get('/show.:format?', (req, res, next) => {

  let shift = req.query.shift || '0';
  const format = req.params.format

  res.status(200);

  returnCachedEPGFormatted(shift, format, (result) => {
    switch( format ) {
      case 'json':
        res.set('content-type', 'application/json')
        break;
      default:
        res.set('content-type', 'application/xml')
    }
    res.end( result );
  });

});

Router.get('/', (req, res, next) => {
  res.render('epg/index', {
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

module.exports = {Router, EPG, loadChannles, returnCachedEPG, parseCommand, info};
