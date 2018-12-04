wdi.VirtualMouse = {
	eventLayers: [],
	mouseData:null,
	visible: null,
	lastLayer: null,
	hotspot: {
		x: 0,
		y: 0
	},
	lastMousePosition: {
		x: 0,
		y: 0,
		width: 0,
		height: 0
	},

	setHotspot: function(x, y) {
		this.hotspot.x = x;
		this.hotspot.y = y;
	},

	setEventLayer: function(ev, x, y, width, height, position) {
		this.eventLayers.push({
			layer: ev,
			left: x,
			top: y,
			right: x+width,
			bottom: y+height,
			position: position
		});
	},

	removeEventLayer: function(ev) {
		var len = this.eventLayers.length;
		for(var i=0;i<len;i++) {
			if(this.eventLayers[i].layer.id === ev.id) {
				this.eventLayers[ev.id] = undefined;
			}
		}
	},

	getEventLayer: function(x, y) {
		var len = this.eventLayers.length;
		var layer = null;
		for(var i=0;i<len;i++) {
			layer = this.eventLayers[i];
			if(x >= layer.left && x <= layer.right && y >= layer.top && y <= layer.bottom) {
				return layer.layer;
			}
		}
	},

	setMouse: function(mouseData, x, y) {
        //if(!Modernizr.touch) {
            var layer = null;
            var len = this.eventLayers.length;
            for(var i=0;i<len;i++) {
                layer = this.eventLayers[i];
                layer.layer.style.cursor = 'url('+mouseData+') ' + x + ' ' + y + ', default';
            }
        //}
	}
}
