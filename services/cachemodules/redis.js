const RedisServer = require('redis');
const Redis = RedisServer.createClient(global.Config.UseCache);
const {Log} = require('../../utils');

function get(key) {
  Log.info(`[REDIS] getting cache: ${key}`);
  return new Promise((resolve, reject) => {
    Redis.get(key, function(err, value) {
      if (err) {
        Log.error(`[REDIS] cannot get ${key} - ${err}`);
        return resolve(null);
      }
      resolve(value);
    });
  })
}





function set(key, value) {
  Log.info(`[REDIS] setting cache: ${key}`);
  return new Promise((resolve, reject) => {
    Redis.set(key, value, function(err) {
      if (err) {
        Log.error(`[REDIS] cannot set ${key} - ${err}`);
        return resolve();
      }
      resolve();
    });
  })
}


async function remove(key, all) {

  return new Promise((resolve, reject) => {
    key = `${key}${all ? ':*' : ''}`;

    Log.info(`[REDIS] deleting cache: ${key}`);

    Redis.keys(key, function (err, keys) {
      if (err) {
        Log.error(`[REDIS] cannot remove ${key} - ${err}`);
        return resolve();
      }

      Log.info(`[REDIS] deleting ${keys.length} cache key`);

      for(let k of keys) {
        Log.debug(`[REDIS] clearing cache key ${k}`);
        Redis.del(k);
      }
      resolve();
    });
  })

}



module.exports = {
  get,
  set,
  remove
}
