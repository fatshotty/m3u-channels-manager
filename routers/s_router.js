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

  const tool = req.query.tool || 'ffmpeg';

  await buildList(tool)

  res.status(204).end();

});


async function buildList(tool /* ffmpeg | mpv */) {
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
  generateList(packs, tool);
}



async function generateList(packs, tool) {

  tool = tool || 'ffmpeg';

  const m3uKlass = new M3U('s_now');

  for (const pack of packs) {
    const group = new Group((pack.name || '').trim().replace('[', '').replace(']', ''));

    for (const channel of pack.channels) {

      const url = [];

      if (tool === 'mpv' ) {
        url.push('pipe:///usr/bin/mpv');
        url.push('--of=mpegts');
      } else {
        // default: ffmpeg
        url.push('pipe:///usr/bin/ffmpeg');
        url.push('-loglevel info');
      }

      if (channel.drmKey) {
        if (tool === 'mpv' ) {
          url.push(`--demuxer-lavf-o=cenc_decryption_key='${channel.drmKey.trim()}'`)
        } else {
          // default: ffmpeg
          url.push(`-cenc_decryption_key "${channel.drmKey.trim()}"`)
        }
      }

      if (channel.userAgent) {
        if (tool === 'mpv' ) {
          url.push(`--http-header-fields="User-Agent: ${channel.userAgent.trim()}"`);
        } else {
          // default: ffmpeg
          url.push(`-headers "User-Agent: ${channel.userAgent.trim()}"`);
        }
      }

      if (tool === 'mpv' ) {
        url.push(`"${channel.mpdUrl.trim()}"`);
      } else {
        // default: ffmpeg
        url.push(`-i "${channel.mpdUrl.trim()}"`);
      }

      if ( tool !== 'mpv' ) {
        // default: ffmpeg
        url.push('-c copy');
        url.push('-f mpegts');
        url.push('pipe:1');
      }

      Log.info(`add channel: ${channel.name}`);

      group.createAddChannel({
        'name': (channel.name || '').trim().replace('[', '').replace(']', ''),
        'duration': -1,
        'tvg-id': (channel.name || '').trim().replace('[', '').replace(']', ''),
        'tvg-name': (channel.name || '').trim().replace('[', '').replace(']', ''),
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

  const force = req.query.force == 'true';
  const tool = req.query.tool || 'ffmpeg';

  if (!M3U_LIST || force) {
    await buildList(tool);
  }

  Log.info(`respond list`);

  res.set('content-type', 'application/x-mpegURL');
  res.end( M3U_LIST.toM3U(true, true) );
})



module.exports = {Router, fileWatcher: () => {}};




