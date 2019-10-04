import $ from 'jquery';
import './app'
import Vue from 'vue'

import group_template from '../../views/m3u/components/group.pug';
import channel_template from '../../views/m3u/components/channel.pug';

const PATH = '/tv';

const UnCheckAll = $('#uncheckall');

const UL_GROUPS = $('#groups');

let PERSONAL = null;


$.get(`${PATH}/personal.json`).then( (groups) => {
  PERSONAL = groups || [];
});


const VM = new Vue({
  el: '#m3u-manager-page',
  data: {
    groups: []
  },

  created() {

    $.get(`${PATH}/groups.json`).then( (groups) => {
      this.groups.splice( 0, this.groups.length, ...groups );
    });

  },

  computed: {
  },

  watch: {
  },

  methods: {
    unselectAll() {
      this.$emit('unselect-all');
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
        url: `${PATH}/personal`,
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

  props: ['group'],

  data: function() {
    return {
      channels: [],
      chlShown: false
    }
  },

  created() {
  },

  mounted() {

  },


  watch: {
  },


  computed: {
    selectedChannelIds() {
      return (PERSONAL && (PERSONAL[ this.group.id ] || {})) || {};
    }
  },


  methods: {
    showChannels() {
      let p = Promise.resolve();
      if ( this.channels.length <= 0 ) {
        p = new Promise( (resolve, reject) => {
          $.get(`${PATH}/list/${this.group.id}.json?`).done( (channels) => {
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
      let result = {};
      for ( let comp_ch of this.$children ) {
        let ch_componentTag = comp_ch.$options._componentTag.toLowerCase();
        if ( ch_componentTag == 'channel' ) {
          if ( comp_ch.isEnabled ) {
            result[ comp_ch.channel.Id ] = comp_ch.channel_ref;
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
      selected_epg: '',
    }
  },

  created() {
    if ( this.selectedId ) {
      this.channel_ref = `${this.selectedId}`;
      this.selected_epg = `${this.selectedId}`;
      this.isEnabled = true;
    }

    VM.$on('unselect-all', ()=> {
      this.isEnabled = false;
    })
  },

  mounted() {

  },


  watch: {
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
      this.channel_ref = this.selected_epg;
      this.cancelEdit();
    },
    cancelEdit() {
      this.isEdit = false;
    }
  }

});

