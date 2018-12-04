

wdi.ConnectionControl = $.spcExtend(wdi.EventObject.prototype, {
	socket: null,
	pendingTimeToConnectionLost: null,
	previousTimeOut: null,

	init: function(c) {
		this.superInit();
		this.socket = c.socket || new wdi.Socket();
	},

	connect: function(c) {
		var url = wdi.Utils.generateWebSocketUrl(c.protocol, c.host, c.port, null, null,'raw', c.heartbeatToken);
		this.socket.connect(url);
		this.pendingTimeToConnectionLost = c.heartbeatTimeout;
		wdi.Debug.log('ConnectionControl: connected');
		this.setListeners();
	},

	disconnect: function() {
		if(this.previousTimeOut){
			clearTimeout(this.previousTimeOut);
		}
		this.socket.disconnect();
	},

	setListeners: function() {
		var self = this;
		this.socket.setOnMessageCallback(function(e) {
			wdi.Debug.log('ConectionControl: beat');
			clearTimeout(self.previousTimeOut);
			self.previousTimeOut = setTimeout(function() {
				wdi.Debug.log('ConnectionControl: firing connectionLost event');
				self.fire('connectionLost', e);
			}, self.pendingTimeToConnectionLost);
		});
	}
});
