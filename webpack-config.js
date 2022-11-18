const Path = require('path');

module.exports = {

  entry: {
    "app": "./public/js/app.js",
    "home": "./public/js/home.js",
    "epg": "./public/js/epg.js",
    "m3u": "./public/js/m3u.js",
    "m3u-manager": "./public/js/m3u-manager.js",
    "m3u-manager2": "./public/js/m3u-manager2.js"
  },

  devtool: '#eval',
  watch: true,

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['env']
          }
        }
      },
      {
        test: /\.css$/i,
        use: ['css-loader'],
      },
      {
        test: /\.pug$/,
        use: ['pug-loader']
      }
    ]
  },
  resolve: {
    alias: {
      'vue$': 'vue/dist/vue.esm.js' // 'vue/dist/vue.common.js' for webpack 1
    }
  },
  output: {
    path: `${__dirname}/public/`,
    filename: "[name].bundled.js",
    pathinfo: true,
    sourceMapFilename: "[file].js.map"
  }
};
