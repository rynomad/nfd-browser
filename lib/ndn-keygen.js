require('./forge.min.js');
var keygen = {};
var pki = forge.pki;

keygen.init = function(keyManagerPort, callback){
  console.log('checking keypair')
  if (localStorage['certificate'] == undefined) {

    var self = this;
    console.log('generating keypair', forge)
    pki.rsa.generateKeyPair({bits: 2048, workers: 2}, function(er, keys){
      console.log(er, keys)
      var cert = pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
      cert.sign(keys.privateKey);
      var pem = pki.certificateToPem(cert);
      var pubPem = pki.publicKeyToPem(keys.publicKey);
      var priOpenPem = pki.privateKeyToPem(keys.privateKey);
      localStorage['certificate'] = pem;
      localStorage['publicKey'] = pubPem;
      var password = prompt('Please input a password to protect your new encryption key');
      var priPem = pki.encryptRsaPrivateKey(keys.privateKey, password);
      localStorage['privateKey'] = priPem;
      keyManagerPort.postMessage([pem, pubPem, priOpenPem])
    });
  } else {
    var password = prompt('please enter your password to unlock your private key')
    var EncryptedPriPem = localStorage['privateKey']
    var priKey = pki.decryptRsaPrivateKey(EncryptedPriPem, password)
    var priPem = pki.privateKeyToPem(priKey)
    var cert = localStorage['certificate']
    var pubPem = localStorage['publicKey']
    keyManagerPort.onmessage = function(e) {
      window.ndndid = e.data
      callback(e.data, cert,  priPem, pubPem)
    }
    keyManagerPort.postMessage([cert, pubPem, priPem])


  }
}

module.exports = keygen;

