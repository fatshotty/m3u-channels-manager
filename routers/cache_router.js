const {Log} = require('../utils');
const Url = require('url');
let Cache = require('../services/cache')


async function read(req, res, next) {

  if ( !global.Config.UseCache || String(global.Config.UseCache) == 'false' ) {
    return next();
  }

  let cachekey = Cache.computeKey(req);
  req.CACHE_KEY = cachekey

  let cachevaluestring = await Cache.get(cachekey);

  if ( cachevaluestring ) {
    delete req.CACHE_KEY;
    Log.info('GOT FROM CACHE');
    res.set('x-response-from-cache', 'true');

    // let indexSep = cachevaluestring.indexOf('|||');
    // let mime = cachevaluestring.substring(0, indexSep);
    // cachevaluestring = cachevaluestring.substring(indexSep + 3);
    let parts = cachevaluestring.split('|||');
    let time = Number(parts.shift());
    let mime = parts.shift();
    cachevaluestring = parts.join('|||');

    res.set('last-modified', new Date(time).toUTCString() );

    if ( req.get('if-modified-since') ) {
      let modifiedSince = req.get('if-modified-since');
      let cacheValid = checkCache(modifiedSince, time);
      if ( cacheValid ) {
        Log.info('[CACHE] date are the same, so return 304')
        res.status(304).end('');
        return;
      }
    }

    //

    res.set('content-type', mime);

    return res.end( cachevaluestring );

  } else {
    Log.info(`[CACHE] not found in cache: ${cachekey}`);
    res.set('x-response-from-cache', 'false');
  }

  next();
}


function checkCache(modifiedSince, time) {

  let modDate = new Date(modifiedSince);
  let curDate = new Date( Number(time) );

  Log.info(`[CACHE] check hedaer for cache: '${modDate.toUTCString()}' - '${curDate.toUTCString()}'`);

  return modDate.getTime() == curDate.getTime();

}

async function write(key, data) {

  return Cache.set(key, data );

}


async function invalidateSimple(key) {
  return Cache.remove(key, true);
}

async function invalidate(req, res, next) {

  let cachekey = Cache.computeKey(req, true);

  invalidateSimple(cachekey)
  invalidateSimple('all');

  next();

}


module.exports = {computeKey: Cache.computeKey, get: read, set: write, invalidate, invalidateSimple};
