import $ from 'jquery';
import Vue from 'vue'

import home_template from '../../views/home/settings.pug';

const PATH = '';


let PromSettings = $.get(`${PATH}/settings.json`).then( (setts) => {
  return setts;
});


const VM = new Vue({
  el: '#home-page',
  template: home_template(),
  data: {
    lenLists: 0,
    loaded: false,
    currentM3UTab: 0,
    settings: {}
  },

  created() {
    PromSettings.then( (setts) => {
      this.settings = setts;
      this.lenLists = this.settings.M3U.length;
      this.loaded = true;
    });
  },

  computed: {
    getSettings() {
      return this.settings;
    }
  },

  watch: {
  },

  methods: {
    addNewM3U() {
      this.currentM3UTab = this.settings.M3U.push({
        "Name": `list_${this.lenLists++}`,
        "Url": "",
        "ExcludeGroups": [],
        "UserAgent": "VLC",
        "UseForStream": false,
        "UseFullDomain": true,
        "UseDirectLink": false,
        "Enabled": true
      }) - 1;

    },
    removeM3U(index) {
      this.settings.M3U.splice(index, 1);
      if ( this.currentM3UTab == index ) {
        this.currentM3UTab = Math.max(this.currentM3UTab - 1, 0);
      };
    },

    changeM3UTab(index) {
      this.currentM3UTab = index;
    },

    save() {
      $.post(`${PATH}/settings`, {
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify(this.settings)
      }).then( () => {
        window.location.reload();
      }).catch( (e) => {
        alert(`Error ${e}`);
      });
    }
  }

});
