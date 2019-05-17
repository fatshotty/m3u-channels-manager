(() => {
  const PATH = '/tv';

  // Update list
  const BtnUpdate = $('#update');
  BtnUpdate.on('click', (e) => {
    e.preventDefault();
    BtnUpdate.prop('disabled', true);
    $.get(`${PATH}/update`).then( () => {
      window.location.reload();
    }, (resp) => {
      alert(resp.responseText);
      BtnUpdate.removeAttr('disabled');
    });
  })

  // Get all groups
  const UL_GROUPS = $('#groups');
  const ShowUrlJson = $('#show-url-json');
  const ShowUrlM3u = $('#show-url-m3u');
  const BtnUncheckAll = $('#uncheckall');
  const BtnGenerateUrl = $('#generate-url');
  const BtnGroupsUrl = $('#groups-url')
  BtnUncheckAll.on('click', (e) => {
    e.preventDefault();
    UL_GROUPS.find('input[type=checkbox]').prop('checked', false);
    ShowUrlJson.attr('href', '')
    ShowUrlM3u.attr('href', '')
  });

  BtnGenerateUrl.on('click', (e) => {
    e.preventDefault();
    let pj = '', pm = '';
    const inputs = Array.prototype.slice.call( UL_GROUPS.find('input[type=checkbox]:checked'), 0 );
    const groups = inputs.map( (g) => {
      return g.id
    });
    if ( groups.length ) {
      pj = `${PATH}/list.json?groups=${groups.join(',')}`;
      pm = `${PATH}/list.m3u?groups=${groups.join(',')}`;
    }
    ShowUrlJson.attr('href', pj)
    ShowUrlM3u.attr('href', pm)
  });

  BtnGroupsUrl.on('click', (e) => {
    e.preventDefault();
    window.open(`${PATH}/groups.m3u`);
  });


  function ReloadGroups() {
    UL_GROUPS.html('Loading...');
    $.get(`${PATH}/groups.json`).then( (groups) => {
      UL_GROUPS.html('');
      for( let group of groups ) {
        $(`
          <li class='group-item' data-group-id="${group.id}">
            <input type="checkbox" name="groups" id="${group.id}" />
            <span class="name">${group.name}</span>
            <span class="counter"><small>${group.count} canali</small></span>
          </li>
        `).appendTo(UL_GROUPS);
      }


    })
  }
  ReloadGroups();


  // Search
  const SearchResult = $('#search-result');
  const SearchForm = $('#search-form');
  const SearchInput = $('#search-text');
  SearchForm.on('submit', (e) => {
    e.preventDefault();
    const str = SearchInput.val();
    SearchResult.html('Loading...')
    if ( str.trim() ) {
      $.get(`${PATH}/search.json?q=${str}`).then( (data) => {

        SearchResult.html( `
          <small>
            <a class="btn btn-outline-info btn-sm" href="${PATH}/search.json?q=${str}" target="_blank" title="Scarica la lista in formato JSON">Scarica JSON</a>
            <a class="btn btn-outline-info btn-sm" href="${PATH}/search.json?q=${str}" target="_blank" title="Scarica la lista in formato M3U">Scarica M3U</a>
          </small>
        ` )

        const groups = Object.keys(data);
        for ( let group of groups ) {
          const UL = $(`<ul><li class="group-title">${group}</li></ul>`);
          for ( let chl of data[group] ) {
            $(`
              <li data-channel-id="${chl.Id}" class="channel-name">
                <a href="${chl.Redirect}">${chl.Name}</a>
              </li>
            `).appendTo( UL );
          }
          UL.appendTo( SearchResult );
        }
      }, () => {
        SearchResult.html('');
      })

      return;
    }
    SearchResult.html('');
  });


})()
