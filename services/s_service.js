const GOT = require('got');


let DNS = '';
let ACCESS_TOKEN = '';

async function get_dns() {
  return await GOT(`${process.env.S_URL}/api/file/dns`).json()
}



async function login() {
  const dns_data = await get_dns();

  DNS = dns_data.dns;

  const login_data = await GOT.post(`${DNS}api/client/login`, {
    json: {
      "access_code": process.env.S_CODE
    }
  }).json();

  ACCESS_TOKEN = login_data.access_token;
}


async function get_all_packs() {
  const all_packs = await GOT(`${DNS}api/pack/all`, {headers: {Authorization: ACCESS_TOKEN}}).json();

  return all_packs.map( p => ({id: p._id, name: p.name}))

}

async function get_channels_for_pack(pack_id) {
  const channels = await GOT(`${DNS}api/event/all/${pack_id}`, {headers: {Authorization: ACCESS_TOKEN}}).json();

  return channels.map( c => ({
    id: c._id,
    name: c.name,
    mpdUrl: c.mpdUrl,
    userAgent: c.userAgent,
    drmKey: c.drmKey
  }))
}


module.exports = {
  login,
  get_all_packs,
  get_channels_for_pack
};