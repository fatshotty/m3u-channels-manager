const {FtpSrv, FileSystem} = require('ftp-srv');
const FTPErrors = require('ftp-srv/src/errors');
const Path = require('path');
const { Readable } = require("stream");
const Utils = require('./utils');
const FS = require('fs');
const { loggers } = require('winston');

const Log = Utils.Log;

class MyFileSystem extends FileSystem {

  constructor(connection, {root, cwd} = {}) {
    super(connection, {root: '/', cwd: '/'});
  }

  chdir(path) {
    // console.log('chdir', this.cwd, `"${path}"`);

    if ( path.startsWith('/') ) {
      this.cwd = '/'; // Path.join(this.cwd, path);
    }

    if ( path.endsWith('.strm') ) {
      Log.error(`[FTP] .strm file is not a directory: ${this.cwd} - ${path}`);
      throw new FTPErrors.FileSystemError(`Folder not exists ${this.cwd} - ${path}`);
    }

    this.cwd = Path.join(this.cwd, path);
    Log.info(`[FTP] chdir to ${this.cwd}`, );
    return this.cwd;
  }

  get(fileName) {
    let fullpath = Path.join(this.cwd, fileName);
    Log.info(`[FTP] get ${fullpath}`);
    
    let parts = (fullpath.startsWith('/') ? fullpath.substring(1) : fullpath).split('/');

    if ( parts.length > 2 ) {
      if ( parts[2].endsWith('.strm') ) {
        if ( parts.length > 3 ) {
          Log.error(`[FTP] Invalid path requested: ${fullpath}`);
          throw new FTPErrors.FileSystemError(`Invalid path requested: ${fullpath}`);
        }
      } else {
        Log.error(`[FTP] Invalid file requested: ${fullpath}`);
        throw new FTPErrors.FileSystemError(`Invalid file requested: ${fullpath}`);
      }
    }

    let lastPath = parts.pop();

    Log.info(`[FTP] get part -> ${lastPath || 'tvchannels'}`);

    let isFile = fileName.endsWith('.strm');
    let list = this.loopFolder(isFile, fullpath);
    let size = 0;

    if (isFile) {
      let chl = list; // list.find(c => c.name == lastPath );
      if ( !chl ) {
        Log.error(`[FTP] Cannot found channel by name ${fileName}`);
        throw new FTPErrors.FileSystemError(`Cannot read channel ${fileName}`);
      }
      size = chl.size;
    } else if ( list.length > 0 ) {
      size = list.reduce( (acc, item) => {
        acc = isNaN(acc) ? 0 : acc;
        acc += item.size;
        return acc;
      })
    }


    Log.info(`[FTP] Responding get -> ${lastPath || 'tvchannels'} - size: ${size} - file: ${isFile}`);

    return {
      name: lastPath || 'tvchannels',
      uid: lastPath || 'tvchannels',
      mtime: Date.now(),
      birthtimeMs: Date.now(),
      size: size,
      isDirectory: function() {
        return !isFile;
      },
      isFile: function() {
        return isFile;
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
    // console.log('try to read', fileName, start);
    let filepath = Path.join(this.cwd, fileName);
    Log.info(`[FTP] Responding file ${filepath}`);
    let list = this.loopFolder(false);
    let chl = list.find(c => c.name == fileName );
    if ( !chl ) {
      Log.error(`[FTP] Cannot found channel by name ${fileName}`);
      throw new FTPErrors.FileSystemError(`Cannot read channel ${fileName}`);
    }
    Log.info( `[FTP] Found streamUrl for ${chl.name} -> ${chl.link}`);
    let stream = Readable.from([chl.link]);
    stream.path = filepath
    // console.log('Found file', stream.path, 'for ->', chl.link);
    return stream;
    // FS.writeFileSync('/Users/fatshotty/Desktop/myfile.strm', `${chl.link}\n`, 'utf-8');
    // return FS.createReadStream('/Users/fatshotty/Desktop/myfile.strm');

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


  loopFolder(single, currentPath) {

    Log.info(`[FTP] Listing ${currentPath || this.cwd}`);

    currentPath = currentPath || this.cwd;
    if ( currentPath == '/' ) {
      currentPath = '';
    }

    let parts = currentPath.split( '/' );

    let resObj = [];
    let currList = null;

    let steps = ['lists', 'groups', 'channels'];
    for (let i = 0, part; i < parts.length; i++) {
      let part = parts[i];

      let step = steps[ i ];
      switch( step ) {

        case 'lists':
          Log.debug(`[FTP] compute all lists`);
          resObj = remapLists();
          break;
        case 'groups':
          currList = Ftp.M3U().find(m => m.Name == part );
          if ( !currList ) {
            throw new errors.FileSystemError(`[FTP] list ${part} not exists`);
          }
          Log.info(`[FTP] compute groups for ${currList.Name}`);
          resObj = remapGroups( currList );
          break;
        case 'channels':
          let grp = currList.groups.find( g => g.Name == part );
          if ( !currList ) {
            throw new errors.FileSystemError(`[FTP] group ${part} not exists`);
          }
          Log.info(`[FTP] compute channels for ${grp.Name}`);
          resObj = remapChannels( grp );
          break;

      }

    }

    let lastPart = parts.pop();
    single = single || lastPart.endsWith('.strm');

    if ( single ) {
      resObj = resObj.find(i => i.name == lastPart );
    }

    Log.info(`[FTP] Respond ${single ? 'first result' : resObj.length + ' items'}`);
    return single ? resObj : resObj;
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
      name: `${chl.Name}.strm`.trim(),
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
  async stop() {
    if ( FtpServer ) {
      Log.info(`[FTP] Stopping FTP server`);
      await FtpServer.close();
      FtpServer = null;
    }
  },

  async start() {
    await this.stop();

    let self = this;

    Log.info(`[FTP] Starting FTP server on ${process.env.BIND_IP || '127.0.0.1'}:${this.Config().FtpPort}`);

    FtpServer = new FtpSrv({
      url: `ftp://${process.env.BIND_IP || '127.0.0.1'}:${this.Config().FtpPort}`,
      root: "/",
      pasv_url: `${process.env.BIND_IP || '127.0.0.1'}`,
      pasv_range: '8400-8500'
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


    // let MYFS = new MyFileSystem();

    FtpServer.on('login', ({connection, username, password}, resolve, reject) => {

      // check login
      let isLocal = checkLocalRequest(connection);

      if ( (!isLocal && HAS_BASIC_AUTH) || (HAS_BASIC_AUTH && BASIC_AUTH_OVERALL == 'true')) {

        if ( username != process.env.BASIC_USER || password != process.env.BASIC_PWD ){
          Log.error(`[FTP] cannot login`)
          return reject();
        }

      }

      Log.info(`[FTP] connection logged in successfully`)

      resolve({fs: new MyFileSystem(connection)});
      // resolve({root: '/Users/fatshotty/Desktop', cwd: '/'});

    });

    FtpServer.on ( 'client-error', (connection, context, error) => {
      console.log ( 'client-error:', connection, context, error );
      Log.error(`[FTP] client-error ${error}`);
    });

    FtpServer.on ( 'error', (connection, context, error) => {
      console.log ( 'error:', connection, context, error );
      Log.error(`[FTP] error ${error}`);
    });

    FtpServer.listen();

  }
}


module.exports  = Ftp;
