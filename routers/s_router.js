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

  Log.info('proceed to create a new list');

  await buildList()

  res.status(204).end();

});


async function buildList() {
  Log.info('Login to s_list');
  await SService.login();

  Log.info('get all packs');
  const packs = await SService.get_all_packs();

  Log.info(`found ${packs.length} packs`);

  for await (const pack of packs) {
    Log.info(`get channels for pack: ${pack.name}`);
    const chls = await SService.get_channels_for_pack(pack.id);

    pack.channels = chls;
  }

  Log.info(`generate entire list`);
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

      Log.info(`add channel: ${channel.name}`);

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

  Log.info(`respond list`);

  res.set('content-type', 'application/x-mpegURL');
  res.end( M3U_LIST.toM3U(true, true) );
})



module.exports = {Router, fileWatcher: () => {}};




