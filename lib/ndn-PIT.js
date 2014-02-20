var ndn = require('ndn-browser-shim');
var down = require('level-js');
var level = require('levelup');
var ttl = require('level-ttl');
var db = ttl(level('PIT', {db: down}));
var strategy = require('./ndn-strategy.js');

var PIT = {};

PIT.put = function(face, interest){
  var key = interest.name.toUri()
  if (face.ndndid == undefined) {
    var faceID = Date.now()
  } else {
    var faceID = face.ndndid.toString('hex')
    }

  var value = {
    interest: interest.encode(),
    faceID: faceID
  }
  db.get(key, function(err, data) {
    console.log(err, data)
    if (err == undefined) {
      data.push(value);
      db.put(key, data)
    } else {
      data = [value];
      db.put(key, data)
    }
  })
}

PIT.lookupData = function(data, onAck) {


  function forward (PITEntrys) {
    if (PitEntrys.length > 0) {
      onAck(data)
    }
    var element = data.encode();
    var faceIDs = []
    var results = PITEntrys

    for (var i = 0; i < results.length; i++){
      for (var j = 0; j < faceIDs.length; j--){
        if (faceIDs[j] == results[i].faceID) {
          continue;
        } else if (j == faceIDs.length - 1) {
          var inst = new ndn.Interest().decode(results[i].interest)
          if (inst.publsherPublicKeyDigest == undefined || data.signedInfo.publisher.publisherPublicKeyDigest) {
            faceIDs.push(results[i])
          }
        }
      }
    }

    for (var i = 0; i < faceIDs.length; i++){
      var catches = [];
      try {
        Faces[faceIDs[i]].transport.send(element);
      } catch (er){
        catches.push(faceIDs[i])
        console.log('error', er)

      }
    }
    strategy.caughtDataSends(catches, PITEntrys)
    PIT.consume(PITEntrys)
  }

  PIT.lookupName(data.name, forward)
}

PIT.lookupName = function(name, callback){
  var comps = name.toUri().split('/');

  for (var i = comps.length - 1;i >= 0 ; i-- ) {
    var uri = comps.join('/')
    comps.pop()
    db.get(uri, function(err, data){
      if (err == undefined){
        var returns = [];
        var interests = []
        var results = []
        for (var i = 0; i < data.length; i++){
          var inst = new ndn.Interest().decode(data[i].interest)
          if (inst.matchesName(name)){
            interests.push(inst)
            results.push(data[i])
          }
        }

        callback(results)





      }
    })

  }
}


PIT.consume = function(PITEntrys) {
  console.log('you should be consuming these pit entrys', PITEntrys)
}

module.exports = PIT;
