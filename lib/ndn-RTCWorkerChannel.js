var channelWrapper = function(dataChannel) {
  var ms = new MessageChannel()
  var backlog = []
  ms.port1.onmessage = function(e) {
    //console.log('got message from daemon bound for rtc', e)
    if (dataChannel.readyState == 'open') {
      dataChannel.send(e.data);
    } else {
      backlog.push(e)
    }

  }

  dataChannel.onmessage = function(e) {
    //console.log('got message from rtc bound for daemon', e)
    var result = e.data;
    ms.port1.postMessage(e.data);
  }

  dataChannel.onopen = function() {
    for (var i = backlog.length - 1; i >= 0; i--){
      ms.port1.onmessage(backlog.pop())
    }
  }

  var obj = {};
  obj.dc = dataChannel;
  obj.port = ms.port2;
  return obj
}

module.exports = channelWrapper
