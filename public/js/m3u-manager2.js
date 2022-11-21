import $ from 'jquery';
import './app'
import Vue from 'vue'

import streams_template from '../../views/m3u/components/streams.pug';
import channel_template from '../../views/m3u/components/channel2.pug';

const PATH = '/tv';

let PERSONAL = null;

let PromPersonal = $.get(`${PATH}/${window.M3U.Name}/personal.json`).then( (groups) => {
  PERSONAL = groups || [];
});


const VM = new Vue({
  el: '#m3u-manager-page',
  data: {
    groups: [],
    channels: []
  },

  created() {
    PromPersonal.then( () => {
      $.get(`${PATH}/${window.M3U.Name}/groups.json`).then( (groups) => {
        // this.groups.splice( 0, this.groups.length, ...groups );

        this.channels.splice(0, this.channels.length, ...PERSONAL);

      });
    })
  },

  computed: {
  },

  watch: {
  },

  methods: {
    selectAll() {
      this.$emit('select-all');
    },
    unselectAll() {
      this.$emit('unselect-all');
    },

    isGroupOpened(id) {
      return id in PERSONAL
    },

    saveAll() {
      let result = [];
      for ( let comp_ch of this.$children ) {
        let gr_componentTag = comp_ch.$options._componentTag.toLowerCase();
        if ( gr_componentTag == 'channel' ) {
          // let chnls = comp_ch.getSelectedChannels();

          // if ( Object.keys(chnls).length > 0 ) {
          //   result[ comp_ch.group.id ] = chnls;
          // }
          result.push( comp_ch.getChannelData() );
        }
      }
      // if ( Object.keys(result).length <= 0  ) {
      //   if ( ! confirm('Nessun canale impostato, procedo ugualmente?') ) {
      //     return;
      //   }
      // }

      $.ajax({
        type: 'POST',
        url: `${PATH}/${window.M3U.Name}/personal`,
        data: JSON.stringify( result ),
        success: function(data) {
          alert('Salvataggio eseguito correttamente');
          window.location.reload();
        },
        error: function() {
          console.info(arguments);
          alert( `Qualcosa è andato storto, controlla il log` );
        },
        contentType: "application/json"
      });

      console.log(result);

    }
  }

});


Vue.component('Channel', {

  template: channel_template(),

  props: ['channel'],

  data: function() {
    return {
      isOpened: false,
      isEnabled: false,
      isEdit: false,
      channel_ref: '',
      channel_num: '',
      selected_epg_str: '',
      selectedEPG: null,
      reuseTvgID: false
    }
  },

  created() {

    this.isEnabled = !this.channel.enabled ? false : !!this.channel.streams.find(s => s.selected);

    this.channel_ref = this.channel.remap;
    this.channel_num = this.channel.chno;

    // if ( this.selectedId && this.selectedId.MapTo ) {
    //   this.channel_ref = `${this.selectedId.MapTo}`;
    //   this.channel_num = `${this.selectedId.Number}`;
    //   this.selected_epg_str = `${this.selectedId.MapTo}`;
    //   this.reuseTvgID = this.selectedId.ReuseID;
    // } else {
    //   this.channel_ref = this.channel.Name;
    //   this.channel_num = this.channel.Number;
    //   this.reuseTvgID = true
    // }

    VM.$on('unselect-all', () => {
      console.log('global unselect')
      this.isEnabled = false;
    })
    this.$parent.$on('unselect-all', () => {
      console.log('single group unselect')
      this.isEnabled = false;
    })
    this.$parent.$on('select-all', () => {
      console.log('single group select')
      this.isEnabled = true;
    })
  },

  mounted() {

  },


  watch: {

    // selected_epg_str: function(nvalue) {
    //   let groups_keys = Object.keys(Channels);
    //   for (let group of groups_keys ) {
    //     let chls = Channels[ group ];
    //     for ( let chl of chls ) {
    //       if ( chl.IdEpg === nvalue ) {
    //         this.selectedEPG = chl;
    //         return;
    //       }
    //     }
    //   }
    //   this.selectedEPG = null;
    // }
  },


  computed: {
    EPG() {
      return Channels;
    },
    innerDefaultEnabled() {
      return this.channel.defaultEnabled;
    }
  },


  methods: {

    openClose() {
      return this.isOpened = !this.isOpened;
    },

    edit() {
      this.isEdit = true;
    },
    saveEdit() {

      const chref = this.channel_ref;
      const chno = this.channel_num;

      if ( ! this.channel_ref ) {
        this.channel.remap = '';
        this.channel.chno = 0;
      } else {

        for (let grp in Channels ) {
          if ( Channels.hasOwnProperty(grp) ) {
            const chls = Channels[grp];
            for ( let chl of chls ) {
              if ( chl.IdEpg === chref ) {
                this.channel.remap = chl.IdEpg;
                this.channel.chno = chl.Number;
                break;
              }
            }
          }
        }

      }
      this.cancelEdit();

    },
    cancelEdit() {
      this.isEdit = false;
      this.channel_ref = this.channel.remap;
      this.channel_num = this.channel.chno;
    },

    getChannelData() {
      const streams = this.getStreamsByChannel();
      return {
        "enabled": this.isEnabled && !!streams.find(s => s.selected),
        "reuseID": this.channel.reuseID,
        "chno": this.channel.chno,
        "remap": this.channel.remap,
        "chname": this.channel.chname,
        "streams": this.getStreamsByChannel()
      }
    },

    getStreamsByChannel() {
      let result = [];
      for ( let comp_streams of this.$children ) {
        let ch_componentTag = comp_streams.$options._componentTag.toLowerCase();
        if ( ch_componentTag == 'streams' ) {
          // result.push({
          //   "ID": comp_streams.channel.Id,
          //   "MapTo": comp_streams.channel_ref || comp_streams.channel.Id,
          //   "Number": comp_streams.channel_num || 0,
          //   "ReuseID": comp_streams.reuseTvgID
          // });
          return comp_streams.getStreamsData()
        }
      }
      return result;
    }
  }

});



Vue.component('Streams', {

  template: streams_template(),

  props: ['channel', 'streams', 'isShown'],

  data: function() {
    return {
      selectedStream: -1,
      chlShown: false
    }
  },

  created() {
    this.selectedStream = this.streams.findIndex(s => s.selected === true)
  },

  mounted() {

  },


  watch: {
  },


  computed: {
  },


  methods: {
    removeStream(index) {
      this.streams.splice(index, 1)
    },
    addStream() {
      this.streams.push({
        "custom": true,
        "q": "standard",
        "selected": false,
        "GID": "",
        "GNA": "",
        "CHID": "",
        "CHNA": ""
      })
    },
    getStreamsData() {
      return this.streams.map((s, i) => {
        s.selected = i === this.selectedStream;
        return s;
      })
    }
  }

});
