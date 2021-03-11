const {Log} = require('../utils');
const Url = require('url');

let Module = null;

function computeKey(req, simple) {
  let cachekey = []; // [/*req.params.list_name || 'all',*/ req.params.format];

  if ( !simple ) {

    cachekey = [req.params.list_name || 'all', req.params.format];

    let url = Url.parse(req.originalUrl);

    let paths = url.pathname.split('/').slice(3);

    cachekey = cachekey.concat(paths);

    let params = new Url.URLSearchParams(url.search);

    params.sort();

    for ( let [name, value] of params.entries()) {
      cachekey.push(`${name}|${value}`);
    }
  } else {
    cachekey.push( req.params.list_name || 'all' );
  }

  let cachekeystring = cachekey.join(':');
  return cachekeystring;
}





if ( !global.Config.UseCache || String(global.Config.UseCache) == 'false' ) {


  function get(){
    return Promise.resolve(null);
  }
  function set(){}
  function remove(){}

  Log.info('NO cache module loaded');

  module.exports = {
    get,
    set,
    remove,
    computeKey
  };

} else {

  Module = require('./cache/redis');
  module.exports = {...Module, computeKey};
}
