

wdi.socketStatus = {
	'idle':0,
	'prepared':1,
	'connected':2,
	'disconnected':3,
	'failed':4
};
//Works only with arrays of bytes (this means each value is a number in 0 to 255)
wdi.Socket = $.spcExtend(wdi.EventObject.prototype, {
	websocket: null,
	status: wdi.socketStatus.idle,
	binary: false,
	websocketTimer: null,
	timerCount: 0,
	
	connect: function(uri) {
		var self = this;
		var protocol = 'base64'; //default protocol
		
		if(Modernizr['websocketsbinary']) {
			protocol = 'binary';
			this.binary = true;
		}

		this.websocket = new WebSocket(uri, protocol);
		
		wdi.Debug.log("Socket: using protocol: "+protocol);
		//console.log("new websocket, uri: " + uri + ",protocol:"　+ protocol);
		
		if(this.binary) {
			this.websocket.binaryType = 'arraybuffer';
		}
		
		this.status = wdi.socketStatus.prepared;
		this.websocket.onopen = function() {
			self.status = wdi.socketStatus.connected;
			self.fire('open');
		};
		this.websocket.onmessage = function(e) {
			self.fire('message', e.data);
			/*if(self.websocketTimer != null){
				clearTimeout(self.websocketTimer);
				self.websocketTimer = null;
				self.timerCount -= 1;
			}*/
		};
		this.websocket.onclose = function(e) {
			self.status = wdi.socketStatus.disconnected;
			//console.log('Spice Web Client: ', e.code, e.reason);
			self.disconnect();
			self.fire('close', e);
			////console.log("WebSocket Close");
			//location.reload();
		};
		this.websocket.onerror = function(e) {
			self.status = wdi.socketStatus.failed;
			self.fire('error', e);
			////console.log("websocket error");
			//location.reload();
		};
	},

	setOnMessageCallback: function(callback) {
		this.websocket.onmessage = callback;
	},
	
	send: function(message) {
                var self = this;
		try {
			
			//console.log("----- socket encode_message, messsage: " + message);
			this.websocket.send(this.encode_message(message));	
			
			/*if(this.websocketTimer == null){
				this.websocketTimer = setTimeout(function(){
					//console.log("timer count: " + self.timerCount);
					location.reload();
				}, 10000);
				this.timerCount +=1;
			}*/
		} catch (err) {
			this.status = wdi.socketStatus.failed;
			this.fire('error', err);
		}
	},
	
	disconnect: function() {
		if (this.websocket) {
			this.websocket.onopen = function() {};
			this.websocket.onmessage = function() {};
			this.websocket.onclose = function() {};
			this.websocket.onerror = function() {};
			this.websocket.close();
			this.websocket = null;
		}
	},
	
	setStatus: function(status) {
		this.status = status;
		this.fire('status', status);
	},
	
	getStatus: function() {
		return this.status;
	},
	
	encode_message: function(mess) {
		if(!this.binary) {
			var arr = Base64.encode(mess);
			return arr;
		} 
		
		var len = mess.length;
		
		var buffer = new ArrayBuffer(len);
		var u8 = new Uint8Array(buffer);
		
		u8.set(mess);
	
		return u8;
	}
});
