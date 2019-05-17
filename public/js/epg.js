(function() {
  const PATH = '/epg';

  const ChannelsList = $('#channels-list');
  const Generate = $('#generate-epg');
  const Update = $('#update-epg');

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


  Generate.on('click', (e) => {
    // e.preventDefault();
    const shifts = ShiftEl.val().trim();
    Generate.attr('href', `${PATH}/show.xml?shift=${shifts}` );
  });

  Update.on('click', (e) => {
    // e.preventDefault();
    let date = DateEl.val();
    let days = DaysEl.val();
    let yest = YestEl.is(':checked');
    let shift = ShiftEl.val().trim();
    let full = FullEl.is(':checked');

    const res = confirm(`
      L'operazione potrebbe richiedere diversi minuti. Si *sconsiglia* di usare il log a debug!!\n
      (il file verrà scritto anche nel 'sock' se specificato nelle impostazioni)
    `);

    if ( res ) {
      alert('Una volta scaricato il file EPG è necessario ricaricare la pagina');

      const query = [];
      query.push(`today=${moment(date).format('YYYYMMDD')}`)
      query.push(`days=${days}`);
      if ( yest ) query.push(`y=1`);
      if ( full ) query.push(`details=1`);
      query.push(`shift=${shift}`);

      Update.attr('href', `${PATH}/update.xml?${query.join('&')}` );
    } else {
      e.preventDefault();
    }

  });

})();
