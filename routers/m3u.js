const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Request = require('../utils').request;
const M3UK = require('../modules/m3u').M3U;

const EPG = require('../modules/epg');

const Utils = require('../utils');
const Log = Utils.Log;


const MOUNTH_PATH = '/tv';


let Watcher = null;
let WatchTimer = null;
let WatcherConfig = null;
let WatchTimerConfig = null;

const M3U_CACHE_FILE = Path.join( Config.Path , 'm3u_cache.txt' );
const PERSONAL_FILE = Path.join( Config.Path , 'm3u_personal.json' );

let M3U_LIST_STRING = '';
let M3U_PERSONAL = null;

// const BASE_URL = ['http:/', `${Config.LocalIp}:${Config.Port}`, 'tv'].join('/');
let DOMAIN_URL = `http://${Config.LocalIp}:${Config.Port}`;

let M3UList = null;
M3UList = new M3UK( `${DOMAIN_URL}${MOUNTH_PATH}/live` );


if ( FS.existsSync(M3U_CACHE_FILE) ) {
  M3U_LIST_STRING = FS.readFileSync(M3U_CACHE_FILE, {encoding: 'utf-8'});
  loadM3U();
} else {
  refreshM3U();
}

if ( FS.existsSync(PERSONAL_FILE) ) {
  M3U_PERSONAL = FS.readFileSync(PERSONAL_FILE, {encoding: 'utf-8'});
  try {
    M3U_PERSONAL = JSON.parse(M3U_PERSONAL);
  } catch(e) {
    Log.error(`Cannot parse 'personal' list`, e);
  }
}


function loadM3U() {
  M3UList.load(M3U_LIST_STRING);
  M3UList.removeGroups( Config.M3U.ExcludeGroups );
}


function fileWatcher() {
  Log.debug('M3U making file watchable');
  if ( Watcher ) Watcher.close();
  Watcher = FS.watch(M3U_CACHE_FILE, 'utf-8', (eventType, filename) => {
    Log.debug('M3U file watcher triggered');
    if ( eventType == 'change' ) {
      clearTimeout(WatchTimer);
      WatchTimer = setTimeout( () => {
        Log.info('--- M3U file has been changed - reloading!')
        M3U_LIST_STRING = FS.readFileSync(M3U_CACHE_FILE, {encoding: 'utf-8'});
        M3UList.clear();
        loadM3U();
      }, 1000);
    }
  });

}


process.on('exit', () => {
  if ( Watcher ) {
    Watcher.close();
  }
})


function parseCommand(Argv, cb) {

    if ( Argv.refresh ) {
      refreshM3U( (err, body) => {
        cb(err || body);
      });

    } else if ( Argv.s ) {
      respondStreamUrl(Argv.s, Argv.g, (url) => {
        cb(url);
      });

    } else if ( Argv.g ) {
      cb( respondSingleGroup(Argv.g, Argv.format) )

    } else if ( Argv.lg ) {
      cb( respondAllGroups(Argv.format) )

    } else if ( Argv.l || Argv.gs ) {
      cb( respondList(Argv.gs, Argv.format) )

    }


}


function refreshM3U(cb) {

  if ( ! Config.M3U.Url ) {
    Log.error('No M3U path specified');
    return cb && cb('No M3U path specified');
  }
  if ( (`${Config.M3U.Url}`).indexOf('http') == 0 ) {
    Log.info(`Refreshing M3U list from remote url`);
    Log.debug(`remote url: ${Config.M3U.Url}`);
    Request(Config.M3U.Url, {'User-Agent': Config.M3U.UserAgent || 'kodi'}, (err, body) => {
      if ( !err ) {
        M3U_LIST_STRING = body;
        M3UList.clear();
        loadM3U();
        FS.writeFileSync(M3U_CACHE_FILE, M3U_LIST_STRING, {encoding: 'utf-8'});
        Log.info('M3U file correctly cached');
      }
      cb && cb(err, body)
    })
  } else {
    Log.info(`Refreshing M3U list from local m3u file`);
    Log.debug(`local file: ${Config.M3U.Url}`);
    const filedata = FS.readFileSync(Config.M3U.Url, {encoding: 'utf-8'})
    M3U_LIST_STRING = filedata;
    M3UList.clear();
    loadM3U();
    FS.writeFileSync(M3U_CACHE_FILE, M3U_LIST_STRING, {encoding: 'utf-8'});
    process.nextTick( () => {
      cb && cb(false, filedata);
    })
  }
}

Router.get('/update', (req, res, next) => {
  Log.info(`Updating m3u list...`);
  Log.debug(`...from ${Config.M3U.Url}`);
  refreshM3U( (err, body) => {
    if ( !err ) {
      res.status(204).end();
    } else {
      res.status(422).end(`${err}`);
    }
  });

});



function respondStreamUrl(chlId, group, cb) {

  Log.info(`Compute the channel stream-url for ${chlId}` )

  if ( !chlId ) {
    Log.error('No channel specified');
    return cb(null);
  }


  const live_channel = M3UList.getChannelById( chlId, group );
  if ( live_channel ) {
    Log.info(`found stram url '${live_channel.StreamUrl.split('/').pop()}'` )
    // Utils.computeChannelStreamUrl(live_channel).then( (surl) => {
    //   cb(surl);
    // });
    cb( live_channel.StreamUrl );

  } else {
    Log.error(`No live streaming found for channel ${chlId}`);
    return cb(null);
  }
}


Router.get('/live', (req, res, next) => {

  let channel = req.query.channel;
  let group = req.query.group;

  getStreamUrlOfChannel(channel, group).then( (live_channel) => {

    res.redirect(302, live_channel);

  }, (reason) => {
    res.status(404).end(reason);
  });

});

Router.get('/live/:channel', (req, res, next) => {

  const channel = req.params.channel;

  Log.warn(`****
you are using a deprecated api. Use '/live?channel=${channel}' instead
****`);

  getStreamUrlOfChannel(channel).then( (live_channel) => {

    res.redirect(302, live_channel);

  }, (reason) => {
    res.status(404).end(reason);
  });

});


Router.get('/personal/live', (req, res, next) => {

  let channel = req.query.channel;
  let group = req.query.group;
  let pipe = !!req.query.p;

  getMappedStreamUrlOfChannel(channel, group).then( (live_channel) => {

    if ( ! pipe ) {
      res.redirect(302, live_channel);
    } else {
      // TODO: piping
      res.status(503).end(`Piping is not implemented yet`);
    }

  }, (reason) => {
    res.status(404).end(reason);
  });

});


function getStreamUrlOfChannel(channel, group) {
  Log.info(`Live streaming requested for ${channel}`);

  return new Promise( (resolve, reject) => {
    if ( !channel ) {
      Log.error('No channel specified');
      reject('No channel specified');
      return;
    }

    respondStreamUrl( channel, group, (live_channel) => {
      if ( live_channel ) {
        Log.debug(`Found live streaming for channel ${channel}`);
        Log.debug(`redirect to ${live_channel}`);

        if ( Config.M3U.UseForStream === true ) {
          Log.info(`adding user-agent to stream url "${Config.M3U.UserAgent}"`);
          live_channel = `${live_channel}|User-Agent=${Config.M3U.UserAgent}`;
        }

        resolve(live_channel);

      } else {
        reject(`No channel link found under name ${channel}`);
      }
    });
  });

}


function getMappedStreamUrlOfChannel(req_chl_id, group) {
  Log.info(`MappedLive streaming requested for '${req_chl_id}' of '${group}'`);
  if ( ! M3U_PERSONAL ) {
    Log.error(`No map found, it must be set from /tv/personal`);
    return Promise.reject(`No mapped channels have been set`);
  }

  let groups_keys = Object.keys(M3U_PERSONAL);

  if ( group && (group in M3U_PERSONAL) ) {
    Log.debug(`Searching map for '${req_chl_id}' in '${group}'`);
    groups_keys = [ group ];
  }


  for ( let grp_key of groups_keys ) {
    Log.debug(`Searcing in group: '${grp_key}'`);
    let chls = M3U_PERSONAL[ grp_key ];

    for ( let chl of chls ) {
      if ( chl.ID == req_chl_id ) {
        Log.info(`found channels '${chl.ID}' by '${req_chl_id}' of '${grp_key}'`);
        return getStreamUrlOfChannel(chl.ID, grp_key);
      }
    }
  }

  return Promise.reject(`No channel found searching for '${req_chl_id}' in '${group}'`);
}



function respondSingleGroup(groupId, format) {

  const group = M3UList.getGroupById( groupId );

  if ( ! group ) {
    Log.error('No group found by id', groupId);
    return null;
  }

  switch (format) {
    case 'json':
      return JSON.stringify(group.toJson());
    default:
      return group.toM3U(true);
  }
}

Router.get('/list/:group.:format?', (req, res, next) => {

  Log.info(`Request list by group ${req.params.group}. Respond with ${req.params.format || 'm3u'}`);

  const response = respondSingleGroup( req.params.group, req.params.format );

  if ( ! response ) {
    res.status(404).end( 'No group found by ' + req.params.group);
    return;
  }

  const format = req.params.format;

  res.status(200);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    default:
      res.set('content-type', 'application/x-mpegURL');
      break;
  }
  res.end( response );
})



function respondList(groups, format) {
  let all_groups = M3UList.groups;

  if ( groups && groups.length ) {
    const arr = [];
    groups = Array.isArray(groups) ? groups : groups.split(',');
    for ( let g of groups ) {
      const _g = M3UList.getGroupById( g );
      if ( _g ) {
        arr.push( _g );
      }
    }
    all_groups = arr;
  }

  switch (format) {
    case 'json':
      const response = {};
      for ( let g of all_groups ) {
        response[ g.Id ] = g.toJson();
      }
      return JSON.stringify( response )
    default:
      return all_groups.map( (g, i) => { return g.toM3U(i === 0) }).join('\n');
  }
}

Router.get('/list.:format?', (req, res, next) => {
  const format = req.params.format;
  const groups = req.query.groups;

  Log.info(`Requested entire list. Respond with ${format || 'm3u'}`);
  Log.info(`Filter by ${groups}`);

  const response = respondList(groups, format);

  res.status(200);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    default:
      res.set('content-type', 'application/x-mpegURL');
      break;
  }
  res.end( response ) ;
});



function respondAllGroups(format) {
  let link = `/list`;
  if ( Config.M3U.UseFullDomain ) {
    link = `${DOMAIN_URL}${MOUNTH_PATH}${link}`;
  }

  switch (format) {
    case 'json':
      const resultjson = M3UList.groups.map( (g) => {
        return {id: g.Id, name: g.Name, count: g.channels.length}
      });
      return JSON.stringify(resultjson);
      break;
    case 'xml':
      return Utils.createXMLKodiLive( M3UList.groups, `${DOMAIN_URL}${MOUNTH_PATH}/list` ).toString();
      break;
    default:
      const resultm3u = M3UList.groups.map( (g) => {
        return [`#EXTINF:0, ${g.Name}`, `${link}/${g.Id}.m3u8`].join('\n');
      });
      resultm3u.unshift('#EXTM3U');
      return resultm3u.join('\n')
  }
}

Router.get('/groups.:format?', (req, res, next) => {

  const format = req.params.format;
  Log.info(`List all groups with ${format || 'm3u'}`);

  const response = respondAllGroups(format);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    case 'xml':
      res.set('content-type', 'application/xml');
      break;
    default:
      res.set('content-type', 'application/x-mpegURL');
  }

  res.status(200).end( response );

});


Router.get('/', (req, res, next) => {
  res.render('m3u/index', {M3UList});
});




function respondPersonalM3U(format, fulldomain) {

  fulldomain = fulldomain || Config.M3U.UseFullDomain;

  let result_channels = [];
  if ( M3U_PERSONAL ) {
    let group_keys = Object.keys(M3U_PERSONAL);

    for ( let grp_key of group_keys ) {
      let personalChannels = M3U_PERSONAL[ grp_key ];
      let group = M3UList.getGroupById( grp_key );
      if ( group ) {
        for ( let personalChannel of personalChannels) {
          let personalId = personalChannel.ID;
          let channel = group.getChannelById(personalId);
          if ( ! channel ) {
            Log.warn(`no channel '${personalId}' found in '${grp_key}'`);
            continue;
          }

          let temp_ch = channel.clone();

          temp_ch.TvgId = personalChannel.MapTo;
          temp_ch.TvgName = personalChannel.MapTo;
          temp_ch.Name = personalChannel.MapTo;
          temp_ch.Number = personalChannel.Number;

          let temp_redirect = temp_ch.Redirect;

          if ( temp_redirect ) {
            // let url = new URL( temp_redirect );
            // url.pathname = '/tv/personal/live';
            // url.searchParams.set('channel', personalChannel.MapTo);
            // url.searchParams.delete('group');
            // // TODO: add piping
            // if ( Config.M3U.UseFullDomain ) {
            //   temp_ch.Redirect = url.toString();
            // } else {
            //   // TODO: use url without domain
            //
            // }
            let url_paths = temp_redirect.split('?');
            url_paths.shift();
            if ( fulldomain ) {
              temp_redirect = `${DOMAIN_URL}${MOUNTH_PATH}/personal/live?channel=${temp_ch.Id}`;
            } else {
              temp_redirect = `${MOUNTH_PATH}/personal/live?channel=${temp_ch.Id}`;
            }

            temp_ch.Redirect = temp_redirect;
          }

          result_channels.push( temp_ch );

        }
      }
    }

  }


  result_channels.sort( (a, b) => {
    let n_a = parseInt(a.Number || 0, 10);
    let n_b = parseInt(b.Number || 0, 10);
    return n_a > n_b ? 1 : -1;
  });

  let resultm3u = result_channels.map( c => c.toM3U() );

  resultm3u.unshift('#EXTM3U');
  return resultm3u.join('\n')
}


Router.get('/personal.:format?', (req, res, next) => {
  let format = req.params.format || 'html';
  let fulldomain = req.query.domain == 'true';

  if ( format === 'json' ) {

    res.set('content-type', 'application/json');
    res.status(200).end(  JSON.stringify( M3U_PERSONAL )  );

  } else if ( format.indexOf('m3u') === 0 ) {

    let resp = respondPersonalM3U(format, fulldomain);
    res.set('content-type', 'application/x-mpegURL');
    res.status(200).end( resp );

  } else {
    // html or other format
    res.render('m3u/manager', {M3UList, Channels: EPG.GroupedChannels});
  }

});


function saveM3uPersonal(data) {
  Log.info('Saving new personal M3U data');
  M3U_PERSONAL = data;
  FS.writeFileSync(PERSONAL_FILE, JSON.stringify(data, null, 2), {encoding: 'utf-8'} );
  Log.info('Correctly saved!');
}


Router.post('/personal', (req, res, next) => {
  saveM3uPersonal( req.body );

  res.status(201).end('Salvataggio effettuato');
});

Router.delete('/personal', (req, res, next) => {
  M3U_PERSONAL = {};
  saveM3uPersonal( M3U_PERSONAL )
  res.status(201).end();
});

Router.get('/search.:format', (req, res, next) => {

  const format = req.params.format || 'm3u'
  const query = req.query.q || '';
  const result = {};
  for ( let group of M3UList.groups ) {
    for( let chl of group.channels ) {
      if ( chl.Name.toLowerCase().indexOf( query.toLowerCase() ) > -1  ) {
        const chls = result[ group.Id ] || (result[ group.Id ] = []);
        chls.push( chl );
      }
    }
  }

  let res_result = null;
  const keys = Object.keys(result);
  switch(format) {
    case 'json':
      res.set('content-type', 'application/json');
      for( let k of keys ) {
        result[ k ] = result[ k ].map( chl => chl.toJson() );
      }
      res_result = JSON.stringify(result);
      break;
    default:
      let m3u_res = [];
      res.set('content-type', 'application/x-mpegURL');
      for( let k of keys ) {
        m3u_res = m3u_res.concat( result[ k ].map( (chl) => {
          return chl.toM3U()
        }) );
      }
      res_result = ['#EXTM3U', m3u_res.join('\n')].join('\n');
  }

  res.status(200).end( res_result );
});


function info() {

  console.log('## M3U router mounted');
  console.log(` - GET ${MOUNTH_PATH}/update`);
  console.log(`     Updates M3U list from ${Config.M3U.Url}`);
  console.log(` - GET ${MOUNTH_PATH}/live/:channel_id`);
  console.log(`     Redirects to the url of the channel by its ID`);
  console.log(` - ${MOUNTH_PATH}/list/:group_id.:format?`);
  console.log(`     Responds all channels by given group_id. format can be one of 'm3u', 'json'`);
  console.log(` - ${MOUNTH_PATH}/list.:format?`);
  console.log(`     Responds entire list of channels. format can be one of 'm3u', 'json'. You can specify groups passing '?groups=group_id,group_id' as query string`);
  console.log(` - ${MOUNTH_PATH}/groups.:format?`);
  console.log(`     Responds all groups details. format can be one of 'm3u', 'json'`);

};


function updateSettings(config) {

  DOMAIN_URL = `http://${config.LocalIp}:${config.Port}`;
  if ( Config.M3U.UseFullDomain ) {
    M3UList._baseUrl = `${DOMAIN_URL}${MOUNTH_PATH}`;
  } else {
    M3UList._baseUrl = MOUNTH_PATH;
  }

}


module.exports = {Router, MountPath: MOUNTH_PATH, respondStreamUrl, respondSingleGroup, respondList, respondAllGroups, refreshM3U, parseCommand, info, updateSettings, fileWatcher};
