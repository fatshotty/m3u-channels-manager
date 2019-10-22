const Url = require('url');
const HTTPS = require("https");
const HTTP = require("http");
const XMLWriter = require('xml-writer');
const Winston = require('winston');
const Moment = require('moment');
const Path = require('path');
const Constant = require('./constants.json');


const PVR_GENRE_INDEX = 0;
const TV_HEAD_PVR_GENRE_INDEX = 1;


let WinstonTransportFile = new Winston.transports.File({ filename: `${calculatePath(__filename)}/manager.log` , level: 'info', format: Winston.format.simple(), 'timestamp':true });
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


function createXMLTV(EPG, SHIFT, DETAILED, ASSOCIATIONS) {

  if ( ! Array.isArray(SHIFT) ) {
    SHIFT = [SHIFT];
  }

  if ( SHIFT[0] !== 0 ) {
    SHIFT.unshift( 0 );
  }


  Log.info('creating XMLTV');
  Log.debug(`Shift hours ${SHIFT.join(', ')}`)

  const XW = new XMLWriter();
  XW.startDocument('1.0', 'UTF-8');
  const TV = XW.startElement('tv');
  TV.writeAttribute('source-info-name', 'EPG');
  TV.writeAttribute('generator-info-name', 'simple tv grab it');
  TV.writeAttribute('generator-info-url', '');

  let module_names = Object.keys(EPG);


  // LOOP FOR CHANNELs
  for ( let module_name of module_names ) {

    let association_module = null;

    if ( ASSOCIATIONS ) {
      if ( ! (module_name in ASSOCIATIONS) ) {
        Log.info(`${module_name} epg-module will be skipped`);
        // next module
        continue;
      }
      association_module = ASSOCIATIONS[ module_name ];
    }

    let module_channel_list = EPG[ module_name ];

    for( let CHL of module_channel_list ) {

      let OriginalIdEpg = CHL.IdEpg;

      if ( association_module ) {
        if ( ! (OriginalIdEpg in association_module) ) {
          Log.debug(`${OriginalIdEpg} of ${module_name} has not been requested, skip!`);
          continue;
        }
        OriginalIdEpg = association_module[ OriginalIdEpg ] || OriginalIdEpg;
      }


      for ( let shift of SHIFT ) {
        let IdEpg = OriginalIdEpg;

        const chl_id = shift ? `${IdEpg} +${shift}` : IdEpg;

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

  }


  // LOOP FOR PROGRAMMEs

  for ( let module_name of module_names ) {

    let association_module = null;

    if ( ASSOCIATIONS ) {
      if ( ! (module_name in ASSOCIATIONS) ) {
        Log.info(`${module_name} epg-module will be skipped`);
        // next module
        continue;
      }
      association_module = ASSOCIATIONS[ module_name ];
    }

    let module_channel_list = EPG[ module_name ];


    for( let CHL of module_channel_list ) {

      let OriginalIdEpg = CHL.IdEpg;

      if ( association_module ) {
        if ( ! (OriginalIdEpg in association_module) ) {
          Log.debug(`${OriginalIdEpg} of ${module_name} has not been requested, skip!`);
          continue;
        }
        OriginalIdEpg = association_module[ OriginalIdEpg ] || OriginalIdEpg;
      }


      for( let shift of SHIFT ) {
        let IdEpg = OriginalIdEpg;

        const chl_id = shift ? `${IdEpg} +${shift}` : IdEpg;

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

            const prg_title = PRG.Title;
            if ( PRG.prima ) {
              prg_title += ' 1^TV';
            }
            const title_el = prg_el.startElement('title').writeAttribute('lang', 'it')
                    .text(prg_title || '')
                    .endElement();


            const description_el = prg_el.startElement('desc').writeAttribute('lang', 'it')
            if ( PRG.Description ) {
              description_el.text(PRG.Description || '');
            }
            description_el.endElement();


            const subtitles_el = prg_el.startElement('sub-title').writeAttribute('lang', 'it')
            if ( PRG.data.desc ) {
              subtitles_el.text( PRG.data.desc.substring(0, 50) );
            }
            subtitles_el.endElement();

            const genre_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                    .text(PRG.Genre || PRG.Subgenre || '')
                    .endElement();

            if ( DETAILED !== false ) {

              // print all data if detailed requested

              let category;
              category = extractCategoryByGenre(PRG.Genre, PRG.Subgenre, PVR_GENRE_INDEX);
              Log.debug(`extracted PVR category: ${category}`);
              if ( category ) {
                const category_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                        .text( category )
                        .endElement();
              }

              category = extractCategoryByGenre(PRG.Genre, PRG.Subgenre, TV_HEAD_PVR_GENRE_INDEX);
              Log.debug(`extracted TvHeadEnd category : ${category}`);
              if ( category ) {
                const category_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                        .text( category )
                        .endElement();
              }

              const subgenre_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                      .text(PRG.Subgenre || '')
                      .endElement();

              const country_el = prg_el.startElement('country')
                      .text('IT')
                      .endElement();

              if ( PRG.Poster ) {
                const thumbnail_url_el = prg_el.startElement('icon')
                        .text(PRG.Poster || '')
                        .endElement();
              }


              if ( PRG.Date ) {
                const date_el = prg_el.startElement('date')
                      .text( PRG.Date )
                      .endElement();
              }

              if ( PRG.Director || (PRG.Actors && PRG.Actors.length > 0) ) {
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
              }


              if ( PRG.Episode ) {
                let _epidose_str = PRG.Episode;

                prg_el.startElement('episode-num')
                      .writeAttribute('system', 'xmltv_ns')
                      .text( _epidose_str )
                      .endElement();

                let _eps = _epidose_str.split('.');
                let s = parseInt(_eps[0], 10 );
                let e = parseInt(_eps[1], 10 );
                s = s || s == '0' ? `S${s + 1}` : false;
                if ( s ) {
                  e = e || e == '0' ? `E${e + 1}` : '';
                  prg_el.startElement('episode-num')
                      .writeAttribute('system', 'onscreen')
                      .text( `${s}${e}` )
                      .endElement();
                }


              }
            }

            prg_el.endElement();
          }
        }

      }

    }
  }

  TV.endElement();
  XW.endDocument();

  return XW;
}



function extractCategoryByGenre(genre, subgenre, index) {

  genre = `${genre || ''}`.toLowerCase();
  subgenre = `${subgenre || ''}`.toLowerCase();

  // Arts / Culture (without music)
  // Children's / Youth programs
  // Education / Science / Factual topics
  // Leisure hobbies
  // Movie / Drama
  // Music / Ballet / Dance
  // News / Current affairs
  // Show / Game show
  // Social / Political issues / Economics
  // Sports


  // TV HEAD END

  // genre = ` ${genre} `.toLowerCase();

  // Log.debug(`extracting cateogry from ${genre}`);

  // if ( genre.indexOf(` musica ` ) > -1 ) {
  //   return 'Music / Ballet / Dance';
  // } else if (  genre.indexOf( ' informazione ' ) > -1  || genre.indexOf( ' notiziario ' ) > -1  ) {
  //   return 'News / Current affairs';
  // } else if (  genre.indexOf( ' mondo ' ) > -1  || genre.indexOf( ' tendenze ' ) > -1  ) {
  //   return 'Education / Science / Factual topics';
  // } else if ( genre.indexOf(` educational ` ) > -1 ) {
  //   return 'Education / Science / Factual topics'
  // } else if ( genre.indexOf(` cartoni animati ` ) > -1 ) {
  //   return 'Children\'s / Youth programs';
  // } else if ( genre.indexOf(` notizie ` ) > -1 ) {
  //   return 'News / Current affairs';
  // } else if ( genre.indexOf(` storia ` ) > -1 ) {
  //   return 'Arts / Culture'
  // } else if ( genre.indexOf(`sport` ) > -1 ) {
  //   return 'Sports';
  // } else {
  //   return null
  // }


  // any KODI PVR

  Log.debug(`extracting category from ${genre}`);

  let Categories = Constant.Categories;

  if ( genre in Categories ) {
    Log.debug(`found category ${genre}`);
    let subCategories = Categories[ genre ];
    let def = subCategories.Default;
    if ( subgenre in subCategories ) {
      Log.debug(`found sub-category ${subgenre}`);
      return subCategories[ subgenre ][ index ];
    }
    Log.debug(`using default sub-category`);
    return def ? def[ index ] : null;
  }

  return null

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
