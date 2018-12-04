


wdi.TimeLapseDetector = $.spcExtend(wdi.EventObject.prototype, {
	lastTime: null,

	init: function timeLapseDetector_Init (c) {
		this.superInit();
	},

	startTimer: function timeLapseDetector_startTimer () {
		var self = this;
		this.lastTime = Date.now();

		window.setInterval(
			function timeLapseDetectorInterval () {
				var now = Date.now();
				// this.constructor == access to the class itself, so you
				// can access to static properties without writing/knowing
				// the class name
				var elapsed = now - self.lastTime;
				if (elapsed >= self.constructor.maxIntervalAllowed) {
					self.fire('timeLapseDetected', elapsed);
				}
				self.lastTime = now;
			},
			wdi.TimeLapseDetector.defaultInterval
		);
	},

	getLastTime: function timeLapseDetector_getLastTime () {
		return this.lastTime;
	},

	setLastTime: function timeLapseDetector_setLastTime (lastTime) {
		this.lastTime = lastTime;
		return this;
	}
});

wdi.TimeLapseDetector.defaultInterval = 5000;
wdi.TimeLapseDetector.maxIntervalAllowed = wdi.TimeLapseDetector.defaultInterval * 3;
