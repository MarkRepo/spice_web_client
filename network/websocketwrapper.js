
wdi.WebSocketWrapper = $.spcExtend({}, {
	ws: {},
	onopen: null,
	onmessage: null,
	onclose: null,
	onerror: null,

	init: function() {

	},

	connect: function(url, protocol) {
		this.ws = new WebSocket(url, protocol);
	},

	onOpen: function(callback) {
		this.ws.onopen = callback;
	},

	onMessage: function(callback) {
		this.ws.onmessage = callback;
	},

	onClose: function(callback) {
		this.ws.onclose = callback;
	},

	onError: function(callback) {
		this.ws.onerror = callback;
	},

	setBinaryType: function(type) {
		this.ws.binaryType = type;
	},

	close: function() {
		if (!this.ws || !this.ws.close) {
			return;
		}

		this.ws.close();
		this.ws.onopen = function () {};
		this.ws.onmessage = function () {};
		this.ws.onclose = function () {};
		this.ws.onerror = function () {};
		this.onopen = function() {};
		this.onmessage = function() {};
		this.onclose = function() {};
		this.onerror = function() {};

	},

	send: function(message) {
		this.ws.send(message);
	}
});
