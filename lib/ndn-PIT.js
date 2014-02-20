var ndn = require('ndn-browser-shim');
var down = require('level-js');
var level = require('levelup');
var ttl = require('level-ttl');
var db = ttl(level('PIT', {db: down, valueEncoding: "json"}));
ndn.Faces = require('./ndn-Faces.js')
var strategy = require('./ndn-strategy.js');

var PIT = {};

PIT.put = function(face, interest, forward){
  var key = interest.name.toUri()
  var u8 = interest.encode();
  if (typeof face.ndndid == 'number') {
    var faceID = face.ndndid
  } else {
    var faceID = face.ndndid.toString('hex')
  }
  var b64encoded = btoa(String.fromCharCode.apply(null, u8));
  var value = {
    interest: b64encoded,
    faceID: faceID,
    uri: interest.name.toUri()
  }
  db.get(key, function(err, data) {
    console.log(err, data)
    if (err == undefined) {
      data.push(value);
      db.put(key, data, function(){
        forward(face, u8,  interest)
      })
    } else {
      data = [value];
      db.put(key, data, function(){
        forward(face, u8, interest)
      })
    }
  })
}

PIT.lookupData = function(data, onAck) {

  console.log('got data, looking up in PIT')
  function forward (PITEntrys) {
    if (PITEntrys.length > 0) {
      onAck(data)
    }
    var element = data.encode();
    var faceIDs = []
    var results = PITEntrys

    for (var i = 0; i < results.length; i++){
      if (faceIDs.length == 0) {
        if (results[i].interest.publsherPublicKeyDigest == undefined || data.signedInfo.publisher.publisherPublicKeyDigest) {
          faceIDs.push(results[i].faceID)
        }
      } else {
        for (var j = 0; j < faceIDs.length; j++){
          if (faceIDs[j] == results[i].faceID) {
            continue;
          } else if (j == faceIDs.length - 1) {
            if (results[i].interest.publsherPublicKeyDigest == undefined || data.signedInfo.publisher.publisherPublicKeyDigest) {
              faceIDs.push(results[i].faceID)
            }
          }
        }
      }


    }
    console.log('results', results, faceIDs)
    for (var i = 0; i < faceIDs.length; i++){
      var catches = [];
      try {
        ndn.Faces[faceIDs[i]].transport.send(element);
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
  var longUri = name.toUri(),
      comps = longUri.split('/')


  for (var i = comps.length - 1;i > 0 ; i-- ) {
    var uri = comps.join('/')
    console.log(uri, comps)
    comps.pop()
    db.get(uri, function(err, data){
      console.log(err, uri, data)
      if (err == undefined){
        var returns = [];
        var interests = []
        var results = []
        for (var i = 0; i < data.length; i++){
          var u8interest = new Uint8Array(atob(data[i].interest).split("").map(function(c) {return c.charCodeAt(0); }));
          var inst = new ndn.Interest()
          inst.decode(u8interest)
          if (inst.matchesName(name)){
            interests.push(inst)
            data[i].interest = inst
            results.push(data[i])
          }
        }

        callback(results)
      }
    })

  }
}


PIT.consume = function(PITEntrys) {
  if (PITEntrys.length != 0){
    var entry = PITEntrys.pop()
    var uri = entry.uri
    db.get(uri, function(err, data){
      if (err == undefined) {
        for (var j = data.length - 1; j >= 0; j--) {
          var u8interest = new Uint8Array(atob(data[j].interest).split("").map(function(c) {return c.charCodeAt(0); }));
          var inst = new ndn.Interest()
          inst.decode(u8interest)
          if (inst.nonce.toString() == entry.interest.nonce.toString()) {
            data.splice(j, 1)
            continue
          }
        }
        db.put(uri, data, function(err) {
          PIT.consume(PITEntrys)
        })
      }
    })
  }
}


module.exports = PIT;
