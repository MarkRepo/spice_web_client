

wdi.RunQueue = $.spcExtend(wdi.DomainObject, {
	tasks: null,
	isRunning: false,
	
	init: function() {
		this.tasks = [];
	},
	
	getTasksLength: function() {
		return this.tasks.length;
	},
	
	add: function(fn, scope, endCallback, params) {
		this.tasks.push({
			fn: fn,
			scope: scope,
            fnFinish: endCallback,
            params: params
		});
		
		return this;
	},
	
	clear: function() {
		this.tasks = [];
		
		return this;
	},
	
	_process: function() {
		wdi.ExecutionControl.sync = true;
		var proxy, self = this;
		this.isRunning = true;
		var task = this.tasks.shift();
		
		if (!task) {
			this.isRunning = false;
			return;
		}
		
		proxy = {
			end: function() {
                if(task.fnFinish) {
                    task.fnFinish.call(task.scope);
                }
				self._process();
			}
		};

		try {
			task.fn.call(task.scope, proxy, task.params);
		} catch(e) {
			wdi.Debug.error(e.message);
			proxy.end();
		}
		
		return this;
	},

	process: function() {
		if (!this.isRunning) {
			this._process();
		} else {
			return;
		}
	}
});

//wdi.ExecutionControl = $.spcExtend(wdi.DomainObject, {
//	currentProxy: null,
//	sync: true,
//	runQ: null,
//	init: function(c) {
//		this.runQ = c.runQ || new wdi.RunQueue(); 
//	}
//});

//TODO: make an instance of it on each channel
wdi.ExecutionControl = {
	currentProxy: null,
	sync: true,
	runQ: new wdi.RunQueue()
};
