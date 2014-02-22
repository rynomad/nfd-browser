var ndn = require('ndn-browser-shim'),
    utils = require('./utils.js'),
    FIB = require('./ndn-FIB.js'),
    strategy = {};

ndn.PIT = require('./ndn-PIT.js');


strategy.forwardInterest = function(thisFace, element, interest) {

  console.log('interest got cache miss in forwarding face')
  // Send the interest to the matching faces in the FIB.
  var isLocalInterest = false;
  if (utils.nameHasCommandMarker(interest.name)) {
    if (utils.getCommandMarker(interest.name) == '%C1.M.S.localhost') {
      //console.log("interest has localhost commandMarker")
      isLocalInterest = true;
    }
  }
  //console.log(ndn.FIB)

  function forward(FIBEntrys) {
    console.log("found FIBEntrys ", FIBEntrys)
    var sent = []
    for (var i = 0; i < FIBEntrys.length; i++){
      var entry = FIBEntrys[i]
      var faceID = entry.faceID
      if (sent[faceID] == undefined) {
        ndn.Faces.list[faceID].transport.send(element)
        sent[faceID] = true
      }
    }
  }

  ndn.FIB.lookupByName(interest.name, forward)
}

strategy.forwardData = function(element) {}

strategy.onNewFace = function(face) {
  function express (results){
    for(var i = 0; i < results.length; i++) {
      var element = results[i].encodedInterest
      face.transport.send(element)
    }
  }
  if (face.registeredPrefixes!= null){
    for (var j = 0; j < face.registeredPrefixes.length; j++) {
      console.log(ndn.PIT)
      ndn.PIT.lookupName(face.registeredPrefixes[j], express )
    }
  }

  var faceID = ndn.Faces.add(face)
}

strategy.onPrefixRegistered = function(forwardingEntry) {

}

strategy.caughtDataSends = function(caught) {
  console.log(caught)
}

module.exports = strategy
