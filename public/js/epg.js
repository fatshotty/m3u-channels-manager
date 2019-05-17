(function() {
  const PATH = '/epg';

  const ChannelsList = $('#channels-list');
  const Download = $('#download-epg');
  const Update = $('#update-epg');
  const Write = $('#write-epg');

  const DateEl = $('#date');
  const DaysEl = $('#days');
  const YestEl = $('#yest');
  const ShiftEl = $('#shift');
  const FullEl = $('#full');


  ChannelsList.find('ul li.channel-item').each( (i, li) => {
    const chl_id = li.id;
    const $li = $(li);
    const epgcontainer = $li.find('.epg-container');
    epgcontainer[0].innerHTML = '';
    const epgbtn = $li.find('span.epg');
    epgbtn.on('click', (e) => {
      e.stopPropagation();

      for( let chl of Channels){
        if ( chl.Id == chl_id ) {

          const datests = Object.keys(chl.Epg);
          for( let ts of datests ) {
            ts = Number(ts);
            const date = new Date(ts);

            const ul = $(`
              <ul class="epg-list">
                <li class="date">${moment(date).format('DD/MM/YYYY')}</li>
              </ul>
            `);
            for ( let evt of chl.Epg[ ts ] ) {
              $(`
                <li class="event-details" id="${evt.Id}" title="(${evt.Genre}) - ${evt.Description} ${evt.Episode ? '- (' + evt.Episode + ')' : ''}">
                  <span class="poster logo"><img src="${evt.Poster}" /></span>
                  <span class="time" title="${evt.Duration} min">${moment(evt.Start).format('HH:mm')} - ${moment(evt.Stop).format('HH:mm')}</span>
                  <span class="title">${evt.Title} ${evt.Prima ? ' ^ 1TV' : ''}</span>
                  <span class="description">${evt.Desc}</span>
                </li>
              `).appendTo( ul );
            }

            ul.appendTo( epgcontainer );
          }

          break;
        }
      }

    })
  });


  Download.on('click', (e) => {
    // e.preventDefault();
    const shifts = ShiftEl.val().trim();
    Generate.attr('href', `${PATH}/show.xml?shift=${shifts}` );
  });

  Write.on('click', (e) => {
    e.preventDefault();
    let shifts = ShiftEl.val().trim();
    Write.prop('disabled', true);
    $.get(`${PATH}/write?shift=${shifts}`).then( () => {
      alert('file scritto correttamente');
      Write.prop('disabled', false);
    }, () => {
      alert('Si è verificato un errore');
      Write.prop('disabled', false);
    });
  })

  Update.on('click', (e) => {
    // e.preventDefault();
    let date = DateEl.val();
    let days = DaysEl.val();
    let yest = YestEl.is(':checked');
    let shift = ShiftEl.val().trim();
    let full = FullEl.is(':checked');

    const res = confirm(`
      L'operazione potrebbe richiedere diversi minuti. Si *SCONSIGLIA* di usare il log a debug!!
      Controllare il log per assicurarsi che il processo finisca
    `);

    if ( res ) {
      alert('Una volta terminato il processo è necessario ricaricare la pagina');

      const query = [];
      query.push(`today=${moment(date).format('YYYYMMDD')}`);
      query.push(`days=${days}`);
      if ( yest ) query.push(`y=1`);
      if ( full ) query.push(`details=1`);
      query.push(`shift=${shift}`);

      Update.prop('disabled', true);

      $.get(`${PATH}/update.xml?${query.join('&')}`).then( () => {
        alert('EPG generato correttamente e salvato nel file di cache');
        Update.prop('disabled', false);
      }, () => {
        alert('Si ')
        Update.prop('disabled', false);
      });
    }

    e.preventDefault();

  });

})();
