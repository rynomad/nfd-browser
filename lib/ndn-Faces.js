
var ndn = require('ndn-browser-shim');
ndn.globalKeyManager = require('./ndn-keyManager.js');

var Faces = {};

Faces.list = []

Faces.add = function(face){
  if (face.ndndid == undefined){
    face.ndndid = ndn.globalKeyManager.getKey().publicKeyDigest
  }
  Faces.list.push(face)
  face.id = Faces.list.length - 1
  return face.id
}


module.exports = Faces;
