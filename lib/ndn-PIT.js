var ndn = require('ndn-browser-shim');
var down = require('level-js');
var level = require('levelup');
var ttl = require('level-ttl');
var db = ttl(level('PIT', {db: down, valueEncoding: "json"}));
ndn.Faces = require('./ndn-Faces.js')
var strategy = require('./ndn-strategy.js');

var idb = require('idb-wrapper');

var pit = new idb({
  storeName: "PITable",
  dbVersion: 1,
  keyPath: 'nonce',
  autoIncrement: false,
  indexes: [
    {name: "faceID"},
    {name: "uri"},
    {name: "prefixURIs", multiEntry: true},
    {name: "publisherPublicKeyDigest"},
    {name: "facePubKeyDigest"},
    {name: "expirationAbsoluteMsec"}
  ]
}, function(){
  console.log('PITable Ready, clearing out Interests that expired while we were gone...');
  var keyRange = pit.makeKeyRange({
    upper: Date.now(),
    lower: 0
  })

  pit.query(function onSuccess(matchArray){
    var toRemove = []
    for (var i = 0; i < matchArray.length; i++){
      toRemove.push(matchArray[i].nonce)
    }
    pit.removeBatch(toRemove, function onSuccess(){
      console.log('successfully garbage collected old PITEntrys')
    }, function onError(err){
      console.log('something went wrong removing old PITEntrys ', err)
    })
  }, {
    index: "expirationAbsoluteMsec",
    keyRange: keyRange,
    onError: function(err){
      console.log(err)
    }
  } )

  var setTimeoutKeyRange = pit.makeKeyRange({
    lower: Date.now()
  })

  pit.query(function onSuccess(matchArray){
    function clearEntry (nonce){
      pit.remove(nonce, function onSuccess(bool){
        console.log('remove Timeout PITEntry: ', bool)
      }, function onError(err){
        console.log('error removing timed out Pitentry, ', err)
      })
    }
    for (var i = 0; i < matchArray.length; i++){
      var time = matchArray[i].expirationAbsoluteMsec - Date.now()
      setTimeout(clearEntry, time, matchArray[i].nonce)
    }
  },{
    index: "expirationAbsoluteMsec",
    keyRange: setTimeoutKeyRange,
    onError: function(err){
      console.log(err)
    }
  })
})

var PIT = {};

PIT.put = function(face, interestObj, interestBytes, forward){

  var prefixes = [];

  function getAllPrefixes(name){
    var prefix = name.getPrefix(-1)
    prefixes.push(prefix.toUri())
    if (prefix.components.length > 0) {
      getAllPrefixes(prefix)
    }
  }
  getAllPrefixes(interestObj.name)
  if (interestObj.publisherPublicKeyDigest) {
    var pubKeyDig = interestObj.publisherPublicKeyDigest.toString('hex')
  }
  var PITEntry = {
    nonce: interestObj.nonce.toString(),
    faceID: face.id,
    faceHash: face.ndndid.toString('hex'),
    publisherPublicKeyDigest: pubKeyDig || 'any',
    expirationAbsoluteMsec: (Date.now() + interestObj.interestLifetime),
    prefixURIs: prefixes,
    uri: interestObj.name.toUri(),
    encodedInterest: interestBytes
  }

  pit.put(PITEntry, function onSuccess(nonce){
    forward(face, interestBytes, interestObj)
    console.log(interestObj.interestLifetime, nonce)
    function clearEntry (){
      pit.remove(nonce, function onSuccess(bool){
        console.log('remove Timeout PITEntry: ', bool)
      }, function onError(err){
        console.log('error removing timed out Pitentry, ', err)
      })
    }
    setTimeout(clearEntry, interestObj.interestLifetime)
  }, function onError(err){
    console.log('error inserting PITEntry', PITEntry, err)
  })



}

PIT.lookupData = function(data, bytes, onAck) {
  console.log('got data, looking up in PIT')
  function evaluatePitEntrys(PITEntrys){
    if (PITEntrys.length > 0) {
      onAck(data)
    }
    var sent = []
    for (var i = 0; i < PITEntrys.length; i++){
      var entry = PITEntrys[i]
      var faceID = entry.faceID
      var faceHash = entry.faceHash
      var inst = new ndn.Interest()
      inst.decode(PITEntrys[i].encodedInterest)
      try {
        console.log(inst.matchesName(data.name) , (sent[faceID] == undefined) , (ndn.Faces.list[faceID].ndndid.toString('hex') == faceHash))
        if (inst.matchesName(data.name) && (sent[faceID] == undefined) && (ndn.Faces.list[faceID].ndndid.toString('hex') == faceHash)) {
          ndn.Faces.list[faceID].transport.send(bytes)
          sent[faceID] == true
          pit.remove(entry.nonce)
        }
      } catch (err) {
        // this is where we would do some voodoo for long standing, delay tolerant stuff
        console.log(err)
      }
    }
  }


  var pubKeyRange = pit.makeKeyRange({
    only: data.signedInfo.publisher.publisherPublicKeyDigest.toString('hex')
  })

  pit.query(function onSuccess(matchPubKey){
    var anyPublisherKeyRange = pit.makeKeyRange({
      only: "any"
    })
    pit.query(function onSuccess(matchAny){
      var possiblePitEntrys = matchPubKey.concat(matchAny)
      evaluatePitEntrys(possiblePitEntrys);
    },{
      index: "publisherPublicKeyDigest",
      keyRange: anyPublisherKeyRange
    })
  }, {
    index: "publisherPublicKeyDigest",
    keyRange: pubKeyRange
  })
}

PIT.lookupName = function(name, callback){
  var keyRange = pit.makeKeyRange({
    only: name.toUri()
  })

  pit.query(function onSuccess(matches){
    callback(matches)
  }, {
    index: "prefixURIs",
    keyRange: keyRange
  })
}



module.exports = PIT;
