
wdi.PacketController = $.spcExtend(wdi.EventObject.prototype, {
	sizeDefiner: null,
	packetExtractor: null,
	
	init: function(c) {
		this.superInit();
		this.sizeDefiner = c.sizeDefiner;
		this.packetExtractor = c.packetExtractor;
	},

	getNextPacket: function(data) {
		var self = this;
		if (wdi.logOperations) {
			wdi.DataLogger.setNetworkTimeStart();
		}
		var size = this.sizeDefiner.getSize(data);
		this.packetExtractor.getBytes(size, function(bytes) {
			var status = this.sizeDefiner.getStatus();

			this.execute(new wdi.RawMessage({status: status, data: bytes}));

			self.getNextPacket(bytes);


		}, this);
	},

	execute: function(message) {
		try {
			this.fire('chunkComplete', message);
		} catch (e) {
			console.error('PacketTroller: ', e);
		}
	}
});
