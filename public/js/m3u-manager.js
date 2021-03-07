import $ from 'jquery';
import './app'
import Vue from 'vue'

import group_template from '../../views/m3u/components/group.pug';
import channel_template from '../../views/m3u/components/channel.pug';

const PATH = '/tv';

let PERSONAL = null;

let PromPersonal = $.get(`${PATH}/${window.M3U.Name}/personal.json`).then( (groups) => {
  PERSONAL = groups || [];
});


const VM = new Vue({
  el: '#m3u-manager-page',
  data: {
    groups: []
  },

  created() {
    PromPersonal.then( () => {
      $.get(`${PATH}/${window.M3U.Name}/groups.json`).then( (groups) => {
        this.groups.splice( 0, this.groups.length, ...groups );
      });
    })
  },

  computed: {
  },

  watch: {
  },

  methods: {
    unselectAll() {
      this.$emit('unselect-all');
    },

    isGroupOpened(id) {
      return id in PERSONAL
    },

    saveAll() {
      let result = {};
      for ( let comp_gr of this.$children ) {
        let gr_componentTag = comp_gr.$options._componentTag.toLowerCase();
        if ( gr_componentTag == 'group' ) {
          let chnls = comp_gr.getSelectedChannels();

          if ( Object.keys(chnls).length > 0 ) {
            result[ comp_gr.group.id ] = chnls;
          }
        }
      }
      if ( Object.keys(result).length <= 0  ) {
        if ( ! confirm('Nessun canale impostato, procedo ugualmente?') ) {
          return;
        }
      }

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

    }
  }

});


Vue.component('Group', {

  template: group_template(),

  props: ['group', 'opened'],

  data: function() {
    return {
      channels: [],
      chlShown: false
    }
  },

  created() {
    if ( this.opened ) this.showChannels();
  },

  mounted() {

  },


  watch: {
  },


  computed: {
    selectedChannels() {
      return (PERSONAL && (PERSONAL[ this.group.id ] || [])) || [];
    }
  },


  methods: {

    channelSelectedData(chl_id) {
      let arr = this.selectedChannels;
      for ( let chl of arr ) {
        if ( chl.ID == chl_id ) {
          return chl;
        }
      }
      return null;
    },

    showChannels() {
      let p = Promise.resolve();
      if ( this.channels.length <= 0 ) {
        p = new Promise( (resolve, reject) => {
          $.get(`${PATH}/${window.M3U.Name}/list/${this.group.id}.json?`).done( (channels) => {
            this.channels.splice( 0, this.channels.length, ...channels );
            resolve( channels );
          }).catch( () => {
            reject()
          });
        });
      }

      p.then( () => {
        this.chlShown = !this.chlShown;
      })
    },


    getSelectedChannels() {
      let result = [];
      for ( let comp_ch of this.$children ) {
        let ch_componentTag = comp_ch.$options._componentTag.toLowerCase();
        if ( ch_componentTag == 'channel' ) {
          if ( comp_ch.isEnabled ) {
            result.push({
              "ID": comp_ch.channel.Id,
              "MapTo": comp_ch.channel_ref || comp_ch.channel.Id,
              "Number": comp_ch.channel_num || 0
            });
          }
        }
      }
      return result;
    }
  }

});


Vue.component('Channel', {

  template: channel_template(),

  props: ['channel', 'selectedId'],

  data: function() {
    return {
      isEnabled: false,
      isEdit: false,
      channel_ref: '',
      channel_num: '',
      selected_epg_str: '',
      selectedEPG: null
    }
  },

  created() {

    if ( this.selectedId && this.selectedId.MapTo ) {
      this.channel_ref = `${this.selectedId.MapTo}`;
      this.channel_num = `${this.selectedId.Number}`;
      this.selected_epg_str = `${this.selectedId.MapTo}`;
    } else {
      this.channel_ref = this.channel.Name;
      this.channel_num = this.channel.Number;
    }

    this.isEnabled = !!this.selectedId;

    VM.$on('unselect-all', () => {
      this.isEnabled = false;
    })
  },

  mounted() {

  },


  watch: {

    selected_epg_str: function(nvalue) {
      let groups_keys = Object.keys(Channels);
      for (let group of groups_keys ) {
        let chls = Channels[ group ];
        for ( let chl of chls ) {
          if ( chl.IdEpg === nvalue ) {
            this.selectedEPG = chl;
            return;
          }
        }
      }
      this.selectedEPG = null;
    }

  },


  computed: {
    EPG() {
      return Channels;
    }
  },


  methods: {
    edit() {
      this.isEdit = true;
    },
    saveEdit() {
      if ( ! this.selectedEPG ) {
        this.channel_ref = '';
        this.channel_nul = '';
      } else {
        this.channel_ref = this.selectedEPG.IdEpg;
        this.channel_num = this.selectedEPG.Number;
      }

      this.cancelEdit();
    },
    cancelEdit() {
      this.isEdit = false;
    }
  }

});
