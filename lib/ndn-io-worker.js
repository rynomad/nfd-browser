var ndn = require('ndn-browser-shim');
ndn.globalKeyMangager = require('./ndn-keyManager.js')
var utils = require('./utils.js');
var channelTransport = require('./ndn-MessageChannelTransport.js');
var io = {};

onmessage = function(e){
  if (e.data.port) {
    if (e.data.port == "daemonPort") {
      self.face = new ndn.Face({host:1,port:1,getTransport: function(){return new channelTransport.transport(e.ports[0])}})
      self.face.transport.connect(self.face, function(){console.log("io face is connected to daemon")})
    }
  } else if (e.data.cert){
    //console.log('setting keys', e.data.cert, e.data.pubPem, e.data.priPem)
    ndn.globalKeyManager.certificate = e.data.cert
    ndn.globalKeyManager.publicKey = e.data.pubPem
    ndn.globalKeyManager.privateKey = e.data.priPem
    console.log(ndn.globalKeyManager)
  } else if (e.data.command) {
    if (e.data.command == "fetch") {
      io.fetch(e.data)
    } else if (e.data.command == "publish") {
      io.publish(e.data)
    }

  }
}


io.fetch = function(opts) {

  var interestsInFlight = 0;
  var windowSize = 4;
  var t0 = new Date().getTime()
  var segmentRequested = [];
  var whenNotGottenTriggered = false

  var name = new ndn.Name(opts.uri)



  var contentArray = [];

  var recievedSegments = 0;

  var onData = function(interest, co) {
    interestsInFlight--;

    var segmentNumber = utils.getSegmentInteger(co.name)
    var finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);
    //console.log(segmentNumber, co.name.toUri());
    if (contentArray[segmentNumber] == undefined) {
      if (opts.type == 'object') {
        contentArray[segmentNumber] = (ndn.DataUtils.toString(co.content));
      } else if (opts.type == 'blob' || 'file'){
        contentArray[segmentNumber] = co.content;
      }

      recievedSegments++;
    }

    //console.log(recievedSegments, finalSegmentNumber, interestsInFlight);
    if (recievedSegments == finalSegmentNumber) {
        console.log('got all segment', contentArray.length);
        var t1 = new Date().getTime()
        console.log(t1 - t0)
        if (opts.type == "object") {
          assembleObject(name);
        } else if (opts.type == "blob" || "file") {
          assembleBlob(name)
        };

    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if ((contentArray[i] == undefined) && (segmentRequested[i] == undefined)) {
            var newName = co.name.getPrefix(-1).appendSegment(i)
            var newInterest = new ndn.Interest(newName)
            //console.log(newName.toUri())
            utils.setNonce(newInterest)
            if (opts.selectors != undefined) {
              newInterest.publisherPublicKeyDigest = new ndn.PublisherPublicKeyDigest(opts.selectors.publisherPublicKeyDigest)
            }
            self.face.expressInterest(newInterest, onData, onTimeout)
            segmentRequested[i] = 0;
            interestsInFlight++
            if (interestsInFlight == windowSize) {
              //stop iterating
              i = finalSegmentNumber;
            };
          };
        };
      };
    };
  };
  var onTimeout = function(interest) {
    var seg = utils.getSegmentInteger(interest.name)
    if (segmentRequested[seg] < 3) {
      segmentRequested[seg]++
      var newInterest = new ndn.Interest(interest.name);
      utils.setNonce(newInterest)
      if (opts.selectors != undefined) {
        newInterest.publisherPublicKeyDigest = new ndn.PublisherPublicKeyDigest(opts.selectors.publisherPublicKeyDigest)
      }
      self.face.expressInterest(newInterest, onData, onTimeout)

    } else if ((whenNotGottenTriggered == false)) {
      whenNotGottenTriggered = true;
      self.postMessage({responseTo: "fetch", success: false, uri: name.toUri()})
    }
  };

  var assembleBlob = function(name) {
    var mime = name.components[2].toEscapedString() + '/' + name.components[3].toEscapedString()
    var blob = new Blob(contentArray, {type: mime})
    self.postMessage({responseTo: "fetch", success: true, uri: name.toUri(), thing: blob});
  };

  var assembleObject = function(name) {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    self.postMessage({responseTo: "fetch", success: true, uri: name.toUri(), thing: obj});
  };

  var segName = new ndn.Name(name)
  segmentRequested[interestsInFlight] = 0;
  var interest = new ndn.Interest(segName);
  if (opts.selectors != undefined) {
    interest.publisherPublicKeyDigest = new ndn.PublisherPublicKeyDigest(opts.selectors.publisherPublicKeyDigest)
  }
  utils.setNonce(interest)
  //console.log(interest.name.toUri())

  self.face.expressInterest(interest, onData, onTimeout);


};

io.publishFile = function(opts) {
  //console.log( opts.thing)
  var chunkSize = 7000,
      fileSize = (opts.thing.size - 1),
      totalSegments = Math.ceil(opts.thing.size / chunkSize),
      name = new ndn.Name(opts.uri)


  function getSlice(file, segment, transport) {
    //console.log(file)
    var fr = new FileReader(),
        chunks = totalSegments,
        start = segment * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize,
        blob = file.slice(start,end);

    fr.onloadend = function(e) {
      var buff = new ndn.ndnbuf(e.target.result),
          segmentName = (new ndn.Name(name)).appendSegment(segment),
          data = new ndn.Data(segmentName, new ndn.SignedInfo(), buff),
          encodedData;

        data.signedInfo.setFields();
        data.signedInfo.finalBlockID = utils.initSegment(totalSegments - 1);
        data.sign();
        encodedData = data.encode();

        transport.send(encodedData);
        var ms = new MessageChannel()
        ms.port1.postMessage(e.target.result, [e.target.result])
        //ms.port1.postMessage(buff.buffer, [buff.buffer])
        if (segment == totalSegments -1) {
          //remove closure from registeredPrefixTable
          for (var i = 0; i < ndn.Face.registeredPrefixTable.length; i++) {
            if (ndn.Face.registeredPrefixTable[i].prefix.match(new ndn.Name(name))) {
              ndn.Face.registeredPrefixTable.splice(i,1);
            }
          }
        }
    };
    //console.log("about to read as array buffer")
    fr.readAsArrayBuffer(blob, (end - start))


  };
  //console.log('y u crashing?')
  function onInterest(prefix, interest, transport) {
    //console.log("onInterest called.", opts);
    if (!utils.endsWithSegmentNumber(interest.name)) {
      interest.name.appendSegment(0);
    };
    var segment = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.components[interest.name.components.length - 1].value);

    getSlice(opts.thing, segment, transport)

  };
  //console.log('when u crashing?')
  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    //console.log(name.toUri())
    var command = name.getPrefix(- 1).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(utils.getSuffix(name, name.components.length - 1 ))
    var interest = new ndn.Interest(command)
    utils.setNonce(interest)
    //console.log("did this time correctly?", command.toUri())
    self.face.expressInterest(interest, onData, onTimeout);

  };
  var prefix = name
  //console.log(name.toUri())
  var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, self.face.transport);
  ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
  console.log("publish defined")
  setTimeout(sendWriteCommand, 0)

};

io.publishObject = function(opts) {
  var returns = utils.chunkArbitraryData(opts)
  var name = returns.name
  var ndnArray = returns.array

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    console.log("got object interest", interest)
    transport.send(ndnArray[requestedSegment])
  };
  var prefix = name

  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, self.face.transport);
    ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));

    var command = name.getPrefix(- 1).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(utils.getSuffix(name, name.components.length - 1 ))
    var interest = new ndn.Interest(command)
    utils.setNonce(interest)
    //console.log("did this time correctly?", command.toUri())
    self.face.expressInterest(interest, onData, onTimeout);

  };
  setTimeout(sendWriteCommand, 0)
};

io.publish = function (opts) {
  if (opts.type== "object") {
    io.publishObject(opts)
  } else if (opts.type == "file" || "blob" ) {
    io.publishFile(opts)
  }
}

function cb() {
  var keyName = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
  var inst = new ndn.Interest(keyName)

}
var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};


module.exports = io;

