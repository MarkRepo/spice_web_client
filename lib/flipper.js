

wdi.Flipper = {

	flip: function(sourceImg) {
		return this._handMadeFlip(sourceImg);
	},

	_handMadeFlip: function(sourceImg) {
		var newCanvas =  document.createElement('canvas');
		newCanvas.width = sourceImg.width;
		newCanvas.height = sourceImg.height;
		var ctx = newCanvas.getContext('2d');
		ctx.save();
		// Multiply the y value by -1 to flip vertically
		ctx.scale(1, -1);
		// Start at (0, -height), which is now the bottom-left corner
		ctx.drawImage(sourceImg, 0, -sourceImg.height);
		ctx.restore();
		return newCanvas;
	}
};
