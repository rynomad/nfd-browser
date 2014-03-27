NDN BrowserKit
==============

A fully functional Named Data Networking daemon, repository, and I/O interfaces that runs in a browser. Based on NDN-js from UCLA It interfaces with other browsers over WebRTC data-channels, and with servers running an NDN daemon via websocket proxy.

    npm install NDN-BrowserKit

    var ndn = require('NDN-BrowserKit')


Usage
=====

NDN depends heavily on cryptographic data signing and verification. Until browser crypto takes off in a more real fashion, we're using forge from digital bazaar to generate a public/private keypair on the users first visit, which we then encrypt with a passphrase and save to localstorage. On subsequent visits, a user must unlock their private key. This process should be much more modular, but for now, just know that you need to initialize your app in a callback function that gets executed once your ndn daemon is spun up and ready to go



    function startMyApp () {
      // do cool stuff
    }

    //@param options : an object with settings for your ndn daemon
    // {
    //   prefix: string
    // }
    //@param app : your application starter function

    ndn.init({prefix: "myCoolApp"}, startMyApp)

Your browser daemon will automatically make a websocket connection with location.host (coming soon, a hook in the options object to specify another server). It will also register the prefix "/ndnx" so as to server as a signaling channel for webRTC peerConnections.

Establishing peerConnections
============================

NDN-BrowserKit uses the public Key Digest generated earlier as a unique id for a user (inspired by Telehash). To connect to another peer from the same domain:


    //@param prefix: string URI to be
    //@param type: rtc, ws, th (coming soon)
    ndn.dc.add("myCoolApp/chatroomAlpha", "rtc", targetPubKeyDigest)

This same function should also be used to register additional prefixes on existing connections (Not implimented yet...)

Input/Output
============

NDN-BrowserKit supports fetching of javascript objects and blobs/files. the I/O worker will deal with all the segmentation and pipelining for you, just specify the name and type of the desired data and a callback for when you get it. Limited support for certain interest selectors as well

    function onObject(name, object) {}
    function onBlob(name, blob) {}

    ndn.io.fetch({name: "myCoolApp/chatroomAlpha/chatlog", type: 'object'}, onData, onTimeout)
    ndn.io.fetch({name: "myCoolApp/chatroomAlpha/sharedVideo", type: 'blob', selectors: {interestLifetime: 4000, childSelector: 0... }}, onBlob, onTimeout)

You can also publish data to your Named Data Network via the repository. The repository stores pre-encoded NDN content objects for retreival at any time, and is accessible via the io object

    ndn.io.publish({name: "myCoolApp/chatroomAlpha/myNewVideo", type: 'blob', thing: blob})

