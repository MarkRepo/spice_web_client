wdi.SPICE_INPUT_MOTION_ACK_BUNCH = 8;

wdi.ClientGui = $.spcExtend(wdi.EventObject.prototype, {
	width: null,
	height: null,
	canvas: null,
	ack_wait: 0,
	mouse_mode: 0,
	mouse_status: 0,
	eventLayer: null,
	counter: 0,
	mainCanvas: 0,
	firstTime: true,
	clientOffsetX: 0,
	clientOffsetY: 0,
	magnifier: null,
	magnifierBackground: null,
	firstMove: true,
	isMagnified: true,
	isMouseDown: false,
	soundStarted: false,
	canvasMarginY: 0,
	canvasMarginX: 0,
	stuckKeysHandler: null,

	subCanvas: {},
	inputManager: null,
	clipboardEnabled: true,
	layer: null,

	init: function(c) {
		this.canvas = {};
		this.contexts = {};
		this.superInit();
		this.magnifier = window.$('<canvas/>').attr({
			'width': 150,
			'height': 150
		}).css({
				'position': 'absolute',
				'left': '0px',
				'top': '0px'
			});
		this.stuckKeysHandler = c.stuckKeysHandler || new wdi.StuckKeysHandler();
		this.stuckKeysHandler.addListener('inputStuck', this._sendInput.bind(this), this);

		//load magnifier background
		this.magnifierBackground = window.$('<img/>');
		this.magnifierBackground.attr('src', 'resources/magnifier.png');
		this.initSound();
		this.inputManager = c.inputManager || new wdi.InputManager({ stuckKeysHandler: this.stuckKeysHandler, window: $(window)});
		this.inputManager.setCurrentWindow(window);
		this.ctrlTimeoutID = 0;
		this.shiftTimeoutID = 0;
		this.altTimeoutID = 0;
		this.isBracketsUp = false;
		this.is229keydown = false;
	},

	setLayer: function(layer) {
		this.layer = layer;
	},

	disableClipboard: function () {
		this.clipboardEnabled = false;
	},

	_sendInput: function (params) {
		var data = params;
		var type = data[0];
		var event = data[1];
		this.fire('input', [type, event]);
	},

	releaseAllKeys: function() {
		this.stuckKeysHandler.releaseAllKeys();
	},

	getContext: function(surface_id) {
		return this.contexts[surface_id];
	},

	getCanvas: function(surface_id) {
		return this.canvas[surface_id];
	},

	checkFeatures: function() {
		if (!Modernizr.canvas || !Modernizr.websockets) {
			alert('Your Browser is not compatible with WDI. Visit ... for a list of compatible browsers');
			return false;
		}
		return true;
	},

	deleteSubCanvas: function(window) {
		var obj = this.subCanvas[window['hwnd']];
		this.subCanvas[window['hwnd']] = null;
		return obj;
	},

	moveSubCanvas: function(window) {
		var obj = this.subCanvas[window['hwnd']];
		obj['info'] = window;
		this._fillSubCanvasFromWindow(window);
		return obj;
	},

	resizeSubCanvas: function(window) {
		var obj = this.subCanvas[window['hwnd']];
		$([obj["canvas"], obj["eventLayer"]]).attr({
			'width': window['width'],
			'height': window['height']
		});
		obj['info'] = window;
		this._fillSubCanvasFromWindow(window);
		return obj;
	},

	_fillSubCanvasFromWindow: function(window) {
		var top = parseInt(window.top, 10);
		var left = parseInt(window.left, 10);
		var width = parseInt(window.width, 10);
		var height = parseInt(window.height, 10);
		this.fillSubCanvas({
			top: top,
			left: left,
			right: left + width,
			bottom: top + height
		});
	},

	createNewSubCanvas: function(window) {
		//console.log("createNewSubCanvas");
		var evtlayer = this.createEventLayer(window['hwnd'] + '_event', window['width'], window['height']);
		this.subCanvas[window['hwnd']] = {
			'canvas': $('<canvas/>').attr({
				width: window['width'],
				height: window['height']
			}).css({
					display: window['iconic'] ? 'none' : 'block'
				})[0],
			'eventLayer': evtlayer,
			'info': window,
			'position': 0
		};
		//we have the main area drawn?
		if (this.canvas[this.mainCanvas]) {
			this._fillSubCanvasFromWindow(window);
		}
		return [this.subCanvas[window['hwnd']]];
	},

	fillSubCanvas: function(filterPosition) {
		var canvas = this.canvas[this.mainCanvas];
		var info = null;
		for (var i in this.subCanvas) {
			if (this.subCanvas[i] != null && this.subCanvas[i] !== undefined && this.subCanvas.hasOwnProperty(i)) {
				info = this.subCanvas[i]['info'];
				if(filterPosition!= null || filterPosition != undefined) {
					var top = parseInt(info['top'], 10);
					var left = parseInt(info['left'], 10);
					var width = parseInt(info['width'], 10);
					var height = parseInt(info['height'], 10);
					var position = {
						top: top,
						left: left,
						right: left + width,
						bottom: top + height
					};
					if (wdi.CollisionDetector.thereIsBoxCollision(position, filterPosition)) {
						this._doDrawSubCanvas(canvas, this.subCanvas[i], info);
					}
				} else {
					this._doDrawSubCanvas(canvas, this.subCanvas[i], info);
				}
			}
		}
	},

	_doDrawSubCanvas: function(canvas, subCanvas, info) {
		if(this.canvas[this.mainCanvas] == null || this.canvas[this.mainCanvas] == undefined) {
			return;
		}
		var destCtx = null;
		if (info['iconic'] === 0) {
			var destCanvas = subCanvas['canvas'];
			destCtx = destCanvas.getContext("2d");

			var x = 0;
			var y = 0;
			var width = +info.width;
			var height = +info.height;
			var left = +info['left'];
			var top = +info['top'];

			if (left < 0) {
				width = width + left;
				x = -left;
				left = 0;
			}

			if (top < 0) {
				height = height + top;
				y = -top;
				top = 0;
			}

			try {
				// if width or height are less than 1 or a float
				// drawImage fails in firefox (ERROR: IndexSizeError)
				width = Math.max(1, Math.floor(width));
				height = Math.max(1, Math.floor(height));
				if (width > canvas.width) width = canvas.width;
				if (height > canvas.height) height = canvas.height;
				destCtx.drawImage(canvas, left, top, width, height, x, y, width, height);
			} catch (err) {
				//console.log(err)
			}

		}
	},

	removeCanvas: function(spiceMessage) {
		var surface = spiceMessage.args;
		if (surface.surface_id === this.mainCanvas) {
			$(this.eventLayer).remove();
			this.eventLayer = null;
		}

		this.canvas[surface.surface_id].keepAlive = false;
		delete this.canvas[surface.surface_id];
		delete this.contexts[surface.surface_id];
	},
	

	drawCanvas: function(spiceMessage) {
		var video = document.getElementById('video1');
		var surface = spiceMessage.args;
		var cnv = wdi.GlobalPool.create('Canvas');
		cnv.keepAlive = true; //prevent this canvas to return to the pool by packetfilter

		cnv.id = 'canvas_' + surface.surface_id;
		cnv.width = surface.width;
		cnv.height = surface.height;
		
		cnv.style.position = 'absolute';
		//cnv.style.top = this.canvasMarginY + 'px';
		cnv.style.top = 0 + 'px';
		cnv.style.left = this.canvasMarginX + 'px';
		cnv.style.zIndex = '0';
		cnv.style.opacity = 0;
		
		this.canvas[surface.surface_id] = cnv;
		this.contexts[surface.surface_id] = cnv.getContext('2d');

		if (surface.flags && !wdi.SeamlessIntegration) {
			this.mainCanvas = surface.surface_id;

			this.eventLayer = this.createEventLayer('eventLayer', surface.width, surface.height);

			var evLayer = $(this.eventLayer).css({
				position: 'absolute',
				//top: '0px',
				//left: '0px',
				//top: this.canvasMarginY + 'px',
				top: 0 + 'px',
			        left: this.canvasMarginX + 'px',
			        zIndex: '0'
			})[0];

			if(this.layer) {
				//this.layer.appendChild(cnv);
				this.layer.appendChild(video);
				this.layer.appendChild(this.eventLayer);
			} else {
				//document.body.appendChild(cnv);
				document.body.appendChild(video);
				document.body.appendChild(evLayer);
			}
			
			//this.enableKeyboard();
		}

		//this goes here?
		if (this.firstTime && this.clipboardEnabled) {
			var self = this;
			$(document).bind('paste', function(event) {
				self.fire('paste', event.originalEvent.clipboardData.getData('text/plain'));
			});
			this.firstTime = false;
		}


		//notify about resolution
		if (surface.flags) {
			this.fire('resolution', [this.canvas[surface.surface_id].width, this.canvas[surface.surface_id].height]);
		}
	},

	disableKeyboard: function() {
		var documentDOM = window.$(window.document);
		documentDOM.unbind('keydown', this.handleKey);
		documentDOM.unbind('keyup', this.handleKey);
		documentDOM.unbind('keypress', this.handleKey);
		this.inputManager.disable();
	},

	enableKeyboard: function() {
		var self = this,
			documentDOM = window.$(window.document);
		documentDOM['keydown']([self], this.handleKey);
		documentDOM['keypress']([self], this.handleKey);
		documentDOM['keyup']([self], this.handleKey);
		this.inputManager.enable();
	},

	setCanvasMargin: function(canvasMargin) {
		this.canvasMarginX = canvasMargin.x;
		this.canvasMarginY = canvasMargin.y;
	},

	createEventLayer: function(event_id, width, height) {
		var self = this;
		var eventLayer = $('<canvas/>').css({
		//var eventLayer = $('<video/>').css({
			cursor: 'default',
			position: 'absolute'
		}).attr({
				id: event_id,
				width: width,
				height: height
			});

		if (window['bowser']['firefox']) {
			eventLayer.attr('contentEditable', true);
		}

		eventLayer.bind('touchstart', function(event) {
			event.preventDefault();
			var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
			var x = touch.pageX;
			var y = touch.pageY;
			self.generateEvent.call(self, 'mousemove', [x + self.clientOffsetX, y + self.clientOffsetY, self.mouse_status]);
			if (event.originalEvent.touches.length === 1) {
				self.enabledTouchMove = true;
				self.launchRightClick.call(self, x, y);
			} else if (event.originalEvent.touches.length === 2) {
				self.touchX = x;
				self.touchY = y;
				self.enabledTouchMove = false;
			} else if (event.originalEvent.touches.length === 3) {
				self.touchY3 = y;
				self.enabledTouchMove = false;
			}

		});

		eventLayer.bind('touchmove', function(event) {
			var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
			var x = touch.pageX;
			var y = touch.pageY;
			//TODO: ignore first move
			if (event.originalEvent.touches.length === 1 && self.enabledTouchMove) {
				self.isMagnified = true; //magnified!
				clearInterval(self.rightClickTimer); //cancel, this is not a right click

				if (!self.isMouseDown) {
					clearInterval(self.mouseDownTimer); //cancel, not enough time to send mousedown
					self.launchMouseDown(); //fire again
				}


				self.generateEvent.call(self, 'mousemove', [x + self.clientOffsetX, y + self.clientOffsetY - 80, self.mouse_status]);
				var pos = $(this).offset();
				var myX = x - pos.left;
				var myY = y - pos.top;

				//draw magnifier
				if (self.firstMove) {
					$('body').append(self.magnifier);//TODO: append to body?
					self.firstMove = false;
				}

				var posX = myX - 75;
				var posY = myY - 160;

				self.magnifier.css({
					'left': posX,
					'top': posY
				});

				//fill magnifier
				var ctx = self.magnifier[0].getContext('2d');
				ctx.clearRect(0, 0, 150, 150);
				ctx.save();
				ctx.beginPath();
				ctx.arc(75, 75, 75, 0, 2 * Math.PI, false);
				ctx.clip();
				ctx.drawImage(
					self.getCanvas(0),
					myX - 50, //-50 because we are going to get
					myY - 50 - 80, //100 px and we want the finder to be the center
					//-80 becasue the magnifier is 160px up (160/2)
					//we need to clean all this after the demo
					//is working
					100,
					100,
					0,
					0,
					150,
					150
				);
//				//draw the background
				ctx.drawImage(self.magnifierBackground[0], 0, 0);
				ctx.restore();
				//empty magnifier
			} else if (event.originalEvent.touches.length === 2) {
				var delta = self.touchY - y;
				if (Math.abs(delta) > 10) {
					var button = delta > 0 ? 4 : 3;
					self.touchX = x;
					self.touchY = y;
					self.generateEvent.call(self, 'mousedown', button);
					self.generateEvent.call(self, 'mouseup', button);
				}
			} else if (event.originalEvent.touches.length === 3) {
				var delta = self.touchY3 - y;
				if (delta > 100) {
					document.getElementById('hiddeninput').select();
				}
			}
			event.preventDefault();
		});

		eventLayer.bind('touchend', function(event) {
			if (self.enabledTouchMove) {
				var touch = event.originalEvent.touches[0] || event.originalEvent.changedTouches[0];
				var x = touch.pageX;
				var y = touch.pageY;
				if (!self.isMouseDown) {
					self.generateEvent.call(self, 'mousedown', 0);
				}
				self.isMouseDown = false;
				self.generateEvent.call(self, 'mouseup', 0);
				var pos = $(this).offset();

				self.enabledTouchMove = false;
				self.firstMove = true;
				if (self.isMagnified) {
					self.magnifier.remove();
				}
				self.isMagnified = false;
			}
			clearInterval(self.rightClickTimer); //cancel, this is not a right click
			clearInterval(self.mouseDownTimer);  //cancel
		});

		//if (!Modernizr.touch) {
			eventLayer['mouseup'](function(event) {
				var button = event.button;

				self.generateEvent.call(self, 'mouseup', button);
				self.mouse_status = 0;
				event.preventDefault();
			});

			eventLayer['mousedown'](function(event) {
				var button = event.button;

				self.generateEvent.call(self, 'mousedown', button);
				self.mouse_status = 1;
				event.preventDefault();
			});

			eventLayer['mousemove'](function(event) {
				var button = event.button;
                if(event.which == 0 && self.mouse_status == 1){
                    self.generateEvent.call(self, 'mouseup', button);
                    self.mouse_status = 0;
                }
				var x = event.pageX;
				var y = event.pageY;
				self.generateEvent.call(self, 'mousemove', [x + self.clientOffsetX, y + self.clientOffsetY, self.mouse_status]);
				event.preventDefault();
			});

			eventLayer.bind('contextmenu', function(event) {
				event.preventDefault();
				return false;
			});
		//}

		var mouseEventPause = false;
		var mousewheelFunc = function(event, delta){
			var button = delta > 0 ? 3 : 4;
			self.generateEvent.call(self, 'mousedown', button);
			self.generateEvent.call(self, 'mouseup', button);
			eventLayer.unbind('mousewheel');
			setTimeout(function(){
				eventLayer.bind('mousewheel', mousewheelFunc);
			}, 100);
			return false;
		};

		eventLayer.bind('mousewheel', mousewheelFunc);


		wdi.VirtualMouse.setEventLayer(eventLayer[0], 0, 0, width, height, 1);
		return eventLayer[0];
	},

	launchRightClick: function(x, y) {
		var self = this;
		this.rightClickTimer = setTimeout(function() {
			self.generateEvent.call(self, 'mousedown', 2);
			self.generateEvent.call(self, 'mouseup', 2);
			self.enabledTouchMove = false;
		}, 400);
	},

	launchMouseDown: function(x, y) {
		var self = this;
		this.mouseDownTimer = setTimeout(function() {
			self.isMouseDown = true;
			self.generateEvent.call(self, 'mousedown', 0);
		}, 1500);
	},

	showError: function(message) {
		wdi.Debug.warn(message);
		document.getElementById("overlay").style.visibility = "visible";
		document.getElementById("error").style.visibility = "visible";
	},

	generateEvent: function(event, params) {
		if (event === 'mousemove' || event === 'joystick') {
			if (this.ack_wait < wdi.SPICE_INPUT_MOTION_ACK_BUNCH) {
				this.ack_wait++;
				this.fire('input', [event, params]);
			}
		} else {
			if (event.indexOf('key') > -1) { // it's a keyEvent
				//console.log("***** generateEvent event: " + event);
				this.stuckKeysHandler.checkSpecialKey(event, params[0]['keyCode']);
				var key_code = params[0]['keyCode'];
				var val = this.inputManager.getValue();
				if(event == "keydown" && params[0]['keyCode'] == 229 && this.stuckKeysHandler.shiftKeyPressed && this.stuckKeysHandler.ctrlKeyPressed){
					this.is229keydown = true;
				}
				if(event == "keyup" && (params[0]['keyCode'] == 16 || params[0]['keyCode'] == 17) && this.is229keydown){
					val = "";
					if(this.stuckKeysHandler.shiftKeyPressed == false && this.stuckKeysHandler.ctrlKeyPressed == false){
						this.is229keydown = false;
					}
				}
				if(event == "keyup" && params[0]['keyCode'] == 219 && val == '' && this.isBracketsUp == false){
					val = '[';
				}else if(event == "keyup" && params[0]['keyCode'] == 219 && val == ''){
					this.isBracketsUp = false;
				}
				if (val) {
					params = this.inputManager.manageChar(val, params);
					if(key_code == 16 && params[0]['charCode'] == 123){
						this.isBracketsUp = true;
					}else{
						this.isBracketsUp = false;
					}

					//console.log("***** generateEvent  manageChar, type: " + params[0]['type'] + ", charCode: " + params[0]['charCode'] + ", var: " + val);
				}
			}
			this.fire('input', [event, params]);
		}
	},

	motion_ack: function() {
		this.ack_wait = 0;
	},

	setMouseMode: function(mode) {
		this.mouse_mode = mode;
	},

	handleKey: function(e) {
		//console.log("***** handleKey Type: " + e.type + " keyCode: " + e.keyCode + " charCode: " + e.charCode);
		//ignore win key
		/*
		if( (e.keyCode == 18 && e.ctrlKey) || (e.keyCode == 17 && e.altKey) || (e.keyCode == 38 && (e.ctrlKey || e.altKey))){
			e.preventDefault();
			return;
		}*/
		
		if(e.keyCode == 91){
			e.preventDefault();
			return;
		}

		if(e.keyCode == 16 ){
			var that = this;
			that.e = e;
			if( typeof this.shiftTimeoutID != 'undefined' && this.shiftTimeoutID != 0){
				//console.log("***** handleKey clear shift timeout");
				clearTimeout(this.shiftTimeoutID);
				this.shiftTimeoutID = 0;
			}
			if(e.type == 'keydown'){
				this.shiftTimeoutID = setTimeout(function(e){
					//console.log("***** handleKey exc shift keyup timeout");
					that.e.data[0].stuckKeysHandler.releaseKeyPressed(16);
					//that.e.data[0].generateEvent.call(that.e.data[0], that.e.type, [that.e]);
					that.shiftTimeoutID = 0;
				}, 2000);	
				//console.log("***** handleKey set shift keyup timeout");
			}
			
		}
		
		if(e.keyCode == 17 ){
			var that = this;
			that.e = e;
			if( typeof this.ctrlTimeoutID != 'undefined' && this.ctrlTimeoutID != 0){
				//console.log("***** handleKey clear ctrlTimeoutID");
				clearTimeout(this.ctrlTimeoutID);
				this.ctrlTimeoutID = 0;
			}
			if( e.type == 'keydown'){
				this.ctrlTimeoutID = setTimeout(function(e){
					//console.log("***** handleKey exc ctrl timeout handler");
					that.e.data[0].stuckKeysHandler.releaseKeyPressed(17);
					//that.e.data[0].generateEvent.call(that.e.data[0], that.e.type, [that.e]);
					that.ctrlTimeoutID = 0;
				}, 2000);
				//console.log("***** handleKey set ctrl keyup timeout");	
			}
		}

		if(e.keyCode == 18 ){
			var that = this;
			that.e = e;
			if( typeof this.altTimeoutID != 'undefined' && this.altTimeoutID != 0){
				//console.log("***** handleKey clear altTimeoutID");
				clearTimeout(this.altTimeoutID);
				this.altTimeoutID = 0;
			}
			if( e.type == 'keydown'){
				this.altTimeoutID = setTimeout(function(e){
					//console.log("***** handleKey exc alt timeout handler");
					that.e.data[0].stuckKeysHandler.releaseKeyPressed(18);
					//that.e.data[0].generateEvent.call(that.e.data[0], that.e.type, [that.e]);
					that.altTimeoutID = 0;
				}, 2000);
				//console.log("***** handleKey set alt keyup timeout");	
			}
		}

		document.getElementById("inputmanager").focus();
		e.data[0].generateEvent.call(e.data[0], e.type, [e]);

		if ((e.ctrlKey && !e.altKey) ||
		    (wdi.Keymap.isInKeymap(e.keyCode) && e.type !== "keypress")) {
			e.preventDefault();
		}
		//e.data[0].stuckKeysHandler.handleStuckKeys(e);
	},

	setClientOffset: function(x, y) {
		this.clientOffsetX = x;
		this.clientOffsetY = y;
	},

	setClipBoardData: function(data) {
		//we have received new clipboard data
		//show to the user
		//TODO: create a new dialog with buttons to copy the data directly
		//from the textbox
		prompt("New clipboard data available, press ctrl+c to copy it", data);
	},

	initSound: function() {
		var self = this;
//		if (!Modernizr.touch) {
			this.soundStarted = true;
			window.setTimeout(function() {
				self.fire('startAudio');
			}, 100);
/*		} else {
			var $button = $('<button>Start</button>', {id: "startAudio"}).css({
				padding: "10px 25px",
				fontSize: "25px",
				fontFamily: "Verdana",
				cursor: "pointer",
				margin: "0 auto"
			}).click(function() {
					self.soundStarted = true;
					self.fire('startAudio');
					$('#soundButtonContainer').remove();
				});

			var $messageContainer = $('<div id="messageContainer"><p>Click to start using your virtual session:</p></div>').css({
				color: "white",
				textAlign: "center",
				fontSize: "25px",
				fontFamily: "Verdana",
				marginTop: "75px"
			});

			var $container = $('<div></div>', {id: "soundButtonContainer"});

			$button.appendTo($messageContainer);
			$messageContainer.appendTo($container);
			$container.appendTo('body');

			$container.css({
				position: 'absolute',
				zIndex: 999999999,
				top: 0,
				left: 0,
				width: "100%",
				height: document.height,
				backgroundColor: "black"
			});
		}*/
	}

});
