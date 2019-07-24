const Utils = require('../utils');
const OS = require('os');
const LOG_NAME = "- TP - "
const Log = Utils.Log;


const CPUs = OS.cpus();
const NUMBER_CPU = CPUs.length;
let Executors = null;
try {
  let NTP = require ("node-threadpool");
  Executors = NTP.Executors;
  Log.info('Thread loaded');
} catch( e ) {
  Log.warn('** NO thread loaded **');
}



class ThreadPool {

  constructor(limit) {

    this._limit = Math.min( parseInt( limit || 1, 10), NUMBER_CPU );


    if ( Executors ) {
      this._pool = Executors.newFixedThreadPool( this._limit )
      this._pool.queue.shift = function() {
        let r = Array.prototype.shift.apply(this, arguments);
        // if ( this.length % 100 == 0 ) {
        //   Log.info(`TP - Starting process (remaining ${this.length}) - ${JSON.stringify(r.data)}`);
        // } else {
          Log.debug(`TP - Starting process (remaining ${this.length}) - ${JSON.stringify(r.data)}`);
        // }
        return r;
      };
      this._pool.freeWorkers.push = function() {
        // if ( this.length % 100 == 0 ) {
        //   Log.info(`TP - Finish process, prepare next job: ${this.length}`);
        // } else {
          Log.debug(`TP - Finish process, prepare next job: ${this.length}`);
        // }

        let r = Array.prototype.push.apply(this, arguments);
        return r;
      };
    } else {
      this._pool = {
        submit: this._submit.bind(this)
      };
    }

    this._threads = [];
    this.cbs = [];

    this._is_started = false;
    this._is_running = false;

  }

  add(params, action, callback) {
    this._threads.push({params, action, callback});
    // Log.debug(`${LOG_NAME} addded thread` );
    if ( this._is_started && ! this._is_running ) {
      this._start();
    }
  }

  _submit(fn, params) {
    return new Promise( (resolve, reject) => {
      Log.debug(`${LOG_NAME} single thread started`);
      fn( params ).then(resolve, reject);
    });
  }


  onFinish() {
    this._is_running = false;
    for( let cb of this.cbs ) {
      cb();
    }
  }


  start(cb) {
    this._is_started = true;
    cb && this.cbs.push( cb );
    if ( ! this._is_running ) {
      this._start();
    }
  }


  terminate( cb ) {
    if ( ! this._pool.freeWorkers ) {
      return cb && cb();
    }
    let ws = this._pool.freeWorkers;
    let ps = [];
    for(let w of ws) {
      ps.push( w.terminate() );
    }
    return Promise.all( ps ).then(cb, cb);
  }



  _start() {

    this._is_running = true;

    let next_pool = this._threads.splice(0, this._threads.length);

    if ( next_pool.length <= 0 ) {
      Log.info(`${LOG_NAME} queue empty, exit`);
      return this.onFinish();
    }

    Log.debug(`${LOG_NAME} start queue ${next_pool.length}`);

    let promises = [];

    for ( let thr of next_pool ) {

      promises.push( this._pool.submit( thr.action, thr.params ).then(thr.callback) );

    }

    Log.info(`Queued ${promises.length} job`);

    Promise.all( promises ).then( (responses) => {
      Log.info(`${LOG_NAME} temporary pool completed, remaining ${this._threads.length}`);
      this._start();
    }, (err) => {
      Log.warn(`${LOG_NAME} some error in queue ${err}`);
      this._start();
    });

  }

}


module.exports = ThreadPool;
