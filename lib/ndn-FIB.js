var ndn = require('ndn-browser-shim');
ndn.Faces = require('./ndn-Faces.js')
var strategy = require('./ndn-strategy.js');

var idb = require('idb-wrapper');


var FIB = {};

var fib = new idb({
  storeName: "FIB",
  dbVersion: 1,
  indexes: [
    {name: "faceID"},
    {name: "faceHash"},
    {name: "prefixURI"}
  ]
})

FIB.put = function(forwardingEntry) {
  console.log(forwardingEntry, ndn.Faces.list)
  if ((forwardingEntry.faceID == null) || (ndn.Faces.list[forwardingEntry.faceID].ndndid.toString() != forwardingEntry.ndndID.toString())) {
    for(i = 0; i < ndn.Faces.list.length; i++ ){
      if ((ndn.Faces.list[i].ndndid.toString() == forwardingEntry.ndndID.toString())) {
        forwardingEntry.faceID == i;
        var cromulent = true
        continue
      }
    }
  } else {
    var cromulent = true
  }

  if (cromulent) {

    var FIBEntry = {
      faceID: forwardingEntry.faceID,
      faceHash: forwardingEntry.ndndID.toString('hex'),
      prefixURI: forwardingEntry.prefixName.toUri()
    }
    fib.put(FIBEntry, function onSuccess(id){
      console.log('put FIBEntry at id: ', id)
    }, function onError(err){
      console.log('error inserting FIBEntry : ', FIBEntry, err)
    })
  }
}

FIB.lookupByName = function(name, onMatches) {
  var prefixes = [];

  function getAllPrefixes(name){
    var prefix = name.getPrefix(-1)
    prefixes.push(prefix.toUri())
    if (prefix.components.length > 0) {
      getAllPrefixes(prefix)
    }
  }

  var keyRanges = [];

  getAllPrefixes(name)

  for (var i = 0; i < prefixes.length; i++ ){
    var r = fib.makeKeyRange({
      only: prefixes[i]
    })
    keyRanges.push(r)
  }

  var allMatches = []

  function getMatchingEntries (keyRanges) {
    var range = keyRanges.pop()
    fib.query(function onSuccess(matches){
      allMatches = allMatches.concat(matches)
      if (keyRanges.length > 0){
        getMatchingEntries(keyRanges)
      } else {
        onMatches(allMatches)
      }
    },{
      index: "prefixURI",
      keyRange: range
    })
  }

  getMatchingEntries(keyRanges)
}


module.exports = FIB
