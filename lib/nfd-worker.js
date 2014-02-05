var ndn = require('ndn-browser-shim');
ndn.globalKeyManager = require('./ndn-keyManager.js');
ndn.forwarderFace = require('./ndn-ForwarderFace.js');
ndn.MessageChannelTransport = require('./ndn-MessageChannelTransport.js');
ndn.FIB = require('./ndn-FIB.js')
var LOG = require('./LOG.js');

var options = {}
options.prefix = "test";

onmessage = function(e) {
  console.log(e)
  if (e.data.init == true) {
    console.log('setting app prefix')
    options.prefix = e.data.prefix
  } else if (e.data.port == "keyPort") {
    ndn.keyPort = e.ports[0]
		ndn.keyPort.onmessage = getKeysFromUI;
	} else if (e.data.port == "RTCPort") {
    var rtcPort = e.ports[0]
    var face = initFace(rtcPort)
    face.ndndid = e.data.ndndid;
    face.transport.connect(face, function(){console.log('connecting rtc face')})
    face.selfReg(new ndn.Name('ndnx'));
    var prefix = new ndn.Name(options.prefix)
    face.selfReg(prefix)
    ndn.FIB.push(face)

  } else if (e.data.port == "ndnxPort") {
    var face = initFace(e.ports[0]);
    var key = ndn.globalKeyManager.getKey()
    var prefix = new ndn.Name(['ndnx', key.publicKeyDigest])
    face.transport.connect(face, function(){console.log('connecting ndnx face')})
    face.selfReg(prefix);
    ndn.FIB.push(face)
  } else if (e.data.port == "ioPort") {
    var face = initFace(e.ports[0]);
    face.transport.connect(face, function(){console.log('connecting to io from daemon')})
    var prefix = new ndn.Name(options.prefix)
    console.log(options.prefix)
    face.selfReg(prefix)
    ndn.FIB.push(face)
  } else if (e.data.port == "repoPort") {
    var face = initFace(e.ports[0]);
    face.transport.connect(face, function(){console.log('connecting to repo from daemon')})
    var prefix = new ndn.Name(options.prefix);
    face.selfReg(prefix)
    ndn.FIB.push(face);
  }
}

function getKeysFromUI(e){
  ndn.globalKeyManager.certificate = e.data[0]
  ndn.globalKeyManager.publicKey = e.data[1]
  ndn.globalKeyManager.privateKey = e.data[2]
  var key = ndn.globalKeyManager.getKey()
  ndn.id = key.publicKeyDigest
  ndn.keyPort.postMessage(ndn.id)
}

function initFace(port) {
  var transport = new ndn.MessageChannelTransport.transport(port)
  console.log(transport)
  return new ndn.forwarderFace({host: 1, port: 1, getTransport: function(){return transport}})
}

var Bootstrap = new ndn.forwarderFace({host:"rosewiki.org", port:9696})
Bootstrap.selfReg(new ndn.Name('ndnx'))
Bootstrap.registerPrefix(new ndn.Name('ndnx'), Bootstrap.interestHandler)
ndn.FIB.push(Bootstrap)
