import $ from 'jquery';
import './app'

const PATH = '/tv';

// Update list
const BtnUpdate = $('#update');
BtnUpdate.on('click', (e) => {
  e.preventDefault();
  BtnUpdate.prop('disabled', true);
  $.get(`${PATH}/${window.M3U.Name}/update`).then( () => {
    window.location.reload();
  }, (resp) => {
    alert(`Error:
      ${resp.responseText}`);
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
    pj = `${PATH}/${window.M3U.Name}/list.json?groups=${groups.join(',')}`;
    pm = `${PATH}/${window.M3U.Name}/list.m3u?groups=${groups.join(',')}`;
  }
  ShowUrlJson.attr('href', pj)
  ShowUrlM3u.attr('href', pm)
});

BtnGroupsUrl.on('click', (e) => {
  e.preventDefault();
  window.open(`${PATH}/${window.M3U.Name}/groups.m3u`);
});

$('#groups').on('click', 'span.counter', (e) => {
  e.stopPropagation();
  const li_g = $(e.target).closest('li.group-item');
  const g_id = li_g.data('groupId');
  const container = li_g.find('ul');
  if ( container.children().length > 0 ) {
    return container.empty();
  }

  $.get(`${PATH}/${window.M3U.Name}/list/${g_id}.json?`).done( (channels) => {
    for( let chl of channels ) {
      const item = $(`
        <li data-channel-id="${chl.Id}" class="channel-item">
          <span class="logo">
            ${chl.TvgLogo ? '<img src="' + chl.TvgLogo + '" />' : ''}
          </span>
          <a href="${chl.Redirect}">${chl.Name}</a>
          <small>(<a href="${chl.StreamUrl}">link originale</a>)</small>
        </li>
      `);
      item.appendTo(container);
    }
  })

})


function ReloadGroups() {
  UL_GROUPS.html('Loading...');
  $.get(`${PATH}/${window.M3U.Name}/groups.json`).then( (groups) => {
    UL_GROUPS.html('');
    for( let group of groups ) {
      $(`
        <li class='group-item' data-group-id="${group.id}">
          <input type="checkbox" name="groups" id="${group.id}" />
          <span class="name">${group.name}</span>
          <span class="counter" title="espandi lista"><small>${group.count} canali</small></span>
          <ul></ul>
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
    $.get(`${PATH}/${window.M3U.Name}/search.json?q=${str}`).then( (data) => {

      SearchResult.html( `
        <small>
          <a class="btn btn-outline-info btn-sm" href="${PATH}/${window.M3U.Name}/search.json?q=${str}" target="_blank" title="Scarica la lista in formato JSON">Scarica JSON</a>
          <a class="btn btn-outline-info btn-sm" href="${PATH}/${window.M3U.Name}/search.m3u8?q=${str}" target="_blank" title="Scarica la lista in formato M3U">Scarica M3U</a>
        </small>
      ` )

      const groups = Object.keys(data);
      for ( let group of groups ) {
        const UL = $(`<ul><li class="group-title">${group}</li></ul>`);
        for ( let chl of data[group] ) {
          $(`
            <li data-channel-id="${chl.Id}" class="channel-name">
              <a href="${chl.Redirect}">${chl.Name}</a><small> (<a href="${chl.StreamUrl}">link originale</a>)</small>
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
