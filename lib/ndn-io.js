var io = {};
var ndn = require('ndn-browser-shim')
io.worker = new Worker('./ndn-io-worker.js');

io.outstandingFetches = [];
io.outstandingMakes = []
var ms = new MessageChannel();
var executeHashNameCallback;

io.accessDaemon = function(daemon, cert, priPem, pubPem){
  daemon.postMessage({port: "ioPort"}, [ms.port1]);
  io.worker.postMessage({port: "daemonPort"}, [ms.port2]);
  io.worker.postMessage({cert: cert, priPem: priPem, pubPem: pubPem})
}

io.getHashName = function(callback){
  executeHashNameCallback = callback
  io.worker.postMessage({command: "getHashName"})
}

io.fetch = function(req, whenGotten, whenNotGotten) {
  uri = (new ndn.Name(req.uri)).toUri()
  io.worker.postMessage({
    "command": "fetch",
    "uri": uri,
    "type": req.type,
    "version": req.version,
    "selectors": req.selectors
  });
  io.outstandingFetches.push({uri: uri, whenGotten: whenGotten, whenNotGotten: whenNotGotten});
}

io.publish = function(opts){
  console.log('sending publish command')
  io.worker.postMessage({
    "command": "publish",
    "uri": opts.uri,
    "type": opts.type,
    "thing": opts.thing,
    "version": opts.version
  })
}

io.mirror = function(uri){
  io.worker.postMessage({
    "command": "mirror",
    "uri": uri
  })
}

io.makeEncodedData = function(uri, bytes, callback){
  io.outstandingMakes.push({id: bytes.toString(), callback: callback})
  io.worker.postMessage({command: "makeEncoded", uri: uri, bytes: bytes, id: bytes.toString()})
}

io.worker.onmessage = function (e) {
  if (e.data.responseTo == "fetch") {
    executeFetchCallback(e.data);
  } else if (e.data.responseTo == "publish") {
    executePublishCallback(e.data);
  } else if (e.data.responseTo == "makeEncoded") {
    executeEncodedDataCallback(e.data)
  } else if (e.data.responseTo == "getHashName") {
    executeHashNameCallback(e.data.hashName)
  }
}

function executeEncodedDataCallback(data) {
  for (var i = 0; i < io.outstandingMakes.length; i++) {
    if (io.outstandingMakes[i].id == data.id){
      io.outstandingMakes[i].callback(data.encoded)
    }
  }

}

var executeFetchCallback = function(response) {
  var mtch;
  console.log(response, io.outstandingFetches)
  for (var i = 0; i < io.outstandingFetches.length; i++){
    if (io.outstandingFetches[i].uri == response.uri) {
      console.log('matched outstanding fetch')
      mtch = io.outstandingFetches.splice(i,1)[0]
    }
  }
  console.log(mtch)
  if (response.success == true){
    mtch.whenGotten(new ndn.Name(mtch.uri), response.thing, response.firstCo);
  } else {
    mtch.whenNotGotten(new ndn.Name(mtch.uri));
  }

}

module.exports = io;
