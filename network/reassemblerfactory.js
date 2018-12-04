

wdi.ReassemblerFactory = {
	getPacketReassembler: function(socketQ) {
		var pE = this.getPacketExtractor(socketQ);
		var sD = this.getSizeDefiner();
		var pC = this.getPacketController(pE, sD);
		return new wdi.PacketReassembler({packetController: pC});
	},

	getPacketExtractor: function(socketQ) {
		return new wdi.PacketExtractor({socketQ: socketQ});
	},

	getSizeDefiner: function() {
		return new wdi.SizeDefiner();
	},

	getPacketController: function(packetExtractor, sizeDefiner) {
		return new wdi.PacketController({packetExtractor: packetExtractor, sizeDefiner: sizeDefiner});
	}
};
