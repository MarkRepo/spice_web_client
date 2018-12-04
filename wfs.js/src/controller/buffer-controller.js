/*
 * Buffer Controller
*/

import Event from '../events';
import EventHandler from '../event-handler';
import {ErrorTypes, ErrorDetails} from '../errors';
 
class BufferController extends EventHandler {

  constructor(wfs) {
    super(wfs,
      Event.MEDIA_ATTACHING,
      Event.BUFFER_APPENDING,
      Event.BUFFER_RESET
    );
    
    this.mediaSource = null;
    this.media = null;
    this.pendingTracks = {};
    this.sourceBuffer = {};
    this.segments = [];
    this.playedEnd = 0;
    this.cacheEnd = 0;
    this.bufferedStart = 0;
 
    this.appended = 0;
    this.onSBUpdateCount = 0;
    this._msDuration = null;

    // Source Buffer listeners
    this.onsbue = this.onSBUpdateEnd.bind(this);

    this.browserType = 0;
    if (navigator.userAgent.toLowerCase().indexOf('firefox') !== -1){
      this.browserType = 1;
    }
    this.mediaType = 'H264Raw';

    this.websocketName = undefined; 
    this.channelName = undefined;
    this.isAddedSB = false;
    this.isOpenedMS = false;
  }

  destroy() {
    EventHandler.prototype.destroy.call(this);
  }
 
  onMediaAttaching(data) {
    let media = this.media = data.media;
    this.mediaType = data.mediaType;
    this.websocketName = data.websocketName;
    this.channelName = data.channelName;
    if (media) {
      // setup the media source
      var ms = this.mediaSource = new MediaSource();
      //Media Source listeners
      this.onmso = this.onMediaSourceOpen.bind(this);
      this.onmse = this.onMediaSourceEnded.bind(this);
      this.onmsc = this.onMediaSourceClose.bind(this);
      ms.addEventListener('sourceopen', this.onmso);
      ms.addEventListener('sourceended', this.onmse);
      ms.addEventListener('sourceclose', this.onmsc);
      // link video and media Source
      media.src = URL.createObjectURL(ms);
    }
  }

  onMediaDetaching() {
 
  }
   
  onBufferAppending(data) { 
    if (!this.segments) {
      this.segments = [ data ];
    } else {
      this.segments.push(data); 
    }
    this.doAppending(); 
  }
  
  onMediaSourceClose() {
    //console.log('media source closed');
  }

  onMediaSourceEnded() {
    //console.log('media source ended');
  }

  onSBUpdateEnd(event) { 
    if(window.isResolutionChange || !this.isAddedSB){
	this.appending = false;
	return;
    }
    // Firefox
    /*if (this.browserType === 1){
      this.mediaSource.endOfStream();
      this.media.play();  
    }*/
    this.onSBUpdateCount++;
    //console.log("onSBUpdateEnd, onSBUpdateCount: " + this.onSBUpdateCount);
    var remove_start = 0;
    var remove_end   = 0;
    this.appending = false;
    var sourceBuffer = this.sourceBuffer['video'];
    var buffered = sourceBuffer.buffered;
    var played   = this.media.played;
    for(var j = 0; j < played.length; j++){
	      ////console.log("played start: " + played.start(j) );
        this.playedEnd = played.end(j);
	      //console.log("played end: " + played.end(j) );
	      remove_end = played.end(j);
    }
    if(buffered.length >= 2){
        this.segments = [];
        //console.log('buffered length is not one, reninit mediaSource, length: ' + buffered.length);
        var video1 = document.getElementById('video1');
        window.wfs = new Wfs();
        window.wfs.attachMedia(video1, 'ch1');
        window.isResolutionChange = true;
        app.sendCommand("getIDR");
        return;
    }
    for(var i=0; i< buffered.length; i++){
	      ////console.log("start: " + buffered.start(i) );
	      //console.log("end: " + buffered.end(i));
        this.cacheEnd = buffered.end(i);
	      remove_start = buffered.start(i);
    }

    /*
    if(this.playedEnd > this.cacheEnd){
        //console.log("play currentTime is big than cacheEnd");
        this.media.currentTime = 0;
    }*/
/*
    var seekable = this.media.seekable;
    for(var k=0; k<seekable.length; k++){
	//console.log("seekable start:  " + seekable.start(k));
	//console.log("seekable end  :  " + seekable.end(k));
	//this.media.currentTime = seekable.end(k);
    }
*/
    // visibilityChange , clear buffer
    if(remove_end !== 0 && remove_start !== 0 && remove_end - remove_start > 10){
        sourceBuffer.remove(remove_start, remove_end);
    }
    else{
/*
	if(window.isResolutionChange && buffered.length){
		//console.log("remove buffer");
		sourceBuffer.remove(buffered.start(0), buffered.end(0));
	}
	else
*/
		//if(!window.isResolutionChange)
    			this.doAppending();
    }
  }
 
  updateMediaElementDuration() {
  
  }

  onMediaSourceOpen() { 
    this.isOpenedMS = true;
    //console.log("media source open");
    let mediaSource = this.mediaSource;
    if (mediaSource) {
      // once received, don't listen anymore to sourceopen event
      mediaSource.removeEventListener('sourceopen', this.onmso);
    }

    if (this.mediaType === 'FMp4'){ 
      this.checkPendingTracks();
    }
    //console.log("sourceopen doAppending");
    this.doAppending();

    //this.wfs.trigger(Event.MEDIA_ATTACHED, {media:this.media, channelName:this.channelName, mediaType: this.mediaType, websocketName:this.websocketName});
  }

  checkPendingTracks() {  
    this.createSourceBuffers({ tracks : 'video' , mimeType:'' } );
    this.pendingTracks = {};  
  }

  onBufferReset(data) { 
    if (this.mediaType === 'H264Raw'){ 
      //console.log("onBufferReset");
      this.createSourceBuffers({ tracks : 'video' , mimeType: data.mimeType } );
    }
  }
 
  createSourceBuffers(tracks) {
    var sourceBuffer = this.sourceBuffer,mediaSource = this.mediaSource;
    let mimeType;
    if (tracks.mimeType === ''){
      mimeType = 'video/mp4;codecs=avc1.420028'; // avc1.42c01f avc1.42801e avc1.640028 avc1.420028
    }else{
      mimeType = 'video/mp4;codecs=' + tracks.mimeType;
    }
    this.mimeType = mimeType;
 
    try {
    	if(this.isOpenedMS){
          		let sb = sourceBuffer['video'] = mediaSource.addSourceBuffer(mimeType);
          		sb.addEventListener('updateend', this.onsbue);
    		      this.isAddedSB = true;
              //console.log("addSourceBuffer");
    	}
    } catch(err) {
    	//console.log("CreateSourceBuffer: " + err);
    	this.isAddedSB = false;
    }
        this.wfs.trigger(Event.BUFFER_CREATED, { tracks : tracks } );
        var that = this;

    var playErrFunc = function(e){
        var playPromiseNew = that.media.play();
        if(playPromiseNew !== undefined){
            playPromiseNew.then(_ => {
              if(e == 1){
                //console.log("set media currentTime 0");
                that.media.currentTime = 0;
              }
              //console.log("media play success");
            })
            .catch(error => {
              //console.log("media play failed");
              playErrFunc(e);
            });
        }
    };
    playErrFunc(1); 
    this.media.addEventListener("pause", function(){
          if(document.visibilityState != 'hidden'){
            //console.log("media pause, try play again");
            playErrFunc(2);
          }
        }, false);
    
    this.media.addEventListener("timeupdate", function(){
      //console.log("timeupdate!");
    }, false);
  }

  doAppending() {
    var wfs = this.wfs, sourceBuffer = this.sourceBuffer, segments = this.segments, mediaSource = this.mediaSource;
    if(!this.isAddedSB){
	if(this.isOpenedMS && this.mimeType){
		try{
      			let sb = sourceBuffer['video'] = mediaSource.addSourceBuffer(this.mimeType);
      			sb.addEventListener('updateend', this.onsbue);
			      this.isAddedSB = true;
            //console.log("addSourceBuffer");
		}
		catch(err){
			//console.log("doAppending: " + err);
			this.isAddedSB = false;
		}
	}
	else
	    return;
    }
    if (Object.keys(sourceBuffer).length) {
       
      if (this.media.error) {
        this.segments = [];
        //console.log('trying to append although a media error occured, flush segment and abort');
        //console.log("append error, reinit mediaSource");
        var video1 = document.getElementById('video1');
        window.wfs = new Wfs();
        window.wfs.attachMedia(video1, 'ch1');
        window.isResolutionChange = true;
        app.sendCommand("getIDR");
        return;
      }
      if (this.appending || (!this.isAddedSB)) { 
        return;
      }
/*
      if(window.isResolutionChange){
	segments = this.segments = [];
      }
*/         
      if (segments && segments.length) { 
        var segment = segments.shift();
	////console.log("segments len: " + segments.length + " segment len: " + segment.data.length);
        try {
          if(sourceBuffer[segment.type]) { 
            this.parent = segment.parent;
            sourceBuffer[segment.type].appendBuffer(segment.data);
            this.appendError = 0;
            this.appended++;
            this.appending = true;
	    //console.log("appendBuffer, appended: " + this.appended);
          } else {
  
          }
        } catch(err) {
          // in case any error occured while appending, put back segment in segments table 
	  //console.log("appending error, code: " + err.code);
          segments.unshift(segment);
          var event = {type: ErrorTypes.MEDIA_ERROR};
          if(err.code !== 22) {
            if (this.appendError) {
              this.appendError++;
            } else {
              this.appendError = 1;
            }
            event.details = ErrorDetails.BUFFER_APPEND_ERROR;
            event.frag = this.fragCurrent;   
            if (this.appendError > wfs.config.appendErrorMaxRetry) { 
              segments = [];
              event.fatal = true; 
              //console.log("append error happend more than max retry count , reinit mediaSource");   
              var video1 = document.getElementById('video1');
              window.wfs = new Wfs();
              window.wfs.attachMedia(video1, 'ch1');
              window.isResolutionChange = true;
              app.sendCommand("getIDR");
              return;
            } else {
              event.fatal = false; 
            }
          } else { 
            this.segments = [];
            event.details = ErrorDetails.BUFFER_FULL_ERROR; 
            return;
          } 
        }
        
      }
    }
  }
 
}

export default BufferController;
