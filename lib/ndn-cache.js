var utils = require('./utils.js')
var ndn = require('ndn-browser-shim');

var level = require('levelup');
var memdown = require('memdown')
var sublevel = require('level-sublevel');
var superlevel = require('level-superlevel');
var ttl = require('level-ttl');
var db = sublevel(superlevel(ttl(level('cache',{db: memdown}))));



var cache = {}
cache.db = db

cache.check = function(interest, transport, onmiss) {
  var uri = interest.name.toUri(),
      reverse;
      if ((interest.childSelector == 0) || (interest.childSelector == undefined)) {
        reverse = false;
      } else {
        reverse = true;
      };

  if (utils.endsWithSegmentNumber(interest.name)) {
    // A specific segment of a data object is being requested, so don't bother querying for loose matches, just return or drop
    db.superlevel.get(uri, function(err, data) {
      if (err == undefined) {
        transport.send(data)
      } else {
        onmiss(interest, transport)
      }
    })
  } else {
    // A general interest. Interpret according to selectors and return the first segment of the best matching dataset
    var suffixIndex = 0;
    function crawl(q, lastsuccess, lastfail) {
      var cursor, start, end;
      if (db.sublevels[q] != undefined) {
        cursor = db.sublevels[q]
        if (lastfail && (reverse == true)) {
          end = lastfail.substr(0, lastfail.length - 1)
        } else if (lastfail) {
          start = lastfail + ' '
        }
        cursor.createReadStream({start: start, end: end, reverse: reverse, limit: 1}).on('data', function(data) {
          if ((interest.maxSuffixComponents == null) || (suffixIndex <= interest.maxSuffixComponents)) {
            console.log('Suffix count within constraints');
            if ((interest.exclude == null) || (!interest.exclude.matches(new ndn.Name.Component(data.key)))) {
              console.log('Suffix is not excluded');
              if (data.key == '%00') {
                console.log('got to data');
                if ((interest.minSuffixComponents == null) || (suffixIndex >= interest.minSuffixComponents )) {
                  console.log('more than minimum suffix components');
                  db.sublevels[data.value].get(0, function(err, data){
                    if (interest.publisherPublicKeyDigest != undefined) {
                      var d = new ndn.Data()
                      d.decode(data)
                      if (ndn.DataUtils.arraysEqual(d.signedInfo.publisher.publisherPublicKeyDigest, interest.publisherPublicKeyDigest.publisherPublicKeyDigest)) {
                        transport.send(data)
                      } else {
                        crawl(q, lastsuccess, '%00')
                      }
                    } else {
                      transport.send(data)
                    }
                  })
                } else {
                  console.log('not enough suffix')
                  crawl(q, lastsuccess, '%00')
                }
              } else {
                console.log('keep crawling')
                suffixIndex++
                crawl(data.value, q)
              }

            } else {
              console.log('name component is excluded in interest,')
              crawl(q, lastsuccess, data.key)
            }
          } else {
            console.log('too many suffix components');
            suffixIndex--;
            crawl(lastsuccess, null, q.substr(lastsuccess.length, q.length))
          }
        })
      } else {
        onmiss(interest, transport)
      }
    }
  crawl(uri)
  }
}


cache.data = function(data, element) {}

module.exports = cache;
