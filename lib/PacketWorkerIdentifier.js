

wdi.PacketWorkerIdentifier = $.spcExtend(wdi.EventObject.prototype, {
    init: function(c) {
        //default empty constructor
    }, 
    
    shouldUseWorker: function(message) {
		switch (message.messageType) {
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_COPY:
				return wdi.PacketWorkerIdentifier.processingType.DECOMPRESS;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_FILL:
				var brush = message.args.brush;
				if(brush.type === wdi.SpiceBrushType.SPICE_BRUSH_TYPE_PATTERN) {
					return wdi.PacketWorkerIdentifier.processingType.DECOMPRESS;
				}
				break;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_ALPHA_BLEND:
				return wdi.PacketWorkerIdentifier.processingType.DECOMPRESS;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_BLEND:
				return wdi.PacketWorkerIdentifier.processingType.DECOMPRESS;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_TRANSPARENT:
				return wdi.PacketWorkerIdentifier.processingType.DECOMPRESS;
			//case wdi.SpiceVars.SPICE_MSG_DISPLAY_STREAM_DATA:
			//	return wdi.PacketWorkerIdentifier.processingType.PROCESSVIDEO;
		}

        return 0;
    },
    
    getImageProperties: function(message) {
        var props = {
            data: null,
            descriptor: null,
            opaque: true,
            brush: null
        };
        
		//coupling here, to be cleaned when doing real code
		switch (message.messageType) {
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_COPY:
				props.descriptor = message.args.image.imageDescriptor;
				props.data = message.args.image.data;
				break;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_FILL:
				props.brush = message.args.brush;
				if(props.brush.type === wdi.SpiceBrushType.SPICE_BRUSH_TYPE_PATTERN) {
					props.descriptor = props.brush.pattern.image;
					props.data = props.brush.pattern.imageData;
				} else {
                    return false;
                }
				break;
			case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_ALPHA_BLEND:
            case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_BLEND:
            case wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_TRANSPARENT:
				props.data = message.args.image.data;
				props.descriptor = message.args.image.imageDescriptor;
				props.opaque = false;
				break;
            default:
                wdi.Debug.log("PacketWorkerIdentifier: Unknown Packet in getImageProperties");
                return false;
		}
        
        return props;
    },

    getVideoData: function(message) {
        if(message.messageType !== wdi.SpiceVars.SPICE_MSG_DISPLAY_STREAM_DATA) {
            wdi.Debug.log('PacketWOrkerIdentifier: Invalid packet in getVideoData');
            return false;
        }

        return message.args.data;
    }
});

wdi.PacketWorkerIdentifier.processingType = {};
wdi.PacketWorkerIdentifier.processingType.DECOMPRESS = 1;
wdi.PacketWorkerIdentifier.processingType.PROCESSVIDEO = 2;
