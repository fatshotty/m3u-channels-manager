const Path = require("path");
const FS = require('fs');
const Express = require('express');
const Router = Express.Router();
const Utils = require('../utils');
const SService = require('../services/s_service.js');
const {M3U, Group, Channel} = require('../modules/m3u');


const Log = Utils.Log;

let M3U_LIST = null;



Router.post('/', async (req, res, next) => {

  await buildList()

  res.status(204).end();

});


async function buildList() {
  await SService.login();

  const packs = await SService.get_all_packs();


  for await (const pack of packs) {
    const chls = await SService.get_channels_for_pack(pack.id);

    pack.channels = chls;
  }


  generateList(packs);
}



async function generateList(packs) {

  const m3uKlass = new M3U('s_now');

  for (const pack of packs) {
    const group = new Group(pack.name);

    for (const channel of pack.channels) {

      let url = [
        'pipe:///usr/bin/mpv',
        '--of=mpegts'
      ];

      if (channel.drmKey) {
        url.push(`--demuxer-lavf-o=cenc_decryption_key='${channel.drmKey}'`)
      }

      if (channel.userAgent) {
        url.push(`--http-header-fields="User-Agent: ${channel.userAgent}"`);
      }

      url.push(`"${channel.mpdUrl}"`);

      group.createAddChannel({
        'name': channel.name,
        'duration': -1,
        'tvg-id': channel.name,
        'tvg-name': channel.name,
        'tvg-logo': '',
        'link': url.join(' '),
        'props': [],
        'extra': []
      });

    }

    m3uKlass.groups.push( group );

  }

  M3U_LIST = m3uKlass;

}


Router.get('/', async (req, res, next) => {
  if (!M3U_LIST) {
    await buildList();
  }

  res.set('content-type', 'application/x-mpegURL');
  res.end( M3U_LIST.toM3U(true, true) );
})



module.exports = {Router, fileWatcher: () => {}};




