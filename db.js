// TalkApp SQLite Database Engine using Node.js built-in node:sqlite & crypto
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'talkapp.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Initialize Tables with Migrations
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT DEFAULT 'GENEL SOHBET',
    min_role TEXT DEFAULT 'member',
    password TEXT DEFAULT NULL,
    admin_only_post INTEGER DEFAULT 0,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT,
    dm_key TEXT,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT DEFAULT 'member',
    text TEXT DEFAULT '',
    image_url TEXT DEFAULT NULL,
    audio_note_url TEXT DEFAULT NULL,
    is_pinned INTEGER DEFAULT 0,
    reactions_json TEXT DEFAULT '{}',
    time TEXT,
    created_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(dm_key, created_at);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    salt TEXT,
    role TEXT DEFAULT 'member',
    status TEXT DEFAULT 'online',
    game_activity TEXT DEFAULT '',
    token TEXT,
    created_at INTEGER,
    last_seen INTEGER
  );
`);

// Try adding category column to channels if table existed without it
try {
  db.exec(`ALTER TABLE channels ADD COLUMN category TEXT DEFAULT 'GENEL SOHBET'`);
} catch (e) {}

try {
  db.exec(`ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0`);
} catch (e) {}

try { db.exec(`ALTER TABLE messages ADD COLUMN reply_to_json TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN file_url TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN file_size TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN poll_json TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN badge TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN salt TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN token TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN token_expires_at INTEGER DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN created_at INTEGER DEFAULT NULL`); } catch (e) {}

  // Audit Logs Table
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    target_id TEXT,
    target_name TEXT,
    details TEXT,
    created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

  -- Friends System Table
  CREATE TABLE IF NOT EXISTS friends (
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'accepted'
    created_at INTEGER,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
  CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);

  -- Web Push Subscriptions Table
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER,
    PRIMARY KEY (user_id, endpoint)
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

  -- Custom Soundboard Uploads
  CREATE TABLE IF NOT EXISTS custom_sounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sound_url TEXT NOT NULL,
    uploaded_by TEXT,
    created_at INTEGER
  );

  -- Role Permissions Matrix
  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT PRIMARY KEY,
    permissions_json TEXT NOT NULL
  );

  -- Server Settings (Server Name, Icon, Description)
  CREATE TABLE IF NOT EXISTS server_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- Multi-Server (Guilds / Communities) Tables
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🎮',
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    is_public INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_servers_invite ON servers(invite_code);

  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    nickname TEXT DEFAULT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sm_user ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_sm_server ON server_members(server_id);
  CREATE TABLE IF NOT EXISTS server_roles (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#99aab5',
    hoist INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    permissions_json TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sr_server ON server_roles(server_id, position DESC);
`);

try { db.exec(`ALTER TABLE server_members ADD COLUMN roles_json TEXT DEFAULT '[]'`); } catch (e) {}
try { db.exec(`ALTER TABLE channels ADD COLUMN server_id TEXT DEFAULT 'srv_default'`); } catch (e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id)`); } catch (e) {}
try { db.exec(`ALTER TABLE channels ADD COLUMN is_temp INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE channels ADD COLUMN user_limit INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE channels ADD COLUMN position INTEGER DEFAULT 0`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN thread_parent_id TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN sender_avatar TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`ALTER TABLE messages ADD COLUMN sender_badge TEXT DEFAULT ''`); } catch (e) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_parent_id)`); } catch (e) {}

const GRANULAR_PERMISSIONS = {
  manage_server: { label: 'Sunucuyu Yönet', desc: 'Sunucu adını, ikonunu ve temel ayarlarını düzenleyebilir.', default: false },
  manage_channels: { label: 'Kanalları Yönet', desc: 'Yeni kanallar oluşturabilir, kanalları silebilir ve taşıyabilir.', default: false },
  manage_roles: { label: 'Rolleri Yönet', desc: 'Yeni roller oluşturabilir, rol izinlerini düzenleyebilir ve üyelere rol atayabilir.', default: false },
  kick_members: { label: 'Üyeleri At', desc: 'Kullanıcıları ses kanallarından atabilir.', default: false },
  mute_members: { label: 'Üyeleri Sustur', desc: 'Kullanıcıları sunucu genelinde susturabilir.', default: false },
  move_members: { label: 'Üyeleri Taşı', desc: 'Kullanıcıları ses odaları arasında taşıyabilir.', default: false },
  send_messages: { label: 'Mesaj Gönder', desc: 'Metin kanallarında mesaj yazabilir.', default: true },
  upload_files: { label: 'Dosya & Medya Ekle', desc: 'Fotoğraf, ses kaydı ve dosya yükleyebilir.', default: true },
  mention_everyone: { label: '@everyone ve @here Bahset', desc: 'Sunucudaki herkesi etiketleyip bildirim gönderebilir.', default: false },
  connect_voice: { label: 'Sese Bağlan', desc: 'Ses kanallarına katılabilir.', default: true },
  speak_voice: { label: 'Konuş', desc: 'Ses kanallarında mikrofonla konuşabilir.', default: true },
  use_soundboard: { label: 'Ses Efekti (Soundboard) Çal', desc: 'Ses kanallarında ses panosunu kullanabilir.', default: true },
  create_temp_voice: { label: 'Geçici Ses Odası Oluştur', desc: 'Dinamik geçici ses odası oluşturabilir.', default: true }
};

const DEFAULT_PERMISSIONS = {
  admin: {
    manage_channels: true,
    kick_members: true,
    mute_members: true,
    upload_files: true,
    use_soundboard: true,
    create_temp_voice: true,
    mention_everyone: true,
    watch_party: true
  },
  mod: {
    manage_channels: false,
    kick_members: true,
    mute_members: true,
    upload_files: true,
    use_soundboard: true,
    create_temp_voice: true,
    mention_everyone: true,
    watch_party: true
  },
  vip: {
    manage_channels: false,
    kick_members: false,
    mute_members: false,
    upload_files: true,
    use_soundboard: true,
    create_temp_voice: true,
    mention_everyone: false,
    watch_party: true
  },
  member: {
    manage_channels: false,
    kick_members: false,
    mute_members: false,
    upload_files: true,
    use_soundboard: true,
    create_temp_voice: true,
    mention_everyone: false,
    watch_party: true
  }
};

// Seed default role permissions if empty
try {
  const permCount = db.prepare('SELECT COUNT(*) as count FROM role_permissions').get();
  if (permCount.count === 0) {
    const insertPerm = db.prepare('INSERT INTO role_permissions (role, permissions_json) VALUES (?, ?)');
    for (const [r, p] of Object.entries(DEFAULT_PERMISSIONS)) {
      insertPerm.run(r, JSON.stringify(p));
    }
  }
} catch (e) {}

// Seed Default Channels with Categories if empty
const countRow = db.prepare('SELECT COUNT(*) as count FROM channels').get();
if (countRow.count === 0) {
  const insertChannel = db.prepare(`
    INSERT INTO channels (id, name, type, category, min_role, password, admin_only_post, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const defaults = [
    ['text-genel', 'genel-sohbet', 'text', 'GENEL SOHBET', 'member', null, 0, Date.now()],
    ['text-duyuru', 'duyurular', 'text', 'GENEL SOHBET', 'member', null, 1, Date.now()],
    ['genel-ses', '🔊 Genel Ses', 'voice', 'GENEL SOHBET', 'member', null, 0, Date.now()],
    ['text-oyun', 'oyun-muhabbet', 'text', 'OYUN ODALARI', 'member', null, 0, Date.now()],
    ['oyun-1', '🎮 Oyun Odası 1', 'voice', 'OYUN ODALARI', 'member', null, 0, Date.now()],
    ['oyun-2', '🎮 Oyun Odası 2', 'voice', 'OYUN ODALARI', 'member', null, 0, Date.now()],
    ['yayin-ekran', '📺 Yayın & Ekran', 'voice', 'OYUN ODALARI', 'member', null, 0, Date.now()],
    ['text-vip', 'vip-kulubu', 'text', 'YÖNETİM & VIP', 'vip', null, 0, Date.now()],
    ['yonetim-odasi', '👑 Yönetici Odası', 'voice', 'YÖNETİM & VIP', 'mod', null, 0, Date.now()]
  ];

  for (const row of defaults) {
    insertChannel.run(...row);
  }
}

// Ensure Dynamic / Temp Voice Room Creator exists
try {
  const tempCh = db.prepare('SELECT id FROM channels WHERE id = ?').get('temp-voice-creator');
  if (!tempCh) {
    db.prepare(`
      INSERT INTO channels (id, name, type, category, min_role, password, admin_only_post, created_at)
      VALUES ('temp-voice-creator', '➕ Ses Odası Oluştur', 'voice', 'OYUN ODALARI', 'member', null, 0, ?)
    `).run(Date.now());
  }
} catch (e) {}

const SAFE_UPLOAD_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'mp3', 'wav', 'ogg', 'webm', 'm4a', 'mp4',
  'pdf', 'zip', 'rar', '7z', 'txt', 'json', 'csv', 'md',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
]);

// Helper: Save Base64 file (Image, Audio, Config or Document) to disk and return static URL
function saveBase64File(dataUrl, prefix = 'file', originalName = '') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;

  try {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    const mime = matches[1].toLowerCase();
    const base64Data = matches[2];
    let ext = 'bin';

    if (mime.includes('image/png')) ext = 'png';
    else if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = 'jpg';
    else if (mime.includes('image/gif')) ext = 'gif';
    else if (mime.includes('image/webp')) ext = 'webp';
    else if (mime.includes('audio/webm')) ext = 'webm';
    else if (mime.includes('audio/ogg')) ext = 'ogg';
    else if (mime.includes('audio/wav') || mime.includes('audio/x-wav') || mime.includes('audio/wave')) ext = 'wav';
    else if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) ext = 'mp3';
    else if (mime.includes('audio/mp4') || mime.includes('audio/x-m4a')) ext = 'm4a';
    else if (mime.includes('video/mp4')) ext = 'mp4';
    else if (mime.includes('application/pdf')) ext = 'pdf';
    else if (mime.includes('application/zip') || mime.includes('x-zip-compressed')) ext = 'zip';
    else if (mime.includes('application/json')) ext = 'json';
    else if (mime.includes('text/plain')) ext = 'txt';
    else if (originalName && originalName.includes('.')) {
      const candidate = originalName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (SAFE_UPLOAD_EXTENSIONS.has(candidate)) {
        ext = candidate;
      }
    }

    if (!SAFE_UPLOAD_EXTENSIONS.has(ext)) {
      ext = 'bin';
    }

    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('[DB Uploads Error]:', err);
    return null;
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function ensureDefaultAdminAccount() {
  try {
    const adminUser = db.prepare("SELECT id, username, role, password_hash FROM users WHERE LOWER(username) = 'admin'").get();
    if (!adminUser) {
      const defaultPwd = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123';
      const salt = crypto.randomBytes(16).toString('hex');
      const pwdHash = hashPassword(defaultPwd, salt);
      const token = crypto.randomBytes(32).toString('hex');
      const userId = 'usr_admin_master';
      const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
      const expiresAt = Date.now() + TOKEN_TTL_MS;
      db.prepare(`
        INSERT INTO users (id, username, password_hash, salt, role, status, game_activity, avatar_url, badge, token, token_expires_at, created_at, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, 'admin', pwdHash, salt, 'admin', 'online', 'Sunucu Yönetimi', '', '👑 Kurucu', token, expiresAt, Date.now(), Date.now());
      console.log('👑 [DB] Varsayılan yönetici hesabı oluşturuldu -> Kullanıcı Adı: admin | Şifre: ' + defaultPwd);
      console.log('⚠️ [GÜVENLİK UYARISI] Lütfen yönetici şifrenizi ilk girişinizde Ayarlar menüsünden değiştirin!');
    }
  } catch (err) {
    console.error('[DB Admin Init Error]:', err.message);
  }
}
ensureDefaultAdminAccount();

function ensureDefaultServerMigration() {
  try {
    const now = Date.now();
    const nameRow = db.prepare("SELECT value FROM server_settings WHERE key = 'serverName'").get();
    const iconRow = db.prepare("SELECT value FROM server_settings WHERE key = 'serverIcon'").get();
    const descRow = db.prepare("SELECT value FROM server_settings WHERE key = 'serverDesc'").get();

    const srvName = (nameRow && nameRow.value) ? nameRow.value : 'TalkApp Ana Topluluk';
    const srvIcon = (iconRow && iconRow.value) ? iconRow.value : '🎮';
    const srvDesc = (descRow && descRow.value) ? descRow.value : 'TalkApp topluluğu ana sohbet ve ses alanı.';

    // 1. srv_default kaydının servers tablosunda kesin olarak var olduğundan emin ol
    const defaultSrv = db.prepare("SELECT id FROM servers WHERE id = 'srv_default'").get();
    if (!defaultSrv) {
      db.prepare(`
        INSERT INTO servers (id, name, icon, description, owner_id, invite_code, is_public, created_at)
        VALUES ('srv_default', ?, ?, ?, 'usr_admin_master', 'TALKAPP', 1, ?)
      `).run(srvName, srvIcon, srvDesc, now);
      console.log('🏛️ [DB Migration] Varsayılan sunucu oluşturuldu (srv_default).');
    }

    // 2. server_id değeri NULL, boş veya tanımsız olan tüm eski kanalları srv_default'a bağla (Koşulsuz çalışır)
    const updatedChannels = db.prepare(`
      UPDATE channels SET server_id = 'srv_default'
      WHERE server_id IS NULL OR server_id = '' OR server_id = 'null' OR server_id = 'undefined'
    `).run();
    if (updatedChannels.changes > 0) {
      console.log(`🏛️ [DB Migration] ${updatedChannels.changes} adet eski kanal 'srv_default' sunucusuna bağlandı.`);
    }

    // 3. Kanal sağlama (Auto-Repair): Eğer srv_default için hiç kanal kalmamışsa varsayılan kanalları yeniden oluştur
    const defaultChCount = db.prepare(`
      SELECT COUNT(*) as count FROM channels
      WHERE server_id = 'srv_default' OR server_id IS NULL OR server_id = ''
    `).get().count;

    if (defaultChCount === 0) {
      console.log('🏛️ [DB Migration] srv_default için kanal bulunamadı, varsayılan kanallar geri yükleniyor...');
      const insertChannel = db.prepare(`
        INSERT INTO channels (id, server_id, name, type, category, min_role, password, admin_only_post, is_temp, user_limit, position, created_at)
        VALUES (?, 'srv_default', ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      const defaults = [
        ['text-genel', 'genel-sohbet', 'text', 'GENEL SOHBET', 'member', null, 0, 0, now],
        ['text-duyuru', 'duyurular', 'text', 'GENEL SOHBET', 'member', null, 1, 1, now],
        ['genel-ses', '🔊 Genel Ses', 'voice', 'GENEL SOHBET', 'member', null, 0, 2, now],
        ['text-oyun', 'oyun-muhabbet', 'text', 'OYUN ODALARI', 'member', null, 0, 3, now],
        ['oyun-1', '🎮 Oyun Odası 1', 'voice', 'OYUN ODALARI', 'member', null, 0, 4, now],
        ['oyun-2', '🎮 Oyun Odası 2', 'voice', 'OYUN ODALARI', 'member', null, 0, 5, now],
        ['yayin-ekran', '📺 Yayın & Ekran', 'voice', 'OYUN ODALARI', 'member', null, 0, 6, now],
        ['text-vip', 'vip-kulubu', 'text', 'YÖNETİM & VIP', 'vip', null, 0, 7, now],
        ['yonetim-odasi', '👑 Yönetici Odası', 'voice', 'YÖNETİM & VIP', 'mod', null, 0, 8, now],
        ['temp-voice-creator', '➕ Ses Odası Oluştur', 'voice', 'OYUN ODALARI', 'member', null, 0, 9, now]
      ];
      for (const row of defaults) {
        try { insertChannel.run(...row); } catch (e) {}
      }
    }

    // 4. Tüm kullanıcıların srv_default sunucusuna üye olduğundan emin ol
    const allUsers = db.prepare('SELECT id, role FROM users').all();
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at)
      VALUES ('srv_default', ?, ?, ?)
    `);
    for (const u of allUsers) {
      insertMember.run(u.id, u.role === 'admin' ? 'owner' : u.role, now);
    }
  } catch (err) {
    console.error('[DB Server Migration Error]:', err.message);
  }
}
ensureDefaultServerMigration();

function ensureDefaultServerRoles(serverId) {
  try {
    if (!serverId) serverId = 'srv_default';
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM server_roles WHERE server_id = ?').get(serverId).count;
    const now = Date.now();
    if (existingCount === 0) {
      const adminRolePerms = {};
      const modRolePerms = {};
      const everyonePerms = {};

      for (const [key, def] of Object.entries(GRANULAR_PERMISSIONS)) {
        adminRolePerms[key] = true;
        everyonePerms[key] = def.default;
        modRolePerms[key] = def.default;
      }
      modRolePerms.manage_channels = true;
      modRolePerms.kick_members = true;
      modRolePerms.mute_members = true;
      modRolePerms.move_members = true;
      modRolePerms.mention_everyone = true;

      const adminRoleId = `role_${serverId}_admin`;
      const modRoleId = `role_${serverId}_mod`;
      const everyoneRoleId = `role_${serverId}_everyone`;

      const insertRole = db.prepare(`
        INSERT OR IGNORE INTO server_roles (id, server_id, name, color, hoist, position, permissions_json, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertRole.run(adminRoleId, serverId, '👑 Yönetici', '#e74c3c', 1, 100, JSON.stringify(adminRolePerms), 0, now);
      insertRole.run(modRoleId, serverId, '🛡️ Moderatör', '#3498db', 1, 50, JSON.stringify(modRolePerms), 0, now + 1);
      insertRole.run(everyoneRoleId, serverId, '@everyone', '#99aab5', 0, 0, JSON.stringify(everyonePerms), 1, now + 2);
    }

    // Migrate members in this server to have roles_json if empty
    const members = db.prepare('SELECT user_id, role, roles_json FROM server_members WHERE server_id = ?').all(serverId);
    const updateRoles = db.prepare('UPDATE server_members SET roles_json = ? WHERE server_id = ? AND user_id = ?');

    for (const m of members) {
      let currentRoles = [];
      try {
        currentRoles = JSON.parse(m.roles_json || '[]');
      } catch (e) {
        currentRoles = [];
      }
      if (!Array.isArray(currentRoles) || currentRoles.length === 0) {
        if (m.role === 'owner' || m.role === 'admin') {
          currentRoles = [`role_${serverId}_admin`];
        } else if (m.role === 'mod') {
          currentRoles = [`role_${serverId}_mod`];
        } else {
          currentRoles = [];
        }
        updateRoles.run(JSON.stringify(currentRoles), serverId, m.user_id);
      }
    }
  } catch (err) {
    console.error(`[DB Roles Init Error for ${serverId}]:`, err.message);
  }
}

function ensureAllServersRolesMigration() {
  try {
    const srvs = db.prepare('SELECT id FROM servers').all();
    for (const s of srvs) {
      ensureDefaultServerRoles(s.id);
    }
    ensureDefaultServerRoles('srv_default');
  } catch (err) {
    console.error('[DB Roles All Migration Error]:', err.message);
  }
}
ensureAllServersRolesMigration();

module.exports = {
  UPLOADS_DIR,
  DATA_DIR,

  // --- AUTHENTICATION & ACCOUNTS ---
  registerUser(username, password) {
    const cleanUser = username.trim().substring(0, 32);
    if (!cleanUser || !password || password.length < 6) {
      throw new Error('Kullanıcı adı ve en az 6 karakterli şifre gereklidir.');
    }

    const existing = db.prepare('SELECT id, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (existing && existing.password_hash) {
      throw new Error('Bu kullanıcı adı zaten şifreli olarak kayıtlı!');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pwdHash = hashPassword(password, salt);
    const token = crypto.randomBytes(32).toString('hex');
    const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 günlük oturum ömrü
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    // First registered user gets Admin role
    const totalRegistered = db.prepare('SELECT COUNT(*) as count FROM users WHERE password_hash IS NOT NULL').get().count;
    const role = totalRegistered === 0 ? 'admin' : (existing?.role || 'member');

    if (existing && !existing.password_hash) {
      // Upgrade existing guest user record
      db.prepare(`
        UPDATE users
        SET password_hash = ?, salt = ?, role = ?, token = ?, token_expires_at = ?, created_at = ?, last_seen = ?
        WHERE id = ?
      `).run(pwdHash, salt, role, token, expiresAt, Date.now(), Date.now(), existing.id);

      return {
        id: existing.id,
        username: cleanUser,
        role: role,
        status: 'online',
        gameActivity: '',
        token: token
      };
    }

    const userId = 'usr_' + Math.random().toString(36).substring(2, 9);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, salt, role, status, game_activity, token, token_expires_at, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanUser, pwdHash, salt, role, 'online', '', token, expiresAt, Date.now(), Date.now());

    return {
      id: userId,
      username: cleanUser,
      role: role,
      status: 'online',
      gameActivity: '',
      token: token
    };
  },

  loginUser(username, password) {
    const cleanUser = username.trim();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (!user || !user.password_hash || !user.salt) {
      throw new Error('Kullanıcı adı veya şifre hatalı!');
    }

    const testHash = hashPassword(password, user.salt);
    if (testHash !== user.password_hash) {
      throw new Error('Kullanıcı adı veya şifre hatalı!');
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 günlük oturum ömrü
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    db.prepare('UPDATE users SET token = ?, token_expires_at = ?, last_seen = ? WHERE id = ?').run(newToken, expiresAt, Date.now(), user.id);

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status || 'online',
      gameActivity: user.game_activity || '',
      avatarUrl: user.avatar_url || '',
      badge: user.badge || '',
      token: newToken
    };
  },

  verifyToken(token) {
    if (!token || token === 'undefined' || token === 'null') return null;
    const user = db.prepare('SELECT * FROM users WHERE token = ?').get(token);
    if (!user) return null;
    // Check token expiration (TTL check)
    if (user.token_expires_at && Number(user.token_expires_at) < Date.now()) {
      return null;
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status || 'online',
      gameActivity: user.game_activity || '',
      avatarUrl: user.avatar_url || '',
      badge: user.badge || '',
      token: user.token || token
    };
  },

  logoutUser(token) {
    if (!token || token === 'undefined' || token === 'null') return;
    try {
      db.prepare('UPDATE users SET token = NULL, token_expires_at = NULL WHERE token = ?').run(token);
    } catch (e) {}
  },

  changePassword(userId, oldPassword, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Yeni şifre en az 6 karakter olmalıdır.');
    }
    const user = db.prepare('SELECT id, password_hash, salt FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('Kullanıcı hesabı bulunamadı.');
    }
    if (user.password_hash && user.salt) {
      const testHash = hashPassword(oldPassword || '', user.salt);
      if (testHash !== user.password_hash) {
        throw new Error('Mevcut şifreniz hatalı!');
      }
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(newHash, newSalt, userId);
    return true;
  },

  changeUsername(userId, newUsername) {
    const clean = (newUsername || '').trim().substring(0, 32);
    if (!clean || clean.length < 2) {
      throw new Error('Kullanıcı adı en az 2 karakter olmalıdır.');
    }
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(clean, userId);
    if (existing) {
      throw new Error('Bu kullanıcı adı başka bir kullanıcı tarafından kullanılıyor!');
    }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(clean, userId);
    return clean;
  },

  getUserById(userId) {
    if (!userId) return null;
    return db.prepare('SELECT id, username, avatar_url, role, status, game_activity FROM users WHERE id = ?').get(userId);
  },

  getUserByUsername(username) {
    if (!username) return null;
    return db.prepare('SELECT id, username, avatar_url, role, status, game_activity FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  },

  // --- MULTI-SERVER (COMMUNITIES / GUILDS) ---
  getUserServers(userId) {
    if (!userId) return [];
    // Ensure user is in srv_default
    try {
      db.prepare(`
        INSERT OR IGNORE INTO server_members (server_id, user_id, role, joined_at)
        VALUES ('srv_default', ?, 'member', ?)
      `).run(userId, Date.now());
    } catch {}

    const rows = db.prepare(`
      SELECT s.*, sm.role as my_role
      FROM servers s
      JOIN server_members sm ON s.id = sm.server_id
      WHERE sm.user_id = ?
      ORDER BY s.created_at ASC
    `).all(userId);

    if (rows.length === 0) {
      const def = this.getServerById('srv_default');
      if (def) return [{ ...def, myRole: 'member' }];
    }

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      icon: r.icon || '🎮',
      description: r.description || '',
      ownerId: r.owner_id,
      inviteCode: r.invite_code,
      isPublic: !!r.is_public,
      myRole: r.my_role || 'member',
      createdAt: r.created_at
    }));
  },

  getServerById(serverId) {
    const r = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      icon: r.icon || '🎮',
      description: r.description || '',
      ownerId: r.owner_id,
      inviteCode: r.invite_code,
      isPublic: !!r.is_public,
      createdAt: r.created_at
    };
  },

  getServerByInvite(inviteCode) {
    if (!inviteCode) return null;
    const clean = inviteCode.trim().toUpperCase();
    const r = db.prepare('SELECT * FROM servers WHERE UPPER(invite_code) = ?').get(clean);
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      icon: r.icon || '🎮',
      description: r.description || '',
      ownerId: r.owner_id,
      inviteCode: r.invite_code,
      isPublic: !!r.is_public,
      createdAt: r.created_at
    };
  },

  createServer({ name, icon, description, ownerId }) {
    const serverId = 'srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const prefix = (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'TALK');
    const inviteCode = prefix + '-' + Math.floor(1000 + Math.random() * 9000);
    const now = Date.now();

    db.prepare(`
      INSERT INTO servers (id, name, icon, description, owner_id, invite_code, is_public, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(serverId, name.trim(), icon || '🎮', description || '', ownerId, inviteCode, now);

    ensureDefaultServerRoles(serverId);
    const ownerRoleId = `role_${serverId}_admin`;

    db.prepare(`
      INSERT INTO server_members (server_id, user_id, role, roles_json, joined_at)
      VALUES (?, ?, 'owner', ?, ?)
    `).run(serverId, ownerId, JSON.stringify([ownerRoleId]), now);

    // Create initial text & voice channels for the new server
    const defaultTextId = 'text_' + serverId + '_genel';
    const defaultVoiceId = 'voice_' + serverId + '_ana';

    this.createChannel({
      id: defaultTextId,
      serverId: serverId,
      name: 'genel-sohbet',
      type: 'text',
      category: 'METİN KANALLARI',
      minRole: 'member'
    });

    this.createChannel({
      id: defaultVoiceId,
      serverId: serverId,
      name: '🔊 Genel Ses',
      type: 'voice',
      category: 'SES ODALARI',
      minRole: 'member'
    });

    return {
      id: serverId,
      name: name.trim(),
      icon: icon || '🎮',
      description: description || '',
      ownerId: ownerId,
      inviteCode: inviteCode,
      myRole: 'owner',
      createdAt: now
    };
  },

  joinServer(serverId, userId, role = 'member') {
    const srv = this.getServerById(serverId);
    if (!srv) throw new Error('Sunucu bulunamadı!');

    ensureDefaultServerRoles(serverId);

    db.prepare(`
      INSERT OR IGNORE INTO server_members (server_id, user_id, role, roles_json, joined_at)
      VALUES (?, ?, ?, '[]', ?)
    `).run(serverId, userId, role, Date.now());

    return srv;
  },

  leaveServer(serverId, userId) {
    const srv = this.getServerById(serverId);
    if (!srv) throw new Error('Sunucu bulunamadı!');
    if (srv.ownerId === userId) {
      throw new Error('Sunucu sahibi sunucudan ayrılamaz! İsterseniz sunucuyu silebilirsiniz.');
    }
    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
  },

  deleteServer(serverId, userId) {
    const srv = this.getServerById(serverId);
    if (!srv) throw new Error('Sunucu bulunamadı!');
    if (srv.id === 'srv_default') {
      throw new Error('Ana topluluk sunucusu silinemez!');
    }
    if (srv.ownerId !== userId) {
      throw new Error('Yalnızca sunucu kurucusu sunucuyu silebilir!');
    }

    const channels = db.prepare('SELECT id FROM channels WHERE server_id = ?').all(serverId);
    for (const ch of channels) {
      db.prepare('DELETE FROM messages WHERE channel_id = ?').run(ch.id);
    }
    db.prepare('DELETE FROM channels WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM server_roles WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM server_members WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM servers WHERE id = ?').run(serverId);
  },

  // --- DİNAMİK SUNUCU ROLLERİ & AYRIŞTIRILMIŞ İZİNLER ---
  getGranularPermissionDefinitions() {
    return GRANULAR_PERMISSIONS;
  },

  getServerRoles(serverId) {
    const targetId = serverId || 'srv_default';
    ensureDefaultServerRoles(targetId);
    const rows = db.prepare('SELECT * FROM server_roles WHERE server_id = ? ORDER BY position DESC, created_at ASC').all(targetId);
    return rows.map(r => ({
      id: r.id,
      serverId: r.server_id,
      name: r.name,
      color: r.color || '#99aab5',
      hoist: !!r.hoist,
      position: Number(r.position) || 0,
      permissions: JSON.parse(r.permissions_json || '{}'),
      isDefault: !!r.is_default,
      createdAt: r.created_at
    }));
  },

  createServerRole(serverId, { name, color, hoist, permissions }) {
    const targetId = serverId || 'srv_default';
    ensureDefaultServerRoles(targetId);
    const cleanName = (name || 'Yeni Rol').trim().substring(0, 32);
    const cleanColor = (color || '#99aab5').trim();
    const roleId = `role_${targetId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Pozisyon: @everyone (0) ile Yönetici (100) arasında
    const highestPosRow = db.prepare('SELECT MAX(position) as maxPos FROM server_roles WHERE server_id = ? AND position < 100').get(targetId);
    const newPos = (highestPosRow && highestPosRow.maxPos !== null) ? (highestPosRow.maxPos + 1) : 10;

    const mergedPerms = {};
    for (const [k, def] of Object.entries(GRANULAR_PERMISSIONS)) {
      mergedPerms[k] = permissions && permissions[k] !== undefined ? !!permissions[k] : def.default;
    }

    db.prepare(`
      INSERT INTO server_roles (id, server_id, name, color, hoist, position, permissions_json, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(roleId, targetId, cleanName, cleanColor, hoist ? 1 : 0, newPos, JSON.stringify(mergedPerms), Date.now());

    return {
      id: roleId,
      serverId: targetId,
      name: cleanName,
      color: cleanColor,
      hoist: !!hoist,
      position: newPos,
      permissions: mergedPerms,
      isDefault: false,
      createdAt: Date.now()
    };
  },

  updateServerRole(serverId, roleId, { name, color, hoist, position, permissions }) {
    const targetId = serverId || 'srv_default';
    const existing = db.prepare('SELECT * FROM server_roles WHERE id = ? AND server_id = ?').get(roleId, targetId);
    if (!existing) throw new Error('Rol bulunamadı!');

    const cleanName = name !== undefined ? name.trim().substring(0, 32) : existing.name;
    const cleanColor = color !== undefined ? color.trim() : existing.color;
    const cleanHoist = hoist !== undefined ? (hoist ? 1 : 0) : existing.hoist;
    const cleanPos = position !== undefined ? Number(position) : existing.position;

    let mergedPerms = JSON.parse(existing.permissions_json || '{}');
    if (permissions && typeof permissions === 'object') {
      for (const [k, v] of Object.entries(permissions)) {
        if (GRANULAR_PERMISSIONS[k] !== undefined) {
          mergedPerms[k] = !!v;
        }
      }
    }

    db.prepare(`
      UPDATE server_roles
      SET name = ?, color = ?, hoist = ?, position = ?, permissions_json = ?
      WHERE id = ? AND server_id = ?
    `).run(cleanName, cleanColor, cleanHoist, cleanPos, JSON.stringify(mergedPerms), roleId, targetId);

    return {
      id: roleId,
      serverId: targetId,
      name: cleanName,
      color: cleanColor,
      hoist: !!cleanHoist,
      position: cleanPos,
      permissions: mergedPerms,
      isDefault: !!existing.is_default,
      createdAt: existing.created_at
    };
  },

  deleteServerRole(serverId, roleId) {
    const targetId = serverId || 'srv_default';
    const existing = db.prepare('SELECT * FROM server_roles WHERE id = ? AND server_id = ?').get(roleId, targetId);
    if (!existing) throw new Error('Rol bulunamadı!');
    if (existing.is_default) throw new Error('Varsayılan sunucu rolü (@everyone) silinemez!');

    db.prepare('DELETE FROM server_roles WHERE id = ? AND server_id = ?').run(roleId, targetId);

    // Bu sunucudaki üyelerin rollerinden de temizle
    const members = db.prepare('SELECT user_id, roles_json FROM server_members WHERE server_id = ?').all(targetId);
    const updateStmt = db.prepare('UPDATE server_members SET roles_json = ? WHERE server_id = ? AND user_id = ?');
    for (const m of members) {
      try {
        let rList = JSON.parse(m.roles_json || '[]');
        if (rList.includes(roleId)) {
          rList = rList.filter(r => r !== roleId);
          updateStmt.run(JSON.stringify(rList), targetId, m.user_id);
        }
      } catch (e) {}
    }
    return true;
  },

  assignMemberRoles(serverId, userId, roleIds) {
    const targetId = serverId || 'srv_default';
    if (!Array.isArray(roleIds)) roleIds = [];
    const validRoles = db.prepare('SELECT id FROM server_roles WHERE server_id = ?').all(targetId).map(r => r.id);
    const filteredIds = roleIds.filter(id => validRoles.includes(id));

    // Update roles_json
    db.prepare('UPDATE server_members SET roles_json = ? WHERE server_id = ? AND user_id = ?')
      .run(JSON.stringify(filteredIds), targetId, userId);

    return filteredIds;
  },

  getUserPermissionsInServer(serverId, userId) {
    const targetId = serverId || 'srv_default';
    const result = {};
    for (const [k, v] of Object.entries(GRANULAR_PERMISSIONS)) {
      result[k] = v.default;
    }
    result.isOwner = false;
    result.isAdministrator = false;

    if (!targetId || !userId) return result;

    // 1. Sunucu Sahibi mi?
    const srv = this.getServerById(targetId);
    if (srv && srv.ownerId === userId) {
      for (const k of Object.keys(GRANULAR_PERMISSIONS)) {
        result[k] = true;
      }
      result.isOwner = true;
      result.isAdministrator = true;
      return result;
    }

    // 2. Global Sistem Yöneticisi mi?
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    if (user && user.role === 'admin') {
      for (const k of Object.keys(GRANULAR_PERMISSIONS)) {
        result[k] = true;
      }
      result.isAdministrator = true;
      return result;
    }

    // 3. Üyenin ve sunucunun rollerini incele
    const member = db.prepare('SELECT role, roles_json FROM server_members WHERE server_id = ? AND user_id = ?').get(targetId, userId);
    const roles = this.getServerRoles(targetId);
    const roleMap = new Map();
    let everyoneRole = null;
    roles.forEach(r => {
      roleMap.set(r.id, r);
      if (r.isDefault) everyoneRole = r;
    });

    // @everyone izinlerini uygula
    if (everyoneRole && everyoneRole.permissions) {
      for (const [k, v] of Object.entries(everyoneRole.permissions)) {
        if (typeof v === 'boolean') result[k] = v;
      }
    }

    // Üyeye atanmış rolleri birleştir
    let assignedRoleIds = [];
    try {
      if (member && member.roles_json) {
        assignedRoleIds = JSON.parse(member.roles_json);
      }
    } catch (e) {}

    // Eski role sütunu için geriye dönük uyumluluk
    if (assignedRoleIds.length === 0 && member) {
      if (member.role === 'owner' || member.role === 'admin') {
        assignedRoleIds.push(`role_${targetId}_admin`);
      } else if (member.role === 'mod') {
        assignedRoleIds.push(`role_${targetId}_mod`);
      }
    }

    for (const rId of assignedRoleIds) {
      const r = roleMap.get(rId);
      if (r && r.permissions) {
        for (const [k, v] of Object.entries(r.permissions)) {
          if (v === true) result[k] = true;
        }
      }
    }

    // Sunucuyu Yönet yetkisi tam yönetici (Administrator) sayılır
    if (result.manage_server) {
      result.isAdministrator = true;
      for (const k of Object.keys(GRANULAR_PERMISSIONS)) {
        result[k] = true;
      }
    }

    return result;
  },

  getServerMembers(serverId) {
    const targetId = serverId || 'srv_default';
    ensureDefaultServerRoles(targetId);

    const serverRoles = this.getServerRoles(targetId);
    const roleMap = new Map();
    serverRoles.forEach(r => roleMap.set(r.id, r));

    const rows = db.prepare(`
      SELECT u.id, u.username, u.avatar_url, u.badge, u.status, u.game_activity, sm.role, sm.nickname, sm.roles_json, sm.joined_at
      FROM server_members sm
      JOIN users u ON sm.user_id = u.id
      WHERE sm.server_id = ?
      ORDER BY u.username ASC
    `).all(targetId);

    return rows.map(r => {
      let assignedRoleIds = [];
      try {
        assignedRoleIds = JSON.parse(r.roles_json || '[]');
      } catch (e) {}

      // Fallback for legacy role
      if (assignedRoleIds.length === 0) {
        if (r.role === 'owner' || r.role === 'admin') {
          assignedRoleIds.push(`role_${targetId}_admin`);
        } else if (r.role === 'mod') {
          assignedRoleIds.push(`role_${targetId}_mod`);
        }
      }

      const memberRoles = [];
      let topRole = null;

      for (const rId of assignedRoleIds) {
        const roleObj = roleMap.get(rId);
        if (roleObj) {
          memberRoles.push({
            id: roleObj.id,
            name: roleObj.name,
            color: roleObj.color,
            hoist: roleObj.hoist,
            position: roleObj.position
          });
          if (!topRole || roleObj.position > topRole.position) {
            topRole = roleObj;
          }
        }
      }

      memberRoles.sort((a, b) => b.position - a.position);
      const highestHoistRole = memberRoles.find(ro => ro.hoist) || null;

      return {
        id: r.id,
        name: r.nickname || r.username,
        username: r.username,
        avatar: r.avatar_url,
        badge: r.badge,
        status: r.status,
        gameActivity: r.game_activity,
        serverRole: r.role,
        roles: memberRoles,
        roleIds: assignedRoleIds,
        topRole: topRole ? { id: topRole.id, name: topRole.name, color: topRole.color, position: topRole.position } : null,
        roleColor: topRole ? topRole.color : null,
        roleHoist: !!highestHoistRole,
        hoistRole: highestHoistRole ? { id: highestHoistRole.id, name: highestHoistRole.name, color: highestHoistRole.color, position: highestHoistRole.position } : null,
        topRoleName: topRole ? topRole.name : '@everyone',
        joinedAt: r.joined_at
      };
    });
  },

  updateServer(serverId, { name, icon, description }) {
    db.prepare(`
      UPDATE servers 
      SET name = COALESCE(?, name), icon = COALESCE(?, icon), description = COALESCE(?, description)
      WHERE id = ?
    `).run(name ? name.trim() : null, icon || null, description !== undefined ? description : null, serverId);

    return this.getServerById(serverId);
  },

  isUserInServer(serverId, userId) {
    const r = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    return !!r;
  },

  getUserServerRole(serverId, userId) {
    const r = db.prepare('SELECT role FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
    return r ? r.role : null;
  },

  // --- CHANNELS & CATEGORIES ---
  getAllChannels(serverId = null) {
    let rows;
    if (serverId && serverId !== 'srv_default') {
      rows = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC').all(serverId);
    } else {
      rows = db.prepare("SELECT * FROM channels WHERE server_id = 'srv_default' OR server_id IS NULL OR server_id = '' OR server_id = 'null' OR server_id = 'undefined' ORDER BY position ASC, created_at ASC").all();
    }
    const text = [];
    const voice = [];

    for (const row of rows) {
      const item = {
        id: row.id,
        serverId: row.server_id || 'srv_default',
        name: row.name,
        type: row.type,
        category: row.category || 'GENEL SOHBET',
        minRole: row.min_role,
        hasPassword: !!row.password,
        password: row.password,
        adminOnlyPost: !!row.admin_only_post,
        isTemp: !!row.is_temp,
        userLimit: Number(row.user_limit) || 0,
        position: Number(row.position) || 0
      };
      if (row.type === 'voice') voice.push(item);
      else text.push(item);
    }
    return { text, voice };
  },

  createChannel(ch) {
    const stmt = db.prepare(`
      INSERT INTO channels (id, server_id, name, type, category, min_role, password, admin_only_post, is_temp, user_limit, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      ch.id,
      ch.serverId || 'srv_default',
      ch.name,
      ch.type,
      ch.category || 'GENEL SOHBET',
      ch.minRole || 'member',
      ch.password || null,
      ch.adminOnlyPost ? 1 : 0,
      ch.isTemp ? 1 : 0,
      Number(ch.userLimit) || 0,
      Number(ch.position) || 0,
      Date.now()
    );
  },

  deleteChannel(channelId) {
    db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
    db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
  },

  getChannelById(channelId) {
    const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!row) return null;
    return {
      id: row.id,
      serverId: row.server_id || 'srv_default',
      name: row.name,
      type: row.type,
      category: row.category || 'GENEL SOHBET',
      minRole: row.min_role,
      password: row.password,
      adminOnlyPost: !!row.admin_only_post,
      isTemp: !!row.is_temp,
      userLimit: Number(row.user_limit) || 0,
      position: Number(row.position) || 0
    };
  },

  reorderChannel(channelId, targetCategory, beforeChannelId = null) {
    const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
    if (!ch) return null;
    const serverId = ch.server_id || 'srv_default';
    const cleanCat = (targetCategory || 'GENEL SOHBET').trim().toUpperCase();

    // Fetch all channels in this server ordered currently
    const all = db.prepare('SELECT id, category, position, created_at FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC').all(serverId);

    // Remove the moved channel from the list
    const remaining = all.filter(c => c.id !== channelId);
    const movedItem = { id: ch.id, category: cleanCat };

    if (beforeChannelId && beforeChannelId !== channelId) {
      const idx = remaining.findIndex(c => c.id === beforeChannelId);
      if (idx !== -1) {
        remaining.splice(idx, 0, movedItem);
      } else {
        remaining.push(movedItem);
      }
    } else {
      // Find the last channel in the target category and place after it
      let lastCatIdx = -1;
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].category === cleanCat) lastCatIdx = i;
      }
      if (lastCatIdx !== -1) {
        remaining.splice(lastCatIdx + 1, 0, movedItem);
      } else {
        remaining.push(movedItem);
      }
    }

    // Update category and positions in DB
    const updateStmt = db.prepare('UPDATE channels SET category = ?, position = ? WHERE id = ?');
    for (let i = 0; i < remaining.length; i++) {
      const cat = remaining[i].id === channelId ? cleanCat : remaining[i].category;
      updateStmt.run(cat, i, remaining[i].id);
    }
    return serverId;
  },

  // --- MESSAGES & SEARCH ---
  saveMessage(msg) {
    const messageId = msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    const messageTime = msg.time || (new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    const createdAt = Date.now();

    let imgUrl = msg.image;
    let audioUrl = msg.audioNote;
    let fileUrl = msg.fileUrl || null;
    let fileName = msg.fileName || null;
    let fileSize = msg.fileSize || null;

    if (imgUrl && imgUrl.startsWith('data:')) {
      imgUrl = saveBase64File(imgUrl, 'img');
    }
    if (audioUrl && audioUrl.startsWith('data:')) {
      audioUrl = saveBase64File(audioUrl, 'audio');
    }
    if (msg.file && msg.file.startsWith('data:')) {
      fileUrl = saveBase64File(msg.file, 'file', fileName);
    }

    const replyJson = msg.replyTo ? JSON.stringify(msg.replyTo) : null;
    const pollJson = msg.poll ? JSON.stringify(msg.poll) : null;

    const stmt = db.prepare(`
      INSERT INTO messages (id, channel_id, dm_key, sender_id, sender_name, sender_role, sender_avatar, sender_badge, text, image_url, audio_note_url, is_pinned, reactions_json, time, created_at, reply_to_json, file_url, file_name, file_size, poll_json, thread_parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      messageId,
      msg.channelId || null,
      msg.dmKey || null,
      msg.senderId,
      msg.senderName,
      msg.senderRole || 'member',
      msg.senderAvatar || '',
      msg.senderBadge || '',
      msg.text || '',
      imgUrl,
      audioUrl,
      msg.isPinned ? 1 : 0,
      JSON.stringify(msg.reactions || {}),
      messageTime,
      createdAt,
      replyJson,
      fileUrl,
      fileName,
      fileSize,
      pollJson,
      msg.threadParentId || null
    );

    return {
      ...msg,
      id: messageId,
      time: messageTime,
      createdAt: createdAt,
      image: imgUrl,
      audioNote: audioUrl,
      fileUrl: fileUrl,
      fileName: fileName,
      fileSize: fileSize,
      senderAvatar: msg.senderAvatar || '',
      senderBadge: msg.senderBadge || '',
      replyTo: msg.replyTo || null,
      poll: msg.poll || null,
      threadParentId: msg.threadParentId || null
    };
  },

  getChannelMessages(channelId, limit = 80, beforeCreatedAt = null) {
    let rows;
    if (beforeCreatedAt && Number(beforeCreatedAt) > 0) {
      rows = db.prepare(`
        SELECT m.*,
          u.avatar_url as user_avatar,
          u.badge as user_badge,
          (SELECT COUNT(*) FROM messages t WHERE t.thread_parent_id = m.id) as thread_count
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.channel_id = ? AND (m.thread_parent_id IS NULL OR m.thread_parent_id = '') AND m.created_at < ?
        ORDER BY m.created_at DESC LIMIT ?
      `).all(channelId, Number(beforeCreatedAt), limit);
    } else {
      rows = db.prepare(`
        SELECT m.*,
          u.avatar_url as user_avatar,
          u.badge as user_badge,
          (SELECT COUNT(*) FROM messages t WHERE t.thread_parent_id = m.id) as thread_count
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.channel_id = ? AND (m.thread_parent_id IS NULL OR m.thread_parent_id = '')
        ORDER BY m.created_at DESC LIMIT ?
      `).all(channelId, limit);
    }

    return rows.reverse().map(r => ({
      id: r.id,
      channelId: r.channel_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      senderAvatar: r.user_avatar || r.sender_avatar || '',
      senderBadge: r.user_badge || r.sender_badge || '',
      text: r.text,
      image: r.image_url,
      audioNote: r.audio_note_url,
      fileUrl: r.file_url,
      fileName: r.file_name,
      fileSize: r.file_size,
      replyTo: r.reply_to_json ? JSON.parse(r.reply_to_json) : null,
      poll: r.poll_json ? JSON.parse(r.poll_json) : null,
      isPinned: !!r.is_pinned,
      isEdited: !!r.is_edited,
      reactions: JSON.parse(r.reactions_json || '{}'),
      threadCount: r.thread_count || 0,
      thread_count: r.thread_count || 0,
      createdAt: r.created_at,
      time: r.time
    }));
  },

  getDmMessages(dmKey, limit = 80, beforeCreatedAt = null) {
    let rows;
    if (beforeCreatedAt && Number(beforeCreatedAt) > 0) {
      rows = db.prepare(`
        SELECT m.*,
          u.avatar_url as user_avatar,
          u.badge as user_badge
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.dm_key = ? AND m.created_at < ?
        ORDER BY m.created_at DESC LIMIT ?
      `).all(dmKey, Number(beforeCreatedAt), limit);
    } else {
      rows = db.prepare(`
        SELECT m.*,
          u.avatar_url as user_avatar,
          u.badge as user_badge
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.dm_key = ?
        ORDER BY m.created_at DESC LIMIT ?
      `).all(dmKey, limit);
    }

    return rows.reverse().map(r => ({
      id: r.id,
      dmKey: r.dm_key,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      senderAvatar: r.user_avatar || r.sender_avatar || '',
      senderBadge: r.user_badge || r.sender_badge || '',
      text: r.text,
      image: r.image_url,
      audioNote: r.audio_note_url,
      fileUrl: r.file_url,
      fileName: r.file_name,
      fileSize: r.file_size,
      replyTo: r.reply_to_json ? JSON.parse(r.reply_to_json) : null,
      poll: r.poll_json ? JSON.parse(r.poll_json) : null,
      isPinned: !!r.is_pinned,
      isEdited: !!r.is_edited,
      reactions: JSON.parse(r.reactions_json || '{}'),
      createdAt: r.created_at,
      time: r.time
    }));
  },

  searchMessages(query, channelId = null, limit = 50) {
    const rawQuery = (query || '').trim();
    // Escape SQLite LIKE special characters %, _, \
    const escapedQuery = rawQuery.replace(/([%_\\])/g, '\\$1');
    const cleanQuery = `%${escapedQuery}%`;
    let rows;
    if (channelId) {
      rows = db.prepare(`
        SELECT m.*, c.name as channel_name 
        FROM messages m 
        LEFT JOIN channels c ON m.channel_id = c.id 
        WHERE m.text LIKE ? ESCAPE '\\' AND m.channel_id = ?
        ORDER BY m.created_at DESC LIMIT ?
      `).all(cleanQuery, channelId, limit);
    } else {
      rows = db.prepare(`
        SELECT m.*, c.name as channel_name 
        FROM messages m 
        LEFT JOIN channels c ON m.channel_id = c.id 
        WHERE m.text LIKE ? ESCAPE '\\' AND m.channel_id IS NOT NULL
        ORDER BY m.created_at DESC LIMIT ?
      `).all(cleanQuery, limit);
    }

    return rows.map(r => ({
      id: r.id,
      channelId: r.channel_id,
      channelName: r.channel_name || 'Kanal',
      senderName: r.sender_name,
      senderRole: r.sender_role,
      text: r.text,
      time: r.time
    }));
  },

  toggleReaction(messageId, emoji, userId) {
    const row = db.prepare('SELECT reactions_json FROM messages WHERE id = ?').get(messageId);
    if (!row) return {};

    const reactions = JSON.parse(row.reactions_json || '{}');
    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(userId);
    if (idx > -1) {
      reactions[emoji].splice(idx, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(userId);
    }

    db.prepare('UPDATE messages SET reactions_json = ? WHERE id = ?')
      .run(JSON.stringify(reactions), messageId);

    return reactions;
  },

  togglePinMessage(messageId) {
    const row = db.prepare('SELECT is_pinned FROM messages WHERE id = ?').get(messageId);
    if (!row) return false;

    const newPinned = row.is_pinned ? 0 : 1;
    db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?')
      .run(newPinned, messageId);

    return newPinned === 1;
  },

  // Users profile sync
  saveUserProfile(user) {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, role, status, game_activity, avatar_url, badge, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        role = excluded.role,
        status = excluded.status,
        game_activity = excluded.game_activity,
        avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE users.avatar_url END,
        badge = CASE WHEN excluded.badge != '' THEN excluded.badge ELSE users.badge END,
        last_seen = excluded.last_seen
    `);
    stmt.run(
      user.id,
      user.name,
      user.role || 'member',
      user.status || 'online',
      user.gameActivity || '',
      user.avatarUrl || '',
      user.badge || '',
      Date.now()
    );
  },

  setUserRole(userId, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  },

  editMessage(messageId, newText, userId, userRole) {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!row) throw new Error('Mesaj bulunamadı.');

    if (row.sender_id !== userId && userRole !== 'admin') {
      throw new Error('Bu mesajı düzenleme yetkiniz yok.');
    }

    const cleanText = (newText || '').trim();
    if (!cleanText) throw new Error('Mesaj boş bırakılamaz.');

    db.prepare('UPDATE messages SET text = ?, is_edited = 1 WHERE id = ?')
      .run(cleanText, messageId);

    return {
      id: messageId,
      channelId: row.channel_id,
      dmKey: row.dm_key,
      text: cleanText,
      isEdited: true
    };
  },

  deleteMessage(messageId, userId, userRole) {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!row) throw new Error('Mesaj bulunamadı.');

    if (row.sender_id !== userId && userRole !== 'admin' && userRole !== 'mod') {
      throw new Error('Bu mesajı silme yetkiniz yok.');
    }

    // Clean up uploaded image, voice note, or generic file from disk
    [row.image_url, row.audio_note_url, row.file_url].forEach(fileUrl => {
      if (fileUrl && fileUrl.startsWith('/uploads/')) {
        const fileName = path.basename(fileUrl);
        const filePath = path.join(UPLOADS_DIR, fileName);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.warn('Silinen mesaj dosyası diskten temizlenemedi:', err);
        }
      }
    });

    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

    return {
      id: messageId,
      channelId: row.channel_id,
      dmKey: row.dm_key
    };
  },

  // Interactive Poll Voting
  votePoll(messageId, optionIndex, userId) {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!row || !row.poll_json) throw new Error('Anket bulunamadı.');

    const poll = JSON.parse(row.poll_json);
    if (!poll.options || !poll.options[optionIndex]) throw new Error('Geçersiz seçenek.');

    const alreadyVotedOption = poll.options[optionIndex].votes && poll.options[optionIndex].votes.includes(userId);

    // Remove vote from all options
    poll.options.forEach(opt => {
      opt.votes = (opt.votes || []).filter(u => u !== userId);
    });

    if (!alreadyVotedOption) {
      poll.options[optionIndex].votes.push(userId);
    }

    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    poll.totalVotes = totalVotes;
    poll.options.forEach(opt => {
      opt.pct = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;
    });

    db.prepare('UPDATE messages SET poll_json = ? WHERE id = ?').run(JSON.stringify(poll), messageId);

    return {
      messageId: messageId,
      channelId: row.channel_id,
      dmKey: row.dm_key,
      poll: poll
    };
  },

  // Audit Logs
  logAudit(actionType, actorId, actorName, targetId = null, targetName = null, details = '') {
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const createdAt = Date.now();
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, action_type, actor_id, actor_name, target_id, target_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, actionType, actorId, actorName, targetId, targetName, details, createdAt);
    return {
      id,
      actionType,
      action_type: actionType,
      action: actionType,
      actorId,
      actor_id: actorId,
      actorName,
      actor_name: actorName,
      performed_by_name: actorName,
      targetId,
      target_id: targetId,
      targetName,
      target_name: targetName,
      details,
      created_at: createdAt,
      time: createdAt
    };
  },

  getAuditLogs(limit = 100) {
    return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit).map(r => ({
      ...r,
      action: r.action_type,
      performed_by_name: r.actor_name
    }));
  },

  // --- WEB PUSH SUBSCRIPTIONS ---
  savePushSubscription(userId, subscription) {
    if (!userId || !subscription || !subscription.endpoint || !subscription.keys) return false;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, Date.now());
    return true;
  },

  getPushSubscriptions(userId) {
    if (!userId) return [];
    return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  },

  deletePushSubscription(endpoint) {
    if (!endpoint) return false;
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
    return true;
  },

  // --- FRIENDS SYSTEM ---
  sendFriendRequest(senderId, targetUsername) {
    const cleanUser = (targetUsername || '').trim();
    if (!cleanUser) throw new Error('Kullanıcı adı belirtilmedi.');

    const targetUser = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (!targetUser) throw new Error(`"${cleanUser}" adında bir kullanıcı bulunamadı.`);
    if (targetUser.id === senderId) throw new Error('Kendinize arkadaşlık isteği gönderemezsiniz!');

    const existing = db.prepare('SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').get(senderId, targetUser.id, targetUser.id, senderId);
    if (existing) {
      if (existing.status === 'accepted') throw new Error('Bu kullanıcı ile zaten arkadaşsınız.');
      if (existing.user_id === senderId) throw new Error('Zaten bekleyen bir arkadaşlık isteğiniz var.');
      db.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?').run('accepted', existing.user_id, existing.friend_id);
      return { status: 'accepted', friend: targetUser };
    }

    db.prepare(`
      INSERT INTO friends (user_id, friend_id, status, created_at)
      VALUES (?, ?, 'pending', ?)
    `).run(senderId, targetUser.id, Date.now());

    return { status: 'pending', friend: targetUser };
  },

  acceptFriendRequest(userId, friendId) {
    const row = db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?').get(friendId, userId, 'pending');
    if (!row) throw new Error('Bekleyen arkadaşlık isteği bulunamadı.');

    db.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?').run('accepted', friendId, userId);
    return true;
  },

  removeFriend(userId, friendId) {
    db.prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(userId, friendId, friendId, userId);
    return true;
  },

  getFriends(userId) {
    const rows = db.prepare(`
      SELECT f.user_id, f.friend_id, f.status as rel_status, f.created_at as rel_time,
             u.id as user_id_val, u.username, u.role, u.status as user_status,
             u.game_activity, u.avatar_url, u.badge, u.last_seen
      FROM friends f
      JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
      WHERE f.user_id = ? OR f.friend_id = ?
    `).all(userId, userId, userId);

    return rows.map(r => {
      let relationship = 'accepted';
      const direction = (r.user_id === userId) ? 'outgoing' : 'incoming';
      if (r.rel_status === 'pending') {
        relationship = (r.user_id === userId) ? 'pending_sent' : 'pending_received';
      }
      return {
        id: r.user_id_val,
        friend_user_id: r.user_id_val,
        username: r.username,
        role: r.role,
        status: r.rel_status,
        user_status: r.user_status || 'offline',
        onlineStatus: r.user_status || 'offline',
        direction: direction,
        relationship: relationship,
        gameActivity: r.game_activity || '',
        game_activity: r.game_activity || '',
        avatarUrl: r.avatar_url || '',
        avatar_url: r.avatar_url || '',
        badge: r.badge || '',
        lastSeen: r.last_seen
      };
    });
  },

  // --- CUSTOM SOUNDBOARD SOUNDS ---
  saveCustomSound(name, dataUrl, uploadedBy) {
    const cleanName = (name || 'Özel Ses').trim().substring(0, 32);
    const soundUrl = saveBase64File(dataUrl, 'sound', '');
    if (!soundUrl) throw new Error('Ses dosyası kaydedilemedi.');

    const id = 'snd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    db.prepare(`
      INSERT INTO custom_sounds (id, name, sound_url, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, cleanName, soundUrl, uploadedBy || 'user', Date.now());

    return {
      id: id,
      name: cleanName,
      soundUrl: soundUrl,
      uploadedBy: uploadedBy
    };
  },

  getCustomSounds() {
    return db.prepare('SELECT * FROM custom_sounds ORDER BY created_at DESC').all().map(r => ({
      id: r.id,
      name: r.name,
      soundUrl: r.sound_url,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at
    }));
  },

  deleteCustomSound(id) {
    const row = db.prepare('SELECT sound_url FROM custom_sounds WHERE id = ?').get(id);
    if (row && row.sound_url && row.sound_url.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(row.sound_url));
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {}
    }
    db.prepare('DELETE FROM custom_sounds WHERE id = ?').run(id);
    return true;
  },

  // --- THREADS / ALT MESAJ KONULARI ---
  getThreadMessages(parentId, limit = 100) {
    const parent = db.prepare(`
      SELECT m.*, u.avatar_url as user_avatar, u.badge as user_badge
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(parentId);
    if (!parent) return { parent: null, replies: [] };

    const rows = db.prepare(`
      SELECT m.*, u.avatar_url as user_avatar, u.badge as user_badge
      FROM messages m
      LEFT JOIN users u ON m.sender_id = u.id
      WHERE m.thread_parent_id = ? ORDER BY m.created_at ASC LIMIT ?
    `).all(parentId, limit);

    const formatMsg = (r) => ({
      id: r.id,
      channelId: r.channel_id,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      senderAvatar: r.user_avatar || r.sender_avatar || '',
      senderBadge: r.user_badge || r.sender_badge || '',
      text: r.text,
      image: r.image_url,
      audioNote: r.audio_note_url,
      fileUrl: r.file_url,
      fileName: r.file_name,
      fileSize: r.file_size,
      replyTo: r.reply_to_json ? JSON.parse(r.reply_to_json) : null,
      poll: r.poll_json ? JSON.parse(r.poll_json) : null,
      isPinned: !!r.is_pinned,
      isEdited: !!r.is_edited,
      reactions: JSON.parse(r.reactions_json || '{}'),
      threadParentId: r.thread_parent_id,
      createdAt: r.created_at,
      time: r.time
    });

    return {
      parent: formatMsg(parent),
      replies: rows.map(formatMsg)
    };
  },

  // --- ROL & İZİN MATRİSİ ---
  getRolePermissions() {
    const rows = db.prepare('SELECT role, permissions_json FROM role_permissions').all();
    const validKeys = Object.keys(DEFAULT_PERMISSIONS.admin);
    const result = {};
    for (const [r, defaults] of Object.entries(DEFAULT_PERMISSIONS)) {
      result[r] = { ...defaults };
    }

    rows.forEach(r => {
      try {
        const roleKey = String(r.role).toLowerCase();
        if (!result[roleKey]) result[roleKey] = { ...DEFAULT_PERMISSIONS.member };
        const parsed = JSON.parse(r.permissions_json);
        if (Array.isArray(parsed)) {
          validKeys.forEach(k => {
            result[roleKey][k] = parsed.includes(k);
          });
        } else if (parsed && typeof parsed === 'object') {
          validKeys.forEach(k => {
            if (typeof parsed[k] === 'boolean') {
              result[roleKey][k] = parsed[k];
            }
          });
        }
      } catch (e) {}
    });
    return result;
  },

  saveRolePermissions(role, perms) {
    const cleanRole = String(role).toLowerCase();
    const validKeys = Object.keys(DEFAULT_PERMISSIONS.admin);
    const existing = this.getRolePermissions()[cleanRole] || { ...DEFAULT_PERMISSIONS.member };
    const merged = { ...existing };

    if (Array.isArray(perms)) {
      validKeys.forEach(k => {
        merged[k] = perms.includes(k);
      });
    } else if (perms && typeof perms === 'object') {
      validKeys.forEach(k => {
        if (typeof perms[k] === 'boolean') {
          merged[k] = perms[k];
        }
      });
    }

    db.prepare(`
      INSERT INTO role_permissions (role, permissions_json)
      VALUES (?, ?)
      ON CONFLICT(role) DO UPDATE SET permissions_json = excluded.permissions_json
    `).run(cleanRole, JSON.stringify(merged));
    return merged;
  },

  getWebhookSecret() {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT)`);
      const row = db.prepare("SELECT value FROM server_settings WHERE key = 'webhook_secret'").get();
      if (row && row.value) return row.value;
      const newSecret = crypto.randomBytes(16).toString('hex');
      db.prepare("INSERT INTO server_settings (key, value) VALUES ('webhook_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(newSecret);
      return newSecret;
    } catch (err) {
      return 'talkapp_sec_' + crypto.randomBytes(8).toString('hex');
    }
  },

  // --- SUNUCU GENEL AYARLARI (SERVER IDENTITY & SETTINGS) ---
  getServerSettings() {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT)`);
      const rows = db.prepare('SELECT key, value FROM server_settings').all();
      const settings = {
        serverName: 'TalkApp Sunucusu',
        serverIcon: '🎮',
        serverDesc: 'Sesli, görüntülü ve mesajlaşma sunucusu',
        webhookSecret: this.getWebhookSecret()
      };
      for (const r of rows) {
        if (r.key === 'server_name' && r.value) settings.serverName = r.value;
        if (r.key === 'server_icon' && r.value) settings.serverIcon = r.value;
        if (r.key === 'server_desc' && r.value) settings.serverDesc = r.value;
        if (r.key === 'webhook_secret' && r.value) settings.webhookSecret = r.value;
      }
      return settings;
    } catch (err) {
      console.warn('[DB] getServerSettings error:', err.message);
      return {
        serverName: 'TalkApp Sunucusu',
        serverIcon: '🎮',
        serverDesc: 'Sesli, görüntülü ve mesajlaşma sunucusu',
        webhookSecret: 'talkapp_secret'
      };
    }
  },

  updateServerSettings(newSettings) {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS server_settings (key TEXT PRIMARY KEY, value TEXT)`);
      const stmt = db.prepare('INSERT INTO server_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      if (newSettings.serverName !== undefined) {
        stmt.run('server_name', String(newSettings.serverName).trim().substring(0, 50));
      }
      if (newSettings.serverIcon !== undefined) {
        stmt.run('server_icon', String(newSettings.serverIcon).trim().substring(0, 10));
      }
      if (newSettings.serverDesc !== undefined) {
        stmt.run('server_desc', String(newSettings.serverDesc).trim().substring(0, 200));
      }
    } catch (err) {
      console.warn('[DB] updateServerSettings error:', err.message);
    }
    return this.getServerSettings();
  },

  // --- SUNUCU YEDEKLEME & GERİ YÜKLEME ---
  exportServerBackup() {
    const channels = db.prepare('SELECT id, name, type, category, min_role, password, admin_only_post, user_limit FROM channels WHERE is_temp = 0').all();
    const permissions = this.getRolePermissions();
    const customSounds = db.prepare('SELECT id, name, sound_url, uploaded_by FROM custom_sounds').all();
    const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50').all();
    const serverSettings = this.getServerSettings();

    return {
      serverName: serverSettings.serverName,
      serverSettings: serverSettings,
      version: '4.5',
      exportDate: new Date().toISOString(),
      channels: channels,
      permissions: permissions,
      customSounds: customSounds,
      auditLogs: auditLogs
    };
  },

  importServerBackup(backup) {
    if (!backup || !backup.channels || !Array.isArray(backup.channels)) {
      throw new Error('Geçersiz yedekleme dosyası formatı!');
    }

    let restoredChannels = 0;
    const stmt = db.prepare(`
      INSERT INTO channels (id, name, type, category, min_role, password, admin_only_post, user_limit, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        category = excluded.category,
        min_role = excluded.min_role,
        password = excluded.password,
        admin_only_post = excluded.admin_only_post,
        user_limit = excluded.user_limit
    `);

    backup.channels.forEach(ch => {
      stmt.run(
        ch.id,
        ch.name,
        ch.type,
        ch.category || 'GENEL SOHBET',
        ch.min_role || ch.minRole || 'member',
        ch.password || null,
        (ch.admin_only_post || ch.adminOnlyPost) ? 1 : 0,
        Number(ch.user_limit || ch.userLimit) || 0,
        Date.now()
      );
      restoredChannels++;
    });

    if (backup.permissions && typeof backup.permissions === 'object') {
      for (const [role, perms] of Object.entries(backup.permissions)) {
        this.saveRolePermissions(role, perms);
      }
    }
    if (backup.serverSettings && typeof backup.serverSettings === 'object') {
      this.updateServerSettings(backup.serverSettings);
    }

    this.logAudit('IMPORT_BACKUP', 'admin', 'Yönetici', null, null, `${restoredChannels} kanal ve izinler yedekten geri yüklendi.`);

    return {
      success: true,
      restoredChannels: restoredChannels
    };
  },

  checkpointAndCreateBackup() {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const backupsDir = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupsDir, `talkapp_backup_${timestamp}.db`);
      fs.copyFileSync(DB_PATH, backupPath);

      // Rotate: keep only the last 5 backups
      const files = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith('talkapp_backup_') && f.endsWith('.db'))
        .map(f => ({ name: f, time: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 5) {
        files.slice(5).forEach(f => {
          try { fs.unlinkSync(path.join(backupsDir, f.name)); } catch (e) {}
        });
      }

      return { success: true, backupPath, totalBackups: Math.min(files.length, 5) };
    } catch (err) {
      console.error('[DB Backup Error]:', err);
      return { success: false, error: err.message };
    }
  },

  saveBase64File
};
