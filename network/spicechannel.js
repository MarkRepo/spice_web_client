
wdi.SpiceChannel = $.spcExtend(wdi.EventObject.prototype, {
	counter: 0,
	ackWindow: 0,
	connectionId: 0,
	socketQ: null,
	packetReassembler: null,
	channel: 1,
	proxy: null,
	token: null,
	
	init: function(c) {
		this.superInit();
		this.socketQ = c.socketQ || new wdi.SocketQueue();
		this.packetReassembler = c.packetReassembler || wdi.ReassemblerFactory.getPacketReassembler(this.socketQ);
		this.setListeners();
		this.ackWindow = 0;
	},

	setListeners: function() {
		var date;
		this.packetReassembler.addListener('packetComplete', function(e) {
			var rawMessage = e;
			if (rawMessage.status === 'spicePacket') {
				if (wdi.logOperations) {
					wdi.DataLogger.logNetworkTime();
					date = Date.now();
				}
				var rsm = this.getRawSpiceMessage(rawMessage.data);
				if (rsm) {
					if (wdi.logOperations && rsm.channel === wdi.SpiceVars.SPICE_CHANNEL_DISPLAY) {
						wdi.DataLogger.setStartTime(date);
					}
					this.fire('message', rsm);
				}
			} else if (rawMessage.status === 'reply') {
				var packet = this.getRedLinkReplyBytes(rawMessage.data);
			       // get_domainlist();
				//Thinticket=Base64.decodeStr(Thinticket);
				//console.log("----- length: " + Thinticket.length + ", Thinticket: " + Thinticket);
			    this.send(Thinticket);
			    //console.log("----- length: " + packet.length + ",packet: " + packet);
				this.send(packet);
			} else if (rawMessage.status === 'errorCode') {
				var packet = this.getErrorCodeBytes(rawMessage.data);
				if (packet) {
					//console.log("----- errorCode packet: " + packet);
					this.send(packet);
				}
				this.fire('channelConnected');
			}
		}, this);
		
		this.socketQ.addListener('open', function() {
			//console.log("channel: " + this.channel + "opened");
			var packet = this.getRedLinkMessBytes();
			this.send(packet);
			this.proxy ? this.proxy.end() : false;
		}, this);

		this.socketQ.addListener('close', function(e) {
			//modified by wfq, if video channel disconnect, reload or goto desktoplist
			//console.log("channel: " + this.channel + "closed");
			if (this.channel === 1) {
				this.fire('error', e);
			}else{
				this.fire('check', e);
			}
			this.socketQ.disconnect();
		}, this);

		this.socketQ.addListener('error', function() {
			//console.log("channel: " + this.channel + "error");
			this.fire('error', 3);
			this.socketQ.disconnect();
//			throw new wdi.Exception({message:"Socket error", errorCode: 2});
		}, this);
	},

	connect: function(connectionInfo, channel, connectionId, proxy) {
		var url = wdi.Utils.generateWebSocketUrl(connectionInfo.protocol, connectionInfo.host, connectionInfo.port, connectionInfo.vmHost, connectionInfo.vmPort, 'spice', connectionInfo.vmInfoToken);
		this.channel = channel;
		this.connectionId = connectionId || 0;
		this.socketQ.connect(url);
		this.proxy = proxy;
		this.token = connectionInfo.token;
		this.packetReassembler.start();
	},

	disconnect: function () {
		this.socketQ.disconnect();
	},

	send: function(data, flush) {
		this.socketQ.send(data, flush);
	},

	sendObject: function(data, type, flush) {
		var packet = new wdi.SpiceDataHeader({
			type:type, 
			size:data.length
		}).marshall();
		
		packet = packet.concat(data);
		//console.log("----- spicechannel send, channel: " + this.channel + ", packet: " + packet);
		this.send(packet, flush);
	},
	
	setAckWindow: function(window) {
		this.ackWindow = window;
		this.counter = 0;
	},

	getRawSpiceMessage: function (rawData) {
		var headerQueue = wdi.GlobalPool.create('ViewQueue');
		var body = wdi.GlobalPool.create('ViewQueue');

		var header = new Uint8Array(rawData, 0, wdi.SpiceDataHeader.prototype.objectSize);
		headerQueue.setData(header);
		var headerObj = new wdi.SpiceDataHeader().demarshall(headerQueue);
		wdi.GlobalPool.discard('ViewQueue', headerQueue);
		var rawBody = rawData.subarray(wdi.SpiceDataHeader.prototype.objectSize);
		body.setData(rawBody);

		this.counter++;

		if(this.ackWindow && this.counter === this.ackWindow) {
			this.counter = 0;
			var ack = new wdi.SpiceDataHeader({
				type: wdi.SpiceVars.SPICE_MSGC_ACK,
				size:0
			}).marshall();
			this.send(ack);
		}

		var packet = false;
		if(this.channel != wdi.SpiceVars.SPICE_CHANNEL_PLAYBACK)
			packet = wdi.PacketLinkFactory.extract(headerObj, body) || false;
		if (packet) {
			wdi.PacketLinkProcess.process(headerObj, packet, this);
			wdi.GlobalPool.discard('ViewQueue', body);
			return false;
		} else {
			var rawSpiceMessage = wdi.GlobalPool.create('RawSpiceMessage');
			rawSpiceMessage.set(headerObj, body, this.channel);
			return rawSpiceMessage;
		}
	},


	//This functions are to avoid hardcoded values on logic
	getRedLinkReplyBytes: function(data) {
		if (this.token) {
			var newq = new wdi.ViewQueue();
			newq.setData(data);
			newq.eatBytes(wdi.SpiceLinkHeader.prototype.objectSize)
			var myBody = new wdi.SpiceLinkReply().demarshall(newq);

			//Returnnig void bytes or encrypted ticket
			var key;
			do{
				key = wdi.SpiceObject.stringHexToBytes(RSA_public_encrypt(this.token, myBody.pub_key));
			}while(key.length != 128)
			//console.log("----- getRedLinkReplyBytes, token: " + this.token + ",pub_key: "+ myBody.pub_key + ",key: "+ key);
			return key;
		} else {
			
			var newq = new wdi.ViewQueue();
			newq.setData(data);
			newq.eatBytes(wdi.SpiceLinkHeader.prototype.objectSize)
			var myBody = new wdi.SpiceLinkReply().demarshall(newq);
			//Returnnig void bytes or encrypted ticket
			var key;
			do{
				key = wdi.SpiceObject.stringHexToBytes(RSA_public_encrypt(authenticator, myBody.pub_key));
			}while(key.length != 128)
			//console.log("----- getRedLinkReplyBytes, authenticator: " + authenticator + ",pub_key: " + myBody.pub_key + ",key: "+ key);
			return key;
			//return wdi.SpiceObject.stringToBytesPadding('', 128);
		}
	},

	getRedLinkMessBytes: function() {
		var header = null;
		if(this.channel == 2 || this.channel == 5)
			header = new wdi.SpiceLinkHeader({magic:1363428690, major_version:2, minor_version:2, size:26}).marshall();
		else
			header = new wdi.SpiceLinkHeader({magic:1363428690, major_version:2, minor_version:2, size:22}).marshall();
		var caps, num = 0;
		if(this.channel == 2){
			caps = 1 << wdi.SpiceVars.SPICE_DISPLAY_CAP_AVC;
			num = 1;
		}		
		if(this.channel == 5){
			caps = (1 << wdi.SpiceVars.SPICE_PLAYBACK_CAP_OPUS | 1 << wdi.SpiceVars.SPICE_PLAYBACK_CAP_VOLUME);
			num = 1;
		}
		var body = new wdi.SpiceLinkMess({
			connection_id:this.connectionId, 
			channel_type:this.channel, 
			caps_offset:18,
			num_common_caps: 1,
			common_caps: (1 << wdi.SpiceVars.SPICE_COMMON_CAP_MINI_HEADER | 1 << wdi.SpiceVars.SPICE_COMMON_CAP_AUTH_THIN),
			num_channel_caps: num,
		        //channel_caps: (1 << wdi.SpiceVars.SPICE_DISPLAY_CAP_FRAME_SCREEN)
		        channel_caps: caps
		}).marshall();
		return header.concat(body);
	},

	getErrorCodeBytes: function (data) {
		var errorQ = wdi.GlobalPool.create('ViewQueue');
		errorQ.setData(data);
		var errorCode = wdi.SpiceObject.bytesToInt32NoAllocate(errorQ);
		wdi.GlobalPool.discard('ViewQueue', errorQ);
		if (errorCode === 0) {
			if (this.channel === wdi.SpiceVars.SPICE_CHANNEL_DISPLAY) {
				var redDisplayInit = new wdi.SpiceDataHeader({type: wdi.SpiceVars.SPICE_MSGC_DISPLAY_INIT, size: 14}).marshall();
				//TODO: ultrahardcoded value here, move to configuration

				//DUE To high level storage the memory specified for cache
				//is 2-3 times bigger than expected.
				var cache_size = 0*1024*1024;

				var body = new wdi.SpiceCDisplayInit({
					pixmap_cache_id:1,
					pixmap_cache_size: cache_size,
					glz_dictionary_id: 0,
					glz_dictionary_window_size: 1
				}).marshall();

				return redDisplayInit.concat(body);
			} else if(this.channel == wdi.SpiceVars.SPICE_CHANNEL_MAIN) {
				return new wdi.SpiceDataHeader({type: wdi.SpiceVars.SPICE_MSGC_MAIN_ATTACH_CHANNELS, size: 0}).marshall();
			}
		} else {
			throw new wdi.Exception({message: "Server refused client", errorCode: 2});
		}
	}
});
