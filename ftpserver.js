const {FtpSrv, FileSystem} = require('ftp-srv');
const FTPErrors = require('ftp-srv/src/errors');
const Path = require('path');
const { Readable } = require("stream");
const Utils = require('./utils');

const Log = Utils.Log;

class MyFileSystem extends FileSystem {

  constructor(user) {
    super();
  }

  chdir(path) {
    this.cwd = Path.join(this.cwd, path);
    return this.cwd;
  }

  get(fileName) {

    let parts = this.cwd.split(Path.sep);
    let lastPath = parts.pop();

    Log.info(`[FTP] get ${this.cwd} -> ${fileName} -> ${lastPath || 'tvchannels'}`);

    return {
      name: lastPath || 'tvchannels',
      uid: lastPath || 'tvchannels',
      mtime: Date.now(),
      birthtimeMs: Date.now(),
      size: 1,
      isDirectory: function() {
        return !fileName.endsWith('.strm');
      },
      isFile: function() {
        return fileName.endsWith('.strm');
      }
    };

  }


  get root() {
    return this._root;
  }


  currentDirectory() {
    return this.cwd;
  }


  list(path) {
    return this.loopFolder(false);
  }


  write(fileName, {append = false, start = undefined} = {}) {
    throw new errors.FileSystemError('cannot write');
  }

  read(fileName, {start = undefined} = {}) {
    Log.info(`[FTP] Responding file ${fileName}`);
    let list = this.loopFolder(false);
    let chl = list.find(c => c.name == fileName );
    if ( !chl ) {
      Log.error(`[FTP] Cannot found channel by name ${chl.name}`);
      throw new FTPErrors.FileSystemError(`Cannot read channel ${fileName}`);
    }
    Log.info( `[FTP] Found streamUrl for ${chl.name} -> ${chl.link}`);
    return Readable.from([chl.link]);
  }

  delete(path) {
    throw new errors.FileSystemError('Cannot delete');
  }

  mkdir(path) {
    throw new errors.FileSystemError('Cannot create directory');
  }

  rename(from, to) {
    throw new errors.FileSystemError('Cannot rename');
  }

  chmod(path, mode) {
    throw new errors.FileSystemError('Cannot change permission');
  }

  getUniqueName() {
    Log.info('[FTP] get uniqe');
    return Date.now(); // uuid.v4().replace(/\W/g, '');
  }


  loopFolder(single) {

    Log.info(`[FTP] Listing ${this.cwd}`);

    let currentPath = this.cwd;
    if ( currentPath == '/' ) {
      currentPath = '';
    }

    let parts = currentPath.split( Path.sep );

    let resObj = [];
    let currList = null;

    let steps = ['lists', 'groups', 'channels'];
    for (let i = 0, part; i < parts.length; i++) {
      let part = parts[i];

      let step = steps[ i ];
      switch( step ) {

        case 'lists':
          Log.debug(`[FTP] compute lists`);
          resObj = remapLists();
          break;
        case 'groups':
          currList = Ftp.M3U().find(m => m.Name == part );
          Log.debug(`[FTP] compute groups for ${currList}`);
          resObj = remapGroups( currList );
          break;
        case 'channels':
          let grp = currList.groups.find( g => g.Id == part );
          Log.debug(`[FTP] compute channels for ${grp}`);
          resObj = remapChannels( grp );
          break;

      }

    }

    Log.info(`[FTP] Respond ${single ? 'first result' : resObj.length + ' items'}`);
    return single ? resObj[0] : resObj;
  }


}


function remapLists() {
  return Ftp.M3U().map( (m) => {
    let m3uc = Ftp.M3UConfig().find( c => c.Name == m.Name );
    return {
      name: m.Name,
      uid: m3uc.UUID,
      mtime: Date.now(),
      birthtimeMs: Date.now(),
      size: 0,
      isDirectory: function() {
        return true;
      },
      isFile: function() {
        return false;
      }
    };
  })
}

function remapGroups(m3u) {
  return m3u.groups.map( g => {
    return {
      name: g.Name,
      uid: g.Id,
      mtime: Date.now(),
      birthtimeMs: Date.now(),
      size: 0,
      isDirectory: function() {
        return true;
      },
      isFile: function() {
        return false;
      }
    };
  })
}

function remapChannels(group) {

  return group.channels.map( c => {
    let chl = c.clone();
    return {
      name: `${chl.Name}.strm`,
      uid: chl.TvgId,
      mtime: Date.now(),
      birthtimeMs: Date.now(),
      size: Buffer.byteLength(chl.StreamUrl, 'utf-8'),
      isDirectory: function() {
        return false;
      },
      isFile: function() {
        return true;
      },
      link: chl.StreamUrl
    };
  })

}



let FtpServer = null;

const Ftp = {
  M3U: null,
  M3UConfig: null,
  Config: null,
  setM3UList(getter) {
    this.M3U = getter;
  },
  setM3UConfig(getter) {
    this.M3UConfig = getter;
  },
  setConfig(getter) {
    this.Config = getter;
  },
  stop() {
    if ( FtpServer ) {
      Log.info(`[FTP] Stopping FTP server`);
      FtpServer.close();
      FtpServer = null;
    }
  },

  start() {
    this.stop();

    let self = this;

    Log.info(`[FTP] Starting FTP server on ${process.env.BIND_IP || '127.0.0.1'}:${this.Config().FtpPort}`);

    FtpServer = new FtpSrv({
      url: `ftp://${process.env.BIND_IP || '127.0.0.1'}:${this.Config().FtpPort}`,
      root: ".",
      pasv_url: `ftp://${process.env.BIND_IP || '127.0.0.1'}:${this.Config().FtpPort}`
    });

    let HAS_BASIC_AUTH = process.env.BASIC_AUTH == "true";
    let BASIC_AUTH_OVERALL = process.env.BASIC_AUTH_OVERALL == 'true';

    function checkLocalRequest(connection) {

      let ip_local = self.Config().LocalIp;
      let ip_remot = connection.ip;

      if ( ip_local ) {
        ip_local = ip_local.split(':').shift();
      }
      if ( ip_local == 'localhost') {
        ip_local = '127.0.0.1';
      }

      Log.debug(`[FTP] local ip is: ${ip_local} - remote ip is: ${ip_remot}`);

      if ( ip_local === ip_remot ) {
        return true;
      } else {

        let ip_local_str = ip_local.split('.').slice(0, -2).join('.');
        let ip_remot_str = ip_remot.split('.').slice(0, -2).join('.');

        return ip_local_str === ip_remot_str;
      }
    }

    FtpServer.on('login', ({connection, username, password}, resolve, reject) => {

      // check login
      let isLocal = checkLocalRequest(connection);

      if ( (!isLocal && HAS_BASIC_AUTH) || (HAS_BASIC_AUTH && process.env.BASIC_AUTH_OVERALL == 'true')) {

        if ( username != process.env.BASIC_USER || password != process.env.BASIC_PWD ){
          return reject();
        }

      }

      resolve({fs: new MyFileSystem()});

    });

    FtpServer.on ( 'client-error', (connection, context, error) => {
      console.log ( `error: ${error}`,context );
    });

    FtpServer.listen();

  }
}


module.exports  = Ftp;
