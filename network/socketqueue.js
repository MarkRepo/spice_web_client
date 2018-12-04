

wdi.SocketQueue = $.spcExtend(wdi.EventObject.prototype, {
	rQ: null,
	sQ: null,
	socket: null,
	
	init: function(c) {
		this.superInit();
		this.socket = c.socket || new wdi.Socket();
		this.rQ = c.rQ || new wdi.FixedQueue();
		this.sQ = c.sQ || new wdi.Queue();
		this.setup();
	},
	
	setup: function() {
		this.socket.addListener('open', function() {
			this.fire('open');
		}, this);
		this.socket.addListener('message', function(data) {
			this.rQ.push(new Uint8Array(data));
			this.fire('message');
		}, this);
		this.socket.addListener('close', function(e) {
			this.fire('close', e);
		}, this);
		this.socket.addListener('error', function(e) {
			this.fire('error', e);
		}, this);
	},
	
	getStatus: function() {
		return this.socket.getStatus();
	},
	
	connect: function(uri) {
		this.socket.connect(uri);
	},
	
	disconnect: function() {
		this.socket.disconnect();
	},
	
	send: function(data, shouldFlush) {
		//check for shouldFlush parameter, by default is true
		if (shouldFlush === undefined) {
			var flush = true;
		} else {
			var flush = shouldFlush;
		}

		//performance: avoid passing through the queue if there is no queue and
		//we have flush!
		if(this.sQ.getLength() == 0 && flush) {
			this.socket.send(data);
			return;
		}

		//normal operation, append to buffer and send if flush
		this.sQ.push(data);
		if (flush) this.flush();
	},
	
	flush: function() {
		var data = this.sQ.shift();
		this.socket.send(data);
	}
});
