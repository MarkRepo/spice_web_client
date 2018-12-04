wdi.Stream = {
	streams: {},
	
	addStream: function(id, stream) {
		this.streams[id] = stream;
	},
	
	deleteStream: function(id) {
		this.streams[id] = undefined;
	},
	
	getStream: function(id) {
		return this.streams[id];
	},
	
	clip: function(id, clip) {
		this.streams[id].clip = clip;
	}
}
