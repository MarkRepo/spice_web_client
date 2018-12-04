//    WebSockets Audio API
//
//    Opus Quality Settings
//    =====================
//    App: 2048=voip, 2049=audio, 2051=low-delay
//    Sample Rate: 8000, 12000, 16000, 24000, or 48000
//    Frame Duration: 2.5, 5, 10, 20, 40, 60
//    Buffer Size = sample rate/6000 * 1024

(function(global) {
	var defaultConfig = {
		codec: {
			sampleRate: 48000,
			channels: 2,
			app: 2048,
			frameDuration: 20,
			bufferSize: 512,
			BUFFER_SIZE: 512
		},
		server: {
			host: window.location.hostname,
			port: 5000
		}
	};

	var audioContext = new(window.AudioContext || window.webkitAudioContext)();

	var WSAudioAPI = global.WSAudioAPI = {
		Player: function(config, socket) {
			this.config = {};
			this.config.codec = this.config.codec || defaultConfig.codec;
			this.config.server = this.config.server || defaultConfig.server;
			this.sampler = new Resampler(this.config.codec.sampleRate, 44100, 1, this.config.codec.bufferSize);
			this.parentSocket = socket;
			this.decoder = new OpusDecoder(this.config.codec.sampleRate, this.config.codec.channels);
			this.silence = new Float32Array(this.config.codec.bufferSize);
		},
		Streamer: function(config, socket) {
			navigator.getUserMedia = (navigator.getUserMedia ||
				navigator.webkitGetUserMedia ||
				navigator.mozGetUserMedia ||
				navigator.msGetUserMedia);

			this.config = {};
			this.config.codec = this.config.codec || defaultConfig.codec;
			this.config.server = this.config.server || defaultConfig.server;
			this.sampler = new Resampler(44100, this.config.codec.sampleRate, 1, this.config.codec.bufferSize);
			this.parentSocket = socket;
			this.encoder = new OpusEncoder(this.config.codec.sampleRate, this.config.codec.channels, this.config.codec.app, this.config.codec.frameDuration);
			var _this = this;
			this._makeStream = function(onError) {
				navigator.getUserMedia({ audio: true }, function(stream) {
					_this.stream = stream;
					_this.audioInput = audioContext.createMediaStreamSource(stream);
					_this.gainNode = audioContext.createGain();
					_this.recorder = audioContext.createScriptProcessor(_this.config.codec.bufferSize, 1, 1);
					_this.recorder.onaudioprocess = function(e) {
						var resampled = _this.sampler.resampler(e.inputBuffer.getChannelData(0));
						var packets = _this.encoder.encode_float(resampled);
						for (var i = 0; i < packets.length; i++) {
							if (_this.socket.readyState == 1) _this.socket.send(packets[i]);
						}
					};
					_this.audioInput.connect(_this.gainNode);
					_this.gainNode.connect(_this.recorder);
					_this.recorder.connect(audioContext.destination);
				}, onError || _this.onError);
			}
		}
	};

	WSAudioAPI.Streamer.prototype.start = function(onError) {
		var _this = this;

		if (!this.parentSocket) {
			this.socket = new WebSocket('wss://' + this.config.server.host + ':' + this.config.server.port);
		} else {
			this.socket = this.parentSocket;
		}

		this.socket.binaryType = 'arraybuffer';

		if (this.socket.readyState == WebSocket.OPEN) {
			this._makeStream(onError);
		} else if (this.socket.readyState == WebSocket.CONNECTING) {
			var _onopen = this.socket.onopen;
			this.socket.onopen = function() {
				if (_onopen) {
					_onopen();
				}
				_this._makeStream(onError);
			}
		} else {
			console.error('Socket is in CLOSED state');
		}

		var _onclose = this.socket.onclose;
		this.socket.onclose = function() {
			if (_onclose) {
				_onclose();
			}
			if (_this.audioInput) {
				_this.audioInput.disconnect();
				_this.audioInput = null;
			}
			if (_this.gainNode) {
				_this.gainNode.disconnect();
				_this.gainNode = null;
			}
			if (_this.recorder) {
				_this.recorder.disconnect();
				_this.recorder = null;
			}
			_this.stream.getTracks()[0].stop();
			//console.log('Disconnected from server');
		};
	};

	WSAudioAPI.Streamer.prototype.mute = function() {
		this.gainNode.gain.value = 0;
		//console.log('Mic muted');
	};

	WSAudioAPI.Streamer.prototype.unMute = function() {
		this.gainNode.gain.value = 1;
		//console.log('Mic unmuted');
	};

	WSAudioAPI.Streamer.prototype.onError = function(e) {
		var error = new Error(e.name);
		error.name = 'NavigatorUserMediaError';
		throw error;
	};

	WSAudioAPI.Streamer.prototype.stop = function() {
		if (this.audioInput) {
			this.audioInput.disconnect();
			this.audioInput = null;
		}
		if (this.gainNode) {
			this.gainNode.disconnect();
			this.gainNode = null;
		}
		if (this.recorder) {
			this.recorder.disconnect();
			this.recorder = null;
		}
		this.stream.getTracks()[0].stop()

		if (!this.parentSocket) {
			this.socket.close();
		}
	};

	WSAudioAPI.Player.prototype.start = function() {
		var _this = this;

		this.audioQueue = {
			buffer: new Float32Array(0),
			lastCurTime: Date.now(),

			write: function(newAudio) {
				var cur_time = Date.now();
				var currentQLength = this.buffer.length;
				//newAudio = _this.sampler.resampler(newAudio);
				//var newBuffer;
				/*if(cur_time - this.lastCurTime > 600*1000){
					newBuffer = new Float32Array(newAudio.length);
					newBuffer.set(newAudio, 0);
					this.lastCurTime = cur_time;
				}else{*/
				//	//console.log("currentQLength: " + currentQLength);
					var newBuffer = new Float32Array(currentQLength + newAudio.length);
					newBuffer.set(this.buffer, 0);
					newBuffer.set(newAudio, currentQLength);
				//}	
				this.buffer = newBuffer;
			},

			read: function(nSamples) {
				////console.log("playbackn: " + this.buffer.length);
				if(this.buffer.length > 96000){
					this.buffer = new Float32Array(0);
					return;
				}
				
				if(this.buffer.length	>= nSamples	){
					var samplesToPlay = this.buffer.subarray(0, nSamples);
					this.buffer = this.buffer.subarray(nSamples, this.buffer.length);
					return samplesToPlay;
				}
				
			},

			length: function() {
				return this.buffer.length;
			}
		};
		this.get_audio_data = function(e){

			var out = e.buffers;
			var samples = _this.audioQueue.read(_this.config.codec.BUFFER_SIZE * 2);
			if(samples){

				var i, j;
				for(i = 0, j = 0; i< e.bufferSize; i++){

					out[0][i] = samples[j++];
					out[1][i] = samples[j++];
				}
				return 1;
			}
			/*else{

				var k;
				for(k=0; k<e.bufferSize	; k++){
					out[0][k] = 0;
					out[1][k] = 0;
				}
			}*/
			return 0;
		}	

		this.buffers = [
        	new Float32Array(_this.config.codec.BUFFER_SIZE),
        	new Float32Array(_this.config.codec.BUFFER_SIZE),
      	];

		this.process = function	(bufL, bufR) {
    		var audioprocess = _this.get_audio_data;
    		var buffers = _this.buffers;
    		var bufferL = buffers[0];
    		var bufferR = buffers[1];
    		var n = bufL.length / _this.config.codec.BUFFER_SIZE;
		
		/*var samples = _this.audioQueue.read(_this.config.codec.bufferSize * 2);
		if(samples)
		{
			for(let i = 0, j=0; i<_this.config.codec.bufferSize; i++){
				bufL[i] = samples[j++];
				bufR[i] = samples[j++];
			}
		}*/ 
    		for (var i = 0; i < n; i++) {
      			var ret = audioprocess({bufferSize: _this.config.codec.BUFFER_SIZE,buffers: _this.buffers,});
			if(ret){
     				bufL.set(bufferL, i * _this.config.codec.BUFFER_SIZE);
      				bufR.set(bufferR, i * _this.config.codec.BUFFER_SIZE);
     			}
     			else{
				var buf_silence = new Float32Array(bufL.length - i*_this.config.codec.BUFFER_SIZE);
     				bufL.set(buf_silence, i * _this.config.codec.BUFFER_SIZE);
     				bufR.set(buf_silence, i * _this.config.codec.BUFFER_SIZE);
     				break;
     			}
    		}
  		}
		var bufL = new Float32Array(_this.config.codec.bufferSize);
  		var bufR = new Float32Array(_this.config.codec.bufferSize);
		this.scriptNode = audioContext.createScriptProcessor(_this.config.codec.bufferSize, 0, 2);
		this.gainNode = audioContext.createGain();
		if (typeof AudioBuffer.prototype.copyToChannel === "function") {
      		this.scriptNode.onaudioprocess = function(e) {
        		var buf = e.outputBuffer;
        		_this.process(bufL, bufR);
        		buf.copyToChannel(bufL, 0);
        		buf.copyToChannel(bufR, 1);
      		};
    	} else {
      			this.scriptNode.onaudioprocess = function(e) {
        		var buf = e.outputBuffer;
        		_this.process(bufL, bufR);
        		buf.getChannelData(0).set(bufL);
        		buf.getChannelData(1).set(bufR);
      		};
    	}
    	this.scriptNode.connect(this.gainNode);
    	this.gainNode.connect(audioContext.destination);
		/*is.scriptNode.onaudioprocess = function(e) {



			if (_this.audioQueue.length()) {
				var samplesToPlay = _this.audioQueue.read(_this.config.codec.bufferSize);
				var leftChannel = new Float32Array(_this.config.codec.bufferSize / 2);
				var rightChannel = new Float32Array(_this.config.codec.bufferSize / 2);
				var i, l, r ;
				for(i=0, l = 0, r = 0; i< _this.config.codec.bufferSize; i += 2){
					leftChannel[l] = samplesToPlay[i];
					rightChannel[r] = samplesToPlay[i+1];
					l += 1;
					r += 1;
				}
				e.outputBuffer.getChannelData(0).set(leftChannel);
				e.outputBuffer.getChannelData(1).set(rightChannel);
			} else {		
				e.outputBuffer.getChannelData(0).set(_this.silence);
			}
		};*/
		//is.gainNode = audioContext.createGain();
		//is.scriptNode.connect(this.gainNode);
		//is.gainNode.connect(audioContext.destination);

		this.resampler12kto48k = function(samples){
			var newSamples = new Float32Array(samples.length*4);
			var i, j;
			for(i=0, j=0; i< samples.length; i += 2){
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
				newSamples[j++] = samples[i];
				newSamples[j++] = samples[i+1];
			}

			return newSamples;
		};
		this.decodeOpusData = function(packetBuf){
			//_this.audioQueue.write(_this.resampler12kto48k(_this.decoder.decode_float(packetBuf)));
			_this.audioQueue.write(_this.decoder.decode_float(packetBuf));
		};
		/*
		if (!this.parentSocket) {
			this.socket = new WebSocket('wss://' + this.config.server.host + ':' + this.config.server.port);
		} else {
			this.socket = this.parentSocket;
		}*/

        //this.socket.onopen = function () {
        //    //console.log('Connected to server ' + _this.config.server.host + ' as listener');
        //};
        /*var _onmessage = this.parentOnmessage = this.socket.onmessage;
        this.socket.onmessage = function(message) {
        	if (_onmessage) {
        		_onmessage(message);
        	}
        	if (message.data instanceof Blob) {
        		var reader = new FileReader();
        		reader.onload = function() {
        			_this.audioQueue.write(_this.decoder.decode_float(reader.result));
        		};
        		reader.readAsArrayBuffer(message.data);
        	}
        };*/
        //this.socket.onclose = function () {
        //    //console.log('Connection to server closed');
        //};
        //this.socket.onerror = function (err) {
        //    //console.log('Getting audio data error:', err);
        //};
      };

      WSAudioAPI.Player.prototype.getVolume = function() {
      	return this.gainNode ? this.gainNode.gain.value : 'Stream not started yet';
      };

      WSAudioAPI.Player.prototype.setVolume = function(value) {
      	//if (this.gainNode) this.gainNode.gain.value = value;
      	if(this.gainNode)
      		this.gainNode.gain.setValueAtTime(value, audioContext.currentTime + 1);
      };

      WSAudioAPI.Player.prototype.stop = function() {
      	this.audioQueue = null;
      	this.scriptNode.disconnect();
      	this.scriptNode = null;
      	this.gainNode.disconnect();
      	this.gainNode = null;

      	if (!this.parentSocket) {
      		this.socket.close();
      	} else {
      		this.socket.onmessage = this.parentOnmessage;
      	}
      };
    })(window);
