var ndn = require('ndn-browser-shim');
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
var ndnbuf = ndn.ndnbuf;
var Name = ndn.Name
var Data = ndn.Data
var LOG = require('./LOG.js')
var local = {}

local.transport = function (port) {
  this.port = port
};


/**
 * Connect to the host and port in face.  This replaces a previous connection and sets connectedHost
 *   and connectedPort.  Once connected, call onopenCallback().
 * Listen on the port to read an entire binary XML encoded element and call
 *    face.onReceivedElement(element).
 */
local.transport.prototype.connect = function(face, onopenCallback)
{
  this.elementReader = new BinaryXmlElementReader(face);
  var self = this;
  this.port.onmessage = function(ev) {
    //console.log('RecvHandle called on local face', result);

    if (ev.data == null || ev.data == undefined || ev.data == "") {
      console.log('INVALID ANSWER');
    }
    else if (ev.data instanceof ArrayBuffer) {
      var bytearray = new ndnbuf(ev.data);

      if (LOG > 3) console.log('BINARY RESPONSE IS ' + bytearray.toString('hex'));

      try {
        // Find the end of the binary XML element and call face.onReceivedElement.
        self.elementReader.onReceivedData(bytearray);
      } catch (ex) {
        console.log("NDN.ws.onmessage exception: " + ex);
        return;
      }
      // garbage collect arraybuffer
      var ms = new MessageChannel()
      ms.port1.postMessage(ev.data, [ev.data])
    }
  };

  onopenCallback();

};

/**
 * Send the Uint8Array data.
 */
local.transport.prototype.send = function(data)
{
  if (true) {
        // If we directly use data.buffer to feed ws.send(),
        // WebSocket may end up sending a packet with 10000 bytes of data.
        // That is, WebSocket will flush the entire buffer
        // regardless of the offset of the Uint8Array. So we have to create
        // a new Uint8Array buffer with just the right size and copy the
        // content from binaryInterest to the new buffer.
        //    ---Wentao
        var bytearray = new Uint8Array(data.length);
        bytearray.set(data);
        this.port.postMessage(bytearray.buffer);

        //garbage collect
        var ms = new MessageChannel();
        ms.port1.postMessage(bytearray.buffer, [bytearray.buffer])
        //ms.port1.postMessage(data.buffer, [data.buffer])
    if (LOG > 3) console.log('local.send() returned.');
  }
  else
    console.log('local connection is not established.');
};

module.exports = local;
