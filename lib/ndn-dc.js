var ndn = require('ndn-browser-shim');
var rtc = require('./ndn-rtc.js')
ndn.x = require('./ndn-x.js')
var FIB = require('./ndn-FIB.js')
//var Faces = require('./ndn-faces.js')
var rtcChannelWrapper = require('./ndn-RTCWorkerChannel.js')
var ndndc = {}

ndndc.accessDaemon = function(daemon) {
  this.daemon = daemon;
}

ndndc.add = function(uri, arg2, arg3, arg4) {
  // instead of TCP/UDP, we have available websockets (to wsproxy server) or webRTC dataChannels (to other browsers)
  var prefix = new ndn.Name(uri)
  if (arg2 == "rtc") {
    var ndndid = arg3
    var dataChannel = rtc.createDataChannel(ndndid, ndn.x.face) // we have to discover host and port via ICE etc. so use arg3 should contain the ndndid of the target to bootstrap signaling
    var wrapper = new rtcChannelWrapper(dataChannel);
    this.daemon.postMessage({port: "RTCPort", prefix: prefix, ndndid: ndndid}, [wrapper.port])

  } else if (arg2 == "th") {
    // asking for a telehash connection, arg3 = hashname (same as ndndid)
  } else if (typeof arg2 == "face") {
    var face = Faces[arg3]
    face.registerPrefix(new ndn.Name(uri))

  }

}


ndndc.registerPrefix = function (uri, targetID) {
  this.daemon.postMessage({command: "reqReg", uri: uri, ndndid: targetID})
}

ndndc.destroyFace = function(faceID) {
  Faces[faceID].transport.ws.close()
  delete Faces[faceID]
  for (var i = FIB.length - 1; i >= 0; i--) {
    if (FIB[i].faceID = faceID) {FIB.splice(i, 1)}
  }
}


module.exports = ndndc
