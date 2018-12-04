
wdi.IntegrationBenchmark = {
    benchmarking: false,
	startTime: 0,
    timeoutInterval: 3000,  // in ms, amount of time after it will be considered that
                            // we have received all packets and can stop counting
    timeOutId: undefined,

    busConnection: undefined,

    setEndTime: function() {
        var self = this;
        this.timeOutId = setTimeout(function() {
            // if 3000 ms have passed since the last packet we assume we have processed them all and can launch MS Word
            self.timeOutId = undefined;
            self.benchmarking = false;
            var now = new Date().getTime();
            var elapsed = now - self.startTime - self.timeoutInterval;
            self.onEndBenchmarkCallback(elapsed);
            var message = {
                "type": wdi.BUS_TYPES.killApplicationDoNotUseInProductionEver,
                "application": "EXCEL.EXE"
            };
            self.busConnection.send(message);
        }, this.timeoutInterval);
    },

    setStartTime: function() {
        if (this.timeOutId !== undefined) {
            clearTimeout(this.timeOutId);
        }
    },

    launchApp: function(busConnection, onEndBenchmarkCallback) {
        this.busConnection = busConnection;
        wdi.IntegrationBenchmark.benchmarking = true;
        wdi.IntegrationBenchmark.setStartTime();
        this.onEndBenchmarkCallback = onEndBenchmarkCallback;
        this.startTime = new Date().getTime();
        var message = {
            "type": wdi.BUS_TYPES.launchApplication,
            "file": "c:\\Users\\eyeos\\Desktop\\test.xlsx"
        };
        this.busConnection.send(message);
    }
};
