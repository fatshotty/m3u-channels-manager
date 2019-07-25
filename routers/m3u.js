const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Request = require('../utils').request;
const M3UK = require('../modules/m3u').M3U;

const Utils = require('../utils');
const Log = Utils.Log;

const M3U_CACHE_FILE = Path.join( Config.Path , 'm3u_cache.txt' );
let M3U_LIST_STRING = '';

const BASE_URL = ['http:/', `${Config.LocalIp}:${Config.Port}`, 'tv'].join('/');

let M3UList = null;
M3UList = new M3UK([BASE_URL, 'live'].join('/'));


if ( FS.existsSync(M3U_CACHE_FILE) ) {
  M3U_LIST_STRING = FS.readFileSync(M3U_CACHE_FILE, {encoding: 'utf-8'});
  loadM3U();
} else {
  refreshM3U();
}

function loadM3U() {
  M3UList.load(M3U_LIST_STRING);
  M3UList.removeGroups( Config.M3U.ExcludeGroups );
}



function parseCommand(Argv, cb) {

    if ( Argv.refresh ) {
      refreshM3U( (err, body) => {
        cb(err || body);
      });

    } else if ( Argv.s ) {
      respondStreamUrl(Argv.s, (url) => {
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



function respondStreamUrl(chlId, cb) {

  Log.info(`Compute the channel stream-url for ${chlId}` )

  if ( !chlId ) {
    Log.error('No channel specified');
    return cb(null);
  }

  const live_channel = M3UList.getChannelById( chlId );
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

  getStreamUrlOfChannel(channel).then( (live_channel) => {

    res.redirect(302, live_channel);

  }, (reason) => {
    res.status(404).end(reason);
  });

});

Router.get('/live/:channel', (req, res, next) => {

  const channel = req.params.channel;

  Log.warn(`you are using a deprecated api. Use '/live?channel=${channel}' instead`);

  getStreamUrlOfChannel(channel).then( (live_channel) => {

    res.redirect(302, live_channel);

  }, (reason) => {
    res.status(404).end(reason);
  });

});


function getStreamUrlOfChannel(channel) {
  Log.info(`Live streaming requested for ${channel}`);

  return new Promise( (resolve, reject) => {
    if ( !channel ) {
      Log.error('No channel specified');
      reject('No channel specified');
      return;
    }

    respondStreamUrl( channel, (live_channel) => {
      if ( live_channel ) {
        Log.debug(`Found live streaming for channel ${channel}`);
        Log.debug(`redirect to ${live_channel}`);
        resolve(live_channel);

      } else {
        reject(`No channel link found under name ${channel}`);
      }
    });
  });

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
  switch (format) {
    case 'json':
      const resultjson = M3UList.groups.map( (g) => {
        return {id: g.Id, name: g.Name, count: g.channels.length}
      });
      return JSON.stringify(resultjson);
      break;
    case 'xml':
       return Utils.createXMLKodiLive( M3UList.groups, `${BASE_URL}/list` ).toString();
      break;
    default:
      const resultm3u = M3UList.groups.map( (g) => {
        return [`#EXTINF:0, ${g.Name}`, `${BASE_URL}/list/${g.Id}.m3u`].join('\n');
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


function info(mountpath) {

  console.log('## M3U router mounted');
  console.log(`- GET ${mountpath}/update`);
  console.log(`Updates M3U list from Config.M3U.Url`);
  console.log(`- GET ${mountpath}/live/:channel_id`);
  console.log(`Redirects to the url of the channel by its ID`);
  console.log(`- ${mountpath}/list/:group_id.:format?`);
  console.log(`Responds all channels by given group_id. format can be one of 'm3u', 'json'`);
  console.log(`- ${Router.mountpath}/list.:format?`);
  console.log(`Responds entire list of channels. format can be one of 'm3u', 'json'. You can specify groups passing '?groups=group_id,group_id' as query string`);
  console.log(`- ${mountpath}/groups.:format?`);
  console.log(`Responds all groups details. format can be one of 'm3u', 'json'`);

};


function updateSettings(config) {
  let burl = ['http:/', `${config.LocalIp}:${config.Port}`, 'tv'].join('/');
  M3UList._baseUrl = [burl, 'live'].join('/');
}


module.exports = {Router, respondStreamUrl, respondSingleGroup, respondList, respondAllGroups, refreshM3U, parseCommand, info, updateSettings};
