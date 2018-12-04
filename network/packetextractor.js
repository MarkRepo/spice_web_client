

wdi.PacketExtractor = $.spcExtend(wdi.EventObject.prototype, {
	socketQ: null,
	numBytes: null,
	callback: null,
	scope: null,

	init: function(c) {
		this.superInit();
		this.socketQ = c.socketQ;
		this.setListener();
	},

	setListener: function() {
		this.socketQ.addListener('message', function() {
			if (wdi.logOperations) {
				wdi.DataLogger.setNetworkTimeStart();
			}
			this.getBytes(this.numBytes, this.callback, this.scope);
		}, this);
	},

	getBytes: function(numBytes, callback, scope) {
		var retLength = this.socketQ.rQ.getLength();
		this.numBytes = numBytes;
		this.callback = callback;
		this.scope = scope;
		
		if (numBytes !== null && retLength >= numBytes) {
			var ret;
			if (numBytes) {
				ret = this.socketQ.rQ.shift(numBytes);
			} else {
				ret = new Uint8Array(0);
			}
			this.numBytes = null;
			this.callback = null;
			this.scope = null;
			callback.call(scope, ret);
		} else {
			if (wdi.logOperations) {
				wdi.DataLogger.logNetworkTime();
			}
		}
	}
});
