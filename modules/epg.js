const Moment = require('moment');
const Request = require('request-promise');
const Bulk = require('batch-promise');

const Utils = require('../utils');
const Log = Utils.Log;

const SKY_DOMAIN = 'http://guidatv.sky.it';
const CHANNEL_PATH = `${SKY_DOMAIN}/guidatv/canale/{name}.shtml`;
const SINGLE_CHANNEL = "http://guidatv.sky.it/app/guidatv/contenuti/data/grid/{date}/ch_{channel}.js";
const SINGLE_EVENT = "http://guidatv.sky.it/EpgBackend/event_description.do?eid={event}"

const URL_CHANNELS = "http://guidatv.sky.it/app/guidatv/contenuti/data/grid/grid_{category}_channels.js";

const PROGRAM_POSTER = `${SKY_DOMAIN}/app/guidatv/images`;
const REG_EXP_SEASON_EPISODE = /^((S(\w+)?(\d+))?)(\s?)((E(\w+)?(\d+))?)/i;

const CATEGORY = [
  "musica",
  "bambini",
  "news",
  "mondi",
  "cinema",
  "sport",
  "intrattenimento",
  "digitale",
  "primafila",
  "meglio",
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

  loadChannels(date, bulk) {

    const ps = [];
    for ( let link of SCRAP_LINK ) {
      ps.push( (resolve, reject) => {
        this.request(link).then(resolve, reject);
      } );
    }

    return Bulk( ps, bulk || 1 ).then( (all_channels_sky) => {
      // const all_channels_sky = chls.concat( pf ).concat( dig );
      for ( let res of all_channels_sky ) {
        for( let CHL of res ) {
          const channel_data = {
            id: CHL.id,
            name: CHL.name,
            number: CHL.number,
            service: CHL.service,
            logo: CHL.channelvisore || CHL.channellogonew
          };

          const exists = this.checkExistingChannel( CHL.id );

          if ( !exists ) {
            this._channels.push( new Channel(channel_data) );
          }
        }
      }
    });


  }

  checkExistingChannel(id) {
    const c = this._channels.filter( (c) => {
      return c.Id == id;
    });
    return !!(c && c.length);
  }

  scrapeEpg(date, bulk) {
    Log.info('Scraping...');

    return new Promise( (resolve, reject) => {

      const all_channel_req = [];
      for( let chl of this._channels ) {
        all_channel_req.push( (res, rej) => {
          chl.loadEvents(date).then( res, rej );
        });
      }

      Bulk( all_channel_req, bulk || 1).then( () => {

        const all_events_req = [];
        for( let chl of this._channels ) {
          all_events_req.push( (res, rej) => {
            chl.loadEventsDetail(date, bulk).then( res, rej );
          });
        }

        Bulk( all_events_req, bulk || 1).then( resolve, reject );

      });
    });
  }

  getEPGDate(date, starttime) {
    const d = new Date(date);
    const time = starttime.split(':');
    const h = time[0];
    const m = time[1];

    d.setHours( parseInt(h, 10) );
    d.setMinutes( parseInt(m, 10) );

    return d;
  }


  fixEpg() {

    for( let CHL of this._channels ) {
      let name = CHL.name.replace(/ /g,"-").toLowerCase();
      CHL.url = CHANNEL_PATH.replace('{name}', name);
    }

    const channels = Object.keys( this.EPG.epg );
    for( let chl_id of channels ) {
      const CHL = this.EPG.epg[ chl_id ];
      const dates = Object.keys( CHL );
      for ( let datetime_str of dates ) {

        const datetime = Number(datetime_str);
        const day = new Date(datetime);
        let usedate = new Date(day);

        const programs = CHL[ datetime_str ];

        for( let i = programs.length - 1, PRG; PRG = programs[i]; i-- ) {

          if ( PRG.id == '-1' || PRG.id == '1' || PRG.id == '0' ) {
            // skip invalid EPG
            programs.splice( i, 1 );
            continue;
          }

          // FIX: dates
          PRG.start = this.getEPGDate(usedate, PRG.starttime);
          const enddate = new Date( PRG.start );
          enddate.setMinutes( enddate.getMinutes() + parseInt(PRG.dur, 10) );
          PRG.end = enddate;

          usedate = PRG.start;

          // FIX: description
          if ( !PRG.description ) {
            PRG.description = PRG.desc;
          }

          // extract Season/Episode
          const match = PRG.description.match( REG_EXP_SEASON_EPISODE );
          if ( match && match.length && match[0]) {
            const episode = match[0];
            PRG.episode = String.prototype.trim.call(episode);
          }


          // fix poster:
          let poster = PRG.thumbnail_url || '';
          if ( poster == '#' ){
            poster = '';
          }
          if ( poster && poster.indexOf('http') < 0 ) {
            poster = PROGRAM_POSTER.replace('{icon}', PRG.thumbnail_url );
          }
          PRG.poster = poster;

        }

      }
    }
  }


  request(url) {
    Log.debug(`request to ${url}`);
    return Request({
      uri: url,
      json: true
    }).then( (data) => {
      return data;
    }, (err) => {
      Log.error(`${err}`);
    });
  }


}


class Channel {


  get Id() {
    return this.data.id;
  }
  get Name() {
    return this.data.name;
  }
  get Number() {
    return this.data.number;
  }
  get Service() {
    return this.data.service;
  }
  get Logo() {
    return this.data.logo;
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

    const req = this.request( SINGLE_CHANNEL.replace('{date}', date_str).replace('{channel}', this.data.id) );

    const epg = this._epg[ date.getTime() ] = [];

    Log.debug(`Loading events for ${this.data.name}`);

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

      Log.debug(`Loaded event for ${this.data.name}`);

    }).catch( (err) => {
      Log.error(`Error loading channel ${this.data.name} ${date_str}`);
    });
  }


  loadEventsDetail(date, bulk) {
    Log.debug(`Loading Channel event details ${this.data.name}`);
    const epg = this._epg[ date.getTime() ] || [];
    const events_req = [];
    for( let event of epg ) {
      events_req.push( (res, rej) => {
        event.loadDetails().then(res, rej);
      });
    }

    return Bulk( events_req, bulk || 1);
  }


  request(url) {
    return Request({
      uri: url,
      json: true
    });
  }

}
module.exports = Channel;






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

  constructor(data) {
    this.data = Object.assign({}, data);
  }

  calculateStartTime(refdate) {
    this._start = getEPGDate(refdate, this.data.starttime);
  }

  loadDetails() {

    Log.debug(`Loading event details for ${this.data.id} ${this.data.desc}`);
    const req = this.request( SINGLE_EVENT.replace('{event}', this.data.id) );

    return req.then( (event_detail) => {
      Log.debug(`Loaded event details for ${this.data.id} ${this.data.desc}`);
      if ( !event_detail || !event_detail.description ) {
        Log.warn(`no description for ${this.data.id} ${event_detail}`);
      }
      Object.assign(this.data, event_detail || {});
    });
  }


  request(url) {
    return Request({
      uri: url,
      json: true
    });
  }

}


module.exports = {SkyEpg, Channel, Event};
