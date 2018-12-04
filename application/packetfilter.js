wdi.PacketFilter = {
	restoreContext: false,
	start: null,
	filter: function(spiceMessage, fn, scope, clientGui) {
		if(wdi.logOperations) {
			this.start = Date.now();
		}

		//TODO: design an architecture for loading
		//dynamic filters, instead of filtering here.
		//This should be just the entry point for filters.
		if (wdi.graphicDebug && wdi.graphicDebug.debugMode) {
			wdi.graphicDebug.printDebugMessageOnFilter(spiceMessage, clientGui);
		}
		//end of hardcoded filter

        // MS Word Benchmark startup
        if (wdi.IntegrationBenchmark && wdi.IntegrationBenchmark.benchmarking) {
            var date = new Date();
            wdi.IntegrationBenchmark.setStartTime(date.getTime());
        }

		//check clipping
		if(spiceMessage.args.base) {
			if(spiceMessage.args.base.clip.type === wdi.SpiceClipType.SPICE_CLIP_TYPE_RECTS) {
				var context = clientGui.getContext(spiceMessage.args.base.surface_id);
				context.save();
				context.beginPath();
				var rects = spiceMessage.args.base.clip.rects.rects;
				var len = rects.length;
				while(len--) {
					var box = wdi.graphics.getBoxFromSrcArea(rects[len]);
					context.rect(box.x, box.y, box.width, box.height);
				}
				context.clip();
				this.restoreContext = spiceMessage.args.base.surface_id;
			}
		}
        fn.call(scope, spiceMessage);
	},

    notifyEnd: function(spiceMessage, clientGui) {
		if(this.restoreContext !== false) {
			var context = clientGui.getContext(this.restoreContext);
			context.restore();
			this.restoreContext = false;
		}

        if(wdi.SeamlessIntegration) {
			var filterPosition = null;
			if(spiceMessage.args.base && spiceMessage.args.base.box) {
				filterPosition = spiceMessage.args.base.box;
			}
            clientGui.fillSubCanvas(filterPosition);
        }

		if (wdi.graphicDebug && wdi.graphicDebug.debugMode) {
			wdi.graphicDebug.printDebugMessageOnNotifyEnd(spiceMessage, clientGui);
		}

        // MS Word Benchmark
        if (wdi.IntegrationBenchmark && wdi.IntegrationBenchmark.benchmarking) {
            var date = new Date();
            wdi.IntegrationBenchmark.setEndTime(date.getTime());
        }

        // clear the tmpcanvas
        wdi.GlobalPool.cleanPool('Canvas');
		wdi.GlobalPool.cleanPool('Image');
		if(wdi.logOperations) {
			wdi.DataLogger.log(spiceMessage, this.start);
		}
	}



}

