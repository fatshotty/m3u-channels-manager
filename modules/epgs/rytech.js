const Moment = require('moment');
const Request = require('request');
const GUnzip = require('node-gzip').ungzip
const Xml2Js = require('xml2js');
const Utils = require('../../utils');

const URL_XMLTV = "https://rytec.ricx.nl/epg_data/rytecCH_Basic.gz";

const LOG_NAME = "Rytec - "
const Log = Utils.Log;


const REGEXP_YEAR = /(\(\d{4}\))/i;
const REGEXP_GENRE = /^\[([^\]]+)\]/i;
const REGEXP_EPISODE = /S(tagione)?\s?(\d+)[\s-]*(E(p)?(isodio)?\s?(\d+))?/i

const FIELDS = {
  'genre': REGEXP_GENRE,
  'date': REGEXP_YEAR,
  'episode': REGEXP_EPISODE
};

const SELECTED_CHANNELS = ['RSILa1.ch', 'RSILa2.ch'];


class Rytech {

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

      Log.info(`${LOG_NAME} get xmltv data from remote url rytech`);
      Utils.request(URL_XMLTV, null, (err, response) => {
        let bufs = [];
          response.on('data', function(d){
            bufs.push(d);
          });
          response.on('end', () => {
            let buf = Buffer.concat(bufs);

            Log.info(`${LOG_NAME} got xmlrtv, gunzip`);

            GUnzip( buf ).then( (str_xmltv) => {

              Log.info(`${LOG_NAME} gunzipped, parsing xml`);
              Xml2Js.parseString( str_xmltv, (err, result) => {
                let extracted_programs = {};
                let TV = result.tv;
                if ( TV ) {
                  let channels = TV.channel || [];
                  let programs = TV.programme || [];

                  channels = channels.filter( (chl) => {
                    let $ = chl.$;
                    let id = $.id;

                    return SELECTED_CHANNELS.indexOf( id ) > -1;
                  });


                  for ( let prg of programs ) {
                    let chl_$ = prg.$
                    let chl = chl_$.channel;

                    if ( SELECTED_CHANNELS.indexOf( chl ) > -1 ) {
                      let epg = extracted_programs[ chl ];
                      if ( !epg ) {
                        epg = extracted_programs[ chl ] = [];
                      }
                      epg.push( prg );
                    }

                  }

                  // TODO: build ChannelObject

                  for ( let chl of channels ) {

                    let id = chl.$ && chl.$.id;

                    if ( !id ) {
                      Log.warn(`${LOG_NAME} No ID for channel`);
                      continue;
                    }

                    let displayName = chl['display-name'];
                    if ( displayName && displayName[0] ) {
                      displayName = displayName[0]
                    }
                    if ( displayName ) {
                      // get the text content
                      displayName = displayName._;
                    }

                    let chan = new Channel({
                      Id: id,
                      Name: displayName
                    });

                    chan.programs = extracted_programs[ id ];

                    this._channels.push(chan);

                  }


                } else {
                  Log.error(`${LOG_NAME} invalid xml`);
                }
                Log.info(`${LOG_NAME} ${this._channels.length} found`);
                resolve();
              });
            });

          });
      }, true);

    })

  }


  scrapeEpg(date, details, bulk) {

    return new Promise( (resolve, reject) => {

      for ( let chan of this._channels ) {
        Log.info(`${LOG_NAME} fixing events for channel ${chan.Id}`);
        chan.loadEvents(date);
        if ( details ) {
          Log.info(`${LOG_NAME} fixing events details for channel ${chan.Id}`);
          let allEpg = chan.Epg;
          let dates = Object.keys(allEpg);
          for ( let d of dates ) {
            let evts = allEpg[ d ];
            for ( let evt of evts ) {
              if ( ! evt.Normalized ) {
                Log.debug(`${LOG_NAME} fixing events details for channel ${chan.Id} and event ${evt.Title}`);
                evt.normalize();
              }
            }
          }
        }
      }

      resolve();

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
    return null;
  }

  get Epg() {
    return this._epg;
  }


  set programs(arr) {
    this._programs = arr;
  }

  constructor(data) {
    this.data = Object.assign({}, data);
    this._epg = {};
  }


  loadEvents(date) {
    let next_date = new Date( date.getTime() );
    next_date.setDate( next_date.getDate() + 1 );

    let epg = this._epg[ date.getTime() ] = [];

    for ( let prog of this._programs ) {
      let start = parseDate(prog.$.start);
      let stop = parseDate(prog.$.stop);
      let desc = prog.desc;
      let title = prog.title;
      let subTitle = prog['sub-title'];

      if ( title ) {
        title = title[0]._;
      }

      if ( date > stop ) {
        // do not load previous days
        Log.debug(`${LOG_NAME} skip event because it starts and stops on previous days: ${title}`);
        continue;
      }

      if ( next_date <= start ) {
        // do not load next days
        Log.debug(`${LOG_NAME} skip event because it starts on next days: ${title}`);
        break;
      }

      if ( desc ) {
        desc = desc[0]._;
      }

      if ( subTitle ) {
        subTitle = subTitle[0]._;
      }

      let evt = new Event({
        id: undefined,
        pid: undefined,
        title: title,
        genre: subTitle,
        subgenre: subTitle,
        thumbnail_url: undefined,
        desc: desc,
        description: desc,
        Start: start,
        dur: (((stop - start) / 1000) / 60 ) // convert to minutes
      });

      epg.push( evt );
    }
  }


  toJSON(detailed) {
    const data = {
      Id: this.Id,
      IdEpg: this.IdEpg,
      Name: this.Name
    };
    if ( detailed ) {
      data.Epg = this._epg;
    }
    return data;
  }

 }

function parseDate(str) {

  let y = str.substring(0, 4);
  let m = str.substring(4, 6);
  let d = str.substring(6, 8);
  let h = str.substring(8, 10);
  let min = str.substring(10, 12);
  let s = str.substring(12, 14);

  return new Date( Date.UTC(
    parseInt(y, 10),
    parseInt(m, 10) -1,
    parseInt(d, 10),
    parseInt(h, 10),
    parseInt(min, 10),
    parseInt(s, 10)
  ) );

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
    return this.data.thumbnail_url || '';
  }
  get Description() {
    return this.data.description || this.data.desc;
  }
  get Episode() {
    return this.data.episode || '';
  }
  get Date() {
    return this.data.date;
  }
  get Director() {
    return this.data.director;
  }
  get Actors() {
    return this.data.actors;
  }

  constructor(data) {

    let opts = {};
    opts.desc = data.desc || data.Desc;
    opts.description = data.description || data.Description;
    opts.dur = data.dur || data.Duration;
    opts.episode = data.episode || data.Episode;
    opts.genre = data.genre || data.Genre;
    opts.thumbnail_url = data.thumbnail_url || data.Poster;
    opts.Start = data.Start || data.Start;
    // "Stop": "2019-07-27T22:00:00.000Z",
    opts.subgenre = data.subgenre || data.Subgenre;
    opts.title = data.title || data.Title;

    // opts.dur = data.Duration || data.dur;
    // opts.id =  data.Id || data.id;
    // opts.pid =  data.Pid || data.pid;
    // opts.title =  data.Title || data.title;
    // opts.genre =  data.Genre || data.genre;
    // opts.subgenre =  data.Subgenre || data.subgenre;
    // opts.thumbnail_url =  data.Poster || data.thumbnail_url;
    // opts.description =  data.Description || data.description;
    // opts.desc =  data.Desc || data.desc;
    // opts.prima = data.Prima || data.prima;
    // opts.starttime = data.starttime;

    this.data = Object.assign({}, opts);
    if ( opts.Start ) {
      this._start = new Date(opts.Start);
    }

    this._normalized = false
  }


  get Normalized() {
    return this._normalized;
  }

  normalize() {

    Log.debug(`${LOG_NAME} normalizing: ${this.Title}`);

    this.data.desc = '';

    let descr = this.data.genre || '';
    // if ( descr.toLowerCase().indexOf('(s') > -1 ) {
    //   let temp = '';
    // }
    let fields = Object.keys(FIELDS);
    for ( let field of fields ) {
      let regexp = FIELDS[ field ];
      let matches = descr.match( regexp );
      if ( matches ) {
        let value = cleanString( matches[1] || matches[0] || '' );
        descr = descr.replace( regexp, '' );
        if ( field == 'genre') {
          let values = value.split(',');
          value = values[0];
          this.data.subgenre = cleanString(values[1] || '');
        } else if ( field == 'episode' ) {
          if ( matches && matches.length && matches[2]) {
            let s = parseInt(matches[2], 10);
            let e = parseInt(matches[6], 10);

            value = `${s ? s - 1 : ''}.${e ? e - 1 : ''}.`;
          }
        }

        this.data[field] = cleanString(value);

      }
    }

    this.data.desc = cleanString(descr);

    // fix description and actors
    let description = this.data.description || '';
    let actors = description.split('\n');
    this.data.description = cleanString( actors.shift() || '' );
    this.data.actors = actors || [];

    this._normalized = true;

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

function cleanString(str) {
  return str.replace( /[\[\]\(\)]/gi, ' ' ).trim();
}

module.exports = {Rytech, Channel, Event};
