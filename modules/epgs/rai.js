
// https://www.raiplay.it/guidatv/

// selezionare tutti i `div.prgtPrograms ul.channels li.channel`
// prendere il data-attribute data-channel (nome) data-channel-path (url)
// request html a
//   https://www.raiplay.it/guidatv/ {channel-path} / DD-MM-YYYY.html?_=Date.now()

const Moment = require('moment');
const Request = require('request-promise');
const Bulk = require('batch-promise');
const ThreadPool = require('../thread_pool');
const Utils = require('../../utils');
const HTMLParser = require('node-html-parser');
const FS = require('fs');

const Path = require('path');

const LOG_NAME = "Rai - "
const Log = Utils.Log;

const BASE_URL = `https://www.raiplay.it`
const GUIDA_TV_URL = `${BASE_URL}/guidatv`;
const CHANNEL_URL = `${BASE_URL}/dirette/{channel}`;
const PALINSESTO_BASE_URL = `${BASE_URL}/palinsesto`;
const ENVETS_SINGLE_CHANNEL = `${PALINSESTO_BASE_URL}/guidatv/{channel}/{date}.html?_={ts}`;
const LOGO_CHANNEL_URL = 'https://s3.eu-west-1.amazonaws.com/static.guidatv.quotidiano.net/img/loghi_tv/{channel}.png';


const LOGO_MAP = {
  'rai-1': LOGO_CHANNEL_URL.replace('{channel}', 'rai_1'),
  'rai-2': LOGO_CHANNEL_URL.replace('{channel}', 'rai_2'),
  'rai-3': LOGO_CHANNEL_URL.replace('{channel}', 'rai_3'),
  'rai-4': LOGO_CHANNEL_URL.replace('{channel}', 'rai_4'),
  'rai-5': LOGO_CHANNEL_URL.replace('{channel}', 'rai_5'),
  'rai-movie': LOGO_CHANNEL_URL.replace('{channel}', 'raisat_movie'),
  'rai-premium': LOGO_CHANNEL_URL.replace('{channel}', 'raisat_premium'),
  'rai-gulp': LOGO_CHANNEL_URL.replace('{channel}', 'rai_gulp'),
  'rai-yoyo': LOGO_CHANNEL_URL.replace('{channel}', 'raisat_yoyo'),
  'rai-storia': LOGO_CHANNEL_URL.replace('{channel}', 'rai_storia'),
  // 'rai-scuola': LOGO_CHANNEL_URL.replace('{channel}', ''),
  // 'rai-news-24': LOGO_CHANNEL_URL.replace('{channel}', ''),
  // 'rai-sport-piu-hd': LOGO_CHANNEL_URL.replace('{channel}', ''),
  'rai-sport': LOGO_CHANNEL_URL.replace('{channel}', 'raisport')
};

const REG_EXP_SEASON_EPISODE = /S(tagione)?\s?(\d+)[\s-]*(E(p)?(isodio)?\s?(\d+))?/i


class RaiEpg {

  constructor() {
    this._channels = [];
  }

  get EPG() {
    return this._channels;
  }

  clear() {
    this._already_loaded = false;
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


  loadChannels() {
    Log.info(`${LOG_NAME} Loading channels from ${GUIDA_TV_URL}`);

    return this.request(GUIDA_TV_URL).then( (html) => {

      let results = this.parseHtml(html);

      this._channels = results.map( c => new Channel(c) );

      Log.info(`${LOG_NAME} found ${this._channels.length} channels`);

    }, (e) => {
      Log.error(`${LOG_NAME} cannot load channels - ${e}`);
    });

  }

  parseHtml(html) {
    const root = HTMLParser.parse(html);
    const result = [];
    const channels = root.querySelectorAll('div.prgtPrograms ul.channels li.channel');

    for ( let chl of channels ) {
      let chl_path = chl.attributes['data-channel-path'];
      let name = chl.attributes['data-channel'] || chl_path;
      if ( !name ) {
        Log.error(`${LOG_NAME} channel '${name || chl_path}' has not a valid name`);
        continue;
      }

      Log.debug(`${LOG_NAME} found channel: ${name}`);

      let id = name.replace(/\s/gi, '-').toLowerCase();
      result.push({
        Id: chl_path,
        Name: name,
        Url: CHANNEL_URL.replace('{channel}', id),
        Logo: chl_path in LOGO_MAP ? LOGO_MAP[ chl_path ] : ''
      });
    }

    return result;

  }

  scrapeEpg(date, details, bulk) {
    return new Promise( (resolve, reject) => {

      Log.info(`${LOG_NAME} Loading channels programs`);
      const all_channel_req = [];
      for( let chl of this._channels ) {
        all_channel_req.push( (res, rej) => {
          chl.loadEvents(date).then( res, rej );
        });
      }


      Bulk( all_channel_req, bulk || 1).then( resolve, reject )

        // let tp = new ThreadPool(10, bulk);

        // let all_events_req = [];
        // if ( details ) {
        //   for( let chl of this._channels ) {
        //     // all_events_req.push( (res, rej) => {
        //     //   chl.loadEventsDetail(date, bulk).then( res, rej );
        //     // });
        //     const programs_to_load = chl.loadEventsDetail(date, bulk, tp);
        //     Log.info(`${LOG_NAME} Preparing details for ${chl.Name} - total: ${programs_to_load.length}`);
        //     all_events_req =  all_events_req.concat( programs_to_load );
        //   }
        // }

        // if ( all_events_req && all_events_req.length > 0 ) {
        //   Log.info(`${LOG_NAME} Loding details for ${all_events_req.length} programs`);
        // }

        // Log.info('Starting ThreadPool');
        // tp.start( () => {
        //   Log.info(`${LOG_NAME} No more request channels and programs - finish`);
        //   tp.terminate( () => {
        //     this._already_loaded = true;
        //     resolve();
        //   });
        // });


      // });


    });
  }

  request(url) {
    Log.debug(`${LOG_NAME} request to ${url}`);
    return Request({
      uri: url
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
    return this.data.Url;
  }

  get Epg() {
    return this._epg;
  }

  constructor(data) {
    this.data = Object.assign({}, data);
    this._epg = {};
  }


  loadEvents(date) {
    let date_str = Moment(date).format('DD-MM-YYYY');
    const epg = this._epg[ date.getTime() ] = [];

    let url = ENVETS_SINGLE_CHANNEL.replace('{channel}', this.Id).replace('{date}', date_str).replace('{ts}', Date.now());

    Log.info(`${LOG_NAME} loading events for ${this.Id}`);

    return this.request( url ).then( (html) => {

      this.parseHtml( html, epg );

      Log.info(`${LOG_NAME} GOT events for ${this.Id}`);

      epg.map( e => e.calculateStartTime(date) );

    }, (err) => {
      Log.error(`${LOG_NAME} error while getting events for ${this.Id}`);
    })

  }


  parseHtml(html, epg) {

    const root = HTMLParser.parse(html);
    const events_els = root.querySelectorAll('li.eventSpan');

    for ( let [i, event_el] of events_els.entries() ) {

      let infobox = event_el.querySelector('div.infoSx');
      if ( !infobox ) {
        Log.error(`${LOG_NAME} cannot get info for event of '${this.Name}'`);
      }

      let name = infobox.querySelector('.info');
      let subtitle = infobox.querySelector('.subtitle');
      let descProgram = infobox.querySelector('.descProgram');
      let pathdl = event_el.attributes['data-pathdl'];
      let ora = event_el.attributes['data-ora'];
      let timespan = event_el.attributes['data-timespan'];
      let img = event_el.attributes['data-img'];


      let name_str = name ? name.structuredText : '';
      let subtitle_str = subtitle ? subtitle.structuredText : '';
      let descProgram_str = descProgram ? descProgram.structuredText : '';

      name_str.replace(/\n/g, ' ').replace(/"/gi, '').trim()

      if ( !ora ) {
        Log.warn(`${LOG_NAME} invalid time-start value for '${name}' of '${this.Name}'`);
        continue;
      }

      const match = name_str.match( REG_EXP_SEASON_EPISODE );
      let episode = '';
      if ( match && match.length && match[2]) {
        let s = parseInt(match[2], 10);
        let e = parseInt(match[6], 10);

        episode = `${s ? s - 1 : ''}.${e ? e - 1 : ''}.`;
      }

      let evt = new Event({
        id: `prog-${this.Id}-${i + 1}`,
        dur: parseInt(timespan, 10),
        title: name_str,
        genre: subtitle_str.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
        subgenre: subtitle_str.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
        thumbnail_url: `${BASE_URL}${img}`,
        description: descProgram_str.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
        desc: (subtitle_str || descProgram_str).replace(/\n/g, ' ').replace(/"/gi, '').trim(),
        prima: false,
        starttime: ora,
        url: `${BASE_URL}${pathdl}`,
        episode
      });

      epg.push(evt);

    }

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

  }


  request(url) {
    return Request({
      uri: url,
      timeout: 0
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
    return this.data.thumbnail_url
  }
  get Description() {
    return this.data.description || this.data.desc;
  }
  get Episode() {
    return this.data.episode;
  }

  get Url() {
    return this.data.url;
  }

  get Date() {
    return this.data.date;
  }
  get Director() {
    return this.data.director;
  }

  get Actors() {
    let acts = this.data.actors;
    if ( typeof acts == 'string' ) {
      return acts.split(',').map( (a) => {
        return a.trim();
      });
    }
    return acts;
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
    opts.episode = data.Episode || data.episode;
    opts.date = data.Date || data.date;
    opts.director = data.Director || data.director;
    opts.actors = data.Actors || data.actors;

    opts.url = data.Url || data.url;

    this.data = Object.assign({}, opts);
    if ( data.Start ) {
      this._start = new Date(data.Start);
    }
  }

  calculateStartTime(refdate) {
    this._start = getEPGDate(refdate, this.data.starttime);
  }

  loadDetails(chl) {

  }

  parseHtml(html) {
    parseHtmlEvent.call(this, html);
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
module.exports = {RaiEpg}
