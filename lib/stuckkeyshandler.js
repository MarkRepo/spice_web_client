wdi.StuckKeysHandler = $.spcExtend(wdi.EventObject.prototype, {
	ctrlTimeoutId: null,
	altTimeoutId: null,
	shiftTimeoutId: null,
	shiftKeyPressed: false,
	ctrlKeyPressed: false,
	altKeyPressed: false,

	handleStuckKeys: function (jqueryEvent) {
		if (jqueryEvent) {
			switch (jqueryEvent.keyCode) {
				case 16:
					this._handleKey('shiftTimeoutId', jqueryEvent.type, 16);
					break;
				case 17:
					this._handleKey('ctrlTimeoutId', jqueryEvent.type, 17);
					break;
				case 18:
					this._handleKey('altTimeoutId', jqueryEvent.type, 18);
					break;
			}
		}
	},

	releaseAllKeys: function releaseAllKeys () {
		var e;
		var i;
		for (i = 0; i < 300; i++) {
			if(i == 32){
				continue;
			}
			this.releaseKeyPressed(i);
		}
	},

	_handleKey: function (variable, type, keyCode) {
		if (type === 'keydown') {
			this[variable] = this._configureTimeout(keyCode);
		} else if (type === 'keyup') {
			clearTimeout(this[variable]);
		}
	},

	_configureTimeout: function (keyCode) {
		var self = this;
		return setTimeout(function keyPressedTimeout () {
			// added the 'window' for the jQuery call for testing.
			self.releaseKeyPressed(keyCode);
		}, wdi.StuckKeysHandler.defaultTimeout);
	},

	releaseKeyPressed: function (keyCode) {
		var e = window.jQuery.Event("keyup");
		e["which"] = keyCode;
		e["keyCode"] = keyCode;
		e["charCode"] = 0;
		e["generated"] = true;
		
		if(keyCode == 16){
			this.shiftKeyPressed = false;
		}else if(keyCode == 17){
			this.ctrlKeyPressed = false;
		}else if(keyCode == 18){
			this.altKeyPressed = false;
		}

		this.fire('inputStuck', ['keyup', [e]]);
	},

	checkSpecialKey: function (event, keyCode) {
		switch (keyCode) {
			case 16:
				this.shiftKeyPressed = event === 'keydown';
				break;
			case 17:
				this.ctrlKeyPressed = event === 'keydown';
				break;
			case 18:
				this.altKeyPressed = event === 'keydown';
				break;
		}
		//if(this.shiftKeyPressed)
			//console.log("***** checkSpecialKey shiftKeyPressed");
		//if(this.ctrlKeyPressed)
			//console.log("***** checkSpecialKey ctrlKeyPressed");
		//if(this.altKeyPressed)
			//console.log("***** checkSpecialKey altKeyPressed");
	},

	releaseSpecialKeysPressed: function () {
		if (this.shiftKeyPressed) {
			this.releaseKeyPressed(16);
			this.shiftKeyPressed = false;
		}
		if (this.ctrlKeyPressed) {
			this.releaseKeyPressed(17);
			this.ctrlKeyPressed = false;
		}
		if (this.altKeyPressed) {
			this.releaseKeyPressed(18);
			this.altKeyPressed = false;
		}
	}


});

wdi.StuckKeysHandler.defaultTimeout = 2000;
