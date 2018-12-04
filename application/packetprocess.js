
wdi.PacketProcess = $.spcExtend(wdi.DomainObject, {
	processors: {},
	
	init: function(c) {
		this.processors[wdi.SpiceVars.SPICE_CHANNEL_MAIN] = c.mainProcess || new wdi.MainProcess({
			app: c.app
		});
		this.processors[wdi.SpiceVars.SPICE_CHANNEL_DISPLAY] = c.displayProcess || new wdi.DisplayPreProcess({
			clientGui: c.clientGui
		});
		this.processors[wdi.SpiceVars.SPICE_CHANNEL_INPUTS] = c.inputsProcess || new wdi.InputProcess({
			clientGui: c.clientGui,
			spiceConnection: c.spiceConnection
		});
		this.processors[wdi.SpiceVars.SPICE_CHANNEL_CURSOR] = c.cursorProcess || new wdi.CursorProcess();
        this.processors[wdi.SpiceVars.SPICE_CHANNEL_PLAYBACK] = c.playbackProcess || new wdi.PlaybackProcess({
			app: c.app
		});
	},
            
    process: function(spiceMessage) {
        if(wdi.exceptionHandling) {
            return this.processExceptionHandled(spiceMessage);
        } else {
            return this.processPacket(spiceMessage);
        }
    },
            
    processExceptionHandled: function(spiceMessage) {
        try {
            return this.processPacket(spiceMessage);
        } catch(e) {
            wdi.Debug.error('PacketProcess: Error processing packet', e);
        }        
    },

	processPacket: function(spiceMessage) {
		if(!spiceMessage || !this.processors[spiceMessage.channel]) {
			throw "Invalid channel or null message";
		}

        this.processors[spiceMessage.channel].process(spiceMessage);
	},

	dispose: function () {
		this.processors[wdi.SpiceVars.SPICE_CHANNEL_DISPLAY].dispose();
	}
});
