const GOT = require('got');
const Path = require('path');

let DNS = '';
let ACCESS_TOKEN = '';

async function get_dns() {
  return await GOT(`${process.env.S_URL}/api/file/dns`).json()
}



async function login() {
  const dns_data = await get_dns();

  DNS = dns_data.dns;

  if ( ! DNS.endsWith('/') ) {
    DNS = `${DNS}/`;
  }

  const login_data = await GOT.post(`${DNS}api/client/login`, {
    json: {
      "access_code": process.env.S_CODE
    }
  }).json();

  ACCESS_TOKEN = login_data.access_token;
}


async function get_all_packs() {
  const all_parent = await GOT(`${DNS}api/parent/all`, {headers: {Authorization: ACCESS_TOKEN}}).json();
  const italy = all_parent.find(p => p.name === 'Italy');
  const all_packs = await GOT(`${DNS}api/pack/all/${italy._id}`, {headers: {Authorization: ACCESS_TOKEN}}).json();

  return all_packs.map( p => ({id: p._id, name: p.name}))

}

async function get_channels_for_pack(pack_id) {
  const channels = await GOT(`${DNS}api/event/all/${pack_id}`, {headers: {Authorization: ACCESS_TOKEN}}).json();

  for await (const chl of channels) {
    let {mpdUrl, userAgent, keys, drmKey} = chl;
    if ( checkEncrypt(mpdUrl, 'mpdUrl' ) ) {
      mpdUrl = await decryptData(mpdUrl);
    }
    if ( checkEncrypt(userAgent, 'userAgent') ) {
      userAgent = await decryptData(userAgent);
    }
    if ( checkEncrypt(drmKey, 'drmKey') ) {
      drmKey = await decryptData(drmKey);
    }
    
    if (keys && keys.length > 0) {
      let {kid, key} = keys[0];
      if ( checkEncrypt(kid, 'kid') ) {
        kid = await decryptData(kid);
      }
      if ( checkEncrypt(key, 'key') ) {
        key = await decryptData(key);
      }
      keys[0] = {kid, key};
    }


    chl.mpdUrl = mpdUrl;
    chl.userAgent = userAgent;
    chl.keys = keys;
    chl.drmKey = drmKey;
    
  }

  return channels.map( c => ({
    id: c._id,
    name: c.name,
    mpdUrl: c.mpdUrl,
    userAgent: c.userAgent,
    drmKey: c.keys && c.keys.length ? c.keys[0].key : c.drmKey,
    keys: c.keys
  }))
}


module.exports = {
  login,
  get_all_packs,
  get_channels_for_pack
};



function checkEncrypt(str, k) {
  console.log('check', k, str);
  return (str || '').indexOf('\"encrypted\":') > -1
}

// DECRYPT
// Funzione per convertire stringa hex in array di byte
function hexStringToByteArray(hexString) {
    const result = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
        result[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return result;
}

// Funzione XOR decrypt
function xorDecrypt(encryptedBase64, key) {
    // Decodifica base64
    const encrypted = atob(encryptedBase64);
    let result = '';
    
    for (let i = 0; i < encrypted.length; i++) {
        const encryptedChar = encrypted.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        result += String.fromCharCode(encryptedChar ^ keyChar);
    }
    
    return result;
}

// Funzione principale di decrittografia
async function decryptData(encryptedData) {
    try {
        // Primo tentativo: parsing JSON
        const jsonObj = JSON.parse(encryptedData);
        const encrypted = jsonObj.encrypted;
        const authTag = jsonObj.authTag;
        const iv = jsonObj.iv;
        
        // Chiave hardcoded
        const keyString = "8Fs42V8cumvKDXQG";
        const keyBuffer = new TextEncoder().encode(keyString);
        
        // Converti hex strings in byte arrays
        const ivBytes = hexStringToByteArray(iv);
        const encryptedBytes = hexStringToByteArray(encrypted);
        const authTagBytes = hexStringToByteArray(authTag);
        
        // Combina encrypted data e auth tag
        const encryptedWithTag = new Uint8Array(encryptedBytes.length + authTagBytes.length);
        encryptedWithTag.set(encryptedBytes, 0);
        encryptedWithTag.set(authTagBytes, encryptedBytes.length);
        
        // Importa la chiave
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );
        
        // Decrittografia
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: ivBytes,
                tagLength: 128
            },
            cryptoKey,
            encryptedWithTag
        );
        
        // Converti il risultato in stringa
        return new TextDecoder('utf-8').decode(decryptedBuffer);
        
    } catch (jsonError) {
        try {
            // Secondo tentativo: XOR decrypt + AES-GCM
            const keyUsed = "XORsecret";
            const ivString = xorDecrypt("OS0xFwAFQ1dHbHpk", keyUsed);
            const keyString = xorDecrypt("YAkhR1c1SgYBNTkZNz0yNQ==", keyUsed);
            
            // Prepara chiave e IV
            const keyBuffer = new TextEncoder().encode(keyString);
            const ivBuffer = new TextEncoder().encode(ivString);
            
            // Decodifica base64 dei dati criptati
            const encryptedBuffer = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            
            // Importa la chiave
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                keyBuffer,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            
            // Decrittografia
            const decryptedBuffer = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: ivBuffer,
                    tagLength: 128
                },
                cryptoKey,
                encryptedBuffer
            );
            
            // Converti il risultato in stringa
            return new TextDecoder('utf-8').decode(decryptedBuffer);
            
        } catch (secondError) {
            // Se entrambi i metodi falliscono, ritorna i dati originali
            return encryptedData;
        }
    }
}