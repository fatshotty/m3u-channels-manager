/**

  .guida-tv-content .channel-list .channels section.channel




    a[ href ] ->


 */


const Moment = require('moment');
const Request = require('request-promise');
const Bulk = require('batch-promise');
const ThreadPool = require('../thread_pool');
const Utils = require('../../utils');
const HTMLParser = require('node-html-parser');
const FS = require('fs');

const Path = require('path');

const LOG_NAME = "GuidaTv - "
const Log = Utils.Log;

const BASE_URL = `https://guidatv.quotidiano.net`

const REG_EXP_SEASON_EPISODE = /S(tagione)?\s?(\d+)[\s-]*(E(p)?(isodio)?\s?(\d+))?/i


class GuidaTvEpg {

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
    Log.info(`${LOG_NAME} Loading channels from ${BASE_URL}`);

    return this.request(`${BASE_URL}/`).then( (html) => {

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

    const channels = root.querySelectorAll('.guida-tv-content .channel-list .channels section.channel');

    for ( let chl of channels ) {

      //   a[href]
      //   .channel-logo img[src]
      //   .channel-name (textContent)
      let a_el = chl.querySelector('a');
      let logo_el = chl.querySelector('.channel-logo img');
      let name_el = chl.querySelector('.channel-name');


      if ( a_el && name_el ) {
        let url = a_el.attributes['href'];
        let name = name_el.structuredText;
        let id = name.replace('\s/gi', '_');
        let logo = logo_el ? logo_el.attributes['src'] : '';

        if ( url ) {
          url = `${BASE_URL}${url}`;
        }

        if ( name ) {
          result.push({
            Id: id,
            Name: name,
            Url: url,
            Logo: logo
          });
        } else {
          Log.error(`${LOG_NAME} no name found for channel`);
        }
      }


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

      Bulk( all_channel_req, bulk || 1).then( () => {
        let tp = new ThreadPool(10, bulk);

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

        if ( all_events_req && all_events_req.length > 0 ) {
          Log.info(`${LOG_NAME} Loding details for ${all_events_req.length} programs`);
        }

        Log.info('Starting ThreadPool');
        tp.start( () => {
          Log.info(`${LOG_NAME} No more request channels and programs - finish`);
          tp.terminate( () => {
            resolve();
          });
        });


      })

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

    Log.info(`${LOG_NAME} loading events for ${this.Id}`);

    return new Promise( (resolve, reject) => {
      this.request( this.Url ).then( (html) => {

        this.parseHtml( html, epg );

        Log.info(`${LOG_NAME} GOT events for ${this.Id}`);


        let last_event_loaded;
        for ( let evt of epg ) {
          evt.calculateStartTime(date);
          if ( last_event_loaded ) {
            let dur = new Date(evt.Start) - new Date(last_event_loaded.Start);
            last_event_loaded.data.dur = (dur / 1000) / 60;
          }
          last_event_loaded = evt;
        }

        // remove latest event because it has no "Duration"
        epg.pop()
        resolve();

      }, reject );
    })

  }


  parseHtml(html, epg) {

    const root = HTMLParser.parse(html);
    const events_els = root.querySelectorAll('.channel-list .channels section.channel .programs a.program');

    for ( let [i, event_el] of events_els.entries() ) {

      let url = event_el.attributes['href'];
      let hour_el = event_el.querySelector('.program-time .hour');
      let category_el = event_el.querySelector('.program-info .program-category');
      let title_el = event_el.querySelector('.program-title');
      let stars_el = event_el.querySelector('.program-rating .stars');
      let date_el = event_el.querySelector('.program-rating .year');

      if  ( url ) {
        url = `${BASE_URL}${url}`;
      }

      let hour = hour_el ? hour_el.structuredText : '';
      let category = category_el ? category_el.structuredText : '';
      let title = title_el ? title_el.structuredText : '';
      let stars = stars_el ? stars_el.strcutredText : '';
      let year = date_el ? date_el.structuredText : '';

      if ( !hour ) {
        Log.error(`${LOG_NAME} event has not starttime for channel ${this.Id}`);
        continue;
      }

      let evt = new Event({
        // dur
        id: `prog-${i + 1}`,
        title: title,
        genre: category,
        // thumbnail_url
        // description
        // desc
        // prima
        starttime: hour,
        // episode
        date: year,
        // director
        // actors
        url: url
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

    Log.info(`${LOG_NAME} Starting getting program details for ${this.Name}`);

    const epg = this._epg[ date.getTime() ] || [];

    for( let event of epg ) {

      if ( !event.Url ) {
        Log.warn(`No url for event ${event.Title} for ${this.Name}`);
        continue;
      }

      let data = {
        utils_path: Path.join( __dirname, '..', '..', 'utils'),
        URL: event.Url,
        chl: {
          Name: this.Name
        },
        LOG_NAME: LOG_NAME,
        data: {
          title: event.data.title,
          id: event.data.id
        },
        parseHtmlEvent: parseHtmlEvent
      };

      threadPool.add( data, (params) => {

        const Utils = require( params.utils_path );

        const LOG_NAME = params.LOG_NAME
        const Log = Utils.Log;

        Log.debug(`${LOG_NAME} Loading event details for ${params.chl.Name} - ${params.data.id}`);
        if ( ! params.URL ) {
          Log.info(`${LOG_NAME} Event ${params.data.title} for ${params.chl.Name} has no url`);
          return Promise.resolve();
        }

        const _Req = require('request-promise');
        Log.info(`${LOG_NAME} Try get information from: ${params.URL}`);
        const req = _Req( {
          uri: params.URL
        });


        function _parseHTML_(html) {
          Log.debug(`${LOG_NAME} Loaded event details for ${params.chl.Name} - ${params.data.title}: ${params.data.desc}`);
          let event_detail = params.parseHtmlEvent(html);
          if ( !event_detail || !event_detail.description ) {
            // Log.warn(`${LOG_NAME} no description for ${params.chl.Name} - ${params.data.id}: ${JSON.stringify(event_detail) || params.data.desc}`);
          }
          return event_detail || {};
        }

        return req.then( (html) => {
          return _parseHTML_(html);
        }, (err) => {
          Log.warn(`${LOG_NAME} error getting details ${params.chl.Name} - ${params.data.id} (${params.URL}) - Parsing error - ${err && err.message}`);
        });


      }, (result) => {
        Object.assign( event.data, result || {});
        event.fixEventData && event.fixEventData();
      });


    }
    return epg;

  }


  request(url) {
    return Request({
      uri: url,
      timeout: 0
    });
  }

}


function parseHtmlEvent(html) {
  let HTMLParser = require('node-html-parser');
  let result = {};
  const root = HTMLParser.parse(html);
  const section = root.querySelector('.guida-tv-content .program-details');

  if ( section ) {
    let extra = section.querySelector('.program-additional-info');

    if ( extra ) {

      let subcategory_el = section.querySelector('.program-category');
      let descr_el = section.querySelector('.program-description');
      let director_els = extra.querySelectorAll('.director .program-additional-info-items .program-additional-info-item');
      let cast_els = extra.querySelectorAll('.cast .program-additional-info-items .program-additional-info-item');

      let directors = [];
      for ( let director_el of director_els ) {
        let dir_text = director_el.structuredText;
        // dir_text = dir_text.replace(/(\n)?(\s+)?/gi, ' ');
        dir_text = dir_text.split( ',').map( d => d.trim() );
        directors = directors.concat( dir_text );
      }
      result.director = directors.join(', ');

      let casts = [];
      for ( let cast_el of cast_els ) {
        let dir_text = cast_el.structuredText;
        // dir_text = dir_text.replace(/(\n)?(\s+)?/gi, ' ');
        dir_text = dir_text.split( ',').map( d => d.trim() );
        casts = casts.concat( dir_text );
      }
      result.actors = casts;


      result.subgenre = subcategory_el ? subcategory_el.structuredText : '';

      result.description = descr_el ? descr_el.structuredText : '';
    }

  }

  return result;
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
module.exports = {GuidaTvEpg}
