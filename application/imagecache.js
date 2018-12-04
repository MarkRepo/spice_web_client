wdi.ImageCache = {
	images: {},
	cursor: {},
	palettes: {},

	getImageFrom: function(descriptor, cb) {
	//see http://jsperf.com/todataurl-vs-getimagedata-to-base64/7
		var cnv = wdi.GlobalPool.create('Canvas');
		var imgData = this.images[descriptor.id.toString()];
		cnv.width = imgData.width;
		cnv.height = imgData.height;
		cnv.getContext('2d').putImageData(imgData,0,0);
		cb(cnv);
	},

	isImageInCache: function(descriptor) {
		if(descriptor.id.toString() in this.images) {
			return true;
		}
		return false;
	},

	delImage: function(id) {
		delete this.images[id.toString()];
	},

	addImage: function(descriptor, canvas) {
		if(canvas.getContext) {
			this.images[descriptor.id.toString()] = canvas.getContext('2d').getImageData(0,0,canvas.width, canvas.height);
		} else {
			this.images[descriptor.id.toString()] = canvas;
		}

	},

	getCursorFrom: function(cursor) {
		return this.cursor[cursor.header.unique.toString()];
	},

	addCursor: function(cursor, imageData) {
		this.cursor[cursor.header.unique.toString()] = imageData;
	},

	getPalette: function(id) {
		return this.palettes[id.toString()];
	},

	addPalette: function(id, palette) {
		this.palettes[id.toString()] = palette;
	},

	clearPalettes: function() {
		this.palettes = {};
	}
};
