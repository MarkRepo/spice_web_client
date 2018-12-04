wdi.Agent = $.spcExtend(wdi.EventObject.prototype, {
	clientTokens:null,
    serverTokens: 10,
    app: null,
    clipboardContent: null,
    clipboardGrabbed: false,
    clipboardRequestReceived: false,
    clipboardPending: false, // to keep clipboard data until spice sends us its request (clipboardRequestReceived)
    clipboardEnabled: true,
	windows: null,

	init: function(c) {
		this.superInit();
		this.app = c.app;
	},

	sendInitMessage: function() {
		var packet = new wdi.SpiceMessage({
			messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_START,
			channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
			args: new wdi.SpiceMsgMainAgentTokens({
				num_tokens: this.serverTokens
			})
		});
        //console.log("----- sendInitMessage, spiceConnection send");
		this.app.spiceConnection.send(packet);

        var mycaps = (1 << wdi.AgentCaps.VD_AGENT_CAP_MONITORS_CONFIG);
        if (this.clipboardEnabled) {
            mycaps = mycaps | (1 << wdi.AgentCaps.VD_AGENT_CAP_CLIPBOARD_BY_DEMAND);
        }

        packet = new wdi.SpiceMessage({
            messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_DATA,
            channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
            args: new wdi.VDAgentMessage({
                protocol: 1, //agent protocol version, should be unhardcoded
                type: wdi.AgentMessageTypes.VD_AGENT_ANNOUNCE_CAPABILITIES,
                opaque: 0,
                data: new wdi.VDAgentAnnounceCapabilities({
                    request: 0,
                    caps: mycaps
                })
            })
        });
        //console.log("----- sendAgentPacket");
      	this.sendAgentPacket(packet);

//		//tokens allocation
//		packet = new wdi.SpiceMessage({
//			messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_TOKEN,
//			channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
//			args: new wdi.SpiceMsgMainAgentTokens({
//				num_tokens: 4294967295 // FF FF FF FF
//			})
//		});
//		app.spiceConnection.send(packet);
	},

	setResolution: function(width, height) {
		//TODO move this to a setting
		if(width < 800) {
			width = 800;
		}

		if(height < 600) {
			height = 600;
		}

		//adapt resolution, TODO: this needs to be refractored
		var packet = new wdi.SpiceMessage({
			messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_DATA,
			channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
			args: new wdi.VDAgentMessage({
				protocol: 1, //agent protocol version, should be unhardcoded
				type: wdi.AgentMessageTypes.VD_AGENT_MONITORS_CONFIG,
				opaque: 0,
				data: new wdi.VDAgentMonitorsConfig({
					num_of_monitors: 1,
					flags: 0,
					data: new wdi.VDAgentMonConfig({
						width: width,
						height: height,
						depth: 32,
						x: 0,
						y: 0
					})
				})
			})
		});
		this.sendAgentPacket(packet);
	},

	setClientTokens: function(tokens) {
		this.clientTokens = tokens;
	},

	sendAgentPacket: function(packet) {
		this.clientTokens--;
		this.app.spiceConnection.send(packet);
	},

    onAgentData: function(packet) {
        this.serverTokens--; //we have just received a server package, we decrement the tokens
        if (this.serverTokens == 0) { // we send 10 more tokens to server
            packet = new wdi.SpiceMessage({
                messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_TOKEN,
                channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
                args: new wdi.SpiceMsgMainAgentTokens({
                    num_tokens: 10
                })
            });
            //console.log("----- onAgentData serverTokens is 0");
            this.app.spiceConnection.send(packet);
            this.serverTokens = 10;
        }

        if(packet.type == wdi.AgentMessageTypes.VD_AGENT_ANNOUNCE_CAPABILITIES) {
            //??
        } else if(packet.type == wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD_GRAB) {
            if(packet.clipboardType == wdi.ClipBoardTypes.VD_AGENT_CLIPBOARD_UTF8_TEXT) {
                var packet = new wdi.SpiceMessage({
                    messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_DATA,
                    channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
                    args: new wdi.VDAgentMessage({
                        protocol: 1, //agent protocol version, should be unhardcoded
                        type: wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD_REQUEST,
                        opaque: 0,
                        data: new wdi.VDAgentClipboardRequest({
                            type: wdi.ClipBoardTypes.VD_AGENT_CLIPBOARD_UTF8_TEXT
                        })
                    })
                });
                //console.log("----- sendAgentPacket");
              	this.sendAgentPacket(packet);
            }
        } else if(packet.type == wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD) {
            this.fire('clipBoardData', packet.clipboardData);
        } else if (packet.type == wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD_REQUEST) {
            this.clipboardRequestReceived = true;
            if (this.clipboardPending) {
                this.clipboardPending = false;
                this.sendPaste();
            }
        } else if (packet.type == wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD_RELEASE) {
            //debugger;// we've never seen this packet... if we receive it sometime, please warn somebody!!
            this.clipboardGrabbed = false;
            this.clipboardRequestReceived = false;
        } else if (packet.type == wdi.AgentMessageTypes.VD_AGENT_REPLY) {

        } else {
            //console.log('agent ?',packet.type);
        }
    },

    setClipboard: function(text) {
        if (text != this.clipboardContent) {
            this.clipboardContent = text;
            this.sendGrab();
            this.sendPaste();
        }
        this.app.sendShortcut(wdi.keyShortcutsHandled.CTRLV);
    },

    sendGrab: function() {
        if (!this.clipboardGrabbed) {
            var packet = new wdi.SpiceMessage({
                messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_DATA,
                channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
                args: new wdi.VDAgentMessage({
                    protocol: 1, //agent protocol version, should be unhardcoded
                    type: wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD_GRAB,
                    opaque: 0,
                    data: new wdi.VDAgentClipboardGrab({
                        types: [wdi.ClipBoardTypes.VD_AGENT_CLIPBOARD_UTF8_TEXT]
                    })
                })
            });
            this.sendAgentPacket(packet);
        }
    },

    /**
     * Sends the text received from browser to spice
     *
     * @param clipboardContent
     */
    sendPaste: function() {
        if (this.clipboardRequestReceived) {
            var packet = new wdi.SpiceMessage({
                messageType: wdi.SpiceVars.SPICE_MSGC_MAIN_AGENT_DATA,
                channel: wdi.SpiceVars.SPICE_CHANNEL_MAIN,
                args: new wdi.VDAgentMessage({
                    protocol: 1, //agent protocol version, should be unhardcoded
                    type: wdi.AgentMessageTypes.VD_AGENT_CLIPBOARD,
                    opaque: 0,
                    data: new wdi.VDAgentClipboard({
                        type: wdi.ClipBoardTypes.VD_AGENT_CLIPBOARD_UTF8_TEXT,
                        data: this.clipboardContent
                    })
                })
            });
            this.clipboardRequestReceived = false;
            this.sendAgentPacket(packet);
        } else {
            // we still haven't received the request event from server, we keep the clipboard data until then
            this.clipboardPending = true;
        }
    },

    disableClipboard: function () {
        this.clipboardEnabled = false;
    }
});
