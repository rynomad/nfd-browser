var ndn = require('ndn-browser-shim'),
    utils = require('./utils.js'),
    PIT = require('./ndn-PIT.js'),
    FIB = require('./ndn-FIB.js'),
    pitEntry =
    strategy = {};

var PitEntry = function PitEntry(interest, face)
{
  this.interest = interest;
  this.face = face;
}

strategy.forwardInterest = function(thisFace, element, interest) {
  ndn.PIT.put(thisFace, interest);
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
  //Fib.lookup
  for (var i = 0; i < ndn.FIB.length; ++i) {
    var face = ndn.FIB[i];
    //console.log(face, element, thisFace)
    if ((face == thisFace) || ((isLocalInterest == true) && ((face.transport instanceof local.transport) == false))) {
      // Don't send the interest back to where it came from, and don't send localhost interests anywhere but local transports
      console.log('successfully didnt send interest backwards')
      continue;
    } else {
      if (face.registeredPrefixes != undefined){
        for (var j = 0; j < face.registeredPrefixes.length; j++ ) {
          //console.log('checking registeredPrefix',face.registeredPrefixes[j], (face.registeredPrefixes[j] != null),  face.registeredPrefixes[j].match(interest.name),(face.readyStatus == 0 || 'open') )
          //console.log(face.registeredPrefixes[j].toUri(), (interest.name.toUri()))
          if ((face.registeredPrefixes[j] != null) && face.registeredPrefixes[j].match(interest.name) && (face.readyStatus == 0 || 'open')) {
            face.transport.send(element);
            console.log('forwarded interest')
          }
        }
      }
    }
  }

}

strategy.forwardData = function(element) {}

strategy.onNewFace = function(face) {
  for (var i = 0; i < PIT.length; i++){
    if (face.registeredPrefixes!= null){
      for (var j = 0; j < face.registeredPrefixes.length; j++) {
        if (PIT[i].interest.name.match(face.registeredPrefixes[j])) {
          var element = PIT[i].interest.encode()
          face.transport.send(element)
        }
      }
    }

  }
}

strategy.caughtDataSends = function(caught) {
  console.log(caught)
}

module.exports = strategy
