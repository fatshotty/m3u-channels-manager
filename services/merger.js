
const STREAM_ORDER = [
  'sd',
  'h265',
  'hevc',
  'hd',
  'full hd',
  'fhd',
  'uhd',
  '4k'
];

const RPlus = /\+[\s|\s+]?(\d+)/;

function merge(m3uGroups, Channels, ) {

  const DATA = [];

  for ( let Ch of Channels ) {

    const {chno, chname} = Ch;

    // Ch.streams = {};
    Ch.streams = [];

    const isPlus = RPlus.test(chname);
    const matchPlus = isPlus ? `(?:\\s|\\s+)?\\+?(?:\\s|\\s+)?${chname.match(RPlus)[1]}` : '';
    let chnameReplaced = chname.replace(RPlus, '').trim();

    for ( let gr of m3uGroups ) {

      for ( let ch of gr.channels ) {

        let {Name} = ch;

        // if ( `${isPlus}` !== `${RPlus.test(Name)}` ) {
        //   // skip +1
        //   continue;
        // }

        let newName = Name.replace(RPlus, '$1');

        let r = new RegExp(`^${chnameReplaced}${matchPlus}(?:\\s|\\s+)((U|F(?:ULL)?)?\\s?(H|S)D|H265|HEVC|4k|NVENC)?`, 'i');
        if ( r.test(newName) ) {

          if ( !isPlus ) {
            if ( RPlus.test(Name) ) {
              // Original channel is NOT +1; stream IS +1
              // So it is not matched
              continue;
            }
          }

          const match = newName.match( r );
          const grMatch = match[1] || 'standard';

          const streamQuality = grMatch.toLowerCase().trim();

          let streams = Ch.streams;

          // let streams = [];
          // if ( streamQuality in Ch.streams ){
          //   streams = Ch.streams[ streamQuality ];
          // }

          streams.push({
            q: streamQuality,
            GID: gr.Id,
            GNA: gr.Name,
            CHID: ch.Id,
            CHNA: Name
          });


        }

      }


    }

  }

  for ( let Ch of Channels ) {
    const streams = Ch.streams;
    streams.sort( (s1, s2) => {
      const iS1 = STREAM_ORDER.indexOf(s1.q);
      const iS2 = STREAM_ORDER.indexOf(s2.q);

      return iS1 > iS2 ? 1 : -1;

    });
    Ch.streams = streams.reverse();
  }

  return Channels.sort((c1, c2) => c1.chno > c2.chno ? 1 : -1);

}


module.exports = {merge}
