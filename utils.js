const URL = require('url');
const HTTPS = require("https");
const HTTP = require("http");
const XMLWriter = require('xml-writer');
const Winston = require('winston');


let WinstonTransportFile;
let Log = Winston.createLogger({
  level: 'info',
  // format: winston.format.json(),
  // defaultMeta: { service: 'user-service' },
  transports: []
});

function setLogLevel(level) {
  if ( ! WinstonTransportFile ) {
    WinstonTransportFile = new Winston.transports.File({ filename: Config.Log , level: 'info', format: Winston.format.simple() })
    Log.add(WinstonTransportFile)
  }
  WinstonTransportFile.level = level || Config.LogLevel || 'info';
}

function cleanUpString( str ) {
  return str ? str.replace( /^"|"$/g, '' ) : str;
}


function request(url, headers, callback, streaming) {

  const urlObj = URL.parse( url );

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
    } else if ( res.statusCode >= 400 ) {
      callback( true, null );
    }
  });
}



function createXMLTV(EPG, SHIFT) {

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
  for( let CHL of EPG ) {
    for ( let shift of SHIFT ) {
      const chl_id = shift ? `${CHL.Id}-${shift}` : CHL.Id;

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

      if ( !shift ) {
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

    for( let shift of SHIFT ) {
      const chl_id = shift ? `${CHL.Id}-${shift}` : CHL.Id;

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

          const id_el = prg_el.startElement('id')
                  .text(PRG.Id)
                  .endElement();
          const pid_el = prg_el.startElement('pid')
                  .text(PRG.Pid)
                  .endElement();
          const prg_title = PRG.Title;
          if ( PRG.prima ) {
            prg_title += ' 1^TV';
          }
          const title_el = prg_el.startElement('title').writeAttribute('lang', 'it')
                  .text(prg_title)
                  .endElement();
          const genre_el = prg_el.startElement('category').writeAttribute('lang', 'it')
                  .text(PRG.Genre)
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
                  .text(PRG.Description)
                  .endElement();
          const country_el = prg_el.startElement('country')
                  .text('IT')
                  .endElement();
          const subtitles_el = prg_el.startElement('sub-title').writeAttribute('lang', 'it')
                  .text( PRG.data.desc )
                  .endElement();
          const credits_el = prg_el.startElement('credits')
                  .endElement();


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


module.exports = {cleanUpString, request, createXMLTV, Log, setLogLevel};
