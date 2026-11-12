process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL UNHANDLED REJECTION]', reason);
});

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');
const { ensureSslCertificates, getLocalIPv4Addresses } = require('./ssl-helper');
const webpush = require('web-push');

// Initialize Web Push VAPID keys (persisted in data/vapid.json)
const VAPID_FILE = path.join(__dirname, 'data', 'vapid.json');
let vapidKeys = null;
try {
  if (fs.existsSync(VAPID_FILE)) {
    vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('[VAPID] Read error:', e.message);
}

if (!vapidKeys || !vapidKeys.publicKey || !vapidKeys.privateKey) {
  try {
    vapidKeys = webpush.generateVAPIDKeys();
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf8');
    console.log('[VAPID] Generated and saved new VAPID keys to data/vapid.json');
  } catch (e) {
    console.warn('[VAPID] Generation error:', e.message);
  }
}

if (vapidKeys && vapidKeys.publicKey && vapidKeys.privateKey) {
  try {
    webpush.setVapidDetails(
      'mailto:admin@talkapp.local',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (e) {
    console.warn('[VAPID] setVapidDetails error:', e.message);
  }
}

const PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
const USE_HTTPS = process.env.USE_HTTPS === 'true' || process.argv.includes('--https');

const app = express();

// Hardened Security Headers Middleware (OWASP A05 & ISO 27001)
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=*, camera=*, display-capture=*');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http: blob: https://i.ytimg.com https://*.ytimg.com; media-src 'self' data: blob: https: http:; connect-src 'self' ws: wss: https: http: https://*.youtube.com https://*.googlevideo.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com https://music.youtube.com https://stream.zeno.fm https://*.zeno.fm; child-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://youtube.com;");
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(db.UPLOADS_DIR));

// Server status API
app.get('/api/status', (req, res) => {
  const allChannels = db.getAllChannels();
  res.json({
    status: 'online',
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    connectedUsers: clients.size,
    voiceRooms: voiceRooms.size,
    textChannels: allChannels.text.length,
    voiceChannels: allChannels.voice.length,
    database: 'SQLite (Persistent)'
  });
});

// Web Push VAPID and Subscription API
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys ? vapidKeys.publicKey : null });
});

app.post('/api/push/subscribe', (req, res) => {
  const { userId, subscription } = req.body || {};
  if (!userId || !subscription) return res.status(400).json({ error: 'Missing userId or subscription' });
  db.savePushSubscription(userId, subscription);
  res.json({ success: true });
});

// High-Availability WebRTC ICE Servers (STUN & TURN for CGNAT / Symmetric NAT traversal)
app.get('/api/ice-servers', (req, res) => {
  const defaultIceServers = [
    // Fast Public STUNs
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },

    // Free Global TURN Relays (UDP + TCP on ports 80 & 443)
    // Ensures audio and video pass through all CGNATs and strict firewalls
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

  if (process.env.TURN_URL) {
    defaultIceServers.unshift({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME || 'talkapp',
      credential: process.env.TURN_CREDENTIAL || 'talkapppass'
    });
  }

  res.json({
    iceServers: defaultIceServers,
    turnEnabled: true
  });
});

// Server Invite Metadata API
app.get(['/api/invite', '/api/invite/:code'], (req, res) => {
  const code = req.params.code || 'talkapp-community';
  const allChannels = db.getAllChannels();
  res.json({
    valid: true,
    code: code,
    serverName: db.getServerSettings().serverName,
    onlineCount: clients.size,
    voiceRoomCount: voiceRooms.size,
    textChannelCount: allChannels.text.length,
    voiceChannelCount: allChannels.voice.length
  });
});

// Admin Raw Database Backup Download (Hardened with Header Support & Audit Logging)
app.get('/api/admin/backup-download', (req, res) => {
  const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null) ||
                req.headers['x-admin-token'] ||
                req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Yetkilendirme tokenı gerekli!' });
  }
  const user = db.verifyToken(token);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Sadece yöneticiler veritabanı yedeğini indirebilir!' });
  }

  const result = db.checkpointAndCreateBackup();
  if (!result.success) {
    return res.status(500).json({ error: 'Yedek oluşturulamadı: ' + result.error });
  }
  db.logAudit('BACKUP_DOWNLOAD', user.id, user.username, null, null, `Yönetici veritabanı yedeğini indirdi: ${path.basename(result.backupPath)}`);
  res.download(result.backupPath, path.basename(result.backupPath));
});

// --- STANDARD WEBHOOK REST API (Hardened with Secret Token Validation) ---
// Supports CS2, Minecraft, FiveM, Rust, GitHub & Standard JSON Webhook formats!
app.post(['/api/webhook/:channelId', '/api/webhook'], (req, res) => {
  const expectedSecret = db.getWebhookSecret();
  const providedSecret = req.headers['x-webhook-secret'] || 
                         req.query.secret || 
                         req.query.token || 
                         (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Yetkisiz erişim: Geçersiz veya eksik Webhook Secret token!' });
  }

  const targetChannelId = req.params.channelId || req.body.channelId || 'text-duyuru';
  const ch = db.getChannelById(targetChannelId);
  if (!ch) {
    return res.status(404).json({ error: 'Kanal bulunamadı!' });
  }

  // Handle standard payload { content: "...", username: "...", avatar_url: "..." }
  // or Simple payload { text: "...", sender: "..." }
  const messageText = req.body.content || req.body.text || '';
  const senderName = req.body.username || req.body.sender || '🤖 Oyun Webhook Botu';
  const avatarUrl = req.body.avatar_url || null;

  if (!messageText.trim() && !req.body.embeds) {
    return res.status(400).json({ error: 'Mesaj metni boş olamaz.' });
  }

  let fullText = messageText;
  if (req.body.embeds && Array.isArray(req.body.embeds)) {
    req.body.embeds.forEach(embed => {
      if (embed.title) fullText += `\n**${embed.title}**`;
      if (embed.description) fullText += `\n${embed.description}`;
    });
  }

  const rawMsg = {
    id: 'webhook_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    channelId: targetChannelId,
    senderId: 'bot_webhook',
    senderName: senderName,
    senderRole: 'admin',
    text: fullText.trim(),
    image: avatarUrl,
    audioNote: null,
    isPinned: false,
    reactions: {},
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  const savedMsg = db.saveMessage(rawMsg);

  broadcastAll({
    type: 'new-text-channel-msg',
    message: savedMsg
  });

  db.logAudit('WEBHOOK_POST', 'webhook', senderName, ch.id, ch.name, `Webhook mesajı iletildi: ${savedMsg.text.substring(0, 40)}`);
  console.log(`[Webhook] Mesaj alındı -> ${ch.name}: ${savedMsg.text.substring(0, 40)}`);
  res.json({ success: true, messageId: savedMsg.id, channel: ch.name });
});

// --- TALKAPP COMPANION DESKTOP HELPER API ---
app.post('/api/companion/hotkey', (req, res) => {
  const { token, action } = req.body || {};
  if (!token || !action) {
    return res.status(400).json({ error: 'token and action are required' });
  }

  const entry = companionTokens.get(token);
  if (!entry || !entry.ws || entry.ws.readyState !== 1 /* OPEN */) {
    return res.json({ ok: true, forwarded: false, message: 'Web client not connected or pairing token not found' });
  }

  try {
    entry.lastSeen = Date.now();
    entry.ws.send(JSON.stringify({
      type: 'companion-hotkey',
      action: action,
      timestamp: Date.now()
    }));
    return res.json({ ok: true, forwarded: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to forward action: ' + err.message });
  }
});

app.post('/api/companion/heartbeat', (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const entry = companionTokens.get(token);
  const isPaired = !!(entry && entry.ws && entry.ws.readyState === 1);

  if (isPaired) {
    entry.lastSeen = Date.now();
    try {
      entry.ws.send(JSON.stringify({
        type: 'companion-status',
        connected: true,
        timestamp: Date.now()
      }));
    } catch { }
  }

  return res.json({ ok: true, paired: isPaired });
});

app.get('/api/companion/status', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'token is required' });
  const entry = companionTokens.get(token);
  const isPaired = !!(entry && entry.ws && entry.ws.readyState === 1);
  return res.json({ paired: isPaired });
});

let sslCredentials = null;
try {
  const sslDir = path.join(__dirname, 'ssl');
  const sslInfo = ensureSslCertificates(sslDir);
  sslCredentials = { cert: sslInfo.cert, key: sslInfo.key };
  if (sslInfo.generated) {
    console.log(`[SSL] Yeni otomatik imzalı (Self-Signed) X.509 sertifikası üretildi: ${sslInfo.certPath}`);
  }
  // Allow downloading public certificate (never the private key) for optional OS/browser root trust
  app.get('/ssl/talkapp-cert.crt', (req, res) => {
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="talkapp-local-ca.crt"');
    res.send(sslCredentials.cert);
  });
} catch (err) {
  console.warn('[SSL] Otomatik sertifika üretilemedi:', err.message);
}

let server;
let httpsCompanionServer = null;

if (USE_HTTPS && sslCredentials) {
  server = https.createServer(sslCredentials, app);
  console.log('[TALKAPP] Ana port üzerinde doğrudan HTTPS / WSS modu aktif.');
} else {
  server = http.createServer(app);
  if (sslCredentials && process.env.DISABLE_HTTPS_COMPANION !== 'true' && HTTPS_PORT !== PORT) {
    httpsCompanionServer = https.createServer(sslCredentials, app);
  }
}

const wss = new WebSocketServer({ noServer: true });

function handleWsUpgrade(request, socket, head) {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
}

server.on('upgrade', handleWsUpgrade);
if (httpsCompanionServer) {
  httpsCompanionServer.on('upgrade', handleWsUpgrade);
}

const ROLE_LEVELS = { admin: 4, mod: 3, vip: 2, member: 1 };
const voiceRooms = new Map();
const clients = new Map();
const companionTokens = new Map(); // token -> { ws, lastSeen }

// Voice Room Music/Radio Bot State: voiceRoomId -> { isPlaying, stationUrl, stationName, time }
const roomMusicStates = new Map();

// Voice Room Watch Party (Birlikte YouTube İzleme) State: voiceRoomId -> { videoId, state, currentTime, updatedAt, title, setBy }
const roomWatchPartyStates = new Map();

// Role Permissions Cache
let cachedRolePermissions = db.getRolePermissions();

function hasRolePermission(role, permissionKey) {
  if (role === 'admin') return true;
  const rolePerms = cachedRolePermissions[role] || {};
  if (Array.isArray(rolePerms)) return rolePerms.includes(permissionKey);
  if (rolePerms[permissionKey] !== undefined) return !!rolePerms[permissionKey];
  return true;
}

// Mini Party Games State & Banks
const triviaGames = new Map(); // channelId -> { gameId, qObj, startTime, timeoutHandle, answered: Set }
const sayiGames = new Map(); // channelId -> { target, guesses: 0, startedBy }
const kelimeGames = new Map(); // channelId -> { original, scrambled, startedBy }

const TRIVIA_BANK = [
  { q: "Half-Life serisindeki ikonik levye (crowbar) hangi renktedir?", opts: ["Kırmızı", "Mavi", "Yeşil", "Siyah"], a: 0 },
  { q: "The Witcher serisinin ana karakteri Geralt hangi okuldan yetişmiştir?", opts: ["Kedi Okulu", "Kurt Okulu", "Ayı Okulu", "Engerek Okulu"], a: 1 },
  { q: "Minecraft'ta Nether portalı inşa etmek için hangi blok gereklidir?", opts: ["Obsidyen", "Bedrock", "Ağlayan Obsidyen", "Lav Taşı"], a: 0 },
  { q: "GTA San Andreas'ın ana karakterinin adı nedir?", opts: ["Tommy Vercetti", "Niko Bellic", "Carl Johnson (CJ)", "Claude Speed"], a: 2 },
  { q: "Dark Souls oyunundaki meşhur ifade hangisidir?", opts: ["Praise the Sun!", "Fear the Blood!", "Stay awhile!", "Wake up, Samurai!"], a: 0 },
  { q: "CS2 / CS:GO'da C4 kurulduktan sonra patlamasına kaç saniye kalır?", opts: ["35 saniye", "40 saniye", "45 saniye", "30 saniye"], a: 1 },
  { q: "League of Legends haritasında Baron Nashor kaçıncı dakikada doğar?", opts: ["15. Dakika", "20. Dakika", "25. Dakika", "10. Dakika"], a: 1 },
  { q: "Skyrim'deki en meşhur ejderha nidası (shout) hangisidir?", opts: ["Fus Ro Dah", "Yol Toor Shul", "Wuld Nah Kest", "Lok Vah Koor"], a: 0 },
  { q: "Cyberpunk 2077 oyununun geçtiği şehrin adı nedir?", opts: ["Los Santos", "Night City", "Raccoon City", "Gotham"], a: 1 },
  { q: "Valorant'ta düşmanları canlandırabilen Çinli şifacı ajan kimdir?", opts: ["Jett", "Sage", "Viper", "Reyna"], a: 1 },
  { q: "Portal oyunundaki meşhur yapay zekanın adı nedir?", opts: ["Cortana", "GLaDOS", "SHODAN", "HAL 9000"], a: 1 },
  { q: "Fallout serisindeki meşhur maskot çocuğun adı nedir?", opts: ["Vault Boy", "Pip-Boy", "Nuka Kid", "Atom Boy"], a: 0 }
];

const KELIME_BANK = [
  "VALORANT", "MINECRAFT", "CYBERPUNK", "THEWITCHER", "PLAYSTATION",
  "HEADSHOT", "DISCORD", "STREAMER", "KULAKLIK", "KLAVYE", "EKRAN",
  "NINTENDO", "COUNTERSTRIKE", "OVERWATCH", "FORTNITE", "ASSASSIN"
];

function sendSystemBotMessage(channelId, text, extra = {}) {
  const rawMsg = {
    id: 'msg_sys_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    channelId: channelId,
    senderId: 'sys_party_bot',
    senderName: '🎮 TalkApp Parti Botu',
    senderRole: 'admin',
    text: text,
    image: null,
    audioNote: null,
    poll: extra.poll || null,
    isPinned: false,
    reactions: {},
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  const saved = db.saveMessage(rawMsg);
  broadcastAll({
    type: 'new-text-channel-msg',
    message: saved
  });
  return saved;
}

function getDmKey(idA, idB) {
  return [idA, idB].sort().join(':');
}

function broadcastAll(payload) {
  const json = JSON.stringify(payload);
  for (const [wsClient] of clients.entries()) {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(json);
    }
  }
}

function broadcastToServer(serverId, payload) {
  const json = JSON.stringify(payload);
  for (const [wsClient, c] of clients.entries()) {
    if (wsClient.readyState === WebSocket.OPEN && (c.currentServerId === serverId || serverId === 'all')) {
      wsClient.send(json);
    }
  }
}

function getMembersForServer(serverId) {
  if (!serverId || serverId === 'home') return [];
  let dbMembers = [];
  try {
    if (typeof db.getServerMembers === 'function') {
      dbMembers = db.getServerMembers(serverId);
    }
  } catch (e) {
    console.error('[DB] getServerMembers error:', e.message);
  }

  const liveClientsById = new Map();
  for (const [, c] of clients.entries()) {
    if (c.id) {
      liveClientsById.set(c.id, c);
    }
  }

  const result = [];
  const seenIds = new Set();

  for (const m of dbMembers) {
    seenIds.add(m.id);
    const live = liveClientsById.get(m.id);
    result.push({
      id: m.id,
      name: m.name || 'İsimsiz',
      role: m.serverRole || m.role || 'member',
      status: live ? (live.status || 'online') : 'offline',
      gameActivity: live ? (live.gameActivity || '') : (m.gameActivity || ''),
      avatarUrl: live ? (live.avatarUrl || m.avatarUrl || '') : (m.avatarUrl || ''),
      badge: m.badge || (live ? live.badge : ''),
      voiceRoomId: (live && live.currentServerId === serverId) ? live.voiceRoomId : null,
      muted: live ? !!live.muted : false,
      deafened: live ? !!live.deafened : false,
      screen: live ? !!live.screen : false,
      serverMuted: live ? !!live.serverMuted : false,
      isOnline: !!live,
      roles: m.roles || [],
      roleIds: m.roleIds || [],
      topRole: m.topRole || null,
      roleColor: m.roleColor || null,
      roleHoist: !!m.roleHoist,
      hoistRole: m.hoistRole || null,
      topRoleName: m.topRoleName || (m.role === 'admin' ? 'Yönetici' : 'Üye')
    });
  }

  for (const [, c] of clients.entries()) {
    if (c.currentServerId === serverId && !seenIds.has(c.id)) {
      seenIds.add(c.id);
      result.push({
        id: c.id,
        name: c.name || 'Misafir',
        role: c.role || 'member',
        status: c.status || 'online',
        gameActivity: c.gameActivity || '',
        avatarUrl: c.avatarUrl || '',
        badge: c.badge || '',
        voiceRoomId: c.voiceRoomId,
        muted: !!c.muted,
        deafened: !!c.deafened,
        screen: !!c.screen,
        serverMuted: !!c.serverMuted,
        isOnline: true,
        roles: [],
        roleIds: [],
        topRole: null,
        roleColor: null,
        roleHoist: false,
        hoistRole: null,
        topRoleName: 'Misafir'
      });
    }
  }

  const roleWeights = { owner: 100, admin: 90, mod: 80, vip: 50, member: 10 };
  result.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    const posA = a.hoistRole?.position ?? a.topRole?.position ?? (roleWeights[a.role] || 0);
    const posB = b.hoistRole?.position ?? b.topRole?.position ?? (roleWeights[b.role] || 0);
    if (posA !== posB) return posB - posA;
    return (a.name || '').localeCompare(b.name || '');
  });

  return result;
}

function broadcastMemberList(targetServerId = null) {
  if (targetServerId && targetServerId !== 'home') {
    const members = getMembersForServer(targetServerId);
    const payload = JSON.stringify({
      type: 'server-members',
      serverId: targetServerId,
      members: members
    });
    for (const [wsClient, c] of clients.entries()) {
      if (wsClient.readyState === WebSocket.OPEN && c.currentServerId === targetServerId) {
        wsClient.send(payload);
      }
    }
    return;
  }

  const activeServers = new Set();
  for (const [, c] of clients.entries()) {
    if (c.currentServerId && c.currentServerId !== 'home') {
      activeServers.add(c.currentServerId);
    }
  }
  if (activeServers.size === 0) activeServers.add('srv_default');

  for (const sId of activeServers) {
    const members = getMembersForServer(sId);
    const payload = JSON.stringify({
      type: 'server-members',
      serverId: sId,
      members: members
    });
    for (const [wsClient, c] of clients.entries()) {
      if (wsClient.readyState === WebSocket.OPEN && c.currentServerId === sId) {
        wsClient.send(payload);
      }
    }
  }
}

async function sendPushNotification(targetUserId, payload) {
  if (!targetUserId || !vapidKeys) return;
  try {
    const subs = db.getPushSubscriptions(targetUserId);
    if (!subs || !subs.length) return;
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      webpush.sendNotification(pushSub, payloadStr).catch(err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.deletePushSubscription(sub.endpoint);
        }
      });
    }
  } catch (err) {
    console.warn('[sendPushNotification Error]:', err.message);
  }
}

function enrichFriendsWithLiveStatus(userId) {
  const friends = db.getFriends(userId);
  const liveMap = new Map();
  for (const [wsClient, c] of clients.entries()) {
    if (wsClient.readyState === WebSocket.OPEN && c.id) {
      liveMap.set(c.id, c);
    }
  }
  return friends.map(f => {
    const live = liveMap.get(f.id);
    const liveStatus = live ? (live.status || 'online') : 'offline';
    const liveGame = live ? (live.gameActivity || f.gameActivity || '') : '';
    const liveAvatar = (live && live.avatarUrl) ? live.avatarUrl : (f.avatarUrl || '');
    return {
      ...f,
      user_status: liveStatus,
      onlineStatus: liveStatus,
      gameActivity: liveGame,
      game_activity: liveGame,
      avatarUrl: liveAvatar,
      avatar_url: liveAvatar
    };
  });
}

function hasPermission(userRole, requiredRole) {
  if (!requiredRole || requiredRole === 'member' || requiredRole === 'all') return true;
  const userLvl = ROLE_LEVELS[userRole] || 1;
  const reqLvl = ROLE_LEVELS[requiredRole] || 1;
  return userLvl >= reqLvl;
}

function applyAuthenticatedUserToClient(client, user, ws) {
  const oldId = client.id;
  const oldName = client.name;
  client.id = user.id;
  client.name = user.username;
  client.role = user.role;
  client.status = user.status || 'online';
  client.gameActivity = user.gameActivity || '';
  client.avatarUrl = user.avatarUrl || '';
  client.badge = user.badge || '';

  // If client is in a voice room, seamlessly migrate room membership
  if (client.voiceRoomId && voiceRooms.has(client.voiceRoomId)) {
    const room = voiceRooms.get(client.voiceRoomId);
    if (oldId && oldId !== client.id) {
      room.delete(oldId);
      broadcastToVoiceRoom(client.voiceRoomId, {
        type: 'peer-left',
        peerId: oldId
      }, client.id);
    }
    room.set(client.id, {
      id: client.id,
      name: client.name,
      role: client.role,
      avatarUrl: client.avatarUrl,
      badge: client.badge,
      ws: ws,
      muted: !!client.muted,
      deafened: !!client.deafened,
      camera: !!client.camera,
      screen: !!client.screen
    });
    broadcastToVoiceRoom(client.voiceRoomId, {
      type: 'peer-joined',
      peer: {
        id: client.id,
        name: client.name,
        role: client.role,
        avatarUrl: client.avatarUrl,
        badge: client.badge,
        muted: !!client.muted,
        deafened: !!client.deafened,
        camera: !!client.camera,
        screen: !!client.screen
      }
    }, client.id);
  }

  const userServers = db.getUserServers(user.id);
  if (!userServers.some(s => s.id === client.currentServerId)) {
    client.currentServerId = userServers[0]?.id || 'srv_default';
  }
  const activeServer = db.getServerById(client.currentServerId);
  const channels = db.getAllChannels(client.currentServerId);
  const myRole = db.getUserServerRole(client.currentServerId, user.id) || user.role;

  ws.send(JSON.stringify({
    type: 'auth-success',
    user: user,
    vapidPublicKey: vapidKeys ? vapidKeys.publicKey : null,
    oldId: oldId,
    oldName: oldName,
    servers: userServers,
    currentServerId: client.currentServerId,
    activeServer: activeServer,
    channels: channels,
    serverSettings: {
      serverId: activeServer ? activeServer.id : 'srv_default',
      serverName: activeServer ? activeServer.name : 'TalkApp Sunucusu',
      serverIcon: activeServer ? activeServer.icon : '🎮',
      serverDesc: activeServer ? activeServer.description : '',
      inviteCode: activeServer ? activeServer.inviteCode : 'TALKAPP',
      ownerId: activeServer ? activeServer.ownerId : null,
      myRole: myRole
    },
    permissions: db.getUserPermissionsInServer(client.currentServerId, user.id)
  }));
  broadcastMemberList(client.currentServerId);
}

// WebSocket Heartbeat to clean up dead/zombie connections every 10s
const wsHeartbeatInterval = setInterval(() => {
  for (const [wsClient] of clients.entries()) {
    if (wsClient.isAlive === false) {
      try { wsClient.terminate(); } catch (e) {}
      continue;
    }
    wsClient.isAlive = false;
    try { wsClient.ping(); } catch (e) {}
  }
}, 10000);

wss.on('close', () => {
  clearInterval(wsHeartbeatInterval);
});

wss.on('connection', (ws, req) => {
  try {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const clientIp = (req && req.headers && req.headers['x-forwarded-for'])
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req?.socket?.remoteAddress || ws._socket?.remoteAddress || 'unknown');

    const clientId = 'user_' + Math.random().toString(36).substring(2, 9);
    const assignedRole = 'member';

    const client = {
      id: clientId,
      ip: clientIp,
      ws: ws,
      name: 'Oyuncu',
      role: assignedRole,
      status: 'online',
      gameActivity: '',
      avatarUrl: '',
      badge: '',
      voiceRoomId: null,
      activeDirectCallPartner: null,
      muted: false,
      deafened: false,
      camera: false,
      screen: false,
      serverMuted: false,
      currentServerId: 'srv_default'
    };

    clients.set(ws, client);
    try {
      db.saveUserProfile(client);
    } catch (e) {
      console.warn('[DB] Initial guest save warning:', e.message);
    }

    let userServers = [];
    try {
      if (typeof db.getUserServers === 'function') {
        userServers = db.getUserServers(client.id);
      }
    } catch (e) {
      console.error('[DB] getUserServers error:', e.message);
    }

    let activeServer = null;
    try {
      if (typeof db.getServerById === 'function') {
        activeServer = db.getServerById(client.currentServerId);
      }
    } catch (e) {}

    let channels = { text: [], voice: [] };
    try {
      if (typeof db.getAllChannels === 'function') {
        channels = db.getAllChannels(client.currentServerId);
      }
    } catch (e) {
      console.error('[DB] getAllChannels error:', e.message);
    }

    let serverSettings = {
      serverId: activeServer ? activeServer.id : 'srv_default',
      serverName: activeServer ? activeServer.name : 'TalkApp Sunucusu',
      serverIcon: activeServer ? activeServer.icon : '🎮',
      serverDesc: activeServer ? activeServer.description : 'Sesli, görüntülü ve mesajlaşma sunucusu',
      inviteCode: activeServer ? activeServer.inviteCode : 'TALKAPP-COMMUNITY',
      ownerId: activeServer ? activeServer.ownerId : null,
      myRole: client.role
    };

    try {
      ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        role: client.role,
        vapidPublicKey: vapidKeys ? vapidKeys.publicKey : null,
        servers: userServers,
        currentServerId: client.currentServerId,
        activeServer: activeServer,
        channels: channels,
        serverSettings: serverSettings,
        rolePermissions: cachedRolePermissions,
        permissions: db.getUserPermissionsInServer(client.currentServerId, client.id)
      }));
    } catch (e) {
      console.error('[WS Send Connected Error]:', e.message);
    }

    try {
      broadcastMemberList(client.currentServerId);
    } catch (e) {
      console.error('[WS Broadcast MemberList Error]:', e.message);
    }

    ws.on('message', (messageText) => {
      ws.isAlive = true;
      try {
        const data = JSON.parse(messageText);
        handleMessage(ws, data);
      } catch (err) {
        console.error('[WS Error] Mesaj işleme hatası:', err.message);
      }
    });

    ws.on('close', () => {
      try {
        handleDisconnect(ws);
      } catch (err) {
        console.error('[WS Disconnect Error]:', err.message);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS Client Error] ${clientId}:`, err.message);
    });
  } catch (err) {
    console.error('[WS Connection Fatal Handler Error]:', err);
  }
});

const authRateLimiter = new Map();

function checkAuthRateLimit(key) {
  const now = Date.now();
  const entry = authRateLimiter.get(key);
  if (entry && entry.lockedUntil > now) {
    const waitSec = Math.ceil((entry.lockedUntil - now) / 1000);
    return `⚠️ Güvenlik Kilidi: Çok fazla başarısız deneme! Lütfen ${waitSec} saniye bekleyin.`;
  }
  return null;
}

function recordAuthFailure(key) {
  const now = Date.now();
  let entry = authRateLimiter.get(key);
  if (!entry || entry.lockedUntil <= now) {
    entry = { attempts: 1, lockedUntil: 0, firstAttempt: now };
  } else {
    entry.attempts++;
  }
  if (entry.attempts >= 5) {
    entry.lockedUntil = now + 60000; // 60s cooldown
  }
  authRateLimiter.set(key, entry);
}

function resetAuthFailure(key) {
  authRateLimiter.delete(key);
}

// Chat spam / flood rate limiter: max 5 messages per 2 seconds per client
const chatRateLimits = new Map();

function isChatRateLimited(clientId) {
  const now = Date.now();
  const entry = chatRateLimits.get(clientId);
  if (!entry || now > entry.resetTime) {
    chatRateLimits.set(clientId, { count: 1, resetTime: now + 2000 });
    return false;
  }
  entry.count++;
  if (entry.count > 5) {
    return true;
  }
  return false;
}

function handleMessage(ws, data) {
  const client = clients.get(ws);
  if (!client) return;

  switch (data.type) {
    // --- COMPANION DESKTOP HELPER PAIRING ---
    case 'register-companion': {
      if (data.token && typeof data.token === 'string') {
        const cleanToken = data.token.trim();
        client.companionToken = cleanToken;
        companionTokens.set(cleanToken, { ws, lastSeen: Date.now() });
        ws.send(JSON.stringify({
          type: 'companion-registered',
          token: cleanToken
        }));
      }
      break;
    }

    // --- WEB PUSH SUBSCRIPTIONS ---
    case 'register-push-subscription': {
      if (client.id && data.subscription) {
        db.savePushSubscription(client.id, data.subscription);
      }
      break;
    }

    case 'unregister-push-subscription': {
      if (data.endpoint) {
        db.deletePushSubscription(data.endpoint);
      }
      break;
    }

    // --- AUTHENTICATION (KAYIT OL & GİRİŞ YAP) ---
    case 'auth-register': {
      const authKey = `${client.ip || 'ip'}:${(data.username || '').toLowerCase().trim()}`;
      const lockMsg = checkAuthRateLimit(authKey);
      if (lockMsg) {
        ws.send(JSON.stringify({ type: 'auth-error', message: lockMsg }));
        break;
      }
      try {
        const user = db.registerUser(data.username, data.password);
        resetAuthFailure(authKey);
        applyAuthenticatedUserToClient(client, user, ws);
        db.logAudit('USER_REGISTER', user.id, user.username, null, null, 'Yeni kullanıcı kaydoldu.');
        showToastToUser(ws, `🎉 Hoş geldin, ${user.username}! Hesabınız oluşturuldu.`);
      } catch (err) {
        recordAuthFailure(authKey);
        ws.send(JSON.stringify({ type: 'auth-error', message: err.message }));
      }
      break;
    }

    case 'auth-login': {
      const authKey = `${client.ip || 'ip'}:${(data.username || '').toLowerCase().trim()}`;
      const lockMsg = checkAuthRateLimit(authKey);
      if (lockMsg) {
        ws.send(JSON.stringify({ type: 'auth-error', message: lockMsg }));
        break;
      }
      try {
        const user = db.loginUser(data.username, data.password);
        resetAuthFailure(authKey);
        applyAuthenticatedUserToClient(client, user, ws);
        db.logAudit('USER_LOGIN', user.id, user.username, null, null, 'Kullanıcı başarıyla giriş yaptı.');
        showToastToUser(ws, `👋 Tekrar hoş geldin, ${user.username}!`);
      } catch (err) {
        recordAuthFailure(authKey);
        ws.send(JSON.stringify({ type: 'auth-error', message: err.message }));
      }
      break;
    }

    case 'auth-token': {
      const user = db.verifyToken(data.token);
      if (user) {
        applyAuthenticatedUserToClient(client, user, ws);
      } else {
        ws.send(JSON.stringify({ type: 'auth-token-invalid' }));
      }
      break;
    }

    case 'auth-logout': {
      if (data.token) {
        db.logoutUser(data.token);
      }
      client.id = 'user_' + Math.random().toString(36).substring(2, 9);
      client.name = 'Oyuncu';
      client.role = 'member';
      client.avatarUrl = '';
      client.badge = '';
      ws.send(JSON.stringify({ type: 'logout-success' }));
      broadcastMemberList();
      break;
    }

    // --- MULTI-SERVER (COMMUNITIES / GUILDS) & HOME ---
    case 'get-user-servers': {
      const servers = db.getUserServers(client.id);
      ws.send(JSON.stringify({
        type: 'user-servers-list',
        servers: servers,
        currentServerId: client.currentServerId
      }));
      break;
    }

    case 'switch-server': {
      const { serverId } = data;
      if (!serverId) break;

      if (serverId === 'home') {
        client.currentServerId = 'home';
        const friends = enrichFriendsWithLiveStatus(client.id);
        const dmConversations = db.getUserDmConversations(client.id);
        ws.send(JSON.stringify({
          type: 'home-view-active',
          friends: friends,
          dmConversations: dmConversations
        }));
        break;
      }

      const targetServer = db.getServerById(serverId);
      if (!targetServer) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sunucu bulunamadı!' }));
        break;
      }

      if (!db.isUserInServer(serverId, client.id)) {
        if (serverId === 'srv_default' || targetServer.isPublic) {
          db.joinServer(serverId, client.id, 'member');
        } else {
          ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuya erişim izniniz yok. Lütfen davet koduyla katılın.' }));
          break;
        }
      }

      client.currentServerId = serverId;
      const channels = db.getAllChannels(serverId);
      const members = getMembersForServer(serverId);
      const myRole = db.getUserServerRole(serverId, client.id) || client.role;

      ws.send(JSON.stringify({
        type: 'server-switched',
        serverId: serverId,
        server: targetServer,
        serverSettings: {
          serverId: targetServer.id,
          serverName: targetServer.name,
          serverIcon: targetServer.icon,
          serverDesc: targetServer.description,
          inviteCode: targetServer.inviteCode,
          ownerId: targetServer.ownerId,
          myRole: myRole
        },
        channels: channels,
        members: members,
        permissions: db.getUserPermissionsInServer(serverId, client.id)
      }));

      broadcastMemberList(serverId);
      break;
    }

    case 'create-server': {
      const { name, icon, description } = data;
      if (!name || !name.trim()) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Lütfen bir sunucu adı girin!' }));
        break;
      }
      try {
        const newServer = db.createServer({
          name: name.trim(),
          icon: icon || '🎮',
          description: description || '',
          ownerId: client.id
        });

        db.logAudit('CREATE_SERVER', client.id, client.name, newServer.id, newServer.name, 'Yeni sunucu oluşturuldu.');

        client.currentServerId = newServer.id;
        const updatedServers = db.getUserServers(client.id);
        const channels = db.getAllChannels(newServer.id);
        const members = getMembersForServer(newServer.id);

        ws.send(JSON.stringify({
          type: 'server-created',
          server: newServer,
          servers: updatedServers,
          currentServerId: newServer.id,
          serverSettings: {
            serverId: newServer.id,
            serverName: newServer.name,
            serverIcon: newServer.icon,
            serverDesc: newServer.description,
            inviteCode: newServer.inviteCode,
            ownerId: newServer.ownerId,
            myRole: 'owner'
          },
          channels: channels,
          members: members,
          permissions: db.getUserPermissionsInServer(newServer.id, client.id)
        }));

        showToastToUser(ws, `🎉 "${newServer.name}" sunucusu başarıyla oluşturuldu!`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Sunucu oluşturulamadı: ${err.message}` }));
      }
      break;
    }

    case 'join-server-by-code': {
      const { inviteCode } = data;
      if (!inviteCode || !inviteCode.trim()) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Lütfen geçerli bir davet kodu girin!' }));
        break;
      }
      const targetServer = db.getServerByInvite(inviteCode.trim());
      if (!targetServer) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Geçersiz veya bulunamayan davet kodu!' }));
        break;
      }

      try {
        db.joinServer(targetServer.id, client.id, 'member');
        db.logAudit('JOIN_SERVER', client.id, client.name, targetServer.id, targetServer.name, 'Davet koduyla sunucuya katıldı.');

        client.currentServerId = targetServer.id;
        const updatedServers = db.getUserServers(client.id);
        const channels = db.getAllChannels(targetServer.id);
        const members = getMembersForServer(targetServer.id);

        ws.send(JSON.stringify({
          type: 'server-joined',
          server: targetServer,
          servers: updatedServers,
          currentServerId: targetServer.id,
          serverSettings: {
            serverId: targetServer.id,
            serverName: targetServer.name,
            serverIcon: targetServer.icon,
            serverDesc: targetServer.description,
            inviteCode: targetServer.inviteCode,
            ownerId: targetServer.ownerId,
            myRole: 'member'
          },
          channels: channels,
          members: members,
          permissions: db.getUserPermissionsInServer(targetServer.id, client.id)
        }));

        broadcastMemberList(targetServer.id);
        showToastToUser(ws, `🚀 "${targetServer.name}" sunucusuna katıldınız!`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Katılma hatası: ${err.message}` }));
      }
      break;
    }

    case 'leave-server': {
      const { serverId } = data;
      const targetId = serverId || client.currentServerId;
      if (!targetId || targetId === 'srv_default') {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Ana genel topluluk sunucusundan ayrılamazsınız!' }));
        break;
      }
      const server = db.getServerById(targetId);
      if (!server) break;
      if (server.ownerId === client.id) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Sunucu sahibi sunucudan ayrılamaz. Sunucuyu silebilirsiniz.' }));
        break;
      }

      db.leaveServer(targetId, client.id);
      db.logAudit('LEAVE_SERVER', client.id, client.name, targetId, server.name, 'Sunucudan ayrıldı.');

      client.currentServerId = 'srv_default';
      const updatedServers = db.getUserServers(client.id);
      const defaultServer = db.getServerById('srv_default');
      const channels = db.getAllChannels('srv_default');
      const members = getMembersForServer('srv_default');

      ws.send(JSON.stringify({
        type: 'server-left',
        servers: updatedServers,
        currentServerId: 'srv_default',
        server: defaultServer,
        serverSettings: {
          serverId: defaultServer.id,
          serverName: defaultServer.name,
          serverIcon: defaultServer.icon,
          serverDesc: defaultServer.description,
          inviteCode: defaultServer.inviteCode,
          ownerId: defaultServer.ownerId,
          myRole: db.getUserServerRole('srv_default', client.id) || client.role
        },
        channels: channels,
        members: members
      }));

      broadcastMemberList(targetId);
      broadcastMemberList('srv_default');
      showToastToUser(ws, `👋 "${server.name}" sunucusundan ayrıldınız.`);
      break;
    }

    case 'delete-server': {
      const { serverId } = data;
      const targetId = serverId || client.currentServerId;
      if (!targetId || targetId === 'srv_default') {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Ana genel sunucu silinemez!' }));
        break;
      }
      const server = db.getServerById(targetId);
      if (!server) break;

      if (server.ownerId !== client.id && client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Yalnızca sunucu kurucusu sunucuyu silebilir!' }));
        break;
      }

      db.deleteServer(targetId, client.id);
      db.logAudit('DELETE_SERVER', client.id, client.name, targetId, server.name, 'Sunucu silindi.');

      for (const [wsClient, c] of clients.entries()) {
        if (c.currentServerId === targetId) {
          c.currentServerId = 'srv_default';
          const defaultServer = db.getServerById('srv_default');
          const updatedServers = db.getUserServers(c.id);
          const channels = db.getAllChannels('srv_default');
          const members = getMembersForServer('srv_default');

          wsClient.send(JSON.stringify({
            type: 'server-deleted-notify',
            deletedServerId: targetId,
            servers: updatedServers,
            currentServerId: 'srv_default',
            server: defaultServer,
            serverSettings: {
              serverId: defaultServer.id,
              serverName: defaultServer.name,
              serverIcon: defaultServer.icon,
              serverDesc: defaultServer.description,
              inviteCode: defaultServer.inviteCode,
              ownerId: defaultServer.ownerId,
              myRole: db.getUserServerRole('srv_default', c.id) || c.role
            },
            channels: channels,
            members: members
          }));
        }
      }
      broadcastMemberList('srv_default');
      showToastToUser(ws, `🗑️ "${server.name}" sunucusu başarıyla silindi.`);
      break;
    }

    case 'update-server-settings': {
      const { serverId, name, icon, description } = data;
      const targetId = serverId || client.currentServerId;
      const server = db.getServerById(targetId);
      if (!server) break;

      const userRole = db.getUserServerRole(targetId, client.id) || client.role;
      if (server.ownerId !== client.id && userRole !== 'owner' && userRole !== 'admin' && client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sunucu ayarlarını düzenleme yetkiniz yok!' }));
        break;
      }

      const updated = db.updateServer(targetId, { name, icon, description });
      db.logAudit('UPDATE_SERVER', client.id, client.name, targetId, updated.name, 'Sunucu ayarları güncellendi.');

      const payload = {
        type: 'server-updated',
        server: updated,
        serverSettings: {
          serverId: updated.id,
          serverName: updated.name,
          serverIcon: updated.icon,
          serverDesc: updated.description,
          inviteCode: updated.inviteCode,
          ownerId: updated.ownerId,
          myRole: userRole
        }
      };
      broadcastToServer(targetId, payload);
      showToastToUser(ws, `✅ "${updated.name}" sunucu ayarları güncellendi!`);
      break;
    }

    // --- FULL-TEXT HIZLI ARAMA ---
    case 'search-messages': {
      const results = db.searchMessages(data.query || '', data.channelId || null);
      ws.send(JSON.stringify({
        type: 'search-results',
        query: data.query,
        results: results
      }));
      break;
    }

    // --- MÜZİK / RADYO BOTU SENKRONİZASYONU ---
    case 'music-bot-command': {
      if (!client.voiceRoomId) return;
      const { command, stationUrl, stationName } = data;

      let state = roomMusicStates.get(client.voiceRoomId) || { isPlaying: false, stationUrl: '', stationName: '' };

      if (command === 'play') {
        state = { isPlaying: true, stationUrl: stationUrl || state.stationUrl, stationName: stationName || state.stationName };
      } else if (command === 'pause') {
        state.isPlaying = false;
      }

      roomMusicStates.set(client.voiceRoomId, state);

      broadcastToVoiceRoom(client.voiceRoomId, {
        type: 'music-bot-state',
        state: state,
        senderName: client.name
      });
      break;
    }

    // Profil ve Oyun Aktivitesi Güncelleme
    case 'set-profile': {
      if (data.name) {
        const cleanName = data.name.trim().substring(0, 32);
        if (cleanName && cleanName !== client.name) {
          try {
            db.changeUsername(client.id, cleanName);
            client.name = cleanName;
          } catch (err) {
            ws.send(JSON.stringify({ type: 'toast', message: `⚠️ ${err.message}` }));
          }
        }
      }
      if (data.status) client.status = data.status;
      if (data.gameActivity !== undefined) client.gameActivity = String(data.gameActivity).trim().substring(0, 50);
      if (data.avatarUrl !== undefined) {
        if (data.avatarUrl && typeof data.avatarUrl === 'string' && data.avatarUrl.startsWith('data:')) {
          client.avatarUrl = db.saveBase64File(data.avatarUrl, 'avatar', data.avatarFileName || 'avatar.png') || data.avatarUrl;
        } else {
          client.avatarUrl = data.avatarUrl;
        }
      }
      if (data.badge !== undefined) client.badge = data.badge;
      db.saveUserProfile(client);

      // Update voice room peer info if client is currently in a room
      if (client.voiceRoomId && voiceRooms.has(client.voiceRoomId)) {
        const room = voiceRooms.get(client.voiceRoomId);
        const p = room.get(client.id);
        if (p) {
          p.name = client.name;
          p.avatarUrl = client.avatarUrl;
          p.badge = client.badge;
        }
      }

      ws.send(JSON.stringify({
        type: 'profile-updated',
        avatarUrl: client.avatarUrl,
        badge: client.badge,
        name: client.name,
        status: client.status,
        gameActivity: client.gameActivity
      }));

      broadcastMemberList();
      break;
    }

    // Şifre Değiştirme
    case 'auth-change-password': {
      const { oldPassword, newPassword } = data;
      try {
        db.changePassword(client.id, oldPassword, newPassword);
        db.logAudit('PASSWORD_CHANGE', client.id, client.name, client.id, client.name, 'Kullanıcı şifresini güncelledi.');
        ws.send(JSON.stringify({
          type: 'toast',
          message: '🔑 Şifreniz başarıyla güncellendi!'
        }));
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'toast',
          message: `❌ Şifre güncellenemedi: ${err.message}`
        }));
      }
      break;
    }

    // Rol Güncelleme (Yönetici)
    case 'set-role': {
      const { targetUserId, newRole } = data;
      if (client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sadece yöneticiler rol değiştirebilir!' }));
        return;
      }
      if (!ROLE_LEVELS[newRole]) return;

      db.setUserRole(targetUserId, newRole);

      for (const [, targetClient] of clients.entries()) {
        if (targetClient.id === targetUserId) {
          targetClient.role = newRole;
          targetClient.ws.send(JSON.stringify({
            type: 'role-updated',
            role: newRole
          }));
          broadcastAll({
            type: 'toast',
            message: `👑 ${targetClient.name} artık bir [${newRole.toUpperCase()}]!`
          });
          db.logAudit('ROLE_CHANGE', client.id, client.name, targetClient.id, targetClient.name, `Rol [${newRole.toUpperCase()}] olarak değiştirildi.`);
          break;
        }
      }
      broadcastMemberList();
      break;
    }

    // MODERASYON: Sesten At (Kick from voice)
    case 'kick-voice-member': {
      const targetServerId = client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.kick_members && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda kullanıcıları sesten atma yetkiniz yok!' }));
        return;
      }
      const { targetUserId } = data;
      for (const [, targetClient] of clients.entries()) {
        if (targetClient.id === targetUserId && targetClient.voiceRoomId) {
          leaveVoiceRoom(targetClient.ws);
          targetClient.ws.send(JSON.stringify({
            type: 'kicked-from-voice',
            message: 'Yönetici tarafından ses kanalından çıkarıldınız!'
          }));
          broadcastAll({
            type: 'toast',
            message: `🛡️ ${targetClient.name} sesten çıkarıldı.`
          });
          db.logAudit('KICK_VOICE', client.id, client.name, targetClient.id, targetClient.name, 'Kullanıcı ses kanalından atıldı.');
          break;
        }
      }
      broadcastMemberList(targetServerId);
      break;
    }

    // MODERASYON: Kullanıcıyı Başka Ses Odasına Taşı (Move voice member / drag-drop)
    case 'move-voice-member': {
      const { targetUserId, targetChannelId } = data;
      const targetCh = db.getChannelById(targetChannelId);
      if (!targetCh || targetCh.type !== 'voice') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Geçerli bir ses kanalı seçilmedi!' }));
        return;
      }
      if (targetChannelId === 'temp-voice-creator') {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Bu kanala kullanıcı taşınamaz!' }));
        return;
      }

      const targetServerId = targetCh.serverId || data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.move_members && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda kullanıcıları taşıma yetkiniz yok!' }));
        return;
      }

      if (targetCh.userLimit > 0) {
        const existingRoom = voiceRooms.get(targetChannelId);
        const count = existingRoom ? existingRoom.size : 0;
        if (count >= targetCh.userLimit) {
          ws.send(JSON.stringify({ type: 'toast', message: `❌ Hedef ses odası dolu! (${count}/${targetCh.userLimit} Kişi)` }));
          return;
        }
      }

      let targetClient = null;
      for (const [, c] of clients.entries()) {
        if (c.id === targetUserId || (c.userId && c.userId === targetUserId)) {
          targetClient = c;
          break;
        }
      }

      if (targetClient && targetClient.voiceRoomId) {
        if (targetClient.voiceRoomId === targetChannelId) {
          return;
        }
        if (targetClient.ws && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: 'force-move-voice',
            channelId: targetChannelId,
            channelName: targetCh.name,
            movedBy: client.name
          }));
        }
        broadcastToServer(targetServerId, {
          type: 'toast',
          message: `🔀 ${targetClient.name}, ${client.name} tarafından [${targetCh.name}] odasına taşındı.`
        });
        db.logAudit('MOVE_VOICE', client.id, client.name, targetClient.id, targetClient.name, `Kullanıcı [${targetCh.name}] ses odasına taşındı.`);
      } else {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Kullanıcı şu an aktif bir ses odasında değil.' }));
      }
      break;
    }

    // MODERASYON: Sunucu Genelinde Sustur (Server Mute)
    case 'server-mute-member': {
      const targetServerId = client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.mute_members && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda kullanıcıları susturma yetkiniz yok!' }));
        return;
      }
      const { targetUserId, mute } = data;
      for (const [, targetClient] of clients.entries()) {
        if (targetClient.id === targetUserId) {
          targetClient.serverMuted = !!mute;
          targetClient.ws.send(JSON.stringify({
            type: 'server-mute-updated',
            serverMuted: targetClient.serverMuted
          }));
          broadcastAll({
            type: 'toast',
            message: `🔇 ${targetClient.name} ${mute ? 'susturuldu' : 'susturması kaldırıldı'}.`
          });
          db.logAudit('SERVER_MUTE', client.id, client.name, targetClient.id, targetClient.name, mute ? 'Kullanıcı sunucu genelinde susturuldu.' : 'Kullanıcının susturması kaldırıldı.');
          break;
        }
      }
      broadcastMemberList();
      break;
    }

    // SES PANOSU (SOUNDBOARD & ÖZEL SESLER)
    case 'play-soundboard': {
      if (!hasRolePermission(client.role, 'use_soundboard')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Ses panosu kullanma yetkiniz yok!' }));
        return;
      }
      if (!client.voiceRoomId) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Ses panosu kullanmak için ses odasında olmalısınız!' }));
        return;
      }
      broadcastToVoiceRoom(client.voiceRoomId, {
        type: 'soundboard-played',
        soundId: data.soundId,
        soundUrl: data.soundUrl || null,
        isCustom: !!data.isCustom,
        senderName: client.name,
        senderId: client.id
      }, client.id);
      break;
    }

    case 'get-custom-sounds': {
      ws.send(JSON.stringify({
        type: 'custom-sounds-list',
        sounds: db.getCustomSounds()
      }));
      break;
    }

    case 'upload-custom-sound': {
      if (!hasRolePermission(client.role, 'use_soundboard')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Ses panosuna ses yükleme yetkiniz yok!' }));
        return;
      }
      try {
        const audioPayload = data.audioData || data.dataUrl;
        const sound = db.saveCustomSound(data.name, audioPayload, client.name);
        broadcastAll({
          type: 'custom-sound-added',
          sound: sound
        });
        showToastToUser(ws, `🔊 "${sound.name}" ses panosuna eklendi!`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    case 'delete-custom-sound': {
      try {
        db.deleteCustomSound(data.soundId);
        broadcastAll({
          type: 'custom-sound-deleted',
          soundId: data.soundId
        });
        showToastToUser(ws, '🗑️ Özel ses silindi.');
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    // KANAL OLUŞTURMA (Sunucu, Kategori ve Kullanıcı Limiti destekli)
    case 'create-channel': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_channels && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda kanal oluşturma yetkiniz yok!' }));
        return;
      }
      const { channelType, name, category, minRole, password, userLimit } = data;
      const cleanName = (name || 'yeni-kanal').toLowerCase().replace(/[^a-z0-9_-ğüşıöçĞÜŞİÖÇ ]/gi, '-');
      const channelId = (channelType === 'voice' ? 'voice-' : 'text-') + Math.random().toString(36).substring(2, 7);
      const parsedLimit = channelType === 'voice' ? Math.max(0, Math.min(99, parseInt(userLimit, 10) || 0)) : 0;

      const channelObj = {
        id: channelId,
        serverId: targetServerId,
        name: (channelType === 'voice' ? '🔊 ' : '') + cleanName,
        type: channelType,
        category: (category || 'GENEL SOHBET').toUpperCase().trim(),
        minRole: minRole || 'member',
        password: password ? String(password).trim() : null,
        userLimit: parsedLimit
      };

      db.createChannel(channelObj);
      db.logAudit('CREATE_CHANNEL', client.id, client.name, channelObj.id, channelObj.name, `${channelType.toUpperCase()} kanalı oluşturuldu [${channelObj.category}]`);

      broadcastToServer(targetServerId, {
        type: 'channel-created',
        serverId: targetServerId,
        channel: {
          id: channelObj.id,
          serverId: targetServerId,
          name: channelObj.name,
          type: channelObj.type,
          category: channelObj.category,
          minRole: channelObj.minRole,
          hasPassword: !!channelObj.password,
          userLimit: channelObj.userLimit
        }
      });
      break;
    }

    // KANAL SİLME
    case 'delete-channel': {
      const { channelId } = data;
      const ch = db.getChannelById(channelId);
      if (!ch) return;

      const targetServerId = ch.serverId || ch.server_id || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_channels && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu kanalı silme yetkiniz yok!' }));
        return;
      }
      if (channelId === 'text-genel' || channelId === 'temp-voice-creator' || channelId === 'voice-genel' || channelId === 'genel-ses' || channelId === `text_${targetServerId}_genel` || channelId === `voice_${targetServerId}_ana`) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Varsayılan ana kanallar silinemez!' }));
        return;
      }
      if (ch) {
        // Eğer ses kanalıysa ve içinde kullanıcılar varsa hepsini temiz şekilde sesten çıkar
        if (voiceRooms.has(channelId)) {
          const room = voiceRooms.get(channelId);
          for (const [, peer] of room.entries()) {
            if (peer && peer.ws && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(JSON.stringify({
                type: 'kicked-from-voice',
                message: `Bulunduğunuz #${ch.name} kanalı silindi.`
              }));
              leaveVoiceRoom(peer.ws);
            }
          }
          voiceRooms.delete(channelId);
          roomMusicStates.delete(channelId);
          roomWatchPartyStates.delete(channelId);
        }
        for (const [, c] of clients.entries()) {
          if (c.voiceRoomId === channelId) {
            c.voiceRoomId = null;
            if (c.ws && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'kicked-from-voice',
                message: `Bulunduğunuz #${ch.name} kanalı silindi.`
              }));
            }
          }
        }

        db.deleteChannel(channelId);
        db.logAudit('DELETE_CHANNEL', client.id, client.name, channelId, ch.name, 'Kanal silindi.');
        broadcastToServer(targetServerId, {
          type: 'channel-deleted',
          serverId: targetServerId,
          channelId: channelId
        });
        broadcastMemberList(targetServerId);
        showToastToUser(ws, `🗑️ #${ch.name} kanalı silindi.`);
      }
      break;
    }

    // KANAL TAŞIMA / KATEGORİ DEĞİŞTİRME / SIRALAMA (Drag & Drop)
    case 'move-channel': {
      const { channelId, targetCategory, beforeChannelId, serverId } = data;
      const ch = db.getChannelById(channelId);
      if (!ch) return;

      const targetServerId = ch.serverId || serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_channels && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Kanalları taşıma yetkiniz yok!' }));
        return;
      }
      if (channelId === 'temp-voice-creator') {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Bu özel sistem kanalı taşınamaz.' }));
        return;
      }

      const cleanCat = (targetCategory || 'GENEL SOHBET').trim().toUpperCase();
      db.reorderChannel(channelId, cleanCat, beforeChannelId);
      db.logAudit('MOVE_CHANNEL', client.id, client.name, ch.id, ch.name, `Kanal [${cleanCat}] kategorisine taşındı.`);

      const updatedChannels = db.getAllChannels(targetServerId);
      broadcastToServer(targetServerId, {
        type: 'channels-reordered',
        serverId: targetServerId,
        channels: updatedChannels
      });
      break;
    }

    // METİN SOHBETİ & GEÇMİŞ (Sayfalama / Infinite Scroll destekli)
    case 'get-text-history': {
      const { channelId, password, beforeCreatedAt, limit } = data;
      const ch = db.getChannelById(channelId);
      if (!ch) return;

      if (!hasPermission(client.role, ch.minRole)) {
        ws.send(JSON.stringify({
          type: 'channel-access-denied',
          channelId: channelId,
          reason: 'Bu metin kanalına erişmek için yetkiniz yetersiz!'
        }));
        return;
      }

      if (ch.password && ch.password !== password) {
        ws.send(JSON.stringify({
          type: 'channel-password-required',
          channelId: channelId,
          channelName: ch.name
        }));
        return;
      }

      const fetchLimit = Math.min(100, Math.max(10, Number(limit) || 60));
      const msgs = db.getChannelMessages(channelId, fetchLimit, beforeCreatedAt || null);
      if (beforeCreatedAt) {
        ws.send(JSON.stringify({
          type: 'text-history-more',
          channelId: channelId,
          messages: msgs,
          hasMore: msgs.length >= fetchLimit
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'text-history',
          channelId: channelId,
          messages: msgs,
          hasMore: msgs.length >= fetchLimit
        }));
      }
      break;
    }

    case 'send-text-channel-msg': {
      if (isChatRateLimited(client.id)) {
        ws.send(JSON.stringify({ type: 'toast', message: '⏳ Lütfen çok hızlı mesaj göndermeyin! (Yavaş mod / Spam koruması)' }));
        return;
      }
      const { channelId, text, image, audioNote, file, fileName, fileSize, replyTo, poll } = data;
      const ch = db.getChannelById(channelId);
      if (!ch) return;

      if (!hasPermission(client.role, ch.minRole)) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu kanala mesaj gönderme yetkiniz yok.' }));
        return;
      }

      if (ch.adminOnlyPost && !hasPermission(client.role, 'mod')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu kanala yalnızca Yöneticiler yazabilir.' }));
        return;
      }

      if ((image || audioNote || file) && !hasRolePermission(client.role, 'upload_files')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Dosya veya medya yükleme yetkiniz yok!' }));
        return;
      }

      const cleanText = (text || '').trim().substring(0, 3000);
      if (!cleanText && !image && !audioNote && !file && !poll) return;

      if ((cleanText.includes('@everyone') || cleanText.includes('@hepsi')) && !hasRolePermission(client.role, 'mention_everyone')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ @everyone / @hepsi etiketleme yetkiniz yok!' }));
        return;
      }

      // MINI PARTİ OYUNLARI KOMUT YAKALAMA
      if (cleanText === '/trivia') {
        const qObj = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
        const gameId = 'triv_' + Date.now();
        if (triviaGames.has(channelId)) {
          clearTimeout(triviaGames.get(channelId).timeoutHandle);
        }
        const timeoutHandle = setTimeout(() => {
          if (triviaGames.get(channelId)?.gameId === gameId) {
            sendSystemBotMessage(channelId, `⏰ **Süre Doldu!** Kimse zamanında bilemedi. Doğru cevap: **${qObj.opts[qObj.a]}** idi.`);
            triviaGames.delete(channelId);
          }
        }, 25000);

        triviaGames.set(channelId, { gameId, qObj, timeoutHandle, answered: new Set() });

        sendSystemBotMessage(channelId, `🧠 **KİM BİLİR? TRIVIA OYUNU BAŞLADI!**\nSoru: **${qObj.q}**\n(Aşağıdaki seçeneklerden birine tıkla, 25 saniyen var!)`, {
          poll: {
            isTrivia: true,
            gameId: gameId,
            question: qObj.q,
            options: qObj.opts.map((opt, i) => ({ text: opt, idx: i, votes: [] }))
          }
        });
        return;
      }

      if (cleanText === '/sayi') {
        const target = Math.floor(Math.random() * 100) + 1;
        sayiGames.set(channelId, { target, guesses: 0, startedBy: client.name });
        sendSystemBotMessage(channelId, `🎯 **SAYI BULMACA OYUNU BAŞLADI!**\n1 ile 100 arasında aklımdan bir sayı tuttum. İlk doğru bilen kazanır!\nTahminde bulunmak için: \`/tahmin [sayı]\` yazınız.`);
        return;
      }

      if (cleanText.startsWith('/tahmin')) {
        const game = sayiGames.get(channelId);
        if (!game) {
          ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Şu an aktif bir sayı oyunu yok. Başlatmak için `/sayi` yazın!' }));
          return;
        }
        const parts = cleanText.split(' ');
        const guess = parseInt(parts[1], 10);
        if (isNaN(guess)) {
          ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Lütfen geçerli bir sayı girin: `/tahmin 42`' }));
          return;
        }
        game.guesses++;
        if (guess === game.target) {
          sayiGames.delete(channelId);
          sendSystemBotMessage(channelId, `🏆 **TEBRİKLER @${client.name}!**\nDoğru sayıyı buldun: **${guess}** (Toplam ${game.guesses} tahminde bilindi!) 🎯`);
        } else if (guess < game.target) {
          sendSystemBotMessage(channelId, `📈 @${client.name}: **${guess}** -> Daha **BÜYÜK** bir sayı söyle! ⬆️`);
        } else {
          sendSystemBotMessage(channelId, `📉 @${client.name}: **${guess}** -> Daha **KÜÇÜK** bir sayı söyle! ⬇️`);
        }
        return;
      }

      if (cleanText === '/kelime') {
        const word = KELIME_BANK[Math.floor(Math.random() * KELIME_BANK.length)];
        let arr = word.split('');
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        const scrambled = arr.join(' ');
        kelimeGames.set(channelId, { word, scrambled, startedBy: client.name });
        sendSystemBotMessage(channelId, `🔤 **KELİME AVI BAŞLADI!**\nKarışık harfler: 🧩 **[ ${scrambled} ]**\nDoğru kelimeyi ilk çözen kazanır! Tahmin için: \`/kelime [tahmin]\` yazın.`);
        return;
      }

      if (cleanText.startsWith('/kelime ')) {
        const game = kelimeGames.get(channelId);
        if (!game) {
          ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Şu an aktif bir kelime oyunu yok. Başlatmak için `/kelime` yazın!' }));
          return;
        }
        const guessWord = cleanText.substring(8).trim().toUpperCase();
        if (guessWord === game.word) {
          kelimeGames.delete(channelId);
          sendSystemBotMessage(channelId, `🏆 **TEBRİKLER @${client.name}!**\nHarfleri doğru çözdün: **${game.word}** 👏🔥`);
        } else {
          ws.send(JSON.stringify({ type: 'toast', message: `❌ "${guessWord}" doğru cevap değil!` }));
        }
        return;
      }

      const rawMsg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        channelId: channelId,
        senderId: client.id,
        senderName: client.name,
        senderRole: client.role,
        senderAvatar: client.avatarUrl || '',
        senderBadge: client.badge || '',
        text: cleanText,
        image: image || null,
        audioNote: audioNote || null,
        file: file || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        replyTo: replyTo || null,
        poll: poll || null,
        isPinned: false,
        reactions: {},
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const savedMsg = db.saveMessage(rawMsg);
      savedMsg.serverId = ch.serverId || ch.server_id || 'srv_default';

      broadcastAll({
        type: 'new-text-channel-msg',
        message: savedMsg
      });

      // Push notifications for mentions (@everyone, @hepsi, @Username)
      if (cleanText) {
        const mentionMatches = cleanText.match(/@([a-zA-Z0-9_\u00C0-\u017F-]+)/g);
        if (mentionMatches) {
          const mentionedNames = new Set(mentionMatches.map(m => m.substring(1).toLowerCase()));
          if (mentionedNames.has('everyone') || mentionedNames.has('hepsi')) {
            try {
              const serverMembers = db.getServerMembers(ch.serverId || ch.server_id || 'srv_default');
              for (const m of serverMembers) {
                if (m.id !== client.id) {
                  sendPushNotification(m.id, {
                    title: `📢 #${ch.name} - ${client.name}`,
                    body: cleanText,
                    icon: client.avatarUrl || '/icon-192.png',
                    badge: '/icon-192.png',
                    url: `/?ch=${channelId}`,
                    tag: `ch-${channelId}`
                  });
                }
              }
            } catch (e) {}
          } else {
            for (const name of mentionedNames) {
              try {
                const targetU = db.getUserByUsername(name);
                if (targetU && targetU.id !== client.id) {
                  sendPushNotification(targetU.id, {
                    title: `🔔 #${ch.name} - ${client.name} senden bahsetti`,
                    body: cleanText,
                    icon: client.avatarUrl || '/icon-192.png',
                    badge: '/icon-192.png',
                    url: `/?ch=${channelId}`,
                    tag: `ch-${channelId}`
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
      break;
    }

    case 'trivia-answer': {
      const { channelId, gameId, optionIndex } = data;
      let targetChannel = channelId;
      if (!targetChannel && gameId) {
        for (const [chId, g] of triviaGames.entries()) {
          if (g.gameId === gameId) { targetChannel = chId; break; }
        }
      }
      const game = targetChannel ? triviaGames.get(targetChannel) : null;
      if (!game || (gameId && game.gameId !== gameId)) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Bu soru süresi dolmuş veya cevaplanmış!' }));
        return;
      }
      if (game.answered.has(client.id)) {
        ws.send(JSON.stringify({ type: 'toast', message: '⚠️ Bu soruya zaten cevap verdiniz!' }));
        return;
      }
      game.answered.add(client.id);

      if (optionIndex === game.qObj.a) {
        clearTimeout(game.timeoutHandle);
        triviaGames.delete(targetChannel);
        sendSystemBotMessage(targetChannel, `🏆 **TEBRİKLER @${client.name}!** İlk doğru cevabı verdi!\nDoğru Cevap: **${game.qObj.opts[game.qObj.a]}** 🎯`);
        broadcastAll({
          type: 'toast',
          message: `🎉 @${client.name} Trivia sorusunu doğru bildi!`
        });
      } else {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Yanlış cevap, tekrar deneyemezsin!' }));
      }
      break;
    }

    // EMOJI TEPKİLERİ
    case 'toggle-reaction': {
      const { channelId, messageId, emoji, isDm } = data;
      const updatedReactions = db.toggleReaction(messageId, emoji, client.id);

      broadcastAll({
        type: 'reaction-updated',
        channelId: channelId,
        messageId: messageId,
        reactions: updatedReactions,
        isDm: !!isDm
      });
      break;
    }

    // SABİTLENMİŞ MESAJLAR
    case 'toggle-pin-message': {
      const { channelId, messageId, isDm } = data;
      const isPinned = db.togglePinMessage(messageId);

      broadcastAll({
        type: 'message-pin-updated',
        channelId: channelId,
        messageId: messageId,
        isPinned: isPinned,
        isDm: !!isDm
      });
      break;
    }

    // DM (ÖZEL MESAJLAŞMA - Sayfalama destekli)
    case 'get-dm-history': {
      const { targetUserId, beforeCreatedAt, limit } = data;
      const dmKey = getDmKey(client.id, targetUserId);
      const fetchLimit = Math.min(100, Math.max(10, Number(limit) || 60));
      const msgs = db.getDmMessages(dmKey, fetchLimit, beforeCreatedAt || null);
      if (beforeCreatedAt) {
        ws.send(JSON.stringify({
          type: 'dm-history-more',
          targetUserId: targetUserId,
          messages: msgs,
          hasMore: msgs.length >= fetchLimit
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'dm-history',
          targetUserId: targetUserId,
          messages: msgs,
          hasMore: msgs.length >= fetchLimit
        }));
      }
      break;
    }

    case 'send-dm-msg': {
      if (isChatRateLimited(client.id)) {
        ws.send(JSON.stringify({ type: 'toast', message: '⏳ Lütfen çok hızlı mesaj göndermeyin! (Spam koruması)' }));
        return;
      }
      const { targetUserId, text, image, audioNote, file, fileName, fileSize, replyTo } = data;
      if ((image || audioNote || file) && !hasRolePermission(client.role, 'upload_files')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Dosya veya medya yükleme yetkiniz yok!' }));
        return;
      }
      const cleanText = (text || '').trim().substring(0, 3000);
      if (!cleanText && !image && !audioNote && !file) return;

      const dmKey = getDmKey(client.id, targetUserId);
      const rawMsg = {
        id: 'dm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        dmKey: dmKey,
        senderId: client.id,
        targetUserId: targetUserId,
        senderName: client.name,
        senderRole: client.role,
        senderAvatar: client.avatarUrl || '',
        senderBadge: client.badge || '',
        text: cleanText,
        image: image || null,
        audioNote: audioNote || null,
        file: file || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        replyTo: replyTo || null,
        isPinned: false,
        reactions: {},
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const savedMsg = db.saveMessage(rawMsg);

      ws.send(JSON.stringify({
        type: 'new-dm-msg',
        message: savedMsg,
        withUser: targetUserId
      }));

      for (const [, targetClient] of clients.entries()) {
        if (targetClient.id === targetUserId && targetClient.ws.readyState === WebSocket.OPEN) {
          targetClient.ws.send(JSON.stringify({
            type: 'new-dm-msg',
            message: savedMsg,
            withUser: client.id
          }));
          break;
        }
      }

      // Send Web Push notification to target user
      sendPushNotification(targetUserId, {
        title: `💬 ${client.name}`,
        body: cleanText || (image ? '📷 Fotoğraf gönderdi' : (audioNote ? '🎤 Sesli not gönderdi' : '📁 Dosya gönderdi')),
        icon: client.avatarUrl || '/icon-192.png',
        badge: '/icon-192.png',
        url: `/?dm=${client.id}`,
        tag: `dm-${client.id}`
      });
      break;
    }

    // MESAJ DÜZENLEME (EDIT MESSAGE)
    case 'edit-message': {
      try {
        const { messageId, newText, isDm, targetUserId } = data;
        const result = db.editMessage(messageId, newText, client.id, client.role);

        if (isDm && targetUserId) {
          const payload = JSON.stringify({
            type: 'message-edited',
            messageId: messageId,
            text: result.text,
            isEdited: true,
            isDm: true
          });
          ws.send(payload);
          for (const [, targetClient] of clients.entries()) {
            if (targetClient.id === targetUserId && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(payload);
              break;
            }
          }
        } else {
          broadcastAll({
            type: 'message-edited',
            messageId: messageId,
            channelId: result.channelId,
            text: result.text,
            isEdited: true,
            isDm: false
          });
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    // MESAJ & SESLİ NOT SİLME (DELETE MESSAGE)
    case 'delete-message': {
      try {
        const { messageId, isDm, targetUserId } = data;
        const result = db.deleteMessage(messageId, client.id, client.role);

        if (isDm && targetUserId) {
          const payload = JSON.stringify({
            type: 'message-deleted',
            messageId: messageId,
            isDm: true
          });
          ws.send(payload);
          for (const [, targetClient] of clients.entries()) {
            if (targetClient.id === targetUserId && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(payload);
              break;
            }
          }
        } else {
          broadcastAll({
            type: 'message-deleted',
            messageId: messageId,
            channelId: result.channelId,
            isDm: false
          });
        }
        db.logAudit('DELETE_MESSAGE', client.id, client.name, null, null, `Mesaj silindi (ID: ${messageId})`);
        showToastToUser(ws, '🗑️ Mesaj silindi.');
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    // ANKET OYLAMA (POLL VOTE)
    case 'vote-poll': {
      try {
        const { messageId, optionIndex } = data;
        const result = db.votePoll(messageId, optionIndex, client.id);
        broadcastAll({
          type: 'poll-updated',
          messageId: result.messageId,
          channelId: result.channelId,
          poll: result.poll
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    // DENETİM KAYDI (AUDIT LOGS)
    case 'get-audit-logs': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      const canViewAudit = hasPermission(client.role, 'mod') || !!userPerms.manage_server || !!userPerms.isAdministrator || (client.role === 'admin');
      if (!canViewAudit) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Denetim kaydı için yetkiniz yetersiz!' }));
        return;
      }
      const logs = db.getAuditLogs(100);
      ws.send(JSON.stringify({
        type: 'audit-logs-loaded',
        logs: logs
      }));
      break;
    }

    // SES KANALLARI (VOICE)
    case 'join-voice': {
      const { channelId, password } = data;
      let targetRoomId = channelId || 'genel-ses';

      // Dinamik / Geçici Ses Odası Oluşturma ("+ Oda Oluştur")
      if (targetRoomId === 'temp-voice-creator') {
        if (!hasRolePermission(client.role, 'create_temp_voice')) {
          ws.send(JSON.stringify({ type: 'toast', message: '❌ Geçici ses odası oluşturma yetkiniz yok!' }));
          return;
        }
        const dynamicId = 'temp_voice_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const dynamicRoom = {
          id: dynamicId,
          name: `🎮 ${client.name}'in Odası`,
          type: 'voice',
          category: 'OYUN ODALARI',
          minRole: 'member',
          password: null,
          adminOnlyPost: 0,
          isTemp: true,
          userLimit: 0
        };
        db.createChannel(dynamicRoom);
        broadcastAll({
          type: 'channel-created',
          channel: dynamicRoom
        });
        targetRoomId = dynamicId;
      }

      const ch = db.getChannelById(targetRoomId);

      if (ch && !hasPermission(client.role, ch.minRole)) {
        ws.send(JSON.stringify({
          type: 'channel-access-denied',
          channelId: targetRoomId,
          reason: 'Bu ses kanalına giriş için gereken role sahip değilsiniz!'
        }));
        return;
      }

      if (ch && ch.userLimit > 0 && client.role !== 'admin') {
        const existingRoom = voiceRooms.get(targetRoomId);
        const currentCount = existingRoom ? existingRoom.size : 0;
        if (currentCount >= ch.userLimit && client.voiceRoomId !== targetRoomId) {
          ws.send(JSON.stringify({
            type: 'channel-access-denied',
            channelId: targetRoomId,
            reason: `Bu ses odası dolu! (${currentCount}/${ch.userLimit} Kişi)`
          }));
          return;
        }
      }

      if (ch && ch.password && ch.password !== password) {
        ws.send(JSON.stringify({
          type: 'channel-password-required',
          channelId: targetRoomId,
          channelName: ch.name
        }));
        return;
      }

      if (client.voiceRoomId) leaveVoiceRoom(ws);

      // Clean up any stale peer matching this client.id from all voice rooms
      for (const [rId, vRoom] of voiceRooms.entries()) {
        if (vRoom.has(client.id)) {
          vRoom.delete(client.id);
          broadcastToVoiceRoom(rId, {
            type: 'peer-left',
            peerId: client.id
          }, client.id);
        }
      }

      client.voiceRoomId = targetRoomId;
      client.muted = client.serverMuted ? true : !!data.muted;
      client.deafened = !!data.deafened;
      client.camera = !!data.camera;
      client.screen = !!data.screen;

      if (!voiceRooms.has(targetRoomId)) voiceRooms.set(targetRoomId, new Map());
      const room = voiceRooms.get(targetRoomId);

      const existingPeers = [];
      for (const [, peer] of room.entries()) {
        existingPeers.push({
          id: peer.id,
          name: peer.name,
          role: peer.role,
          avatarUrl: peer.avatarUrl || '',
          badge: peer.badge || '',
          muted: peer.muted,
          deafened: peer.deafened,
          camera: peer.camera,
          screen: peer.screen
        });
      }

      room.set(client.id, {
        id: client.id,
        name: client.name,
        role: client.role,
        avatarUrl: client.avatarUrl || '',
        badge: client.badge || '',
        ws: ws,
        muted: client.muted,
        deafened: client.deafened,
        camera: client.camera,
        screen: client.screen
      });

      ws.send(JSON.stringify({
        type: 'voice-room-joined',
        roomId: targetRoomId,
        selfId: client.id,
        peers: existingPeers
      }));

      // Send current music state if active in room
      const musicState = roomMusicStates.get(targetRoomId);
      if (musicState && musicState.isPlaying) {
        ws.send(JSON.stringify({
          type: 'music-bot-state',
          state: musicState
        }));
      }

      // Send current watch party state if active in room
      const wpState = roomWatchPartyStates.get(targetRoomId);
      if (wpState && wpState.videoId) {
        let currentPos = wpState.currentTime || 0;
        if (wpState.state === 'play') {
          currentPos += (Date.now() - (wpState.updatedAt || Date.now())) / 1000;
        }
        ws.send(JSON.stringify({
          type: 'watch-party-sync',
          roomId: targetRoomId,
          action: 'sync',
          state: {
            ...wpState,
            currentTime: currentPos
          },
          videoId: wpState.videoId,
          senderName: wpState.setBy || 'Sunucu'
        }));
      }

      broadcastToVoiceRoom(targetRoomId, {
        type: 'peer-joined',
        peer: {
          id: client.id,
          name: client.name,
          role: client.role,
          avatarUrl: client.avatarUrl || '',
          badge: client.badge || '',
          muted: client.muted,
          deafened: client.deafened,
          camera: client.camera,
          screen: client.screen
        }
      }, client.id);

      broadcastMemberList();
      break;
    }

    case 'leave-voice': {
      leaveVoiceRoom(ws);
      broadcastMemberList();
      break;
    }

    // WebRTC Signaling
    case 'signal-offer': {
      sendToPeer(client.voiceRoomId, data.targetId, {
        type: 'signal-offer',
        senderId: client.id,
        offer: data.offer
      });
      break;
    }

    case 'signal-answer': {
      sendToPeer(client.voiceRoomId, data.targetId, {
        type: 'signal-answer',
        senderId: client.id,
        answer: data.answer
      });
      break;
    }

    case 'signal-candidate': {
      sendToPeer(client.voiceRoomId, data.targetId, {
        type: 'signal-candidate',
        senderId: client.id,
        candidate: data.candidate
      });
      break;
    }

    case 'track-state': {
      if (!client.voiceRoomId) return;
      const room = voiceRooms.get(client.voiceRoomId);
      if (!room) return;
      const peer = room.get(client.id);
      if (peer) {
        if (data.muted !== undefined) peer.muted = client.serverMuted ? true : data.muted;
        if (data.deafened !== undefined) peer.deafened = data.deafened;
        if (data.camera !== undefined) peer.camera = data.camera;
        if (data.screen !== undefined) peer.screen = data.screen;
      }
      broadcastToVoiceRoom(client.voiceRoomId, {
        type: 'peer-track-state',
        peerId: client.id,
        state: data
      }, client.id);
      break;
    }

    case 'speaking': {
      if (!client.voiceRoomId) return;
      broadcastToVoiceRoom(client.voiceRoomId, {
        type: 'peer-speaking',
        peerId: client.id,
        isSpeaking: !!data.isSpeaking
      }, client.id);
      break;
    }

    // --- ARKADAŞLIK SİSTEMİ (FRIENDS) ---
    case 'get-friends': {
      ws.send(JSON.stringify({
        type: 'friends-list',
        friends: enrichFriendsWithLiveStatus(client.id)
      }));
      break;
    }

    case 'send-friend-request': {
      try {
        const res = db.sendFriendRequest(client.id, data.targetUsername);
        ws.send(JSON.stringify({
          type: 'toast',
          message: res.status === 'accepted' ? `🎉 ${res.friend.username} ile artık arkadaşsınız!` : `📨 ${res.friend.username} kullanıcısına istek gönderildi.`
        }));
        ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(client.id) }));
        for (const [, targetClient] of clients.entries()) {
          if (targetClient.id === res.friend.id && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({
              type: 'toast',
              message: `👥 ${client.name} size arkadaşlık isteği gönderdi!`
            }));
            targetClient.ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(targetClient.id) }));
            break;
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    case 'accept-friend-request': {
      try {
        db.acceptFriendRequest(client.id, data.friendId);
        ws.send(JSON.stringify({ type: 'toast', message: '🎉 Arkadaşlık isteği kabul edildi!' }));
        ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(client.id) }));
        for (const [, targetClient] of clients.entries()) {
          if (targetClient.id === data.friendId && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({
              type: 'toast',
              message: `🎉 ${client.name} arkadaşlık isteğinizi kabul etti!`
            }));
            targetClient.ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(targetClient.id) }));
            break;
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    case 'remove-friend': {
      try {
        db.removeFriend(client.id, data.friendId);
        ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(client.id) }));
        for (const [, targetClient] of clients.entries()) {
          if (targetClient.id === data.friendId && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({ type: 'friends-list', friends: enrichFriendsWithLiveStatus(targetClient.id) }));
            break;
          }
        }
      } catch (err) {}
      break;
    }

    // --- BİREBİR CANLI ARAMA (DIRECT 1-ON-1 CALL) ---
    case 'direct-call-start': {
      const { targetUserId, callType } = data;
      let targetClient = null;
      for (const [, c] of clients.entries()) {
        if (c.id === targetUserId && c.ws.readyState === WebSocket.OPEN) {
          targetClient = c;
          break;
        }
      }
      if (!targetClient) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Kullanıcı şu anda çevrimdışı!' }));
        return;
      }
      client.activeDirectCallPartner = targetClient.id;
      targetClient.activeDirectCallPartner = client.id;
      targetClient.ws.send(JSON.stringify({
        type: 'incoming-direct-call',
        callerId: client.id,
        callerName: client.name,
        callerAvatar: client.avatarUrl,
        callType: callType || 'audio'
      }));
      ws.send(JSON.stringify({
        type: 'direct-call-dialing',
        targetUserId: targetClient.id,
        targetName: targetClient.name,
        targetAvatar: targetClient.avatarUrl,
        callType: callType || 'audio'
      }));
      break;
    }

    case 'direct-call-accept': {
      const { callerId, callType } = data;
      for (const [, c] of clients.entries()) {
        if (c.id === callerId && c.ws.readyState === WebSocket.OPEN) {
          client.activeDirectCallPartner = callerId;
          c.activeDirectCallPartner = client.id;
          c.ws.send(JSON.stringify({
            type: 'direct-call-accepted',
            targetUserId: client.id,
            targetName: client.name,
            targetAvatar: client.avatarUrl || '',
            callType: callType || 'audio'
          }));
          ws.send(JSON.stringify({
            type: 'direct-call-connected',
            peerId: callerId,
            peerName: c.name,
            peerAvatar: c.avatarUrl || '',
            callType: callType || 'audio'
          }));
          break;
        }
      }
      break;
    }

    case 'direct-call-reject': {
      const { callerId } = data;
      const targetId = callerId || client.activeDirectCallPartner;
      client.activeDirectCallPartner = null;
      for (const [, c] of clients.entries()) {
        if (c.id === targetId && c.ws.readyState === WebSocket.OPEN) {
          c.activeDirectCallPartner = null;
          c.ws.send(JSON.stringify({
            type: 'direct-call-rejected',
            targetUserId: client.id,
            targetName: client.name
          }));
          break;
        }
      }
      break;
    }

    case 'direct-call-hangup': {
      const targetPeerId = data.peerId || client.activeDirectCallPartner;
      client.activeDirectCallPartner = null;
      if (targetPeerId) {
        for (const [, c] of clients.entries()) {
          if (c.id === targetPeerId && c.ws.readyState === WebSocket.OPEN) {
            c.activeDirectCallPartner = null;
            c.ws.send(JSON.stringify({
              type: 'direct-call-hungup',
              byUserId: client.id,
              byUserName: client.name
            }));
            break;
          }
        }
      }
      break;
    }

    case 'direct-call-signal-offer': {
      const targetId = data.targetUserId || client.activeDirectCallPartner;
      for (const [, c] of clients.entries()) {
        if (c.id === targetId && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'direct-call-signal-offer',
            senderId: client.id,
            offer: data.offer
          }));
          break;
        }
      }
      break;
    }

    case 'direct-call-signal-answer': {
      const targetId = data.targetUserId || client.activeDirectCallPartner;
      for (const [, c] of clients.entries()) {
        if (c.id === targetId && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'direct-call-signal-answer',
            senderId: client.id,
            answer: data.answer
          }));
          break;
        }
      }
      break;
    }

    case 'direct-call-signal-candidate': {
      const targetId = data.targetUserId || client.activeDirectCallPartner;
      for (const [, c] of clients.entries()) {
        if (c.id === targetId && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({
            type: 'direct-call-signal-candidate',
            senderId: client.id,
            candidate: data.candidate
          }));
          break;
        }
      }
      break;
    }

    // --- YAZIYOR... (TYPING INDICATOR) ---
    case 'typing': {
      const { channelId, targetUserId, isTyping } = data;
      if (channelId) {
        for (const [wsClient, c] of clients.entries()) {
          if (c.id !== client.id && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
              type: 'user-typing',
              channelId: channelId,
              userId: client.id,
              userName: client.name,
              isTyping: !!isTyping
            }));
          }
        }
      } else if (targetUserId) {
        for (const [, c] of clients.entries()) {
          if (c.id === targetUserId && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(JSON.stringify({
              type: 'user-typing',
              isDm: true,
              userId: client.id,
              userName: client.name,
              fromUserId: client.id,
              fromUserName: client.name,
              isTyping: !!isTyping
            }));
            break;
          }
        }
      }
      break;
    }

    // --- WATCH PARTY / BİRLİKTE VİDEO İZLEME ---
    case 'watch-party-sync': {
      const { roomId, videoId, state: requestedState, currentTime, title } = data;
      if (!roomId) break;

      if (videoId !== undefined) {
        let wpState = roomWatchPartyStates.get(roomId) || { videoId: '', state: 'pause', currentTime: 0, title: '' };
        if (videoId) {
          wpState = {
            videoId: videoId,
            state: requestedState || 'play',
            currentTime: currentTime || 0,
            updatedAt: Date.now(),
            title: title || 'YouTube Video',
            setBy: client.name
          };
          roomWatchPartyStates.set(roomId, wpState);
        } else {
          roomWatchPartyStates.delete(roomId);
          wpState = { videoId: '', state: 'close', currentTime: 0, title: '' };
        }

        broadcastToVoiceRoom(roomId, {
          type: 'watch-party-sync',
          roomId: roomId,
          action: videoId ? 'load' : 'close',
          state: wpState,
          videoId: wpState.videoId,
          senderName: client.name
        });
        break;
      }

      const wpState = roomWatchPartyStates.get(roomId);
      if (wpState) {
        let currentPos = wpState.currentTime || 0;
        if (wpState.state === 'play') {
          currentPos += (Date.now() - (wpState.updatedAt || Date.now())) / 1000;
        }
        ws.send(JSON.stringify({
          type: 'watch-party-sync',
          roomId: roomId,
          action: 'sync',
          state: {
            ...wpState,
            currentTime: currentPos
          },
          videoId: wpState.videoId
        }));
      }
      break;
    }

    case 'watch-party-command': {
      if (!hasRolePermission(client.role, 'watch_party')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Watch Party kontrol yetkiniz yok!' }));
        return;
      }
      const { roomId, action, videoId, currentTime, title } = data;
      if (!roomId) return;

      let wpState = roomWatchPartyStates.get(roomId) || { videoId: '', state: 'pause', currentTime: 0, title: '' };
      if (action === 'load') {
        wpState = {
          videoId: videoId,
          state: 'play',
          currentTime: 0,
          updatedAt: Date.now(),
          title: title || 'YouTube Video',
          setBy: client.name
        };
        roomWatchPartyStates.set(roomId, wpState);
      } else if (action === 'play') {
        wpState.state = 'play';
        wpState.currentTime = currentTime !== undefined ? currentTime : wpState.currentTime;
        wpState.updatedAt = Date.now();
      } else if (action === 'pause') {
        wpState.state = 'pause';
        wpState.currentTime = currentTime !== undefined ? currentTime : wpState.currentTime;
        wpState.updatedAt = Date.now();
      } else if (action === 'seek') {
        wpState.currentTime = currentTime || 0;
        wpState.updatedAt = Date.now();
      } else if (action === 'close' || action === 'stop') {
        roomWatchPartyStates.delete(roomId);
        wpState = { videoId: '', state: 'close', currentTime: 0, title: '' };
      }

      broadcastToVoiceRoom(roomId, {
        type: 'watch-party-sync',
        roomId: roomId,
        action: action,
        state: wpState,
        videoId: wpState.videoId,
        senderName: client.name
      });
      break;
    }

    // --- EKRAN PAYLAŞIMINDA CANLI ÇİZİM & LAZER POINTER ---
    case 'screen-annotation-draw': {
      const { roomId, stroke, fromX, fromY, toX, toY, color } = data;
      if (!roomId) return;
      const fx = fromX !== undefined ? fromX : stroke?.fromX;
      const fy = fromY !== undefined ? fromY : stroke?.fromY;
      const tx = toX !== undefined ? toX : stroke?.toX;
      const ty = toY !== undefined ? toY : stroke?.toY;
      if (fx === undefined || fy === undefined || tx === undefined || ty === undefined) return;
      broadcastToVoiceRoom(roomId, {
        type: 'screen-annotation-draw',
        roomId: roomId,
        fromX: fx,
        fromY: fy,
        toX: tx,
        toY: ty,
        color: color || stroke?.color || '#ef4444',
        stroke: stroke || { fromX: fx, fromY: fy, toX: tx, toY: ty, color: color || '#ef4444' },
        senderId: client.id
      }, client.id);
      break;
    }

    case 'screen-annotation-laser': {
      const { roomId, x, y, username } = data;
      if (!roomId) return;
      broadcastToVoiceRoom(roomId, {
        type: 'screen-annotation-laser',
        roomId: roomId,
        x: x,
        y: y,
        senderId: client.id,
        senderName: client.name,
        username: username || client.name
      }, client.id);
      break;
    }

    case 'screen-annotation-clear': {
      const { roomId } = data;
      if (!roomId) return;
      broadcastToVoiceRoom(roomId, {
        type: 'screen-annotation-clear',
        roomId: roomId,
        senderId: client.id
      });
      break;
    }

    // --- ROL & İZİN MATRİSİ ---
    case 'get-role-permissions': {
      cachedRolePermissions = db.getRolePermissions();
      ws.send(JSON.stringify({
        type: 'role-permissions-loaded',
        permissions: cachedRolePermissions
      }));
      break;
    }

    case 'update-role-permissions': {
      if (client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sadece yöneticiler rol izinlerini değiştirebilir!' }));
        return;
      }
      const { role, permissions } = data;
      if (role && permissions) {
        db.saveRolePermissions(role, permissions);
        cachedRolePermissions = db.getRolePermissions();
        db.logAudit('UPDATE_PERMISSIONS', client.id, client.name, role, role.toUpperCase(), `[${role.toUpperCase()}] rolünün izin matrisi güncellendi.`);
        broadcastAll({
          type: 'role-permissions-updated',
          permissions: cachedRolePermissions
        });
        showToastToUser(ws, `🛡️ [${role.toUpperCase()}] rol izinleri kaydedildi!`);
      }
      break;
    }

    // --- SUNUCU YEDEKLEME & GERİ YÜKLEME ---
    case 'get-server-backup': {
      if (client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sadece yöneticiler sunucu yedeği alabilir!' }));
        return;
      }
      const backup = db.exportServerBackup();
      ws.send(JSON.stringify({
        type: 'server-backup-data',
        backup: backup
      }));
      showToastToUser(ws, '💾 Sunucu yedeği hazırlandı!');
      break;
    }

    case 'restore-server-backup': {
      if (client.role !== 'admin') {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sadece yöneticiler sunucu yedeği yükleyebilir!' }));
        return;
      }
      try {
        const res = db.importServerBackup(data.backup);
        cachedRolePermissions = db.getRolePermissions();
        const allChannels = db.getAllChannels();
        const updatedSettings = db.getServerSettings();
        broadcastAll({
          type: 'server-restored',
          message: `✅ Sunucu yedeği geri yüklendi! (${res.restoredChannels} kanal)`,
          channels: allChannels,
          permissions: cachedRolePermissions,
          settings: updatedSettings
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Yedek yükleme hatası: ${err.message}` }));
      }
      break;
    }

    // Sunucu Genel Ayarlarını Güncelleme (Yönetici)
    case 'update-server-settings': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_server && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Sunucu ayarlarını değiştirme yetkiniz yok!' }));
        return;
      }
      const srvName = (data.name || data.serverName || '').trim();
      const srvIcon = (data.icon || data.serverIcon || '🎮').trim();
      const srvDesc = data.description !== undefined ? data.description : data.serverDesc;

      let updatedServer = null;
      if (targetServerId === 'srv_default') {
        db.updateServerSettings({
          serverName: srvName,
          serverIcon: srvIcon,
          serverDesc: srvDesc
        });
        updatedServer = db.updateServer('srv_default', { name: srvName, icon: srvIcon, description: srvDesc });
      } else {
        updatedServer = db.updateServer(targetServerId, { name: srvName, icon: srvIcon, description: srvDesc });
      }

      db.logAudit('UPDATE_SERVER_SETTINGS', client.id, client.name, targetServerId, updatedServer?.name || srvName, `Sunucu ayarları güncellendi.`);
      broadcastToServer(targetServerId, {
        type: 'server-settings-updated',
        serverId: targetServerId,
        settings: {
          serverId: updatedServer ? updatedServer.id : targetServerId,
          serverName: updatedServer ? updatedServer.name : srvName,
          serverIcon: updatedServer ? updatedServer.icon : srvIcon,
          serverDesc: updatedServer ? updatedServer.description : srvDesc,
          inviteCode: updatedServer ? updatedServer.inviteCode : 'TALKAPP',
          ownerId: updatedServer ? updatedServer.ownerId : null
        }
      });
      // Tüm kullanıcıların sunucu listesini tazele
      for (const [wsClient, c] of clients.entries()) {
        if (wsClient.readyState === WebSocket.OPEN) {
          const userServers = db.getUserServers(c.id);
          wsClient.send(JSON.stringify({
            type: 'user-servers-list',
            servers: userServers,
            currentServerId: c.currentServerId
          }));
        }
      }
      showToastToUser(ws, '✅ Sunucu ayarları başarıyla kaydedildi!');
      break;
    }

    // --- DİNAMİK SUNUCU ROLLERİ & AYRIŞTIRILMIŞ İZİNLER ---
    case 'get-server-roles': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const roles = db.getServerRoles(targetServerId);
      const definitions = db.getGranularPermissionDefinitions();
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);

      ws.send(JSON.stringify({
        type: 'server-roles-list',
        serverId: targetServerId,
        roles: roles,
        definitions: definitions,
        permissions: userPerms
      }));
      break;
    }

    case 'create-server-role': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_roles && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda rolleri yönetme yetkiniz yok!' }));
        return;
      }
      try {
        const newRole = db.createServerRole(targetServerId, {
          name: data.name,
          color: data.color,
          hoist: data.hoist,
          permissions: data.permissions
        });
        db.logAudit('CREATE_ROLE', client.id, client.name, newRole.id, newRole.name, `Yeni rol oluşturuldu [${newRole.name}]`);
        const roles = db.getServerRoles(targetServerId);
        broadcastToServer(targetServerId, {
          type: 'server-roles-updated',
          serverId: targetServerId,
          roles: roles
        });
        broadcastMemberList(targetServerId);
        showToastToUser(ws, `🎨 "${newRole.name}" rolü başarıyla oluşturuldu!`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Rol oluşturulamadı: ${err.message}` }));
      }
      break;
    }

    case 'update-server-role': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_roles && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda rolleri düzenleme yetkiniz yok!' }));
        return;
      }
      try {
        const updatedRole = db.updateServerRole(targetServerId, data.roleId, {
          name: data.name,
          color: data.color,
          hoist: data.hoist,
          position: data.position,
          permissions: data.permissions
        });
        db.logAudit('UPDATE_ROLE', client.id, client.name, updatedRole.id, updatedRole.name, `[${updatedRole.name}] rolü güncellendi.`);
        const roles = db.getServerRoles(targetServerId);
        broadcastToServer(targetServerId, {
          type: 'server-roles-updated',
          serverId: targetServerId,
          roles: roles
        });
        broadcastMemberList(targetServerId);
        // Refresh permissions for all clients currently connected to this server
        for (const [wsClient, c] of clients.entries()) {
          if (c.currentServerId === targetServerId && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
              type: 'user-permissions',
              serverId: targetServerId,
              permissions: db.getUserPermissionsInServer(targetServerId, c.id)
            }));
          }
        }
        showToastToUser(ws, `✅ "${updatedRole.name}" rolü başarıyla kaydedildi!`);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Rol güncellenemedi: ${err.message}` }));
      }
      break;
    }

    case 'delete-server-role': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_roles && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Bu sunucuda rolleri silme yetkiniz yok!' }));
        return;
      }
      try {
        db.deleteServerRole(targetServerId, data.roleId);
        db.logAudit('DELETE_ROLE', client.id, client.name, data.roleId, 'Rol', 'Rol sunucudan silindi.');
        const roles = db.getServerRoles(targetServerId);
        broadcastToServer(targetServerId, {
          type: 'server-roles-updated',
          serverId: targetServerId,
          roles: roles
        });
        broadcastMemberList(targetServerId);
        showToastToUser(ws, '🗑️ Rol silindi.');
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ ${err.message}` }));
      }
      break;
    }

    case 'assign-member-roles': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      const userPerms = db.getUserPermissionsInServer(targetServerId, client.id);
      if (!userPerms.manage_roles && !userPerms.isAdministrator) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Üye rollerini değiştirme yetkiniz yok!' }));
        return;
      }
      try {
        const assignedIds = db.assignMemberRoles(targetServerId, data.targetUserId, data.roleIds);
        db.logAudit('ASSIGN_ROLES', client.id, client.name, data.targetUserId, 'Üye', `Üye rolleri güncellendi (${assignedIds.length} rol atanmış).`);
        broadcastMemberList(targetServerId);

        // Notify target client of updated permissions immediately
        for (const [wsClient, c] of clients.entries()) {
          if (c.id === data.targetUserId && wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(JSON.stringify({
              type: 'user-permissions',
              serverId: targetServerId,
              permissions: db.getUserPermissionsInServer(targetServerId, c.id)
            }));
            showToastToUser(wsClient, '🛡️ Bu sunucudaki rolleriniz ve yetkileriniz güncellendi!');
          }
        }
        showToastToUser(ws, '✅ Kullanıcı rolleri başarıyla kaydedildi!');
      } catch (err) {
        ws.send(JSON.stringify({ type: 'toast', message: `❌ Rol atama hatası: ${err.message}` }));
      }
      break;
    }

    case 'get-user-permissions': {
      const targetServerId = data.serverId || client.currentServerId || 'srv_default';
      ws.send(JSON.stringify({
        type: 'user-permissions',
        serverId: targetServerId,
        permissions: db.getUserPermissionsInServer(targetServerId, client.id)
      }));
      break;
    }

    // --- THREADS / ALT MESAJ KONULARI ---
    case 'get-thread-messages': {
      const { parentId } = data;
      const threadData = db.getThreadMessages(parentId);
      ws.send(JSON.stringify({
        type: 'thread-messages-list',
        parentId: parentId,
        parent: threadData.parent,
        messages: threadData.replies
      }));
      break;
    }

    case 'send-thread-msg': {
      const { parentId, channelId, text, image, audioNote, file, fileName, fileSize } = data;
      if (!parentId) return;

      if ((image || audioNote || file) && !hasRolePermission(client.role, 'upload_files')) {
        ws.send(JSON.stringify({ type: 'toast', message: '❌ Dosya veya medya yükleme yetkiniz yok!' }));
        return;
      }

      const cleanText = (text || '').trim().substring(0, 3000);
      if (!cleanText && !image && !audioNote && !file) return;

      const rawMsg = {
        id: 'msg_th_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        channelId: channelId,
        threadParentId: parentId,
        senderId: client.id,
        senderName: client.name,
        senderRole: client.role,
        senderAvatar: client.avatarUrl || '',
        senderBadge: client.badge || '',
        text: cleanText,
        image: image || null,
        audioNote: audioNote || null,
        file: file || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        isPinned: false,
        reactions: {},
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const savedMsg = db.saveMessage(rawMsg);
      const threadData = db.getThreadMessages(parentId);

      broadcastAll({
        type: 'new-thread-msg',
        parentId: parentId,
        channelId: channelId,
        message: savedMsg,
        threadCount: threadData.replies.length
      });
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', time: data.time }));
      break;
    }
  }
}

function showToastToUser(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'toast', message }));
  }
}

function sendToPeer(roomId, targetPeerId, payload) {
  let targetWs = null;
  if (roomId && voiceRooms.has(roomId)) {
    const room = voiceRooms.get(roomId);
    const target = room.get(targetPeerId);
    if (target && target.ws.readyState === WebSocket.OPEN) {
      targetWs = target.ws;
    }
  }
  // Fallback: If not found in voiceRoom, search across all connected clients by ID
  if (!targetWs) {
    for (const [ws, c] of clients.entries()) {
      if (c.id === targetPeerId && ws.readyState === WebSocket.OPEN) {
        targetWs = ws;
        break;
      }
    }
  }
  if (targetWs) {
    try {
      targetWs.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('[sendToPeer Error]:', e.message);
    }
  }
}

function broadcastToVoiceRoom(roomId, payload, excludePeerId = null) {
  if (!roomId || !voiceRooms.has(roomId)) return;
  const room = voiceRooms.get(roomId);
  const json = JSON.stringify(payload);
  for (const [peerId, peer] of room.entries()) {
    if (peerId !== excludePeerId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(json);
    }
  }
}

function leaveVoiceRoom(ws) {
  const client = clients.get(ws);
  if (!client || !client.voiceRoomId) return;

  const roomId = client.voiceRoomId;
  const room = voiceRooms.get(roomId);
  if (room) {
    room.delete(client.id);
    broadcastToVoiceRoom(roomId, {
      type: 'peer-left',
      peerId: client.id
    });
    if (room.size === 0) {
      voiceRooms.delete(roomId);
      roomMusicStates.delete(roomId);
      roomWatchPartyStates.delete(roomId);
      const ch = db.getChannelById(roomId);
      if (ch && (ch.isTemp || roomId.startsWith('temp_voice_'))) {
        db.deleteChannel(roomId);
        broadcastAll({
          type: 'channel-deleted',
          channelId: roomId
        });
      }
    }
  }
  client.voiceRoomId = null;
}

function handleDisconnect(ws) {
  const client = clients.get(ws);
  if (client) {
    if (client.companionToken) {
      const entry = companionTokens.get(client.companionToken);
      if (entry && entry.ws === ws) {
        companionTokens.delete(client.companionToken);
      }
    }
    chatRateLimits.delete(client.id);
    if (client.activeDirectCallPartner) {
      for (const [, c] of clients.entries()) {
        if (c.id === client.activeDirectCallPartner && c.ws.readyState === WebSocket.OPEN) {
          c.activeDirectCallPartner = null;
          c.ws.send(JSON.stringify({
            type: 'direct-call-hungup',
            byUserId: client.id,
            byUserName: client.name
          }));
          break;
        }
      }
      client.activeDirectCallPartner = null;
    }
  }
  leaveVoiceRoom(ws);
  clients.delete(ws);
  broadcastMemberList();
}

server.listen(PORT, '0.0.0.0', () => {
  const protocol = USE_HTTPS ? 'https' : 'http';
  const lanIps = getLocalIPv4Addresses();
  console.log('========================================================');
  console.log(`🚀 TalkApp Pro 4.0 Başlatıldı!`);
  console.log(`📡 Ana Adres (${protocol.toUpperCase()}): ${protocol}://localhost:${PORT}`);
  for (const ip of lanIps) {
    console.log(`   ↳ Ağ (LAN): ${protocol}://${ip}:${PORT}`);
  }
  if (httpsCompanionServer) {
    httpsCompanionServer.on('error', (err) => {
      console.warn(`[SSL] HTTPS yardımcı portu (${HTTPS_PORT}) başlatılamadı: ${err.message}`);
    });
    httpsCompanionServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log(`🔒 Güvenli HTTPS / WSS Adresi: https://localhost:${HTTPS_PORT}`);
      for (const ip of lanIps) {
        console.log(`   ↳ Ağ (LAN - Mikrofon/Ekran Paylaşımı İçin): https://${ip}:${HTTPS_PORT}`);
      }
      console.log(`📜 Kök Sertifika İndirme: https://localhost:${HTTPS_PORT}/ssl/talkapp-cert.crt`);
    });
  }
  console.log(`🔐 Kalıcı Hesap & Şifreli Giriş (Kayıt Ol / Giriş Yap) Aktif.`);
  console.log(`🔍 Hızlı Mesaj Arama (Full-Text Search) & Webhook REST API Hazır.`);
  console.log(`🎵 Müzik / Radyo Botu & Kanal Kategorileri Devrede.`);
  console.log('========================================================');

  // Initial startup WAL checkpoint & snapshot
  setTimeout(() => {
    const res = db.checkpointAndCreateBackup();
    if (res.success) {
      console.log(`[DB Auto-Backup] İlk veritabanı yedeği ve WAL temizliği yapıldı: ${path.basename(res.backupPath)}`);
    }
  }, 4000);

  // Periodic rotating backup every 6 hours
  setInterval(() => {
    const res = db.checkpointAndCreateBackup();
    if (res.success) {
      console.log(`[DB Auto-Backup] 6 saatlik periyodik SQLite yedeği alındı: ${path.basename(res.backupPath)} (Toplam: ${res.totalBackups})`);
    }
  }, 6 * 3600 * 1000);
});
