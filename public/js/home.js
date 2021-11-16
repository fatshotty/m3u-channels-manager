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
      setts.M3U = setts.M3U.map(m => {
        m.TagsStr = m.Tags ? m.Tags.join('; ') : ''
        return m;
      });
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
        "Enabled": true,
        "StreamEnabled": true,
        "RewriteUrl": "",
        "Tags": [],
        'TagsStr': ''
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

      let names = this.settings.M3U.map(m => m.Name = m.Name.replace( /[^\w]/g, '_') );
      let duplicates = false;
      for ( let [i, name] of names.entries() ) {
        if ( !name || names.slice(i+1).indexOf(name) > -1 ) {
          duplicates = true;
          break;
        }
      }

      if ( duplicates ) {
        alert('Ho trovato dei nomi di lista duplicati o non validi. Meglio usare dei nomi validi e univoci');
        return;
      }

      this.settings.M3U.forEach(m => {
        m.Tags = m.TagsStr ? m.TagsStr.split(';').map(t => t.toLowerCase().trim()) : [];
        delete m.TagsStr;
      })

      $.ajax({
        method: 'POST',
        url: `${PATH}/settings.json`,
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({settings: this.settings})
      }).then( () => {
        window.location.reload();
      }).catch( (e) => {
        alert(`Error ${e}`);
      });
    }
  }

});
