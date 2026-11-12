// Advanced Screen & Window Sharing Module
class ScreenShareManager {
  constructor() {
    this.screenStream = null;
    this.isSharing = false;
    this.includeAudio = true;
    this.qualityPreset = '1080p60'; // '1080p60', '1080p30', '720p60', '720p30', 'source'
    
    // Callbacks
    this.onStreamStarted = null;
    this.onStreamEnded = null;
    this.onError = null;
  }

  getConstraints() {
    const presets = {
      '1080p60': {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60, max: 60 }
      },
      '1080p30': {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      '720p60': {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 60, max: 60 }
      },
      '720p30': {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      'source': {
        frameRate: { ideal: 60 }
      }
    };

    const videoConstraints = presets[this.qualityPreset] || presets['1080p60'];

    return {
      video: {
        ...videoConstraints,
        cursor: 'always'
      },
      audio: this.includeAudio ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2 // Stereo sound for games!
      } : false
    };
  }

  async startShare(options = {}) {
    if (options.quality) this.qualityPreset = options.quality;
    if (options.includeAudio !== undefined) this.includeAudio = options.includeAudio;

    const constraints = this.getConstraints();

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
      this.isSharing = true;

      const videoTrack = this.screenStream.getVideoTracks()[0];
      const audioTrack = this.screenStream.getAudioTracks()[0];

      // Handle when user clicks the browser native "Paylaşımı Durdur" (Stop Sharing) button
      videoTrack.onended = () => {
        this.stopShare();
      };

      if (this.onStreamStarted) {
        this.onStreamStarted(this.screenStream, {
          hasAudio: !!audioTrack,
          quality: this.qualityPreset
        });
      }

      return this.screenStream;
    } catch (err) {
      this.isSharing = false;
      if (err.name !== 'NotAllowedError') { // Don't report cancellation as critical error
        console.error('[ScreenShare] Paylaşım başlatılamadı:', err);
      }
      if (this.onError) {
        this.onError(err);
      }
      throw err;
    }
  }

  stopShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.screenStream = null;
    }

    if (this.isSharing) {
      this.isSharing = false;
      if (this.onStreamEnded) {
        this.onStreamEnded();
      }
    }
  }

  getStream() {
    return this.screenStream;
  }
}

window.ScreenShareManager = ScreenShareManager;
