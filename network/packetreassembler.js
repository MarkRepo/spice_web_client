

wdi.PacketReassembler = $.spcExtend(wdi.EventObject.prototype, {
	packetController: null,
	currentHeader: null,
	statusToString: null,
	sizeDefinerConstant: null,

	init: function(c) {
		this.superInit();
		this.packetController = c.packetController;
		this.sizeDefinerConstant = wdi.SizeDefiner.prototype;
		this.statusToString = [];
		this.statusToString[this.sizeDefinerConstant.STATUS_REPLY_BODY] = 'reply';
		this.statusToString[this.sizeDefinerConstant.STATUS_ERROR_CODE] = 'errorCode';
		this.statusToString[this.sizeDefinerConstant.STATUS_BODY] = 'spicePacket';
		this.setListeners();

	},

	start: function () {
		this.packetController.getNextPacket();
	},

	setListeners: function() {
		this.packetController.addListener('chunkComplete', function(e) {
			var rawMessage = e;
			var status = rawMessage.status;
			switch(status) {
				case this.sizeDefinerConstant.STATUS_HEADER:
				case this.sizeDefinerConstant.STATUS_REPLY:
					this.currentHeader = rawMessage;
					break;
				case this.sizeDefinerConstant.STATUS_REPLY_BODY:
				case this.sizeDefinerConstant.STATUS_BODY:
					var tmpBuff = new Uint8Array(rawMessage.data.length + this.currentHeader.data.length);
					tmpBuff.set(this.currentHeader.data);
					tmpBuff.set(rawMessage.data, this.currentHeader.data.length);
					rawMessage.data = tmpBuff;
					rawMessage.status = this.statusToString[status];
					this.fire('packetComplete', rawMessage);
					break;
				default:
					rawMessage.status = this.statusToString[status];
					this.fire('packetComplete', rawMessage);
					break;
			}
		}, this);
	}
});
