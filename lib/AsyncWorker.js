
wdi.AsyncWorker = $.spcExtend(wdi.EventObject.prototype, {
	worker: null,
	fn: null,
	scope: null,
    params: null,
    
	init: function(c) {
		this.superInit();
		this.worker = new Worker(c.script);
		var self = this;
		this.worker.addEventListener("message", function (oEvent) {
			self.fn.call(self.scope, oEvent.data, self.params);
		});
	},

	run: function(data, fn, params, scope) {
		this.fn = fn;
		this.scope = scope;
        this.params = params;

		if (wdi.postMessageW3CCompilant) {
			this.worker.postMessage(data, [data]);
		} else {
			this.worker.postMessage(data);
		}
	},

	dispose: function () {
		this.worker.terminate();
	}
});
