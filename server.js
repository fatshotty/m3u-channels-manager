const Utils = require('./utils');

const FS = require('fs');
const Net = require('net');
const Pretty = require('pretty-data').pd;
const Path = require('path')
const Package = require('./package.json');
const Express = require("express");
const Cluster = require('cluster');


let Config = null;

if ( !global.Config ) {
  global.Config = JSON.parse( FS.readFileSync( Argv.config, 'utf-8' ) );

  if ( Argv.port ) {
    global.Config.Port = Argv.port
  }
  if ( Argv.socketport ) {
    global.Config.SocketPort = Argv.socketport
  }
}

Config = global.Config;

require('dotenv').config({ path: `${Argv.envfile || Utils.calculatePath(__filename)}/.env` });
let HAS_BASIC_AUTH = global.HAS_BASIC_AUTH = process.env.BASIC_AUTH == "true";

Config.Log = Path.resolve(global.CWD, Config.Log);

Utils.setLogLevel(Argv.debug ? 'debug' : undefined);

let Log = Utils.Log;

Log.info('Starting application...');
Log.info(`Referred path  ${global.CWD}`);


const OS = require('os');
const BodyParser = require('body-parser');
const CORS = require('cors')

App.disable('x-powered-by');

App.set('view engine', 'pug');
App.set('views', Path.join(__dirname, '/views') );

App.locals = Object.assign({}, App.locals, {RO: Argv.ro});

App.use( Express.static( `${__dirname}/public`) );
App.use( Express.static(  Path.resolve( global.CWD, 'node_modules/bootstrap/dist/css/') ) );


// if ( HAS_BASIC_AUTH ) {
//   const BasicAuth = require('express-basic-auth');
//   App.use( BasicAuth({challenge: true, users: { [process.env.BASIC_USER]: process.env.BASIC_PWD }}) );
// }

function checkLocalRequest(req) {

  let ip_local = req.connection.localAddress;
  let ip_remot = req.connection.remoteAddress

  Log.info(`local ip is: ${ip_local} - remote ip is: ${ip_remot} - ${JSON.stringify(req.ips)}`);

  if ( ip_local === ip_remot ) {
    return true;
  } else {


    let ip_local_str = ip_local.split('.').slice(0, -2).join('.');
    let ip_remot_str = ip_remot.split('.').slice(0, -2).join('.');

    return ip_local_str === ip_remot_str;
  }
}

App.use( (req, res, next) => {

  let isLocal = checkLocalRequest(req);

  if ( (!isLocal && HAS_BASIC_AUTH) || (HAS_BASIC_AUTH && process.env.BASIC_AUTH_OVERALL == 'true')) {
    const BasicAuth = require('express-basic-auth');
    let fn = BasicAuth({challenge: true, users: { [process.env.BASIC_USER]: process.env.BASIC_PWD }});

    fn( req, res, next);
  } else {
    next();
  }

})


App.use( CORS() );
App.use( BodyParser.urlencoded({ extended: false }) );
App.use( BodyParser.json({ extended: false }) );
App.use( Express.urlencoded({ extended: false }) );

App.use( (err, req, res, next) => {
  Log.error(`Error got in request: ${req.originalUrl} ${err}`);
  Log.error( JSON.stringify(err.stack, null, 2) );
  next(err);
})

if ( Argv.ro ) {
  App.use( (req, res, next) => {
    if ( req.method === 'GET' ) {
      next();
    } else {
      next(`Cannot perform method`);
    }
  })
}

const Modules = {};
let Server = null;

function loadRouters() {

  if ( Argv.serve ) {
    Server = require('http').createServer(App);
    const IO = require('socket.io')(Config.SocketPort || 14432);
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
    res.render('home');
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


      let name = req.body.name;
      let ip = req.body.ip;
      let port = req.body.port;
      let socketPort = req.body.socketPort;
      let cache = req.body.cache;
      let url = req.body.url;
      let userAgent = req.body.useragent;
      let useforstream = req.body.useforstream == "true";
      let usefulldomain = req.body.usefulldomain == "true";
      let usedirectlink = req.body.usedirectlink == "true";
      let tv_enabled = req.body.tvenabled;
      let groups = req.body.groups;
      let bulk = req.body.bulk;
      let loglevel = req.body.loglevel
      let sock = req.body.sock;

      port = parseInt(port);
      socketPort = parseInt(socketPort);

      bulk = parseInt(bulk);

      if ( isNaN(port) ) {
        port = Config.Port;
      }

      if ( isNaN(socketPort) ) {
        socketPort = Config.SocketPort;
      }

      if ( isNaN(bulk) ) {
        bulk = Config.EPG.bulk;
      }

      Config = global.Config = {
        "Name": name || 'personal',
        "LogLevel": loglevel || Config.LogLevel,
        "LocalIp": ip,
        "Log": Config.Log,
        "M3U": {
          "Url": typeof url != 'undefined' ? url : Config.M3U.Url,
          "ExcludeGroups": groups.split(',').map( (g) => {
            return g.trim();
          }),
          "UserAgent": userAgent || 'Kodi',
          "UseForStream": !!useforstream,
          "UseFullDomain": !!usefulldomain,
          "UseDirectLink": !!usedirectlink,
          "Enabled": !!tv_enabled
        },
        "Port": Number(port),
        "SocketPort": Number(socketPort),
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
