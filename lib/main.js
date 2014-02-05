
var nfd = new Worker('./nfd-worker.js');

var ndn = require('ndn-browser-shim')
ndn.keygen = require('./ndn-keygen.js');
ndn.rtc = require('./ndn-rtc.js');
ndn.io = require('./ndn-io.js');

ndn.dc = require('./ndn-dc.js');
ndn.dc.accessDaemon(nfd);
ndn.x = require('./ndn-x.js');


ndn.init = function(opts) {
  opts.init = true;
  nfd.postMessage(opts);
  opts.init = false;
  var keyPort = new MessageChannel()
  nfd.postMessage({port: "keyPort"},[keyPort.port2])

  xinit = function(id, cert, priPem, pubPem){
    ndn.x.init(nfd, id)
    ndn.id = id
    ndn.io.accessDaemon(nfd, cert, priPem, pubPem)
  }
  ndn.keygen.init(keyPort.port1, xinit);
  ndn.r = new Worker('./ndn-repo.js');

  var repoPort = new MessageChannel()
  ndn.r.postMessage({uri: opts.prefix }, [repoPort.port1])
  nfd.postMessage({port: "repoPort"}, [repoPort.port2])

}


window.control = ndn

ndn.init({prefix: 'test'})



module.exports = ndn;
