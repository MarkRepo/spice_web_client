// 判断各种浏览器，找到全屏的正确方法			
function launchFullscreen(element) {
 	if(element.requestFullscreen) {
  		element.requestFullscreen();
 	} else if(element.mozRequestFullScreen) {
  		element.mozRequestFullScreen();
 	} else if(element.webkitRequestFullscreen) {
  		element.webkitRequestFullscreen();
 	} else if(element.msRequestFullscreen) {
  		element.msRequestFullscreen();
 	}
 	var width = window.screen.width;
 	var height = window.screen.height;
 	var desktop = JSON.parse(localStorage.getItem("desktop"));
 	if(desktop.ostype.indexOf("win10") != -1 || desktop.ostype.indexOf("win8") != -1){
		if(width < 1024)
			width = 1024;
		if(height < 768)
			height = 768;
	}
	else{
		if(width < 800)
			width = 800;
		if(height < 600)
			height = 600;
	}
	$("#fullscreen").html(gettext("ExitFullScreen"));
	//console.log("fullscreen change, cur_width: " + width + ", cur_height: " + height);
	//window.isResolutionChange = true;
	app.sendCommand('setResolution', {
		'width':  width,
		'height': height
	});
	//app.sendCommand('getIDR');
};

// 判断浏览器种类，找出退出全屏的方法
function exitFullscreen() {
	if(document.exitFullscreen) {
	  	document.exitFullscreen();
	} else if(document.mozCancelFullScreen) {
	  	document.mozCancelFullScreen();
	} else if(document.webkitExitFullscreen) {
	  	document.webkitExitFullscreen();
	}
	$("#fullscreen").html(gettext("FullScreen"));
};

function getURLParameter (name) {
	return decodeURIComponent(
		(new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)')
			.exec(location.search) || [, ""])[1]
			.replace(/\+/g, '%20')
	) || null;
}


wdi.Debug.debug = false; //enable logging to javascript console
wdi.exceptionHandling = false; //disable "global try catch" to improve debugging
//if enabled, console errors do not include line numbers
//wdi.SeamlessIntegration = false; //enable window integration. (if disabled, full desktop is received)

wdi.IntegrationBenchmarkEnabled = false;// MS Excel loading time benchmark
wdi.isReady = false;

function start () {
	var testSessionStarted = false;

	$('#getStats').click(function() {
		if (!testSessionStarted) {
			testSessionStarted = true;
			alert("Starting test session");
			wdi.DataLogger.startTestSession();
		} else {
			wdi.DataLogger.stopTestSession();
			testSessionStarted = false;
			var stats = wdi.DataLogger.getStats();
			//console.log(stats);
			alert(stats);
		}
	});

	wdi.graphicDebug = new wdi.GraphicDebug({debugMode: false});
	app = new Application();

	window.vdiLoadTest = getURLParameter('vdiLoadTest') || false;
	var performanceTest = getURLParameter('performanceTest') || false;

	var f = function (action, params) {
		if (action == 'windowClosed') {
			$(params.canvas).remove();
			$(params.eventLayer).remove();
		} else if (action == 'windowMoved') {
			$(params.canvas).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
			$(params.eventLayer).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
		} else if (action == 'init' || action == 'windowCreated') {
			var item = null;
			var canvas = null;
			var eventlayer = null;
			var body = $('body');

			for (var i in params) {
				item = params[i];
				var position = item.position * 2;
				canvas = $(item.canvas).css({
					'zIndex': 10000 - position - 1,
					'position': 'absolute',
					'top': item.info.top + 'px',
					'left': item.info.left + 'px'
				});
				eventlayer = $(item.eventLayer).css({
					'top': item.info.top + 'px',
					'left': item.info.left + 'px',
					'zIndex': 10000 - position
				})
				body.append(canvas);
				body.append(eventlayer);
			}
		} else if (action == 'ready') {
			wdi.isReady = true;
			var desktop = JSON.parse(localStorage.getItem("desktop"));
			if(desktop.firstTime >= 1){
				var width = window.screen.width;
				var height = window.screen.height;
				if(desktop.ostype.indexOf("win10") != -1 || desktop.ostype.indexOf("win8") != -1){
					if(width < 1024)
						width = 1024;
					if(height < 768)
						height = 768;
				}
				else{
					if(width < 800)
						width = 800;
					if(height < 600)
						height = 600;
				}
				
				desktop.firstTime = desktop.firstTime + 1;
				localStorage.setItem("desktop",JSON.stringify(desktop));
				app.sendCommand('setResolution', {
					'width': width,
					'height': height
				});
			}
		} else if (action == 'resolution') {
		/*	app.sendCommand('setResolution',{
				'width': params[0],
				'height': params[1]
			});
			//console.log("send setResolution command to sever");	
		*/
		
		} else if (action == 'windowMinimized') {
			//in eyeos, this should minimize the window, not close it
			$(params.canvas).css({'display': 'none'});
			$(params.eventLayer).css({'display': 'none'});
		} else if (action == 'windowMaximized') {
			$(params.canvas).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
			$(params.eventLayer).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
		} else if (action == 'windowRestored') {
			//in eyeos, this should restore the window
			$(params.canvas).css({'display': 'block'});
			$(params.eventLayer).css({'display': 'block'});
			$(params.canvas).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
			$(params.eventLayer).css({
				'top': params.info.top + 'px',
				'left': params.info.left + 'px'
			});
		} else if (action == 'windowFocused') {
			//debugger; //eyeos should move the window to front!
		} else if (action == 'timeLapseDetected') {
			wdi.Debug.log('Detected time lapse of ', params, 'seconds');
		} else if (action == 'error') {
			closeSession();
		} else if ("checkResults") {
			var cnv = $('#canvas_0')[0];
			var ctx = cnv.getContext('2d');
			var currentImgData = ctx.getImageData(0, 0, cnv.width, cnv.height);
			var currArr = new Uint32Array(currentImgData.data.buffer);
			var firstArr = new Uint32Array(firstImageData);

			var errors = 0;
			var l = firstArr.length;
			do {
				if (firstArr[l] !== currArr[l] ) {
					errors++;
					//console.log("FAIL!!!!!!!!!!!!!", l , ~~(l/1920), l%1920, parseInt(firstArr[l]).toString(2), parseInt(currArr[l]).toString(2));
					currArr[l] = (255 << 24) | 255; //RED
				}
			} while (l--);

			ctx.putImageData(currentImgData, 0, 0);

			var msg = 'Test finished: ' + errors + ' error found';
			if (errors) {
				console.error(msg);
			} else {
				//console.log(msg);
			}
		}
	};
/*
	$(window)['resize'](function () {

		if(typeof(width) == "undefined")
			width = 0;
		if(typeof(height) == "undefined")
			height = 0;
		var cur_width  = window.innerWidth;
		var cur_height = window.innerHeight;
		var eventLayer = document.getElementById('eventLayer');
		
		if(cur_width === window.screen.width && cur_height === window.screen.height ){

			var desktop = JSON.parse(localStorage.getItem("desktop"));
			if(desktop.ostype.indexOf("win10") != -1 || desktop.ostype.indexOf("win8") != -1){
				if(cur_width < 1024)
					cur_width = 1024;
				if(cur_height < 768)
					cur_height = 768;
			}
			else{
				if(cur_width < 800)
					cur_width = 800;
				if(cur_height < 600)
					cur_height = 600;
			}

			$("#fullscreen").html(gettext("ExitFullScreen"));
			if ( wdi.isReady && (cur_height != eventLayer.height || cur_width != eventLayer.width) ) {
				//console.log("fullscreen change, cur_width: " + cur_width + ", cur_height: " + cur_height + ", video clientWidth: " + eventLayer.width + ", video clientHeight: " + eventLayer.height);
				window.isResolutionChange = true;
				app.sendCommand('setResolution', {
					'width': cur_width,
					'height':cur_height
				});
				app.sendCommand('getIDR');
			}	
		}
		if(width === window.screen.width && height === window.screen.height){
			$("#fullscreen").html(gettext("FullScreen"));
		}

		width = cur_width;
		height = cur_height;
	});
*/

	$("#UIStretch").click(function(){
		var desktop = JSON.parse(localStorage.getItem("desktop"));
		var width  = window.innerWidth;
		var height = window.innerHeight;
		//var width = $(window).width();
		//var height = $(window).height();
		if(desktop.ostype.indexOf("win10") != -1 || desktop.ostype.indexOf("win8") != -1){
			if(width < 1024)
				width = 1024;
			if(height < 768)
				height = 768;
		}
		else{
			if(width < 800)
				width = 800;
			if(height < 600)
				height = 600;
		}
		var evtLayer = document.getElementById('eventLayer');
		if( wdi.isReady && (width != evtLayer.width || height != evtLayer.height) ){
			//window.isResolutionChange = true;			
			app.sendCommand('setResolution',{
				'width': width,
				'height': height
			});
			//app.sendCommand('getIDR');
		}
	});

	var useWorkers = true;

	if (performanceTest) {
		useWorkers = false;
		jQuery.getScript("performanceTests/lib/iopacketfactory.js");
		jQuery.getScript("performanceTests/lib/testlauncher.js");
		jQuery.getScript("performanceTests/tests/wordscroll.js");
	}

	var data = read_cookie("token");
	//console.log(data);
	data = JSON.parse(data) || {};
	var desktop = JSON.parse(localStorage.getItem("desktop"));
	if(desktop == null){
		location.href = "../login.html";
	}
	if(desktop.websockifyport==-1){
		localStorage.setItem("noPort","yes");
		location.href="../cloudDesktop.html";
	}if(desktop.websockifyport==-2){
		localStorage.setItem("noRecord","yes");
		location.href="../cloudDesktop.html";
	}else{
		localStorage.removeItem("noPort");
	};
	//var desktop = JSON.parse($.cookie("desktop"));
	//var listen_port = desktop.websockifyport;
	/*if(desktop.name == "win7001"){
		listen_port = 46054;
	} else if (desktop.name == "win7004") {
		listen_port = 46055;
	} else if(desktop.name == "win7002"){
		listen_port = 46056;
	}*/
	app.run({
		'callback': f,
		'context': this,
		//'host': data['spice_address'] || '',
		//'port': data['spice_port'] || 0,
		'host': desktop.server,
		//'port': desktop.port,
		'port': desktop.websockifyport,
		'protocol': getURLParameter('protocol') || 'ws',
		'token': data['spice_password'] || '',
		'vmHost': getURLParameter('vmhost') || false,
		'vmPort': getURLParameter('vmport') || false,
		'useBus': false,
		'busHost': '10.11.12.200',
		'busPort': 61613,
		'busSubscriptions': ['/topic/00000000-0000-0000-0000-000000000000'],
		'busUser': '00000000-0000-0000-0000-000000000000',
		'busPass': 'potato',
        // Connection Control
		'connectionControl': false,
        'heartbeatToken': 'heartbeat',
		'heartbeatTimeout': 4000,//miliseconds
		//'busFileServerBaseUrl': 'https://10.11.12.200/fileserver/',
		'busFileServerBaseUrl': 'https://192.168.2.51/fileserver/',
		'layout': data['layout'] || 'us',
		'clientOffset': {
			'x': 0,
			'y': 0
		},
		'useWorkers': useWorkers,
		'seamlessDesktopIntegration': false,
		'externalClipboardHandling': false,
		'disableClipboard': true,
		'layer': document.getElementById('testVdi'),
		'vmInfoToken': getURLParameter('vmInfoToken'),
		'canvasMargin': {
			'x': 0,
			'y': 40
		},
		//'language': navigator.language
	});
}

function startBenchmark () {
	$('#launchWordButton').text('Benchmarking...').prop('disabled', true);
	wdi.IntegrationBenchmark.launchApp(app.busConnection, function (elapsed) {
		$('#launchWordButton').remove();
		$('#integrationBenchmark').append('<div class="result">Total: ' + elapsed + ' ms</div>');
	});
}

function closeIntegrationBenchmark () {
	$('#integrationBenchmark').hide();
}

$(document).ready(start);
