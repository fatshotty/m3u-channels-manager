const Url = require('url');
const HTTPS = require("https");
const HTTP = require("http");
const XMLWriter = require('xml-writer');
const Winston = require('winston');
const Moment = require('moment');
const Path = require('path');

let WinstonTransportFile = new Winston.transports.File({ filename: `manager.log` , level: 'info', format: Winston.format.simple(), 'timestamp':true });
let Log = Winston.createLogger({
  level: 'info',
  // format: winston.format.json(),
  // defaultMeta: { service: 'user-service' },
  transports: []
});
Log.add(WinstonTransportFile)

function setLogLevel(level) {
  WinstonTransportFile.level = level || Config.LogLevel || 'info';
}

function cleanUpString( str ) {
  return str ? str.replace( /^"|"$/g, '' ) : str;
}


function request(url, headers, callback, streaming) {

  const urlObj = Url.parse( url );

  const opts = Object.assign(urlObj, {headers: headers});

  const protocol = opts.protocol.toLowerCase();

  if ( ['http:', 'https:'].indexOf(protocol) <= -1 ) {
    callback( 'protocol not supported', url);
    return;
  }

  const MODULE = protocol.indexOf('https') === 0 ? HTTPS : HTTP;

  MODULE.get(opts, (res) => {
    if ( res.statusCode >= 200 && res.statusCode < 300 ) {

      if ( streaming ) {
        return callback(null, res);
      }

      const bufs = [];

      res.on('data', (chunk) => {
        bufs.push(chunk);
      });

      res.on('end', () => {
        const buf = Buffer.concat(bufs);
        const string = buf.toString('utf8');

        Log.debug(`Finish getting data from ${url} ${string.length} bytes`);

        callback( null, string );
      })
    } else /* if ( res.statusCode >= 400 ) */ {
      let error = res.statusCode >= 300 && res.statusCode < 400 ? `url redirects to ${res.headers && res.headers.location}` : res.statusCode;
      callback( error, null );
    }
  });
}


function _URL_(str, base) {
  return new URL(str, base);
}

function urlShouldBeComputed(url, base) {
  if ( typeof url === 'string' ) {
    url = _URL_(url, base);
  }

  const pathname = url.pathname;
  const ext = pathname.split('.').pop();

  return ['htm', 'html', 'm3u', 'm3u8'].indexOf( ext.toLowerCase() ) > -1;
}


function responseToString(res) {
  return new Promise( (resolve, reject) => {
    const buff = [];
    // res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buff.push(chunk);
    });
    res.on('end', () => {
      const b = Buffer.concat(buff);
      const string = b.toString('utf8');
      resolve(string);
    });
  });
}

function calculateNewUrlToCompute(url, base) {

  let nurl = null;
  try {
    nurl = new URL(url, base);
  } catch(e) {
    Log.error(`Cannot resolve url '${url}' based on '${base}'`);
    throw e;
  }

  return computeChannelStreamUrl({StreamUrl: nurl.href});
}


function computeChannelStreamUrl(channel) {

  const chl_url = channel.StreamUrl;

  const sc = urlShouldBeComputed( chl_url );

  const urlObj = Url.parse( chl_url );
  const protocol = urlObj.protocol.toLowerCase();

  Log.debug(`Compute channel stream url for protocol: ${protocol}`);
  return new Promise( (resolve, reject) => {

    if ( !sc ) {
      Log.debug('url doesn\'t need to be computed');
      return resolve( chl_url );
    }

    if ( ['http:', 'https:'].indexOf(protocol) <= -1 ) {
      Log.warn(`stream protocol cannot be computed. Use the original one: ${urlObj.protocol.toLowerCase()}`)
      resolve(chl_url);
      return;
    }

    const MODULE = protocol.indexOf('https') === 0 ? HTTPS : HTTP;
    const chl_url_obj = Url.parse(chl_url);

    const opts = Object.assign(chl_url_obj, {
      method: 'GET',
      headers: {
        "user-agent": "VLC"
      }
    });

    const Req = MODULE.request(opts, (res) => {

      const contentType = res.headers['content-type'];
      const location = res.headers['location'];

      if ( res.statusCode >= 200 && res.statusCode < 300 ) {
        // we have a direct response
        if ( contentType.indexOf('mpegURL') > -1 ) {

          responseToString(res).then( (data) => {
            let schl = null;
            try {
              schl = parseM3U( data );
            } catch(e) {
              Log.error(`Cannot parse m3u while computing due to: ${e}`);
              return resolve( chl_url );
            }

            let cnutc = null;
            try {
              cnutc = calculateNewUrlToCompute(schl.StreamUrl, chl_url);
            } catch(e) {
              return resolve(chl_url);
            }
            cnutc.then( (new_url) => {
              resolve( new_url );
            });

          });
        }

      } else if ( res.statusCode >= 300 && res.statusCode < 400 ) {

        let cnutc = null;
        try {
          cnutc = calculateNewUrlToCompute(location, chl_url);
        } catch(e) {
          return resolve(chl_url);
        }
        cnutc.then( (new_url) => {
          resolve( new_url );
        });

      } else {
        Log.error(`Error while computing stream-url: Status ${res.statusCode}`);
        resolve( chl_url );
      }
    });

    Req.on('error', (e) => {
      Log.error(`An error occurred while computing channel stream-url: ${e}`);
      resolve( chl_url );
    });

    Req.end();
  });

}


function parseM3U(str) {
  const M3UK = require('./modules/m3u').M3U;

  const M3U = new M3UK();
  M3U.load(str);

  return M3U.groups[0].channels[0];
}



function createXMLKodiLive(groups, base_url) {

  const XW = new XMLWriter();
  XW.startDocument('1.0', 'UTF-8');
  const Data = XW.startElement('data');

  const Type = Data.startElement('type');
  Type.writeAttribute('name', 'list');

  for( let group of groups ) {
    const Item = Type.startElement('item');

    const Name = Item.startElement('name');
    Name.text( group.Name );
    Name.endElement();

    const Link = Item.startElement('link');
    Link.text( `${[base_url, group.Id].join('/')}.m3u8` )
    Link.endElement();


    const Icon = Item.startElement('icon');
    Icon.endElement();
    const Fanart = Item.startElement('fanart');
    Fanart.endElement();
    const Color = Item.startElement('color');
    Color.text('green')
    Color.endElement();

    Item.endElement();

  }

  Type.endElement();
  Data.endElement();

  XW.endDocument();

  return XW;
}


function createXMLTV(EPG, SHIFT, GROUPS, ASSOCIATIONS) {

  if ( ! Array.isArray(SHIFT) ) {
    SHIFT = [SHIFT];
  }

  if ( SHIFT[0] !== 0 ) {
    SHIFT.unshift( 0 );
  }

  if ( !GROUPS || GROUPS.length <= 0 ) {
    GROUPS = null;
  }

  Log.info('creating XMLTV');
  Log.debug(`Shift hours ${SHIFT.join(', ')}`)

  const XW = new XMLWriter();
  XW.startDocument('1.0', 'UTF-8');
  const TV = XW.startElement('tv');
  TV.writeAttribute('source-info-name', 'EPG');
  TV.writeAttribute('generator-info-name', 'simple tv grab it');
  TV.writeAttribute('generator-info-url', '');
  for( let CHL of EPG ) {

    if ( GROUPS ) {
      if ( CHL.Group && GROUPS.indexOf( CHL.Group ) <= -1 ) {
        continue;
      }
    }

    for ( let shift of SHIFT ) {
      let IdEpg = CHL.IdEpg;

      if ( ASSOCIATIONS ) {
        if ( ! (IdEpg in ASSOCIATIONS) ) {
          Log.info(`${IdEpg} has not been requested`);
          continue;
        } else {
          Log.info(`${IdEpg} will be written as '${ASSOCIATIONS[ IdEpg ] || IdEpg}'`);
          IdEpg = ASSOCIATIONS[ IdEpg ] || IdEpg;
        }
      }

      const chl_id = shift ? `${IdEpg}-${shift}` : IdEpg;

      const chl_name = shift ? `${CHL.Name} +${shift}` : CHL.Name;
      const chl_el = TV.startElement('channel');
      chl_el.writeAttribute('id', chl_id);
      chl_el.writeAttribute('name', chl_name);
      if ( ! shift ) {
        chl_el.writeAttribute('number', CHL.Number);
      }

      chl_el.startElement('display-name')
        .writeAttribute('lang', 'it')
        .text(chl_name)
        .endElement();

      if ( !shift && CHL.Number ) {
        chl_el.startElement('display-name')
          .writeAttribute('lang', 'it')
          .text(CHL.Number)
          .endElement();
      }

      chl_el.startElement('icon').writeAttribute('src', CHL.Logo).endElement();
      if ( CHL.Url ) {
        chl_el.startElement('url').text( CHL.Url ).endElement();
      }
      chl_el.endElement();
    }
  }


  for( let CHL of EPG ) {

    if ( GROUPS ) {
      if ( CHL.Group && GROUPS.indexOf( CHL.Group ) <= -1 ) {
        continue;
      }
    }

    for( let shift of SHIFT ) {

      let IdEpg = CHL.IdEpg;

      if ( ASSOCIATIONS ) {
        if ( ! (IdEpg in ASSOCIATIONS) ) {
          Log.info(`${IdEpg} has not been requested`);
          continue;
        } else {
          Log.info(`${IdEpg} programs will be written as '${ASSOCIATIONS[ IdEpg ] || IdEpg}'`);
          IdEpg = ASSOCIATIONS[ IdEpg ] || IdEpg;

        }
      }


      const chl_id = shift ? `${IdEpg}-${shift}` : IdEpg;

      const dates = Object.keys( CHL.Epg );

      for ( let datetime_str of dates ) {
        const programs = CHL.Epg[ datetime_str ];

        for ( let PRG of programs ) {

          const prg_el = TV.startElement('programme');

          let starttime = new Date(PRG.Start);
          starttime.setMinutes( starttime.getMinutes() + (60 * shift) );
          prg_el.writeAttribute('start', Moment(starttime).format('YYYYMMDDHHmmss Z').replace(':', '') );

          let endtime = new Date(PRG.Stop);
          endtime.setMinutes( endtime.getMinutes() + (60 * shift) );
          prg_el.writeAttribute('stop', Moment(endtime).format('YYYYMMDDHHmmss Z').replace(':', '') );

          prg_el.writeAttribute('channel', chl_id);

          const id_el = prg_el.startElement('id');
          if ( PRG.Id ) {
            id_el.text(PRG.Id);
          }
          id_el.endElement();
          const pid_el = prg_el.startElement('pid');

          if ( PRG.Pid ) {
            pid_el.text(PRG.Pid);
          }
          pid_el.endElement();

          const prg_title = PRG.Title;
          if ( PRG.prima ) {
            prg_title += ' 1^TV';
          }
          const title_el = prg_el.startElement('title').writeAttribute('lang', 'it')
                  .text(prg_title)
                  .endElement();
          const genre_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                  .text(PRG.Genre || PRG.Subgenre)
                  .endElement();
          const subgenre_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                  .text(PRG.Subgenre)
                  .endElement();
          if ( PRG.Poster ) {
            const thumbnail_url_el = prg_el.startElement('icon')
                    .text(PRG.Poster)
                    .endElement();
          }
          const description_el = prg_el.startElement('desc').writeAttribute('lang', 'it')
          if ( PRG.Description) {
            description_el.text(PRG.Description);
          }
          description_el.endElement();
          const country_el = prg_el.startElement('country')
                  .text('IT')
                  .endElement();


          const subtitles_el = prg_el.startElement('sub-title').writeAttribute('lang', 'it')
          if ( PRG.data.desc ) {
            subtitles_el.text( PRG.data.desc );
          }
          subtitles_el.endElement();

          if ( PRG.Date ) {
            const date_el = prg_el.startElement('date')
                  .text( PRG.Date )
                  .endElement();
          }

          const credits_el = prg_el.startElement('credits')
          if ( PRG.Director ) {
            credits_el.startElement('director')
              .text( PRG.Director )
              .endElement();
          }
          if ( PRG.Actors && PRG.Actors.length > 0) {
            for ( let act of PRG.Actors ){
              if ( !act ) continue;
              credits_el.startElement('actor')
                .text( act )
                .endElement();
            }
          }
          credits_el.endElement();


          if ( PRG.Episode ) {
            prg_el.startElement('episode-num')
                  .writeAttribute('system', 'onscreen')
                  .text( PRG.Episode )
                  .endElement();
          }

          prg_el.endElement();
        }
      }

    }

  }

  TV.endElement();
  XW.endDocument();

  return XW;
}


function calculatePath(filename) {
  const dir = Path.dirname(filename);
  let path = dir.split( Path.sep );
  const index = path.indexOf('node_modules');
  if ( index > -1 ) {
    path = path.splice( 0, index );
  }
  return path.join(Path.sep);
}

module.exports = {cleanUpString, request, createXMLTV, Log, setLogLevel, computeChannelStreamUrl, _URL_, urlShouldBeComputed, calculatePath, createXMLKodiLive};
