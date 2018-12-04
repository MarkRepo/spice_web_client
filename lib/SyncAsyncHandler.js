

wdi.SyncAsyncHandler = $.spcExtend(wdi.EventObject.prototype, {
	init: function (c) {
		this.isAsync = !!c.isAsync;
		if (this.isAsync) {
			this.asyncWorker = c.asyncWorker || new wdi.AsyncWorker({script:'application/WorkerProcess.js'});
		}
	},

	isAsync: null,

	dispatch: function(buffer, callback, scope) {
		if (this.isAsync) {
			this.asyncWorker.run(buffer, callback, scope);
		} else {
			var result = window['workerDispatch'](buffer, this.isAsync);
			callback.call(scope, result);
		}
	},

	dispose: function () {
		if (this.isAsync) {
			this.asyncWorker.dispose();
		}
	}
});
