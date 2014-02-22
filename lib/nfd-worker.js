var window = undefined
var ndn = require('ndn-browser-shim');
ndn.globalKeyManager = require('./ndn-keyManager.js');
ndn.forwarderFace = require('./ndn-ForwarderFace.js');
ndn.MessageChannelTransport = require('./ndn-MessageChannelTransport.js');
ndn.FIB = require('./ndn-FIB.js')
ndn.Faces = require('./ndn-Faces.js')
var LOG = require('./LOG.js');
var utils = require('./utils.js')
var Faces = require('./ndn-Faces.js')

var strategy = require('./ndn-strategy.js');

var options = {}
options.prefix = "wiki";

onmessage = function(e) {
  console.log(e)
  if (e.data.init == true) {
    console.log('setting app prefix')
    options.prefix = e.data.prefix
    var Bootstrap = new ndn.forwarderFace({host:"localhost", port:9696})
    Bootstrap.selfReg(new ndn.Name('ndnx'))
    Bootstrap.registerPrefix(new ndn.Name('ndnx'), Bootstrap.interestHandler)
    ndn.Faces.add(Bootstrap)
  } else if (e.data.port == "keyPort") {
    ndn.keyPort = e.ports[0]
		ndn.keyPort.onmessage = getKeysFromUI;
	} else if (e.data.port == "RTCPort") {

    var rtcPort = e.ports[0]
    initFace(rtcPort, e.data.ndndid, new ndn.Name('ndnx'))

  } else if (e.data.port == "ndnxPort") {

    var prefix = new ndn.Name(['ndnx', ndn.id])
    initFace(e.ports[0], ndn.id, prefix)

  } else if (e.data.port == "ioPort") {
    initFace(e.ports[0], ndn.id, new ndn.Name(options.prefix));
  } else if (e.data.port == "repoPort") {
    var prefix = new ndn.Name(options.prefix);
    initFace(e.ports[0], ndn.id, prefix)
  } else if (e.data.ndnx == "selfreg") {
    registerPrefixFromInterest(e.data.interest)
  } else if (e.data.command == "reqReg") {
    expressPrefixRegistrationInterest(e.data.uri, e.data.ndndid)
  }
}

function expressPrefixRegistrationInterest(uri, ndndid) {
   var name = new ndn.Name(['ndnx', ndndid, 'selfreg'])
   var myKey = ndn.globalKeyManager.getKey()
   var myID = myKey.publicKeyDigest
   var fe = new ndn.ForwardingEntry('selfreg', new ndn.Name(uri), myID, null, null, null);
   var encoder = new ndn.BinaryXMLEncoder()
   console.log('created entry and encoder')
   fe.to_ndnb(encoder)
   var bytes = encoder.getReducedOstream();
   var d = new ndn.Data(new ndn.Name('fe'), new ndn.SignedInfo(), bytes);
   d.signedInfo.setFields()
   d.sign()


   function onData(inst, co) {
     console.log('got response from selfReg, ', co)
   }

   var nfblob = d.encode()
   name.append(nfblob)
   var interest = new ndn.Interest(name);
   utils.setNonce(interest)
   console.log('got right interest, ',interest)
   for(i = 0; i < ndn.FIB.length; i++ ){
    if ((ndn.FIB[i].ndndid != undefined) && (ndn.FIB[i].ndndid.toString() == ndndid.toString())) {
      console.log('found proper face to express registration command')
      ndn.FIB[i].expressInterest(interest, onData, null)
      continue
    };
  };
}


function registerPrefixFromInterest(interest){
  console.log(interest)
  var nfblob = interest.name.components[3].value
  var d = new ndn.Data();
  d.decode(nfblob)
  console.log(d)
  var fe = new ndn.ForwardingEntry();

  var decoder = new ndn.BinaryXMLDecoder(d.content);
  console.log(decoder)
  fe.from_ndnb(decoder)
  console.log(d)
  var ndndID = d.signedInfo.publisher.publisherPublicKeyDigest;
  fe.ndndID = ndndID
  for(i = 0; i < ndn.Faces.list.length; i++ ){
    if ((ndn.Faces.list[i].ndndid != (null || undefined)) && (ndn.FIB[i].ndndid.toString() == ndndID.toString())) {
      fe.faceID = i
      console.log('found face that requested selfReg')
      ndn.Faces.list[i].selfReg(fe.prefixName)
      var toRespondTo = ndn.faces.list[i]
      continue
    };
  };
  var response = new ndn.ForwardingEntry('selfreg', fe.prefixName, ndndID, fe.faceID, fe.flags, fe.lifetime);
  var encoder = new ndn.BinaryXMLEncoder();
  console.log(response)
  response.to_ndnb(encoder);
  var bytes = encoder.getReducedOstream();

  var si = new ndn.SignedInfo();

  var respdata = new ndn.Data(new ndn.Name(interest.name), si, bytes);
  respdata.signedInfo.setFields()
  respdata.sign();
  var enc = respdata.encode()
  toRespondTo.transport.send(enc)
}

function getKeysFromUI(e){
  ndn.globalKeyManager.certificate = e.data[0]
  ndn.globalKeyManager.publicKey = e.data[1]
  ndn.globalKeyManager.privateKey = e.data[2]
  var key = ndn.globalKeyManager.getKey()
  ndn.id = key.publicKeyDigest
  ndn.keyPort.postMessage(ndn.id)
}

function initFace(port, ndndid, prefix) {
  var transport = new ndn.MessageChannelTransport.transport(port)
  var face = new ndn.forwarderFace({host: 1, port: 1, getTransport: function(){return transport}})
  face.transport.connect(face, function(){
    console.log('connecting face ')
    strategy.onNewFace(face)
    ndn.Faces.add(face)
    if (prefix != undefined){
      ndn.FIB.put(new ndn.ForwardingEntry('selfreg', prefix, ndndid, face.id, null, null))
    }

  })
  strategy.onNewFace(face)
}


