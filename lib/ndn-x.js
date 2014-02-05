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

var key = ndn.globalKeyManager.getKey();

var prefix = new ndn.Name(['ndnx', key.publicKeyDigest]);


var onInterest = function(prefix, interest, transport) {
  if (LOG > 3) console.log("got intersest in ndnx system namespace", prefix, interest, transport);
  if (interest.name.components.length > 2) {
    if (interest.name.components[2].toEscapedString() == "newRTCface") {
      console.log("interest ")
      rtc.onInterest(prefix, interest, transport)
    } else if (interest.name.components[2].toEscapedString() == "selfreg") {
      console.log('y u try non working feature?')
      var nfblob = interest.name.components[3].value
      var d = new ndn.Data();
      d.decode(nfblob)
      var fe = new ndn.ForwardingEntry();

      var decoder = new ndn.BinaryXMLDecoder(d.content);
      fe.from_ndnb(decoder)

      var ndndID = d.signedInfo.publisher.publisherPublicKeyDigest;
      //console.log(Faces, fe.ndndID)
      for(i = 0; i < Faces.length; i++ ){
        if (Faces[i].ndndid.toString() == ndndID.toString()) {
          fe.faceID = i
          Faces[i].selfReg(fe.prefixName)
        };
      };
      var response = new ndn.ForwardingEntry(null, fe.prefixName, ndndID, fe.faceID, fe.flags, fe.lifetime);
      var encoder = new ndn.BinaryXMLEncoder();
      response.to_ndnb(encoder);
      var bytes = encoder.getReducedOstream();

      var si = new ndn.SignedInfo();
      si.setFields();

      var respdata = new ndn.Data(interest.name, si, bytes);
      respdata.sign();
      var enc = respdata.encode()
      transport.send(enc)
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
