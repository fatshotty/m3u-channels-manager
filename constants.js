const Path = require('path');

const DEFAULT_CONFIG = () => {
  return {
    "LogLevel": "info",
    "Log": `${global.CWD}/manager.log`,
    "UseCache": false,
    "FtpPort": 0,
    "UseFTP": false,
    "M3U": [{
      "UUID": '',
      "Name": "list_1",
      "Url": "",
      "ExcludeGroups": [],
      "UserAgent": "VLC",
      "UseForStream": false,
      "UseFullDomain": true,
      "UseDirectLink": false,
      "Enabled": true,
      "StreamEnabled": true,
      "RewriteUrl": ""
    }],
    "Port": global.Argv.port || 3000,
    "SocketPort": global.Argv.socketport || 14332,
    "Path": `${global.CWD}/cache`,
    "EPG": {
      "bulk": 2,
      "Sock": ""
    }
  };
};

function calculatePath(filename) {
  const dir = Path.dirname(filename);
  let path = dir.split( Path.sep );
  const index = path.indexOf('node_modules');
  if ( index > -1 ) {
    path = path.splice( 0, index );
  }
  return path.join(Path.sep);
}

module.exports = {
  DEFAULT_CONFIG,
  calculatePath,
  "Categories": {
    "informazione": {
      "notiziario":          ["News and current affairs", "News / Current affairs"],
      "economia":            ["Current affairs", "Social / Political issues / Economics"],
      "news":                ["News and current affairs", "News / Current affairs"],
      "meteo":               ["Factual", "News / Current affairs"],
      "sport":               ["Sport", "Sports"],
      "regioni":             ["News and current affairs", "News / Current affairs"]
    },

    "mondo e tendenze": {
      "politica":            ["Current affairs", "News / Current affairs"],
      "magazine cultura":    ["News and current affairs", "News / Current affairs"],
      "cucina":              ["Cookery", "Leisure hobbies"],
      "societa":             ["Arts and culture", "Arts / Culture"],
      "arte e cultura":      ["Arts and culture", "Arts / Culture"],
      "mondi e culture":     ["Arts and culture", "Arts / Culture"],
      "tecnologia":          ["Science", "Education / Science / Factual topics"],
      "economia":            ["Current affairs", "News / Current affairs"],
      "documentario":        ["Documentary", "Arts / Culture"],
      "moda":                ["Factual", "Education / Science / Factual topics"],
      "natura":              ["Nature", "Education / Science / Factual topics"],
      "scienza":             ["Science", "Education / Science / Factual topics"],
      "lifestyle":           ["Entertainment", "Leisure hobbies"],
      "musica":              ["Music", "Music / Ballet / Dance"],
      "storia":              ["Interests", "Arts / Culture"],
      "sport":               ["Sport", "Sports"],
      "avventura":           ["Interests", "Leisure hobbies"],
      "pesca":               ["Interests", "Leisure hobbies"],
      "attualita":           ["Interests", "Leisure hobbies"],
      "reportage":           ["Interests", "Leisure hobbies"],
      "popoli":              ["Interests", "Social / Political issues / Economics"],
      "viaggi":              ["Travel", "Leisure hobbies"],
      "magazine scienza":    ["Science", "Education / Science / Factual topics"],
      "magazine cinema":     ["Interests", "Education / Science / Factual topics"],
      "cinema":              ["Interests", "Education / Science / Factual topics"],
      "caccia":              ["Entertainment", "Leisure hobbies"],
      "magazine":            ["Discussion/Debate", "News / Current affairs"],
      "religione":           ["Religion", "Arts / Culture"],
      "magazine natura":     ["Nature", "Arts / Culture"]
    },



    "sport": {
      "Default": ["Sport", "Sports"]
    },


    "intrattenimento": {
      "talk show":           ["Talk show", "Social / Political issues / Economics"],
      "telefilm":            ["Soap", "Show / Game show"],
      "fiction":             ["Soap", "Show / Game show"],
      "sit com":             ["Sitcom", "Children's / Youth programs"],
      "reality show":        ["Reality", "Show / Game show"],
      "spettacolo":          ["Interests", "Show / Game show"],
      "show":                ["Reality", "Show / Game show"],
      "intrattenimento":     ["Entertainment", "Show / Game show"],
      "quiz":                ["Game show", "Show / Game show"],
      "soap opera":          ["Soap", "Show / Game show"],
      "telenovela":          ["Soap", "Show / Game show"],
      "miniserie":           ["Comedy", "Children's / Youth programs"],
      "animazione":          ["Animation", "Children's / Youth programs"]
    },


    "altri programmi": {
      "shopping":            ["Consumer"],
      "educational":         ["Education", "Education / Science / Factual topics"],
      "film per adulti":     ["Film", "Movie / Drama"]
    },


    "ragazzi e musica": {
      "Default":             ["Children", "Music / Ballet / Dance"],
      "musica":              ["Music"],
      "educational":         ["Education", "Education / Science / Factual topics"],
      "film animazione":     ["Animation", "Children's / Youth programs"]
    },

    "film": {
      "Default": ["Film", "Movie / Drama"]
    }
  }
}
