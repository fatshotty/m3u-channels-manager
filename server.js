require('dotenv').config();
const Utils = require('./utils');
const FS = require('fs');
const Net = require('net');
const Pretty = require('pretty-data').pd;
const Path = require('path')
const Package = require('./package.json');
const Express = require("express");
const Cluster = require('cluster');


let HAS_BASIC_AUTH = global.HAS_BASIC_AUTH = process.env.BASIC_AUTH == "true";


if ( ! FS.existsSync(Argv.config) ) {
  const def_conf = {
    "LogLevel": "info",
    "Log": `${global.CWD}/manager.log`,
    "M3U": {
      "Url": "",
      "ExcludeGroups": [],
      "UserAgent": "VLC",
      "UseForStream": false,
      "UseFullDomain": true
    },
    "Port": 3000,
    "Path": `${global.CWD}/cache`,
    "EPG": {
      "bulk": 2,
      "Sock": ""
    }
  };

  FS.writeFileSync(Argv.config, JSON.stringify( def_conf, null, 2), {encoding: 'utf-8'});
}

let Config = null;

Config = global.Config = JSON.parse( FS.readFileSync( Argv.config, 'utf-8' ) );


Config.Log = Path.resolve(global.CWD, Config.Log);

Utils.setLogLevel(Argv.debug ? 'debug' : undefined);

let Log = Utils.Log;

Log.info('Starting application...');
Log.info(`Referred path  ${global.CWD}`);


if ( ! FS.existsSync(Config.Path) ) {
  Log.info(`create cache folder ${Config.Path}`);
  FS.mkdirSync(Config.Path);
}

const OS = require('os');
const BodyParser = require('body-parser');
const CORS = require('cors')

App.disable('x-powered-by');

App.set('view engine', 'pug');
App.set('views', Path.join(__dirname, '/views') );
App.use( Express.static( `${__dirname}/public`) );
App.use( Express.static(  Path.resolve( global.CWD, 'node_modules/bootstrap/dist/css/') ) );


if ( HAS_BASIC_AUTH ) {
  const BasicAuth = require('express-basic-auth');
  App.use( BasicAuth({challenge: true, users: { [process.env.BASIC_USER]: process.env.BASIC_PWD }}) );
}


App.use( CORS() );
App.use( BodyParser.urlencoded({ extended: false }) );
App.use( BodyParser.json({ extended: false }) );
App.use( Express.urlencoded({ extended: false }) );

App.use( (err, req, res, next) => {
  Log.error(`Error got in request: ${req.originalUrl} ${err}`);
  Log.error( JSON.stringify(err.stack, null, 2) );
  next(err);
})

const Modules = {};
let Server = null;

function loadRouters() {

  if ( Argv.serve ) {
    Server = require('http').createServer(App);
    const IO = require('socket.io')(14432);
    require('./socket-io')(IO, Argv.debug ? 'debug' : undefined);
  }


  if ( Argv.m3u ) {
    Log.debug('loading module M3U...')
    let mod_m3u = require('./routers/m3u');
    Modules[ mod_m3u.MountPath ] = mod_m3u;
    if ( !Argv.serve && !Argv.epg ) {
      mod_m3u.parseCommand(Argv, (resp) => {
        console.log( resp );
      });
    }
  }
  if ( Argv.epg ) {
    Log.debug('loading module EPG...')
    let mod_epg = require('./routers/epg');
    Modules[ mod_epg.MountPath ] = mod_epg;
    if ( !Argv.serve && !Argv.m3u ) {
      mod_epg.parseCommand(Argv, (resp) => {
        if ( Argv.beauty ) {
          resp = Pretty.xml( resp );
        }
        if ( Argv.sock || Config.EPG.Sock ) {
          const Client = Net.connect( {path: Argv.sock || Config.EPG.Sock }, function () {
            Client.write( resp );
            Client.end();
            Client.unref();
          });
          return;
        }
        console.log( resp );
      });
    }
  }

  Object.assign(App.locals, {Config}, {NAME: Package.name}, {Modules: Object.keys( Modules )});

  App.get('/', (req, res, next) => {
    res.render('home', {RO: Argv.ro});
  });

  // Load routers
  if ( Argv.serve ) {
    Log.debug('loading HTTP module...');
    const r = Object.keys( Modules );
    for( let path of r ) {
      App.use( path,  Modules[path].Router  );
      Modules[path].fileWatcher();
    }
  }
}

if ( !Config.LocalIp) {
  const IFACES = OS.networkInterfaces();

  Object.keys(IFACES).forEach(function (ifname) {
    IFACES[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        return;
      }
      Log.info(`got the local machine ip address ${iface.address}`);
      Config.LocalIp = iface.address;
    });
  });
}

function serveHTTP() {

  let WatchTimer = null;
  let Watcher = FS.watch(Argv.config, 'utf-8', (eventType, filename) => {
    Log.debug('Config file watcher triggered');
    if ( eventType == 'change' ) {
      clearTimeout(WatchTimer);
      WatchTimer = setTimeout( () => {
        Log.info('--- config file has been changed - reloading!')
        Config = global.Config = JSON.parse( FS.readFileSync( Argv.config, 'utf-8' ) );


        const mod_keys = Object.keys( Modules );
        for ( let mod_k of mod_keys ) {
          const mod = Modules[ mod_k ];
          mod.updateSettings && mod.updateSettings( Config );
        }

      }, 1000);
    }
  });

  process.on('exit', () => {
    if ( Watcher ) {
      Watcher.close();
      clearTimeout(WatchTimer);
    }
  });


  if ( !Argv.ro ) {
    App.post('/settings', (req, res, next) => {

      Log.info('updating settings')

      let ip = req.body.ip;
      let port = req.body.port;
      let cache = req.body.cache;
      let url = req.body.url;
      let userAgent = req.body.useragent;
      let useforstream = req.body.useforstream;
      let usefulldomain = req.body.usefulldomain;
      let groups = req.body.groups;
      let bulk = req.body.bulk;
      let loglevel = req.body.loglevel
      let sock = req.body.sock;

      port = parseInt(port);
      bulk = parseInt(bulk);

      if ( isNaN(port) ) {
        port = Config.Port;
      }

      if ( isNaN(bulk) ) {
        bulk = Config.EPG.bulk;
      }

      Config = global.Config = {
        "LogLevel": loglevel || Config.LogLevel,
        "LocalIp": ip,
        "Log": Config.Log,
        "M3U": {
          "Url": url,
          "ExcludeGroups": groups.split(',').map( (g) => {
            return g.trim();
          }),
          "UserAgent": userAgent || 'Kodi',
          "UseForStream": !!useforstream,
          "UseFullDomain": !!usefulldomain
        },
        "Port": Number(port),
        "Path": cache,
        "EPG": {
          "bulk": Number(bulk),
          "Sock": sock
        }
      };

      Object.assign(App.locals, {Config});

      Log.debug(`Settings ${JSON.stringify(Config, null, 2)}`);

      FS.writeFileSync( Argv.config, JSON.stringify(Config, null, 2), {encoding: 'utf-8'} );

      Log.info('updated!')
      setTimeout(() => {
        res.redirect(302, '/')
      }, 1000)
    });
  }


  Server.listen(Config.Port, () => {
    Log.info(`Server listing on port ${Config.Port}`);
  });
}

loadRouters()

if ( Argv.serve ) {
  serveHTTP();
}

//catches uncaught exceptions
process.on('uncaughtException', function(err) {
  Log.error(`** Error: ${err}`);
  console.error('** Error occurred **', err);
});
process.on('unhandledRejection', function(reason, p) {
  Log.error(`** Promise error: ${reason}`);
  console.error('** Promise error **', reason);
});
