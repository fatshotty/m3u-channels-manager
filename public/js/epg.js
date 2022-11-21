import $ from 'jquery';
import './app'
import Vue from 'vue'
import moment from 'moment'

import group_template from '../../views/epg/components/module.pug';
import channel_template from '../../views/epg/components/channel.pug';

const PATH = '/epg';


let EventBus = new Vue();


Vue.component('Channel', {

  template: channel_template(),

  props: ['channel'],

  data: function() {
    return {
      selected: true,
      association: '',
      epgShown: false
    }
  },

  created() {
    EventBus.$on('select-all-channels', ({value}) => {
      this.selected = value;
    });
  },

  mounted() {

  },


  watch: {
  },


  computed: {
  },

  methods: {
    showHideEpg() {
      this.epgShown = !this.epgShown;
    },
    transformDate(datets) {
      let ts = Number(datets);
      const date = new Date(ts);
      return moment(date).format('DD/MM/YYYY');
    },
    altTitle(evt) {
      return `${evt.Genre ? '(' + evt.Genre + ') - ' : ''}${evt.Description} ${evt.Episode ? '- (' + evt.Episode + ')' : ''}`
    },
    startStopEvent(evt) {
      return `${moment(evt.Start).format('HH:mm')} - ${moment(evt.Stop).format('HH:mm')}`;
    },
    eventName(evt){
      return `${evt.Title} ${evt.Prima ? ' ^ 1TV' : ''}`
    }
  }

});


Vue.component('Group', {

  template: group_template(),

  props: ['group'],

  data: function() {
    return {
    }
  },

  created() {

  },

  mounted() {

  },


  watch: {
  },


  computed: {
    name: function() {
      return this.group.name;
    },
    channels: function() {
      return this.group.channels;
    }
  },

  methods: {
    getAssociations() {
      let res = {};
      for ( let comp of this.$children ) {
        if ( comp.$options._componentTag.toLowerCase() === 'channel' ) {
          if ( comp.selected ) {
            res[ comp.channel.IdEpg ] = comp.association;
          }
        }
      }
      if ( Object.keys(res).length > 0 ){
        return res;
      }
    }
  }

});

window.VM = new Vue({
  el: '#epg-page',

  data: {
    modules: [],
    selctedAll: true,
    loadedAssociation: '',
    shiftTime: '',
    fullDetailed: false,
    channels_count: 0,
    executing: false
  },

  created() {
    let g_keys = Object.keys(window.Groups);
    for ( let g_key of g_keys ) {
      let chls = window.Groups[ g_key ];
      this.modules.push({
        name: g_key,
        channels: chls
      });
      this.channels_count += chls.length;
    }
  },

  computed: {

  },
  watch: {
    selctedAll: function(new_value) {
      EventBus.$emit('select-all-channels', {value: new_value});
    }
  },
  methods: {


    buildChannels() {
      const rs = confirm(`
        Verrà estratta la lista canali dall'EPG per usarla nelle liste canali.
        Continuare?
      `);
      if ( rs ) {
        this.executing = true;
        $.post(`${PATH}/channels/names`).then( () => {
          alert('Lista canali creata con successo');
          this.executing = false;
          window.location.reload();
        }, () => {
          alert('Si è verificato un errore');
          this.executing = false;
        });
      }
    },

    updateChannels() {
      const rs = confirm(`
        Aggiornando la lista canali verranno perse tutte le informazioni sul palinsesto dei programmi.
        Sarà necessario generare un nuovo EPG.
        Continuare?
      `);
      if ( rs ) {
        this.executing = true;
        $.get(`${PATH}/channels/update`).then( () => {
          alert('Lista canali aggiornata con successo');
          this.executing = false;
          window.location.reload();
        }, () => {
          alert('Si è verificato un errore');
          this.executing = false;
        })
      }
    },

    updateEpg() {
      const res = confirm(`
L'operazione potrebbe richiedere diversi minuti. Si *SCONSIGLIA* di usare il log a debug!!
Controllare il log per assicurarsi che il processo finisca`
      );
      if ( res ) {
        alert('Una volta terminato il processo è necessario ricaricare la pagina');
        let query = [];
        if ( this.shiftTime ) {
          query.push(`shift=${this.shiftTime}`);
        }
        if ( this.fullDetailed ) {
          query.push(`details=1`);
        }
        this.executing = true;
        $.get(`${PATH}/update.xml?${query.join('&')}`).done( (data, textStatus, jqXHR) => {
          alert('EPG generato correttamente e salvato nel file di cache');
          this.executing = false;
        })
        .fail( (jqXHR, textStatus, errorThrown) => {
          if ( textStatus == 'timeout') {
            alert('Il processo sta impiegando più tempo del previsto. Controllare il log per assicurarsi che vada tutto bene');
          } else {
            alert('Si è verificato un errore. Controllare il log');
          }
          this.executing = false;
        });
      }
    },

    saveAssociations() {
      if ( ! confirm('Sei sicuro di voler salvare le nuove associazioni?') ) {
        return;
      }
      let association_name = prompt('Insierisci il nome della nuova associazione', this.loadedAssociation);
      if ( ! association_name || !association_name.trim() ) {
        return;
      }

      association_name = association_name.trim().replace( /[^\w]/gi, '_');

      let modules = {};
      for ( let comp of this.$children ) {
        if ( comp.getAssociations ) {
          let res = comp.getAssociations();
          if ( res ) {
            modules[ comp.name ] = res;
          }
        }
      }

      let result = {
        shift: this.shiftTime,
        detailed: this.fullDetailed,
        channels: modules
      };


      $.ajax({
        type: 'POST',
        url: `${PATH}/associations/${association_name}`,
        data: JSON.stringify( result ),
        success: (data) => {
          alert(
`L'associazione è stata salvata con successo.
Sarà disponibile a questo link:
${document.location.origin}${PATH}/xmltv/${association_name}.xml`
          );
          this.loadedAssociation = association_name;
        },
        error: (xhr, statusText, err) => {
          console.warn(arguments);
          alert(`Errore: ${err}`);
        },
        contentType: "application/json"
      });

    },
    openAssociations() {
      let ass_name = prompt(`Inserire il nome dell'associazione da caricare`);
      if ( !ass_name.trim() ) {
        return;
      }
      $.get(`${PATH}/associations/${ass_name}`).then( (res) => {
        alert('Associazione caricata con successo');


        // TODO: reload channels
        this.shiftTime = res.shift;
        this.fullDetailed = !!res.details;

        this.loadedAssociation = ass_name;

        for ( let comp of this.$children ) {
          if ( comp.$options._componentTag.toLowerCase() === 'group' ) {
            let g_name = comp.name;
            let chls = res.channels[ g_name ];
            let has_channels = !!chls;
            for ( let chl_comp of comp.$children ) {
              if (chl_comp.$options._componentTag.toLowerCase() == 'channel' ) {
                if ( chl_comp.selected = !!chls && chl_comp.channel.IdEpg in chls ) {

                  let ass = chls[ chl_comp.channel.IdEpg ];
                  chl_comp.association = ass;

                }
              }
            }
          }
        }

      }, (xhr, statustext, err) => {
        alert(`Errore: ${err}`);
      });
    },

    writeEpg() {

      if ( ! confirm(`Scrivere il file XMLTV via file sock?`) ) {
        return;
      }

      this.executing = true;

      $.post(`${PATH}/write?shift=${this.shiftTime}`).then( () => {
        alert('file scritto correttamente');
        this.executing = false;
      }, () => {
        alert('Si è verificato un errore');
        this.executing = false;
      });
    }
  }
});


// const ChannelsList = $('#channels-list');
// const UpdateChl = $('#update-chl');
// const Download = $('#download-epg');
// const Update = $('#update-epg');
// const Write = $('#write-epg');
// const EnableAll = $('#enable-all');

// const DateEl = $('#date');
// const DaysEl = $('#days');
// const YestEl = $('#yest');
// const ShiftEl = $('#shift');
// const FullEl = $('#full');


// EnableAll.click( function(e) {
//   ChannelsList.find('.enable-disable input[type=checkbox]').prop('checked', $(this).prop('checked') );
// });


// ChannelsList.find('tr.channel-item').each( (i, li) => {
//   const chl_id = li.id;
//   const $li = $(li);
//   const epgcontainer = $li.next().find('.epg-container');
//   const epgbtn = $li.find('button.epg');
//   epgbtn.on('click', (e) => {
//     e.stopPropagation();
//     e.preventDefault();

//     if ( epgcontainer.children().length > 0 ) {
//       epgcontainer[0].innerHTML = '';
//       return;
//     }

//     epgcontainer[0].innerHTML = '';

//     for( let chl of Channels){
//       if ( chl.Id == chl_id ) {

//         const datests = Object.keys(chl.Epg);
//         for( let ts of datests ) {
//           ts = Number(ts);
//           const date = new Date(ts);

//           const ul = $(`
//             <ul class="epg-list">
//               <li class="date">${moment(date).format('DD/MM/YYYY')}</li>
//             </ul>
//           `);
//           for ( let evt of chl.Epg[ ts ] ) {
//             $(`
//               <li class="event-details" id="${evt.Id}" title="(${evt.Genre}) - ${evt.Description} ${evt.Episode ? '- (' + evt.Episode + ')' : ''}">
//                 <span class="poster logo"><img src="${evt.Poster}" /></span>
//                 <span class="time" title="${evt.Duration} min">${moment(evt.Start).format('HH:mm')} - ${moment(evt.Stop).format('HH:mm')}</span>
//                 <span class="title">${evt.Title} ${evt.Prima ? ' ^ 1TV' : ''}</span>
//                 <span class="description">${evt.Desc}</span>
//               </li>
//             `).appendTo( ul );
//           }

//           ul.appendTo( epgcontainer );
//         }

//         break;
//       }
//     }

//   })
// });

// let PERFORM = false;
// const ALL_BUTTONS = $().add(UpdateChl).add(Download).add(Write).add(Update);

// UpdateChl.on('click', (e) => {
//   e.preventDefault();
//   if ( PERFORM ) {
//     alert('Attendere la fine dell\'esecuzione corrente!');
//     return e.preventDefault();
//   }

//   const rs = confirm(`
//     Aggiornando la lista canali verranno perse tutte le informazioni sul palinsesto dei programmi.
//     Sarà necessario generare un nuovo EPG.
//     Continuare?
//   `);
//   if ( rs ) {
//     ALL_BUTTONS.prop('disabled', true);
//     PERFORM = true;
//     $.get(`${PATH}/channels/update`).then( () => {
//       alert('Lista canali aggiornata con successo');
//       window.location.reload();
//     }, () => {
//       alert('Si è verificato un errore');
//       ALL_BUTTONS.prop('disabled', false);
//       PERFORM = false;
//     })
//   }
// })



// Download.on('click', (e) => {
//   // e.preventDefault();
//   if ( PERFORM ) {
//     alert('Attendere la fine dell\'esecuzione corrente!');
//     return e.preventDefault();
//   }
//   const shifts = ShiftEl.val().trim();
//   let channels = [];
//   ChannelsList.find( '.enable-disable input[type=checkbox]:checked' ).each( (i, el) => {
//     let tr = $(el).closest('tr.channel-item');
//     let text = tr.find('.association input[type=text]');
//     channels.push( `${text.attr('name')}=${text.val()}` );
//   });
//   let complete_path = `${document.location.origin}${PATH}/show.xml?shift=${shifts}&channels=${encodeURIComponent(channels.join(';'))}`;
//   let copy = $(`<input type="text" value="${complete_path}" />` ).appendTo(document.body);
//   copy[0].focus();
//   copy[0].select();
//   document.execCommand('copy');
//   copy.remove();
//   alert('Path has been copied to clipboard');
//   Download.attr('href', `${complete_path}` );
// });

// Write.on('click', (e) => {
//   if ( PERFORM ) {
//     alert('Attendere la fine dell\'esecuzione corrente!');
//     return e.preventDefault();
//   }
//   e.preventDefault();
//   let shifts = ShiftEl.val().trim();

//   ALL_BUTTONS.prop('disabled', true);
//   PERFORM = true;

//   $.get(`${PATH}/write?shift=${shifts}`).then( () => {
//     alert('file scritto correttamente');
//     ALL_BUTTONS.prop('disabled', false);
//     PERFORM = false
//   }, () => {
//     alert('Si è verificato un errore');
//     ALL_BUTTONS.prop('disabled', false);
//     PERFORM = false
//   });
// })

// Update.on('click', (e) => {
//   if ( PERFORM ) {
//     alert('Attendere la fine dell\'esecuzione corrente!');
//     return e.preventDefault();
//   }
//   e.preventDefault();
//   let date = DateEl.val();
//   let days = DaysEl.val();
//   let yest = YestEl.is(':checked');
//   let shift = ShiftEl.val().trim();
//   let full = FullEl.is(':checked');

//   const res = confirm(`
//     L'operazione potrebbe richiedere diversi minuti. Si *SCONSIGLIA* di usare il log a debug!!
//     Controllare il log per assicurarsi che il processo finisca
//   `);

//   if ( res ) {
//     alert('Una volta terminato il processo è necessario ricaricare la pagina');

//     const query = [];
//     query.push(`today=${moment(date).format('YYYYMMDD')}`);
//     query.push(`days=${days}`);
//     if ( yest ) query.push(`y=1`);
//     if ( full ) query.push(`details=1`);
//     query.push(`shift=${shift}`);

//     ALL_BUTTONS.prop('disabled', true);
//     PERFORM = true;



//     $.get(`${PATH}/update.xml?${query.join('&')}`).done(function (data, textStatus, jqXHR) {
//       alert('EPG generato correttamente e salvato nel file di cache');
//       ALL_BUTTONS.prop('disabled', false);
//       PERFORM = false;
//     })
//     .fail(function (jqXHR, textStatus, errorThrown) {
//       if ( textStatus == 'timeout') {
//         alert('Il processo sta impiegando più tempo del previsto. Controllare il log per assicurarsi che vada tutto bene');
//       } else {
//         alert('Si è verificato un errore. Controllare il log');
//       }
//       ALL_BUTTONS.prop('disabled', false);
//       PERFORM = false;
//     });
//   }
// });

