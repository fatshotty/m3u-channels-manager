const Utils = require('../utils');
const Log = Utils.Log;
const cleanUpString = Utils.cleanUpString;

class M3U {

  constructor(baseUrl) {
    this.groups = [];
    this.headers = {};
    this._baseUrl = baseUrl ? baseUrl : '';
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

  load(string) {

    Log.debug('Parsing m3u list');

    const data = string.split('\n').filter( str => str.length > 0 );

    const channels = [];
    let row;

    Log.debug('gettin headers');

    while( row = data.shift() ) {
      row = row.replace(/\r/, '');
      if ( row.indexOf('#EXTM3U') === 0 ) {
        // skip header
        continue;
      }
      if ( row.indexOf('#') === 0 ){
        const parts = row.match( /([\w\-]+)+:(.*)/ );
        if ( parts && parts[1] && ! parts[1].endsWith('INF') ) {
          this.headers[ parts[1].toLowerCase() ] = cleanUpString( parts[2] ).trim();
          continue;
        }
      }

      // restore removed row
      data.unshift(row);
      break;
    }

    Log.debug(`headers found ${Object.keys(this.headers).length}`);

    Log.debug('getting channels');

    let channel_index = 0;

    for( let i = 0; row = data[ i ]; i++ ) {
      row = row.replace(/\r/, '');

      if ( i % 100 === 0 ) {
        Log.debug( `parsing channel ${i}`);
      }

      if ( row.indexOf('#') === 0 ) {
        // get data
        const obj_channel = channels[ channel_index ] ||  (channels[ channel_index ] = {});

        const parts = row.match( /([\w\-]+)+:(.*)/ );

        if ( parts && parts[1] ) {

          switch ( parts[1] ) {
            case 'EXTINF':
              if ( parts[2] ) {
                let infos = parts[ 2 ];
                infos = infos.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g);
                let details = infos[0], name = infos[1];
                obj_channel.name = cleanUpString(name);
                if ( details ) {
                  details = details.split( /\s(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g );
                  obj_channel.duration = details.shift();
                  for( let j = 0, detail; detail = details[j++]; ) {
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
                obj_channel[ kv[0].toLowerCase() ] = cleanUpString(kv[1]);
              }
          }

        }


      } else {
        const obj = channels[ channel_index++ ] || {};
        obj.redirect = this._baseUrl;
        obj.link = row;
      }

    }

    Log.info(`laoded ${channels.length} channels`);

    // Organize list
    this.organize( channels );
    this.sort();

    let chl_count = 0;
    for( let g of this.groups ) {
      chl_count += g.channels.length;
    }

    Log.info(`Loaded ${this.groups.length} groups and ${chl_count} channels`);

  }


  organize(channels) {

    Log.debug(`splitting channels by groups`);

    for ( let [i, channel] of channels.entries() ) {
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
    const res = {};
    for ( let g of this.groups ) {
      res[ g.Id ] = g.toJson();
    }
    return res;
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

  createAddChannel(data) {
    try {
      const c = new Channel( data );
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

  toM3U(header) {
    const res = this.channels.map( (c) => { return c.toM3U() } );
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
  get StreamUrl() {
    return this._streamUrl;
  }
  get RedirectUrl() {
    return this._redirect ? [this._redirect, this.Id].join('/') : this.StreamUrl;
  }

  get Group() {
    return this._group;
  }
  set Group(g) {
    this._group = g;
  }

  constructor(data) {
    Log.debug(`New Channel found ${data.name} - ${data['tvg-id']}`);
    this._name = data['name'];
    this._duration = data['duration'];
    this._tvgId = data['tvg-id'];
    this._tvgName = data['tvg-name'];
    this._tvgLogo = data['tvg-logo'];
    this._streamUrl = data['link'];

    this._streamUrl = (this._streamUrl || '').replace(/\r/, '');

    this._redirect = data['redirect'];

    this._id = (data.id || this._tvgId || this._name.replace(/\s/gi, '__'))
                .replace(/\|/gi, '')
                .replace(/\//gi, '__')
                .replace(/\+/gi, '__');

    this.Group = null;
  }

  toJson() {
    return {
      Id: this.Id,
      Name: this.Name,
      Duration: this.Duration,
      TvgId: this.TvgId,
      TvgName: this.TvgName,
      TvgLogo: this.TvgLogo,
      StreamUrl: this.StreamUrl,
      Redirect: this.RedirectUrl,
      GroupId: this.Group.Id,
      GroupName: this.Group.Name
    };
  }

  toM3U(header) {
    const row = [`#EXTINF:${this.Duration || -1}`];
    row.push( `tvg-id="${this.TvgId}"`);
    row.push( `tvg-logo="${this.TvgLogo}"`);
    row.push( `tvg-name="${this.TvgName}"`);
    row.push( `group-title="${this.Group.Name}"`);

    const res = [`${row.join(' ')},${this.Name}`, this.RedirectUrl];
    if ( header ) {
      res.unshift('#EXTM3U');
    }

    return res.join('\n');
  }
}


module.exports = {M3U, Group, Channel};
