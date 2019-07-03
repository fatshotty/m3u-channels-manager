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

const PROGRAM_POSTER = `${SKY_DOMAIN}/app/guidatv/images{icon}`;
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
        Log.info(`Loading channels from ${link}`);
        this.request(link).then( (rsp) => {
          const last = link.split('/').pop();
          const groups = last.match(/_(.*)_/i)
          if ( groups ) {
            rsp.GROUP = groups[1];
          }
          resolve(rsp)
        }, reject);
      });
    }

    return Bulk( ps, bulk || 1 ).then( (all_channels_sky) => {
      // const all_channels_sky = chls.concat( pf ).concat( dig );
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
    });


  }

  checkExistingChannel(id) {
    const c = this._channels.filter( (c) => {
      return c.Id == id;
    });
    return !!(c && c.length);
  }

  scrapeEpg(date, details, bulk) {
    Log.info(`Scraping... ${date} ${details ? 'detailed' : ''}`);

    return new Promise( (resolve, reject) => {

      Log.info(`Loading channels programs`);
      const all_channel_req = [];
      for( let chl of this._channels ) {
        all_channel_req.push( (res, rej) => {
          chl.loadEvents(date).then( res, rej );
        });
      }

      Bulk( all_channel_req, bulk || 1).then( () => {
        let all_events_req = [];
        if ( details ) {
          for( let chl of this._channels ) {
            // all_events_req.push( (res, rej) => {
            //   chl.loadEventsDetail(date, bulk).then( res, rej );
            // });
            const programs_to_load = chl.loadEventsDetail(date, bulk);
            Log.info(`Preparing details for ${chl.Name} - total: ${programs_to_load.length}`);
            all_events_req =  all_events_req.concat( programs_to_load );
          }
        }

        // if ( all_events_req && all_events_req.length > 0 ) {
        //   Log.info(`Loding details for ${all_events_req.length} programs`);
        // }

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

    Log.info(`Loading EPG for ${this.Name} date ${date_str}`);

    const req = this.request( SINGLE_CHANNEL.replace('{date}', date_str).replace('{channel}', this.Id) );

    const epg = this._epg[ date.getTime() ] = [];

    Log.debug(`Loading events for ${this.Name}`);

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
      Log.debug(`loaded EPG for ${this.Name} in date ${date_str}- Total: ${epg.length}`);

    }).catch( (err) => {
      Log.error(`Error loading channel ${this.Name} ${date_str}`);
      Log.error(`${err}`);
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


  loadEventsDetail(date, bulk) {
    Log.debug(`Loading Channel event details ${this.Name}`);
    const epg = this._epg[ date.getTime() ] || [];
    const events_req = [(res, rej) => {
      Log.info(`Starting getting program details for ${this.Name}`);
      res();
    }];
    for( let event of epg ) {
      events_req.push( (res, rej) => {
        Log.debug(`Loading events details ${this.Name} - ${event.Id} - ${event.data.desc}`);
        event.loadDetails(this).then(res, rej);
      });
    }
    events_req.push( (res, rej) => {
      Log.info(`Programs details correctly loaded for ${this.Name}`);
      res();
    });
    return events_req;
    // return Bulk( events_req, bulk || 1);
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

  loadDetails(chl) {

    Log.debug(`Loading event details for ${chl.Name} - ${this.data.id}: ${this.data.desc}`);
    const req = this.request( SINGLE_EVENT.replace('{event}', this.data.id) );

    return req.then( (event_detail) => {
      Log.debug(`Loaded event details for ${chl.Name} - ${this.data.id}: ${this.data.desc}`);
      // Log.debug(JSON.stringify(event_detail));
      if ( !event_detail || !event_detail.description ) {
        Log.warn(`no description for ${chl.Name} - ${this.data.id}: ${event_detail || this.data.desc}`);
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
