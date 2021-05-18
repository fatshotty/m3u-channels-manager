const Webdav = require('webdav-server').v2;
const { Readable } = require("stream")
const Utils = require('./utils');
const Log = Utils.Log;

const Server = new Webdav.WebDAVServer({
    port: 1900
});

let str = 'http://streamlivenow.ru/Film/Joker [m1080p] (2019).mp4';

Server.afterRequest((arg, next) => {
    console.log('>>', arg.request.method, arg.fullUri(), '>', arg.response.statusCode, arg.response.statusMessage);
    next();
})


let virtual = {
    name: 'tvchannels',
    uid: 'tvchannels',
    mtime: Date.now(),
    birthtimeMs: Date.now(),
    size: 1,
    isDirectory: function() {
      return true
    },
    isFile: function() {
      return false;
    }
  };


class MyFS extends Webdav.VirtualFileSystem {
    constructor(wdav, data) {
        super();
        this.wdav = wdav;
    }
    // resource(ctx, res) {
    //     console.log('resource:', Array.prototype.slice.call(arguments, 0) );
    //     return super.resource(ctx, res);
    // }
    _mimeType() {
        console.log('_mimeType:', Array.prototype.slice.call(arguments, 0) );
        return super._mimeType.apply(this, arguments);
    }
    _size(path, ctx, callback) {
        console.log('_size:', Array.prototype.slice.call(arguments, 0) );
        super._size.apply(this, arguments);
    }
    _displayName() {
        console.log('_displayName:', Array.prototype.slice.call(arguments, 0) );
        return super._displayName.apply(this, arguments);
    }

    // Return Resource.File or Directory based on Path
    _type(pPath, ctx, callback) {
      let path = pPath.toString();
        console.log('_type:', path );
        return callback( null, path.endsWith('.strm') ? Webdav.ResourceType.File : Webdav.ResourceType.Directory );
    }
    _create(path, ctx, callback) {
        console.log('_create:', Array.prototype.slice.call(arguments, 0) );
        return super._create(path, ctx, callback);
    }
    // _readDir(path, ctx, callback) {
    //     console.log('_readDir:', Array.prototype.slice.call(arguments, 0) );

    //     // let paths = path.paths;
    //     // let objRes = this.wdav.M3UConfig().map(l => new new Webdav.Path(l.Name) );
    //     // if ( paths.length > 1 ){
    //     //   let list = lists.find( l => l.Name === paths[0] );
    //     //   objRes = list.groups.map(g => new new Webdav.Path(g.Name) );
    //     // }
    //     let paths = path.paths.slice(0);
    //     paths.unshift('');
    //     let objRes = this.loopFolder(paths);

    //     return callback(null, objRes);
    // }
    _fastExistCheck(ctx, path, callback) {
      console.log('_fastExistCheck:', path.toString() );
      // return super._fastExistCheck.apply(this, arguments);
      callback(true);
    }  
    // fastExistCheckExReverse() {
    //     console.log('fastExistCheckExReverse:', arguments);
    //     return super.fastExistCheckExReverse.apply(this, arguments);
    // }
    // _openReadStream(path, {context}, callback) {
    //     console.log('_openReadStream:', arguments);
    //     // return super._openReadStream.apply(this, arguments);
    //     context.setCode(200);
    //     context.response.setHeader('Accept-Ranges', 'bytes');
    //     context.response.setHeader('Content-Type', 'text/plan');
    //     let size = Buffer.byteLength(str, 'utf-8');
    //     context.response.setHeader('Content-Length', size.toString());
    //     context.response.write(str);
    //     context.response.end();
    //     // callback( null, Readable.from([str]) );
    // }


    loopFolder(paths) {
      let cwd = paths.toString();
      Log.info(`[WDav] Listing ${cwd}`);
  
  
      let parts = paths;
  
      let resObj = [];
      let currList = null;
  
      let steps = ['lists', 'groups', 'channels'];
      for (let i = 0, part; i < parts.length; i++) {
        let part = parts[i];
  
        let step = steps[ i ];
        switch( step ) {
  
          case 'lists':
            Log.debug(`[WDav] compute lists`);
            resObj = remapLists();
            break;
          case 'groups':
            currList = this.wdav.M3U().find(m => m.Name == part );
            Log.debug(`[WDav] compute groups for ${currList}`);
            resObj = remapGroups( currList );
            break;
          case 'channels':
            let grp = currList.groups.find( g => g.Id == part );
            Log.debug(`[WDav] compute channels for ${grp}`);
            resObj = remapChannels( grp );
            break;
  
        }
  
      }
  
      Log.info(`[WDav] Respond ${resObj.length} items`);
      return resObj;
    }
}

function remapLists() {
  return WDav.M3U().map( (m) => {
    // let m3uc = WDav.M3UConfig().find( c => c.Name == m.Name );
    return new Webdav.Path(m.Name);
  })
}

function remapGroups(m3u) {
  return m3u.groups.map( g => {
    return new Webdav.Path(g.Name);
  })
}

function remapChannels(group) {

  return group.channels.map( c => {
    let chl = c.clone();
    return new Webdav.Path(`${chl.Name}.strm`);
  })

}

const WDav = {
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
    if ( Server ) {
      Log.info(`[WDav] Stopping FTP server`);
      Server.stop();
    }
  },

  start() {
    Server.start(httpServer => {
      console.log('Server started with success on the port : ' + httpServer.address().port);
    });
  }
};

Server.setFileSystem(`/`, new MyFS(WDav), (success) => {
  Server.rootFileSystem().addSubTree(Server.createExternalContext(), {
    'folder_1': Webdav.ResourceType.Directory
  })
})

module.exports = WDav;