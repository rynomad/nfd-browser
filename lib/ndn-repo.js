//Global Namespacing for the ndnr



function indexedDBOk() {
  return "indexedDB" in window;
};

var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};

var ndn = require('ndn-browser-shim');
var local = require('./ndn-MessageChannelTransport.js')
var Name = ndn.Name;
var utils = require('./utils.js')

/**
 * Database constructor
 * @prefix: application prefix (used as database name) STRING (may contain globally routable prefix)
 */

var ndnr = {};



// vvvv THIS IS THE GOOD STUFF vvvv Plus NDN-helpers. NEED to Refactor and streamline useIndexedDB a little but it seems to be working good

ndnr.interestHandler = function(prefix, interest, transport) {
  //console.log("onInterest called for incoming interest: ", interest.toUri());
  interest.face = self.face;
  if (utils.nameHasCommandMarker(interest.name)) {
    console.log('incoming interest has command marker ', utils.getCommandMarker(interest.name));
    executeCommand(prefix, interest, transport);
    return;
  } else {
    //console.log('attempting to fulfill interest');
    fulfillInterest(prefix, interest, transport);
  };
};


//TODO: Flesh out this subroutine, it is the keystone of the library, handle interest selectors, etc
function fulfillInterest(prefix, interest, transport) {
  //console.log('repo fulfilling interest')
  var localName = utils.getSuffix(interest.name, prefix.components.length )
      objectStoreName = utils.normalizeNameToObjectStore(localName),
      dbName = prefix.toUri(),
      getContent = {},
      suffixIndex = 0,
      query = localName.toUri();
      if ((interest.childSelector == 0) || (interest.childSelector == undefined)) {
        cursorOrder = "next";
      } else {
        cursorOrder = "prev";
      };

  if (utils.endsWithSegmentNumber(interest.name)) {
    // A specific segment of a data object is being requested, so don't bother querying for loose matches, just return or drop
    requestedSegment = utils.getSegmentInteger(interest.name)
    //console.log(requestedSegment, interest.name.components)
    getContent.onsuccess = function(e, request) {
      getContent.result = e.target.result;
      if (e.target.result.objectStoreNames.contains(objectStoreName)) {
        e.target.result.transaction(objectStoreName).objectStore(objectStoreName).get(requestedSegment).onsuccess = function(e) {
          if (interest.publisherPublicKeyDigest != undefined) {
            console.log
            var d = new ndn.Data()
            d.decode(e.target.result)
            if (ndn.DataUtils.arraysEqual(d.signedInfo.publisher.publisherPublicKeyDigest, interest.publisherPublicKeyDigest.publisherPublicKeyDigest)) {
              transport.send(e.target.result)
            } else {
              console.log('got data not matching publisherPublicKeyDigest interest selector')
            }
          } else {
            transport.send(e.target.result)
          }


          request.result.close()
        };
      } else {
        console.log("no data for ", interest)
      };
    };
  } else {
    // A general interest. Interpret according to selectors and return the first segment of the best matching dataset
    getContent.onsuccess = function(e) {
      db = getContent.result = e.target.result
      function crawl(q) {
        console.log(q)
        if (db.objectStoreNames.contains(q)) {
          var store = db.transaction(q).objectStore(q),
              index = store.index('escapedString');
          console.log('objectStoreNames contains ', q)
          if ((interest.maxSuffixComponents == null) || (suffixIndex <= interest.maxSuffixComponents)) {
            console.log('Suffix count within constraints')
            index.openCursor(null, cursorOrder).onsuccess = function(e) {
              var cursor = e.target.result;
              if (cursor) {
                console.log(interest)
                if ((interest.exclude == null) || (!interest.exclude.matches(new ndn.Name.Component(cursor.value.escapedString)))) {
                  console.log(cursor.value.escapedString)
                  if (cursor.value.escapedString == "%00") {
                    console.log('got to data')
                    if ((interest.minSuffixComponents == null) || (suffixIndex >= interest.minSuffixComponents )) {
                      console.log('more than minimum suffix comps')
                      query += '/' + cursor.value.escapedString
                      console.log(query)

                      store = db.transaction(query).objectStore(query).get(0).onsuccess = function(e) {
                        if (interest.publisherPublicKeyDigest != undefined) {
                          var d = new ndn.Data()
                          d.decode(e.target.result)
                          if (ndn.DataUtils.arraysEqual(d.signedInfo.publisher.publisherPublicKeyDigest, interest.publisherPublicKeyDigest.publisherPublicKeyDigest)) {
                            transport.send(e.target.result)
                          } else {
                            //console.log('got data not matching publisherPublicKeyDigest interest selector')
                          }
                        } else {
                          transport.send(e.target.result)
                        }

                      };
                    } else {
                      cursor.continue()
                    };
                  } else {
                    suffixIndex++
                    if (query != '/') {
                      query += '/' + cursor.value.escapedString
                    } else {
                      query += cursor.value.escapedString
                    }

                    crawl(query)
                  };
                } else {
                  cursor.continue()
                };
              } else {
                console.log('no entries ')
              };
            };
          } else {
            console.log('too many suffix components')
          };
        };
      };
      crawl(query)
    };
  };
  useIndexedDB(dbName, getContent);
};


function recursiveSegmentRequest(face, prefix, objectStoreName) {
  var firstSegmentName = (new ndn.Name(prefix)).append(new ndn.Name(objectStoreName));
  var contentArray = [];

  function putContentArray () {
    var dbName = prefix.toUri();
    var collector = new MessageChannel()
    var finalSegment = contentArray.length - 1
    var insertSegment = {}
    insertSegment.onsuccess = function(e, request) {
      console.log('putting segments')
      var currentSegment = contentArray.length - 1
      var req = e.target.result
      var putter = e.target.result.transaction(objectStoreName, "readwrite").objectStore(objectStoreName);
      function putSegment(seg) {
        var encoded = contentArray[seg].encode()
        putter.put(encoded, seg).onsuccess = function(e) {
          console.log('put seg ', seg)
          collector.port1.postMessage(encoded.buffer, [encoded.buffer])
          contentArray.pop()

          if (contentArray.length > 0) {
            currentSegment = contentArray.length - 1
            putSegment(currentSegment)
          } else {
            var t1 = new Date().getTime()
            console.log(t1 - t0)

            request.result.close()
            req.close()
          }
        }
      }
      putSegment(currentSegment)
    }
    useIndexedDB(dbName, insertSegment)
  }


  var interestsInFlight = 0;
  var windowSize = 10;
  var t0 = new Date().getTime()
  var segmentRequested = [];
  var whenNotGottenTriggered = false

  var name = firstSegmentName.getPrefix(-1)






  var recievedSegments = 0;
  var numberOfSegments = null
  var onData = function(interest, co) {
    interestsInFlight--;
    recievedSegments++;
    console.log(co)
    var segmentNumber = utils.getSegmentInteger(co.name)
    if (numberOfSegments == null) {
      numberOfSegments = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);
    }
    //console.log(segmentNumber);
    if (contentArray[segmentNumber] == undefined) {
        contentArray[segmentNumber] = co
      }



    //console.log(recievedSegments, finalSegmentNumber, interestsInFlight);
    if (recievedSegments == numberOfSegments) {
        console.log('got all segment', contentArray.length);
        var t1 = new Date().getTime()
        console.log(t1 - t0)
        putContentArray()
    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < numberOfSegments; i++) {
          if ((contentArray[i] == undefined) && (segmentRequested[i] == undefined)) {
            var newName = co.name.getPrefix(-1).appendSegment(i)
            var newInterest = new ndn.Interest(newName)
            //console.log(newName.toUri())
            utils.setNonce(newInterest)
            self.face.expressInterest(newInterest, onData, onTimeout)
            segmentRequested[i] = 0;
            interestsInFlight++
            if (interestsInFlight == windowSize) {
              //stop iterating
              i = numberOfSegments;
            }
          }
        }
      }
    }
  }
  var onTimeout = function(interest) {
    var seg = utils.getSegmentInteger(interest.name)
    if (segmentRequested[seg] < 3) {
      segmentRequested[seg]++
      var newInterest = new ndn.Interest(interest.name);
      utils.setNonce(newInterest)
      self.face.expressInterest(newInterest, onData, onTimeout)

    } else if ((whenNotGottenTriggered == false)) {
      whenNotGottenTriggered = true;
      self.postMessage({responseTo: "fetch", success: false, uri: name.toUri()})
    }
  }

  var segName = new ndn.Name(name)
  segName.appendSegment(0)
  var interest = new ndn.Interest(segName);
  utils.setNonce(interest)
  //console.log(interest.name.toUri())

  self.face.expressInterest(interest, onData, onTimeout);

}

function buildObjectStoreTree(prefix, objectStoreName, onFinished, arg) {
  var dbName = prefix.toUri(),
      properName = new ndn.Name(objectStoreName),
      uriArray = utils.getAllPrefixes(properName),
      toCreate = [],
      evaluate = {},
      growTree = {},
      version;

      evaluate.onsuccess = function(e) {
        for (i = 0 ; i < uriArray.length; i++) {
          if (!e.target.result.objectStoreNames.contains(uriArray[i])) {
            toCreate.push(uriArray[i]);
          };
        };

        if (toCreate.length > 0) {
          console.log(toCreate.length, " objectStores need to be created. Attempting to upgrade database");
          version = e.target.result.version + 1;
          useIndexedDB(dbName, growTree, version);
        } else {
          console.log(toCreate.length, " objectStores need to be created. calling onFinished(arg) if applicable");
          if (onFinished == recursiveSegmentRequest) {
            if (arg) {
              onFinished(arg, prefix, objectStoreName)
            } else {
              onFinished()
            };
          }
        };

      };


      growTree.onupgradeneeded = function(e) {
        console.log("growTree.onupgradeneeded fired: creating ", toCreate.length, " new objectStores");
        for(i = 0; i < toCreate.length; i++) {
          if (toCreate[i] == objectStoreName) {
            e.target.result.createObjectStore(toCreate[i])

          } else {

            var store = e.target.result.createObjectStore(toCreate[i], {keyPath: "escapedString"});
            store.createIndex('escapedString', 'escapedString', {unique: true})

          };
        };
      };

      growTree.onsuccess = function(e) {
        console.log("database successfully upgraded to version ", e.target.result.version);
        var transaction = e.target.result.transaction(uriArray, "readwrite")
        transaction.oncomplete = function(e) {
          console.log("New Tree successfully populated, now calling onFinished(arg) if applicable")
          if (onFinished == recursiveSegmentRequest) {
            if (arg) {
              onFinished(arg, prefix, objectStoreName)
            } else {
              onFinished()
            };
          };
        };

        uriArray.pop();

        (function populate(i) {
          var entry = {};
          entry.component = properName.components[i];
          console.log(entry)
          entry.escapedString = entry.component.toEscapedString();
          transaction.objectStore(uriArray[i]).put(entry);
          i++;
          if (i < uriArray.length) {
            populate(i);
          };
        })(0)
      };

  useIndexedDB(dbName, evaluate);
};

function executeCommand(prefix, interest, transport) {
  var command = utils.getCommandMarker(interest.name).split('%7E')[0];

  if (command in ndnr.commandMarkers) {
    console.log("executing recognized command ", command);
    ndnr.commandMarkers[command](prefix, interest, transport);
  } else {
    console.log("ignoring unrecognized command ", command);
  };
};

function useIndexedDB(dbName, action, version) {
  var request;

  if (version) {
    request = indexedDB.open(dbName, version);
  } else {
    request = indexedDB.open(dbName);
  };

  if (action.onupgradeneeded) {
    request.onupgradeneeded = action.onupgradeneeded;
  } else {
    request.onupgradeneeded = function(e) {
      console.log('upgrading database to version ', e.target.result.version)
    };
  };
  if (action.onsuccess) {
    request.onsuccess = function(e) {
      request.result.onversionchange = function(e){
        console.log('version change requested, closing db');
        request.result.close();
      }
      action.onsuccess(e, request);
    };
  } else {
    request.onsuccess = function(e) {
      request.result.onversionchange = function(e){
        console.log('version change requested, closing db');
        request.result.close();
      }
      console.log("database ", dbName, " is open at version ", e.target.result.version)
      request.result.close();
    };
  };
  if (action.onerror) {
    request.onerror = action.onerror;
  } else {
    request.onerror = function(e) {
      console.log('error: ', e);
    };
  };
  if (action.onclose) {
    request.onclose = action.onclose;
  } else {
    request.onclose = function(e) {
      console.log("database ", dbName, " is closed at version ", e.target.result.version)
    };
  };
  if (action.onblocked) {
    request.onblocked = action.onblocked;
  } else {
    request.onblocked = function(e) {
      console.log("request blocked: ", e);
    };
  };
};

ndnr.commandMarkers = {};


ndnr.commandMarkers["%C1.R.sw"] = function startWrite( prefix, interest) {
  var localName = utils.getNameWithoutCommandMarker(utils.getSuffix(interest.name, prefix.components.length)),
      objectStoreName = utils.normalizeNameToObjectStore(localName);


  console.log("Building objectStore Tree for ", objectStoreName, this);

  buildObjectStoreTree(prefix, objectStoreName, recursiveSegmentRequest, interest.face);
};

ndnr.commandMarkers["%C1.R.sw"].component = new Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]);

onmessage = function(e){
  var uri = e.data.uri,
      port = e.ports[0]

  self.face = new ndn.Face({host:32, port:31, getTransport: function(){return new local.transport(port)}})
  self.face.transport.connect(self.face, function(){console.log('connecting to daemon from repo')})

  if(!indexedDBOk) return console.log('no indexedDb');  // No IndexedDB support
  var prefixUri = (new ndn.Name(uri)).toUri(),       // normalize
      initDb = {};

  this.prefix = prefixUri

  var prefix = new ndn.Name(uri)
  var closure = new ndn.Face.CallbackClosure(null, null, ndnr.interestHandler, prefix, self.face.transport);
  ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));


  //rFace.registerPrefix(new ndn.Name(prefix), this.interestHandler);

  initDb.onupgradeneeded = function(e) {
    console.log("Version 1 of database ", prefixUri, "created");
    self.postMessage('repo open')
  };
  console.log(ndn)
  useIndexedDB(prefixUri, initDb);

};

