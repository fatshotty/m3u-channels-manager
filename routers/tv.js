const Path = require("path")
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Utils = require('../utils');
const Request = Utils.request;
const M3UK = require('../modules/m3u').M3U;
const FtpServer = require('../ftpserver');
// const WebdavServer = require('../webdav-server');
// const ChannelList = require('../mocks/channels.json');
const Service = require('../services/merger');
const CacheRouter = require('./cache_router');

const Chokidar = require('chokidar');

const PERSONAL_FILE_SUFFIX = '_personal.json';

const EPG = require('../modules/epg');

const Log = Utils.Log;

const MOUNTH_PATH = '/tv';
let DOMAIN_URL = `${process.env.PROXY_PROTOCOL || 'http'}://${Config.LocalIp}`; // `:${Config.Port}`;

const CHANNELS_LIST_FILE = Path.join( Config.Path , 'channels_list.json' );

let M3UList = [];


let WatchTimer = null;
let Watcher = FS.watch(Argv.config, 'utf-8', (eventType, filename) => {
  Log.debug('Config file watcher triggered');
  if ( eventType == 'change' ) {
    clearTimeout(WatchTimer);
    WatchTimer = setTimeout( () => {
      Log.info('--- config file has been changed - M3U');


      // fix M3UList
      Config.M3U.forEach( (m3uConfig) => {
        let m3u = M3UList.find(m => m3uConfig.Name == m.Name);
        if ( !m3u ) {
          m3u = new M3UK( m3uConfig.Name, `${DOMAIN_URL}${MOUNTH_PATH}/${m3uConfig.Name}/live`, m3uConfig.RewriteUrl );
          M3UList.push( m3u );
        }
        m3u._rewriteUrl = m3uConfig.RewriteUrl;
      });


      settingUpFTP()


      fileWatcher();

      // const mod_keys = Object.keys( Modules );
      // for ( let mod_k of mod_keys ) {
      //   const mod = Modules[ mod_k ];
      //   mod.updateSettings && mod.updateSettings( Config );
      // }

    }, 2000);
  }
});

process.on('exit', () => {
  if ( Watcher ) {
    Watcher.close();
    clearTimeout(WatchTimer);
  }
  if (WatcherM3UFiles) {
    WatcherM3UFiles.close();
  }
});


let WatcherM3UFiles = null;
let WatcherM3uFilesCallbacks = [];
let WatcherM3uFilesSkipAdd = {};

async function fileWatcher() {

  const isPersonalFile = (path) => {
    return Path.basename(path).endsWith( PERSONAL_FILE_SUFFIX );
  }

  if (WatcherM3UFiles) {
    WatcherM3UFiles.close();
  }
  if ( Config.M3U.length > 0 ) {
    let files = Config.M3U.map(m => Path.resolve( Path.join( Config.Path , `${m.UUID}.txt` ) ) );
    files = files.concat(Config.M3U.map(m => Path.resolve( Path.join( Config.Path , `${m.UUID}${PERSONAL_FILE_SUFFIX}` ) ) ))
    WatcherM3UFiles = Chokidar.watch( files, {
      persistent: true
    });

    let timerReady;
    let timerRaw, timerAdd = {}, timerChange = {};
    WatcherM3UFiles.on('ready', (args) => {
      clearTimeout(timerReady);
      timerReady = setTimeout(() => {
        WatcherM3UFiles
          .on('raw', (event, path, details) => {
            let fullpath = Path.resolve( Path.join( Config.Path , path ) );
            Log.debug(`watched event: ${event}, ${path}, ${FS.existsSync(fullpath) ? '' : ' -> deleted'}`);
            console.log(`watched event: ${event}, ${path}`, FS.existsSync(fullpath) ? '' : ' -> deleted');
            clearTimeout(timerRaw)
            timerRaw = setTimeout(() => {
              while(WatcherM3uFilesCallbacks.length){
                setTimeout(WatcherM3uFilesCallbacks.shift(), 1000);
              }
            }, 250);
          })
          .on('add', (path) => {
            clearTimeout(timerAdd[path]);
            timerAdd[path] = setTimeout(() => {
              Log.debug(`file seems to be added: ${path}`);
              if ( ! WatcherM3uFilesSkipAdd[path] ) {
                Log.info(`parse cache file after added: ${path}`);
                isPersonalFile(path) ? loadPersonalM3UFile(path, true) : loadNewM3UFile(path, false);
              }
              delete WatcherM3uFilesSkipAdd[path];
            }, 250)
          })
          .on('change', (path) => {
            clearTimeout(timerChange[path]);
            timerChange[path] = setTimeout(() => {
              Log.info(`parse cache file after changed: ${path}`);
              isPersonalFile(path) ? loadPersonalM3UFile(path, true) : loadNewM3UFile(path, true);
            }, 250);
          });
      }, 1000);
    });

  }
}

fileWatcher();

async function loadNewM3UFile(path, force) {
  path = Path.resolve(path);
  let basename = Path.basename(path, Path.extname(path));

  let m3uConfig = Config.M3U.find(m => m.UUID === basename);
  if ( !m3uConfig ) {
    Log.error(`no m3u config found for ${basename}`);
    return;
  }
  let m3u = M3UList.find(m => m.Name === m3uConfig.Name);
  if ( !m3u ) {
    m3u = new M3UK( m3uConfig.Name, `${DOMAIN_URL}${MOUNTH_PATH}/${m3uConfig.Name}/live`, m3uConfig.RewriteUrl );
    M3UList.push(m3u);
  }

  Log.info(`loading m3u for channels and groups: ${m3uConfig.Name}`)

  // invalidate cache
  CacheRouter.invalidateSimple(m3u.Name);
  CacheRouter.invalidateSimple('all');

  m3u._rewriteUrl = m3uConfig.RewriteUrl;

  m3u.clear();
  await m3u.loadFromFile(path);
  m3u.removeGroups( m3u.ExcludeGroups );

  // load personal
  m3u.Personal =  await loadPersonalM3UFile( Path.join( Path.resolve(Config.Path) , `${basename}${PERSONAL_FILE_SUFFIX}` ) );

  Log.info(`m3u LOADED: ${m3uConfig.Name}`);

  // let personalPath = Path.join(  );
  // if ( FS.existsSync(personalPath) ) {
  //   let personalData = FS.readFileSync(personalPath, {encoding: 'utf-8'});
  //   try {
  //     personalData = JSON.parse(personalData);
  //   } catch(e) {
  //     personalData = {};
  //     Log.error(`Cannot parse 'personal' list`, e);
  //   }
  //   m3u.Personal = personalData;
  // }

}


async function loadPersonalM3UFile(path, forceSave) {
  path = Path.resolve(path);
  let basename = Path.basename(path, PERSONAL_FILE_SUFFIX);
  let personalData = {};

  let m3uConfig = Config.M3U.find(m => m.UUID == basename);
  if ( m3uConfig ) {
    let m3u = M3UList.find(m => m3uConfig.Name == m.Name);
    if ( m3u ) {
      if ( ! FS.existsSync(path) ) {
        FS.writeFileSync(path, JSON.stringify([], null, 2), {encoding: 'utf-8'});
      }
      personalData = FS.readFileSync(path, {encoding: 'utf-8'});
      try {
        personalData = JSON.parse(personalData);
      } catch(e) {
        Log.error(`Cannot parse 'personal' list`, e);
      }
      if ( forceSave ) {
        // used in case of "watching file changes"
        m3u.Personal = personalData;
        // invalidate cache
        CacheRouter.invalidateSimple(m3u.Name);
      }
    }
  }

  return personalData;
}


// load all m3us file
async function loadM3Us() {
  M3UList = [];
  let M3Us = Config.M3U;
  for ( let m3u of M3Us ) {

    Log.info(`start loading m3u file: ${m3u.Name} (${m3u.UUID})`);

    // let M3U = new M3UK( m3u.Name, `${DOMAIN_URL}${MOUNTH_PATH}/${m3u.Name}/live` );

    const M3U_CACHE_FILE = Path.resolve( Path.join( Config.Path , `${m3u.UUID}.txt` ) );

    if ( FS.existsSync(M3U_CACHE_FILE) ) {

      // await M3U.loadFromFile(M3U_CACHE_FILE);
      // M3U.removeGroups( m3u.ExcludeGroups );
      loadNewM3UFile(M3U_CACHE_FILE, false);

    } else {
      Log.warn(`no cache file for list ${m3u.Name}, file: ${M3U_CACHE_FILE}`);

      // create a placeholder at startup
      let M3U = new M3UK( m3u.Name, `${DOMAIN_URL}${MOUNTH_PATH}/${m3u.Name}/live`,  m3u.RewriteUrl );
      M3UList.push(M3U);
    }

  }
}

loadM3Us();


function refreshM3U(m3u) {

  return new Promise( (resolve, reject) => {

    if ( ! m3u.Url ) {
      Log.error(`No M3U path specified for ${m3u.Name}`);
      return reject(`No M3U path specified for ${m3u.Name}`);
    }
    const M3U_CACHE_FILE = Path.resolve( Path.join( Config.Path , `${m3u.UUID}.txt` ) );
    if ( (`${m3u.Url}`).indexOf('http') == 0 ) {
      Log.info(`Refreshing M3U list from remote url: ${m3u.Name} (${m3u.UUID})`);
      Log.debug(`remote url: ${m3u.Url}`);
      Request(m3u.Url, {'User-Agent': m3u.Url.UserAgent || 'kodi'}, (err, body) => {
        if ( !err ) {
          // M3U_LIST_STRING = body;
          // M3UList.clear();
          // loadM3U();
          Log.info(`write cache file: ${M3U_CACHE_FILE}`)
          FS.writeFileSync(M3U_CACHE_FILE, body, {encoding: 'utf-8'});
          Log.info('M3U file correctly cached');
          return resolve(`${m3u.Name} - OK`);
        }
        reject(new Error(err));
      })
    } else {
      Log.info(`Refreshing M3U list from local file: ${m3u.Name} (${m3u.UUID})`);
      Log.debug(`local file: ${Config.M3U.Url}`);
      const filedata = FS.readFileSync(m3u.Url, {encoding: 'utf-8'})
      // M3U_LIST_STRING = filedata;
      // M3UList.clear();
      // loadM3U();
      Log.info(`write cache file: ${M3U_CACHE_FILE}`)
      FS.writeFileSync(M3U_CACHE_FILE, filedata, {encoding: 'utf-8'});
      process.nextTick( () => {
        resolve(`${m3u.Name} - OK`);
      });
    }
  });
}


function refreshAllM3Us() {
  let p = []
  for (let m3u of Config.M3U) {
    p.push( refreshM3U(m3u) );
  }
  return Promise.all(p);
}

async function parseCommand(Argv, cb) {

  if ( Argv.refresh ) {

    refreshAllM3Us().then( () => {
      cb('OK');
    }).catch( (e) => {
      cb(e);
    });

  } else {
    Log.error(`NO COMMANDS IMPLEMENTED YET`);
    return;
  }

  // } else if ( Argv.s ) {
  //   respondStreamUrl(Argv.s, Argv.g, (url) => {
  //     cb(url);
  //   });

  // } else if ( Argv.g ) {
  //   cb( respondSingleGroup(Argv.g, Argv.format) )

  // } else if ( Argv.lg ) {
  //   cb( respondAllGroups(Argv.format) )

  // } else if ( Argv.l || Argv.gs ) {
  //   cb( respondList(Argv.gs, Argv.format) )

  // }

}

Router.use('/', (req, res, next) => {

  let old_end = res.end;
  res.end = function(data, encoding, callback) {

    let ts = new Date( Date.now() );
    ts.setMilliseconds(0);

    let usingCache = ( req.CACHE_KEY && res.statusCode < 300 && res.statusCode != 204 && arguments.length > 0 );
    if (usingCache) {
      res.set('last-modified', ts.toUTCString() );
    }

    let ret = old_end.apply(res, arguments);

    if (usingCache && data) {
      CacheRouter.set(req.CACHE_KEY, [ ts.getTime(), res.get('content-type'), data].join('|||') );
    } else {
      Log.info(`Response will not store in cache: ${req.CACHE_KEY} - ${res.statusCode} - ${arguments.length} (${!!data})`)
    }

    return ret;

  };

  next();
});

Router.get('/:list_name/channel-list', (req, res, next) => {
  res.set('content-type', 'application/json');
  res.end( JSON.stringify(ChannelList) );
});


Router.get('/all.json', CacheRouter.get, (req, res, next) => {

  let tags = req.query.tags;
  if ( tags ) {
    tags = tags.split(';').map(t => t.toLowerCase().trim());
  }

  Log.info(`requested all list, total: ${Config.M3U.length}, filter by '${tags}'`);

  // req.CACHE_KEY = CacheRouter.computeKey(req);

  let resp = Config.M3U.filter(m => {
    if (!tags) return true;
    for (let t of tags){
      if ( m.Tags.indexOf(t) > -1 ) {
        return true;
      }
    }
    return false;
  }).map( (m) => {
    return {
      Name: m.Name,
      DisplayName: m.DisplayName,
      UserAgent: m.UserAgent,
      UseForStream: m.UseForStream,
      UseFullDomain: m.UseFullDomain,
      UseDirectLink: m.UseDirectLink,
      Enabled: m.Enabled,
      Tags: m.Tags
    };
  });

  res.set('content-type', 'application/json');
  res.end( JSON.stringify(resp) );

});
Router.get('/all/groups.json', CacheRouter.get, (req, res, next) => {

  let tags = req.query.tags;
  if ( tags ) {
    tags = tags.split(';').map(t => t.toLowerCase().trim());
  }

  Log.info(`requested all list with groups, total: ${Config.M3U.length}, filter by '${tags}'`);

  // req.CACHE_KEY = CacheRouter.computeKey(req);

  let resp = Config.M3U.filter(m => {
    if (!tags) return true;
    for (let t of tags){
      if ( m.Tags.indexOf(t) > -1 ) {
        return true;
      }
    }
    return false;
  }).map( (m) => {
    let m3u = M3UList.find(n => n.Name === m.Name);
    return {
      Name: m.Name,
      DisplayName: m.DisplayName,
      UserAgent: m.UserAgent,
      UseForStream: m.UseForStream,
      UseFullDomain: m.UseFullDomain,
      UseDirectLink: m.UseDirectLink,
      Enabled: m.Enabled,
      Groups: m3u ? m3u.groups.map(g => ({Id: g.Id, Name: g.Name, Count: g.channels.length})) : [],
      Tags: m.Tags
    };
  });

  res.set('content-type', 'application/json');
  res.end( JSON.stringify(resp) );

});


// Router.use('/all/groups/merge.:format?', CacheRouter.get);


Router.get('/all/groups/merge.:format?', CacheRouter.get, (req, res, next) => {

  const format = req.params.format || 'json';
  let tags = req.query.tags;
  if ( tags ) {
    tags = tags.split(';').map(t => t.toLowerCase().trim());
  }

  Log.info(`requested a merge for ${format} - ${JSON.stringify(req.query)} filter by '${tags}'`);

  let configM3Us = Config.M3U.filter(m => {
    if (!tags) return true;
    for (let t of tags){
      if ( m.Tags.indexOf(t) > -1 ) {
        return true;
      }
    }
    return false;
  });

  let m3us = M3UList.filter(
    (m) => !!configM3Us.find( (_m) => _m.Name == m.Name && (_m.Enabled || req.IS_ADMIN) )
    ).map(m => ({m3u: m, g: req.query[m.Name]})).filter(s => !!s.g).map((s) => {
      let groups = Array.isArray(s.g) ? s.g : s.g.split(',');
      return {m3u: s.m3u, g: s.m3u.groups.filter(g => groups.indexOf('*') > -1 || groups.indexOf(g.Id) > -1) };   //    groups.filter(g => !!s.m3u.getGroupById( g ))}
    }).filter(s => s.g.length > 0);

  const execute = () => {
    if (format.indexOf('m3u') == 0 ) {
      res.set('content-type', 'application/x-mpegURL');
      let chls = [];
      for ( let m3u of m3us ) {
        Log.info(`produce m3u for ${m3u.m3u.Name} and ${m3u.g.length}`);
        // for( let g of m3u.g ){
          m3u.g.forEach(g => chls.splice(chls.length, 0, ...g.channels.slice(0).map(c => {
            let m3uConfig = Config.M3U.find(m => m.Name === m3u.m3u.Name);
            let direct = m3uConfig.UseDirectLink;
            if ( 'direct' in req.query ){
              direct = req.query.direct == 'true';
            }
            if ( 'rewrite' in req.query && req.query.rewrite == 'true' && m3u.m3u._rewriteUrl){
              c._rewrite = m3u.m3u._rewriteUrl;
              direct = false;
            }
            c._direct = direct;
            c._m3uName = m3u.m3u.Name
            return c;
          })));
        // }
      }
      chls.sort( (a, b) => {
        let n_a = parseInt(a.Number || 0, 10);
        let n_b = parseInt(b.Number || 0, 10);
        return n_a > n_b ? 1 : -1;
      });

      Log.info(`total channels: ${chls.length}`);

      return chls.map( (c, i) => {
        let nc = c.clone();
        if ( c._rewrite ) {
          nc.Redirect = Utils.rewriteChannelUrl(c._rewrite, nc, c._m3uName);
          c._direct = false;
        }
        return nc.toM3U(i == 0, c._direct)
      }).join('\n');

    } else {
      res.set('content-type', 'application/json');
      const response = {};
      for ( let m3u of m3us ) {
        Log.info(`produce m3u for ${m3u.m3u.Name} and ${m3u.g.length}`);
        response[ m3u.m3u.Name ] = m3u.g;
      }
      return JSON.stringify( response );
    }
  }

  res.end( execute() );

});



Router.use('/:list_name/*.:format?', (req, res, next) => {

  if (req.method == 'GET' ) {
    Log.debug(`ROUTER FOR CACHE`, req.params )
    return CacheRouter.get(req, res, next);
  }
  next();
});


Router.param('format', (req, res, next, value) => {
  req.params.format = value || 'json';
  next();
});


Router.param('list_name', (req, res, next, value) => {
  req.M3U = M3UList.find(m => m.Name === value);
  if ( !req.M3U ) {
    next(`invalid listname ${value}`);
    return;
  }

  req.M3UConfig = Config.M3U.find(m => m.Name === value);
  if ( !req.M3UConfig ) {
    next(`invalid m3u config name`);
    return;
  }
  next();
});



Router.get('/:list_name/', (req, res, next) => {
  res.render('m3u/index', {M3U: req.M3U});
});



Router.get('/:list_name/update', async (req, res, next) => {

  if ( Argv.ro ) {
    return next(`Cannot perform action`);
  }

  Log.info(`Updating m3u list ${req.M3U.Name}...`);
  Log.debug(`...from ${req.M3U.Url}`);

  const M3U_CACHE_FILE = Path.resolve( Path.join( Config.Path , `${req.M3UConfig.UUID}.txt` ) );

  if ( WatcherM3UFiles ) {
    await WatcherM3UFiles.unwatch(M3U_CACHE_FILE);
    WatcherM3uFilesCallbacks.push( async () => {
      WatcherM3uFilesSkipAdd[M3U_CACHE_FILE] = true;
      WatcherM3UFiles.add(M3U_CACHE_FILE);
    })
  }

  try {
    await refreshM3U(req.M3UConfig);
  } catch(e) {
    Log.error(e);
    return next(e);
  }

  req.M3U.clear();
  await req.M3U.loadFromFile(M3U_CACHE_FILE);
  req.M3U.removeGroups( req.M3U.ExcludeGroups );

  res.status(204);
  res.end();
  next();
}, CacheRouter.invalidate);


function respondAllGroups(format, M3U) {
  let link = `/${M3U.Name}/list`;
  if ( M3U.UseFullDomain ) {
    link = `${DOMAIN_URL}${MOUNTH_PATH}${link}`;
  }

  switch (format) {
    case 'json':
      const resultjson = M3U.groups.map( (g) => {
        return {id: g.Id, name: g.Name, count: g.channels.length}
      });
      return JSON.stringify(resultjson);
      break;
    case 'xml':
      return Utils.createXMLKodiLive( M3U.groups, `${DOMAIN_URL}${MOUNTH_PATH}/${M3U.Name}/list` ).toString();
      break;
    default:
      const resultm3u = M3U.groups.map( (g) => {
        return [`#EXTINF:0, ${g.Name}`, `${link}/${g.Id}.m3u8`].join('\n');
      });
      resultm3u.unshift('#EXTM3U');
      return resultm3u.join('\n')
  }
}

Router.get('/:list_name/groups.:format?', (req, res, next) => {

  const format = req.params.format;
  Log.info(`List all groups with ${format || 'm3u'} for ${req.M3U.Name}`);

  const response = respondAllGroups(format, req.M3U);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    case 'xml':
      res.set('content-type', 'application/xml');
      break;
    default:
      if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
        Log.warn(`'${req.M3UConfig.Name}' list is not enabled`);
        return res.status(409).end('list is not enabled');
      }
      res.set('content-type', 'application/x-mpegURL');
  }

  res.status(200).end( response );

});



function respondSingleGroup(M3U, groupId, format, direct, rewrite) {

  const group = M3U.getGroupById( groupId );

  if ( ! group ) {
    Log.error('No group found by id', groupId);
    return null;
  }

  switch (format) {
    case 'json':
      return JSON.stringify(group.toJson());
    default:
      let chls = group.channels.slice(0);
      chls.sort( (a, b) => {
        let n_a = parseInt(a.Number || 0, 10);
        let n_b = parseInt(b.Number || 0, 10);
        return n_a > n_b ? 1 : -1;
      });

      return chls.map( (c, i) => {
        let nc = c.clone();
        if ( rewrite ) {
          nc.Redirect = Utils.rewriteChannelUrl(M3U._rewriteUrl, nc, M3U.Name);
          direct = false;
        }
        return nc.toM3U(i == 0, direct);
      }).join('\n');
  }
}


Router.get('/:list_name/list/:group.:format?', (req, res, next) => {
  const format = req.params.format || 'm3u';
  Log.info(`Requested list by group ${req.params.group}. Respond with ${format} for ${req.M3U.Name}`);

  let direct = req.M3UConfig.UseDirectLink;
  if ( 'direct' in req.query ){
    direct = req.query.direct == 'true';
  }

  let rewrite = false;
  if ( 'rewrite' in req.query && req.query.rewrite == 'true' && req.M3UConfig.RewriteUrl) {
    rewrite = req.M3UConfig.RewriteUrl;
  }

  const response = respondSingleGroup( req.M3U, req.params.group, format, direct, rewrite );

  if ( ! response ) {
    res.status(404).end( 'No group found by ' + req.params.group);
    return;
  }

  res.status(200);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    default:
      if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
        Log.warn(`'${req.M3UConfig.Name}' list is not enabled`);
        return res.status(409).end('list is not enabled');
      }
      res.set('content-type', 'application/x-mpegURL');
      break;
  }
  res.end( response );
})



function respondSingleChannelInGroup(M3U, groupId, chl, format, direct, rewrite) {

  const channel = M3U.getChannelById( chl, groupId );

  if ( ! channel ) {
    Log.error('No channel found by id', chl, 'in', groupId);
    return null;
  }

  switch (format) {
    case 'json':
      return JSON.stringify(channel.toJson());
    default:
      let nc = channel.clone();
      if ( rewrite ) {
        nc.Redirect = Utils.rewriteChannelUrl(M3U._rewriteUrl, nc, M3U.Name);
        direct = false;
      }
      return nc.toM3U(true, direct);
  }
}



Router.get('/:list_name/list/:group/:channel.:format?', (req, res, next) => {
  const format = req.params.format || 'json';
  Log.info(`Requested channel '${req.params.channel}' in group '${req.params.group}'. Respond with ${format} for ${req.M3U.Name}`);

  let direct = req.M3UConfig.UseDirectLink;
  if ( 'direct' in req.query ){
    direct = req.query.direct == 'true';
  }

  let rewrite = false;
  if ( 'rewrite' in req.query && req.query.rewrite == 'true' && req.M3UConfig.RewriteUrl) {
    rewrite = req.M3UConfig.RewriteUrl;
  }

  const response = respondSingleChannelInGroup( req.M3U, req.params.group, req.params.channel, format, direct, rewrite );

  if ( ! response ) {
    res.status(404).end( 'No channel found by ' + req.params.channel);
    return;
  }

  res.status(200);

  switch (format) {
    case 'json':
      res.set('content-type', 'application/json');
      break;
    default:
      if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
        Log.warn(`'${req.M3UConfig.Name}' list is not enabled`);
        return res.status(409).end('list is not enabled');
      }
      res.set('content-type', 'application/x-mpegURL');
      break;
  }
  res.end( response );
})



Router.get('/:list_name/search.:format', (req, res, next) => {

  const format = req.params.format || 'm3u'
  const query = req.query.q || '';

  let direct = req.M3UConfig.UseDirectLink;
  if ( 'direct' in req.query ){
    direct = req.query.direct == 'true';
  }

  Log.info(`Search channel ${query} in ${format} for ${req.M3U.Name}`);

  const result = {};
  for ( let group of req.M3U.groups ) {
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

      if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
        Log.warn(`'${req.M3UConfig.Name}' list is not enabled`);
        return res.status(409).end('list is not enabled');
      }

      let rewrite = false;
      if ( 'rewrite' in req.query && req.query.rewrite == 'true' && req.M3UConfig.RewriteUrl) {
        rewrite = req.M3UConfig.RewriteUrl;
      }
      let m3u_res = [];
      res.set('content-type', 'application/x-mpegURL');
      for( let k of keys ) {
        m3u_res = m3u_res.concat( result[ k ].map( (chl) => {
          let nc = chl.clone();
          if ( rewrite ) {
            nc.Redirect = Utils.rewriteChannelUrl(req.M3U._rewriteUrl, nc, req.M3U.Name);
            direct = false;
          }
          return nc.toM3U(false, direct);
        }) );
      }
      res_result = ['#EXTM3U', m3u_res.join('\n')].join('\n');
  }

  res.status(200).end( res_result );
});



function respondList(M3U, groups, format, direct, rewrite) {
  let all_groups = M3U.groups;

  if ( groups && groups.length ) {
    const arr = [];
    groups = Array.isArray(groups) ? groups : groups.split(',');
    for ( let g of groups ) {
      const _g = M3U.getGroupById( g );
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
      let chls = [];
      for( let g of all_groups ){
        chls.splice(chls.length, 0, ...g.channels.slice(0) );
      }
      chls.sort( (a, b) => {
        let n_a = parseInt(a.Number || 0, 10);
        let n_b = parseInt(b.Number || 0, 10);
        return n_a > n_b ? 1 : -1;
      });

      return chls.map( (c, i) => {
        let nc = c.clone();
        if ( rewrite ) {
          nc.Redirect = Utils.rewriteChannelUrl(M3U._rewriteUrl, nc, M3U.Name);
          direct = false;
        }
        return nc.toM3U(i == 0, direct)
      }).join('\n');
      // all_groups.map( (g, i) => { return g.toM3U(i === 0, direct) }).join('\n');
  }
}


Router.get('/:list_name/list.:format?', (req, res, next) => {
  const format = req.params.format;
  const groups = req.query.groups;

  if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
    Log.warn(`'${req.M3UConfig.Name}' stream is not enabled`);
    return res.status(422).end('stream is not enabled');
  }

  let direct = req.M3UConfig.UseDirectLink;
  if ( 'direct' in req.query ){
    direct = req.query.direct == 'true';
  }

  Log.info(`Requested entire list. Respond with ${format || 'm3u'} for ${req.M3U.Name}`);
  Log.info(`Filter by ${groups}`);

  let rewrite = false;
  if ( 'rewrite' in req.query && req.query.rewrite == 'true' && req.M3UConfig.RewriteUrl) {
    rewrite = req.M3UConfig.RewriteUrl;
  }

  const response = respondList(req.M3U, groups, format, direct, rewrite);

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



function respondStreamUrl(M3U, chlId, group) {
  return new Promise( (resolve, reject) => {
    Log.info(`Compute the channel stream-url for ${chlId}` )

    if ( !chlId ) {
      Log.error('No channel specified');
      return cb(null);
    }

    const live_channel = M3U.getChannelById( chlId, group );
    if ( live_channel ) {
      Log.info(`found stram url '${live_channel.StreamUrl.split('/').pop()}'` )
      // Utils.computeChannelStreamUrl(live_channel).then( (surl) => {
      //   cb(surl);
      // });
      resolve( live_channel.StreamUrl );

    } else {
      Log.error(`No live streaming found for channel ${chlId}`);
      return reject(`No live streaming found for channel ${chlId}`);
    }
  })
}


async function getStreamUrlOfChannel(M3U, M3UConfig, channel, group) {
  Log.info(`Live streaming requested for ${channel}`);

  if ( !channel ) {
    Log.error('No channel specified');
    throw 'No channel specified';
  }

  let live_channel = await respondStreamUrl( M3U, channel, group);
  Log.debug(`Found live streaming for channel ${channel}`);
  Log.debug(`redirect to ${live_channel}`);

  if ( M3UConfig.UseForStream === true ) {
    Log.info(`adding user-agent to stream url "${M3UConfig.UserAgent}"`);
    live_channel = `${live_channel}|User-Agent=${M3UConfig.UserAgent}`;
  }

  return live_channel;

}


Router.get('/:list_name/live', async (req, res, next) => {

  if ( req.M3UConfig.StreamEnabled !== true && !req.IS_ADMIN ) {
    Log.warn(`'${req.M3UConfig.Name}' stream is not enabled`);
    return res.status(422).end('stream is not enabled');
  }

  let channel = req.query.channel;
  let group = req.query.group;

  try {
    let live_channel = await getStreamUrlOfChannel(req.M3U, req.M3UConfig, channel, group);
    res.redirect(302, live_channel);
  } catch(e) {
    res.status(404).end(e);
  }

});



async function respondPersonalM3U(m3u, m3uConfig, format, fulldomain, direct, rewrite, alllinks) {

  fulldomain = fulldomain || m3uConfig.UseFullDomain;

  let result_channels = [];
  try {
    result_channels = m3u.Personal.filter( ch => ch.enabled );
  } catch(e) {
    Log.error('error while filtering Personal for', m3u.Name, typeof m3u.Personal, e);
  }
  result_channels = result_channels.sort( (ch1, ch2) => Number(ch1.chno) > Number(ch2.chno) ? 1 : -1);
  const compute_channels = [];
  for ( let ch of result_channels ) {

    const streams = ch.streams && (alllinks ? ch.streams : [ch.streams.find(s => s.selected)] );

    for ( let stream of streams ) {

      if ( !stream ) {
        Log.info(`no stream found for channel ${ch.chname}`);
        return;
      }

      let group = m3u.getGroupById( stream.GID );
      if (!group) {
        Log.warn(`no group found by id: ${stream.GID}`);
        return;
      }

      let channel = group.getChannelById(stream.CHID);
      if (!channel) {
        Log.warn(`no channel found by id: ${stream.CHID} in group ${stream.GID}`);
        return;
      }

      let temp_ch = channel.clone();

      temp_ch.__map_to__ = ch.remap;

      if ( ! ch.reuseid ) {
        temp_ch.TvgId = ch.remap;
      }
      temp_ch.TvgName = ch.remap;
      temp_ch.Name = ch.remap;
      temp_ch.Number = ch.chno;

      let temp_redirect = temp_ch.Redirect;

      if ( !alllinks && temp_redirect ) {
        // let url_paths = temp_redirect.split('?');
        // url_paths.shift();
        if ( fulldomain ) {
          temp_redirect = `${DOMAIN_URL}${MOUNTH_PATH}/${m3u.Name}/personal/live?channel=${encodeURIComponent(ch.remap)}`;
        } else {
          temp_redirect = `${MOUNTH_PATH}/${m3u.Name}/personal/live?channel=${encodeURIComponent(ch.remap)}`;
        }

        temp_ch.Redirect = temp_redirect;
      }

      compute_channels.push(temp_ch);
    }

  }
    
  // compute_channels = compute_channels.filter(Boolean);


  // if ( m3u.Personal && Object.keys(m3u.Personal).length ) {
  //   let group_keys = Object.keys(m3u.Personal);

  //   for ( let grp_key of group_keys ) {
  //     let personalChannels = m3u.Personal[ grp_key ];
  //     let group = m3u.getGroupById( grp_key );
  //     if ( group ) {
  //       for ( let personalChannel of personalChannels) {
  //         let personalId = personalChannel.ID;
  //         let channel = group.getChannelById(personalId);
  //         if ( ! channel ) {
  //           Log.warn(`no channel '${personalId}' found in '${grp_key}' (${m3uConfig.Name})`);
  //           continue;
  //         }

  //         let temp_ch = channel.clone();

  //         temp_ch.__map_to__ = personalChannel.MapTo;

  //         if ( ! personalChannel.ReuseID ) {
  //           temp_ch.TvgId = personalChannel.MapTo;
  //         }
  //         temp_ch.TvgName = personalChannel.MapTo;
  //         temp_ch.Name = personalChannel.MapTo;
  //         temp_ch.Number = personalChannel.Number;

  //         let temp_redirect = temp_ch.Redirect;

  //         if ( temp_redirect ) {
  //           // let url_paths = temp_redirect.split('?');
  //           // url_paths.shift();
  //           if ( fulldomain ) {
  //             temp_redirect = `${DOMAIN_URL}${MOUNTH_PATH}/${m3u.Name}/personal/live?channel=${encodeURIComponent(personalChannel.MapTo)}&group=${temp_ch.GroupId}`;
  //           } else {
  //             temp_redirect = `${MOUNTH_PATH}/${m3u.Name}/personal/live?channel=${encodeURIComponent(personalChannel.MapTo)}&group=${temp_ch.GroupId}`;
  //           }

  //           temp_ch.Redirect = temp_redirect;
  //         }

  //         result_channels.push( temp_ch );

  //       }
  //     }
  //   }

  // }


  if ( direct ) {

    for await (let chl of compute_channels) {
      let id = chl.__map_to__;
      let url = await getMappedStreamUrlOfChannel(m3u, m3uConfig, id, chl.GroupId);

      chl.Redirect = url;
    }
  } else if ( rewrite && m3uConfig.RewriteUrl ) {

    for await (let chl of compute_channels) {
      let id = chl.__map_to__;
      // let url = await getMappedStreamUrlOfChannel(m3u, m3uConfig, id, chl.GroupId);
      let url = Utils.rewriteChannelUrl(m3uConfig.RewriteUrl, chl, m3u.Name);
      chl.Redirect = url;
    }

  }


  // result_channels.sort( (a, b) => {
  //   let n_a = parseInt(a.Number || 0, 10);
  //   let n_b = parseInt(b.Number || 0, 10);
  //   return n_a > n_b ? 1 : -1;
  // });

  let resultm3u = compute_channels.map( c => c.toM3U() );

  resultm3u.unshift('#EXTM3U');
  return resultm3u.join('\n');

}


Router.get('/:list_name/personal.:format?', async (req, res, next) => {
  let format = req.params.format || 'html';
  let fulldomain = req.query.domain == 'true';
  let alllinks = req.query.all == 'true';

  if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
    Log.warn(`'${req.M3UConfig.Name}' list is not enabled`);
    return res.status(409).end('list is not enabled');
  }

  let direct = req.M3UConfig.UseDirectLink;
  if ( 'direct' in req.query ){
    direct = req.query.direct == 'true';
  }

  let rewrite = 'rewrite' in req.query && req.query.rewrite == 'true';

  if ( format === 'json' ) {

    res.set('content-type', 'application/json');
    req.M3U.Personal.sort( (ch1, ch2) => ch1.chno > ch2.chno ? 1 : -1 );
    res.status(200).end(  JSON.stringify( req.M3U.Personal )  );

  } else if ( format.indexOf('m3u') === 0 ) {

    try {
      let resp = await respondPersonalM3U(req.M3U, req.M3UConfig, format, fulldomain, direct, rewrite, alllinks);
      res.set('content-type', 'application/x-mpegURL');
      res.status(200).end( resp );
    } catch(e) {
      next(e);
    }

  } else if ( !Argv.ro ) {
    // html or other format
    res.render('m3u/manager2', {M3UList: req.M3U, Channels: EPG.GroupedChannels});
  } else {
    next(`cannot perform action`);
  }

});

Router.get('/:list_name/old/personal.:format?', async (req, res, next) => {
  res.render('m3u/manager', {M3UList: req.M3U, Channels: EPG.GroupedChannels});
});



Router.post('/:list_name/channels', async (req, res, next) => {

  let result = []

  if ( FS.existsSync(CHANNELS_LIST_FILE) ) {
    const data = FS.readFileSync( CHANNELS_LIST_FILE, 'utf-8');
    try {
      result = JSON.parse(data);
    } catch(e) {
      return next(e);
    }

    result = Service.merge(req.M3U.groups, result);

  }

  res.set('content-type', 'application/json');
  res.end( JSON.stringify(result) );
  return;

});



async function getMappedStreamUrlOfChannel(m3u, m3uConfig, req_chl_id) {
  Log.info(`MappedLive streaming requested for '${req_chl_id}'`);
  if ( ! m3u.Personal || ! m3u.Personal.length ) {
    Log.error(`No map found, it must be set from /tv/personal`);
    throw new Error(`No mapped channels have been set`);
  }


  const channel = m3u.Personal.find(ch => ch.remap == req_chl_id && ch.enabled);

  if ( !channel ) {
    Log.error(`no channel found by name: ${req_chl_id} or it is not enabled`);
    throw new Error(`no channel found by name: ${req_chl_id} or it is not enabled`);
  // } else if (!channel.enabled) {
  //   Log.error(`channel ${req_chl_id} is not enabled`);
  //   throw new Error(`channel ${req_chl_id} is not enabled`);
  } else if ( !channel.streams || channel.streams.length <= 0) {
    Log.error(`channel ${req_chl_id} has no streams`);
    throw new Error(`channel ${req_chl_id} has no streams`);
  }

  const stream = channel.streams.find(s => s.selected);

  const chGroup = m3u.getGroupById( stream.GID );

  if ( !chGroup ) {
    Log.error(`no group found by ID: ${stream.GID}`);
    throw new Error(`no group found by ID: ${stream.GID}`);
  }

  const chStream = chGroup.getChannelById( stream.CHID );

  if ( !chStream ) {
    Log.error(`no channel found by ID: ${stream.CHID} in group ${stream.GID}`);
    throw new Error(`no channel found by ID: ${stream.CHID} in group ${stream.GID}`);
  }

  Log.info(`found channels '${chStream.Id}' by '${req_chl_id}' of '${stream.GID}'`);
  return await getStreamUrlOfChannel(m3u, m3uConfig, chStream.Id, stream.GID);

  // let groups_keys = Object.keys(m3u.Personal);

  // if ( group && (group in m3u.Personal) ) {
  //   Log.debug(`Searching map for '${req_chl_id}' in '${group}'`);
  //   groups_keys = [ group ];
  // }


  // for ( let grp_key of groups_keys ) {
  //   Log.debug(`Searcing in group: '${grp_key}'`);
  //   let chls = m3u.Personal[ grp_key ];

  //   for ( let chl of chls ) {
  //     if ( chl.MapTo == req_chl_id ) {
  //       Log.info(`found channels '${chl.ID}' by '${req_chl_id}' of '${grp_key}'`);
  //       return await getStreamUrlOfChannel(m3u, m3uConfig, chl.ID, grp_key);
  //     }
  //   }
  // }

  // throw `No channel found searching for '${req_chl_id}' in '${group}'`;
}


Router.get('/:list_name/personal/live', async (req, res, next) => {

  if ( req.M3UConfig.Enabled !== true && !req.IS_ADMIN ) {
    Log.warn(`'${req.M3UConfig.Name}' stream is not enabled`);
    return res.status(422).end('stream is not enabled');
  }

  let channel = req.query.channel;
  let group = req.query.group;
  let pipe = !!req.query.p;

  try {
    let live_channel = await getMappedStreamUrlOfChannel(req.M3U, req.M3UConfig, channel);

    if ( ! pipe ) {
      res.redirect(302, live_channel);
    } else {
      res.status(503).end(`Piping is not implemented yet`);
    }
  } catch(e) {
    Log.error(`No channel found for ${channel}`);
    res.status(404).end(e);
  }

});


async function saveM3uPersonal(m3u, m3uConfig, data) {
  Log.info('Saving new personal M3U data');
  let path = Path.resolve( Path.join(Config.Path, `${m3uConfig.UUID}${PERSONAL_FILE_SUFFIX}`) );


  if ( WatcherM3UFiles ) {
    await WatcherM3UFiles.unwatch(path);
    WatcherM3uFilesCallbacks.push( async () => {
      WatcherM3uFilesSkipAdd[path] = true;
      WatcherM3UFiles.add(path);
    });
  }


  FS.writeFileSync( path, JSON.stringify(data, null, 2), {encoding: 'utf-8'} );
  m3u.Personal = await loadPersonalM3UFile(path, true);

  Log.info('Correctly saved!');
}


Router.post('/:list_name/personal', async (req, res, next) => {
  await saveM3uPersonal( req.M3U, req.M3UConfig, req.body );

  res.status(201).end('Salvataggio effettuato');
});

Router.post('/:list_name/old/personal', async (req, res, next) => {
  // console.log( JSON.stringify(req.body, null, 2) );
  // await saveM3uPersonal( req.M3U, req.M3UConfig, req.body );

  let Personal = req.M3U.Personal;

  if ( !Personal || Personal.length <= 0 ) {

    Log.info('no Personal found for', req.M3UConfig.Name);

    if ( FS.existsSync(CHANNELS_LIST_FILE) ) {
      Log.info('load default channels list');

      const data = FS.readFileSync( CHANNELS_LIST_FILE, 'utf-8');
      try {
        Personal = JSON.parse(data);
      } catch(e) {
        return next(e);
      }

    } else {
      Log.warn('No channel list found');
    }
  }


  const newPersonal = req.body;

  for ( let newCh of newPersonal ) {

    let oldCh = Personal.find(ch => ch.remap === newCh.remap );

    if ( !oldCh ) {
      Personal.push(newCh);
    } else {

      oldCh.chno = newCh.chno;
      oldCh.enabled = newCh.enabled;

      const newStrm = newCh.streams[0];

      let foundStrm = false;

      for (let oldStrm of oldCh.streams ) {

        if ( oldStrm.GID === newStrm.GID && oldStrm.CHID === newStrm.CHID ) {
          oldStrm.selected = true;
          foundStrm = true;
        } else {
          oldStrm.selected = false;
        }

      }

      if ( !foundStrm ) {
        oldCh.streams.push(newStrm);
      }

    }


  }

  await saveM3uPersonal( req.M3U, req.M3UConfig, Personal );

  res.status(201).end('Salvataggio effettuato');
});


function info() {

  console.log('## M3U router mounted');
  console.log(` - GET ${MOUNTH_PATH}/{listName}/update`);
  console.log(`     Updates M3U list from ${Config.M3U.Url}`);
  console.log(` - GET ${MOUNTH_PATH}/{listName}/live/:channel_id`);
  console.log(`     Redirects to the url of the channel by its ID`);
  console.log(` - ${MOUNTH_PATH}/{listName}/list/:group_id.:format?`);
  console.log(`     Responds all channels by given group_id. format can be one of 'm3u', 'json'`);
  console.log(` - ${MOUNTH_PATH}/{listName}/list.:format?`);
  console.log(`     Responds entire list of channels. format can be one of 'm3u', 'json'. You can specify groups passing '?groups=group_id,group_id' as query string`);
  console.log(` - ${MOUNTH_PATH}/{listName}/groups.:format?`);
  console.log(`     Responds all groups details. format can be one of 'm3u', 'json'`);

};


async function settingUpFTP() {

  await FtpServer.stop();

  if ( Config.UseFTP ) {

    FtpServer.setM3UList( () => {
      return M3UList;
    });
    FtpServer.setM3UConfig( () => {
      return Config.M3U;
    });

    FtpServer.setConfig( () => {
      return Config;
    })

    FtpServer.start();
  }
}

settingUpFTP();

function settingUpWebDav() {

  WebdavServer.stop();

  if ( Config.UseWebDav ) {

    WebdavServer.setM3UList( () => {
      return M3UList;
    });
    WebdavServer.setM3UConfig( () => {
      return Config.M3U;
    });

    WebdavServer.setConfig( () => {
      return Config;
    })

    WebdavServer.start();
  }

}

// settingUpWebDav();

module.exports = {
  Router,
  MountPath: MOUNTH_PATH,
  // respondStreamUrl,
  // respondSingleGroup,
  // respondList,
  // respondAllGroups,
  refreshM3U: refreshAllM3Us,
  parseCommand,
  info,
  // updateSettings,
  fileWatcher: () => {}
};
