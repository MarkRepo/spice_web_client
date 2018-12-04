wdi.InputManager = $.spcExtend(wdi.EventObject.prototype, {

	checkFocus: false,
	input: null,
	window: null,
	stuckKeysHandler: null,

	init: function (c) {
		this.superInit();
		this.input = c.input;
		this.window = c.window;
		this.stuckKeysHandler = c.stuckKeysHandler;
		this.$ = c.jQuery || $;
		if (!c.disableInput) {
			this.inputElement = this.$('<div style="position:absolute"><input type="text" id="inputmanager" style="opacity:0;color:transparent"/></div>');
			//this.inputElement = this.$('<div style="position:absolute"><input type="text" id="inputmanager" /></div>');
		}
		this.currentWindow = null;
	},

	setCurrentWindow: function(wnd) {
		wnd = this.$(wnd);
		if(this.currentWindow) {
			this.inputElement.remove();
			//remove listeners
			this.currentWindow.unbind('blur');
		}
		this.$(wnd[0].document.body).prepend(this.inputElement);
		this.input = this.$(wnd[0].document.getElementById('inputmanager'));
		//TODO: remove events from the other window
		this.addListeners(wnd);
		this.currentWindow = wnd;
	},

	addListeners: function (wnd) {
		this._onBlur(wnd);
		this._onInput();
	},

	_onBlur: function (wnd) {
		var self = this;
		wnd.on('blur', function onBlur (e) {
			if (self.checkFocus) {
				self.input.focus();
			}
			self.stuckKeysHandler.releaseSpecialKeysPressed();
		});
	},

	_onInput: function () {
		var self = this;
		this.input.on('input', function input (e) {
			// ctrl-v issue related
			var aux = self.input.val();
			if (aux.length > 1) {
				self.reset();
			}
		});
	},

	enable: function () {
		this.checkFocus = true;
		this.input.select();
	},

	disable: function () {
		this.checkFocus = false;
		this.input.blur();
	},

	reset: function () {
		this.input.val("");
	},

	getValue: function () {
		var val = this.input.val();
		if (val) {
			//console.log("***** getvalue va: " + val + " and reset! ");
			this.reset();
		}
		return val;
	},

	manageChar: function (val, params) {
		var res = [Object.create(params[0])];
		res[0]['type'] = 'inputmanager';
		res[0]['charCode'] = val.charCodeAt(0);
		return res;
	}

});
