
const Sky = require('./epgs/sky');
const TvSorrisi = require('./epgs/tvsorrisi');
const Rytech = require('./epgs/rytech');
const Utils = require('../utils');
const Bulk = require('batch-promise');

const Log = Utils.Log;


class EPG {

  constructor() {
    this.modules = [];
  }

  addModule(name, module) {
    if ( this.modules.indexOf( module ) <= -1 ){
      this.modules.push( module );
      module.NAME = name;
    } else {
      Log.warn(`module ${name} already added`);
    }
  }

  clear() {
    for ( let module of this.modules ) {
      module.clear();
    }
  }

  get EPG() {

    // TODO: process epg and get channels
    let ids = {};
    let epg = [];
    for ( let module of this.modules ) {
      let channels = module.EPG;
      for ( let channel of channels ) {
        if ( ! (channel.IdEpg in ids) ) {
          epg.push( channel );
          ids[ channel.IdEpg ] = true;
        }
      }
    }

    return epg;

  }


  loadChannels(date, bulk) {
    let bulk_promise = [];
    for ( let module of this.modules ) {
      bulk_promise.push( (resolve, reject) => {
        module.loadChannels(date, bulk).then(resolve, reject);
      });
    }

    return Bulk( bulk_promise, bulk || 1 );
  }


  scrapeEpg(date, details, bulk) {

    let bulk_promise = [];
    for ( let module of this.modules ) {
      bulk_promise.push( (resolve, reject) => {
        module.scrapeEpg(date, details, bulk).then( (data) => {
          Log.info(`module ${module.NAME} completed!`);
          resolve(data)
        }, (err) => {
          Log.warn(`*** module ${module.NAME} completed with error! ${err}`);
          reject(err);
        });
      });
    }

    return Bulk( bulk_promise, bulk || 1 );

  }

  toJSON() {
    let value = {};
    for ( let module of this.modules ) {
      value[ module.NAME ] = module;
    }
    return value;
  }


}


const epg = new EPG();
epg.addModule('Sky', new Sky.SkyEpg() );
epg.addModule('TvSorrisi', new TvSorrisi.TvSorrisiEpg() );
epg.addModule('Rytech', new Rytech.Rytech() );

module.exports = epg;
