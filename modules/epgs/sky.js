const Moment = require('moment');
const Request = require('request-promise');
const Bulk = require('batch-promise');
const ThreadPool = require('../thread_pool');

const Path = require('path');

const Utils = require('../../utils');
const LOG_NAME = "Sky - "
const Log = Utils.Log;

const SKY_DOMAIN = 'http://guidatv.sky.it';
const CHANNEL_PATH = `${SKY_DOMAIN}/guidatv/canale/{name}.shtml`;
const SINGLE_CHANNEL = `${SKY_DOMAIN}/app/guidatv/contenuti/data/grid/{date}/ch_{channel}.js`
const SINGLE_EVENT = `${SKY_DOMAIN}/EpgBackend/event_description.do?eid={event}`

const URL_CHANNELS = `${SKY_DOMAIN}/app/guidatv/contenuti/data/grid/grid_{category}_channels.js`

const PROGRAM_POSTER = `${SKY_DOMAIN}/app/guidatv/images{icon}`;
const REG_EXP_SEASON_EPISODE = /^((S(\w+)?(\d+))?)(\s?)((E(\w+)?(\d+))?)/i;

const CATEGORY = [
  // "musica",
  // "bambini",
  "news",
  "mondi",
  "cinema",
  "sport",
  "intrattenimento",
  "digitale",
  "primafila",
  "meglio"
];


const SCRAP_LINK = [];
for ( let cat of CATEGORY ) {
  SCRAP_LINK.push( URL_CHANNELS.replace('{category}', cat) );
}

class SkyEpg {

  constructor() {
    this._channels = [];
  }

  get EPG() {
    return this._channels;
  }

  clear() {
    this._channels = [];
  }


  reloadFromCache(chls) {
    this.clear();

    for( let chl_data of chls ) {
      const chl_epg = chl_data.Epg;
      const epg_keys = Object.keys( chl_epg );
      const Chl = new Channel( chl_data );
      for ( let epgK of epg_keys ) {
        const events = chl_epg[ epgK ];
        const arr_events = Chl._epg[ epgK ] = [];
        for( let evt of events ) {
          const event = new Event(evt);
          if ( evt._start ) {
            event._start = new Date( evt._start );
          }
          arr_events.push( event );
        }
      }
      this._channels.push(Chl);
    }

  }

  loadChannels(date, bulk) {

    return new Promise( (resolve, reject) => {

      let all_channels_sky = [];

      let tp = new ThreadPool(SCRAP_LINK.length);

      for ( let link of SCRAP_LINK ) {
        let _d = {
          link,
          utils_path: Path.join( __dirname, '..', '..', 'utils')
        };
        tp.add(_d, (params) => {
          const Utils = require( params.utils_path );
          const LOG_NAME = "Sky - "
          const Log = Utils.Log;
          Log.debug(`${LOG_NAME} get channels from ${params.link}`);

          let ReqProm = require('request-promise');
          return ReqProm({
            url: params.link,
            json: true
          }).then( (data) => {
            Log.info(`${LOG_NAME} got channels from ${params.link}`);
            const last = params.link.split('/').pop();
            const groups = last.match(/_(.*)_/i)
            if ( groups ) {
              data.GROUP = groups[1];
            }
            return data
          }, (err) => {
            Log.error(`${LOG_NAME} for ${params.link} - ${err}`);
          })
        }, (result) => {
          all_channels_sky.push(result);
        });
      }

      tp.start( () => {
        Log.info(`${LOG_NAME} all channels link have been loaded ${all_channels_sky.length}`);
        for ( let res of all_channels_sky ) {
          if ( ! Array.isArray(res) ) continue;
          const g = res.GROUP;
          for( let CHL of res ) {
            const channel_data = {
              Id: CHL.id,
              Name: CHL.name,
              Number: CHL.number,
              Service: CHL.service,
              Logo: CHL.channelvisore || CHL.channellogonew,
              Group: g
            };

            const exists = this.checkExistingChannel( channel_data.Id );

            if ( !exists ) {
              this._channels.push( new Channel(channel_data) );
            }
          }
        }

        tp.terminate(resolve);
      })
    });

  }

  checkExistingChannel(id) {
    const c = this._channels.filter( (c) => {
      return c.Id == id;
    });
    return !!(c && c.length);
  }

  scrapeEpg(date, details, bulk) {
    Log.info(`${LOG_NAME} Scraping... ${date} ${details ? 'detailed' : ''}`);

    return new Promise( (resolve, reject) => {

      Log.info(`${LOG_NAME} Loading channels programs`);



      const all_channel_req = [];
      for( let chl of this._channels ) {
        all_channel_req.push( (res, rej) => {
          chl.loadEvents(date).then( res, rej );
        });
      }

      Bulk( all_channel_req, bulk || 1).then( () => {
        let tp = new ThreadPool(10);

        let all_events_req = [];
        if ( details ) {
          for( let chl of this._channels ) {
            // all_events_req.push( (res, rej) => {
            //   chl.loadEventsDetail(date, bulk).then( res, rej );
            // });
            const programs_to_load = chl.loadEventsDetail(date, bulk, tp);
            Log.info(`${LOG_NAME} Preparing details for ${chl.Name} - total: ${programs_to_load.length}`);
            all_events_req =  all_events_req.concat( programs_to_load );
          }
        }

        Log.info(`${LOG_NAME} Starting load events details for ${all_events_req.length} programs`);

        tp.start( () => {
          Log.info(`${LOG_NAME} No more request channels and programs - finish`);
          tp.terminate( () => {
            resolve();
          });
        });

      });
    });
  }


  request(url) {
    Log.debug(`${LOG_NAME} request to ${url}`);
    return Request({
      uri: url,
      json: true
    }).then( (data) => {
      return data;
    }, (err) => {
      Log.error(`${LOG_NAME} ${err}`);
    });
  }


}


class Channel {


  get Id() {
    return this.data.Id;
  }

  get IdEpg() {
    return this.Name.trim(); // .replace(/[^\w|\+]/g, '_');
  }
  get Name() {
    return this.data.Name;
  }
  get Number() {
    return this.data.Number;
  }
  get Service() {
    return this.data.Service;
  }
  get Logo() {
    return this.data.Logo;
  }
  get Group() {
    return this.data.Group
  }
  get Url() {
    let name = this.Name.replace(/ /g,"-").toLowerCase();
    return CHANNEL_PATH.replace('{name}', name);
  }

  get Epg() {
    return this._epg;
  }

  constructor(data) {
    this.data = Object.assign({}, data);
    this._epg = {};
  }


  loadEvents(date) {
    const date_str = Moment(date).format('YY_MM_DD');

    Log.info(`${LOG_NAME} Loading EPG for ${this.Name} date ${date_str}`);

    const req = this.request( SINGLE_CHANNEL.replace('{date}', date_str).replace('{channel}', this.Id) );

    const epg = this._epg[ date.getTime() ] = [];

    Log.debug(`${LOG_NAME} Loading events for ${this.Name}`);

    return req.then( ( programs ) => {
      let usedate = new Date(date);

      const plans = programs.plan;
      for( let plan of plans ) {
        if ( plan.id == '-1' || plan.id == '1' || plan.id == '0'){
          continue;
        }

        const evt = new Event(plan);

        evt.calculateStartTime(usedate);
        usedate = evt.Start;

        epg.push( evt );
      }
      Log.debug(`${LOG_NAME} loaded EPG for ${this.Name} in date ${date_str}- Total: ${epg.length}`);

    }).catch( (err) => {
      Log.error(`${LOG_NAME} Error loading channel ${this.Name} ${date_str}`);
      Log.error(`${LOG_NAME} ${(err || {}).name}`);
    });
  }

  toJSON(detailed) {
    const data = {
      Id: this.Id,
      IdEpg: this.IdEpg,
      Name: this.Name,
      Number: this.Number,
      Service: this.Service,
      Logo: this.Logo,
      Group: this.Group,
      Url: this.Url
    };
    if ( detailed ) {
      data.Epg = this._epg;
    }
    return data;
  }


  loadEventsDetail(date, bulk, threadPool) {
    Log.info(`${LOG_NAME} Starting getting program details for ${this.Name}`);
    const epg = this._epg[ date.getTime() ] || [];

    for( let event of epg ) {

      let data = {
        utils_path: Path.join( __dirname, '..', '..', 'utils'),
        URL: SINGLE_EVENT,
        chl: {
          Name: this.Name
        },
        LOG_NAME: LOG_NAME,
        data: {
          id: event.data.id,
          desc: event.data.desc
        }
      };

      threadPool.add( data, (params) => {
        const Utils = require( params.utils_path );
        const LOG_NAME = "Sky - "
        const Log = Utils.Log;

        Log.debug(`${LOG_NAME} Loading event details for ${params.chl.Name} - ${params.data.id}  - ${params.data.desc}`);

        let _str_URL = params.URL.replace('{event}', params.data.id);
        const _Req = require('request-promise');
        const req = _Req( {
          uri: _str_URL,
          json: true
        });


        return req.then( (event_detail) => {

          Log.debug(`${LOG_NAME} Event detail loaded for ${params.chl.Name} - ${params.data.id}  - ${params.data.desc}`);

          if ( !event_detail || !event_detail.description ) {
            // Log.warn(`${LOG_NAME} no description for ${params.chl.Name} - ${params.data.id}: ${event_detail || params.data.desc}`);
          }
          return event_detail || {};
        }, (err) => {

          Log.warn(`${LOG_NAME} error getting details ${params.chl.Name} - ${params.data.id} (${_str_URL}) - ${(err || {}).name}`);

        });

      }, (result) => {
        Object.assign( event.data, result || {});
      });

    }

    return epg;
  }

  // loadSingleEventDetails(event, params) {
  //   console.log('loadsingleevent - start for', params.chl.Name, params.data.id);
  //   this._threadPool.add(params, (params) => {

  //     console.log('loadsingleevent - start JOB', params.chl.Name, params.data.id);

  //     const _Req = require('request-promise');
  //     const req = _Req( {
  //       uri: params.URL.replace('{event}', params.data.id),
  //       json: true
  //     });



  //     // Log.debug(`${params.LOG_NAME} Loading event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
  //     // const req = this.request(  );

  //     return req.then( (event_detail) => {

  //       console.log('loadsingleevent - got response', params.chl.Name, params.data.id, event_detail);

  //       // Log.debug(`${params.LOG_NAME} Loaded event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
  //       // Log.debug(JSON.stringify(event_detail));
  //       if ( !event_detail || !event_detail.description ) {
  //         // Log.warn(`${params.LOG_NAME} no description for ${params.chl.Name} - ${params.data.id}: ${event_detail || params.data.desc}`);
  //       }
  //       // Object.assign(this.data, event_detail || {});
  //       return event_detail || {};
  //     });
  //   }, (evt_details) => {
  //     Log.info(`${params.LOG_NAME} Loaded event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
  //     Log.debug( JSON.stringify(evt_details) );
  //     Object.assign(event.data, evt_details);
  //   })
  // }


  request(url) {
    return Request({
      uri: url,
      json: true
    });
  }

}


function getEPGDate(date, starttime) {
  const d = new Date(date);
  const time = starttime.split(':');
  const h = time[0];
  const m = time[1];

  d.setHours( parseInt(h, 10) );
  d.setMinutes( parseInt(m, 10) );

  return d;
}


class Event {

  get Start() {
    return this._start
  }
  get Stop() {
    const enddate = new Date( this._start );
    enddate.setMinutes( enddate.getMinutes() + parseInt(this.data.dur, 10) );
    return enddate;
  }
  get Id() {
    return this.data.id
  }
  get Pid() {
    return this.data.pid
  }
  get Title() {
    return this.data.title
  }
  get Genre() {
    return this.data.genre
  }
  get Subgenre() {
    return this.data.subgenre
  }
  get Poster() {
    let poster = this.data.thumbnail_url || '';
    if ( poster == '#' ){
      poster = '';
    }
    if ( poster && poster.indexOf('http') < 0 ) {
      poster = PROGRAM_POSTER.replace('{icon}', this.data.thumbnail_url );
    }
    return poster;
  }
  get Description() {
    return this.data.description || this.data.desc;
  }
  get Episode() {
    const match = this.Description.match( REG_EXP_SEASON_EPISODE );
    if ( match && match.length && match[0]) {
      const episode = match[0];
      return String.prototype.trim.call(episode);
    }
    return ''
  }
  get Date() {
    return '';
  }

  get Director() {
    return '';
  }
  get Actors() {
    return '';
  }

  constructor(data) {
    const opts = {};

    opts.dur = data.Duration || data.dur;
    opts.id =  data.Id || data.id;
    opts.pid =  data.Pid || data.pid;
    opts.title =  data.Title || data.title;
    opts.genre =  data.Genre || data.genre;
    opts.subgenre =  data.Subgenre || data.subgenre;
    opts.thumbnail_url =  data.Poster || data.thumbnail_url;
    opts.description =  data.Description || data.description;
    opts.desc =  data.Desc || data.desc;
    opts.prima = data.Prima || data.prima;
    opts.starttime = data.starttime;

    this.data = Object.assign({}, opts);
    if ( data.Start ) {
      this._start = new Date(data.Start);
    }
  }

  calculateStartTime(refdate) {
    this._start = getEPGDate(refdate, this.data.starttime);
  }

  loadDetails(params) {
    const _Req = require('request');
    const req = _Req( params.URL.replace('{event}', params.data.id) );


    // Log.debug(`${params.LOG_NAME} Loading event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
    // const req = this.request(  );

    return req.then( (event_detail) => {
      // Log.debug(`${params.LOG_NAME} Loaded event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
      // Log.debug(JSON.stringify(event_detail));
      if ( !event_detail || !event_detail.description ) {
        // Log.warn(`${params.LOG_NAME} no description for ${params.chl.Name} - ${params.data.id}: ${event_detail || params.data.desc}`);
      }
      // Object.assign(this.data, event_detail || {});
      return event_detail || {};
    });

  }


  request(url) {
    return Request({
      uri: url,
      json: true
    });
  }

  toJSON() {
    return {
      Start: this.Start,
      Stop: this.Stop,
      Id: this.Id,
      Pid: this.Pid,
      Title: this.Title,
      Genre: this.Genre,
      Subgenre: this.Subgenre,
      Poster: this.Poster,
      Desc: this.data.desc,
      Description: this.Description,
      Episode: this.Episode,
      Prima: this.data.prima,
      Duration: this.data.dur
    }
  }

}


module.exports = {SkyEpg, Channel, Event};
