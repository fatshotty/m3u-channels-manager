const Utils = require('./utils');
const FS = require('fs');
const Args = require('yargs');
const Net = require('net');
const Pretty = require('pretty-data').pd;
const Path = require('path')
const SemVer = require('semver');
const Package = require('./package.json');

const Express = require("express");
const App = Express();

let Config = null;

global.CWD = Utils.calculatePath(__filename);

App.locals.HAS_UPDATE = false;

require('child_process').exec(`npm view ${Package.name} versions --json`, function(err, stdout, stderr) {
  try {
    const LIST = JSON.parse(stdout);
    const LATEST = LIST.pop();
    App.locals.HAS_UPDATE = SemVer.lt(Package.version, LATEST);
    if ( App.locals.HAS_UPDATE ) {
      console.warn(`Update available, please run \`npm install ${Package.name}\` to upgrade`);
    }
  } catch( e ) {
    if (err) {
      console.warn('- cannot get list of available versions - ', err.message.split('\n').shift());
    }
  }
});


global.Argv = Args
  .option('ro', {
    boolean: true,
    describe: 'enable read-only state'
  })
  .option('config', {
    alias: 'c',
    describe: 'set the configuration file path. It must be a json',
    default: `${global.CWD}/config.json`
  })
  .normalize('config')

  // M3U
  .option('m3u', {
    boolean: true,
    describe: 'enable the m3u module'
  })
    .option('refresh', {
      type: 'boolean',
      describe: 'update the m3u channels list'
    })
    .option('s', {
      type: 'string',
      alias: 'stream-url',
      describe: 'specifies the channel-id to get the stream-url'
    })
    .option('g', {
      type: 'string',
      alias: 'group',
      describe: 'show all channels by given group-id'
    })
    .option('gs', {
      type: 'array',
      alias: 'groups',
      describe: 'show all channels filtered by group-ids'
    })
    .option('l', {
      type: 'boolean',
      alias: 'list',
      describe: 'show entire m3u list'
    })
    .option('lg', {
      type: 'boolean',
      alias: 'list-groups',
      describe: 'show groups only'
    })
    .conflicts('s', ['g', 'l', 'lg', 'gs'])
    .conflicts('g', ['s', 'l', 'lg', 'gs'])
    .conflicts('l', ['g', 's', 'lg', 'gs'])
    .conflicts('lg', ['g', 's', 'l', 'gs'])
    .conflicts('gs', ['g', 's', 'l', 'lg'])
  .group(['m3u', 'refresh', 's', 'g', 'gs', 'l', 'lg'], 'M3U module')

  .option('epg', {
    boolean: true,
    describe: 'enable the EPG module'
  })
    .option('channels', {
      type: 'boolean',
      describe: 'load channels only and save cache file'
    })
    .option('update', {
      type: 'boolean',
      describe: 'update epg by day'
    })
      .option('sock', {
        type: 'string',
        describe: 'specifies the sock file to pipe the EPG'
      })
      .option('beauty', {
        type: 'boolean',
        describe: 'output beautifier'
      })
      .option('today', {
        type: 'string',
        describe: 'spcifies the referrer date expressed in \'YYYYMMDD\' format, default today',
        default: new Date()
      })
      .option('days', {
        type: 'number',
        default: '0',
        describe: 'spcifies the number of days referred to \'today\''
      })
      .option('yest', {
        alias: 'yesterday',
        type: 'boolean',
        default: false,
        describe: 'specifies if load \'yesterday\' or not'
      })

      .option('full', {
        type: 'boolean',
        default: false,
        describe: 'load full EPG details'
      })

      .implies('update', 'today')

    .option('show', {
      type: 'boolean',
      describe: 'show last saved epg. you can specify \'shift\' option'
    })
      .option('shift', {
        type: 'array',
        default: ['0'],
        describe: 'specifies the time-shift expressed in hours'
      })
      .option('cgs', {
        type: 'array',
        alias: 'channel-groups',
        default: [''],
        describe: 'specifies channels groups to use in XMLTV (musica, bambini, news, mondi, cinema, sport, intrattenimento, digitale, primafila, meglio)'
      })
      .option('kltv', {
        type: 'boolean',
        default: false,
        describe: 'write xml following KLTV specifications'
      })


  .group(['epg', 'channels', 'update', 'show', 'cgs', 'today', 'days', 'yest', 'shift'], 'EPG module')

  .option('serve', {
    type: 'boolean',
    describe: 'starts http server'
  })
  .option('format', {
    type: 'string',
    describe: 'specifies the output format. m3u is for m3u only; xml is for epg; json is for both',
    choices: ['json', 'm3u', 'xml']
  })
  .option('d', {
    alias: 'debug',
    default: false,
    type: 'boolean',
    describe: 'Enable debug log. default is \'info\''
  })
  .help()
  // .usage('$0 --serve --epg --m3u', 'starts the HTTP server mounting EPG and M3U modules')

  .epilogue('Specifies at least one module: m3u or epg')

  .argv;


if ( !Argv.m3u && !Argv.epg && !Argv.serve ) {
  Args.showHelp();
} else {
  start();
}

function start() {

  if ( ! FS.existsSync(Argv.config) ) {
    const def_conf = {
      "LogLevel": "info",
      "Log": `${global.CWD}/manager.log`,
      "M3U": {
        "Url": "https://kodilive.eu/iptv/italian.m3u",
        "ExcludeGroups": [],
        "UserAgent": "Kodi"
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

  Config = global.Config = require( Argv.config );

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
  App.use( Express.static('node_modules/bootstrap/dist/css/') );


  App.use( CORS() );
  App.use( BodyParser.urlencoded({ extended: false }) );
  App.use( BodyParser.json({ extended: false }) );
  App.use( Express.urlencoded({ extended: false }) );

  App.use( (req, res, next) => {
    Log.debug(`incoming request: ${req.originalUrl}`)
    next();
  })

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
      const IO = require('socket.io')(Server);
      require('./socket-io')(IO, Argv.debug ? 'debug' : undefined);
    }


    if ( Argv.m3u ) {
      Log.debug('loading module M3U...')
      Modules['/tv'] = require('./routers/m3u');
      if ( !Argv.serve && !Argv.epg ) {
        Modules['/tv'].parseCommand(Argv, (resp) => {
          console.log( resp );
        });
      }
    }
    if ( Argv.epg ) {
      Log.debug('loading module EPG...')
      Modules['/epg'] = require('./routers/epg');
      if ( !Argv.serve && !Argv.m3u ) {
        Modules['/epg'].parseCommand(Argv, (resp) => {
          if ( Argv.beauty ) {
            resp = Pretty.xml( resp )
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
        Modules[path].info(path);
        console.log('');
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

    if ( !Argv.ro ) {
      App.post('/settings', (req, res, next) => {

        Log.info('updating settings')

        let ip = req.body.ip;
        let port = req.body.port;
        let cache = req.body.cache;
        let url = req.body.url;
        let userAgent = req.body.useragent;
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
            "UserAgent": userAgent || 'Kodi'
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

        const mod_keys = Object.keys( Modules );
        for ( let mod_k of mod_keys ) {
          const mod = Modules[ mod_k ];
          mod.updateSettings && mod.updateSettings( Config );
        }

        Log.info('updated!')
        setTimeout(() => {
          res.redirect(302, '/')
        }, 1000)
      });
    }


    Server.listen(Config.Port, () => {
      Log.info(`Server listing on port ${Config.Port}`);
      console.log(`Server listing on port ${Config.Port}`);
    });
  }

  loadRouters()

  if ( Argv.serve ) {
    serveHTTP();
  }

  function exitHandler(options, exitCode) {
    Log.warn('Application exiting...')
    // if (options.cleanup) Log.warn('Application exiting...');
    if (exitCode || exitCode === 0) Log.error(`** Error code ${exitCode}`);
    if (options.exit) process.exit();
  }

  //do something when app is closing
  process.on('exit', exitHandler.bind(null,{cleanup:true}));

  //catches ctrl+c event
  process.on('SIGINT', exitHandler.bind(null, {exit:true}));

  // catches "kill pid" (for example: nodemon restart)
  process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
  process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

  //catches uncaught exceptions
  process.on('uncaughtException', function(err) {
    Log.error(`** Error: ${err}`);
    console.error('** Error occurred **', err);
  });
  process.on('unhandledRejection', function(reason, p) {
    Log.error(`** Promise error: ${reason}`);
    console.error('** Promise error **', reason);
  });

}
