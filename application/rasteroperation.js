
wdi.RasterOperation = {

	process: function(rop, sourceImg, destImg) {//sourceImg could be brush or image (both imageData)
		var result = null;
		if (rop & wdi.SpiceRopd.SPICE_ROPD_INVERS_SRC) {
			sourceImg = this.invert(sourceImg);
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_INVERS_BRUSH) {
			sourceImg = this.invert(sourceImg);
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_INVERS_DEST) {
			destImg = this.invert(destImg);
		}

		if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_PUT) {
			return sourceImg;
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_OR) {
			result = this.boolOp(sourceImg, destImg, 'or');
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_AND) {
			result = this.boolOp(sourceImg, destImg, 'and');
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_XOR) {
			result = this.boolOp(sourceImg, destImg, 'xor');
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_BLACKNESS) {
			result = this.lightness(destImg, 'b');
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_WHITENESS) {
			result = this.lightness(destImg);
		} else if (rop & wdi.SpiceRopd.SPICE_ROPD_OP_INVERS) {
			result = this.invert(destImg);
		}

		if (rop & wdi.SpiceRopd.SPICE_ROPD_INVERS_RES) {
			return this.invert(result);
		} else {
			return result;
		}
		
	},

	flip: function(sourceImg) {
		sourceImg = wdi.Flipper.flip(sourceImg);
		return sourceImg;
	},

	invert: function(sourceImg) {
		sourceImg = $(sourceImg).pixastic('invert')[0];

		return sourceImg;
	},
	
	lightness: function(sourceImg, ratio) {
		var ratio = ratio==='b'?-100:100;
		sourceImg = $(sourceImg).pixastic('hsl', {hue:30,saturation:20,lightness:ratio})[0];
		
		return sourceImg;
	},
	
	boolOp: function(sourceImg, destImg, op) {
		//or and and xor implemented without globalcomposition
		//because it is really buggy
		
		var source = wdi.graphics.getDataFromImage(sourceImg).data;
		var dest = wdi.graphics.getDataFromImage(destImg).data;
		
		var length = source.length-1;
		var tmp_canvas = wdi.graphics.getNewTmpCanvas(sourceImg.width, sourceImg.height);
		var tmp_context = tmp_canvas.getContext('2d');
		
		var resultImageData = tmp_context.createImageData(sourceImg.width, sourceImg.height);
		var result = resultImageData.data;
		
		if(op === 'or') {
			while(length > 0) {
				resultImageData.data[length] = 255;
				result[length-1] = source[length-1] | dest[length-1];
				result[length-2] = source[length-2] | dest[length-2];
				result[length-3] = source[length-3] | dest[length-3];
				length-=4;
			}	
		} else if(op === 'and') {
			while(length > 0) {
				resultImageData.data[length] = 255;
				result[length-1] = source[length-1] & dest[length-1];
				result[length-2] = source[length-2] & dest[length-2];
				result[length-3] = source[length-3] & dest[length-3];
				length-=4;
			}	
		} else if(op === 'xor') {
			while(length > 0) {
				resultImageData.data[length] = 255;
				result[length-1] = source[length-1] ^ dest[length-1];
				result[length-2] = source[length-2] ^ dest[length-2];
				result[length-3] = source[length-3] ^ dest[length-3];
				length-=4;
			}		
		}
		tmp_context.putImageData(resultImageData, 0, 0);
		return tmp_canvas;
	}
};
