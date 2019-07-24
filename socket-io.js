const Utils = require('./utils');
const Log = Utils.Log;
const LogTrasport = require('winston-transport');

module.exports = (SocketIO, loglevel) => {

  const SockLog = new SocketIoTransport({level: loglevel}, SocketIO);
  Log.add( SockLog );

  // SocketIO.on('connection', () => {
  //   // Log.info('a user connected');
  // });

};



class SocketIoTransport extends LogTrasport {
  constructor(options, socketIo) {
    super(options);
    this.socket = socketIo;
  }


  log(info, callback) {
    // setImmediate(() => {
    //   this.emit('logged', info);
    // });

    // Perform the writing to the remote service
    this.socket.emit('logmessage', info);
    callback();
  }

}
