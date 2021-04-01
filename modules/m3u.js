const Utils = require('../utils');
const Log = Utils.Log;
const cleanUpString = Utils.cleanUpString;
const Readline = require('readline');
const FS = require('fs');

class M3U {

  constructor(name, baseUrl, rewriteUrl) {
    this.Name = name;
    this.groups = [];
    this.headers = {};
    this._baseUrl = baseUrl ? baseUrl : '';
    this._rewriteUrl = rewriteUrl;
    Log.debug(`M3U module instanciated using a baseurl '${baseUrl}'`);
  }

  clear() {
    this.groups = [];
    this.headers = {};
  }

  getGroup(name) {

    for( let g of this.groups ) {
      if ( g.Name == name ) {
        return g;
      }
    }

    for( let g of this.groups ) {
      if ( g.Id == name ) {
        return g;
      }
    }

    return null;
  }

  getGroupById(id) {

    for( let g of this.groups ) {
      if ( g.Id == name ) {
        return g;
      }
    }

    return null;
  }

  getGroupById(id) {
    for( let g of this.groups ) {
      if ( g.Id == id ) {
        return g;
      }
    }
  }

  getChannelById(id, group) {

    let groups = this.groups;

    if ( group ) {
      const g = this.getGroup(group);
      if ( g ) {
        groups = [ g ];
      }
    }

    for( let g of groups ) {
      for ( let c of g.channels ) {
        if ( c.Id == id ) {
          return c;
        }
      }
    }

    return null;
  }

  getChannelByGroupId(chlId, grpId) {
    let groups = this.groups;

    if ( group ) {
      const g = this.getGroupById(grpId);
      if ( g ) {
        groups = [ g ];
      }
    }

    for( let g of groups ) {
      for ( let c of g.channels ) {
        if ( c.Id == id ) {
          return c;
        }
      }
    }

    return null;
  }



  async loadFromFile(file) {
    let fileStream = FS.createReadStream(file);
    const rl = Readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    // Note: we use the crlfDelay option to recognize all instances of CR LF
    // ('\r\n') in input.txt as a single line break.

    const channels = [];
    let parse_header = true;
    let channel_index = 0;
    Log.debug(`start reading m3u cache file ${file}`);

    for await (let row of rl) {
      row = row.replace(/\r/, '');
      if ( row.length <= 0) continue;

      if ( parse_header ) {
        // Each line in input.txt will be successively available here as `line`.

        if ( !row ) continue;
        if ( row.indexOf('#EXTM3U') === 0 ) {
          // skip header
          continue;
        }
        if ( row.indexOf('#') === 0 ){
          const parts = row.match( /([\w\-]+)+:(.*)/ );
          if ( parts && parts[1] &&  parts[1].startsWith('EXT') && ! parts[1].endsWith('INF') ) {
            this.headers[ parts[1].toLowerCase() ] = cleanUpString( parts[2] ).trim();
            continue;
          }
        }

        Log.debug(`headers found ${Object.keys(this.headers).length}`);
        Log.debug('getting channels');
      }

      parse_header = false;

      if ( row.indexOf('#EXTM3U') === 0 ) {
        // skip header
        Log.error('** DUPLICATE LIST ** CANNOT CONTINUE READING CHANNELS list');
        break;
      }


      if ( row.indexOf('#') === 0 ) {
        // get data
        const obj_channel = channels[ channel_index ] ||  (channels[ channel_index ] = {extra: {}, props: []});

        const parts = row.match( /([\w\-]+)+:(.*)/ );

        if ( parts && parts[1] ) {

          switch ( parts[1] ) {
            case 'EXTINF':
              if ( parts[2] ) {
                let infos = parts[ 2 ];
                infos = infos.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g);
                let details = infos.shift(), name = infos.join(',');
                obj_channel.name = cleanUpString(name);
                if ( details ) {
                  details = details.split( /\s(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g );
                  obj_channel.duration = details.shift();
                  for( let detail of details ) {
                    if (!detail) continue;
                    const dets = detail.split('=');
                    obj_channel[ dets[0].toLowerCase() ] = cleanUpString(dets[1]);
                  }
                }
              }
              break;
            case 'EXT-X-STREAM-INF':
              let infos = parts[ 2 ];
              infos = infos.split( /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g );
              for( let j = 0, info; info = infos[ j++ ]; ) {
                const kv = info.split('=');
                obj_channel.extra[ kv[0].toLowerCase() ] = kv[1];
              }
              break;
            default:
              obj_channel.props.push( row );
          }

        }


      } else {
        const obj = channels[ channel_index++ ] || {};
        obj.redirect = this._baseUrl;
        obj.link = row;
      }
    }

    Log.info(`${this.Name} loaded ${channels.length} channels`);
    // Organize list
    this.organize( channels );
    this.sort();
    let chl_count = 0;
    for( let g of this.groups ) {
      chl_count += g.channels.length;
    }
    Log.info(`${this.Name} Loaded ${this.groups.length} groups and ${chl_count} channels`);

  }


   // load(string) {

  //   Log.debug('Parsing m3u list');

  //   const data = string.split('\n').filter( str => str.length > 0 );

  //   const channels = [];
  //   let row;

  //   while( row = data.shift() ) {
  //     row = row.replace(/\r/, '');
  //     if ( !row ) continue;
  //     parseHeader(row);

  //     // restore removed row
  //     data.unshift(row);
  //     break;
  //   }

  //   Log.debug(`headers found ${Object.keys(this.headers).length}`);

  //   Log.debug('getting channels');


  //   for( let i = 0; row = data[ i ]; i++ ) {
  //     row = row.replace(/\r/, '');

  //     if ( row.indexOf('#EXTM3U') === 0 ) {
  //       // skip header
  //       Log.error('** DUPLICATE LIST ** CANNOT CONTINUE READING CHANNELS list');
  //       break;
  //     }

  //     if ( i % 100 === 0 ) {
  //       Log.debug( `parsing channel ${i}`);
  //     }

  //     if ( row.indexOf('#') === 0 ) {
  //       // get data
  //       const obj_channel = channels[ channel_index ] ||  (channels[ channel_index ] = {});

  //       const parts = row.match( /([\w\-]+)+:(.*)/ );

  //       if ( parts && parts[1] ) {

  //         switch ( parts[1] ) {
  //           case 'EXTINF':
  //             if ( parts[2] ) {
  //               let infos = parts[ 2 ];
  //               infos = infos.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g);
  //               let details = infos.shift(), name = infos.join(',');
  //               obj_channel.name = cleanUpString(name);
  //               if ( details ) {
  //                 details = details.split( /\s(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g );
  //                 obj_channel.duration = details.shift();
  //                 for( let j = 0, detail; detail = details[j++]; ) {
  //                   const dets = detail.split('=');
  //                   obj_channel[ dets[0].toLowerCase() ] = cleanUpString(dets[1]);
  //                 }
  //               }
  //             }
  //             break;
  //           case 'EXT-X-STREAM-INF':
  //             let infos = parts[ 2 ];
  //             infos = infos.split( /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g );
  //             for( let j = 0, info; info = infos[ j++ ]; ) {
  //               const kv = info.split('=');
  //               obj_channel[ kv[0].toLowerCase() ] = cleanUpString(kv[1]);
  //             }
  //         }

  //       }


  //     } else {
  //       const obj = channels[ channel_index++ ] || {};
  //       obj.redirect = this._baseUrl;
  //       obj.link = row;
  //     }

  //   }

  //   Log.info(`loaded ${channels.length} channels`);

  //   // Organize list
  //   this.organize( channels );
  //   this.sort();

  //   let chl_count = 0;
  //   for( let g of this.groups ) {
  //     chl_count += g.channels.length;
  //   }

  //   Log.info(`Loaded ${this.groups.length} groups and ${chl_count} channels`);

  // }


  organize(channels) {

    Log.debug(`splitting channels by groups (${this.Name})`);

    for ( let [i, channel] of channels.entries() ) {
      if ( !channel ) {
        Log.warn(`${i} invalid channel`);
        continue;
      }
      let name = channel['name'];
      let link = channel['link']

      if ( !name && !link ) {
        Log.warn(`No channel at index ${i} - Data: '${Object.keys(channel)}' - SKIP!`);
        continue;
      }

      if ( !name ) {
        const temp_name = `NO_NAME_${i}`;
        Log.warn(`No channel name at index ${i}. Use a custom one ${temp_name}`);
        name = channel['name'] = temp_name;
      }

      if ( name && (name.startsWith('---') || name.startsWith('===')) ) {
        continue;
      }

      let value = channel[ 'group-title' ] || '-unknown-';

      if ( value.startsWith('---') || value.startsWith('===') ) {
        continue;
      }

      let group = this.getGroup( value );
      if ( !group ) {
        Log.debug(`-- new group found ${value}`);
        group = new Group( value );
        this.groups.push( group );
      }
      Log.debug(`adding '${name}' to group '${value}'`);
      group.createAddChannel( channel );
    }

  }


  sort() {
    Log.debug('sorting groups and channels');
    this.groups.sort( (g1, g2) => {
      return g1.Name > g2.Name ? 1 : -1
    });

    for( let g of this.groups ) {
      g.channels.sort( (c1, c2) => {
        return c1.Name > c2.Name ? 1 : -1
      });

    }

  }

  removeGroups(groups) {
    groups = groups || [];

    Log.debug(`clean up M3U by groups ${groups.join(',')}`);

    for ( let i = this.groups.length -1, g; g = this.groups[ i ]; i-- ) {
      for ( let j of groups ) {
        if ( j.toLowerCase() == g.Name.toLowerCase() ) {
          this.groups.splice(i , 1);
          break;
        }
      }
    }

  }


  toJson() {
    const res = {Name: this.Name};
    for ( let g of this.groups ) {
      res[ g.Id ] = g.toJson();
    }
    return res;
  }

  toJSON() {
    return this.toJson();
  }

  toM3U() {
    return ['#EXTM3U', this.groups.map( (g) => { g.toM3U() }) ].join('\n');
  }


}




class Group {

  get Id() {
    return this._id;
  }

  get Name() {
    return this._name;
  }

  constructor(name) {
    this.channels = [];
    this._name = name;
    this._id = this._name
                .replace(/\|/gi, '')
                .replace(/\s/gi, '__')
                .replace(/\//gi, '__')
                .replace(/\+/gi, '__');
  }


  getChannelById(id) {
    return this.channels.filter( c => c.Id == id )[0]
  }

  createAddChannel(data) {
    try {
      const c = new Channel( data );

      let already_existing_channel = this.channels.filter( chl => chl.Id == c.Id );
      if ( already_existing_channel.length > 0 ) {
        let _name = c.Name;

        c.calculateNewId();
        already_existing_channel = this.channels.filter( chl => chl.Id == c.Id );
        if ( already_existing_channel.length > 0 ) {
          Log.info( `channel '${_name}' of '${this.Id}' already exists: it is duplicated and can cause ambigous stream` );
        } else {
          Log.debug( `channel '${_name}' of '${this.Id}' already exists; it has been remapped in '${c.Id}'` )
        }
      }

      c.Group = this;
      this.channels.push( c );
      return c;
    } catch(e) {
      Log.error(`Cannot add channel ${JSON.stringify(data)}`);
    }
  }

  toJson() {
    return this.channels.map( (c) => {return c.toJson()} );
  }

  toJSON() {
    return this.toJson();
  }

  toM3U(header, direct) {
    const res = this.channels.map( (c) => { return c.toM3U(false, direct) } );
    if ( header ) {
      res.unshift('#EXTM3U');
    }
    return res.join('\n');
  }

}

class Channel {

  get Id() {
    return this._id;
  }
  get Name() {
    return this._name;
  }
  get Duration() {
    return this._duration
  }
  get TvgId() {
    return this._tvgId
  }
  get TvgName() {
    return this._tvgName
  }
  get TvgLogo() {
    return this._tvgLogo
  }
  get Number() {
    return this._number;
  }
  get StreamUrl() {
    return this._streamUrl;
  }
  get RedirectUrl() {
    if ( this.StreamUrl.startsWith('plugin://') ) {
      return this.StreamUrl;
    }
    let id = encodeURIComponent(this.Id);
    let group = encodeURIComponent(this._group.Id);
    return this._redirect ? `${this._redirect}?channel=${id}&group=${group}` : this.StreamUrl;
  }

  get Group() {
    return this._group;
  }
  set Group(g) {
    this._group = g;
  }

  get Radio() {
    return String( String(this._radio) == 'true' );
  }

  set Radio(v) {
    this._radio = String( v == 'true' );
  }

  constructor(data) {
    Log.debug(`New Channel found ${data.name} - ${data['tvg-id']}`);
    this._name = data['name'];
    this._duration = data['duration'];
    this._tvgId = data['tvg-id'];
    this._tvgName = data['tvg-name'];
    this._tvgLogo = data['tvg-logo'];
    this._streamUrl = data['link'];

    this._radio = data['radio'];

    this._number = data['tvg-chno'];

    this._streamUrl = (this._streamUrl || '').replace(/\r/, '');

    this._redirect = data['redirect'];

    this._id = (data.id || this._tvgId || this._name.replace(/\s/gi, '__'))
                .replace(/\|/gi, '')
                .replace(/\//gi, '__')
                .replace(/\+/gi, '__');

    this._props = data.props;
    this._extra = data.extra;

    this.Group = null;
  }

  calculateNewId() {
    this._id = (this._name || this._tvgName).replace(/[^\w]/gi, '__');
  }

  clone() {
    return new TempCh( this.toJson(), this._redirect );
  }

  toJson() {
    return {
      Id: this.Id,
      Name: this.Name,
      Duration: this.Duration,
      TvgId: this.TvgId,
      TvgName: this.TvgName,
      TvgLogo: this.TvgLogo,
      Number: this.Number,
      StreamUrl: this.StreamUrl,
      Redirect: this.RedirectUrl,
      GroupId: this.Group.Id,
      GroupName: this.Group.Name,
      Radio: this.Radio == 'true',
      Props: this._props,
      Extra: this._extra
    };
  }

  toJSON() {
    return this.toJson();
  }

  toM3U(header, direct) {
    return this.clone().toM3U(header, direct);
  }
}


class TempCh {
  get Id() {
    return this.data.Id;
  }
  set Id(v) {
    this.data.Id = v;
  }

  get Name() {
    return this.data.Name;
  }
  set Name(v) {
    this.data.Name = v;
  }

  get Radio() {
    return String(this.data.Radio) == 'true';
  }
  set Radio(v) {
    this.data.Radio = String(v == 'true');
  }

  get Duration() {
    return this.data.Duration
  }
  set Duration(v) {
    this.data.Duration = v;
  }

  get TvgId() {
    return this.data.TvgId
  }
  set TvgId(v) {
    this.data.TvgId = v;
  }

  get TvgName() {
    return this.data.TvgName
  }
  set TvgName(v) {
    this.data.TvgName = v;
  }


  get TvgLogo() {
    return this.data.TvgLogo
  }
  set TvgLogo(v) {
    this.data.TvgLogo = v;
  }

  get Number() {
    return this.data.Number;
  }
  set Number(v) {
    this.data.Number = v;
  }

  get StreamUrl() {
    return this.data.StreamUrl;
  }
  set StreamUrl(v) {
    this.data.StreamUrl = v;
  }

  get Redirect() {
    return this.data.Redirect;
  }
  set Redirect(v) {
    this.data.Redirect = v;
  }

  get GroupId() {
    return this.data.GroupId;
  }
  set GroupId(v) {
    this.data.GroupId = v;
  }

  get GroupName() {
    return this.data.GroupName;
  }
  set GroupName(v) {
    this.data.GroupName = v;
  }

  get Props() {
    return this.data.Props;
  }

  get Extra() {
    return this.data.Extra;
  }


  constructor(data, basepath) {
    this.data = data;
  }

  toM3U(header, direct) {
    const res = [];

    for ( let prop of this.data.Props ) {
      res.push( `${prop}` );
    }

    let keys = Object.keys(this.data.Extra);
    let str = [];
    for ( let key of keys ) {
      str.push(`${key}=${this.data.Extra[key]}`);
    }
    if ( str.length ) {
      res.push(`#EXT-X-STREAM-INF:${str.join(',')}`);
    }

    const row = []
    row.push(`#EXTINF:${this.Duration || -1}`);
    row.push( `tvg-id="${this.TvgId || ''}"`);

    if ( this.Radio ) {
      row.push( 'radio="true"' );
    }

    if ( ! `${this.TvgLogo}`.startsWith('data:image') ) {
      row.push( `tvg-logo="${this.TvgLogo || ''}"`);
    }
    row.push( `tvg-name="${this.TvgName || ''}"`);

    row.push( `tvg-chno="${this.Number || ''}"`);

    row.push( `group-title="${this.GroupName}"`);

    res.push(`${row.join(' ')},${this.Name}`, direct ? this.StreamUrl : this.Redirect);
    if ( header ) {
      res.unshift('#EXTM3U');
    }

    return res.join('\n');
  }

}


module.exports = {M3U, Group, Channel};
