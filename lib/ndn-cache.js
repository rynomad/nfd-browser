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

cache.check = function(interest,element, transport, onhit, onmiss) {
  var uri = interest.name.toUri(),
      contentKey = utils.initSegment(0),
      reverse;
      if ((interest.childSelector == 0) || (interest.childSelector == undefined)) {
        reverse = false;
      } else {
        reverse = true;
      };

  if (utils.endsWithSegmentNumber(interest.name)) {
    // A specific segment of a data object is being requested, so don't bother querying for loose matches, just return or drop
    var level = interest.name.getPrefix(-1).append(contentKey).toUri(),
        segmentNumber = utils.getSegmentInteger(interest.name);

    if (db.sublevels[level] != undefined) {
      db.sublevels[level].get(segmentNumber, function(err, data) {
        if (err == undefined) {
          onhit(data, transport)
        } else {
          onmiss(element, interest )
        }
      })
    } else {
      onmiss(element,interest)
    }
  } else {
    // A general interest. Interpret according to selectors and return the first segment of the best matching dataset
    var suffixIndex = 0;
    var hit = false
    function crawl(q, lastfail) {
      var cursor, start, end;
      //console.log(q)
      if (db.sublevels[q] != undefined) {
        cursor = db.sublevels[q]
        if (lastfail && (reverse == true)) {
          var tmp = lastfail[lastfail.length - 1]
          lastfail[lastfail.length - 1] = tmp - 1
          end = lastfail
        } else if (lastfail) {
          var tmp = lastfail[lastfail.length - 1]
          lastfail[lastfail.length - 1] = tmp + 1
          start = lastfail
        }
        var read = false
        cursor.createReadStream({start: start, end: end, reverse: reverse, limit: 1}).on('data', function(data) {
          read = true
          if ((interest.exclude == null) || (!interest.exclude.matches(new ndn.Name.Component(data.key)))) {
            console.log('Suffix is not excluded');
            if (data.key == contentKey) {
              console.log('got to data');
              if ((interest.minSuffixComponents == null) || (suffixIndex >= interest.minSuffixComponents )) {
                console.log('more than minimum suffix components');
                db.sublevels[data.value].get(0, function(err, data){
                  if (interest.publisherPublicKeyDigest != undefined) {
                    var d = new ndn.Data()
                    d.decode(data)
                    if (ndn.DataUtils.arraysEqual(d.signedInfo.publisher.publisherPublicKeyDigest, interest.publisherPublicKeyDigest.publisherPublicKeyDigest)) {
                      onhit(data, transport)
                    } else {
                      crawl(q, contentKey)
                    }
                  } else {
                    onhit(data, transport)
                  }
                })
              } else {
                console.log('not enough suffix')
                crawl(q, contentKey)
              }
            } else {
              console.log('keep crawling')

              if ((interest.maxSuffixComponents == null) || (suffixIndex  < interest.maxSuffixComponents)) {
                suffixIndex++
                crawl(data.value)
              } else {
                console.log('reached max suffix');
                crawl(q,  data.key)
              }
            }

          } else {
            console.log('name component is excluded in interest,')
            crawl(q, data.key)
          }
        }).on('end', function(err,data){
          if ((read == false) && ((interest.minSuffixComponents == null) || (suffixIndex > interest.minSuffixComponents ))) {
            //we've exhasted this depth, need to go up a level, and we have the leeway from minSuffix to allow
            var comps = q.split('/')
            var fail = comps.pop()
            var newQ = '/' + comps.join('/')
            crawl(newQ, new ndn.Name.Component(fail).value)
          }

        })
      } else {
        onmiss(element,interest)
      }
    }
  crawl(uri)
  }
}


cache.data = function(data, element) {
  var segmentNumber = utils.getSegmentInteger(data.name),
      contentKey = utils.initSegment(0),
      levelName = data.name.getPrefix(-1).append(contentKey),
      level = levelName.toUri(),
      ttl;
  if (data.signedInfo.freshnessSeconds != undefined || 0) {
      ttl = data.signedInfo.freshnessSeconds * 1000
  }
  //console.log(level, segmentNumber, 'put in cache')
  db.sublevel(level).put(segmentNumber, element)
  var comps = level.split('/')
  //construct tree
  for (var i = comps.length - 1; i > 0; i-- ) {
    console.log(comps)
    var value = comps.join('/')
    var keyComp = comps.pop()
    if (keyComp == '%00') {
      var key = contentKey
    } else {
      var key = new ndn.Name.Component(keyComp).value
    }

    var slevel = comps.join('/') || '/'
    db.sublevel(slevel).put(key, value)

  }
}


module.exports = cache;
