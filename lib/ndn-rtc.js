var ndn = require('ndn-browser-shim');
ndn.io = require('./ndn-io.js')
var utils = require('./utils.js');
var ForwarderFace = require('./ndn-ForwarderFace.js');
var RTCWorkerChannel = require('./ndn-RTCWorkerChannel.js');
var BinaryXmlElementReader = ndn.BinaryXmlElementReader;
var BinaryXmlWireFormat = ndn.BinaryXmlWireFormat;
var ndnbuf = ndn.ndnbuf;
var Name = ndn.Name
var Data = ndn.Data
var LOG = require('./LOG.js')


var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

var rtc = {};
var servers = server = {
    iceServers: [
        {url: "stun:stun.l.google.com:19302"}
    ]
};


function sendOfferAndIceCandidate(ndndid, face, peer, offer, candidate) {
  var iceOffer = new Name(['ndnx', ndndid, 'newRTCface']);

  var obj = {action: 'newRTCface', sdp: offer.sdp, ice: candidate};
  console.log(ndn)
  var string = JSON.stringify(obj)
  var bytes = new ndn.ndnbuf(string)

  function onRemote(){
    peer.addIceCandidate(new RTCIceCandidate({
        sdpMLineIndex: answerIce.ice.sdpMLineIndex,
        candidate: answerIce.ice.candidate
    }));
  };

  var onAnswer = function (interest, data) {

    answerIce = JSON.parse(ndn.DataUtils.toString(data.content));
    console.log('got answer', answerIce)
    peer.setRemoteDescription(new RTCSessionDescription(answerIce.sdp), onRemote)
  };

  function encodingCallback (encoded){
    iceOffer.append(encoded)
    var offerInterest = new ndn.Interest(iceOffer)
    //console.log(offerInterest, face);
    utils.setNonce(offerInterest);
    face.expressInterest(offerInterest, onAnswer);
  }
  ndn.io.makeEncodedData('', bytes, encodingCallback)
};


rtc.createDataChannel = function (ndndid, face) {
  if (ndndid == undefined) {
    ndndid = 'filler'
  }
  var peer = new PeerConnection(servers)
  var dataChannel = peer.createDataChannel('ndn', null);
  window.test = [peer, dataChannel]

  peer.onicecandidate = function (evt) {
    if (evt.candidate) {
      console.log('got ICE candidate, ', evt.candidate);
      sendOfferAndIceCandidate(ndndid, face, peer, peer.offer, evt.candidate);
      peer.onicecandidate = null;
    };
  };

  function onOfferCreated(offer){
    peer.offer = offer;
    peer.setLocalDescription(offer, onLocalDescriptionSet);
  }

  function onLocalDescriptionSet() {
    // after this function returns, pc1 will start firing icecandidate events
    //console.log('local description set, ', peer);
  };
  var cb = function(){return true}
  peer.createOffer(onOfferCreated);
  return dataChannel;
};

rtc.onInterest = function (prefix, interest, transport) {
  var nfblob = interest.name.components[3].value
  var d = new Data();
  d.decode(nfblob)
  var string = ndn.DataUtils.toString(d.content);
  //console.log(string)
  var iceOffer = JSON.parse(string)
  //console.log(iceOffer)
  var candidate = iceOffer.ice;

  //console.log(iceOffer);

  var offer = {
    type: "offer",
    sdp: iceOffer.sdp
  };

  var peer = new PeerConnection(servers);
  //window.test = peer

  peer.onicecandidate = function (evt) {
    peer.answer.ice = evt.candidate
    var string = JSON.stringify(peer.answer);
    var sending = new ndn.ndnbuf(string)
    var data = new ndn.Data(interest.name, new ndn.SignedInfo(), sending)
    data.signedInfo.setFields()
    data.signedInfo.freshnessSeconds = 0
    data.sign();
    var encoded = data.encode()

    transport.send(encoded);
    //console.log('sent answer', peer.answer);
    peer.onicecandidate = null;
  };

  peer.ondatachannel = function (evt) {
    var dataChannel = evt.channel
    var wrapper = new RTCWorkerChannel(dataChannel);

    rtc.daemon.postMessage({port: "RTCPort", ndndid: d.signedInfo.publisher.publisherPublicKeyDigest}, [wrapper.port])

  };

  peer.setRemoteDescription(new RTCSessionDescription(offer), onRemoteSet)


  var onCreated = function(sdp) {
    peer.setLocalDescription(sdp)
    peer.answer = {};
    peer.answer.sdp = sdp

  };

  function onRemoteSet() {
    peer.addIceCandidate(new RTCIceCandidate({
      sdpMLineIndex: candidate.sdpMLineIndex,
      candidate: candidate.candidate
    }));
    peer.createAnswer(onCreated)
  };

};

rtc.init = function(daemon) {
  rtc.daemon = daemon
}

module.exports = rtc;
