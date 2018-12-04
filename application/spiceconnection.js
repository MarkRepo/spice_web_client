wdi.SpiceConnection = $.spcExtend(wdi.EventObject.prototype, {
	channels:null,
	connectionId: null,
	connectionInfo: null,
	runQ: null,
	token: null,
	connectionControl: null,
	
	init: function(c) {
		this.superInit();
		this.channels = {};
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN] = c.mainChannel || new wdi.SpiceChannel();
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_DISPLAY] = c.displayChannel || new wdi.SpiceChannel();
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_INPUTS] = c.inputsChannel || new wdi.SpiceChannel();
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_CURSOR] = c.cursorChannel || new wdi.SpiceChannel();
        this.channels[wdi.SpiceVars.SPICE_CHANNEL_PLAYBACK] = c.playbackChannel || new wdi.SpiceChannel();
		this.runQ = c.runQ || new wdi.RunQueue();
		this.connectionControl = c.connectionControl || new wdi.ConnectionControl();
		this.setup();
	},
	
	connect: function(connectionInfo) {
		this.connectionInfo = connectionInfo;
		if (connectionInfo.connectionControl) {
			this.connectionControl.connect(connectionInfo);
		}
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].connect(this.connectionInfo, wdi.SpiceVars.SPICE_CHANNEL_MAIN);
	},
	
	disconnect: function() {
		for (var i in this.channels) {
			this.channels[i].disconnect();
			this.channels[i] = null;
			delete(this.channels[i]);
		}
		this.connectionControl.disconnect();
	},
	
	send: function(spcMessage) {
		var data = spcMessage.args.marshall();
		if(this.channels[spcMessage.channel]) {
			this.channels[spcMessage.channel].sendObject(
				data,
				spcMessage.messageType
			);
		} else {
			console.error("channel not available", spcMessage.channel);
		}
	},
	
	//set events to all channels
	setup: function() {
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].addListener('connectionId', this.onConnectionId, this);
        this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].addListener('channelListAvailable', this.onChannelList, this);
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].addListener('mouseMode', this.onMouseMode, this);
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].addListener('initAgent', this.onInitAgent, this);
		this.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].addListener('notify', this.onNotify, this);
		this.connectionControl.addListener('connectionLost', this.onDisconnect, this);

		this._setConnectedListeners();
        
        var f = null;
        if(wdi.exceptionHandling) {
            f = this.onChannelMessageExceptionHandled;
        } else {
            f = this.processChannelMessage;
        }
        
		for(var i in this.channels) {
			if(this.channels.hasOwnProperty(i)) {
				this.channels[i].addListener('message', f, this);
				this.channels[i].addListener('status', this.onStatus, this);
				this.channels[i].addListener('error', this.onDisconnect, this);
				this.channels[i].addListener('check', this.onCheck, this);
			}
		}
	},

	_setConnectedListeners: function() {
		this._setConnectedListener(wdi.SpiceVars.SPICE_CHANNEL_MAIN);
		this._setConnectedListener(wdi.SpiceVars.SPICE_CHANNEL_DISPLAY);
		this._setConnectedListener(wdi.SpiceVars.SPICE_CHANNEL_INPUTS);
		this._setConnectedListener(wdi.SpiceVars.SPICE_CHANNEL_CURSOR);
		this._setConnectedListener(wdi.SpiceVars.SPICE_CHANNEL_PLAYBACK);
	},


	_setConnectedListener: function(channel) {
		this.channels[channel].addListener('channelConnected', function () {
			this.fire('channelConnected', channel);
		}, this);
	},
		
	onDisconnect: function(params) {
		this.fire("error", params);
	},

	onCheck: function(params) {
		var that = this;
		setTimeout(function(){
			if(that.channels[wdi.SpiceVars.SPICE_CHANNEL_MAIN].socketQ.getStatus() === wdi.socketStatus.disconnected){
				location.href = "../cloudDesktop.html";
			}else{
				location.reload();
			}
		}, 10*1000);
	},
	
	//events
	onConnectionId: function(params) {
		this.connectionId = params;
	},

    onChannelList: function(params) {
        this.connectChannels(params);
    },

    connectChannels: function(channels) {
        for(var i in this.channels) {
            i = parseInt(i, 10);
            if(i != wdi.SpiceVars.SPICE_CHANNEL_MAIN && channels.indexOf(i) != -1) {
                this.runQ.add(function(proxy, params) {
                    this.channels[params].connect(this.connectionInfo, params, this.connectionId, proxy);
                }, this, false, i);
            }
        }
        this.runQ.process();
    },
	
	onInitAgent: function(params) {
		var tokens = params;
		this.fire('initAgent', tokens);
	},
	
	onMouseMode: function(params) {
		var mode = params;
		this.fire('mouseMode', mode);
	},
	
	onNotify: function(params) {
		this.fire('notify');
	},
	
	onStatus: function(params) {
		/*var status = params[1];
		var channel = params[2];
		if (status == wdi.CHANNEL_STATUS.idle) {
			var self = this;
			this.channels[channel].timer = setTimeout(function() {
				self.channels[channel].connect(self.host, self.port, channel, self.connectionId);
			}, 800);
		} else if (status == wdi.CHANNEL_STATUS.establishing) {
			clearTimeout(this.channels[channel].timer);
		}*/
	},

            
    onChannelMessageExceptionHandled: function(params) {
        try {
            return this.processChannelMessage(params);
        } catch(e) {
            wdi.Debug.error('SpiceConnection: Packet decodification error', e);
        }	        
    },
    
    processChannelMessage: function(params) {
        var packet = wdi.PacketFactory.extract(params); //returns domain object

        //return ViewQueue to the pool, object is already decoded
        wdi.GlobalPool.discard('ViewQueue', params.body);
        wdi.GlobalPool.discard('RawSpiceMessage', params);

        if(packet) {
            this.fire('message', packet);
        } else {
            wdi.Debug.log('Unknown packet '+params.channel+' '+params.header.type);
            wdi.Debug.log(params);
        }                    
    }
});
