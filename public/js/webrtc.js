// WebRTC Multi-Peer Mesh Connection Manager
class WebRTCClient {
  constructor(signalingSocket) {
    this.ws = signalingSocket;
    this.peers = new Map(); // peerId -> { pc, tracks, stream }
    this.localStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.selfId = null;
    
    // ICE servers (Fast public Google STUNs + Free High-Availability TURN Relays)
    this.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
          'turn:openrelay.metered.ca:80?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];

    this.pendingCandidates = new Map(); // targetPeerId -> candidate[]

    // Callbacks
    this.onRemoteTrack = null; // (peerId, track, stream)
    this.onPeerDisconnected = null; // (peerId)
    this.onConnectionStateChange = null; // (peerId, state)
    this.currentBitrate = 64; // Default 64 kbps

    // Auto load dynamic high-availability ICE servers from server
    this.loadIceServers();
  }

  async loadIceServers() {
    try {
      const res = await fetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          console.log('[WebRTC] High-availability ICE servers yüklendi:', this.iceServers.length);
        }
      }
    } catch (e) {
      console.warn('[WebRTC] ICE servers fetch failed, fallback default Google STUNs used.');
    }
  }

  setSignalingSocket(ws) {
    this.ws = ws;
  }

  setCustomIceServers(servers) {
    if (Array.isArray(servers) && servers.length > 0) {
      this.iceServers = servers;
    }
  }

  setAudioBitrate(bitrateKbps) {
    this.currentBitrate = parseInt(bitrateKbps, 10) || 64;
    const maxBitrate = this.currentBitrate * 1000;
    for (const [, peerData] of this.peers.entries()) {
      try {
        const senders = peerData.pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
          const params = audioSender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = maxBitrate;
          audioSender.setParameters(params).catch(() => {});
        }
      } catch (err) {
        console.warn('[WebRTC] Bitrate uygulanamadı:', err);
      }
    }
  }

  async getConnectionStats() {
    if (this.peers.size === 0) {
      return { connected: false, peerCount: 0, rtt: 0, packetLoss: 0, jitter: 0, codec: 'Opus 48k' };
    }

    let totalRtt = 0;
    let rttSamples = 0;
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;
    let maxJitter = 0;
    let detectedCodec = 'Opus HD';

    for (const [, peerData] of this.peers.entries()) {
      try {
        const stats = await peerData.pc.getStats();
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
            totalRtt += report.currentRoundTripTime * 1000;
            rttSamples++;
          } else if (report.type === 'remote-inbound-rtp' && typeof report.roundTripTime === 'number') {
            totalRtt += report.roundTripTime * 1000;
            rttSamples++;
          }

          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            if (typeof report.packetsLost === 'number') totalPacketsLost += report.packetsLost;
            if (typeof report.packetsReceived === 'number') totalPacketsReceived += report.packetsReceived;
            if (typeof report.jitter === 'number') maxJitter = Math.max(maxJitter, report.jitter * 1000);
          }

          if (report.type === 'codec' && report.mimeType && report.mimeType.toLowerCase().includes('audio')) {
            detectedCodec = report.mimeType.replace(/^audio\//i, '').toUpperCase();
          }
        });
      } catch (e) {}
    }

    const avgRtt = rttSamples > 0 ? Math.round(totalRtt / rttSamples) : 22;
    const totalPackets = totalPacketsReceived + totalPacketsLost;
    const lossRate = totalPackets > 0 ? Math.round((totalPacketsLost / totalPackets) * 100) : 0;
    const jitterMs = Math.round(maxJitter);

    return {
      connected: true,
      peerCount: this.peers.size,
      rtt: avgRtt,
      packetLoss: lossRate,
      jitter: jitterMs,
      codec: detectedCodec
    };
  }

  // Create a peer connection for a specific remote peer
  createPeerConnection(targetPeerId, isInitiator = false) {
    if (this.peers.has(targetPeerId)) {
      const existing = this.peers.get(targetPeerId);
      if (existing && existing.pc) {
        const s = existing.pc.connectionState;
        const ice = existing.pc.iceConnectionState;
        if (s === 'connected' && ice !== 'failed' && ice !== 'disconnected' && !isInitiator) {
          return existing.pc;
        }
      }
      this.closePeer(targetPeerId);
    }

    const config = {
      iceServers: this.iceServers,
      iceCandidatePoolSize: 4
    };

    const pc = new RTCPeerConnection(config);
    const peerData = {
      pc: pc,
      remoteStream: new MediaStream(),
      candidateQueue: []
    };
    this.peers.set(targetPeerId, peerData);

    // Drain any candidates that arrived before peer was initialized
    if (this.pendingCandidates && this.pendingCandidates.has(targetPeerId)) {
      const earlyCandidates = this.pendingCandidates.get(targetPeerId);
      peerData.candidateQueue.push(...earlyCandidates);
      this.pendingCandidates.delete(targetPeerId);
    }

    // Add local mic tracks with bitrate
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        try {
          const sender = pc.addTrack(track, this.localStream);
          if (track.kind === 'audio' && this.currentBitrate) {
            try {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              params.encodings[0].maxBitrate = this.currentBitrate * 1000;
              sender.setParameters(params).catch(() => {});
            } catch (e) {}
          }
        } catch (e) {
          console.warn('[WebRTC] Local audio track eklenemedi:', e);
        }
      });
    }

    // Add local camera tracks if active
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => {
        try { pc.addTrack(track, this.cameraStream); } catch (e) {}
      });
    }

    // Add local screen tracks if active
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        try { pc.addTrack(track, this.screenStream); } catch (e) {}
      });
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'signal-candidate',
          targetId: targetPeerId,
          candidate: event.candidate
        }));
      }
    };

    // Detailed ICE and Connection State Logging & Self-Healing
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC ICE] ${targetPeerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC ICE] ${targetPeerId} bağlantısı koptu, otomatik ICE restart deneniyor...`);
        this.restartIceForPeer(targetPeerId);
      } else if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.warn(`[WebRTC ICE] ${targetPeerId} hala bağlantısız, otomatik ICE restart deneniyor...`);
            this.restartIceForPeer(targetPeerId);
          }
        }, 2000);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Peer] ${targetPeerId} connection state: ${pc.connectionState}`);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(targetPeerId, pc.connectionState);
      }
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC Peer] ${targetPeerId} bağlantısı koptu, yeniden deneniyor...`);
        this.restartIceForPeer(targetPeerId);
      }
    };

    // Handle incoming remote tracks (audio, camera, screen)
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received from ${targetPeerId}:`, event.track.kind);
      peerData.remoteStream.addTrack(event.track);

      event.track.onended = () => {
        peerData.remoteStream.removeTrack(event.track);
      };

      if (this.onRemoteTrack) {
        this.onRemoteTrack(targetPeerId, event.track, peerData.remoteStream);
      }
    };

    // If initiator, generate SDP offer
    if (isInitiator) {
      this.initiateOffer(targetPeerId, pc);
    }

    return pc;
  }

  setOpusDspParams(sdp) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    try {
      const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000\/2/i);
      if (!opusMatch) return sdp;
      const pt = opusMatch[1];
      const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+(.+)`, 'i');
      if (fmtpRegex.test(sdp)) {
        return sdp.replace(fmtpRegex, (match, params) => {
          let p = params;
          if (!p.includes('useinbandfec')) p += ';useinbandfec=1';
          if (!p.includes('maxaveragebitrate')) p += ';maxaveragebitrate=64000';
          return `a=fmtp:${pt} ${p}`;
        });
      } else {
        return sdp.replace(opusMatch[0], `${opusMatch[0]}\r\na=fmtp:${pt} minptime=10;useinbandfec=1;maxaveragebitrate=64000;stereo=0`);
      }
    } catch (e) {
      return sdp;
    }
  }

  async restartIceForPeer(targetPeerId) {
    const peerData = this.peers.get(targetPeerId);
    if (!peerData || !peerData.pc) return;
    const pc = peerData.pc;
    try {
      console.log(`[WebRTC ICE] Aktif ICE restart başlatılıyor: ${targetPeerId}`);
      if (typeof pc.restartIce === 'function') {
        try { pc.restartIce(); } catch (e) {}
      }
      await this.initiateOffer(targetPeerId, pc, true);
    } catch (err) {
      console.warn(`[WebRTC] restartIceForPeer hatası (${targetPeerId}):`, err);
    }
  }

  async initiateOffer(targetPeerId, pc, isIceRestart = false) {
    try {
      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC] initiateOffer ertelendi (${targetPeerId}), state: ${pc.signalingState}`);
        return;
      }
      const options = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      };
      if (isIceRestart) {
        options.iceRestart = true;
      }
      const offer = await pc.createOffer(options);
      if (offer && offer.sdp) {
        offer.sdp = this.setOpusDspParams(offer.sdp);
      }
      await pc.setLocalDescription(offer);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'signal-offer',
          targetId: targetPeerId,
          offer: pc.localDescription
        }));
      }
    } catch (err) {
      console.error(`[WebRTC] Offer oluşturma hatası (${targetPeerId}):`, err);
    }
  }

  // Handle incoming Offer from remote peer
  async handleOffer(senderId, offer) {
    let peerData = this.peers.get(senderId);
    let pc = peerData?.pc;
    if (pc && (pc.connectionState === 'closed' || pc.connectionState === 'failed')) {
      this.closePeer(senderId);
      pc = null;
    }
    if (!pc) {
      pc = this.createPeerConnection(senderId, false);
      peerData = this.peers.get(senderId);
    }

    try {
      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC] handleOffer glare detected for ${senderId}, state: ${pc.signalingState}`);
        await Promise.all([
          pc.setLocalDescription({ type: 'rollback' }).catch(() => {})
        ]);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush queued candidates that arrived before remoteDescription was set
      if (peerData.candidateQueue && peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        peerData.candidateQueue = [];
      }

      const answer = await pc.createAnswer();
      if (answer && answer.sdp) {
        answer.sdp = this.setOpusDspParams(answer.sdp);
      }
      await pc.setLocalDescription(answer);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'signal-answer',
          targetId: senderId,
          answer: pc.localDescription
        }));
      }
    } catch (err) {
      console.error(`[WebRTC] Answer oluşturma hatası (${senderId}):`, err);
    }
  }

  // Handle incoming Answer
  async handleAnswer(senderId, answer) {
    const peerData = this.peers.get(senderId);
    if (!peerData) return;

    try {
      await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));

      // Flush queued candidates
      if (peerData.candidateQueue && peerData.candidateQueue.length > 0) {
        for (const cand of peerData.candidateQueue) {
          try { await peerData.pc.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) {}
        }
        peerData.candidateQueue = [];
      }
    } catch (err) {
      console.error(`[WebRTC] Remote description hatası (${senderId}):`, err);
    }
  }

  // Handle incoming ICE candidate
  async handleCandidate(senderId, candidate) {
    if (!candidate) return;
    const peerData = this.peers.get(senderId);
    if (!peerData) {
      if (!this.pendingCandidates) this.pendingCandidates = new Map();
      if (!this.pendingCandidates.has(senderId)) this.pendingCandidates.set(senderId, []);
      this.pendingCandidates.get(senderId).push(candidate);
      return;
    }

    if (!peerData.pc.remoteDescription || !peerData.pc.remoteDescription.type) {
      peerData.candidateQueue.push(candidate);
      return;
    }

    try {
      await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error(`[WebRTC] ICE candidate ekleme hatası (${senderId}):`, err);
    }
  }

  setLocalStream(stream) {
    this.localStream = stream;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        for (const [peerId, peerData] of this.peers.entries()) {
          try {
            const senders = peerData.pc.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
            if (audioSender) {
              audioSender.replaceTrack(audioTrack).catch(e => console.warn(e));
            } else {
              peerData.pc.addTrack(audioTrack, stream);
              this.initiateOffer(peerId, peerData.pc);
            }
          } catch (e) {
            console.warn('[WebRTC] replaceTrack error:', e);
          }
        }
      }
    }
  }

  setCameraStream(stream) {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => {
        for (const [, peerData] of this.peers.entries()) {
          try {
            const senders = peerData.pc.getSenders();
            const sender = senders.find(s => s.track === track);
            if (sender) peerData.pc.removeTrack(sender);
          } catch (e) {}
        }
      });
    }

    this.cameraStream = stream;

    for (const [peerId, peerData] of this.peers.entries()) {
      try {
        if (stream) {
          stream.getTracks().forEach(t => peerData.pc.addTrack(t, stream));
        }
        this.initiateOffer(peerId, peerData.pc);
      } catch (err) {
        console.warn(`[WebRTC] Camera track güncelleme hatası (${peerId}):`, err);
      }
    }
  }

  setScreenStream(stream) {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        for (const [, peerData] of this.peers.entries()) {
          try {
            const senders = peerData.pc.getSenders();
            const sender = senders.find(s => s.track === track);
            if (sender) peerData.pc.removeTrack(sender);
          } catch (e) {}
        }
      });
    }

    this.screenStream = stream;

    for (const [peerId, peerData] of this.peers.entries()) {
      try {
        if (stream) {
          stream.getTracks().forEach(t => peerData.pc.addTrack(t, stream));
        }
        this.initiateOffer(peerId, peerData.pc);
      } catch (err) {
        console.warn(`[WebRTC] Screen track güncelleme hatası (${peerId}):`, err);
      }
    }
  }

  closePeer(peerId) {
    const peerData = this.peers.get(peerId);
    if (peerData) {
      try {
        peerData.pc.close();
      } catch (e) {}
      this.peers.delete(peerId);
    }
    if (this.pendingCandidates) {
      this.pendingCandidates.delete(peerId);
    }

    if (this.onPeerDisconnected) {
      this.onPeerDisconnected(peerId);
    }
  }

  closeAllPeers() {
    for (const peerId of this.peers.keys()) {
      this.closePeer(peerId);
    }
  }
}

window.WebRTCClient = WebRTCClient;
