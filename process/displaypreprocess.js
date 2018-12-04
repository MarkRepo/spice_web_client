wdi.DisplayPreProcess = $.spcExtend(wdi.EventObject.prototype, {
	displayProcess: null,
	maxBuffSize: 1024*1024*5,
	queued: [],
	inProcess: [],
	idleConsumers : [],
	consumers: [],

	init: function(c) {
		this.superInit();
		this.displayProcess = c.displayProcess || new wdi.DisplayProcess({
			clientGui: c.clientGui
		});
		this.clientGui = c.clientGui;
		this.messageCount = 0;
		this.drawCopyCount = 0;
		this.startMsgCount = 0;
		//this.typedH264Buffer = new ArrayBuffer(this.maxBuffSize);
		this.download = false;
		this.h264position = 0;
		this.startTime = new Date().getTime();
		this.debug = localStorage.getItem("debugger");
		/**

		Since javascript do not provide an API to check
		the number of cpu cores available, the best case for average computers
		and devices is 4.

		If the computer doesn't have 4 or more available cores, there is only a little
		memory waste creating the threads and a bit of cpu overheat doing context
		switching.

		There is an ongoing draft in w3c to standarize a way to detect this:

		http://www.w3.org/2012/sysapps/device-capabilities/#cpu

		**/
		if(c.numConsumers == null || c.numConsumers == undefined) c.numConsumers = 4;
		var numConsumers = c.numConsumers;

		for(var i = 0;i<numConsumers; i++) {
			var consumer = new wdi.AsyncConsumer();
			this.consumers.push(consumer);
			this.idleConsumers.push(consumer);
			consumer.addListener('done', this.onConsumerDone, this);
		}
	},
		
	onConsumerDone: function(e) {
		//we don't care about who has finished, only about the
		//state of the last item in queue
		var waitingTask = this.inProcess[0];
		var task = null;
		var i = 0;
		
		while(waitingTask && waitingTask.state === 1) {
			task = this.inProcess.shift();
			try {
				this.displayProcess.process(task.message);
			} catch(e) {
				wdi.Debug.error("DisplayPreProcess error: ", e);
			}
			waitingTask = this.inProcess[0];
			i++;
		}
	
		//put the consumer as idle
		this.idleConsumers.push(e);
		//continue processing!
		if(this.queued.length > 0) {
			this.executeConsumer();
		}
	},
	
	process: function(spiceMessage) {
		//this.addTask(spiceMessage); //first of all, queue it
		//it is the only item in the list?
		//we are the only message in the queue... process?
		//this.executeConsumer();
		if(spiceMessage.messageType === wdi.SpiceVars.SPICE_MSG_DISPLAY_DRAW_COPY){
				this.drawCopyCount += 1;
				if(this.drawCopyCount >= 2){
					location.href = "../login.html";
				}
		}else{
			this.drawCopyCount -= 1;
			if(this.drawCopyCount < 0)
				this.drawCopyCount = 0;
		}
		if(spiceMessage.messageType === wdi.SpiceVars.SPICE_MSG_DISPLAY_AVC_DATA){
			var copy2 = new Uint8Array(4);
		        copy2[0] = 0, copy2[1] = 0, copy2[2] = 1, copy2[3] = 10;
			this.messageCount += 1;
			if(this.messageCount % 100 == 0){
				app.sendCommand("getIDR");
				//console.log("send getIDR command");
			}
			var end_time = new Date().getTime();
			if(end_time - this.startTime > 10*1000){
				//console.log("10s fps: " + (this.messageCount-this.startMsgCount)/((end_time-this.startTime)/1000));
				this.startTime = end_time;
				this.startMsgCount = this.messageCount;
			}
			/*
			if(!this.download && (this.h264position + spiceMessage.args.data.length > this.maxBuffSize || this.messageCount > 300)){
				//generate blob binary data, and save to local filesystem
				//var array = new Array(this.position);
				var u8array2 = new Uint8Array(this.typedH264Buffer, 0, this.h264position);
				//var i;
				//for(i=0; i<this.position; i +=1){
				//	array[i] = u8array2[i];
				//}
				var saveFile = (function(){
					var a  = document.createElement("a");
					document.body.appendChild(a);
					a.style = "display:none";
					return function(data, name){
						var blob = new Blob([data]);
						var url = window.URL.createObjectURL(blob);
						a.href = url;
						a.download = name;
						a.click();
						window.URL.revokeObjectURL(url);
						
					};
				}());
				saveFile(u8array2, 'test.h264');
				this.download = true;

			}
			if(!this.download){
				//var len_view = new DataView(this.typedPCMBuf);
				//len_view.setUint32(this.position, packet.data.length);
				//this.position += 4;
			    var tmp_view = new Uint8Array(this.typedH264Buffer);
				tmp_view.set(spiceMessage.args.data, this.h264position);
				this.h264position += spiceMessage.args.data.length;	
			}*/
			//console.log("displaypreprocess messageCount: " + this.messageCount);
			var video1 = document.getElementById('video1');
			if(spiceMessage.args.flags & 0x01 == 1){
				video1.removeAttribute("class");
			}
			else{
				video1.setAttribute("class", "rotate180");
			}
			if(this.debug != "1")
				window.wfs.trigger('wfsH264DataParsing', {data: spiceMessage.args.data});
			//window.wfs.trigger('wfsH264DataParsing', {data: copy2});
		}
		else if(spiceMessage.messageType === wdi.SpiceVars.SPICE_MSG_DISPLAY_AVC_CREATE){
			var copy = new Uint8Array(4);
			copy[0] = 0, copy[1] = 0, copy[2] = 1, copy[3] = 10;
			//window.wfs.trigger('wfsH264DataParsing', {data: copy});
			
			//window.wfs.bufferController.mediaSource.endOfStream();
			window.wfs.websocketLoader.h264Demuxer._avcTrack.sps = null;
			window.wfs.websocketLoader.h264Demuxer._avcTrack.pps = null;
			window.wfs.websocketLoader.h264Demuxer.remuxer.ISGenerated = false;
			//window.wfs.websocketLoader.h264Demuxer.remuxer._initPTS = undefined;
			
		}
		else if(spiceMessage.messageType === wdi.SpiceVars.SPICE_MSG_DISPLAY_AVC_DESTROY){
			//window.wfs.bufferController.mediaSource.endOfStream();
			var video1 = document.getElementById('video1');
            window.wfs = new Wfs();
            window.wfs.attachMedia(video1, 'ch1');
		}
		else{
			//console.log("drawCanvas");
			this.addTask(spiceMessage);
			this.executeConsumer();
		}
	},

	addTask: function(spiceMessage) {
		this.queued.push({
			message: spiceMessage,
			clientGui: this.clientGui
		});
	},

	getNextTask : function () {
		var task = this.queued.shift();
		while(typeof task == 'undefined' && this.queued.length != 0) {
			task = this.queued.shift();
		}

		//we found a task?
		if(typeof task == 'undefined') {
			return false;
		}

		task.state = 0;
		this.inProcess.push(task); //add the task to the inProcess list
		return task;
	},

	executeConsumer: function() {
		//check if there are idle consumers
		if(this.idleConsumers.length > 0) {
			wdi.Debug.log('DisplayPreProcess: available workers: '+this.idleConsumers.length);
			wdi.Debug.log('DisplaypreProcess: pending tasks: '+this.queued.length);
			//idle consumer found
			var consumer = this.idleConsumers.shift();
			//execute the next task in this consumer
			var task = this.getNextTask();

			if(task) {
				consumer.consume(task);
			}

		}
	},

	dispose: function () {
		this.consumers.forEach(function (consumer) {
			consumer.dispose();
		});
	}
});
