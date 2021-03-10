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
    req.CACHE_KEY = null;
    Log.info('GOT FROM CACHE');
    res.set('x-response-from-cache', 'true');

    let indexSep = cachevaluestring.indexOf('|||');
    let mime = cachevaluestring.substring(0, indexSep);
    cachevaluestring = cachevaluestring.substring(indexSep + 3);

    res.set('content-type', mime);

    return res.end( cachevaluestring );

  } else {
    Log.info('not found in cache');
    res.set('x-response-from-cache', 'false');
  }

  next();
}


async function write(key, data) {

  return Cache.set(key, data);

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


module.exports = {get: read, set: write, invalidate, invalidateSimple};
