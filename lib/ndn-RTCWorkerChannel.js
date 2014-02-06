var channelWrapper = function(dataChannel) {
  var ms = new MessageChannel()

  ms.port1.onmessage = function(e) {
    //console.log('got message from daemon bound for rtc', e)
    if (dataChannel.readyState == 'open') {
      dataChannel.send(e.data);
    }

  }

  dataChannel.onmessage = function(e) {
    //console.log('got message from rtc bound for daemon', e)
    var result = e.data;
    ms.port1.postMessage(e.data);
  }
  var obj = {};
  obj.dc = dataChannel;
  obj.port = ms.port2;
  return obj
}

module.exports = channelWrapper
