const Moment = require('moment');
const Request = require('request-promise');
const Bulk = require('batch-promise');
const ThreadPool = require('../thread_pool');
const Utils = require('../../utils');
const HTMLParser = require('node-html-parser');

const LOG_NAME = "TvSorrisi - "
const Log = Utils.Log;

const BASE_URL = `https://www.sorrisi.com/guidatv`
const URL_CHANNELS = `${BASE_URL}/canali-tv/{category}`
const SINGLE_CHANNEL = `${BASE_URL}/canali-tv/{channel}/`

const REG_EXP_SEASON_EPISODE = /^S.*?([0-9]+).*?E.*?([0-9]+).*/i;

const CATEGORY = [
  // "rai",
  // "mediaset",
  // "sky",
  // "premium",
  // "sky-cinema",
  // "premium-sport",
  // "sky-calcio",
  // "sky-sport"
  ""
];


const SCRAP_LINK = [];
for ( let cat of CATEGORY ) {
  SCRAP_LINK.push( URL_CHANNELS.replace('{category}', cat) );
}


class TvSorrisiEpg {

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


  loadChannels(date, bulk) {

    const ps = [];
    for ( let link of SCRAP_LINK ) {
      ps.push( (resolve, reject) => {
        Log.info(`${LOG_NAME} Loading channels from ${link}`);
        this.request(link).then( (rsp) => {
          const split = link.split('/');
          const last = split.pop() || split.pop();

          let json = this.parseHtml( rsp );

          if ( last ) {
            json.GROUP = last
          }

          resolve( json );
        }, reject);
      });
    }

    return Bulk( ps, bulk || 1 ).then( (all_channels_sky) => {
      // const all_channels_sky = chls.concat( pf ).concat( dig );
      for ( let res of all_channels_sky ) {
        if ( ! Array.isArray(res) ) continue;
        const g = res.GROUP;
        for( let CHL of res ) {
          // const channel_data = {
          //   Id: CHL.id,
          //   Name: CHL.name,
          //   Number: CHL.number,
          //   Service: CHL.service,
          //   Logo: CHL.channelvisore || CHL.channellogonew,
          //   Group: g
          // };
          CHL.Group = g;

          const exists = this.checkExistingChannel( CHL.Id );

          if ( !exists ) {
            this._channels.push( new Channel(CHL) );
          }
        }
      }
      // this._channels.splice(2);
    });


  }

  parseHtml(html) {
    const root = HTMLParser.parse(html);
    const result = [];
    const channels = root.querySelectorAll('div.gtv-wrapper main.gtv-content h3.gtv-mod1-logo');

    for ( let chl of channels ) {
      let a = chl.querySelector('a.gtv-logo');
      let title = a.attributes.title;
      let id = title.replace(/\s/gi, '-').toLowerCase();
      result.push({
        Id: id,
        Name: title,
        Url: a.attributes.href,
        Number: a.attributes['data-channel-number'],
        Service: null,
        Logo: `${BASE_URL}/bundles/tvscnewsite/css/images/loghi/${id}.png`
      });
    }

    return result;
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

      if ( this._already_loaded ) {
        // in case of multiple date. Load only one date
        resolve()
        return;
      }

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

        if ( all_events_req && all_events_req.length > 0 ) {
          Log.info(`${LOG_NAME} Loding details for ${all_events_req.length} programs`);
        }


        tp.start( () => {
          Log.info(`${LOG_NAME} No more request channels and programs - finish`);
          tp.terminate( () => {
            this._already_loaded = true;
            resolve();
          });
        });

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
    let n = this.data.Name;
    if ( n == 'Canale 20') {
      n = 'Mediaset 20'
    } else if ( n == 'TOP Crime' ) {
      n = "Top Crime";
    }
    return n;
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
    const date_str = Moment(date).format('YY_MM_DD');

    Log.info(`${LOG_NAME} Loading EPG for ${this.Name} date ${date_str}`);

    const req = this.request( this.Url );

    const epg = this._epg[ date.getTime() ] = [];

    Log.debug(`${LOG_NAME} Loading events for ${this.Name}`);

    return req.then( ( html ) => {
      this.parseHtml( html, epg );

    }).catch( (err) => {
      Log.error(`${LOG_NAME} Error loading channel ${this.Name} ${date_str}`);
      Log.error(`${LOG_NAME} ${(err || {}).name}`);
    });
  }


  parseHtml(html, epg) {
    const root = HTMLParser.parse(html);
    const programs = root.querySelectorAll('div.gtv-wrapper main.gtv-content article.gtv-program');

    for( let [i, program] of programs.entries() ) {
      try {
        let time = program.querySelector('time');
        let poster = program.querySelector('figure.gtv-program-image img');
        let genre = program.querySelector('div.gtv-program-label');
        let title = program.querySelector('h3.gtv-program-title');
        let a_url = null;
        if ( title ) {
          a_url = title.querySelector('a');
        }
        let descr = program.querySelector('p.gtv-program-abstract');
        let episode = null;
        if ( descr ) {
          episode = descr.querySelector('b');
        }

        if ( !time ) {
          Log.warn( `${LOG_NAME} Program has no time: ${i} for ${this.Name}` );
          continue;
        }

        let starttime = time.attributes['data-start-ts'];
        let endtime = time.attributes['data-end-ts'];

        starttime = new Date( starttime * 1000 );
        endtime = new Date( endtime * 1000 );

        let str_title = title ? title.structuredText : '';
        let str_genre = genre ? genre.structuredText : '';
        let str_thumb = poster && poster.attributes ? poster.attributes.src : '';
        let str_desc = descr ? descr.structuredText : '';
        let str_url = a_url && a_url.attributes ? a_url.attributes.href : '';
        let str_episode = episode ? episode.structuredText : '';

        let evt = new Event({
          id: `prog-${i + 1}`,
          pid: `prog-${i + 1}`,
          dur: (endtime - starttime) / 1000 / 60,
          title: str_title.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
          // genre: str_genre.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
          subgenre: str_genre.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
          thumbnail_url: str_thumb,
          // description: ((descr || {}).text || '').replace(/\n/g, ' ').replace(/"/gi, '').trim(),
          desc: str_desc.replace(/\n/g, ' ').replace(/"/gi, '').trim(),
          prima: false,
          starttime: Moment(starttime).format('HH:mm'),
          Start: starttime,
          Url: str_url,
          Episode: str_episode
        });
        epg.push( evt );
      } catch( e ) {
        Log.error(`${LOG_NAME} Error occurred while parsing ${i} program of ${this.Name}`, e);
      }

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

      let data = {
        URL: event.Url,
        chl: {
          Name: this.Name
        },
        LOG_NAME: LOG_NAME,
        data: {
          title: event.data.title,
          id: event.data.id,
          desc: event.data.desc
        },
        parseHtmlEvent: parseHtmlEvent
      };

      threadPool.add( data, (params) => {

        const Path = require('path');
        const utils_path = Path.join( __dirname, '..', '..', 'utils');
        const Utils = require( utils_path );

        const LOG_NAME = "TvSorrisi - "
        const Log = Utils.Log;

        Log.debug(`${LOG_NAME} Loading event details for ${params.chl.Name} - ${params.data.id}: ${params.data.desc}`);
        if ( ! params.URL ) {
          Log.info(`${LOG_NAME} Event ${params.data.title} for ${params.chl.Name} has no url`);
          return Promise.resolve();
        }

        const _Req = require('request-promise');
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

          if ( err ) {
            if (err.name == 'StatusCodeError') {
              let str = err.message;
              let _index = str.indexOf( '<!DOCTYPE' );
              if ( _index > -1 ) {
                str = str.substring(_index);
              }

              try {
                Log.info(`${LOG_NAME} try to parse error string: ${err.statusCode} for ${params.chl.Name} - ${params.data.id} (${params.URL})`)
                return _parseHTML_(str);
              } catch( e ) {
                Log.warn(`${LOG_NAME} error getting details ${params.chl.Name} - ${params.data.id} (${params.URL}) - Parsing error - ${err}`);
                return;
              }

            }

          }

          Log.warn(`${LOG_NAME} error getting details ${params.chl.Name} - ${params.data.id} (${params.URL}) - Parsing error - ${err && err.message}`);
        });


      }, (result) => {
        Object.assign( event.data, result || {});
      });


    }
    return epg;
  }


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

    Log.debug(`${LOG_NAME} Loading event details for ${chl.Name} - ${this.data.id}: ${this.data.desc}`);
    if ( ! this.Url ) {
      Log.info(`${LOG_NAME} Event ${this.Title} for ${chl.Name} has no url`);
      return Promise.resolve();
    }
    const req = this.request( this.Url );

    return req.then( (html) => {
      Log.debug(`${LOG_NAME} Loaded event details for ${chl.Name} - ${this.Title}: ${this.data.desc}`);
      // Log.debug(JSON.stringify(event_detail));
      let event_detail = this.parseHtml(html);
      if ( !event_detail || !event_detail.description ) {
        Log.warn(`${LOG_NAME} no description for ${chl.Name} - ${this.data.id}: ${JSON.stringify(event_detail) || this.data.desc}`);
      }
      Object.assign(this.data, event_detail || {});
    });

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


function parseHtmlEvent(html) {
  let HTMLParser = require('node-html-parser');
  let result = {};
  const root = HTMLParser.parse(html);
  const section = root.querySelector('main.gtv-content div.gtv-inner-container');
  if ( section ) {
    let extra = section.querySelectorAll('ul li');
    if ( extra ) {
      for ( let ext of extra ) {
        let key_value = ext.structuredText;
        let pairs = key_value.split(':');
        let key = pairs[0];
        let value = pairs[1];
        key = key.toLowerCase().trim();
        switch ( key ) {
          case 'genere':
            result.genre = value.trim();
            break;
          case 'uscita':
            result.date = value.trim();
            break;
          case 'regista':
            result.director = value.trim();
            break;
          case 'cast':
            result.actors = value.trim();
            break;
        }
      }
    }
    let descr = section.querySelector('p.gtv-text');
    if ( descr ) {
      result.description = descr.structuredText;
    }
  }
  return result;
}

module.exports = {TvSorrisiEpg, Channel, Event};
