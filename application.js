const FS = require('fs');
const Args = require('yargs');
const Path = require('path');
const SemVer = require('semver');
const Package = require('./package.json');

const Cluster = require('cluster');
const OS = require('os')

const Express = require("express");
const App = Express();


global.App = App;
App.locals.HAS_UPDATE = false;

// require('child_process').exec(`npm view ${Package.name} versions --json`, function(err, stdout, stderr) {
//   try {
//     const LIST = JSON.parse(stdout);
//     const LATEST = LIST.pop();
//     App.locals.HAS_UPDATE = SemVer.lt(Package.version, LATEST);
//     if ( App.locals.HAS_UPDATE ) {
//       Utils.Log.warn(`Update available, please run \`npm install ${Package.name}\` to upgrade`);
//     }
//   } catch( e ) {
//     if (err) {
//       Utils.Log.warn('- cannot get list of available versions - ', err.message.split('\n').shift());
//     }
//   }
// });


global.Argv = Args
  .option('ro', {
    boolean: true,
    describe: 'enable read-only state'
  })
  .option('port', {
    describe: 'set the http port'
  })
  .option('socketport', {
    describe: 'set the http socket-port'
  })
  .option('envfile', {
    describe: 'specify the env file'
  })
  .option('config', {
    alias: 'c',
    describe: 'set the configuration file path. It must be a json',
    default: Path.join(process.cwd(), 'config.json')
  })
  .option('logfilepath', {
    decribe: 'set the termporary logfile',
    default: ''
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

      .option('full', {
        type: 'boolean',
        default: false,
        describe: 'load full EPG details'
      })


    .option('show', {
      type: 'boolean',
      describe: 'show last saved epg. you can specify \'shift\' option'
    })
      .option('shift', {
        type: 'array',
        default: ['0'],
        describe: 'specifies the time-shift expressed in hours'
      })
      .option('association', {
        type: 'string',
        describe: 'spcifies the association while generating XMLTV',
        default: ''
      })


  .group(['epg', 'channels', 'update', 'show', 'shift'], 'EPG module')

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
  .option('fork', {
    alias: 'more process',
    default: false,
    type: 'boolean',
    describe: 'Enable all CPU cores for workers'
  })
  .help()
  // .usage('$0 --serve --epg --m3u', 'starts the HTTP server mounting EPG and M3U modules')

  .epilogue('Specifies at least one module: m3u or epg')
  .argv;



const Constants = require('./constants');

global.CWD = Constants.calculatePath(__filename);

if ( ! FS.existsSync(Argv.config) ) {
  const def_conf = Constants.DEFAULT_CONFIG();

  FS.writeFileSync(Argv.config, JSON.stringify( def_conf, null, 2), {encoding: 'utf-8'});
}


global.Config = require( Argv.config );

if ( Argv.port ) {
  global.Config.Port = Argv.port
}
if ( Argv.socketport ) {
  global.Config.SocketPort = Argv.socketport
}

require('dotenv').config({ path: Path.join(Argv.envfile || Constants.calculatePath(__filename), '.env') });


const Utils = require('./utils');

if ( ! FS.existsSync(Config.Path) ) {
  Utils.Log.info(`create cache folder ${Config.Path}`);
  FS.mkdirSync(Config.Path);
}

if ( !Argv.m3u && !Argv.epg && !Argv.serve ) {
  Args.showHelp();
} else {
  if ( Argv.serve ) {

    if ( Cluster.isMaster && Argv.fork ) {

      if ( Argv.m3u ) {
        require('./routers/tv').info('/tv');
        console.log('');
      }
      if ( Argv.epg ) {
        require('./routers/epg').info('/epg');
      }

      console.log('');

      const CPUs = OS.cpus();
      for (let cpu of CPUs ) {
        Cluster.fork();
      }
      console.log(`Server listing on port ${Config.Port}`);
    } else {

      if ( Argv.m3u ) {
        require('./routers/tv').info('/tv');
        console.log('');
      }
      if ( Argv.epg ) {
        require('./routers/epg').info('/epg');
      }

      console.log('');

      require('./server.js');
      console.log(`Server listing on port ${Config.Port}`);
    }
  } else {
    require('./server.js');
  }
}

function exitHandler(options, exitCode) {
  if (Cluster.isMaster) {
    Utils.Log.warn('Application exiting...')
    // if (options.cleanup) Log.warn('Application exiting...');
    if (exitCode || exitCode === 0) Utils.Log.error(`** Error code ${exitCode}`);
    if (options.exit) process.exit();
  }
}

//do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
