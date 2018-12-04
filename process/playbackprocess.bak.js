wdi.PlaybackProcess = $.spcExtend(wdi.EventObject.prototype, {
	_lastApp: null,
	started: false,
	minBuffSize: 1024*32,
	maxBuffSize: 1024*10240,
	frequency: null,
	channels: null,
	audioContext: null,
	startTime: null, // controls the playback time if no delay occurs
	hasAudioSupport: true, //whether the browser supports HTML5 Web Audio API

	typedBuffer: null,
	position: null,


	init: function(c) {
		this.app = c.app;
		this.audioContext = this.getAudioContext();
		if (this.audioContext) {
			this.hasAudioSupport = true;
		} else {
			this.hasAudioSupport = false;
			wdi.Debug.warn('The client browser does not support Web Audio API');
		}
		this.startTime = 0;
		this.lastTimeStamp = 0;
		this.player = new window.WSAudioAPI.Player();
		this.typedBuffer = new ArrayBuffer(this.minBuffSize);
		this.typedPCMBuf = new ArrayBuffer(this.maxBuffSize);
		this.position = 0;
		this.pcmposition = 0;
		this.buf = null;
		this.packet_count = 0;
		this.download = false;
		/*this.worker = new Worker('audio/worker.js');
		var that = this;
		this.worker.onmessage = function(e){
			var packet = e.data;
			if(that.position + packet.data.length > that.minBuffSize){
				that.flush(that.lastTimeStamp);
			}
			that.lastTimeStamp = packet.multimedia_time;
			var tmpview = new Uint8Array(that.typedBuffer);
			tmpview.set(packet.data, that.position);
			that.position += packet.data.length;
			that._lastApp = that.app;			
		}*/
		this.audioQueue = {
			buffer: new Float32Array(0),

			write: function(newAudio) {
				var currentQLength = this.buffer.length;
				//newAudio = _this.sampler.resampler(newAudio);
				var newBuffer = new Float32Array(currentQLength + newAudio.length);
				newBuffer.set(this.buffer, 0);
				newBuffer.set(newAudio, currentQLength);
				this.buffer = newBuffer;
			},

			read: function(nSamples) {
				if(this.buffer.length >= nSamples){
					var samplesToPlay = this.buffer.subarray(0, nSamples);
					this.buffer = this.buffer.subarray(nSamples, this.buffer.length);
					return samplesToPlay;
				}
			},

			length: function() {
				return this.buffer.length;
			}
		};
		 var _this = this;
                this.get_audio_data = function(){

                        return function(e){
                                var out = e.buffers;
                                var samples = _this.audioQueue.read(e.bufferSize*2);
                                if(samples){
                                        var j = 0;
                                        for (var i = 0; i < e.bufferSize; i++ ) {
                                                out[0][i] = samples[j++];
                                                out[1][i] = samples[j++];
                                        }
                                }
				else{
					var k =0 ;
					for (var k = 0; k < e.bufferSize; k++){
						out[0][k] = 0;
						out[1][k] = 0;
					}
				}
                        };

                };
		this.resampler24kto48k = function(samples){
			var newSamples = new Float32Array(samples.length*2);
			var i, j;
			for(i=0, j=0; i< samples.length; i += 2){
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
			}

			return newSamples;
		};
	},

	getAudioContext: function() {
		//standard browser object
		try {
			return new AudioContext();
		} catch(e) {

		}

		//chrome and safari
		try {
		   return new webkitAudioContext();

		} catch(e) {

		}

		return false;
	},

	process: function(spiceMessage) {

		// if (this.hasAudioSupport && !Modernizr.touch) {
		if (this.hasAudioSupport) {
			switch (spiceMessage.messageType) {
				case wdi.SpiceVars.SPICE_MSG_PLAYBACK_MODE:
					break;
				case wdi.SpiceVars.SPICE_MSG_PLAYBACK_START:
					var packet = spiceMessage.args;
					this.channels = packet.channels;
					this.frequency = packet.frequency;
					break;
				case wdi.SpiceVars.SPICE_MSG_PLAYBACK_STOP:
					this.startTime = 0;
					var packet = spiceMessage.args;
					this.flush();
					break;
				case wdi.SpiceVars.SPICE_MSG_PLAYBACK_DATA:
					// While we receive data chunks, we store them in a buffer, so than when it is full we play the sound and empty it.
					// With this we get a more fluid playback and better overall performance than if we just played the data the moment we got it
					var packet = spiceMessage.args;
					//this.worker.postMessage(packet);
					var packet_data = new Uint8Array(packet.data);
					var samples = this.player.decoder.decode_float(packet_data.buffer);
					samples = this.resampler24kto48k(samples);
					//samples = this.player.sampler.resampler(samples);
					this.audioQueue.write(samples);
					//packet_data = new Uint8Array(samples.buffer);
					////console.log("packet_data length: " + packet_data.length);
				/*		
					var newBUffer;
					if(this.buf){
						newBuffer = new Uint8Array(this.buf.byteLength + packet_data.length);
						newBuffer.set(this.buf, 0);
						newBuffer.set(packet_data, this.buf.byteLength);
						this.buf = newBuffer;
					}
					else
						this.buf = new Uint8Array(packet_data);
					this.lastTimeStamp = spiceMessage.args.multimedia_time;
					this.position += packet_data.length; 
					this.packet_count += 1;
					if(this.packet_count == 10){
 
						this.flush(this.lastTimeStamp);
						this.packet_count = 0;
						this.buf = null;
						this.position = 0;
					}
	
				*/	
					//var auDecArr = null;
					/*if(this.position + packet_data.length > this.minBuffSize){
						this.flush(this.lastTimeStamp);
						//auDecArr = new Uint8Array(this.typedBuffer, 0, this.position);
						//this.player.decodeOpusData(auDecArr);
						//this.position = 0;
						//this.typedBuffer = new ArrayBuffer(this.minBuffSize);
					}
					this.lastTimeStamp = spiceMessage.args.multimedia_time;
					var tmpview = new Uint8Array(this.typedBuffer);
					tmpview.set(packet_data, this.position);
					this.position += packet_data.length;
					this._lastApp = this.app;
				        */	
					//this.flush(this.lastTimeStamp);
					
					//var packet = spiceMessage.args;
					/*if(!this.download && this.pcmposition + packet_data.length> this.maxBuffSize){
						//generate blob binary data, and save to local filesystem
						//var array = new Array(this.position);
						var u8array2 = new Uint8Array(this.typedPCMBuf, 0, this.pcmposition);
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
						saveFile(u8array2, 'test.pcm');
						this.download = true;

					}
					if(!this.download){
						//var len_view = new DataView(this.typedPCMBuf);
						//len_view.setUint32(this.position, packet.data.length);
						//this.position += 4;
					        var tmp_view = new Uint8Array(this.typedPCMBuf);
						tmp_view.set(packet_data, this.pcmposition);
						this.pcmposition += packet_data.length;	
					}*/
					//var u8array = new Uint8Array(packet.data);
					//this.player.decodeOpusData(u8array.buffer);
					////console.log("audio packet length: " + packet.data.length);
					/*this.audioContext.decodeAudioData(u8array.buffer, function(buffer){
						curBuf = buffer;
						var src = this.audioContext.createBufferSource();
						src.buffer = curBuf;
						src.connect(this.audioContext.destination);
						src.start(0);
					}, function(err){
						//console.log("unable to decode");
					});*/
					break;
			}
		} else {
			//TODO:
			// If the browser doesn't support Web Audio, we could still attach a wav header to the raw PCM we receive from spice and use the more widespread supported audio tag
			// Meanwhile, we can skip all the audio packets and gain some performance at least
		}
	},

	/**
	 * Plays all the audio buffer and empties it
	 *
	 * @param app
	 * @param dataTimestamp
	 */
	flush: function(dataTimestamp) {
		if(this.position > 0) {
			if (this.started) {
				this.playSound(this.typedBuffer, dataTimestamp);
				//this.playSound(this.buf, dataTimestamp);
				/*this.audioContext.decodeAudioData(this.typedBuffer, function(buffer){
					var src = this.audioContext.createBufferSource();
					src.connect(this.audioContext.destination);
					src.buffer = buffer;
					src.start(0);
				}, function(err){
					//console.log("unable to decode");
				});*/
			}
			this.position = 0;
			this.typedBuffer = new ArrayBuffer(this.minBuffSize);
		}
	},

	/**
	 * Plays the raw pcm data passed as param using HTML5's Web Audio API
	 *
	 * @param buffer
	 */
	playSound: function(buffer, dataTimestamp) {
		if(this.channels == 2) {
			return this.playSoundStereo(buffer, dataTimestamp);
		}

		var audio = new Int16Array(buffer);

		var channelData = new Array(this.channels);
		for(var i = 0;i<this.channels;i++) {
			channelData[i] = new Float32Array(audio.length / 2);
		}

		var channelCounter = 0;
		for (var i = 0; i < audio.length; ) {
		  for(var c = 0; c < this.channels; c++) {
			  //because the audio data spice gives us is 16 bits signed int (32768) and we wont to get a float out of it (between -1.0' and 1.0)
			  channelData[c][channelCounter] = audio[i++] / 32768;
		  }
		  channelCounter++;
		}

		var source = this.audioContext['createBufferSource'](); // creates a sound source
		var audioBuffer = this.audioContext['createBuffer'](this.channels, channelCounter, this.frequency);
		for(var i=0;i < this.channels; i++) {
			audioBuffer['getChannelData'](i)['set'](channelData[i]);
		}

		this._play(source, audioBuffer, dataTimestamp);
	},

	/**
	 * Plays the raw pcm STEREO data passed as param using HTML5's Web Audio API
	 *
	 * @param buffer
	 */
	playSoundStereo: function(buffer, dataTimestamp) {
		// Each data packet is 16 bits, the first being left channel data and the second being right channel data (LR-LR-LR-LR...)
		//var audio = new Int16Array(buffer);
		var audio = new Float32Array(buffer);

		// We split the audio buffer in two channels. Float32Array is the type required by Web Audio API
		var left = new Float32Array(audio.length / 2);
		var right = new Float32Array(audio.length / 2);

		var channelCounter = 0;

		var audioContext = this.audioContext;
		var len = audio.length;

		for (var i = 0; i < len; ) {
		  //because the audio data spice gives us is 16 bits signed int (32768) and we wont to get a float out of it (between -1.0 and 1.0)
		  //left[channelCounter] = audio[i++] / 32768;
		  //right[channelCounter] = audio[i++] / 32768;
		  left[channelCounter] = audio[i++];
		  right[channelCounter] = audio[i++];
		  channelCounter++;
		}

		var source = audioContext['createBufferSource'](); // creates a sound source
		this.audioContext.sampleRate = 24000;
		var audioBuffer = audioContext['createBuffer'](2, channelCounter, this.frequency);
		//var audioBuffer = audioContext['createBuffer'](2, channelCounter, 44100);

		audioBuffer['getChannelData'](0)['set'](left);
		audioBuffer['getChannelData'](1)['set'](right);

		this._play(source, audioBuffer, dataTimestamp);
	},

	_play: function(source, audioBuffer, dataTimestamp) {
		var wait = 0;
		if (dataTimestamp) {
			var elapsedTime = Date.now() - this.app.lastMultimediaTime; // time passed since we received the last multimedia time from main channel
			var currentMultimediaTime = elapsedTime + this.app.multimediaTime; // total delay we have at the moment
			wait = dataTimestamp - currentMultimediaTime;
			if (wait < 0) {
				wait = 0;
			}
		}
		source['buffer'] = audioBuffer;
		source['connect'](this.audioContext['destination']);	   // connect the source to the context's destination (the speakers)

		//if (!Modernizr.touch) {
			//source['start'](this.startTime + wait);						   // play the source now
			source['start'](0);						   // play the source now
		//} else {
		//	source.noteOn(0);
		//}

		this.startTime += audioBuffer.duration;
	},

	startAudio: function () {
		this.started = true;
		//this.player.start();
		//this.flush();
		Pico.play(this.get_audio_data());
	}
});
