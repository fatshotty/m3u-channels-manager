const Rai = require('./epgs/rai');
const Sky = require('./epgs/sky');
const TvSorrisi = require('./epgs/tvsorrisi');
const Rytech = require('./epgs/rytech');
const GuidaTv = require('./epgs/guidatv');
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
    let json = {};
    for ( let _module of this.modules ) {
      let channels = _module.EPG;
      let epg = [];
      for ( let channel of channels ) {
        epg.push( channel );
      }
      json[ _module.NAME ] = epg;
    }

    return json;

  }


  get XMLTV() {

    // TODO: process epg and get channels
    let ids = {};
    let epg = [];
    for ( let _module of this.modules ) {
      let channels = _module.EPG;
      for ( let channel of channels ) {
        if ( ! (channel.IdEpg in ids) ) {
          epg.push( channel );
          ids[ channel.IdEpg ] = true;
        }
      }
    }

    return epg;
  }

  get GroupedChannels() {
    // TODO: process epg and get channels
    let json = {};
    for ( let module of this.modules ) {
      let channels = module.EPG;
      let epg = [];
      for ( let channel of channels ) {
        epg.push( channel.toJSON(false) );
      }
      json[ module.NAME ] = epg;
    }

    return json;
  }


  reloadFromCache(json) {

    let module_names = Object.keys(json);
    for ( let name of module_names ) {

      let epgModule = this.modules.filter( (m) => m.NAME == name );
      epgModule = epgModule && epgModule[0];
      if ( epgModule ) {

        let channels = json[ name ];
        epgModule.reloadFromCache(channels);

      } else {
        Log.warn(`Cannot found '${name}' as epg module`);
      }

    }


  }


  loadChannels(date, bulk) {
    let bulk_promise = [];
    for ( let _module of this.modules ) {
      bulk_promise.push( (resolve, reject) => {
        _module.loadChannels(date, bulk).then(resolve, reject);
      });
    }

    return Bulk( bulk_promise, bulk || 1 );
  }


  scrapeEpg(date, details, bulk) {

    let bulk_promise = [];
    for ( let _module of this.modules ) {
      bulk_promise.push( (resolve, reject) => {
        _module.scrapeEpg(date, details, bulk).then( (data) => {
          this.modules;
          Log.info(`module ${_module.NAME} completed!`);
          resolve(data)
        }, (err) => {
          Log.warn(`*** module ${_module.NAME} completed with error! ${err}`);
          reject(err);
        });
      });
    }

    return Bulk( bulk_promise, 1 || bulk || 1 );

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
// epg.addModule('GuidaTv', new GuidaTv.GuidaTvEpg() );
epg.addModule('Rai', new Rai.RaiEpg() );
// epg.addModule('Rytech', new Rytech.Rytech() );

module.exports = epg;
