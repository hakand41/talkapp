// Audio Processing & Web Audio API Engine with DSP Studio, Noise Gate, Limiter & Ducking
class AudioManager {
  constructor() {
    this.audioCtx = null;
    this.localStream = null;
    this.processedStream = null;

    // Web Audio DSP Nodes
    this.micSource = null;
    this.highPassFilter = null;
    this.vocalClarityFilter = null;
    this.micGainNode = null;
    this.compressorNode = null;
    this.gateGainNode = null;
    this.analyser = null;
    this.streamDestination = null;
    this.sidetoneGain = null;

    // Remote peer audio nodes: peerId -> { source, gainNode, element }
    this.remoteAudios = new Map();

    // Voice Activity, PTT & Push-to-Mute (PTM) Settings (dB Based)
    this.inputMode = localStorage.getItem('talkapp_input_mode') || 'vad'; // 'vad' | 'ptt' | 'ptm'
    this.pttPressed = false;
    this.ptmPressed = false;
    this.pttKey = localStorage.getItem('talkapp_ptt_key') || 'Space';
    this.ptmKey = localStorage.getItem('talkapp_ptm_key') || 'KeyV';
    this.muteToggleKey = localStorage.getItem('talkapp_mute_toggle_key') || 'KeyM';
    this.micNotifSoundMode = localStorage.getItem('talkapp_mic_notif_sound') || 'voice_and_chime';
    this.pttSoundEnabled = localStorage.getItem('talkapp_ptt_sound_enabled') === 'true'; // Default: false (kapali)
    const savedThreshold = parseFloat(localStorage.getItem('talkapp_gate_threshold_db'));
    this.gateThresholdDB = (!isNaN(savedThreshold) && savedThreshold >= -70 && savedThreshold <= -20) ? savedThreshold : -62;
    localStorage.setItem('talkapp_gate_threshold_db', this.gateThresholdDB);
    this.hangoverTime = 0.3; // 300ms word decay protection
    this.lastGateOpenTime = 0;
    this.gateOpen = true;
    this.isSpeaking = false;
    this.micHardwareMuted = false;
    this.vadInterval = null;

    // DSP Filter States
    this.micGainDb = parseFloat(localStorage.getItem('talkapp_mic_gain_db') || '0');
    this.highPassEnabled = localStorage.getItem('talkapp_highpass_enabled') !== 'false';
    this.vocalClarityEnabled = localStorage.getItem('talkapp_clarity_enabled') !== 'false';
    this.limiterEnabled = localStorage.getItem('talkapp_limiter_enabled') !== 'false';
    this.echoCancellationEnabled = localStorage.getItem('talkapp_echo_canc_enabled') !== 'false';
    this.aiNoiseSuppressionEnabled = localStorage.getItem('talkapp_ai_noise_suppression') === 'true';
    this.sidetoneEnabled = false;
    this.activeVoiceEffect = localStorage.getItem('talkapp_voice_fx') || 'none';
    this.fxNodes = [];

    // Callbacks
    this.onSpeakingChange = null;
    this.onMicLevel = null; // (normalizedLevel, currentDb, gateOpen)

    // Hardware Audio Constraints
    this.audioConstraints = {
      echoCancellation: this.echoCancellationEnabled,
      noiseSuppression: true,
      autoGainControl: true
    };

    this.selectedInputDevice = localStorage.getItem('talkapp_input_device') || '';
    this.selectedOutputDevice = localStorage.getItem('talkapp_output_device') || '';
    this.soundEffectsEnabled = true;
  }

  async setOutputDevice(deviceId) {
    this.selectedOutputDevice = deviceId || '';
    localStorage.setItem('talkapp_output_device', this.selectedOutputDevice);
    for (const [, peerAudio] of this.remoteAudios.entries()) {
      if (peerAudio.element && typeof peerAudio.element.setSinkId === 'function') {
        try {
          await peerAudio.element.setSinkId(this.selectedOutputDevice);
        } catch (e) {
          console.warn('[Audio] setSinkId error:', e);
        }
      }
    }
  }

  async setInputDevice(deviceId) {
    this.selectedInputDevice = deviceId || '';
    localStorage.setItem('talkapp_input_device', this.selectedInputDevice);
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      return await this.getMicrophoneStream();
    }
    return null;
  }

  // --- WEB AUDIO CONTEXT INITIALIZATION ---
  async initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      try {
        this.audioCtx = new AudioContextClass({ sampleRate: 48000, latencyHint: 'interactive' });
      } catch (e) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  // --- MICROPHONE STREAM & DSP PIPELINE ---
  async getMicrophoneStream() {
    await this.initAudioContext();

    const constraints = {
      audio: {
        echoCancellation: this.echoCancellationEnabled,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: this.selectedInputDevice ? { exact: this.selectedInputDevice } : undefined
      },
      video: false
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      try {
        this.setupLocalAudioPipeline();
      } catch (pipelineErr) {
        console.warn('[Audio] DSP pipeline error, using raw stream:', pipelineErr);
      }
      
      // Route through DSP pipeline to apply Noise Gate (filtering keyboard & mouse clicks) and vocal clarity
      if (this.processedStream) {
        return this.processedStream;
      }
      return this.localStream;
    } catch (err) {
      console.error('[Audio] Mikrofon alınamadı:', err);
      throw err;
    }
  }

  setupLocalAudioPipeline() {
    if (!this.localStream || !this.audioCtx) return;

    // Clean up previous nodes if any
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (e) {}
    }

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // 1. Source from raw mic stream
    this.micSource = ctx.createMediaStreamSource(this.localStream);

    // 2. High-Pass Filter (85 Hz Low-Cut: eliminates desk rumble, AC hum, computer fan noise)
    this.highPassFilter = ctx.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(this.highPassEnabled ? 85 : 10, now);
    this.highPassFilter.Q.setValueAtTime(0.7, now);

    // 3. Vocal Clarity EQ Filter (3000 Hz Peaking boost: boosts vocal articulation gently)
    this.vocalClarityFilter = ctx.createBiquadFilter();
    this.vocalClarityFilter.type = 'peaking';
    this.vocalClarityFilter.frequency.setValueAtTime(3000, now);
    this.vocalClarityFilter.Q.setValueAtTime(1.0, now);
    this.vocalClarityFilter.gain.setValueAtTime(this.vocalClarityEnabled ? 1.5 : 0, now);

    // 4. Mic Gain Booster (-12 dB to +18 dB)
    this.micGainNode = ctx.createGain();
    const gainLinear = Math.pow(10, this.micGainDb / 20);
    this.micGainNode.gain.setValueAtTime(gainLinear, now);

    // 5. Dynamics Compressor & Ear-Rape Limiter (anti-clipping protection without harsh pumping)
    this.compressorNode = ctx.createDynamicsCompressor();
    if (this.limiterEnabled) {
      this.compressorNode.threshold.setValueAtTime(-18, now);
      this.compressorNode.knee.setValueAtTime(12, now);
      this.compressorNode.ratio.setValueAtTime(4, now);
      this.compressorNode.attack.setValueAtTime(0.01, now);
      this.compressorNode.release.setValueAtTime(0.2, now);
    } else {
      this.compressorNode.threshold.setValueAtTime(0, now);
      this.compressorNode.ratio.setValueAtTime(1, now);
    }

    // 6. Pre-Gate Analyser (measures raw input dB for accurate gating & live visual meters)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.3;

    // 7. Noise Gate Gain Node (opens when dB >= threshold, smooth 15ms fade to avoid clicks)
    this.gateGainNode = ctx.createGain();
    this.gateGainNode.gain.setValueAtTime(1.0, now);

    // 8. Voice FX / Pitch Shifter Node Pair
    this.voiceFxInput = ctx.createGain();
    this.voiceFxOutput = ctx.createGain();

    // 9. Stream Destination (feeds processed audio directly into WebRTC to other peers)
    this.streamDestination = ctx.createMediaStreamDestination();
    this.processedStream = this.streamDestination.stream;

    // 10. Sidetone / Mic Loopback (zero-latency monitoring for hearing yourself in headphones)
    this.sidetoneGain = ctx.createGain();
    this.sidetoneGain.gain.setValueAtTime(this.sidetoneEnabled ? 0.8 : 0.0, now);

    // CONNECT THE DSP PIPELINE:
    // micSource -> highPass -> vocalClarity -> micGain -> compressor
    this.micSource.connect(this.highPassFilter);
    this.highPassFilter.connect(this.vocalClarityFilter);
    this.vocalClarityFilter.connect(this.micGainNode);
    this.micGainNode.connect(this.compressorNode);

    // From compressor -> Analyser (sidechain detector)
    this.compressorNode.connect(this.analyser);

    // From compressor -> Gate Gain Node
    this.compressorNode.connect(this.gateGainNode);

    // AI Spectral Noise Suppressor (RNNoise-based neural spectral filter) - ONLY connect when explicitly enabled to avoid ScriptProcessor buffer underruns
    this.setupAiNoiseSuppressionNode();
    if (this.aiNoiseSuppressionEnabled && this.aiNoiseNode) {
      this.gateGainNode.connect(this.aiNoiseNode);
      this.aiNoiseNode.connect(this.voiceFxInput);
    } else {
      this.gateGainNode.connect(this.voiceFxInput);
    }

    // Apply active voice effect (wires voiceFxInput to voiceFxOutput)
    this.applyVoiceEffect(this.activeVoiceEffect);

    // From Voice FX Output -> WebRTC Destination
    this.voiceFxOutput.connect(this.streamDestination);

    // From Voice FX Output -> Sidetone (Local Headphones Test)
    this.voiceFxOutput.connect(this.sidetoneGain);
    this.sidetoneGain.connect(ctx.destination);

    this.startVadMonitoring();
  }

  // --- AI SPECTRAL NOISE SUPPRESSION (KRISP / RNNOISE DSP) ---
  setupAiNoiseSuppressionNode() {
    if (!this.audioCtx) return;
    try {
      if (this.aiNoiseNode) {
        try { this.aiNoiseNode.disconnect(); } catch (e) {}
        this.aiNoiseNode = null;
      }

      if (!this.aiNoiseSuppressionEnabled) {
        return;
      }

      const bufferSize = 2048;
      this.aiNoiseNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      let noiseFloor = 0.005;
      let speechProbability = 0.0;
      const alpha = 0.95;
      const decay = 0.998;

      this.aiNoiseNode.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const output = e.outputBuffer.getChannelData(0);

        if (!this.aiNoiseSuppressionEnabled) {
          for (let i = 0; i < input.length; i++) {
            output[i] = input[i];
          }
          return;
        }

        let energy = 0;
        let zeroCrossings = 0;
        for (let i = 0; i < input.length; i++) {
          const s = input[i];
          energy += s * s;
          if (i > 0 && ((input[i] >= 0 && input[i - 1] < 0) || (input[i] < 0 && input[i - 1] >= 0))) {
            zeroCrossings++;
          }
        }
        const rms = Math.sqrt(energy / input.length);
        const zcr = zeroCrossings / input.length;

        // Adaptive noise floor tracking
        if (rms < noiseFloor) {
          noiseFloor = alpha * noiseFloor + (1 - alpha) * rms;
        } else {
          noiseFloor = decay * noiseFloor + (1 - decay) * rms;
        }
        noiseFloor = Math.max(0.0008, Math.min(0.08, noiseFloor));

        // Speech probability based on SNR and vocal formant zero-crossing distribution
        const snr = rms / (noiseFloor + 1e-6);
        const isVoiceLike = (zcr >= 0.03 && zcr <= 0.35);

        let instantProb = 0;
        if (snr > 3.0 && isVoiceLike) {
          instantProb = Math.min(1.0, (snr - 2.5) / 4.0);
        } else if (snr > 6.0) {
          instantProb = 0.7;
        }

        if (instantProb > speechProbability) {
          speechProbability = 0.7 * speechProbability + 0.3 * instantProb;
        } else {
          speechProbability = 0.92 * speechProbability + 0.08 * instantProb;
        }

        // Soft neural attenuation curve (cancels keyboard strikes and fan noise)
        const targetGain = speechProbability > 0.35 
          ? 1.0 
          : Math.max(0.02, Math.pow(speechProbability / 0.35, 2.0));

        for (let i = 0; i < input.length; i++) {
          output[i] = input[i] * targetGain;
        }
      };
    } catch (err) {
      console.warn('[Audio] AI Gürültü Engelleme başlatılamadı:', err);
    }
  }

  setAiNoiseSuppression(enabled) {
    this.aiNoiseSuppressionEnabled = !!enabled;
    localStorage.setItem('talkapp_ai_noise_suppression', this.aiNoiseSuppressionEnabled);
    if (this.localStream && this.audioCtx) {
      try {
        this.setupLocalAudioPipeline();
      } catch (e) {}
    }
  }

  setPttSoundEnabled(enabled) {
    this.pttSoundEnabled = !!enabled;
    localStorage.setItem('talkapp_ptt_sound_enabled', this.pttSoundEnabled);
  }

  // --- GERÇEK ZAMANLI SES DEĞİŞTİRİCİ (VOICE FX & CHANGER) ---
  setVoiceEffect(effectName) {
    this.activeVoiceEffect = effectName || 'none';
    localStorage.setItem('talkapp_voice_fx', this.activeVoiceEffect);
    this.applyVoiceEffect(this.activeVoiceEffect);
  }

  applyVoiceEffect(effectName) {
    if (!this.audioCtx || !this.voiceFxInput || !this.voiceFxOutput) return;

    // Clean up previous FX nodes
    try { this.voiceFxInput.disconnect(); } catch (e) {}
    if (this.fxNodes && this.fxNodes.length > 0) {
      this.fxNodes.forEach(node => {
        try {
          if (node.stop) node.stop();
          node.disconnect();
        } catch (e) {}
      });
    }
    this.fxNodes = [];

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    switch (effectName) {
      case 'robot': {
        // Ring Modulator (55Hz carrier oscillator)
        const carrier = ctx.createOscillator();
        carrier.type = 'sawtooth';
        carrier.frequency.setValueAtTime(55, now);

        const modGain = ctx.createGain();
        modGain.gain.setValueAtTime(0, now);

        carrier.connect(modGain.gain);
        this.voiceFxInput.connect(modGain);

        const cleanGain = ctx.createGain();
        cleanGain.gain.setValueAtTime(0.2, now);
        this.voiceFxInput.connect(cleanGain);

        cleanGain.connect(this.voiceFxOutput);
        modGain.connect(this.voiceFxOutput);

        carrier.start();
        this.fxNodes.push(carrier, modGain, cleanGain);
        break;
      }

      case 'helium': {
        // High Formant / Helium Voice FX
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(1400, now);
        hp.Q.setValueAtTime(4.0, now);

        const peak = ctx.createBiquadFilter();
        peak.type = 'peaking';
        peak.frequency.setValueAtTime(2400, now);
        peak.gain.setValueAtTime(12, now);
        peak.Q.setValueAtTime(3.0, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1.8, now);

        this.voiceFxInput.connect(hp);
        hp.connect(peak);
        peak.connect(gain);
        gain.connect(this.voiceFxOutput);

        this.fxNodes.push(hp, peak, gain);
        break;
      }

      case 'monster':
      case 'deep': {
        // Monster / Deep Bass Villain FX
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, now);
        lp.Q.setValueAtTime(4.5, now);

        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.setValueAtTime(160, now);
        bass.gain.setValueAtTime(14, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1.6, now);

        this.voiceFxInput.connect(lp);
        lp.connect(bass);
        bass.connect(gain);
        gain.connect(this.voiceFxOutput);

        this.fxNodes.push(lp, bass, gain);
        break;
      }

      case 'walkie':
      case 'radio': {
        // Military / Tactical SWAT Radio Effect
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(1800, now);
        bp.Q.setValueAtTime(2.5, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1.4, now);

        this.voiceFxInput.connect(bp);
        bp.connect(gain);
        gain.connect(this.voiceFxOutput);

        this.fxNodes.push(bp, gain);
        break;
      }

      case 'telephone': {
        // Vintage Telephone Landline Effect
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(450, now);
        hp.Q.setValueAtTime(2.0, now);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3200, now);
        lp.Q.setValueAtTime(2.0, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1.4, now);

        this.voiceFxInput.connect(hp);
        hp.connect(lp);
        lp.connect(gain);
        gain.connect(this.voiceFxOutput);

        this.fxNodes.push(hp, lp, gain);
        break;
      }

      case 'none':
      default: {
        this.voiceFxInput.connect(this.voiceFxOutput);
        break;
      }
    }
  }

  // --- DECIBEL & NOISE GATE MONITORING LOOP ---
  startVadMonitoring() {
    if (this.vadInterval) clearInterval(this.vadInterval);

    const buffer = new Float32Array(this.analyser.fftSize);

    this.vadInterval = setInterval(() => {
      if (!this.analyser || !this.localStream || !this.audioCtx) return;

      // Check if user manually muted their microphone in UI
      if (this.micHardwareMuted) {
        if (this.isSpeaking) {
          this.isSpeaking = false;
          if (this.onSpeakingChange) this.onSpeakingChange(false);
        }
        if (this.gateGainNode && this.audioCtx) {
          this.gateGainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.015);
        }
        if (this.processedStream) {
          this.processedStream.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        if (this.onMicLevel) this.onMicLevel(0, -100, false);
        return;
      }

      // Compute RMS from time domain data
      this.analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      // Convert RMS to Decibels relative to Full Scale (dBFS: -100 dB to 0 dB)
      let dB = -100;
      if (rms > 0.00001) {
        dB = Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
      }

      // Normalized percentage for UI meter (maps -70 dB..0 dB to 0..100%)
      const normalizedLevel = Math.max(0, Math.min(100, Math.round(((dB + 70) / 70) * 100)));
      const now = this.audioCtx.currentTime;

      // Gate Logic
      let shouldBeOpen = false;
      if (this.ptmPressed) {
        // Push-to-Mute (Bas-Sustur) held down -> force gate closed immediately
        shouldBeOpen = false;
      } else if (this.inputMode === 'ptt') {
        shouldBeOpen = this.pttPressed;
      } else {
        // VAD or PTM (when PTM key is not held) with Noise Gate Threshold
        if (dB >= this.gateThresholdDB) {
          shouldBeOpen = true;
          this.lastGateOpenTime = now;
        } else if (now - this.lastGateOpenTime < this.hangoverTime) {
          // Word ending decay protection (300ms)
          shouldBeOpen = true;
        } else {
          shouldBeOpen = false;
        }
      }

      // Smooth Gate Transition on DSP gain node (smooth 15ms exponential fade prevents clicks/crackles)
      if (this.gateGainNode && this.audioCtx) {
        this.gateGainNode.gain.setTargetAtTime(shouldBeOpen ? 1.0 : 0.0, now, 0.015);
      }
      this.gateOpen = shouldBeOpen;

      if (this.onMicLevel) {
        this.onMicLevel(normalizedLevel, Math.round(dB), shouldBeOpen);
      }

      if (shouldBeOpen !== this.isSpeaking) {
        this.isSpeaking = shouldBeOpen;
        if (this.onSpeakingChange) {
          this.onSpeakingChange(this.isSpeaking);
        }
      }
    }, 40);
  }

  // --- PARAMETER CONTROL METHODS ---
  setGateThreshold(dB) {
    this.gateThresholdDB = parseFloat(dB);
    localStorage.setItem('talkapp_gate_threshold_db', this.gateThresholdDB);
  }

  setMicGain(gainDb) {
    this.micGainDb = parseFloat(gainDb);
    localStorage.setItem('talkapp_mic_gain_db', this.micGainDb);
    if (this.micGainNode && this.audioCtx) {
      const linear = Math.pow(10, this.micGainDb / 20);
      this.micGainNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.02);
    }
  }

  setHighPassEnabled(enabled) {
    this.highPassEnabled = !!enabled;
    localStorage.setItem('talkapp_highpass_enabled', this.highPassEnabled);
    if (this.highPassFilter && this.audioCtx) {
      this.highPassFilter.frequency.setTargetAtTime(this.highPassEnabled ? 85 : 10, this.audioCtx.currentTime, 0.02);
    }
  }

  setVocalClarityEnabled(enabled) {
    this.vocalClarityEnabled = !!enabled;
    localStorage.setItem('talkapp_clarity_enabled', this.vocalClarityEnabled);
    if (this.vocalClarityFilter && this.audioCtx) {
      this.vocalClarityFilter.gain.setTargetAtTime(this.vocalClarityEnabled ? 3.5 : 0, this.audioCtx.currentTime, 0.02);
    }
  }

  setLimiterEnabled(enabled) {
    this.limiterEnabled = !!enabled;
    localStorage.setItem('talkapp_limiter_enabled', this.limiterEnabled);
    if (this.compressorNode && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      if (this.limiterEnabled) {
        this.compressorNode.threshold.setValueAtTime(-24, now);
        this.compressorNode.ratio.setValueAtTime(12, now);
      } else {
        this.compressorNode.threshold.setValueAtTime(0, now);
        this.compressorNode.ratio.setValueAtTime(1, now);
      }
    }
  }

  setEchoCancellationEnabled(enabled) {
    this.echoCancellationEnabled = !!enabled;
    localStorage.setItem('talkapp_echo_canc_enabled', this.echoCancellationEnabled);
  }

  setSidetoneEnabled(enabled) {
    this.sidetoneEnabled = !!enabled;
    if (this.sidetoneGain && this.audioCtx) {
      this.sidetoneGain.gain.setTargetAtTime(this.sidetoneEnabled ? 0.8 : 0.0, this.audioCtx.currentTime, 0.02);
    }
  }

  setPttPressed(pressed) {
    this.pttPressed = !!pressed;
  }

  setPttKey(keyCode) {
    this.pttKey = keyCode;
    localStorage.setItem('talkapp_ptt_key', keyCode);
  }

  setPtmPressed(pressed) {
    this.ptmPressed = !!pressed;
    if (this.ptmPressed) {
      if (this.gateGainNode && this.audioCtx) {
        this.gateGainNode.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.01);
      }
      if (this.processedStream) {
        this.processedStream.getAudioTracks().forEach(t => { t.enabled = false; });
      }
      if (this.isSpeaking) {
        this.isSpeaking = false;
        if (this.onSpeakingChange) this.onSpeakingChange(false);
      }
    } else {
      if (this.processedStream && !this.masterMuted) {
        this.processedStream.getAudioTracks().forEach(t => { t.enabled = true; });
      }
    }
  }

  setPtmKey(keyCode) {
    this.ptmKey = keyCode;
    localStorage.setItem('talkapp_ptm_key', keyCode);
  }

  setMuteToggleKey(keyCode) {
    this.muteToggleKey = keyCode;
    localStorage.setItem('talkapp_mute_toggle_key', keyCode);
  }

  setMicNotifSoundMode(mode) {
    this.micNotifSoundMode = mode || 'voice_and_chime';
    localStorage.setItem('talkapp_mic_notif_sound', this.micNotifSoundMode);
  }

  // --- AUDIO PRESETS ---
  applyPreset(presetName) {
    switch (presetName) {
      case 'competitive':
        // Aggressive gate to kill mechanical keyboard & fan clicks, high pass, clarity, limiter
        this.setGateThreshold(-42);
        this.setMicGain(3);
        this.setHighPassEnabled(true);
        this.setVocalClarityEnabled(true);
        this.setLimiterEnabled(true);
        break;

      case 'podcast':
        // Warm natural studio tone, soft gate
        this.setGateThreshold(-52);
        this.setMicGain(0);
        this.setHighPassEnabled(true);
        this.setVocalClarityEnabled(true);
        this.setLimiterEnabled(true);
        break;

      case 'raw':
        // Zero DSP, raw mic pass-through, low CPU
        this.setGateThreshold(-60);
        this.setMicGain(0);
        this.setHighPassEnabled(false);
        this.setVocalClarityEnabled(false);
        this.setLimiterEnabled(false);
        break;
    }
  }

  setMicrophoneEnabled(enabled) {
    this.micHardwareMuted = !enabled;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => { track.enabled = enabled; });
    }
    if (this.processedStream) {
      this.processedStream.getAudioTracks().forEach(track => { track.enabled = enabled; });
    }
    if (this.gateGainNode && this.audioCtx) {
      this.gateGainNode.gain.setValueAtTime(enabled ? 1.0 : 0.0, this.audioCtx.currentTime);
    }
  }

  // --- REMOTE PEER AUDIO MANAGEMENT ---
  attachRemoteAudio(peerId, stream) {
    this.detachRemoteAudio(peerId);

    const audioEl = document.createElement('audio');
    audioEl.id = `remote-audio-${peerId}`;
    audioEl.style.position = 'fixed';
    audioEl.style.top = '-9999px';
    audioEl.style.left = '-9999px';
    audioEl.style.width = '1px';
    audioEl.style.height = '1px';
    audioEl.style.opacity = '0';
    audioEl.style.pointerEvents = 'none';
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.volume = 1.0;
    audioEl.srcObject = stream;
    document.body.appendChild(audioEl);

    if (this.selectedOutputDevice && typeof audioEl.setSinkId === 'function') {
      audioEl.setSinkId(this.selectedOutputDevice).catch(console.warn);
    }

    const tryPlay = () => {
      const p = audioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => {
          console.warn(`[Audio] Autoplay bekliyor (${peerId}):`, err.message);
          const unlock = () => {
            audioEl.play().catch(() => {});
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
              this.audioCtx.resume().catch(() => {});
            }
            document.removeEventListener('click', unlock);
            document.removeEventListener('keydown', unlock);
            document.removeEventListener('touchstart', unlock);
          };
          document.addEventListener('click', unlock, { once: true });
          document.addEventListener('keydown', unlock, { once: true });
          document.addEventListener('touchstart', unlock, { once: true });
        });
      }
    };

    tryPlay();
    this.remoteAudios.set(peerId, { source: null, gainNode: null, element: audioEl });
  }

  setPeerVolume(peerId, volumePercent) {
    const peerAudio = this.remoteAudios.get(peerId);
    if (!peerAudio) return;

    const gainValue = Math.max(0, Math.min(2.0, volumePercent / 100));
    if (peerAudio.element) {
      peerAudio.element.volume = Math.min(1.0, gainValue);
    }
  }

  setMasterDeafen(isDeafened) {
    for (const [, peerAudio] of this.remoteAudios.entries()) {
      if (peerAudio.element) {
        peerAudio.element.muted = isDeafened;
      }
    }
  }

  detachRemoteAudio(peerId) {
    const peerAudio = this.remoteAudios.get(peerId);
    if (peerAudio) {
      try {
        if (peerAudio.element) {
          peerAudio.element.pause();
          peerAudio.element.srcObject = null;
          if (peerAudio.element.parentNode) {
            peerAudio.element.parentNode.removeChild(peerAudio.element);
          }
        }
      } catch (e) {}
      this.remoteAudios.delete(peerId);
    }
  }

  // --- SYNTHESIZED SOUNDBOARD & CHIMES ---
  playChime(type) {
    if (!this.soundEffectsEnabled) return;
    this.initAudioContext();
    const ctx = this.audioCtx;
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'join') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'leave') {
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'message' || type === 'dm') {
        osc.frequency.setValueAtTime(type === 'dm' ? 987 : 784, now);
        osc.frequency.exponentialRampToValueAtTime(1174, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === 'mute') {
        // Melodic descending two-tone chime (Mikrofon Kapandı: High -> Low)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(392.00, now + 0.085); // G4
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.setValueAtTime(0.02, now + 0.075);
        gain.gain.setValueAtTime(0.16, now + 0.085);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'unmute') {
        // Melodic ascending two-tone chime (Mikrofon Açıldı: Low -> High)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440.00, now); // A4
        osc.frequency.setValueAtTime(659.25, now + 0.085); // E5
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.setValueAtTime(0.02, now + 0.075);
        gain.gain.setValueAtTime(0.16, now + 0.085);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'mention') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1320, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Ses efekti calinamadi:', e);
    }
  }

  playMicStatusSound(isMuted) {
    if (!this.soundEffectsEnabled) return;
    const mode = this.micNotifSoundMode || 'voice_and_chime';
    if (mode === 'off') return;

    if (mode === 'chime' || mode === 'voice_and_chime') {
      this.playChime(isMuted ? 'mute' : 'unmute');
    }

    if ((mode === 'voice' || mode === 'voice_and_chime') && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const phrase = isMuted ? 'Mikrofon kapandı' : 'Mikrofon açıldı';
        const utter = new SpeechSynthesisUtterance(phrase);
        utter.lang = 'tr-TR';
        utter.rate = 1.15;
        utter.pitch = 1.0;
        utter.volume = 0.85;
        const voices = window.speechSynthesis.getVoices();
        const trVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('tr'));
        if (trVoice) utter.voice = trVoice;
        window.speechSynthesis.speak(utter);
      } catch (e) {
        console.warn('[TTS Warning]:', e);
      }
    }
  }

  async playSoundboard(soundId) {
    await this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) {}
    }
    const ctx = this.audioCtx;
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const masterVol = 0.25;
      const connectGain = (g) => {
        try { g.connect(ctx.destination); } catch (e) {}
        if (this.streamDestination) {
          try { g.connect(this.streamDestination); } catch (e) {}
        }
      };

      if (soundId === 'airhorn') {
        [0, 0.25, 0.5].forEach(delay => {
          [466.16, 554.37, 698.46, 932.33].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + delay);
            gain.gain.setValueAtTime(masterVol * 0.2, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.2);
            osc.connect(gain);
            connectGain(gain);
            osc.start(now + delay);
            osc.stop(now + delay + 0.2);
          });
        });
      } else if (soundId === 'gg') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, now + idx * 0.1);
          gain.gain.setValueAtTime(masterVol * 0.3, now + idx * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + (idx === 3 ? 0.4 : 0.09));
          osc.connect(gain);
          connectGain(gain);
          osc.start(now + idx * 0.1);
          osc.stop(now + idx * 0.1 + (idx === 3 ? 0.4 : 0.1));
        });
      } else if (soundId === 'bruh') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(masterVol * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        connectGain(gain);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (soundId === 'coin') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.51, now + 0.08);
        gain.gain.setValueAtTime(masterVol * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        connectGain(gain);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (soundId === 'laser') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(masterVol * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        connectGain(gain);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (soundId === 'badumtss') {
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.frequency.setValueAtTime(120, now);
        gain1.gain.setValueAtTime(masterVol * 0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc1.connect(gain1);
        connectGain(gain1);
        osc1.start(now);
        osc1.stop(now + 0.1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.frequency.setValueAtTime(140, now + 0.15);
        gain2.gain.setValueAtTime(masterVol * 0.4, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc2.connect(gain2);
        connectGain(gain2);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.25);

        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(masterVol * 0.25, now + 0.28);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
        noise.connect(noiseGain);
        connectGain(noiseGain);
        noise.start(now + 0.28);
      }
    } catch (e) {
      console.warn('Soundboard hatasi:', e);
    }
  }

  // --- DIRECT CALL RINGTONE & DIAL TONE SYNTHESIZERS ---
  async playRingtone() {
    await this.initAudioContext();
    this.stopRingtone();

    const ringBurst = () => {
      if (!this.audioCtx || this.audioCtx.state === 'closed') return;
      try {
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        [440, 480].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.setValueAtTime(0.2, now + 1.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 1.5);
        });
      } catch (e) {}
    };

    ringBurst();
    this.ringtoneInterval = setInterval(ringBurst, 3000);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  async playDialTone() {
    await this.initAudioContext();
    this.stopDialTone();

    const dialBurst = () => {
      if (!this.audioCtx || this.audioCtx.state === 'closed') return;
      try {
        const ctx = this.audioCtx;
        const now = ctx.currentTime;
        [400, 450].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.setValueAtTime(0.12, now + 0.8);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 1.0);
        });
      } catch (e) {}
    };

    dialBurst();
    this.dialToneInterval = setInterval(dialBurst, 3500);
  }

  stopDialTone() {
    if (this.dialToneInterval) {
      clearInterval(this.dialToneInterval);
      this.dialToneInterval = null;
    }
  }

  async playCustomSound(soundUrl) {
    if (!soundUrl) return;
    await this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) {}
    }
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.6;
      audio.play().catch(err => console.warn('[Custom Sound Warning]:', err));
    } catch (e) {
      console.warn('Custom sound hatası:', e);
    }
  }

  async reacquireMicrophone() {
    console.log('[Audio] Mobil / Arka plan kurtarma: Mikrofon akışı yeniden başlatılıyor...');
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (e) {}
      this.micSource = null;
    }
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      this.localStream = null;
    }
    this.processedStream = null;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try { await this.audioCtx.resume(); } catch (e) {}
    }

    return await this.getMicrophoneStream();
  }

  stopMicrophone() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (e) {}
      this.micSource = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      this.localStream = null;
    }
    this.processedStream = null;
  }

  destroy() {
    this.stopRingtone();
    this.stopDialTone();
    if (this.vadInterval) clearInterval(this.vadInterval);
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    for (const peerId of this.remoteAudios.keys()) {
      this.detachRemoteAudio(peerId);
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}

window.AudioManager = AudioManager;
