var ndn = require("ndn-browser-shim");
var utils = require("./utils.js");
var rtc = require("./ndn-rtc.js");
ndn.MessageChannelTransport = require("./ndn-MessageChannelTransport.js")
var Face = ndn.Face;
var Data = ndn.Data;
var Interest = ndn.Interest;
var LOG = require('./LOG.js')


var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};



var onInterest = function(prefix, interest, transport) {
  if (LOG > 3) console.log("got intersest in ndnx system namespace", prefix, interest, transport);
  if (interest.name.components.length > 2) {
    if (interest.name.components[2].toEscapedString() == "newRTCface") {
      console.log("interest ")
      rtc.onInterest(prefix, interest, transport)
    } else if (interest.name.components[2].toEscapedString() == "selfreg") {
      console.log('y u try non working feature?')
      ndn.fd.postMessage({ndnx: 'selfreg', interest: interest})

    };
  }


};

var ndnx = {}

ndnx.init = function(daemon, id){
  var ms = new MessageChannel()
  console.log(id)
  var prefix = new ndn.Name(['ndnx', id]);
  var uri = prefix.toUri()
  ndnx.face = new ndn.Face({host:20, port:20, getTransport: function(){return new ndn.MessageChannelTransport.transport(ms.port1)}})
  ndnx.face.transport.connect(ndnx.face, function(){console.log('ndnx face connected')})
  var closure = new Face.CallbackClosure(null, null, onInterest, prefix, ndnx.face.transport);
  Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
  daemon.postMessage({port: "ndnxPort"}, [ms.port2])
  rtc.init(daemon)
}



module.exports = ndnx
