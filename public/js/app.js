// TalkApp - Modern Ses, Video, Ekran, Pro DSP Ses Stüdyosu, Kalıcı SQLite, Hızlı Arama, Müzik Botu & Webhook
(() => {
  // Persistent guest player name initialization (Issue 4 fix)
  let savedInitialUsername = localStorage.getItem('talkapp_username');
  if (!savedInitialUsername || !savedInitialUsername.trim()) {
    savedInitialUsername = 'Oyuncu' + Math.floor(Math.random() * 900 + 100);
    try {
      localStorage.setItem('talkapp_username', savedInitialUsername);
    } catch (e) {}
  }

  // Global Application State
  const state = {
    serverHost: window.location.host || localStorage.getItem('talkapp_server_host') || 'localhost:3000',
    username: savedInitialUsername,
    myRole: 'member', // 'admin', 'mod', 'vip', 'member'
    role: 'member',
    myStatus: localStorage.getItem('talkapp_status') || 'online',
    gameActivity: localStorage.getItem('talkapp_game') || '',
    selfId: null,

    // Authentication (SQLite Persistent Auth)
    authToken: localStorage.getItem('talkapp_token') || null,
    isLoggedIn: false,
    authMode: 'login', // 'login' | 'register'

    // Active Navigation
    activeViewType: 'text', // 'text', 'voice', 'dm'
    activeChannelId: 'text-genel',
    activeChannelName: 'genel-sohbet',
    activeDmUserId: null,
    activeDmUserName: '',

    // Active Voice Room & Music Bot
    activeVoiceRoomId: null,
    activeVoiceRoomName: null,
    musicAudio: new Audio(),
    musicState: { isPlaying: false, stationUrl: '', stationName: '', volume: 50 },

    // Audio Studio, PTT, PTM & Ducking (Shortcuts default to passive for gaming)
    isMicTesting: false,
    isBindingPttKey: false,
    isBindingPtmKey: false,
    isBindingMuteToggleKey: false,
    pttKey: localStorage.getItem('talkapp_ptt_key') || 'Space',
    ptmKey: localStorage.getItem('talkapp_ptm_key') || 'KeyV',
    muteToggleKey: localStorage.getItem('talkapp_mute_toggle_key') || 'KeyM',
    isPtmPressed: false,
    shortcutsMasterEnabled: localStorage.getItem('talkapp_shortcuts_master') !== null
      ? localStorage.getItem('talkapp_shortcuts_master') === 'true'
      : true,
    ptmShortcutEnabled: localStorage.getItem('talkapp_ptm_enabled') === 'true',
    muteShortcutEnabled: localStorage.getItem('talkapp_mute_shortcut_enabled') === 'true',
    deafenShortcutEnabled: localStorage.getItem('talkapp_deafen_shortcut_enabled') === 'true',
    deafenKey: localStorage.getItem('talkapp_deafen_key') || 'KeyD',
    isBindingDeafenKey: false,
    companionToken: (() => {
      let t = localStorage.getItem('talkapp_companion_token');
      if (!t) {
        t = 'TK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('talkapp_companion_token', t);
      }
      return t;
    })(),
    isCompanionConnected: false,
    voiceChangerEnabled: localStorage.getItem('talkapp_voice_fx_enabled') !== 'false',
    testMicSoundToggle: false,
    audioDuckingEnabled: localStorage.getItem('talkapp_audio_ducking_enabled') !== 'false',
    audioDuckingPct: parseInt(localStorage.getItem('talkapp_audio_ducking_pct') || '70', 10),
    isDuckingActive: false,
    activePreset: localStorage.getItem('talkapp_audio_preset') || 'competitive',

    // Multi-Server & Communities
    currentServerId: 'srv_default',
    myServers: [],
    unreadServers: new Set(),
    activeHomeTab: 'online', // 'online' | 'all' | 'pending' | 'add'
    activeHomeView: 'friends', // 'friends' | 'dm'

    // Channels, Categories & Members
    channels: { text: [], voice: [] },
    serverSettings: { serverName: 'TalkApp Sunucusu', serverIcon: '🎮', serverDesc: '' },
    serverMembers: [],
    serverRoles: [],
    selectedRoleId: null,
    currentServerPermissions: {},
    dms: new Map(), // userId -> { id, name, unread }
    currentMessages: [], // cached messages for active channel/dm
    hasMoreMessages: false,
    isLoadingMoreMessages: false,
    collapsedCategories: (() => {
      try {
        const parsed = JSON.parse(localStorage.getItem('talkapp_collapsed_cats') || '[]');
        return new Set(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        return new Set();
      }
    })(),

    // Full-Text Search
    searchDebounceTimer: null,

    // Media & Hardware
    isMicMuted: false,
    isDeafened: false,
    isCameraOn: false,
    isScreenSharing: false,
    cameraStream: null,
    serverMuted: false,

    // WebRTC Peers in active voice room
    peers: new Map(),

    // Attached Image, File & Reply
    attachedImageBase64: null,
    attachedFile: null, // { name, size, dataUrl }
    replyingTo: null, // { id, senderName, text }
    appTheme: localStorage.getItem('talkapp_theme') || 'dark',
    myAvatar: localStorage.getItem('talkapp_avatar') || '',
    myBadge: localStorage.getItem('talkapp_badge') || '',

    // Voice Note MediaRecorder
    mediaRecorder: null,
    audioChunks: [],
    isRecordingVoiceNote: false,
    cancelVoiceRecording: false,
    voiceRecTimerInterval: null,
    voiceRecSeconds: 0,

    // Selected Member for Modal
    selectedMember: null,

    // Pending Channel for Password
    pendingPasswordChannel: null,

    // PWA Install Event
    deferredInstallPrompt: null,

    // Settings
    miniPipEnabled: localStorage.getItem('talkapp_mini_pip') === 'true',
    lowCpuMode: localStorage.getItem('talkapp_low_cpu') !== 'false',

    // Friends & Direct Call
    friends: [],
    friendsTab: 'all', // 'all' | 'pending'
    activeDirectCall: null, // { peerId, peerName, type, isCaller, pc }
    incomingCallData: null, // { callerId, callerName, callerAvatar, callType }
    directCallTimerInterval: null,
    directCallSeconds: 0,
    isDirectCallMicMuted: false,
    isDirectCallCamOff: false,

    // Channel Notification Preferences: { [channelId]: 'all' | 'mentions' | 'mute' }
    channelNotifs: JSON.parse(localStorage.getItem('talkapp_channel_notifs') || '{}'),

    // Typing State
    typingUsers: new Map(), // userId -> { name, timeout }
    isCurrentlyTyping: false,
    typingTimer: null,

    // Custom Sounds
    customSounds: [],

    // Watch Party State
    watchPartyState: { videoId: '', state: 'paused', currentTime: 0 },
    isWpAudioOnly: false,

    // Threads State
    activeThreadParentId: null,
    activeThreadParentMsg: null,

    // Voice FX State
    activeVoiceFx: 'none',

    // Role Permissions State
    rolePermissions: null,

    // Screen Annotation State
    activeAnnotationTool: 'laser',
    annotationColor: '#ff2d55',

    // Managers
    audioManager: null,
    screenManager: null,
    webrtc: null,
    ws: null,
    pingTimer: null
  };

  // DOM Elements Cache
  const el = {
    appContainer: document.querySelector('.app-container'),
    btnMobileMenuToggle: document.getElementById('btnMobileMenuToggle'),
    mobileSidebarBackdrop: document.getElementById('mobileSidebarBackdrop'),
    lblServerName: document.getElementById('lblServerName'),
    lblPing: document.getElementById('lblPing'),
    pingDot: document.getElementById('pingDot'),
    lblActiveChannelName: document.getElementById('lblActiveChannelName'),
    headerPrefix: document.getElementById('headerPrefix'),
    btnToggleVoiceView: document.getElementById('btnToggleVoiceView'),
    btnViewPinnedMessages: document.getElementById('btnViewPinnedMessages'),
    lblCurrentHostDisplay: document.getElementById('lblCurrentHostDisplay'),
    headerStatusDot: document.getElementById('headerStatusDot'),
    btnToggleMemberList: document.getElementById('btnToggleMemberList'),
    memberSidebar: document.getElementById('memberSidebar'),

    // Full-Text Search
    headerSearchBar: document.getElementById('headerSearchBar'),
    inputSearchMessages: document.getElementById('inputSearchMessages'),
    searchResultsDropdown: document.getElementById('searchResultsDropdown'),

    // Header Auth Tag
    btnOpenAuthModal: document.getElementById('btnOpenAuthModal'),
    lblAuthStatusText: document.getElementById('lblAuthStatusText'),

    // Channel List & Creation
    channelList: document.getElementById('channelList'),
    btnQuickCreateChannel: document.getElementById('btnQuickCreateChannel'),

    // Active Voice Connection Bar
    activeVoiceBar: document.getElementById('activeVoiceBar'),
    lblVoiceCurrentRoom: document.getElementById('lblVoiceCurrentRoom'),
    btnHangupVoiceBar: document.getElementById('btnHangupVoiceBar'),

    // User Dock
    myAvatar: document.getElementById('myAvatar'),
    myStatusDot: document.getElementById('myStatusDot'),
    myUsername: document.getElementById('myUsername'),
    myRoleTag: document.getElementById('myRoleTag'),
    myUserId: document.getElementById('myUserId'),
    btnUserEdit: document.getElementById('btnUserEdit'),
    btnDockMic: document.getElementById('btnDockMic'),
    btnDockDeafen: document.getElementById('btnDockDeafen'),
    iconDockMicOn: document.getElementById('iconDockMicOn'),
    iconDockMicOff: document.getElementById('iconDockMicOff'),
    iconDockDeafenOff: document.getElementById('iconDockDeafenOff'),
    iconDockDeafenOn: document.getElementById('iconDockDeafenOn'),
    btnSettingsOpen: document.getElementById('btnSettingsOpen'),

    // Chat View
    textChatView: document.getElementById('textChatView'),
    chatDropOverlay: document.getElementById('chatDropOverlay'),
    textChatMessages: document.getElementById('textChatMessages'),
    chatTextarea: document.getElementById('chatTextarea'),
    fileChatAttach: document.getElementById('fileChatAttach'),
    btnChatAttach: document.getElementById('btnChatAttach'),
    btnToggleEmojiPicker: document.getElementById('btnToggleEmojiPicker'),
    btnCloseEmojiPicker: document.getElementById('btnCloseEmojiPicker'),
    emojiPickerPopover: document.getElementById('emojiPickerPopover'),
    emojiPickerGrid: document.getElementById('emojiPickerGrid'),
    btnRecordVoiceNote: document.getElementById('btnRecordVoiceNote'),
    chatImagePreviewBar: document.getElementById('chatImagePreviewBar'),
    chatImagePreviewThumb: document.getElementById('chatImagePreviewThumb'),
    lblChatAttachmentPreview: document.getElementById('lblChatAttachmentPreview'),
    btnRemoveImagePreview: document.getElementById('btnRemoveImagePreview'),
    voiceRecordingBar: document.getElementById('voiceRecordingBar'),
    voiceRecTime: document.getElementById('voiceRecTime'),
    btnCancelVoiceRecording: document.getElementById('btnCancelVoiceRecording'),
    btnSendVoiceRecording: document.getElementById('btnSendVoiceRecording'),
    chatReplyBar: document.getElementById('chatReplyBar'),
    replyTargetName: document.getElementById('replyTargetName'),
    replySnippet: document.getElementById('replySnippet'),
    btnCancelReply: document.getElementById('btnCancelReply'),

    // Voice Arena
    voiceArena: document.getElementById('voiceArena'),
    participantGrid: document.getElementById('participantGrid'),
    cardSelf: document.getElementById('card-self'),
    avatarSelfBig: document.getElementById('avatarSelfBig'),
    videoSelf: document.getElementById('videoSelf'),
    nameSelfCard: document.getElementById('nameSelfCard'),
    badgeMicSelf: document.getElementById('badgeMicSelf'),
    badgeScreenSelf: document.getElementById('badgeScreenSelf'),
    btnMaximizeSelf: document.getElementById('btnMaximizeSelf'),
    btnFullscreenSelf: document.getElementById('btnFullscreenSelf'),

    // Screen Share Quality Popover
    screenQualityPopover: document.getElementById('screenQualityPopover'),
    btnCloseScreenQuality: document.getElementById('btnCloseScreenQuality'),

    // Soundboard & Quick Chat
    btnCallQuickChat: document.getElementById('btnCallQuickChat'),
    btnCallSoundboard: document.getElementById('btnCallSoundboard'),
    soundboardPopover: document.getElementById('soundboardPopover'),
    btnCloseSoundboard: document.getElementById('btnCloseSoundboard'),

    // Music / Radio Bot
    btnCallMusicBot: document.getElementById('btnCallMusicBot'),
    musicPlayerPopover: document.getElementById('musicPlayerPopover'),
    btnCloseMusicPlayer: document.getElementById('btnCloseMusicPlayer'),
    selectRadioStation: document.getElementById('selectRadioStation'),
    inputCustomMusicUrl: document.getElementById('inputCustomMusicUrl'),
    btnToggleMusicPlay: document.getElementById('btnToggleMusicPlay'),
    musicBotVolume: document.getElementById('musicBotVolume'),

    // Call Controls
    btnCallMic: document.getElementById('btnCallMic'),
    lblBtnMic: document.getElementById('lblBtnMic'),
    btnCallCamera: document.getElementById('btnCallCamera'),
    lblBtnCamera: document.getElementById('lblBtnCamera'),
    btnCallScreen: document.getElementById('btnCallScreen'),
    lblBtnScreen: document.getElementById('lblBtnScreen'),
    btnCallDeafen: document.getElementById('btnCallDeafen'),
    lblBtnDeafen: document.getElementById('lblBtnDeafen'),
    btnCallDisconnect: document.getElementById('btnCallDisconnect'),

    // Mini PiP Overlay
    miniPipOverlay: document.getElementById('miniPipOverlay'),
    btnCloseMiniPip: document.getElementById('btnCloseMiniPip'),
    miniPipSpeakersList: document.getElementById('miniPipSpeakersList'),

    // Auth Modal
    modalAuth: document.getElementById('modalAuth'),
    lblAuthModalTitle: document.getElementById('lblAuthModalTitle'),
    btnCloseAuthModal: document.getElementById('btnCloseAuthModal'),
    btnAuthTabLogin: document.getElementById('btnAuthTabLogin'),
    btnAuthTabRegister: document.getElementById('btnAuthTabRegister'),
    inputAuthUsername: document.getElementById('inputAuthUsername'),
    inputAuthPassword: document.getElementById('inputAuthPassword'),
    btnTogglePasswordVis: document.getElementById('btnTogglePasswordVis'),
    authErrorBanner: document.getElementById('authErrorBanner'),
    authFormSection: document.getElementById('authFormSection'),
    authLoggedInSection: document.getElementById('authLoggedInSection'),
    authCurrentAvatar: document.getElementById('authCurrentAvatar'),
    authCurrentUsername: document.getElementById('authCurrentUsername'),
    authCurrentRoleTag: document.getElementById('authCurrentRoleTag'),
    authCurrentUserId: document.getElementById('authCurrentUserId'),
    btnAuthSwitchAccount: document.getElementById('btnAuthSwitchAccount'),
    btnAuthLogout: document.getElementById('btnAuthLogout'),
    authFormFooter: document.getElementById('authFormFooter'),
    btnCancelAuth: document.getElementById('btnCancelAuth'),
    btnSubmitAuth: document.getElementById('btnSubmitAuth'),

    // Pinned Messages Modal
    modalPinnedMessages: document.getElementById('modalPinnedMessages'),
    btnClosePinnedModal: document.getElementById('btnClosePinnedModal'),
    pinnedMessagesList: document.getElementById('pinnedMessagesList'),

    // Multi-Tab Settings Modal
    modalSettings: document.getElementById('modalSettings'),
    inputSettingsUsername: document.getElementById('inputSettingsUsername'),
    selectSettingsStatus: document.getElementById('selectSettingsStatus'),
    inputSettingsGameActivity: document.getElementById('inputSettingsGameActivity'),
    selectInputDevice: document.getElementById('selectInputDevice'),
    selectOutputDevice: document.getElementById('selectOutputDevice'),
    chkSoundEffects: document.getElementById('chkSoundEffects'),
    chkMiniPip: document.getElementById('chkMiniPip'),
    chkLowCpuMode: document.getElementById('chkLowCpuMode'),
    btnInstallPwa: document.getElementById('btnInstallPwa'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    btnReqDesktopNotif: document.getElementById('btnReqDesktopNotif'),

    // Quick Invite & Header PWA
    btnServerInvite: document.getElementById('btnServerInvite'),
    btnHeaderInstallPwa: document.getElementById('btnHeaderInstallPwa'),

    // WebRTC Stats HUD & Bitrate
    selectVoiceBitrate: document.getElementById('selectVoiceBitrate'),
    voiceRtcStatsBar: document.getElementById('voiceRtcStatsBar'),
    voiceQualityDot: document.getElementById('voiceQualityDot'),
    lblVoiceQualitySummary: document.getElementById('lblVoiceQualitySummary'),
    lblVoiceCodecBadge: document.getElementById('lblVoiceCodecBadge'),
    lblVoiceRtt: document.getElementById('lblVoiceRtt'),
    lblVoiceLoss: document.getElementById('lblVoiceLoss'),
    lblVoiceJitter: document.getElementById('lblVoiceJitter'),

    // Appearance & Gamer Badge
    selectAppTheme: document.getElementById('selectAppTheme'),
    avatarPresetsGrid: document.getElementById('avatarPresetsGrid'),
    inputCustomAvatarUrl: document.getElementById('inputCustomAvatarUrl'),
    fileAvatarPicker: document.getElementById('fileAvatarPicker'),
    btnPickAvatarFile: document.getElementById('btnPickAvatarFile'),
    btnRemoveCustomAvatar: document.getElementById('btnRemoveCustomAvatar'),
    avatarSettingsPreview: document.getElementById('avatarSettingsPreview'),
    selectGamerBadge: document.getElementById('selectGamerBadge'),

    // Audit Log
    btnTabAudit: document.getElementById('btnTabAudit'),
    btnRefreshAuditLogs: document.getElementById('btnRefreshAuditLogs'),
    auditTableBody: document.getElementById('auditTableBody'),

    // Audio Studio & DSP Elements
    audioPresetChips: document.getElementById('audioPresetChips'),
    btnToggleMicTest: document.getElementById('btnToggleMicTest'),
    dbMeterLevel: document.getElementById('dbMeterLevel'),
    dbThresholdMarker: document.getElementById('dbThresholdMarker'),
    lblCurrentDb: document.getElementById('lblCurrentDb'),
    lblGateState: document.getElementById('lblGateState'),
    radioVad: document.getElementById('radioVad'),
    radioPtt: document.getElementById('radioPtt'),
    radioPtm: document.getElementById('radioPtm'),
    boxPttKeyBind: document.getElementById('boxPttKeyBind'),
    btnBindPttKey: document.getElementById('btnBindPttKey'),
    chkPttSoundEnabled: document.getElementById('chkPttSoundEnabled'),
    boxPtmKeyBind: document.getElementById('boxPtmKeyBind'),
    btnBindPtmKey: document.getElementById('btnBindPtmKey'),
    boxMuteToggleKeyBind: document.getElementById('boxMuteToggleKeyBind'),
    btnBindMuteToggleKey: document.getElementById('btnBindMuteToggleKey'),
    chkShortcutsMaster: document.getElementById('chkShortcutsMaster'),
    lblShortcutsMasterBadge: document.getElementById('lblShortcutsMasterBadge'),
    badgeCompanionStatus: document.getElementById('badgeCompanionStatus'),
    inputCompanionToken: document.getElementById('inputCompanionToken'),
    btnCopyCompanionToken: document.getElementById('btnCopyCompanionToken'),
    btnDownloadCompanion: document.getElementById('btnDownloadCompanion'),
    btnPairCompanionLocal: document.getElementById('btnPairCompanionLocal'),
    cardPtm: document.getElementById('cardPtm'),
    chkPtmEnabled: document.getElementById('chkPtmEnabled'),
    badgePtmStatus: document.getElementById('badgePtmStatus'),
    cardMuteToggle: document.getElementById('cardMuteToggle'),
    chkMuteToggleEnabled: document.getElementById('chkMuteToggleEnabled'),
    badgeMuteToggleStatus: document.getElementById('badgeMuteToggleStatus'),
    cardDeafen: document.getElementById('cardDeafen'),
    chkDeafenEnabled: document.getElementById('chkDeafenEnabled'),
    badgeDeafenStatus: document.getElementById('badgeDeafenStatus'),
    btnBindDeafenKey: document.getElementById('btnBindDeafenKey'),
    chkVoiceChangerEnabled: document.getElementById('chkVoiceChangerEnabled'),
    selectMicNotifSound: document.getElementById('selectMicNotifSound'),
    btnTestMicNotifSound: document.getElementById('btnTestMicNotifSound'),
    groupNoiseGate: document.getElementById('groupNoiseGate'),
    sliderNoiseGate: document.getElementById('sliderNoiseGate'),
    lblNoiseGateValue: document.getElementById('lblNoiseGateValue'),
    sliderMicGain: document.getElementById('sliderMicGain'),
    lblMicGainValue: document.getElementById('lblMicGainValue'),
    chkHighPass: document.getElementById('chkHighPass'),
    chkVocalClarity: document.getElementById('chkVocalClarity'),
    chkLimiter: document.getElementById('chkLimiter'),
    chkEchoCancellation: document.getElementById('chkEchoCancellation'),
    chkAiNoiseSuppression: document.getElementById('chkAiNoiseSuppression'),
    chkAudioDucking: document.getElementById('chkAudioDucking'),
    boxDuckingSlider: document.getElementById('boxDuckingSlider'),
    sliderDuckingPct: document.getElementById('sliderDuckingPct'),
    lblDuckingPctValue: document.getElementById('lblDuckingPctValue'),

    // Webhooks in Settings Tab
    selectWebhookChannel: document.getElementById('selectWebhookChannel'),
    lblWebhookUrl: document.getElementById('lblWebhookUrl'),
    codeWebhookSnippet: document.getElementById('codeWebhookSnippet'),
    btnCopyWebhookUrl: document.getElementById('btnCopyWebhookUrl'),

    // User Action & Moderation Modal
    modalUserAction: document.getElementById('modalUserAction'),
    btnCloseUserActionModal: document.getElementById('btnCloseUserActionModal'),
    userActionAvatar: document.getElementById('userActionAvatar'),
    userActionName: document.getElementById('userActionName'),
    userActionId: document.getElementById('userActionId'),
    userActionGame: document.getElementById('userActionGame'),
    btnStartDmFromModal: document.getElementById('btnStartDmFromModal'),
    modActionGroup: document.getElementById('modActionGroup'),
    btnKickVoiceMember: document.getElementById('btnKickVoiceMember'),
    btnServerMuteMember: document.getElementById('btnServerMuteMember'),
    modMoveVoiceRow: document.getElementById('modMoveVoiceRow'),
    selectMoveVoiceChannel: document.getElementById('selectMoveVoiceChannel'),
    btnMoveVoiceMember: document.getElementById('btnMoveVoiceMember'),
    adminRoleAssignGroup: document.getElementById('adminRoleAssignGroup'),
    selectAssignRole: document.getElementById('selectAssignRole'),
    btnConfirmAssignRole: document.getElementById('btnConfirmAssignRole'),
    userActionRolesWrapper: document.getElementById('userActionRolesWrapper'),
    userActionRoleBadges: document.getElementById('userActionRoleBadges'),
    memberRolesCheckList: document.getElementById('memberRolesCheckList'),

    // Channel Creation & Passwords
    modalCreateChannel: document.getElementById('modalCreateChannel'),
    btnCloseCreateChannelModal: document.getElementById('btnCloseCreateChannelModal'),
    btnCancelCreateChannel: document.getElementById('btnCancelCreateChannel'),
    btnConfirmCreateChannel: document.getElementById('btnConfirmCreateChannel'),
    inputNewChannelName: document.getElementById('inputNewChannelName'),
    selectChannelCategory: document.getElementById('selectChannelCategory'),
    inputCustomCategory: document.getElementById('inputCustomCategory'),
    selectChannelMinRole: document.getElementById('selectChannelMinRole'),
    voiceUserLimitGroup: document.getElementById('voiceUserLimitGroup'),
    selectVoiceUserLimit: document.getElementById('selectVoiceUserLimit'),
    chkProtectPassword: document.getElementById('chkProtectPassword'),
    inputChannelPassword: document.getElementById('inputChannelPassword'),
    radioTypeChat: document.getElementById('radioTypeChat'),
    radioTypeVoice: document.getElementById('radioTypeVoice'),

    modalChannelPassword: document.getElementById('modalChannelPassword'),
    btnCloseChannelPasswordModal: document.getElementById('btnCloseChannelPasswordModal'),
    btnCancelEnteredPassword: document.getElementById('btnCancelEnteredPassword'),
    btnSubmitEnteredPassword: document.getElementById('btnSubmitEnteredPassword'),
    inputEnteredPassword: document.getElementById('inputEnteredPassword'),
    lblChannelPasswordPrompt: document.getElementById('lblChannelPasswordPrompt'),

    // Server Connect Modal & Multi-Guild Rail
    modalServerConnect: document.getElementById('modalServerConnect'),
    wrapRailHome: document.getElementById('wrapRailHome'),
    pillRailHome: document.getElementById('pillRailHome'),
    btnRailHome: document.getElementById('btnRailHome'),
    dotHomeUnread: document.getElementById('dotHomeUnread'),
    railServersList: document.getElementById('railServersList'),
    recentServersList: document.getElementById('recentServersList'),
    btnQuickAddServer: document.getElementById('btnQuickAddServer'),
    btnHeaderServer: document.getElementById('btnHeaderServer'),
    btnCloseServerModal: document.getElementById('btnCloseServerModal'),
    btnCancelServerModal: document.getElementById('btnCancelServerModal'),
    btnConfirmServerConnect: document.getElementById('btnConfirmServerConnect'),
    inputServerHost: document.getElementById('inputServerHost'),

    // Server Header Dropdown Menu
    btnServerDropdownToggle: document.getElementById('btnServerDropdownToggle'),
    serverHeaderDropdown: document.getElementById('serverHeaderDropdown'),
    menuItemInvite: document.getElementById('menuItemInvite'),
    menuInviteCodeBadge: document.getElementById('menuInviteCodeBadge'),
    menuItemCreateChannel: document.getElementById('menuItemCreateChannel'),
    menuItemServerSettings: document.getElementById('menuItemServerSettings'),
    menuItemLeaveServer: document.getElementById('menuItemLeaveServer'),
    menuItemDeleteServer: document.getElementById('menuItemDeleteServer'),

    // Create / Join Server Modal Tabs
    tabModalCreateServer: document.getElementById('tabModalCreateServer'),
    tabModalJoinServer: document.getElementById('tabModalJoinServer'),
    tabModalDomainGateway: document.getElementById('tabModalDomainGateway'),
    panelCreateServer: document.getElementById('panelCreateServer'),
    panelJoinServer: document.getElementById('panelJoinServer'),
    panelDomainGateway: document.getElementById('panelDomainGateway'),
    inputNewServerName: document.getElementById('inputNewServerName'),
    inputNewServerDesc: document.getElementById('inputNewServerDesc'),
    inputSelectedServerIcon: document.getElementById('inputSelectedServerIcon'),
    serverIconPicker: document.getElementById('serverIconPicker'),
    btnSubmitCreateServer: document.getElementById('btnSubmitCreateServer'),
    btnCancelCreateServer: document.getElementById('btnCancelCreateServer'),
    inputJoinInviteCode: document.getElementById('inputJoinInviteCode'),
    btnSubmitJoinServer: document.getElementById('btnSubmitJoinServer'),
    btnCancelJoinServer: document.getElementById('btnCancelJoinServer'),
    btnCancelDomainConnect: document.getElementById('btnCancelDomainConnect'),

    // Guild Settings Modal
    modalGuildSettings: document.getElementById('modalGuildSettings'),
    btnCloseGuildSettingsModal: document.getElementById('btnCloseGuildSettingsModal'),
    btnCancelGuildSettings: document.getElementById('btnCancelGuildSettings'),
    btnSaveGuildSettings: document.getElementById('btnSaveGuildSettings'),
    inputEditGuildName: document.getElementById('inputEditGuildName'),
    inputEditGuildIcon: document.getElementById('inputEditGuildIcon'),
    inputEditGuildDesc: document.getElementById('inputEditGuildDesc'),
    lblGuildSettingsInviteCode: document.getElementById('lblGuildSettingsInviteCode'),
    btnCopyGuildInviteCode: document.getElementById('btnCopyGuildInviteCode'),
    dangerZoneGuildDelete: document.getElementById('dangerZoneGuildDelete'),
    btnDeleteCurrentGuild: document.getElementById('btnDeleteCurrentGuild'),
    btnGuildTabOverview: document.getElementById('btnGuildTabOverview'),
    btnGuildTabRoles: document.getElementById('btnGuildTabRoles'),
    btnGuildTabAudit: document.getElementById('btnGuildTabAudit'),
    panelGuildOverview: document.getElementById('panelGuildOverview'),
    panelGuildRoles: document.getElementById('panelGuildRoles'),
    panelGuildAudit: document.getElementById('panelGuildAudit'),
    btnRefreshGuildAudit: document.getElementById('btnRefreshGuildAudit'),
    guildAuditTableBody: document.getElementById('guildAuditTableBody'),
    btnCreateNewRole: document.getElementById('btnCreateNewRole'),
    guildRolesList: document.getElementById('guildRolesList'),
    roleEditorEmpty: document.getElementById('roleEditorEmpty'),
    roleEditorContent: document.getElementById('roleEditorContent'),
    lblEditRoleHeading: document.getElementById('lblEditRoleHeading'),
    lblEditRoleSubtitle: document.getElementById('lblEditRoleSubtitle'),
    btnDeleteRole: document.getElementById('btnDeleteRole'),
    inputEditRoleName: document.getElementById('inputEditRoleName'),
    inputEditRoleColorCustom: document.getElementById('inputEditRoleColorCustom'),
    lblEditRoleColorHex: document.getElementById('lblEditRoleColorHex'),
    chkEditRoleHoist: document.getElementById('chkEditRoleHoist'),
    btnSaveRoleChanges: document.getElementById('btnSaveRoleChanges'),

    // Friends Dashboard View
    friendsDashboardView: document.getElementById('friendsDashboardView'),
    pillFriendsOnline: document.getElementById('pillFriendsOnline'),
    pillFriendsAll: document.getElementById('pillFriendsAll'),
    pillFriendsPending: document.getElementById('pillFriendsPending'),
    pillFriendsAdd: document.getElementById('pillFriendsAdd'),
    countDashOnline: document.getElementById('countDashOnline'),
    countDashAll: document.getElementById('countDashAll'),
    countDashPending: document.getElementById('countDashPending'),
    inputFriendsFilter: document.getElementById('inputFriendsFilter'),
    friendsAddPanel: document.getElementById('friendsAddPanel'),
    inputDashAddFriend: document.getElementById('inputDashAddFriend'),
    btnDashSendFriendReq: document.getElementById('btnDashSendFriendReq'),
    dashAddFriendStatus: document.getElementById('dashAddFriendStatus'),
    friendsPendingPanel: document.getElementById('friendsPendingPanel'),
    friendsPendingContainer: document.getElementById('friendsPendingContainer'),
    friendsListPanel: document.getElementById('friendsListPanel'),
    lblFriendsListSectionTitle: document.getElementById('lblFriendsListSectionTitle'),
    dashFriendsCardsContainer: document.getElementById('dashFriendsCardsContainer'),
    activeNowList: document.getElementById('activeNowList'),

    modalScreenShare: document.getElementById('modalScreenShare'),
    btnCloseScreenModal: document.getElementById('btnCloseScreenModal'),
    btnCancelScreenModal: document.getElementById('btnCancelScreenModal'),
    btnConfirmStartScreen: document.getElementById('btnConfirmStartScreen'),
    chkShareAudio: document.getElementById('chkShareAudio'),

    // Friends & Direct Call
    btnOpenFriendsModal: document.getElementById('btnOpenFriendsModal'),
    modalFriends: document.getElementById('modalFriends'),
    btnCloseFriendsModal: document.getElementById('btnCloseFriendsModal'),
    inputAddFriendUsername: document.getElementById('inputAddFriendUsername'),
    btnSubmitAddFriend: document.getElementById('btnSubmitAddFriend'),
    tabFriendsAll: document.getElementById('tabFriendsAll'),
    tabFriendsPending: document.getElementById('tabFriendsPending'),
    countFriendsAll: document.getElementById('countFriendsAll'),
    countFriendsPending: document.getElementById('countFriendsPending'),
    friendsListContainer: document.getElementById('friendsListContainer'),

    dmCallActions: document.getElementById('dmCallActions'),
    btnDmVoiceCall: document.getElementById('btnDmVoiceCall'),
    btnDmVideoCall: document.getElementById('btnDmVideoCall'),

    modalIncomingCall: document.getElementById('modalIncomingCall'),
    incomingCallAvatar: document.getElementById('incomingCallAvatar'),
    incomingCallerName: document.getElementById('incomingCallerName'),
    incomingCallType: document.getElementById('incomingCallType'),
    btnAcceptCall: document.getElementById('btnAcceptCall'),
    btnDeclineCall: document.getElementById('btnDeclineCall'),

    modalOutgoingCall: document.getElementById('modalOutgoingCall'),
    outgoingCallAvatar: document.getElementById('outgoingCallAvatar'),
    outgoingTargetName: document.getElementById('outgoingTargetName'),
    btnCancelOutgoingCall: document.getElementById('btnCancelOutgoingCall'),

    directCallActivePanel: document.getElementById('directCallActivePanel'),
    directCallPeerName: document.getElementById('directCallPeerName'),
    directCallTimer: document.getElementById('directCallTimer'),
    btnDirectCallExpand: document.getElementById('btnDirectCallExpand'),
    directCallVideoStage: document.getElementById('directCallVideoStage'),
    directCallAvatarFallback: document.getElementById('directCallAvatarFallback'),
    directCallRemoteVideo: document.getElementById('directCallRemoteVideo'),
    directCallLocalVideo: document.getElementById('directCallLocalVideo'),
    btnDirectCallToggleMic: document.getElementById('btnDirectCallToggleMic'),
    btnDirectCallToggleCam: document.getElementById('btnDirectCallToggleCam'),
    btnDirectCallHangup: document.getElementById('btnDirectCallHangup'),

    // Channel Notification Preferences
    btnChannelNotifSettings: document.getElementById('btnChannelNotifSettings'),
    iconChannelNotif: document.getElementById('iconChannelNotif'),
    channelNotifPopover: document.getElementById('channelNotifPopover'),

    // Chat Typing Indicator
    chatTypingBar: document.getElementById('chatTypingBar'),
    typingText: document.getElementById('typingText'),

    // Custom Soundboard
    btnUploadCustomSound: document.getElementById('btnUploadCustomSound'),
    fileCustomSound: document.getElementById('fileCustomSound'),
    customSoundboardGrid: document.getElementById('customSoundboardGrid'),

    // Watch Party
    btnCallWatchParty: document.getElementById('btnCallWatchParty'),
    watchPartyContainer: document.getElementById('watchPartyContainer'),
    watchPartyPlayerBox: document.getElementById('watchPartyPlayerBox'),
    inputWatchPartyUrl: document.getElementById('inputWatchPartyUrl'),
    btnStartWatchPartyVideo: document.getElementById('btnStartWatchPartyVideo'),
    btnCloseWatchParty: document.getElementById('btnCloseWatchParty'),
    btnWpFullscreen: document.getElementById('btnWpFullscreen'),
    btnWpAudioOnlyToggle: document.getElementById('btnWpAudioOnlyToggle'),
    wpAudioOnlyBanner: document.getElementById('wpAudioOnlyBanner'),
    lblWpAudioTitle: document.getElementById('lblWpAudioTitle'),
    watchPartyIframeContainer: document.getElementById('watchPartyIframeContainer'),
    lblWatchPartySyncStatus: document.getElementById('lblWatchPartySyncStatus'),
    btnWpTogglePlay: document.getElementById('btnWpTogglePlay'),
    btnWpRewind: document.getElementById('btnWpRewind'),
    btnWpForward: document.getElementById('btnWpForward'),
    sliderWpVolume: document.getElementById('sliderWpVolume'),

    // Music Bot YouTube
    musicBotYtContainer: document.getElementById('musicBotYtContainer'),
    bgRoomMusicYt: document.getElementById('bgRoomMusicYt'),

    // Threads
    chatThreadSidebar: document.getElementById('chatThreadSidebar'),
    btnCloseThreadSidebar: document.getElementById('btnCloseThreadSidebar'),
    threadParentCard: document.getElementById('threadParentCard'),
    threadMessagesList: document.getElementById('threadMessagesList'),
    threadTextarea: document.getElementById('threadTextarea'),
    btnSendThreadMsg: document.getElementById('btnSendThreadMsg'),

    // Voice Changer
    voiceFxGrid: document.getElementById('voiceFxGrid'),
    lblActiveVoiceFx: document.getElementById('lblActiveVoiceFx'),

    // Settings Modal Close & Cancel (Bug 2)
    btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
    btnCancelSettings: document.getElementById('btnCancelSettings'),

    // Permissions Matrix
    btnTabPermissions: document.getElementById('btnTabPermissions'),
    permMatrixBody: document.getElementById('permMatrixBody'),
    btnSaveRolePermissions: document.getElementById('btnSaveRolePermissions'),

    // Server Backup & Restore
    btnTabBackup: document.getElementById('btnTabBackup'),
    btnExportServerBackup: document.getElementById('btnExportServerBackup'),
    fileServerBackup: document.getElementById('fileServerBackup'),
    btnTriggerRestoreBackup: document.getElementById('btnTriggerRestoreBackup'),

    toastContainer: document.getElementById('toastContainer')
  };

  // Toast Helper
  function showToast(text, duration = 3000) {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // --- INITIALIZATION ---
  async function init() {
    // Instantiate Subsystems FIRST before any UI or event listener queries them
    state.audioManager = new AudioManager();
    state.screenManager = new ScreenShareManager();
    state.webrtc = new WebRTCClient(null);

    registerServiceWorker();
    setupTheme();
    setupAvatarAndBadges();
    setupAuditLogs();
    setupScreenQualityPopover();
    setupReplies();
    updateMyProfileUI();
    setupEventListeners();
    setupChatAttachments();
    setupEmojiPicker();
    setupVoiceNoteRecorder();
    setupSoundboard();
    setupCustomSoundboard();
    setupMusicBot();
    setupFullTextSearch();
    setupMiniPipOverlay();
    setupFriendsSystem();
    setupDirectCall();
    setupChannelNotifSettings();
    setupTypingIndicator();
    setupVoiceChangerUI();
    setupWatchParty();
    setupThreads();
    setupPermissionsMatrix();
    setupServerBackup();
    setupAudioStudioUI();
    setupServerModalsAndDropdown();
    setupFriendsDashboard();

    // Screen Zoom & Maximize for Self Card
    if (el.btnMaximizeSelf) {
      el.btnMaximizeSelf.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMaximizeParticipantCard(el.cardSelf);
      });
    }
    if (el.btnFullscreenSelf) {
      el.btnFullscreenSelf.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFullscreenParticipantCard(el.cardSelf);
      });
    }
    if (el.cardSelf) {
      el.cardSelf.addEventListener('dblclick', (e) => {
        if (e.target.closest('.card-controls')) return;
        toggleMaximizeParticipantCard(el.cardSelf);
      });
    }

    // Wire Audio Callbacks (DSP Noise Gate & Level Meter)
    state.audioManager.onSpeakingChange = (isSpeaking) => {
      el.cardSelf.classList.toggle('speaking', isSpeaking);
      updateVoiceUserSpeakingState(state.selfId, isSpeaking);
      updateVoiceUserSpeakingState('self', isSpeaking);
      updateMiniPipSpeaker(state.selfId, state.username, isSpeaking);
      sendWs({
        type: 'speaking',
        isSpeaking: isSpeaking
      });
      handleAudioDucking(isSpeaking);
    };

    state.audioManager.onMicLevel = (normalizedLevel, currentDb, gateOpen) => {
      if (el.dbMeterLevel) {
        el.dbMeterLevel.style.width = normalizedLevel + '%';
        el.dbMeterLevel.style.opacity = gateOpen ? '1' : '0.4';
      }
      if (el.lblCurrentDb) {
        el.lblCurrentDb.textContent = currentDb <= -95 ? '-∞ dB' : `${currentDb} dB`;
      }
      if (el.lblGateState) {
        el.lblGateState.textContent = gateOpen ? 'AÇIK (İletiliyor)' : 'KAPALI (Sessiz)';
        el.lblGateState.style.color = gateOpen ? 'var(--green)' : 'var(--red)';
      }
    };

    // Wire Screen Share Callbacks (Grid Multi-Screen Support)
    state.screenManager.onStreamStarted = (stream, meta) => {
      state.isScreenSharing = true;
      el.badgeScreenSelf.classList.remove('hidden');
      el.btnCallScreen.classList.add('active-state');
      el.lblBtnScreen.textContent = 'Yayını Durdur';

      state.webrtc.setScreenStream(stream);

      el.videoSelf.srcObject = stream;
      el.videoSelf.classList.add('screen-video');
      el.cardSelf.classList.add('has-video');
      el.cardSelf.classList.add('screen-card');
      attachScreenAnnotationToCard(el.cardSelf);

      sendWs({ type: 'track-state', screen: true });
      showToast(`📺 Ekran yayını başlatıldı (${meta.quality})`);
    };

    state.screenManager.onStreamEnded = () => {
      state.isScreenSharing = false;
      el.badgeScreenSelf.classList.add('hidden');
      el.btnCallScreen.classList.remove('active-state');
      el.lblBtnScreen.textContent = 'Ekranı Paylaş';

      state.webrtc.setScreenStream(null);
      el.cardSelf.classList.remove('screen-card');
      detachScreenAnnotationFromCard(el.cardSelf);
      if (state.isCameraOn && state.cameraStream) {
        el.videoSelf.srcObject = state.cameraStream;
        el.videoSelf.classList.remove('screen-video');
      } else {
        el.videoSelf.srcObject = null;
        el.cardSelf.classList.remove('has-video');
        el.videoSelf.classList.remove('screen-video');
      }

      sendWs({ type: 'track-state', screen: false });
      showToast('📺 Ekran paylaşımı durduruldu.');
    };

    // Wire WebRTC Callbacks (Multi-Screen Grid Rendering)
    state.webrtc.onRemoteTrack = (peerId, track, stream) => {
      if (track.kind === 'audio') {
        const audioOnlyStream = new MediaStream([track]);
        state.audioManager.attachRemoteAudio(peerId, audioOnlyStream);
      } else if (track.kind === 'video') {
        const videoEl = document.getElementById(`video-${peerId}`);
        const card = document.getElementById(`card-${peerId}`);
        const peerObj = state.peers.get(peerId);
        if (videoEl && card) {
          const videoOnlyStream = new MediaStream([track]);
          videoEl.srcObject = videoOnlyStream;
          card.classList.add('has-video');
          videoEl.play().catch(e => console.warn('[Video Play Error]:', e));
          if (!peerObj || peerObj.screen !== false) {
            card.classList.add('screen-card');
            videoEl.classList.add('screen-video');
            attachScreenAnnotationToCard(card);
          }
        }
      }
    };

    state.webrtc.onConnectionStateChange = (peerId, connState) => {
      console.log(`[App WebRTC] ${peerId} bağlantı durumu: ${connState}`);
    };

    state.webrtc.onPeerDisconnected = (peerId) => {
      removePeerCard(peerId);
      state.audioManager.detachRemoteAudio(peerId);
      state.peers.delete(peerId);
      removeMiniPipSpeaker(peerId);
    };

    renderServerRail();

    const hasConfiguredHost = !!localStorage.getItem('talkapp_server_host');
    if (!window.location.host && !hasConfiguredHost) {
      openServerModal();
    }
    connectToServer(state.serverHost);
  }

  // --- SERVICE WORKER, PWA & INVITE LINKS ---
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(console.warn);
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      if (el.btnInstallPwa) el.btnInstallPwa.style.display = 'block';
      if (el.btnHeaderInstallPwa) el.btnHeaderInstallPwa.classList.remove('hidden');
    });

    if (el.btnHeaderInstallPwa) {
      el.btnHeaderInstallPwa.addEventListener('click', async () => {
        if (state.deferredInstallPrompt) {
          state.deferredInstallPrompt.prompt();
          const { outcome } = await state.deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            showToast('🎉 TalkApp masaüstüne başarıyla kuruldu!');
            el.btnHeaderInstallPwa.classList.add('hidden');
          }
          state.deferredInstallPrompt = null;
        } else {
          showToast('💡 Tarayıcınızın adres çubuğundaki "Yükle" simgesine tıklayabilirsiniz.');
        }
      });
    }

    if (el.btnServerInvite) {
      el.btnServerInvite.addEventListener('click', async () => {
        const inviteUrl = `${window.location.origin}/?invite=talkapp-pro`;
        try {
          await navigator.clipboard.writeText(inviteUrl);
          showToast('🔗 Davet bağlantısı panoya kopyalandı! ' + inviteUrl);
        } catch (e) {
          prompt('Sunucu davet bağlantısını kopyalayın:', inviteUrl);
        }
      });
    }

    // Auto-detect invite link parameter on load
    const urlParams = new URLSearchParams(window.location.search);
    const inviteParam = urlParams.get('invite');
    if (inviteParam) {
      setTimeout(() => {
        showToast(`🎉 TalkApp sunucu daveti (${inviteParam}) başarıyla doğrulandı!`);
      }, 1500);
    }
  }

  // --- DESKTOP NOTIFICATIONS & WEB PUSH (SYSTEM WEB NOTIFICATION API) ---
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg) return;

      let vapidKey = state.vapidPublicKey;
      if (!vapidKey) {
        const resp = await fetch('/api/push/vapid-public-key');
        const d = await resp.json();
        vapidKey = d.publicKey;
        state.vapidPublicKey = vapidKey;
      }
      if (!vapidKey) return;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
      }

      if (sub) {
        const subJson = sub.toJSON();
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(JSON.stringify({
            type: 'register-push-subscription',
            subscription: subJson
          }));
        } else if (state.selfId) {
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: state.selfId, subscription: subJson })
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[WebPush Register Warning]:', err);
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window) {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          showToast('🔔 Sistem ve kilit ekranı bildirimleri aktif edildi!');
          sendDesktopNotification('TalkApp Bildirimleri Açık', 'Artık etiketlendiğinizde veya mesaj aldığınızda anlık bildirim alacaksınız.');
          registerPushSubscription();
        } else {
          showToast('⚠️ Bildirim izni verilmedi veya reddedildi.');
        }
      });
    } else {
      showToast('⚠️ Tarayıcınız sistem bildirimlerini desteklemiyor.');
    }
  }

  function sendDesktopNotification(title, body, tag = 'talkapp-notif') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible' && !document.hidden) return; // Only notify when user is away/minimized
    try {
      const notif = new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%235865f2"/><text y="70" x="15" font-size="60">🎮</text></svg>',
        tag: tag,
        silent: false
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('[Desktop Notif Warning]:', e);
    }
  }

  // --- WEBSOCKET CONNECTION & AUTO-RECONNECT ---
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let isIntentionalDisconnect = false;

  function scheduleAutoReconnect() {
    if (reconnectTimer) return;
    reconnectAttempts++;
    const delay = Math.min(2000 * Math.pow(1.4, reconnectAttempts - 1), 12000);
    el.headerStatusDot.style.backgroundColor = 'var(--yellow)';
    if (el.lblPing) el.lblPing.textContent = `Yeniden deneniyor (${reconnectAttempts})...`;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      console.log(`[Auto-Reconnect] Attempt #${reconnectAttempts} to ${state.serverHost}...`);
      connectToServer(state.serverHost);
    }, delay);
  }

  function connectToServer(host) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (state.ws) {
      try {
        isIntentionalDisconnect = true;
        state.ws.close();
      } catch (e) {}
    }
    isIntentionalDisconnect = false;

    const cleanHost = host.trim().replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '');
    const isHttps = window.location.protocol === 'https:';
    const wsUrl = `${isHttps ? 'wss:' : 'ws:'}//${cleanHost}`;

    el.headerStatusDot.style.backgroundColor = 'var(--yellow)';
    el.lblCurrentHostDisplay.textContent = cleanHost;

    try {
      state.ws = new WebSocket(wsUrl);
      state.webrtc.setSignalingSocket(state.ws);

      state.ws.onopen = () => {
        el.headerStatusDot.style.backgroundColor = 'var(--green)';
        if (reconnectAttempts > 0) {
          showToast(`✅ ${cleanHost} sunucusuna yeniden bağlanıldı!`);
          reconnectAttempts = 0;
        } else {
          showToast(`🌐 Sunucuya bağlanıldı: ${cleanHost}`);
        }
        saveRecentServer(cleanHost);
        startPingTimer();

        // 1. Try persistent token authentication if available
        if (state.authToken) {
          sendWs({
            type: 'auth-token',
            token: state.authToken
          });
        } else {
          // Standard guest profile
          sendWs({
            type: 'set-profile',
            name: state.username,
            status: state.myStatus,
            gameActivity: state.gameActivity,
            avatarUrl: state.myAvatar,
            badge: state.myBadge
          });
        }

        // Request initial text channel history
        requestTextHistory(state.activeChannelId);

        // Auto re-join voice room if user was connected before network drop and no auth token is pending
        if (state.activeVoiceRoomId && !state.authToken) {
          setTimeout(() => {
            if (state.activeVoiceRoomId && !state.authToken) {
              console.log(`[Auto-Rejoin Guest] Ses odasına yeniden bağlanılıyor: ${state.activeVoiceRoomId}`);
              joinVoiceChannel(state.activeVoiceRoomId, state.activeVoiceRoomName, null, true);
            }
          }, 350);
        }
      };

      state.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleSignalingMessage(data);
        } catch (err) {
          console.error('[WS Parse]:', err);
        }
      };

      state.ws.onclose = () => {
        el.headerStatusDot.style.backgroundColor = 'var(--red)';
        stopPingTimer();
        el.lblPing.textContent = '-- ms';

        // Tear down any broken peer connections so reconnect starts with clean slate
        if (state.activeVoiceRoomId) {
          state.webrtc.closeAllPeers();
          clearAllRemoteCards();
          state.peers.clear();
        }

        if (!isIntentionalDisconnect) {
          scheduleAutoReconnect();
        }
      };

      state.ws.onerror = () => {
        el.headerStatusDot.style.backgroundColor = 'var(--red)';
      };
    } catch (e) {
      showToast('❌ Sunucu adresi geçersiz!');
      if (!isIntentionalDisconnect) {
        scheduleAutoReconnect();
      }
    }
  }

  function sendWs(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    }
  }

  function applyServerSettings(s) {
    if (!s) return;
    state.serverSettings = s;
    if (el.lblServerName) el.lblServerName.textContent = s.serverName || 'TalkApp Sunucusu';
    const iconEl = document.getElementById('lblServerIcon');
    if (iconEl) iconEl.textContent = s.serverIcon || '🎮';
    document.title = `${s.serverName || 'TalkApp'} - Canlı Sohbet & Ses`;

    const inputName = document.getElementById('inputSettingsServerName');
    const inputIcon = document.getElementById('inputSettingsServerIcon');
    const inputDesc = document.getElementById('inputSettingsServerDesc');
    if (inputName) inputName.value = s.serverName || '';
    if (inputIcon) inputIcon.value = s.serverIcon || '';
    if (inputDesc) inputDesc.value = s.serverDesc || '';
  }

  function handleSignalingMessage(data) {
    switch (data.type) {
      case 'connected': {
        state.selfId = data.clientId;
        state.myRole = data.role || 'member';
        state.role = state.myRole;
        if (data.vapidPublicKey) {
          state.vapidPublicKey = data.vapidPublicKey;
          if ('Notification' in window && Notification.permission === 'granted') {
            registerPushSubscription();
          }
        }
        el.myUserId.textContent = '#' + data.clientId.slice(-4);
        updateMyProfileUI();

        if (data.servers) {
          state.myServers = data.servers;
          renderServerRail();
        }
        if (data.currentServerId) {
          state.currentServerId = data.currentServerId;
        }

        if (data.permissions) {
          state.currentServerPermissions = data.permissions;
          updatePermissionsUI();
        }

        if (data.rolePermissions) {
          state.rolePermissions = data.rolePermissions;
        }
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          updateWebhookSettingsUI();
        }
        if (data.serverSettings) {
          applyServerSettings(data.serverSettings);
        }

        if (state.currentServerId && state.currentServerId !== 'home') {
          sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        }

        // Register companion pairing token on connection
        if (state.companionToken) {
          sendWs({ type: 'register-companion', token: state.companionToken });
        }
        break;
      }

      case 'companion-status': {
        state.isCompanionConnected = !!data.connected;
        updateCompanionUI();
        break;
      }

      case 'companion-registered': {
        console.log('[Companion] Registered with token:', data.token);
        break;
      }

      case 'companion-hotkey': {
        handleCompanionHotkey(data.action);
        break;
      }

      case 'server-settings-updated': {
        applyServerSettings(data.settings);
        showToast(`🏛️ Sunucu adı "${data.settings.serverName}" olarak güncellendi!`, 3000);
        break;
      }

      // --- MULTI-SERVER (COMMUNITIES / GUILDS) & HOME RESPONSES ---
      case 'user-servers-list': {
        state.myServers = data.servers || [];
        if (data.currentServerId) state.currentServerId = data.currentServerId;
        renderServerRail();
        break;
      }

      case 'server-switched': {
        state.currentServerId = data.serverId;
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        if (data.permissions) {
          state.currentServerPermissions = data.permissions;
          updatePermissionsUI();
        }
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          if (state.channels.text && state.channels.text.length > 0) {
            selectTextChannel(state.channels.text[0].id, state.channels.text[0].name);
          }
        }
        if (data.members) {
          state.serverMembers = data.members;
          renderMemberList();
        }
        sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        renderServerRail();
        if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
        if (el.textChatView) el.textChatView.classList.remove('hidden');
        break;
      }

      case 'home-view-active': {
        state.currentServerId = 'home';
        if (data.friends) {
          state.friends = data.friends;
        }
        renderServerRail();
        renderChannelsList();
        showFriendsDashboardView();
        break;
      }

      case 'server-created': {
        if (data.servers) state.myServers = data.servers;
        state.currentServerId = data.currentServerId;
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        if (data.permissions) {
          state.currentServerPermissions = data.permissions;
          updatePermissionsUI();
        }
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          if (state.channels.text && state.channels.text.length > 0) {
            selectTextChannel(state.channels.text[0].id, state.channels.text[0].name);
          }
        }
        if (data.members) {
          state.serverMembers = data.members;
          renderMemberList();
        }
        sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        renderServerRail();
        if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
        if (el.textChatView) el.textChatView.classList.remove('hidden');
        if (el.modalServerConnect) el.modalServerConnect.classList.remove('show');
        break;
      }

      case 'server-joined': {
        if (data.servers) state.myServers = data.servers;
        state.currentServerId = data.currentServerId;
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        if (data.permissions) {
          state.currentServerPermissions = data.permissions;
          updatePermissionsUI();
        }
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          if (state.channels.text && state.channels.text.length > 0) {
            selectTextChannel(state.channels.text[0].id, state.channels.text[0].name);
          }
        }
        if (data.members) {
          state.serverMembers = data.members;
          renderMemberList();
        }
        sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        renderServerRail();
        if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
        if (el.textChatView) el.textChatView.classList.remove('hidden');
        if (el.modalServerConnect) el.modalServerConnect.classList.remove('show');
        break;
      }

      case 'server-left': {
        if (data.servers) state.myServers = data.servers;
        state.currentServerId = data.currentServerId || 'srv_default';
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          if (state.channels.text && state.channels.text.length > 0) {
            selectTextChannel(state.channels.text[0].id, state.channels.text[0].name);
          }
        }
        renderServerRail();
        break;
      }

      case 'server-deleted-notify': {
        if (data.servers) state.myServers = data.servers;
        state.currentServerId = data.currentServerId || 'srv_default';
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          if (state.channels.text && state.channels.text.length > 0) {
            selectTextChannel(state.channels.text[0].id, state.channels.text[0].name);
          }
        }
        renderServerRail();
        showToast('⚠️ Bulunduğunuz sunucu kurucusu tarafından silindi.', 4000);
        break;
      }

      case 'server-updated': {
        if (data.serverSettings) applyServerSettings(data.serverSettings);
        const s = (state.myServers || []).find(srv => srv.id === data.server?.id);
        if (s && data.server) {
          s.name = data.server.name;
          s.icon = data.server.icon;
          s.description = data.server.description;
        }
        renderServerRail();
        break;
      }

      case 'server-roles-list': {
        if (data.serverId === state.currentServerId) {
          state.serverRoles = data.roles || [];
          renderGuildRolesList();
          renderMemberList();
        }
        break;
      }

      case 'server-roles-updated': {
        if (data.serverId === state.currentServerId) {
          state.serverRoles = data.roles || [];
          renderGuildRolesList();
          renderMemberList();
          showToast('🛡️ Sunucu rolleri güncellendi!', 3000);
        }
        break;
      }

      case 'user-permissions': {
        if (data.serverId === state.currentServerId) {
          state.currentServerPermissions = data.permissions || {};
          updatePermissionsUI();
          renderChannelsList();
        }
        break;
      }

      // --- AUTH RESPONSES (SQLite Auth) ---
      case 'auth-success': {
        const u = data.user;
        state.isLoggedIn = true;
        const oldId = data.oldId || state.selfId;
        const oldName = data.oldName || state.username;
        state.selfId = u.id;
        state.username = u.username;
        state.myRole = u.role;
        state.role = u.role;
        state.myStatus = u.status || 'online';
        state.gameActivity = u.gameActivity || '';
        state.authToken = u.token || state.authToken;
        if (u.avatarUrl) {
          state.myAvatar = u.avatarUrl;
          localStorage.setItem('talkapp_avatar', u.avatarUrl);
        }
        if (u.badge) {
          state.myBadge = u.badge;
          localStorage.setItem('talkapp_badge', u.badge);
        }

        if (state.authToken && state.authToken !== 'undefined' && state.authToken !== 'null') {
          localStorage.setItem('talkapp_token', state.authToken);
        }
        localStorage.setItem('talkapp_username', u.username);
        localStorage.setItem('talkapp_status', state.myStatus);
        localStorage.setItem('talkapp_game', state.gameActivity);

        // Clean up any ghost card or peer matching the old guest identity
        if (oldId && oldId !== u.id) {
          const oldCard = document.getElementById(`card-${oldId}`);
          if (oldCard) oldCard.remove();
          state.peers.delete(oldId);
          state.webrtc.closePeer(oldId);
          state.audioManager.detachRemoteAudio(oldId);
          state.serverMembers = state.serverMembers.filter(m => m.id !== oldId && m.name !== oldName);
        }

        // Update local voice card immediately
        if (el.nameSelfCard) el.nameSelfCard.textContent = `${u.username} (Sen)`;
        if (el.avatarSelfBig) {
          if (u.avatarUrl && (u.avatarUrl.startsWith('http') || u.avatarUrl.startsWith('/') || u.avatarUrl.startsWith('data:'))) {
            el.avatarSelfBig.innerHTML = `<img src="${escapeHtml(u.avatarUrl)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
          } else {
            el.avatarSelfBig.textContent = (u.username || 'O').charAt(0).toUpperCase();
          }
        }

        // Update serverMembers self record
        const selfMember = state.serverMembers.find(m => m.id === u.id || m.name === u.username);
        if (selfMember) {
          selfMember.id = u.id;
          selfMember.name = u.username;
          selfMember.role = u.role;
          selfMember.avatarUrl = u.avatarUrl || '';
          selfMember.badge = u.badge || '';
        } else {
          state.serverMembers.unshift({
            id: u.id,
            name: u.username,
            role: u.role,
            status: state.myStatus,
            gameActivity: state.gameActivity,
            avatarUrl: u.avatarUrl || '',
            badge: u.badge || '',
            voiceRoomId: state.activeVoiceRoomId
          });
        }

        if (data.servers) {
          state.myServers = data.servers;
        }
        if (data.currentServerId) {
          state.currentServerId = data.currentServerId;
        }
        if (data.channels) {
          state.channels = data.channels;
        }
        if (data.serverSettings) {
          applyServerSettings(data.serverSettings);
        }
        renderServerRail();

        if (data.permissions) {
          state.currentServerPermissions = data.permissions;
          updatePermissionsUI();
        }
        if (state.currentServerId && state.currentServerId !== 'home') {
          sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        }

        if (data.vapidPublicKey) {
          state.vapidPublicKey = data.vapidPublicKey;
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          registerPushSubscription();
        }

        updateMyProfileUI();
        renderMemberList();
        renderChannelsList();
        if (el.lblAuthStatusText) {
          el.lblAuthStatusText.textContent = `👤 ${u.username} (${u.role.toUpperCase()})`;
        }
        if (el.btnOpenAuthModal) {
          el.btnOpenAuthModal.title = `Hesap: ${u.username} - Çıkış için tıkla`;
        }
        if (el.modalAuth) el.modalAuth.classList.remove('show');
        showToast(`✅ Giriş başarılı: Hoş geldin, ${u.username}!`);

        // If in voice room and reconnection is pending, join properly
        if (state.activeVoiceRoomId) {
          setTimeout(() => {
            if (state.activeVoiceRoomId) {
              console.log(`[Auto-Rejoin Auth] Ses odasına yeniden bağlanılıyor: ${state.activeVoiceRoomId}`);
              joinVoiceChannel(state.activeVoiceRoomId, state.activeVoiceRoomName, null, true);
            }
          }, 350);
        }
        break;
      }

      case 'auth-token-invalid': {
        localStorage.removeItem('talkapp_token');
        state.authToken = null;
        state.isLoggedIn = false;
        break;
      }

      case 'profile-updated': {
        if (data.avatarUrl !== undefined) {
          state.myAvatar = data.avatarUrl;
          localStorage.setItem('talkapp_avatar', data.avatarUrl);
        }
        if (data.badge !== undefined) {
          state.myBadge = data.badge;
          localStorage.setItem('talkapp_badge', data.badge);
        }
        updateMyProfileUI();
        break;
      }

      case 'auth-error': {
        showToast(`❌ ${data.message}`, 4500);
        if (state.authToken && !state.isLoggedIn) {
          localStorage.removeItem('talkapp_token');
          state.authToken = null;
        }
        break;
      }

      case 'role-updated': {
        state.myRole = data.role;
        state.role = data.role;
        updateMyProfileUI();
        renderChannelsList();
        showToast(`👑 Rolünüz güncellendi: [${data.role.toUpperCase()}]`);
        break;
      }

      case 'toast': {
        showToast(data.message);
        break;
      }

      case 'server-members': {
        const unique = [];
        const seen = new Set();
        (data.members || []).forEach(m => {
          if (!m || !m.name) return;
          const k = (m.id || '') + '::' + m.name.toLowerCase();
          const nk = 'name::' + m.name.toLowerCase();
          if (!seen.has(k) && !seen.has(nk)) {
            seen.add(k);
            seen.add(nk);
            unique.push(m);
          }
        });
        state.serverMembers = unique;
        renderMemberList();
        renderChannelsList();
        break;
      }

      case 'channel-created': {
        const ch = data.channel;
        if (ch.type === 'voice') state.channels.voice.push(ch);
        else state.channels.text.push(ch);
        renderChannelsList();
        updateWebhookSettingsUI();
        showToast(`📢 Yeni kanal açıldı: ${ch.name}`);
        break;
      }

      case 'channels-reordered': {
        if (!data.serverId || data.serverId === state.currentServerId) {
          state.channels = data.channels || { text: [], voice: [] };
          renderChannelsList();
        }
        break;
      }

      // --- FULL-TEXT SEARCH RESULTS ---
      case 'search-results': {
        renderSearchResults(data.query, data.results || []);
        break;
      }

      // --- MUSIC / RADIO BOT STATE ---
      case 'music-bot-state': {
        handleMusicBotSync(data.state);
        break;
      }

      // --- TEXT CHAT & DM HANDLING ---
      case 'text-history': {
        state.currentMessages = data.messages || [];
        state.hasMoreMessages = !!data.hasMore;
        state.isLoadingMoreMessages = false;
        renderTextMessages(state.currentMessages);
        break;
      }

      case 'text-history-more': {
        const older = data.messages || [];
        state.hasMoreMessages = !!data.hasMore;
        state.isLoadingMoreMessages = false;
        if (older.length > 0) {
          const prevScrollHeight = el.textChatMessages.scrollHeight;
          const existingIds = new Set(state.currentMessages.map(m => m.id));
          const uniqueOlder = older.filter(m => !existingIds.has(m.id));
          state.currentMessages = [...uniqueOlder, ...state.currentMessages];
          renderTextMessages(state.currentMessages, true);
          const newScrollHeight = el.textChatMessages.scrollHeight;
          el.textChatMessages.scrollTop = Math.max(0, newScrollHeight - prevScrollHeight);
        } else {
          renderTextMessages(state.currentMessages, true);
        }
        break;
      }

      case 'dm-history': {
        state.currentMessages = data.messages || [];
        state.hasMoreMessages = !!data.hasMore;
        state.isLoadingMoreMessages = false;
        renderTextMessages(state.currentMessages);
        break;
      }

      case 'dm-history-more': {
        const older = data.messages || [];
        state.hasMoreMessages = !!data.hasMore;
        state.isLoadingMoreMessages = false;
        if (older.length > 0) {
          const prevScrollHeight = el.textChatMessages.scrollHeight;
          const existingIds = new Set(state.currentMessages.map(m => m.id));
          const uniqueOlder = older.filter(m => !existingIds.has(m.id));
          state.currentMessages = [...uniqueOlder, ...state.currentMessages];
          renderTextMessages(state.currentMessages, true);
          const newScrollHeight = el.textChatMessages.scrollHeight;
          el.textChatMessages.scrollTop = Math.max(0, newScrollHeight - prevScrollHeight);
        } else {
          renderTextMessages(state.currentMessages, true);
        }
        break;
      }

      case 'new-text-channel-msg': {
        const msg = data.message;
        const isMention = msg.text && (msg.text.includes(`@${state.username}`) || msg.text.includes('@everyone') || msg.text.includes('@hepsi'));
        const notifPref = state.channelNotifs[msg.channelId] || 'all'; // 'all' | 'mentions' | 'mute'

        if (state.activeViewType === 'text' && state.activeChannelId === msg.channelId) {
          state.currentMessages.push(msg);
          appendMessageBubble(msg);
        } else {
          markChannelUnread(msg.channelId);
          if (msg.serverId && msg.serverId !== state.currentServerId) {
            state.unreadServers.add(msg.serverId);
            renderServerRail();
          }
        }

        // Apply notification preference
        if (notifPref === 'mute') {
          // completely muted: no chime, no toast, no desktop notification
        } else if (notifPref === 'mentions') {
          if (isMention && msg.senderId !== state.selfId) {
            state.audioManager.playChime('mention');
            showToast(`🔔 @${msg.senderName} senden bahsetti: "${(msg.text || '').slice(0, 30)}"`);
            sendDesktopNotification(`🔔 @${msg.senderName} senden bahsetti`, (msg.text || '').slice(0, 100), `mention-${msg.id}`);
          }
        } else {
          if (isMention && msg.senderId !== state.selfId) {
            state.audioManager.playChime('mention');
            showToast(`🔔 @${msg.senderName} senden bahsetti: "${(msg.text || '').slice(0, 30)}"`);
            sendDesktopNotification(`🔔 @${msg.senderName} senden bahsetti`, (msg.text || '').slice(0, 100), `mention-${msg.id}`);
          } else if (msg.senderId !== state.selfId) {
            state.audioManager.playChime('message');
          }
        }
        break;
      }

      case 'new-dm-msg': {
        const msg = data.message;
        const otherUserId = data.withUser;

        if (!state.dms.has(otherUserId)) {
          const userObj = state.serverMembers.find(m => m.id === otherUserId) || { name: msg.senderName, role: 'member' };
          state.dms.set(otherUserId, { id: otherUserId, name: userObj.name, unread: 0 });
          renderChannelsList();
        }

        if (state.activeViewType === 'dm' && state.activeDmUserId === otherUserId) {
          state.currentMessages.push(msg);
          appendMessageBubble(msg);
          state.audioManager.playChime('dm');
        } else {
          const dmEntry = state.dms.get(otherUserId);
          if (dmEntry) dmEntry.unread = (dmEntry.unread || 0) + 1;
          renderChannelsList();
          state.audioManager.playChime('dm');
          showToast(`💬 ${msg.senderName}: "${(msg.text || 'Dosya veya Sesli mesaj').slice(0, 30)}"`);
          sendDesktopNotification(`💬 @${msg.senderName} sana mesaj gönderdi`, (msg.text || 'Dosya veya Sesli Mesaj').slice(0, 100), `dm-${otherUserId}`);
        }
        break;
      }

      // --- REACTIONS & PINS ---
      case 'reaction-updated': {
        const msg = state.currentMessages.find(m => m.id === data.messageId);
        if (msg) {
          msg.reactions = data.reactions;
          updateMessageReactionsUI(data.messageId, data.reactions);
        }
        break;
      }

      case 'message-pin-updated': {
        const msg = state.currentMessages.find(m => m.id === data.messageId);
        if (msg) {
          msg.isPinned = data.isPinned;
          const msgEl = document.getElementById(`msg-${data.messageId}`);
          if (msgEl) msgEl.classList.toggle('is-pinned', data.isPinned);
        }
        showToast(data.isPinned ? '📌 Mesaj kanala sabitlendi.' : 'Mesaj sabitlemesi kaldırıldı.');
        break;
      }

      // --- EDIT & DELETE MESSAGES ---
      case 'message-edited': {
        const msg = state.currentMessages.find(m => m.id === data.messageId);
        if (msg) {
          msg.text = data.text;
          msg.isEdited = true;
        }
        const textEl = document.getElementById(`msg-text-${data.messageId}`);
        if (textEl) {
          textEl.innerHTML = formatMessageText(data.text);
          textEl.style.display = '';
        }
        const editBox = document.getElementById(`edit-box-${data.messageId}`);
        if (editBox) editBox.remove();
        const editedTag = document.getElementById(`edited-${data.messageId}`);
        if (editedTag) {
          editedTag.classList.remove('hidden');
        }
        break;
      }

      case 'message-deleted': {
        state.currentMessages = state.currentMessages.filter(m => m.id !== data.messageId);
        const rowEl = document.getElementById(`msg-${data.messageId}`);
        if (rowEl) {
          rowEl.style.transition = 'all 0.25s ease';
          rowEl.style.opacity = '0';
          rowEl.style.transform = 'translateX(-20px)';
          setTimeout(() => rowEl.remove(), 250);
        }
        break;
      }

      // --- POLL UPDATES ---
      case 'poll-updated': {
        const msg = state.currentMessages.find(m => m.id === data.messageId);
        if (msg) {
          msg.poll = data.poll;
          updatePollUI(data.messageId, data.poll);
        }
        break;
      }

      // --- AUDIT LOGS ---
      case 'audit-logs-loaded': {
        renderAuditLogs(data.logs || []);
        break;
      }

      case 'channel-deleted': {
        state.channels.text = (state.channels.text || []).filter(c => c.id !== data.channelId);
        state.channels.voice = (state.channels.voice || []).filter(c => c.id !== data.channelId);
        if (state.activeVoiceRoomId === data.channelId) {
          leaveCurrentVoice();
          showToast('Bulunduğunuz ses kanalı silindi.', 3000);
        }
        renderChannelsList();
        if (state.activeChannelId === data.channelId) {
          const first = state.channels.text[0];
          if (first) selectTextChannel(first.id, first.name);
        }
        break;
      }

      // --- SOUNDBOARD BROADCAST ---
      case 'soundboard-played': {
        if (data.senderId && data.senderId === state.selfId) break;
        if (data.isCustom && data.soundUrl) {
          state.audioManager.playCustomSound(data.soundUrl);
          showToast(`🔊 ${data.senderName}: [${data.soundId || 'Özel Ses'}] çaldı!`, 2000);
        } else {
          state.audioManager.playSoundboard(data.soundId);
          showToast(`🔊 ${data.senderName}: [${(data.soundId || '').toUpperCase()}] çaldı!`, 2000);
        }
        break;
      }

      // --- CUSTOM SOUNDBOARD SOUNDS ---
      case 'custom-sounds-list': {
        state.customSounds = data.sounds || [];
        renderCustomSoundsUI();
        break;
      }

      case 'custom-sound-added': {
        state.customSounds = state.customSounds.filter(s => s.id !== data.sound.id);
        state.customSounds.unshift(data.sound);
        renderCustomSoundsUI();
        break;
      }

      case 'custom-sound-deleted': {
        state.customSounds = state.customSounds.filter(s => s.id !== data.soundId);
        renderCustomSoundsUI();
        break;
      }

      // --- FRIENDS SYSTEM ---
      case 'friends-list': {
        state.friends = data.friends || [];
        renderFriendsUI();
        break;
      }

      // --- DIRECT 1-ON-1 CALL ---
      case 'incoming-direct-call': {
        state.incomingCallData = data;
        if (el.incomingCallerName) el.incomingCallerName.textContent = data.callerName;
        if (el.incomingCallType) el.incomingCallType.textContent = (data.callType === 'video' ? '📹 Birebir Görüntülü Arama...' : '📞 Birebir Sesli Arama...');
        if (el.incomingCallAvatar) {
          if (data.callerAvatar) {
            const safeAvatar = escapeHtml(data.callerAvatar);
            if (data.callerAvatar.startsWith('http') || data.callerAvatar.startsWith('/') || data.callerAvatar.startsWith('data:image/')) {
              el.incomingCallAvatar.innerHTML = `<img src="${safeAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
              el.incomingCallAvatar.textContent = data.callerAvatar;
            }
          } else {
            el.incomingCallAvatar.textContent = (data.callerName || 'O').charAt(0).toUpperCase();
          }
        }
        if (el.modalIncomingCall) el.modalIncomingCall.classList.add('show');
        state.audioManager.playRingtone();
        sendDesktopNotification(`📞 Gelen Arama: @${data.callerName}`, `${data.callType === 'video' ? 'Görüntülü' : 'Sesli'} arama yapılıyor... Yanıtlamak için tıklayın.`, 'direct-call');
        break;
      }

      case 'direct-call-dialing': {
        if (el.outgoingTargetName) el.outgoingTargetName.textContent = data.targetName;
        if (el.outgoingCallAvatar) {
          if (data.targetAvatar) {
            const safeAvatar = escapeHtml(data.targetAvatar);
            if (data.targetAvatar.startsWith('http') || data.targetAvatar.startsWith('/') || data.targetAvatar.startsWith('data:image/')) {
              el.outgoingCallAvatar.innerHTML = `<img src="${safeAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
              el.outgoingCallAvatar.textContent = data.targetAvatar;
            }
          } else {
            el.outgoingCallAvatar.textContent = (data.targetName || 'O').charAt(0).toUpperCase();
          }
        }
        if (el.modalOutgoingCall) el.modalOutgoingCall.classList.add('show');
        state.audioManager.playDialTone();
        break;
      }

      case 'direct-call-accepted': {
        state.audioManager.stopDialTone();
        if (el.modalOutgoingCall) el.modalOutgoingCall.classList.remove('show');
        showToast(`📞 @${data.targetName} aramayı kabul etti!`);
        startDirectCallWebRtc(data.targetUserId, data.targetName, true, data.callType);
        break;
      }

      case 'direct-call-connected': {
        state.audioManager.stopRingtone();
        if (el.modalIncomingCall) el.modalIncomingCall.classList.remove('show');
        showToast(`📞 @${data.peerName} ile görüşme başladı!`);
        startDirectCallWebRtc(data.peerId, data.peerName, false, data.callType);
        break;
      }

      case 'direct-call-rejected': {
        state.audioManager.stopDialTone();
        if (el.modalOutgoingCall) el.modalOutgoingCall.classList.remove('show');
        showToast(`❌ @${data.targetName} aramayı reddetti.`);
        break;
      }

      case 'direct-call-hungup': {
        state.audioManager.stopRingtone();
        state.audioManager.stopDialTone();
        if (el.modalIncomingCall) el.modalIncomingCall.classList.remove('show');
        if (el.modalOutgoingCall) el.modalOutgoingCall.classList.remove('show');
        endDirectCall(false);
        showToast('📞 Arama sonlandırıldı.');
        break;
      }

      case 'direct-call-signal-offer': {
        handleDirectCallOffer(data.senderId, data.offer);
        break;
      }

      case 'direct-call-signal-answer': {
        handleDirectCallAnswer(data.senderId, data.answer);
        break;
      }

      case 'direct-call-signal-candidate': {
        handleDirectCallCandidate(data.senderId, data.candidate);
        break;
      }

      // --- TYPING INDICATOR ---
      case 'user-typing': {
        handleUserTyping(data);
        break;
      }

      // --- MODERATION ACTIONS ---
      case 'kicked-from-voice': {
        leaveCurrentVoice();
        showToast(`🚪 ${data.message}`, 5000);
        break;
      }

      case 'force-move-voice': {
        showToast(`🔀 ${data.movedBy || 'Yönetici'} sizi "${data.channelName}" odasına taşıdı.`);
        joinVoiceChannel(data.channelId, data.channelName);
        break;
      }

      case 'server-mute-updated': {
        state.serverMuted = data.serverMuted;
        if (state.serverMuted) {
          state.isMicMuted = true;
          state.audioManager.setMicrophoneEnabled(false);
          el.btnDockMic.classList.add('active-red');
          el.btnCallMic.classList.add('muted-state');
          showToast('🔇 Yönetici tarafından susturuldunuz!');
        } else {
          showToast('🔔 Susturmanız kaldırıldı.');
        }
        break;
      }

      // --- VOICE CHANNEL HANDLING ---
      case 'voice-room-joined': {
        state.activeVoiceRoomId = data.roomId;
        const vChan = state.channels.voice.find(v => v.id === data.roomId);
        state.activeVoiceRoomName = vChan ? vChan.name : data.roomId;

        // Mobile Screen WakeLock & Background Audio Keep-Alive
        acquireScreenWakeLock();
        startMobileAudioKeepAlive();

        // Auto-switch view to Voice Arena!
        state.activeViewType = 'voice';
        el.textChatView.classList.add('hidden');
        el.voiceArena.classList.remove('hidden');
        el.headerPrefix.textContent = '🔊';
        el.lblActiveChannelName.textContent = state.activeVoiceRoomName;

        el.activeVoiceBar.classList.remove('hidden');
        el.lblVoiceCurrentRoom.textContent = state.activeVoiceRoomName;
        el.btnToggleVoiceView.classList.remove('hidden');

        state.webrtc.closeAllPeers();
        clearAllRemoteCards();
        state.peers.clear();

        const connectToRoomPeers = () => {
          if (Array.isArray(data.peers)) {
            data.peers.forEach(peer => {
              state.peers.set(peer.id, { ...peer, volume: 100, isSpeaking: false });
              createPeerCard(peer);
              state.webrtc.createPeerConnection(peer.id, true);
            });
          }
        };

        if (!state.webrtc.localStream && state.audioManager) {
          state.audioManager.getMicrophoneStream().then(stream => {
            state.webrtc.setLocalStream(stream);
            connectToRoomPeers();
          }).catch(err => {
            console.warn('[WebRTC] Local mic stream error:', err);
            connectToRoomPeers();
          });
        } else {
          connectToRoomPeers();
        }

        state.audioManager.playChime('join');
        showToast(`🔊 ${state.activeVoiceRoomName} ses kanalına bağlandınız.`);
        const me = state.serverMembers.find(m => m.id === state.selfId);
        if (me) me.voiceRoomId = data.roomId;
        updateMyProfileUI();
        renderChannelsList();
        break;
      }

      case 'peer-joined': {
        const peer = data.peer;
        if (!peer || peer.id === state.selfId) return;

        // Clean up any stale peer connection, card, or audio element before connecting
        state.webrtc.closePeer(peer.id);
        removePeerCard(peer.id);
        state.audioManager.detachRemoteAudio(peer.id);

        state.peers.set(peer.id, { ...peer, volume: 100, isSpeaking: false });
        createPeerCard(peer);
        state.webrtc.createPeerConnection(peer.id, false);
        state.audioManager.playChime('join');
        showToast(`👋 ${peer.name} sese katıldı.`);
        const peerMember = state.serverMembers.find(m => (m.id && m.id === peer.id) || (m.name && peer.name && m.name.toLowerCase() === peer.name.toLowerCase()));
        if (peerMember) {
          peerMember.voiceRoomId = state.activeVoiceRoomId;
          peerMember.id = peer.id;
        } else {
          state.serverMembers.push({ ...peer, voiceRoomId: state.activeVoiceRoomId, status: 'online' });
        }
        renderChannelsList();
        renderMemberList();
        break;
      }

      case 'peer-left': {
        const peer = state.peers.get(data.peerId);
        if (peer) showToast(`🚪 ${peer.name} sesden ayrıldı.`);
        state.webrtc.closePeer(data.peerId);
        removePeerCard(data.peerId);
        state.audioManager.detachRemoteAudio(data.peerId);
        state.peers.delete(data.peerId);
        removeMiniPipSpeaker(data.peerId);
        state.audioManager.playChime('leave');
        const peerMember = state.serverMembers.find(m => m.id === data.peerId);
        if (peerMember) peerMember.voiceRoomId = null;
        renderChannelsList();
        break;
      }

      case 'signal-offer': {
        state.webrtc.handleOffer(data.senderId, data.offer);
        break;
      }
      case 'signal-answer': {
        state.webrtc.handleAnswer(data.senderId, data.answer);
        break;
      }
      case 'signal-candidate': {
        state.webrtc.handleCandidate(data.senderId, data.candidate);
        break;
      }

      case 'peer-track-state': {
        const peer = state.peers.get(data.peerId);
        if (peer) {
          Object.assign(peer, data.state);
          updatePeerCardStatus(data.peerId, data.state);
        }
        break;
      }

      case 'peer-speaking': {
        const card = document.getElementById(`card-${data.peerId}`);
        if (card) card.classList.toggle('speaking', !!data.isSpeaking);
        updateVoiceUserSpeakingState(data.peerId, !!data.isSpeaking);
        const pObj = state.peers.get(data.peerId);
        if (pObj) {
          pObj.isSpeaking = !!data.isSpeaking;
          updateMiniPipSpeaker(data.peerId, pObj.name, data.isSpeaking);
        }
        handleAudioDucking(!!data.isSpeaking);
        break;
      }

      case 'channel-access-denied': {
        showToast(`⛔ ${data.reason}`, 4000);
        break;
      }

      case 'channel-password-required': {
        state.pendingPasswordChannel = { id: data.channelId, name: data.channelName };
        el.lblChannelPasswordPrompt.textContent = `"${data.channelName}" kilitli bir odadır. Şifre girin:`;
        el.inputEnteredPassword.value = '';
        el.modalChannelPassword.classList.add('show');
        el.inputEnteredPassword.focus();
        break;
      }

      // --- WATCH PARTY ---
      case 'watch-party-sync': {
        handleWatchPartySync(data);
        break;
      }

      // --- SCREEN ANNOTATION & LASER POINTER ---
      case 'screen-annotation-draw': {
        handleRemoteAnnotationDraw(data);
        break;
      }
      case 'screen-annotation-laser': {
        handleRemoteLaserPointer(data);
        break;
      }
      case 'screen-annotation-clear': {
        handleRemoteAnnotationClear();
        break;
      }

      // --- ROLE PERMISSIONS MATRIX ---
      case 'role-permissions-list':
      case 'role-permissions-loaded': {
        state.rolePermissions = data.permissions;
        renderRolePermissions(data.permissions);
        break;
      }
      case 'role-permissions-updated': {
        state.rolePermissions = data.permissions;
        renderRolePermissions(data.permissions);
        showToast('🛡️ Rol izin matrisi başarıyla güncellendi.');
        break;
      }

      // --- SERVER BACKUP & RESTORE ---
      case 'server-backup-data': {
        downloadServerBackupFile(data.backup);
        break;
      }
      case 'server-restored': {
        if (data.channels) {
          state.channels = data.channels;
          renderChannelsList();
          updateWebhookSettingsUI();
        }
        if (data.permissions) {
          state.rolePermissions = data.permissions;
          renderRolePermissions(data.permissions);
        }
        if (data.settings) {
          applyServerSettings(data.settings);
        }
        showToast(`✅ ${data.message || 'Sunucu yedeği başarıyla geri yüklendi!'}`, 4000);
        break;
      }

      // --- THREADS (MESAJ KONULARI) ---
      case 'thread-messages-list': {
        renderThreadMessagesList(data.parentId, data.messages);
        break;
      }
      case 'new-thread-msg': {
        handleNewThreadMessage(data);
        break;
      }

      case 'pong': {
        const rtt = Date.now() - data.time;
        el.lblPing.textContent = `${rtt} ms`;
        el.pingDot.className = 'ping-dot';
        if (rtt > 160) el.pingDot.classList.add('bad');
        else if (rtt > 80) el.pingDot.classList.add('medium');
        break;
      }
    }
  }

  function startPingTimer() {
    stopPingTimer();
    state.pingTimer = setInterval(() => {
      sendWs({ type: 'ping', time: Date.now() });
    }, 4000);
  }

  function stopPingTimer() {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
  }

  // --- AUDIO DUCKING (KONUŞURKEN MÜZİĞİ OTOMATİK KISMA) ---
  function handleAudioDucking(isSpeaking) {
    if (!state.audioDuckingEnabled || !state.musicState || !state.musicState.isPlaying) return;

    const baseVol = (state.musicState.volume !== undefined ? state.musicState.volume : 50);

    if (isSpeaking) {
      state.isDuckingActive = true;
      const duckedFactor = 1 - (state.audioDuckingPct / 100);
      const duckedVol = (baseVol / 100) * duckedFactor;
      if (state.musicAudio) state.musicAudio.volume = Math.max(0, duckedVol);
      sendMusicBotYtCommand('setVolume', [Math.round(baseVol * duckedFactor)]);
    } else {
      // Check if self or any peer is still speaking
      let anySpeaking = state.audioManager ? state.audioManager.isSpeaking : false;
      if (!anySpeaking) {
        for (const p of state.peers.values()) {
          if (p.isSpeaking) { anySpeaking = true; break; }
        }
      }
      if (!anySpeaking) {
        state.isDuckingActive = false;
        if (state.musicAudio) state.musicAudio.volume = baseVol / 100;
        sendMusicBotYtCommand('setVolume', [baseVol]);
      }
    }
  }

  function updateShortcutCardsUI() {
    if (el.lblShortcutsMasterBadge) {
      el.lblShortcutsMasterBadge.textContent = state.shortcutsMasterEnabled ? '🟢 Kısayollar Aktif' : '⚪ Kısayollar Pasif';
      el.lblShortcutsMasterBadge.className = 'shortcut-status-badge ' + (state.shortcutsMasterEnabled ? 'active' : 'inactive');
    }

    // PTM
    const ptmActive = state.shortcutsMasterEnabled && state.ptmShortcutEnabled;
    if (el.cardPtm) el.cardPtm.classList.toggle('disabled', !ptmActive);
    if (el.badgePtmStatus) {
      el.badgePtmStatus.textContent = state.ptmShortcutEnabled ? '🟢 Aktif' : '⚪ Pasif';
      el.badgePtmStatus.className = 'shortcut-status-badge ' + (state.ptmShortcutEnabled ? 'active' : 'inactive');
    }
    if (el.btnBindPtmKey) el.btnBindPtmKey.disabled = !ptmActive;

    // Mute Toggle
    const muteActive = state.shortcutsMasterEnabled && state.muteShortcutEnabled;
    if (el.cardMuteToggle) el.cardMuteToggle.classList.toggle('disabled', !muteActive);
    if (el.badgeMuteToggleStatus) {
      el.badgeMuteToggleStatus.textContent = state.muteShortcutEnabled ? '🟢 Aktif' : '⚪ Pasif';
      el.badgeMuteToggleStatus.className = 'shortcut-status-badge ' + (state.muteShortcutEnabled ? 'active' : 'inactive');
    }
    if (el.btnBindMuteToggleKey) el.btnBindMuteToggleKey.disabled = !muteActive;

    // Deafen
    const deafenActive = state.shortcutsMasterEnabled && state.deafenShortcutEnabled;
    if (el.cardDeafen) el.cardDeafen.classList.toggle('disabled', !deafenActive);
    if (el.badgeDeafenStatus) {
      el.badgeDeafenStatus.textContent = state.deafenShortcutEnabled ? '🟢 Aktif' : '⚪ Pasif';
      el.badgeDeafenStatus.className = 'shortcut-status-badge ' + (state.deafenShortcutEnabled ? 'active' : 'inactive');
    }
    if (el.btnBindDeafenKey) el.btnBindDeafenKey.disabled = !deafenActive;
  }

  function updateShortcutSettingsUI() {
    if (el.btnBindPttKey) el.btnBindPttKey.textContent = state.pttKey;
    if (el.btnBindPtmKey) el.btnBindPtmKey.textContent = state.ptmKey;
    if (el.btnBindMuteToggleKey) el.btnBindMuteToggleKey.textContent = state.muteToggleKey;
    if (el.btnBindDeafenKey) el.btnBindDeafenKey.textContent = state.deafenKey;
    if (el.chkShortcutsMaster) el.chkShortcutsMaster.checked = state.shortcutsMasterEnabled;
    if (el.chkPtmEnabled) el.chkPtmEnabled.checked = state.ptmShortcutEnabled;
    if (el.chkMuteToggleEnabled) el.chkMuteToggleEnabled.checked = state.muteShortcutEnabled;
    if (el.chkDeafenEnabled) el.chkDeafenEnabled.checked = state.deafenShortcutEnabled;
    if (el.chkPttSoundEnabled && state.audioManager) el.chkPttSoundEnabled.checked = !!state.audioManager.pttSoundEnabled;

    updateShortcutCardsUI();
  }

  // --- AUDIO STUDIO & DSP SETTINGS UI ---
  function setupAudioStudioUI() {
    if (!el.sliderNoiseGate) return;

    // Load initial values to UI
    el.sliderNoiseGate.value = state.audioManager.gateThresholdDB;
    el.lblNoiseGateValue.textContent = state.audioManager.gateThresholdDB + ' dB';
    updateGateMarkerUI(state.audioManager.gateThresholdDB);

    el.sliderMicGain.value = state.audioManager.micGainDb;
    el.lblMicGainValue.textContent = (state.audioManager.micGainDb > 0 ? '+' : '') + state.audioManager.micGainDb + ' dB';

    el.chkHighPass.checked = state.audioManager.highPassEnabled;
    el.chkVocalClarity.checked = state.audioManager.vocalClarityEnabled;
    el.chkLimiter.checked = state.audioManager.limiterEnabled;
    el.chkEchoCancellation.checked = state.audioManager.echoCancellationEnabled;
    if (el.chkAiNoiseSuppression) el.chkAiNoiseSuppression.checked = state.audioManager.aiNoiseSuppressionEnabled;

    el.chkAudioDucking.checked = state.audioDuckingEnabled;
    el.sliderDuckingPct.value = state.audioDuckingPct;
    el.lblDuckingPctValue.textContent = '%' + state.audioDuckingPct;
    if (el.boxDuckingSlider) el.boxDuckingSlider.classList.toggle('hidden', !state.audioDuckingEnabled);

    if (el.chkVoiceChangerEnabled) el.chkVoiceChangerEnabled.checked = state.voiceChangerEnabled;
    if (el.selectMicNotifSound) {
      el.selectMicNotifSound.value = state.audioManager.micNotifSoundMode || 'voice_and_chime';
    }

    el.radioVad.checked = state.audioManager.inputMode === 'vad';
    el.radioPtt.checked = state.audioManager.inputMode === 'ptt';
    if (el.radioPtm) el.radioPtm.checked = state.audioManager.inputMode === 'ptm';

    updateShortcutSettingsUI();

    const updateVoiceChangerStatusUI = () => {
      const enabled = state.voiceChangerEnabled;
      if (el.chkVoiceChangerEnabled) el.chkVoiceChangerEnabled.checked = enabled;
      if (el.voiceFxGrid) el.voiceFxGrid.classList.toggle('disabled', !enabled);
      if (el.lblActiveVoiceFx) {
        if (!enabled) {
          el.lblActiveVoiceFx.textContent = 'Kapalı';
          el.lblActiveVoiceFx.classList.add('disabled');
        } else {
          const activeCard = el.voiceFxGrid ? el.voiceFxGrid.querySelector('.voice-fx-card.active') : null;
          const fxName = activeCard ? (activeCard.querySelector('.voice-fx-name')?.textContent || 'Normal') : 'Normal';
          el.lblActiveVoiceFx.textContent = fxName;
          el.lblActiveVoiceFx.classList.remove('disabled');
        }
      }
      if (state.audioManager) {
        state.audioManager.setVoiceEffect(enabled ? state.activeVoiceFx : 'none');
      }
    };
    updateVoiceChangerStatusUI();

    const updateInputModeKeyBoxes = () => {
      const mode = state.audioManager.inputMode;
      if (el.boxPttKeyBind) el.boxPttKeyBind.classList.toggle('hidden', mode !== 'ptt');
    };
    updateInputModeKeyBoxes();

    // Highlight active preset chip
    document.querySelectorAll('.preset-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-preset') === state.activePreset);
    });

    // Preset Chips Listener
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const preset = chip.getAttribute('data-preset');
        document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activePreset = preset;
        localStorage.setItem('talkapp_audio_preset', preset);

        if (preset !== 'custom') {
          state.audioManager.applyPreset(preset);
          updateAudioControlsFromManager();
          const pName = chip.querySelector('.chip-title') ? chip.querySelector('.chip-title').textContent : preset;
          showToast(`🎯 [${pName}] ses profili uygulandı!`);
        }
      });
    });

    // Live Sidetone / Mic Loopback Test
    el.btnToggleMicTest.addEventListener('click', async () => {
      if (!state.isMicTesting) {
        try {
          await state.audioManager.getMicrophoneStream();
          state.audioManager.setSidetoneEnabled(true);
          state.isMicTesting = true;
          el.btnToggleMicTest.textContent = '⏹ Testi Durdur (Dinleniyor...)';
          el.btnToggleMicTest.classList.add('btn-primary');
          el.btnToggleMicTest.classList.remove('btn-secondary');
          showToast('🎧 Kendi sesinizi kulaklığınızda duyuyorsunuz. Konuşarak ayarları test edin.');
        } catch (e) {
          showToast('⚠️ Mikrofon başlatılamadı!');
        }
      } else {
        state.audioManager.setSidetoneEnabled(false);
        state.isMicTesting = false;
        el.btnToggleMicTest.textContent = '▶ Kendi Sesini Dinle (Test Et)';
        el.btnToggleMicTest.classList.remove('btn-primary');
        el.btnToggleMicTest.classList.add('btn-secondary');
      }
    });

    // Sliders
    el.sliderNoiseGate.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.lblNoiseGateValue.textContent = val + ' dB';
      state.audioManager.setGateThreshold(val);
      updateGateMarkerUI(val);
      markPresetCustom();
    });

    el.sliderMicGain.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      el.lblMicGainValue.textContent = (val > 0 ? '+' : '') + val + ' dB';
      state.audioManager.setMicGain(val);
      markPresetCustom();
    });

    // DSP Checkboxes
    el.chkHighPass.addEventListener('change', (e) => {
      state.audioManager.setHighPassEnabled(e.target.checked);
      markPresetCustom();
    });

    el.chkVocalClarity.addEventListener('change', (e) => {
      state.audioManager.setVocalClarityEnabled(e.target.checked);
      markPresetCustom();
    });

    el.chkLimiter.addEventListener('change', (e) => {
      state.audioManager.setLimiterEnabled(e.target.checked);
      markPresetCustom();
    });

    el.chkEchoCancellation.addEventListener('change', (e) => {
      state.audioManager.setEchoCancellationEnabled(e.target.checked);
      markPresetCustom();
    });

    if (el.chkAiNoiseSuppression) {
      el.chkAiNoiseSuppression.addEventListener('change', (e) => {
        state.audioManager.setAiNoiseSuppression(e.target.checked);
        showToast(e.target.checked ? '🤖 Yapay Zeka Gürültü Engelleme aktif.' : '⚪ Yapay zeka gürültü engelleme kapatıldı.');
      });
    }

    // Ducking
    el.chkAudioDucking.addEventListener('change', (e) => {
      state.audioDuckingEnabled = e.target.checked;
      localStorage.setItem('talkapp_audio_ducking_enabled', state.audioDuckingEnabled);
      if (el.boxDuckingSlider) el.boxDuckingSlider.classList.toggle('hidden', !state.audioDuckingEnabled);
    });

    el.sliderDuckingPct.addEventListener('input', (e) => {
      state.audioDuckingPct = parseInt(e.target.value, 10);
      el.lblDuckingPctValue.textContent = '%' + state.audioDuckingPct;
      localStorage.setItem('talkapp_audio_ducking_pct', state.audioDuckingPct);
    });

    // Input mode (VAD vs PTT vs PTM)
    el.radioVad.addEventListener('change', () => {
      state.audioManager.inputMode = 'vad';
      localStorage.setItem('talkapp_input_mode', 'vad');
      updateInputModeKeyBoxes();
    });

    el.radioPtt.addEventListener('change', () => {
      state.audioManager.inputMode = 'ptt';
      localStorage.setItem('talkapp_input_mode', 'ptt');
      updateInputModeKeyBoxes();
    });

    if (el.radioPtm) {
      el.radioPtm.addEventListener('change', () => {
        state.audioManager.inputMode = 'ptm';
        localStorage.setItem('talkapp_input_mode', 'ptm');
        updateInputModeKeyBoxes();
      });
    }

    // PTT Key Binding
    el.btnBindPttKey.addEventListener('click', () => {
      state.isBindingPttKey = true;
      state.isBindingPtmKey = false;
      state.isBindingMuteToggleKey = false;
      el.btnBindPttKey.textContent = 'Bir tuşa basın...';
      el.btnBindPttKey.classList.add('recording');
    });

    if (el.chkPttSoundEnabled) {
      el.chkPttSoundEnabled.checked = !!state.audioManager.pttSoundEnabled;
      el.chkPttSoundEnabled.addEventListener('change', (e) => {
        state.audioManager.setPttSoundEnabled(e.target.checked);
        showToast(e.target.checked ? '🔊 Bas-Konuş sesli bildirimi açıldı.' : '🔇 Bas-Konuş sesli bildirimi kapatıldı.');
      });
    }

    // PTM (Bas-Sustur) Key Binding
    if (el.btnBindPtmKey) {
      el.btnBindPtmKey.addEventListener('click', () => {
        state.isBindingPtmKey = true;
        state.isBindingPttKey = false;
        state.isBindingMuteToggleKey = false;
        el.btnBindPtmKey.textContent = 'Bir tuşa basın...';
        el.btnBindPtmKey.classList.add('recording');
      });
    }

    // Mute Toggle (Mikrofon Aç/Kapat) Key Binding
    if (el.btnBindMuteToggleKey) {
      el.btnBindMuteToggleKey.addEventListener('click', () => {
        state.isBindingMuteToggleKey = true;
        state.isBindingPttKey = false;
        state.isBindingPtmKey = false;
        el.btnBindMuteToggleKey.textContent = 'Bir tuşa basın...';
        el.btnBindMuteToggleKey.classList.add('recording');
      });
    }

    // Deafen Key Binding
    if (el.btnBindDeafenKey) {
      el.btnBindDeafenKey.addEventListener('click', () => {
        state.isBindingDeafenKey = true;
        state.isBindingPttKey = false;
        state.isBindingPtmKey = false;
        state.isBindingMuteToggleKey = false;
        el.btnBindDeafenKey.textContent = 'Bir tuşa basın...';
        el.btnBindDeafenKey.classList.add('recording');
      });
    }

    // Shortcuts Toggles Listeners
    if (el.chkShortcutsMaster) {
      el.chkShortcutsMaster.addEventListener('change', (e) => {
        state.shortcutsMasterEnabled = e.target.checked;
        localStorage.setItem('talkapp_shortcuts_master', state.shortcutsMasterEnabled);
        updateShortcutCardsUI();
        showToast(state.shortcutsMasterEnabled ? '⌨️ Kısayol tuşları aktifleştirildi.' : '⌨️ Kısayol tuşları pasifleştirildi (oyun modu).');
      });
    }

    if (el.chkPtmEnabled) {
      el.chkPtmEnabled.addEventListener('change', (e) => {
        state.ptmShortcutEnabled = e.target.checked;
        localStorage.setItem('talkapp_ptm_enabled', state.ptmShortcutEnabled);
        updateShortcutCardsUI();
        showToast(state.ptmShortcutEnabled ? '🤫 Bas-Sustur kısayolu açıldı.' : '🤫 Bas-Sustur kısayolu kapatıldı.');
      });
    }

    if (el.chkMuteToggleEnabled) {
      el.chkMuteToggleEnabled.addEventListener('change', (e) => {
        state.muteShortcutEnabled = e.target.checked;
        localStorage.setItem('talkapp_mute_shortcut_enabled', state.muteShortcutEnabled);
        updateShortcutCardsUI();
        showToast(state.muteShortcutEnabled ? '🔇 Mikrofon Aç/Kapat kısayolu açıldı.' : '🔇 Mikrofon Aç/Kapat kısayolu kapatıldı.');
      });
    }

    if (el.chkDeafenEnabled) {
      el.chkDeafenEnabled.addEventListener('change', (e) => {
        state.deafenShortcutEnabled = e.target.checked;
        localStorage.setItem('talkapp_deafen_shortcut_enabled', state.deafenShortcutEnabled);
        updateShortcutCardsUI();
        showToast(state.deafenShortcutEnabled ? '🎧 Kulaklık kısayolu açıldı.' : '🎧 Kulaklık kısayolu kapatıldı (oyunlar için önerilen).');
      });
    }

    // Voice Changer Enable/Disable Toggle
    if (el.chkVoiceChangerEnabled) {
      el.chkVoiceChangerEnabled.addEventListener('change', (e) => {
        state.voiceChangerEnabled = e.target.checked;
        localStorage.setItem('talkapp_voice_fx_enabled', state.voiceChangerEnabled);
        updateVoiceChangerStatusUI();
        showToast(state.voiceChangerEnabled ? '🎭 Ses Değiştirici açıldı.' : '🎭 Ses Değiştirici kapatıldı.');
      });
    }

    // Mic Open/Close Notification Sound Selector & Test Button
    if (el.selectMicNotifSound) {
      el.selectMicNotifSound.addEventListener('change', (e) => {
        state.audioManager.setMicNotifSoundMode(e.target.value);
        state.audioManager.playMicStatusSound(false);
        showToast('🔊 Mikrofon bildirim sesi güncellendi.');
      });
    }

    if (el.btnTestMicNotifSound) {
      el.btnTestMicNotifSound.addEventListener('click', () => {
        state.testMicSoundToggle = !state.testMicSoundToggle;
        state.audioManager.playMicStatusSound(state.testMicSoundToggle);
        showToast(state.testMicSoundToggle ? '🔇 Test: "Mikrofon kapandı" sesi çalındı' : '🎙️ Test: "Mikrofon açıldı" sesi çalındı');
      });
    }
  }

  function updateGateMarkerUI(dB) {
    if (!el.dbThresholdMarker) return;
    // Maps -70 dB..0 dB to 0..100%
    const markerPct = Math.max(0, Math.min(100, Math.round(((dB + 70) / 70) * 100)));
    el.dbThresholdMarker.style.left = markerPct + '%';
  }

  function markPresetCustom() {
    document.querySelectorAll('.preset-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-preset') === 'custom');
    });
    state.activePreset = 'custom';
    localStorage.setItem('talkapp_audio_preset', 'custom');
  }

  function updateAudioControlsFromManager() {
    const am = state.audioManager;
    el.sliderNoiseGate.value = am.gateThresholdDB;
    el.lblNoiseGateValue.textContent = am.gateThresholdDB + ' dB';
    updateGateMarkerUI(am.gateThresholdDB);

    el.sliderMicGain.value = am.micGainDb;
    el.lblMicGainValue.textContent = (am.micGainDb > 0 ? '+' : '') + am.micGainDb + ' dB';

    el.chkHighPass.checked = am.highPassEnabled;
    el.chkVocalClarity.checked = am.vocalClarityEnabled;
    el.chkLimiter.checked = am.limiterEnabled;
  }

  // --- MOBILE DRAWER NAVIGATION HELPERS ---
  function closeMobileDrawer() {
    if (el.appContainer) {
      el.appContainer.classList.remove('mobile-sidebar-open');
      el.appContainer.classList.remove('mobile-members-open');
    }
    if (el.mobileSidebarBackdrop) {
      el.mobileSidebarBackdrop.classList.remove('active');
      el.mobileSidebarBackdrop.classList.add('hidden');
    }
  }

  function toggleMobileDrawer() {
    if (!el.appContainer) return;
    el.appContainer.classList.remove('mobile-members-open');
    const isOpen = el.appContainer.classList.toggle('mobile-sidebar-open');
    if (el.mobileSidebarBackdrop) {
      if (isOpen) {
        el.mobileSidebarBackdrop.classList.remove('hidden');
        el.mobileSidebarBackdrop.classList.add('active');
      } else {
        el.mobileSidebarBackdrop.classList.remove('active');
        el.mobileSidebarBackdrop.classList.add('hidden');
      }
    }
  }

  function toggleMobileMembersDrawer() {
    if (!el.appContainer) return;
    el.appContainer.classList.remove('mobile-sidebar-open');
    const isOpen = el.appContainer.classList.toggle('mobile-members-open');
    if (el.mobileSidebarBackdrop) {
      if (isOpen) {
        el.mobileSidebarBackdrop.classList.remove('hidden');
        el.mobileSidebarBackdrop.classList.add('active');
      } else {
        el.mobileSidebarBackdrop.classList.remove('active');
        el.mobileSidebarBackdrop.classList.add('hidden');
      }
    }
  }

  // --- MOBILE SCREEN WAKE LOCK & BACKGROUND AUDIO KEEP-ALIVE ---
  let wakeLockSentinel = null;
  let mobileKeepAliveAudio = null;
  let mobileAudioHeartbeatTimer = null;

  async function acquireScreenWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
            console.log('[Mobile] Screen wake lock released by OS');
          });
          console.log('[Mobile] Screen wake lock acquired');
        }
      } catch (err) {
        console.warn('[Mobile] Screen wake lock error:', err);
      }
    }
  }

  function releaseScreenWakeLock() {
    if (wakeLockSentinel) {
      try {
        wakeLockSentinel.release();
      } catch (e) {}
      wakeLockSentinel = null;
      console.log('[Mobile] Screen wake lock explicitly released');
    }
  }

  function startMobileAudioKeepAlive() {
    try {
      if (!mobileKeepAliveAudio) {
        mobileKeepAliveAudio = new Audio();
        // 44-byte silent WAV
        mobileKeepAliveAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        mobileKeepAliveAudio.loop = true;
        mobileKeepAliveAudio.volume = 0.01;
        mobileKeepAliveAudio.setAttribute('playsinline', 'true');
        mobileKeepAliveAudio.setAttribute('webkit-playsinline', 'true');
      }
      mobileKeepAliveAudio.play().catch(e => {
        console.warn('[Mobile] Keep-alive audio play prevented:', e);
      });
    } catch (e) {
      console.warn('[Mobile] Audio keep-alive init error:', e);
    }

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'playing';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'TalkApp Sesli Sohbet',
          artist: state.activeVoiceRoomName || (state.activeDirectCall ? state.activeDirectCall.peerName : 'Ses Kanalı'),
          album: 'TalkApp Pro'
        });
        navigator.mediaSession.setActionHandler('play', () => {
          if (mobileKeepAliveAudio) mobileKeepAliveAudio.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          toggleMic();
        });
      } catch (e) {}
    }

    if (!mobileAudioHeartbeatTimer) {
      mobileAudioHeartbeatTimer = setInterval(checkAudioAndMicHealth, 5000);
    }
  }

  function stopMobileAudioKeepAlive() {
    if (mobileKeepAliveAudio) {
      try {
        mobileKeepAliveAudio.pause();
        mobileKeepAliveAudio.currentTime = 0;
      } catch (e) {}
    }
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
      } catch (e) {}
    }
    if (mobileAudioHeartbeatTimer) {
      clearInterval(mobileAudioHeartbeatTimer);
      mobileAudioHeartbeatTimer = null;
    }
  }

  async function checkAudioAndMicHealth() {
    if (!state.activeVoiceRoomId && !state.activeDirectCall) return;

    // 1. Resume Web Audio context if suspended
    if (state.audioManager && state.audioManager.audioCtx) {
      if (state.audioManager.audioCtx.state === 'suspended') {
        try {
          await state.audioManager.audioCtx.resume();
          console.log('[Mobile] AudioContext resumed by healthcheck');
        } catch (e) {}
      }
    }

    // 2. Check mic stream in voice room
    if (state.activeVoiceRoomId && state.audioManager) {
      const micStream = state.audioManager.localStream;
      const tracks = micStream ? micStream.getAudioTracks() : [];
      const isDead = !micStream || tracks.length === 0 || tracks.some(t => t.readyState === 'ended' || (t.muted && !state.isMicMuted));
      if (isDead && !state.isMicMuted) {
        console.warn('[Mobile] Healthcheck: mic stream dead/ended. Reacquiring...');
        try {
          const freshStream = await state.audioManager.reacquireMicrophone();
          if (freshStream && state.webrtc) {
            state.webrtc.setLocalStream(freshStream);
          }
        } catch (e) {
          console.warn('[Mobile] Healthcheck reacquire mic failed:', e);
        }
      }
    }

    // 3. Keep-alive audio playback guarantee
    if (mobileKeepAliveAudio && mobileKeepAliveAudio.paused) {
      mobileKeepAliveAudio.play().catch(() => {});
    }
  }

  async function handleMobileVisibilityRecovery() {
    if (!state.activeVoiceRoomId && !state.activeDirectCall) return;

    console.log('[Mobile] Visibility visible - verifying audio & mic...');
    // Reacquire wake lock
    if (!wakeLockSentinel) {
      acquireScreenWakeLock();
    }

    // Resume AudioContext
    if (state.audioManager && state.audioManager.audioCtx) {
      if (state.audioManager.audioCtx.state === 'suspended') {
        try {
          await state.audioManager.audioCtx.resume();
        } catch (e) {}
      }
    }

    // Check remote audios
    if (state.audioManager && state.audioManager.remoteAudios) {
      for (const [, peerAudio] of state.audioManager.remoteAudios.entries()) {
        if (peerAudio.element && peerAudio.element.paused) {
          peerAudio.element.play().catch(() => {});
        }
      }
    }

    // Reacquire mic if needed
    await checkAudioAndMicHealth();
  }

  // --- CATEGORIZED CHANNELS & MEMBERS RENDERING ---
  function renderChannelsList() {
    if (!el.channelList) return;
    el.channelList.innerHTML = '';

    // 1. HOME MODE (Direct Messages & Friends View)
    if (state.currentServerId === 'home') {
      if (el.lblServerIcon) el.lblServerIcon.textContent = '💬';
      if (el.lblServerName) el.lblServerName.textContent = 'Direkt Mesajlar';
      if (el.btnQuickCreateChannel) el.btnQuickCreateChannel.style.display = 'none';
      if (el.btnServerDropdownToggle) el.btnServerDropdownToggle.style.display = 'none';

      // Friends Dashboard Button at top
      const friendsItem = document.createElement('div');
      friendsItem.className = 'channel-item friends-nav-btn' + (state.activeHomeView === 'friends' ? ' active' : '');
      friendsItem.style.marginBottom = '10px';
      friendsItem.style.padding = '10px 14px';

      const pendingCount = (state.friends || []).filter(f => f.relationship === 'pending_in').length;
      const pendingBadge = pendingCount > 0 ? `<span class="rail-badge" style="position:static; margin-left:auto; background:var(--red);">${pendingCount}</span>` : '';

      friendsItem.innerHTML = `
        <div class="channel-main-info" style="gap:10px;">
          <span style="font-size:18px;">👥</span>
          <span class="channel-name-text" style="font-weight:700;">Arkadaşlar</span>
        </div>
        ${pendingBadge}
      `;
      friendsItem.addEventListener('click', () => {
        state.activeHomeView = 'friends';
        showFriendsDashboardView();
        renderChannelsList();
        closeMobileDrawer();
      });
      el.channelList.appendChild(friendsItem);

      // Direct Messages Category
      const dmBlock = document.createElement('div');
      dmBlock.className = 'category-block';
      dmBlock.innerHTML = `
        <div class="category-header" style="cursor:default;">
          <div class="category-title-wrap">
            <span>DİREKT MESAJLAR</span>
          </div>
        </div>
      `;

      const dmWrap = document.createElement('div');
      dmWrap.className = 'category-channels';

      if (state.dms.size === 0) {
        dmWrap.innerHTML = '<div style="font-size:12px; color:var(--text-muted); padding:8px 12px; font-style:italic;">Henüz bir özel mesajınız yok.</div>';
      } else {
        for (const [dmUserId, dm] of state.dms.entries()) {
          const item = document.createElement('div');
          item.className = 'channel-item';
          if (state.activeHomeView === 'dm' && state.activeViewType === 'dm' && state.activeDmUserId === dmUserId) {
            item.classList.add('active');
          }
          const initial = (dm.name || 'O').charAt(0).toUpperCase();
          const unreadBadge = dm.unread > 0 ? `<span class="rail-badge" style="position:static; margin-left:auto;">${dm.unread}</span>` : '';

          item.innerHTML = `
            <div class="avatar" style="width:22px; height:22px; font-size:10px;">${initial}</div>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500;">${escapeHtml(dm.name)}</span>
            ${unreadBadge}
          `;
          item.addEventListener('click', () => {
            state.activeHomeView = 'dm';
            if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
            if (el.textChatView) el.textChatView.classList.remove('hidden');
            openDmChat(dmUserId, dm.name);
            closeMobileDrawer();
          });
          dmWrap.appendChild(item);
        }
      }

      dmBlock.appendChild(dmWrap);
      el.channelList.appendChild(dmBlock);
      return;
    }

    // 2. SERVER MODE (Guild Channels)
    if (el.lblServerIcon) el.lblServerIcon.textContent = state.serverSettings?.serverIcon || '🎮';
    if (el.lblServerName) el.lblServerName.textContent = state.serverSettings?.serverName || 'TalkApp Sunucusu';
    if (el.btnQuickCreateChannel) el.btnQuickCreateChannel.style.display = '';
    if (el.btnServerDropdownToggle) el.btnServerDropdownToggle.style.display = '';

    const categoryMap = new Map();

    const getCat = (catName) => {
      const normalized = (catName || 'GENEL SOHBET').toUpperCase().trim();
      if (!categoryMap.has(normalized)) {
        categoryMap.set(normalized, { text: [], voice: [] });
      }
      return categoryMap.get(normalized);
    };

    (state.channels.text || []).forEach(ch => {
      getCat(ch.category).text.push(ch);
    });

    (state.channels.voice || []).forEach(ch => {
      getCat(ch.category).voice.push(ch);
    });

    ['GENEL SOHBET', 'OYUN ODALARI', 'YÖNETİM & VIP'].forEach(defCat => {
      if (!categoryMap.has(defCat)) {
        categoryMap.set(defCat, { text: [], voice: [] });
      }
    });

    for (const [catName, catChannels] of categoryMap.entries()) {
      const isCollapsed = state.collapsedCategories.has(catName);

      const block = document.createElement('div');
      block.className = 'category-block' + (isCollapsed ? ' collapsed' : '');
      block.setAttribute('data-category', catName);

      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = `
        <div class="category-title-wrap">
          <span class="category-arrow">▼</span>
          <span>${escapeHtml(catName)}</span>
        </div>
        <button class="card-btn btn-add-cat-channel" title="Bu Kategoriye Kanal Ekle" style="font-size:12px; padding:2px 6px;">➕</button>
      `;

      header.addEventListener('click', (e) => {
        if (e.target.closest('.btn-add-cat-channel')) return;
        const nowCollapsed = block.classList.toggle('collapsed');
        if (nowCollapsed) state.collapsedCategories.add(catName);
        else state.collapsedCategories.delete(catName);
        localStorage.setItem('talkapp_collapsed_cats', JSON.stringify(Array.from(state.collapsedCategories)));
      });

      const btnAddInCat = header.querySelector('.btn-add-cat-channel');
      if (btnAddInCat) {
        btnAddInCat.addEventListener('click', (e) => {
          e.stopPropagation();
          openCreateChannelModal('text', catName);
        });
      }

      block.appendChild(header);

      const perm = state.currentServerPermissions || {};
      const canManageChannels = perm.isAdministrator || !!perm.manage_channels || state.myRole === 'admin' || state.myRole === 'mod' || (state.serverSettings && state.serverSettings.ownerId === state.selfId);
      const canMoveMembers = perm.isAdministrator || !!perm.move_members || canManageChannels;

      if (btnAddInCat) {
        btnAddInCat.style.display = canManageChannels ? '' : 'none';
      }

      const channelsWrap = document.createElement('div');
      channelsWrap.className = 'category-channels';

      if (canManageChannels) {
        channelsWrap.addEventListener('dragover', (e) => {
          if (e.dataTransfer.types.includes('text/talkapp-channel-id')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            channelsWrap.classList.add('drag-over-category');
          }
        });
        channelsWrap.addEventListener('dragleave', (e) => {
          if (!channelsWrap.contains(e.relatedTarget)) {
            channelsWrap.classList.remove('drag-over-category');
          }
        });
        channelsWrap.addEventListener('drop', (e) => {
          const channelId = e.dataTransfer.getData('text/talkapp-channel-id');
          channelsWrap.classList.remove('drag-over-category');
          if (channelId) {
            e.preventDefault();
            e.stopPropagation();
            sendWs({
              type: 'move-channel',
              channelId: channelId,
              targetCategory: catName,
              beforeChannelId: null,
              serverId: state.currentServerId
            });
          }
        });
      }

      catChannels.text.forEach(ch => {
        const item = document.createElement('div');
        item.className = 'channel-item';
        if (state.activeViewType === 'text' && state.activeChannelId === ch.id) item.classList.add('active');
        item.setAttribute('data-channel-id', ch.id);

        if (canManageChannels) {
          item.setAttribute('draggable', 'true');
          item.classList.add('can-drag-channel');
          item.title = `${ch.name} (Kategorisini değiştirmek için sürükleyin)`;

          item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/talkapp-channel-id', ch.id);
            e.dataTransfer.setData('text/talkapp-source-cat', catName);
            e.dataTransfer.setData('text/talkapp-drag-kind', 'channel');
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('is-dragging-channel');
          });
          item.addEventListener('dragend', () => {
            item.classList.remove('is-dragging-channel');
            document.querySelectorAll('.drag-over-category, .drag-over-channel, .drop-target-voice').forEach(el => {
              el.classList.remove('drag-over-category', 'drag-over-channel', 'drop-target-voice');
            });
          });
          item.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/talkapp-channel-id')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              item.classList.add('drag-over-channel');
            }
          });
          item.addEventListener('dragleave', (e) => {
            if (!item.contains(e.relatedTarget)) {
              item.classList.remove('drag-over-channel');
            }
          });
          item.addEventListener('drop', (e) => {
            const channelId = e.dataTransfer.getData('text/talkapp-channel-id');
            item.classList.remove('drag-over-channel');
            if (channelId && channelId !== ch.id) {
              e.preventDefault();
              e.stopPropagation();
              sendWs({
                type: 'move-channel',
                channelId: channelId,
                targetCategory: catName,
                beforeChannelId: ch.id,
                serverId: state.currentServerId
              });
            }
          });
        }

        const lockIcon = (ch.hasPassword || ch.minRole !== 'member') ? '<span class="channel-lock-icon">🔒</span>' : '';
        const muteIcon = state.channelNotifs[ch.id] === 'mute' ? '<span class="channel-mute-icon" title="Bildirimler Susturuldu">🔕</span>' : '';
        const canDelete = (state.myRole === 'admin' || state.myRole === 'mod') && ch.id !== 'text-genel';
        const delBtn = canDelete ? `<button class="btn-del-channel" title="Kanalı Sil" data-del-id="${ch.id}">🗑️</button>` : '';

        item.innerHTML = `
          <div class="channel-main-info">
            <span style="font-size:16px; opacity:0.7;">#</span>
            <span class="channel-name-text">${escapeHtml(ch.name)}</span>
            ${muteIcon}
            ${lockIcon}
          </div>
          ${delBtn}
        `;
        item.addEventListener('click', (e) => {
          if (e.target.closest('.btn-del-channel')) return;
          selectTextChannel(ch.id, ch.name);
          closeMobileDrawer();
        });

        const btnDel = item.querySelector('.btn-del-channel');
        if (btnDel) {
          btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`"#${ch.name}" metin kanalını kalıcı olarak silmek istediğinize emin misiniz?`)) {
              if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ type: 'delete-channel', channelId: ch.id }));
              }
            }
          });
        }
        channelsWrap.appendChild(item);
      });

      catChannels.voice.forEach(ch => {
        const item = document.createElement('div');
        item.className = 'channel-item' + (ch.id === 'temp-voice-creator' ? ' temp-creator-item' : '');
        if (state.activeVoiceRoomId === ch.id) item.classList.add('active');
        item.setAttribute('data-voice-id', ch.id);

        if (canManageChannels && ch.id !== 'temp-voice-creator') {
          item.setAttribute('draggable', 'true');
          item.classList.add('can-drag-channel');
          item.title = `${ch.name} (Kategorisini değiştirmek için sürükleyin)`;

          item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/talkapp-channel-id', ch.id);
            e.dataTransfer.setData('text/talkapp-source-cat', catName);
            e.dataTransfer.setData('text/talkapp-drag-kind', 'channel');
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('is-dragging-channel');
          });
          item.addEventListener('dragend', () => {
            item.classList.remove('is-dragging-channel');
            document.querySelectorAll('.drag-over-category, .drag-over-channel, .drop-target-voice').forEach(el => {
              el.classList.remove('drag-over-category', 'drag-over-channel', 'drop-target-voice');
            });
          });
        }

        // Voice channels can accept dropped channels (for reorder/category) and dropped users (to move them)
        if (ch.id !== 'temp-voice-creator') {
          item.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('text/talkapp-channel-id')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              item.classList.add('drag-over-channel');
            } else if (e.dataTransfer.types.includes('text/talkapp-user-id')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              item.classList.add('drop-target-voice');
            }
          });
          item.addEventListener('dragleave', (e) => {
            if (!item.contains(e.relatedTarget)) {
              item.classList.remove('drag-over-channel', 'drop-target-voice');
            }
          });
          item.addEventListener('drop', (e) => {
            const channelId = e.dataTransfer.getData('text/talkapp-channel-id');
            const userId = e.dataTransfer.getData('text/talkapp-user-id');
            const sourceVoice = e.dataTransfer.getData('text/talkapp-source-voice');
            item.classList.remove('drag-over-channel', 'drop-target-voice');

            if (channelId && channelId !== ch.id) {
              e.preventDefault();
              e.stopPropagation();
              sendWs({
                type: 'move-channel',
                channelId: channelId,
                targetCategory: catName,
                beforeChannelId: ch.id,
                serverId: state.currentServerId
              });
            } else if (userId && sourceVoice !== ch.id) {
              e.preventDefault();
              e.stopPropagation();
              sendWs({
                type: 'move-voice-member',
                targetUserId: userId,
                targetChannelId: ch.id,
                serverId: state.currentServerId
              });
            }
          });
        }

        // Filter remote members in this room (exclude local user to prevent stale ghost entries)
        const inRoom = state.serverMembers.filter(m => {
          const isMe = (m.id && m.id === state.selfId) || (m.name && m.name === state.username);
          if (isMe) return false;
          return m.voiceRoomId === ch.id;
        });

        // Deterministically insert local user into their active voice room
        if (state.activeVoiceRoomId === ch.id) {
          inRoom.unshift({
            id: state.selfId,
            name: state.username,
            avatarUrl: state.myAvatar,
            badge: state.myBadge,
            voiceRoomId: ch.id,
            muted: state.isMicMuted,
            deafened: state.isDeafened,
            screen: state.isScreenSharing,
            isSpeaking: false,
            isSelf: true
          });
        }

        const count = inRoom.length;
        const userLimit = ch.userLimit || ch.user_limit || 0;
        const lockIcon = (ch.hasPassword || ch.minRole !== 'member') ? '<span class="channel-lock-icon">🔒</span>' : '';
        const vIcon = ch.id === 'temp-voice-creator' ? '➕' : (ch.isTemp ? '⚡' : '🔊');
        let badgeTag = '';
        if (ch.id === 'temp-voice-creator') {
          badgeTag = `<span class="channel-badge" style="background:var(--brand); font-size:10px;">OTOMATİK</span>`;
        } else if (userLimit > 0) {
          badgeTag = `<span class="voice-capacity-badge ${count >= userLimit ? 'full' : ''}">${count}/${userLimit}</span>`;
        } else {
          badgeTag = `<span class="channel-badge">${count}</span>`;
        }
        const canDelete = (state.myRole === 'admin' || state.myRole === 'mod') && ch.id !== 'temp-voice-creator' && ch.id !== 'voice-genel' && ch.id !== 'genel-ses';
        const delBtn = canDelete ? `<button class="btn-del-channel" title="Kanalı Sil" data-del-id="${ch.id}">🗑️</button>` : '';

        item.innerHTML = `
          <div class="channel-main-info">
            <span style="font-size:16px; opacity:0.85;">${vIcon}</span>
            <span class="channel-name-text">${escapeHtml(ch.name)}</span>
            ${lockIcon}
            ${badgeTag}
          </div>
          ${delBtn}
        `;
        item.addEventListener('click', (e) => {
          if (e.target.closest('.btn-del-channel')) return;
          joinVoiceChannel(ch.id, ch.name);
          closeMobileDrawer();
        });

        const btnDel = item.querySelector('.btn-del-channel');
        if (btnDel) {
          btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`"${ch.name}" ses kanalını kalıcı olarak silmek istediğinize emin misiniz?`)) {
              if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ type: 'delete-channel', channelId: ch.id }));
              }
            }
          });
        }
        channelsWrap.appendChild(item);

        // Render connected users under this voice channel
        const isBotInThisRoom = state.musicState && state.musicState.isPlaying && state.activeVoiceRoomId === ch.id;
        if (inRoom.length > 0 || isBotInThisRoom) {
          const userList = document.createElement('div');
          userList.className = 'voice-channel-users-list';
          inRoom.forEach(m => {
            const isSelfUser = (m.id && m.id === state.selfId) || (m.name && m.name === state.username) || m.isSelf;
            const currentSpeaking = isSelfUser 
              ? (state.audioManager ? state.audioManager.isSpeaking : false) 
              : (state.peers.get(m.id)?.isSpeaking || false);
            const userRow = document.createElement('div');
            userRow.className = 'voice-channel-user-item' + (currentSpeaking ? ' speaking' : '');
            userRow.dataset.voiceUserId = isSelfUser ? (state.selfId || 'self') : m.id;
            userRow.dataset.isSelf = isSelfUser ? 'true' : 'false';
            userRow.id = `voice-user-${isSelfUser ? (state.selfId || 'self') : m.id}`;
            userRow.title = m.name;

            // Make voice users draggable for authorized users
            if (canMoveMembers) {
              userRow.setAttribute('draggable', 'true');
              userRow.classList.add('can-drag-voice-user');
              userRow.title = `${m.name} (Başka bir ses kanalına taşımak için sürükleyin)`;

              userRow.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                e.dataTransfer.setData('text/talkapp-user-id', m.id);
                e.dataTransfer.setData('text/talkapp-user-name', m.name);
                e.dataTransfer.setData('text/talkapp-source-voice', ch.id);
                e.dataTransfer.setData('text/talkapp-drag-kind', 'voice-user');
                e.dataTransfer.effectAllowed = 'move';
                userRow.classList.add('is-dragging-voice-user');
              });
              userRow.addEventListener('dragend', () => {
                userRow.classList.remove('is-dragging-voice-user');
                document.querySelectorAll('.drop-target-voice').forEach(el => {
                  el.classList.remove('drop-target-voice');
                });
              });
            }

            let avatarContent = (m.name || 'O').charAt(0).toUpperCase();
            if (m.avatarUrl) {
              if (m.avatarUrl.startsWith('http') || m.avatarUrl.startsWith('/')) {
                avatarContent = `<img src="${escapeHtml(m.avatarUrl)}" alt="avatar">`;
              } else {
                avatarContent = m.avatarUrl;
              }
            }

            const muteIcon = m.muted ? '<span title="Susturulmuş">🔇</span>' : '';
            const deafenIcon = m.deafened ? '<span title="Kulaklık Kapalı">🎧</span>' : '';
            const screenIcon = m.screen ? '<span title="Yayın Yapıyor">📺</span>' : '';
            const badgeIcon = m.badge ? `<span class="gamer-badge">${escapeHtml(m.badge)}</span>` : '';
            const selfSuffix = m.isSelf ? '<span style="font-size:10px; opacity:0.6; margin-left:3px;">(Sen)</span>' : '';

            userRow.innerHTML = `
              <div class="voice-channel-user-avatar">${avatarContent}</div>
              <span class="voice-user-name">${escapeHtml(m.name)}${selfSuffix}</span>
              ${badgeIcon}
              <div class="voice-channel-user-icons">
                ${screenIcon}
                ${muteIcon}
                ${deafenIcon}
              </div>
            `;
            userRow.addEventListener('click', (e) => {
              e.stopPropagation();
              openUserActionModal(m);
            });
            userList.appendChild(userRow);
          });

          if (isBotInThisRoom) {
            const botRow = document.createElement('div');
            botRow.className = 'voice-channel-user-item speaking';
            botRow.style.opacity = '0.9';
            botRow.title = `TalkApp Müzik: ${state.musicState.stationName || 'Müzik Çalıyor'}`;
            botRow.innerHTML = `
              <div class="voice-channel-user-avatar" style="background:var(--brand); display:flex; align-items:center; justify-content:center; font-size:12px;">🤖</div>
              <span class="voice-user-name" style="color:var(--brand-light); font-weight:600;">TalkApp Müzik</span>
              <span class="gamer-badge" style="font-size:9px; padding:1px 4px; background:var(--brand); color:#fff;">BOT</span>
              <div class="audio-equalizer-bars" style="margin-left:auto;">
                <span></span><span></span><span></span>
              </div>
            `;
            userList.appendChild(botRow);
          }

          channelsWrap.appendChild(userList);
        }
      });

      block.appendChild(channelsWrap);
      el.channelList.appendChild(block);
    }
  }

  function markChannelUnread(channelId) {
    if (!el.channelList) return;
    const elChan = el.channelList.querySelector(`[data-channel-id="${channelId}"]`);
    if (elChan) elChan.classList.add('unread');
  }

  function updatePermissionsUI() {
    const p = state.currentServerPermissions || {};
    const isAdmin = p.isAdministrator || state.myRole === 'admin' || (state.serverSettings && state.serverSettings.ownerId === state.selfId);
    const canManageChannels = isAdmin || !!p.manage_channels || state.myRole === 'mod';
    const canManageServer = isAdmin || !!p.manage_server;
    const canManageRoles = isAdmin || !!p.manage_roles;

    if (el.btnQuickCreateChannel) {
      el.btnQuickCreateChannel.style.display = canManageChannels ? '' : 'none';
    }
    if (el.menuItemCreateChannel) {
      el.menuItemCreateChannel.style.display = canManageChannels ? '' : 'none';
    }
    if (el.menuItemServerSettings) {
      el.menuItemServerSettings.style.display = (canManageServer || canManageRoles || isAdmin) ? '' : 'none';
    }
  }

  function renderMemberList() {
    if (!el.memberSidebar) return;
    el.memberSidebar.innerHTML = '';

    const seenIds = new Set();
    const seenNames = new Set();
    const onlineMembers = [];
    const offlineMembers = [];

    state.serverMembers.forEach(m => {
      if (!m || !m.name) return;
      const lowerName = m.name.toLowerCase();
      if (m.id && seenIds.has(m.id)) return;
      if (seenNames.has(lowerName)) return;
      if (m.id) seenIds.add(m.id);
      seenNames.add(lowerName);

      const isOnline = m.isOnline === true || (m.status && m.status !== 'offline');
      if (isOnline) {
        onlineMembers.push(m);
      } else {
        offlineMembers.push(m);
      }
    });

    const createRow = (m, isOffline) => {
      const row = document.createElement('div');
      row.className = 'member-row' + (isOffline ? ' offline' : '');

      const initial = (m.name || 'O').charAt(0).toUpperCase();
      let avatarInner = initial;
      if (m.avatarUrl) {
        if (m.avatarUrl.startsWith('http') || m.avatarUrl.startsWith('/') || m.avatarUrl.startsWith('data:')) {
          avatarInner = `<img src="${escapeHtml(m.avatarUrl)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        } else {
          avatarInner = `<span style="font-size:16px;">${escapeHtml(m.avatarUrl)}</span>`;
        }
      }
      const badgeTag = m.badge ? `<span class="gamer-badge" style="font-size:10px; margin-left:4px;">${escapeHtml(m.badge)}</span>` : '';
      const isSelf = m.id === state.selfId;
      const voiceInfo = (m.voiceRoomId && !isOffline) ? `<span class="member-voice-indicator">🔊 Odada</span>` : '';
      const gameInfo = (m.gameActivity && !isOffline) ? `<span class="member-game-activity">${escapeHtml(m.gameActivity)}</span>` : '';
      const statusClass = isOffline ? 'offline' : (m.status || 'online');
      const nameColorStyle = (m.roleColor && !isOffline) ? `color: ${escapeHtml(m.roleColor)}; font-weight: 600;` : '';

      row.innerHTML = `
        <div class="member-avatar">
          ${avatarInner}
          <div class="status-indicator ${statusClass}"></div>
        </div>
        <div class="member-info">
          <span class="member-name ${'role-' + (m.role || 'member')}" style="${nameColorStyle}">${escapeHtml(m.name)}${isSelf ? ' (Sen)' : ''}${badgeTag}</span>
          ${gameInfo}
          ${voiceInfo}
        </div>
      `;

      row.addEventListener('click', () => openUserActionModal(m));
      return row;
    };

    // Build dynamic hoisted groups
    const hoistedRoles = (state.serverRoles || [])
      .filter(r => r.hoist && !r.is_default)
      .sort((a, b) => (b.position || 0) - (a.position || 0));

    if (hoistedRoles.length > 0) {
      const groups = new Map();
      hoistedRoles.forEach(r => {
        groups.set(r.id, {
          id: r.id,
          title: `${r.name.toUpperCase()}`,
          color: r.color,
          list: []
        });
      });
      const defaultOnlineGroup = { id: '__default_online', title: '👤 ÇEVRİMİÇİ', list: [] };

      onlineMembers.forEach(m => {
        let placed = false;
        if (m.hoistRole && groups.has(m.hoistRole.id)) {
          groups.get(m.hoistRole.id).list.push(m);
          placed = true;
        } else if (m.roleIds && Array.isArray(m.roleIds)) {
          for (const hr of hoistedRoles) {
            if (m.roleIds.includes(hr.id)) {
              groups.get(hr.id).list.push(m);
              placed = true;
              break;
            }
          }
        }
        if (!placed) {
          defaultOnlineGroup.list.push(m);
        }
      });

      // Render hoisted groups
      groups.forEach(g => {
        if (g.list.length > 0) {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'member-group';
          const titleColor = g.color ? `style="color:${escapeHtml(g.color)};"` : '';
          groupDiv.innerHTML = `<div class="member-group-title" ${titleColor}>${escapeHtml(g.title)} — ${g.list.length}</div>`;
          g.list.forEach(m => groupDiv.appendChild(createRow(m, false)));
          el.memberSidebar.appendChild(groupDiv);
        }
      });

      // Render default online group
      if (defaultOnlineGroup.list.length > 0) {
        const defDiv = document.createElement('div');
        defDiv.className = 'member-group';
        defDiv.innerHTML = `<div class="member-group-title">${defaultOnlineGroup.title} — ${defaultOnlineGroup.list.length}</div>`;
        defaultOnlineGroup.list.forEach(m => defDiv.appendChild(createRow(m, false)));
        el.memberSidebar.appendChild(defDiv);
      }
    } else {
      // Fallback to legacy role groupings if no hoisted roles defined yet
      const legacyGroups = {
        owner: { title: '👑 SUNUCU SAHİBİ', list: [] },
        admin: { title: '👑 YÖNETİCİLER', list: [] },
        mod: { title: '🛡️ MODERATÖRLER', list: [] },
        vip: { title: '💎 VIP OYUNCULAR', list: [] },
        member: { title: '👤 ÇEVRİMİÇİ', list: [] }
      };

      onlineMembers.forEach(m => {
        const roleKey = legacyGroups[m.role] ? m.role : 'member';
        legacyGroups[roleKey].list.push(m);
      });

      for (const [, group] of Object.entries(legacyGroups)) {
        if (group.list.length === 0) continue;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'member-group';
        groupDiv.innerHTML = `<div class="member-group-title">${group.title} — ${group.list.length}</div>`;
        group.list.forEach(m => groupDiv.appendChild(createRow(m, false)));
        el.memberSidebar.appendChild(groupDiv);
      }
    }

    // Render Offline Group
    if (offlineMembers.length > 0) {
      const offlineDiv = document.createElement('div');
      offlineDiv.className = 'member-group member-group-offline';
      offlineDiv.innerHTML = `<div class="member-group-title">⚪ ÇEVRİMDIŞI — ${offlineMembers.length}</div>`;
      offlineMembers.forEach(m => offlineDiv.appendChild(createRow(m, true)));
      el.memberSidebar.appendChild(offlineDiv);
    }
  }

  // --- FULL-TEXT SEARCH SYSTEM ---
  function setupFullTextSearch() {
    if (!el.inputSearchMessages || !el.searchResultsDropdown) return;

    el.inputSearchMessages.addEventListener('input', () => {
      clearTimeout(state.searchDebounceTimer);
      const query = el.inputSearchMessages.value.trim();
      if (query.length < 2) {
        el.searchResultsDropdown.classList.remove('show');
        return;
      }
      state.searchDebounceTimer = setTimeout(() => {
        sendWs({
          type: 'search-messages',
          query: query
        });
      }, 250);
    });

    el.inputSearchMessages.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        el.searchResultsDropdown.classList.remove('show');
        el.inputSearchMessages.blur();
      }
    });

    document.addEventListener('click', (e) => {
      if (el.headerSearchBar && !el.headerSearchBar.contains(e.target)) {
        el.searchResultsDropdown.classList.remove('show');
      }
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        el.inputSearchMessages.focus();
        el.inputSearchMessages.select();
      }
    });
  }

  function renderSearchResults(query, results) {
    if (!el.searchResultsDropdown) return;
    el.searchResultsDropdown.innerHTML = '';

    if (!results || results.length === 0) {
      el.searchResultsDropdown.innerHTML = `
        <div class="search-result-item" style="color:var(--text-muted); cursor:default;">
          <span>🔍 "${escapeHtml(query)}" için mesaj bulunamadı.</span>
        </div>
      `;
      el.searchResultsDropdown.classList.add('show');
      return;
    }

    const header = document.createElement('div');
    header.style.cssText = 'padding:6px 12px; font-size:11px; font-weight:700; color:var(--text-muted); border-bottom:1px solid var(--border-color);';
    header.textContent = `${results.length} SONUÇ BULUNDU:`;
    el.searchResultsDropdown.appendChild(header);

    results.forEach(res => {
      const item = document.createElement('div');
      item.className = 'search-result-item';

      const rawText = res.text || (res.image ? '[Görsel]' : '[Sesli Not]');
      const cleanQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const highlighted = escapeHtml(rawText).replace(
        new RegExp(`(${cleanQ})`, 'gi'),
        '<mark style="background:var(--brand); color:#fff; border-radius:2px; padding:0 2px;">$1</mark>'
      );

      const targetChanId = res.channelId || res.channel_id;
      const ch = (state.channels.text || []).find(c => c.id === targetChanId);
      const chName = res.channelName || (ch ? ch.name : targetChanId);
      const author = res.senderName || res.sender_name || 'Kullanıcı';
      const timeStr = res.time || (res.created_at ? new Date(res.created_at).toLocaleTimeString().slice(0, 5) : '');

      item.innerHTML = `
        <div class="search-result-header">
          <span class="search-result-author">${escapeHtml(author)}</span>
          <span class="search-result-channel">#${escapeHtml(chName)}</span>
          <span style="font-size:10px; color:var(--text-muted); margin-left:auto;">${timeStr}</span>
        </div>
        <div class="search-result-snippet">${highlighted}</div>
      `;

      item.addEventListener('click', () => {
        selectTextChannel(targetChanId, chName);
        el.searchResultsDropdown.classList.remove('show');
        el.inputSearchMessages.value = '';
      });

      el.searchResultsDropdown.appendChild(item);
    });

    el.searchResultsDropdown.classList.add('show');
  }

  // --- MÜZİK / RADYO & YOUTUBE BOTU SENKRONİZASYONU ---
  function setupMusicBot() {
    if (!el.btnCallMusicBot || !el.musicPlayerPopover) return;

    el.btnCallMusicBot.addEventListener('click', () => {
      el.musicPlayerPopover.classList.toggle('hidden');
    });

    el.btnCloseMusicPlayer.addEventListener('click', () => {
      el.musicPlayerPopover.classList.add('hidden');
    });

    if (el.selectRadioStation) {
      el.selectRadioStation.addEventListener('change', () => {
        const isCustom = el.selectRadioStation.value === 'custom';
        if (el.inputCustomMusicUrl) el.inputCustomMusicUrl.classList.toggle('hidden', !isCustom);
      });
    }

    if (el.btnToggleMusicPlay) {
      el.btnToggleMusicPlay.addEventListener('click', () => {
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Müzik botunu kullanmak için önce bir ses kanalına bağlanmalısınız!');
          return;
        }

        const isCurrentlyPlaying = state.musicState && state.musicState.isPlaying;
        const command = isCurrentlyPlaying ? 'pause' : 'play';
        let stationUrl = el.selectRadioStation.value;
        if (stationUrl === 'custom') {
          stationUrl = el.inputCustomMusicUrl ? el.inputCustomMusicUrl.value.trim() : '';
          if (!stationUrl && command === 'play') {
            showToast('⚠️ Lütfen geçerli bir YouTube veya radyo MP3 bağlantısı girin!');
            return;
          }
        }
        let selName = el.selectRadioStation.options[el.selectRadioStation.selectedIndex]?.text || 'Müzik';
        const ytId = extractYouTubeId(stationUrl);
        if (ytId) {
          selName = 'YouTube Müzik';
        }

        sendWs({
          type: 'music-bot-command',
          command: command,
          stationUrl: stationUrl,
          stationName: selName
        });
      });
    }

    if (el.musicBotVolume) {
      el.musicBotVolume.addEventListener('input', (e) => {
        const vol = parseInt(e.target.value, 10);
        state.musicState.volume = vol;
        if (state.musicAudio && !state.isDuckingActive) {
          state.musicAudio.volume = vol / 100;
        }
        sendMusicBotYtCommand('setVolume', [vol]);
        if (vol === 0) {
          sendMusicBotYtCommand('mute');
        } else {
          sendMusicBotYtCommand('unMute');
        }
      });
    }
  }

  function renderMusicBotCard(botState) {
    if (!el.participantGrid) return;
    let card = document.getElementById('card-music-bot');
    if (!botState || !botState.isPlaying || !state.activeVoiceRoomId) {
      if (card) card.remove();
      return;
    }

    if (!card) {
      card = document.createElement('div');
      card.id = 'card-music-bot';
      card.className = 'participant-card music-bot-card';
      el.participantGrid.appendChild(card);
    }

    const songTitle = botState.stationName || 'YouTube Müzik';
    const vol = el.musicBotVolume ? parseInt(el.musicBotVolume.value, 10) : 50;

    card.innerHTML = `
      <div class="participant-avatar-large" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;">
        <div class="music-disc-icon" style="width:64px; height:64px; font-size:28px;">
          <span>🎵</span>
        </div>
        <div class="audio-equalizer-bars" style="height:18px; gap:3px;">
          <span></span><span></span><span></span><span></span>
        </div>
      </div>
      <div class="card-bottom-bar" style="background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);">
        <div class="card-name-group" style="min-width:0; flex:1;">
          <span style="font-weight:700; color:var(--text-heading); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(songTitle)}">🤖 Müzik: ${escapeHtml(songTitle)}</span>
          <span class="gamer-badge" style="background:var(--brand); color:#fff; font-size:9px;">BOT</span>
        </div>
        <div class="card-controls">
          <div class="volume-slider-wrapper" title="Bot Ses Seviyesi">
            <input type="range" class="volume-slider" id="musicBotCardVolume" min="0" max="100" value="${vol}">
          </div>
          <button type="button" class="card-btn" id="btnStopMusicFromCard" title="Müziği Durdur" style="background:rgba(242,63,67,0.2); color:var(--red);">⏹️</button>
        </div>
      </div>
    `;

    const cardVol = card.querySelector('#musicBotCardVolume');
    if (cardVol) {
      cardVol.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (el.musicBotVolume) el.musicBotVolume.value = v;
        if (state.musicAudio) state.musicAudio.volume = v / 100;
        sendMusicBotYtCommand('setVolume', [v]);
      });
    }

    const btnStop = card.querySelector('#btnStopMusicFromCard');
    if (btnStop) {
      btnStop.addEventListener('click', () => {
        sendWs({ type: 'music-bot-command', command: 'pause' });
      });
    }
  }

  function stopMusicPlayback() {
    if (state.musicAudio) {
      try {
        state.musicAudio.pause();
        state.musicAudio.src = '';
      } catch (e) {}
    }
    if (el.bgRoomMusicYt) {
      el.bgRoomMusicYt.innerHTML = '';
      el.bgRoomMusicYt.removeAttribute('data-vid');
      el.bgRoomMusicYt.classList.add('hidden');
    }
    if (el.musicBotYtContainer) {
      el.musicBotYtContainer.classList.add('hidden');
      el.musicBotYtContainer.innerHTML = '';
      el.musicBotYtContainer.removeAttribute('data-vid');
    }
    renderMusicBotCard(null);
    renderChannelsList();
  }

  function handleMusicBotSync(botState) {
    if (!botState) return;
    state.musicState = botState;

    if (el.btnToggleMusicPlay) {
      el.btnToggleMusicPlay.textContent = botState.isPlaying ? '⏸ Müziği Durdur' : '▶ Odaya Müzik Başlat';
      el.btnToggleMusicPlay.classList.toggle('active-state', !!botState.isPlaying);
    }

    if (el.selectRadioStation && botState.stationUrl) {
      let found = false;
      for (const opt of el.selectRadioStation.options) {
        if (opt.value === botState.stationUrl) {
          el.selectRadioStation.value = botState.stationUrl;
          found = true;
          break;
        }
      }
      if (!found && el.inputCustomMusicUrl) {
        el.selectRadioStation.value = 'custom';
        el.inputCustomMusicUrl.value = botState.stationUrl;
        el.inputCustomMusicUrl.classList.remove('hidden');
      }
    }

    const ytId = extractYouTubeId(botState.stationUrl);

    if (state.activeVoiceRoomId && botState.isPlaying && botState.stationUrl) {
      const vol = el.musicBotVolume ? parseInt(el.musicBotVolume.value, 10) : 50;

      if (ytId) {
        // Stop any active radio stream
        if (state.musicAudio) {
          state.musicAudio.pause();
          state.musicAudio.src = '';
        }

        // 1. Audio-Only Visualizer Card in popover
        if (el.musicBotYtContainer) {
          el.musicBotYtContainer.classList.remove('hidden');
          el.musicBotYtContainer.setAttribute('data-vid', ytId);
          el.musicBotYtContainer.innerHTML = `
            <div class="music-audio-only-card">
              <div class="music-disc-icon">
                <span style="font-size:18px;">🎵</span>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:13px; color:var(--text-heading); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(botState.stationName || 'YouTube Müzik')}</div>
                <div style="font-size:11px; color:var(--brand-light); display:flex; align-items:center; gap:6px; margin-top:3px;">
                  <span class="audio-equalizer-bars">
                    <span></span><span></span><span></span><span></span>
                  </span>
                  <span>🎧 YouTube Canlı Müzik Çalıyor</span>
                </div>
              </div>
            </div>
          `;
        }

        // 2. Persistent visible floating dock for YouTube embed (prevents browser from throttling/pausing video)
        if (el.bgRoomMusicYt) {
          el.bgRoomMusicYt.classList.remove('hidden');
          if (el.bgRoomMusicYt.getAttribute('data-vid') !== ytId) {
            el.bgRoomMusicYt.setAttribute('data-vid', ytId);
            const ytSrc = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}`;
            el.bgRoomMusicYt.innerHTML = `
              <div class="music-dock-header">
                <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
                  <span>🤖</span>
                  <span style="overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(botState.stationName || 'YouTube Müzik')}">${escapeHtml(botState.stationName || 'YouTube Müzik')}</span>
                </span>
                <div style="display:flex; align-items:center; gap:4px;">
                  <button type="button" id="btnMinimizeMusicDock" title="Küçült / Büyüt" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:13px; padding:2px 4px; line-height:1;">−</button>
                  <button type="button" id="btnCloseMusicDock" title="Müziği Kapat" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:11px; padding:2px 4px; line-height:1;">⏹️</button>
                </div>
              </div>
              <div class="music-dock-body">
                <iframe id="bgMusicYtFrame" src="${ytSrc}" title="Music Bot Player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
              </div>
            `;
            const btnMin = el.bgRoomMusicYt.querySelector('#btnMinimizeMusicDock');
            if (btnMin) {
              btnMin.addEventListener('click', () => {
                const isMin = el.bgRoomMusicYt.classList.toggle('minimized');
                btnMin.textContent = isMin ? '□' : '−';
              });
            }
            const btnClose = el.bgRoomMusicYt.querySelector('#btnCloseMusicDock');
            if (btnClose) {
              btnClose.addEventListener('click', () => {
                sendWs({ type: 'music-bot-command', command: 'pause' });
              });
            }
          }
        }
        renderMusicBotCard(botState);
        renderChannelsList();
        showToast(`🎵 Müzik Çalıyor: ${botState.stationName || 'YouTube Müzik'}`);
      } else {
        // Radio MP3 stream
        if (el.musicBotYtContainer) {
          el.musicBotYtContainer.classList.remove('hidden');
          el.musicBotYtContainer.innerHTML = `
            <div class="music-audio-only-card">
              <div class="music-disc-icon">
                <span style="font-size:18px;">📻</span>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:13px; color:var(--text-heading); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(botState.stationName || 'Canlı Radyo')}</div>
                <div style="font-size:11px; color:var(--brand-light); display:flex; align-items:center; gap:6px; margin-top:3px;">
                  <span class="audio-equalizer-bars">
                    <span></span><span></span><span></span><span></span>
                  </span>
                  <span>🎧 Canlı Radyo Akışı</span>
                </div>
              </div>
            </div>
          `;
        }
        if (el.bgRoomMusicYt) {
          el.bgRoomMusicYt.innerHTML = '';
          el.bgRoomMusicYt.removeAttribute('data-vid');
          el.bgRoomMusicYt.classList.add('hidden');
        }

        if (state.musicAudio.src !== botState.stationUrl) {
          state.musicAudio.src = botState.stationUrl;
        }
        state.musicAudio.volume = vol / 100;
        state.musicAudio.play().catch(e => {
          console.warn('[MusicBot Play Warning]:', e);
        });
        renderMusicBotCard(botState);
        renderChannelsList();
        showToast(`🎵 Çalıyor: ${botState.stationName || 'Radyo'}`);
      }
    } else {
      stopMusicPlayback();
    }
  }

  // --- OYUN SUNUCUSU WEBHOOK ENTEGRASYONU ---
  function updateWebhookSettingsUI() {
    if (!el.selectWebhookChannel) return;
    el.selectWebhookChannel.innerHTML = '';

    (state.channels.text || []).forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = `# ${ch.name}`;
      el.selectWebhookChannel.appendChild(opt);
    });

    updateWebhookCodeBox();
  }

  function updateWebhookCodeBox() {
    const chId = el.selectWebhookChannel ? el.selectWebhookChannel.value : 'text-genel';
    const proto = window.location.protocol;
    const host = state.serverHost;
    const secret = state.serverSettings?.webhookSecret || '';
    const url = `${proto}//${host}/api/webhook/${chId}${secret ? `?token=${encodeURIComponent(secret)}` : ''}`;

    if (el.lblWebhookUrl) el.lblWebhookUrl.textContent = url;
    if (el.codeWebhookSnippet) {
      const headerSnippet = secret ? ` -H "X-Webhook-Secret: ${secret}"` : '';
      el.codeWebhookSnippet.textContent = `curl -X POST "${url}"${headerSnippet} -H "Content-Type: application/json" -d '{"content":"🎮 CS2 Turnuvası Başladı!","username":"Oyun Botu"}'`;
    }
  }

  // --- NAVIGATION: TEXT, DM, VOICE ---
  function selectTextChannel(channelId, channelName, password = null) {
    state.activeViewType = 'text';
    state.activeChannelId = channelId;
    state.activeChannelName = channelName;

    el.headerPrefix.textContent = '#';
    el.lblActiveChannelName.textContent = channelName;

    el.textChatView.classList.remove('hidden');
    el.voiceArena.classList.add('hidden');

    if (el.dmCallActions) el.dmCallActions.classList.add('hidden');
    if (el.btnChannelNotifSettings) el.btnChannelNotifSettings.classList.remove('hidden');
    updateChannelNotifIcon(channelId);

    // Reset typing bar on channel change
    state.typingUsers.clear();
    updateTypingBarUI();

    if (el.channelList) {
      const elChan = el.channelList.querySelector(`[data-channel-id="${channelId}"]`);
      if (elChan) elChan.classList.remove('unread');
    }

    renderChannelsList();
    requestTextHistory(channelId, password);
  }

  function requestTextHistory(channelId, password = null) {
    sendWs({ type: 'get-text-history', channelId: channelId, password: password });
  }

  function loadMoreMessages() {
    if (state.isLoadingMoreMessages || !state.hasMoreMessages || state.currentMessages.length === 0) return;
    const oldest = state.currentMessages[0];
    const beforeCreatedAt = oldest.createdAt || oldest.created_at;
    if (!beforeCreatedAt) return;

    state.isLoadingMoreMessages = true;
    const btn = el.textChatMessages.querySelector('.load-more-messages-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Yükleniyor...';
    }

    if (state.activeViewType === 'dm') {
      sendWs({
        type: 'get-dm-history',
        targetUserId: state.activeDmUserId,
        beforeCreatedAt: beforeCreatedAt
      });
    } else {
      sendWs({
        type: 'get-text-history',
        channelId: state.activeChannelId,
        beforeCreatedAt: beforeCreatedAt
      });
    }
  }

  function openDmChat(userId, userName) {
    state.activeViewType = 'dm';
    state.activeDmUserId = userId;
    state.activeDmUserName = userName;

    if (state.dms.has(userId)) state.dms.get(userId).unread = 0;

    el.headerPrefix.textContent = '@';
    el.lblActiveChannelName.textContent = userName;

    el.textChatView.classList.remove('hidden');
    el.voiceArena.classList.add('hidden');

    if (el.dmCallActions) el.dmCallActions.classList.remove('hidden');
    if (el.btnChannelNotifSettings) el.btnChannelNotifSettings.classList.add('hidden');

    // Reset typing bar on DM change
    state.typingUsers.clear();
    updateTypingBarUI();

    renderChannelsList();
    sendWs({ type: 'get-dm-history', targetUserId: userId });
  }

  async function joinVoiceChannel(roomId, roomName, password = null, force = false) {
    if (state.activeVoiceRoomId === roomId && !force) {
      state.activeViewType = 'voice';
      el.textChatView.classList.add('hidden');
      el.voiceArena.classList.remove('hidden');
      el.headerPrefix.textContent = '🔊';
      el.lblActiveChannelName.textContent = roomName;
      return;
    }

    // Kill any active Watch Party from previous room
    closeWatchPartyPlayer();

    try {
      const micStream = await state.audioManager.getMicrophoneStream();
      state.webrtc.setLocalStream(micStream);
    } catch (e) {
      console.warn('Mikrofon başlatılamadı:', e);
      showToast('⚠️ Mikrofon erişilemedi! Lütfen tarayıcı izinlerini kontrol edin.', 4000);
    }

    sendWs({
      type: 'join-voice',
      channelId: roomId,
      password: password,
      muted: state.isMicMuted,
      deafened: state.isDeafened,
      camera: state.isCameraOn,
      screen: state.isScreenSharing
    });
  }

  function leaveCurrentVoice() {
    sendWs({ type: 'leave-voice' });
    state.activeVoiceRoomId = null;
    state.activeVoiceRoomName = null;
    const me = state.serverMembers.find(m => m.id === state.selfId);
    if (me) me.voiceRoomId = null;
    renderChannelsList();

    // 1. Kill active Watch Party immediately
    closeWatchPartyPlayer();

    // 2. Stop screen share stream if active
    if (state.screenManager && state.screenManager.isSharing) {
      state.screenManager.stopShare();
    }
    state.isScreenSharing = false;
    if (el.badgeScreenSelf) el.badgeScreenSelf.classList.add('hidden');
    if (el.btnCallScreen) el.btnCallScreen.classList.remove('active-state');
    if (el.lblBtnScreen) el.lblBtnScreen.textContent = 'Ekranı Paylaş';

    // 3. Stop camera hardware stream if active
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      state.cameraStream = null;
    }
    state.isCameraOn = false;
    if (el.videoSelf) el.videoSelf.srcObject = null;
    if (el.cardSelf) {
      el.cardSelf.classList.remove('has-video', 'screen-card');
    }
    if (el.btnCallCamera) el.btnCallCamera.classList.remove('active-state');
    if (el.lblBtnCamera) el.lblBtnCamera.textContent = 'Kamera';

    // 4. Release microphone hardware so browser mic indicator turns off
    if (state.audioManager) {
      state.audioManager.stopMicrophone();
    }

    el.activeVoiceBar.classList.add('hidden');
    el.btnToggleVoiceView.classList.add('hidden');
    el.soundboardPopover.classList.add('hidden');
    el.musicPlayerPopover.classList.add('hidden');

    stopMusicPlayback();

    state.webrtc.closeAllPeers();
    clearAllRemoteCards();
    state.peers.clear();
    clearMiniPipSpeakers();

    el.textChatView.classList.remove('hidden');
    el.voiceArena.classList.add('hidden');
    el.headerPrefix.textContent = '#';
    el.lblActiveChannelName.textContent = state.activeChannelName;

    state.audioManager?.playChime('leave');
    showToast('Ses kanalından ayrıldınız.');

    // Release mobile screen wake lock & audio keep-alive if no direct call active
    if (!state.activeDirectCall) {
      releaseScreenWakeLock();
      stopMobileAudioKeepAlive();
    }
  }

  // --- TEXT CHAT & MESSAGE RENDERING ---
  function renderTextMessages(messages, preserveScroll = false) {
    el.textChatMessages.innerHTML = '';
    if (!messages || messages.length === 0) {
      el.textChatMessages.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          <p>Burası oldukça sessiz... İlk mesajı sen gönder!</p>
        </div>
      `;
      return;
    }

    if (state.hasMoreMessages) {
      const loadWrap = document.createElement('div');
      loadWrap.className = 'load-more-messages-wrap';
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'load-more-messages-btn';
      loadBtn.textContent = '⬆ Daha Eski Mesajları Yükle';
      loadBtn.addEventListener('click', loadMoreMessages);
      loadWrap.appendChild(loadBtn);
      el.textChatMessages.appendChild(loadWrap);
    }

    messages.forEach(msg => appendMessageBubble(msg, false));
    if (!preserveScroll) {
      el.textChatMessages.scrollTop = el.textChatMessages.scrollHeight;
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function buildPollCardHtml(messageId, poll) {
    if (!poll || !poll.options) return '';
    const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
    const isTrivia = !!poll.isTrivia;

    let optionsHtml = '';
    poll.options.forEach((opt, idx) => {
      const votesCount = opt.votes ? opt.votes.length : 0;
      const pct = totalVotes > 0 ? Math.round((votesCount / totalVotes) * 100) : 0;
      const hasVoted = (opt.votes && opt.votes.includes(state.selfId)) || (poll.userVotes && poll.userVotes[state.selfId] === idx);
      const clickAction = isTrivia ? `answerTrivia('${messageId}', ${idx})` : `votePoll('${messageId}', ${idx})`;

      optionsHtml += `
        <div class="poll-option ${hasVoted ? 'voted' : ''}" onclick="${clickAction}">
          <div class="poll-option-fill" style="width: ${pct}%"></div>
          <div class="poll-option-inner">
            <span class="poll-option-text">${escapeHtml(opt.text)}</span>
            <span class="poll-option-count">${votesCount} oy (%${pct})</span>
          </div>
        </div>
      `;
    });

    const titlePrefix = isTrivia ? `🧠 [${escapeHtml(poll.category || 'Gamer')}] TRIVIA: ` : `📊 `;
    const footerText = isTrivia ? 'Cevabını tıkla ve puanı kap! (20 saniye)' : `Toplam ${totalVotes} oy kullanıldı`;

    return `
      <div class="poll-card ${isTrivia ? 'trivia-card' : ''}" id="poll-${messageId}">
        <div class="poll-title">${titlePrefix}${escapeHtml(poll.question)}</div>
        <div class="poll-options">${optionsHtml}</div>
        <div class="poll-total-votes">${footerText}</div>
      </div>
    `;
  }

  window.openChatImage = (imgEl) => {
    if (!imgEl) return;
    const url = imgEl.getAttribute('data-full-image');
    if (url && (url.startsWith('http') || url.startsWith('/uploads/') || url.startsWith('data:image/'))) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  window.votePoll = (messageId, optionIndex) => {
    sendWs({
      type: 'vote-poll',
      messageId: messageId,
      optionIndex: optionIndex
    });
  };

  window.answerTrivia = (messageId, optionIndex) => {
    sendWs({
      type: 'trivia-answer',
      messageId: messageId,
      optionIndex: optionIndex
    });
  };

  function updatePollUI(messageId, poll) {
    const pollContainer = document.getElementById(`poll-${messageId}`);
    if (pollContainer) {
      pollContainer.outerHTML = buildPollCardHtml(messageId, poll);
    }
  }

  window.scrollToMessage = (messageId) => {
    const elMsg = document.getElementById(`msg-${messageId}`);
    if (elMsg) {
      elMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elMsg.style.transition = 'background-color 0.4s ease';
      elMsg.style.backgroundColor = 'rgba(88, 101, 242, 0.25)';
      setTimeout(() => {
        elMsg.style.backgroundColor = '';
      }, 1500);
    } else {
      showToast('⚠️ Yanıtlanan mesaj bu kanalda daha yukarıda veya silinmiş.');
    }
  };

  window.startReplyMessage = (messageId) => {
    const msg = state.currentMessages.find(m => m.id === messageId);
    if (!msg) return;

    state.replyingTo = {
      id: msg.id,
      senderName: msg.senderName,
      text: (msg.text || (msg.image ? '[Görsel]' : msg.fileUrl ? `[Dosya: ${msg.fileName}]` : '[Sesli Not]')).slice(0, 100)
    };

    if (el.replyTargetName) el.replyTargetName.textContent = msg.senderName;
    if (el.replySnippet) el.replySnippet.textContent = state.replyingTo.text;
    if (el.chatReplyBar) el.chatReplyBar.classList.remove('hidden');

    el.chatTextarea.focus();
  };

  window.cancelReply = () => {
    state.replyingTo = null;
    if (el.chatReplyBar) el.chatReplyBar.classList.add('hidden');
  };

  function setupReplies() {
    if (el.btnCancelReply) {
      el.btnCancelReply.addEventListener('click', () => {
        window.cancelReply();
      });
    }
  }

  // Voice Note Playback State & Audio Cache
  const voiceNoteAudioMap = new Map();
  let currentVoiceNote = null; // { msgId, audio, btn, durationEl, progress, card, totalDuration }

  function appendMessageBubble(msg, shouldScroll = true) {
    const empty = el.textChatMessages.querySelector('.empty-state');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'chat-message-row' + (msg.isPinned ? ' is-pinned' : '');
    row.id = `msg-${msg.id}`;

    // Mention check
    const isMentioned = msg.text && (
      msg.text.includes(`@${state.username}`) ||
      msg.text.includes('@everyone') ||
      msg.text.includes('@hepsi') ||
      msg.text.includes('@burada')
    );
    if (isMentioned) {
      row.classList.add('is-mention');
    }

    // Avatar
    const avatarVal = msg.senderAvatar || msg.avatarUrl;
    let avatarHtml = '';
    if (avatarVal) {
      if (avatarVal.startsWith('http') || avatarVal.startsWith('data:image/') || avatarVal.startsWith('/')) {
        avatarHtml = `<img src="${escapeHtml(avatarVal)}" class="chat-msg-avatar" style="object-fit:cover;" onerror="this.outerHTML='<div class=\\'chat-msg-avatar\\'>${escapeHtml((msg.senderName || 'O').charAt(0).toUpperCase())}</div>'">`;
      } else {
        avatarHtml = `<div class="chat-msg-avatar" style="font-size:18px;">${escapeHtml(avatarVal)}</div>`;
      }
    } else {
      const initial = (msg.senderName || 'O').charAt(0).toUpperCase();
      avatarHtml = `<div class="chat-msg-avatar">${escapeHtml(initial)}</div>`;
    }

    // Gamer Badge
    const badgeVal = msg.senderBadge || msg.badge;
    const badgeHtml = badgeVal ? `<span class="gamer-badge" title="Gamer Rozeti">${escapeHtml(badgeVal)}</span>` : '';

    const roleClass = 'role-' + (msg.senderRole || 'member');
    const safeImage = (msg.image && (msg.image.startsWith('http') || msg.image.startsWith('/uploads/') || msg.image.startsWith('data:image/'))) ? escapeHtml(msg.image) : '';
    const imageTag = safeImage ? `<img src="${safeImage}" class="chat-msg-image" data-full-image="${safeImage}" onclick="window.openChatImage(this)">` : '';

    const cleanMsgId = String(msg.id).replace(/[^a-zA-Z0-9_-]/g, '');

    let voiceNoteTag = '';
    if (msg.audioNote) {
      voiceNoteAudioMap.set(cleanMsgId, msg.audioNote);
      voiceNoteTag = `
        <div class="voice-note-card" id="voice-note-card-${cleanMsgId}">
          <button type="button" class="btn-play-voice-note" id="btn-vn-play-${cleanMsgId}" onclick="window.toggleVoiceNote('${cleanMsgId}')" title="Oynat / Duraklat">▶</button>
          <div class="voice-note-waveform" id="vn-waveform-${cleanMsgId}">
            <div class="waveform-progress" id="vn-progress-${cleanMsgId}"></div>
            <div class="waveform-bar" style="height:40%"></div>
            <div class="waveform-bar" style="height:80%"></div>
            <div class="waveform-bar" style="height:100%"></div>
            <div class="waveform-bar" style="height:60%"></div>
            <div class="waveform-bar" style="height:90%"></div>
            <div class="waveform-bar" style="height:50%"></div>
            <div class="waveform-bar" style="height:75%"></div>
            <div class="waveform-bar" style="height:45%"></div>
          </div>
          <span class="voice-note-duration" id="vn-duration-${cleanMsgId}">0:00</span>
        </div>
      `;
    }

    // Reply Quote Box
    let replyQuoteTag = '';
    if (msg.replyTo) {
      const rTo = typeof msg.replyTo === 'string' ? JSON.parse(msg.replyTo) : msg.replyTo;
      if (rTo && rTo.id) {
        const cleanReplyId = String(rTo.id).replace(/[^a-zA-Z0-9_-]/g, '');
        replyQuoteTag = `
          <div class="chat-reply-quote" onclick="scrollToMessage('${cleanReplyId}')">
            <span class="reply-sender">↳ ${escapeHtml(rTo.senderName || 'Biri')}:</span>
            <span class="reply-text-snippet">${escapeHtml((rTo.text || '[Medya/Dosya]').slice(0, 80))}</span>
          </div>
        `;
      }
    }

    // File Attachment Card (.cfg, .zip, .pdf, .txt, etc.)
    let fileAttachmentTag = '';
    if (msg.fileUrl) {
      const safeFileUrl = (msg.fileUrl.startsWith('http') || msg.fileUrl.startsWith('/uploads/')) ? escapeHtml(msg.fileUrl) : '#';
      fileAttachmentTag = `
        <div class="file-attachment-card">
          <div class="file-icon">📁</div>
          <div class="file-info">
            <a href="${safeFileUrl}" download="${escapeHtml(msg.fileName || 'dosya')}" class="file-name" target="_blank" rel="noopener noreferrer">${escapeHtml(msg.fileName || 'Dosya')}</a>
            <span class="file-size">${formatBytes(msg.fileSize || 0)}</span>
          </div>
          <a href="${safeFileUrl}" download="${escapeHtml(msg.fileName || 'dosya')}" class="btn-download-file" title="İndir" target="_blank" rel="noopener noreferrer">⬇</a>
        </div>
      `;
    }

    // Poll Card
    let pollTag = '';
    if (msg.poll) {
      const pollObj = typeof msg.poll === 'string' ? JSON.parse(msg.poll) : msg.poll;
      pollTag = buildPollCardHtml(msg.id, pollObj);
    }

    const isOwn = (msg.senderId === state.selfId);
    const canDelete = isOwn || state.myRole === 'admin' || state.myRole === 'mod';
    const canEdit = isOwn && !!msg.text;

    const editBtn = canEdit ? `<button class="msg-action-btn" onclick="startEditMessage('${msg.id}')" title="Düzenle">✏️</button>` : '';
    const deleteBtn = canDelete ? `<button class="msg-action-btn delete" onclick="confirmDeleteMessage('${msg.id}')" title="Sil">🗑️</button>` : '';
    const editedTag = msg.isEdited ? `<span class="edited-tag" id="edited-${msg.id}">(düzenlendi)</span>` : `<span class="edited-tag hidden" id="edited-${msg.id}">(düzenlendi)</span>`;

    const threadCount = msg.threadCount ?? msg.thread_count ?? 0;
    const threadBadgeHtml = (threadCount > 0) ? `
      <div class="thread-badge-link" id="thread-badge-${msg.id}" onclick="openThreadForMessage('${msg.id}')">
        <span>🗂️ ${threadCount} yanıt</span>
        <span style="font-size:11px; color:var(--text-muted); margin-left:auto;">Konuyu görüntüle ➔</span>
      </div>
    ` : `
      <div class="thread-badge-link hidden" id="thread-badge-${msg.id}" onclick="openThreadForMessage('${msg.id}')">
        <span>🗂️ 0 yanıt</span>
        <span style="font-size:11px; color:var(--text-muted); margin-left:auto;">Konuyu görüntüle ➔</span>
      </div>
    `;

    row.innerHTML = `
      <div class="msg-hover-actions">
        <button class="msg-action-btn" onclick="openThreadForMessage('${msg.id}')" title="Konu Başlat / Yanıtlar (Thread)">🗂️</button>
        <button class="msg-action-btn" onclick="startReplyMessage('${msg.id}')" title="Yanıtla">💬</button>
        <button class="msg-action-btn" onclick="toggleReaction('${msg.id}', '👍')">👍</button>
        <button class="msg-action-btn" onclick="toggleReaction('${msg.id}', '❤️')">❤️</button>
        <button class="msg-action-btn" onclick="toggleReaction('${msg.id}', '😂')">😂</button>
        <button class="msg-action-btn" onclick="toggleReaction('${msg.id}', '🔥')">🔥</button>
        <button class="msg-action-btn" onclick="toggleReaction('${msg.id}', '🎮')">🎮</button>
        ${editBtn}
        <button class="msg-action-btn" onclick="togglePinMessage('${msg.id}')" title="Sabitle">📌</button>
        ${deleteBtn}
      </div>

      ${avatarHtml}
      <div class="chat-msg-content" id="msg-content-${msg.id}">
        <div class="chat-msg-meta">
          <span class="${roleClass}">${escapeHtml(msg.senderName)}</span>
          ${badgeHtml}
          <span class="role-tag ${roleClass}">${(msg.senderRole || 'Üye').toUpperCase()}</span>
          <span class="chat-msg-time">${msg.time || ''}</span>
          ${editedTag}
        </div>
        ${replyQuoteTag}
        ${msg.text ? `<div class="chat-msg-text" id="msg-text-${msg.id}">${formatMessageText(msg.text)}</div>` : ''}
        ${imageTag}
        ${fileAttachmentTag}
        ${voiceNoteTag}
        ${pollTag}
        <div class="reactions-row" id="reactions-${msg.id}"></div>
        ${threadBadgeHtml}
      </div>
    `;

    el.textChatMessages.appendChild(row);
    if (msg.reactions) updateMessageReactionsUI(msg.id, msg.reactions);
    if (shouldScroll) {
      el.textChatMessages.scrollTop = el.textChatMessages.scrollHeight;
    }
  }

  // --- MESSAGE EDITING & DELETING CLIENT ACTIONS ---
  window.startEditMessage = (messageId) => {
    const textEl = document.getElementById(`msg-text-${messageId}`);
    if (!textEl) return;
    if (document.getElementById(`edit-box-${messageId}`)) return;

    const currentMsg = state.currentMessages.find(m => m.id === messageId);
    const rawText = currentMsg ? currentMsg.text : textEl.innerText;

    textEl.style.display = 'none';

    const editBox = document.createElement('div');
    editBox.className = 'chat-edit-box';
    editBox.id = `edit-box-${messageId}`;
    editBox.innerHTML = `
      <textarea class="chat-edit-textarea" id="edit-textarea-${messageId}" rows="2"></textarea>
      <div class="chat-edit-actions">
        <span>Enter: <b>Kaydet</b> | Esc: <b>İptal</b></span>
        <button class="card-btn btn-primary" style="padding: 3px 12px; font-size:11px; margin-left:auto;" onclick="saveEditMessage('${messageId}')">Kaydet</button>
        <button class="card-btn" style="padding: 3px 10px; font-size:11px;" onclick="cancelEditMessage('${messageId}')">İptal</button>
      </div>
    `;

    textEl.parentNode.insertBefore(editBox, textEl.nextSibling);

    const textarea = document.getElementById(`edit-textarea-${messageId}`);
    textarea.value = rawText;
    textarea.focus();
    textarea.setSelectionRange(rawText.length, rawText.length);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEditMessage(messageId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEditMessage(messageId);
      }
    });
  };

  window.cancelEditMessage = (messageId) => {
    const editBox = document.getElementById(`edit-box-${messageId}`);
    if (editBox) editBox.remove();
    const textEl = document.getElementById(`msg-text-${messageId}`);
    if (textEl) textEl.style.display = '';
  };

  window.saveEditMessage = (messageId) => {
    const textarea = document.getElementById(`edit-textarea-${messageId}`);
    if (!textarea) return;
    const newText = textarea.value.trim();
    if (!newText) {
      showToast('⚠️ Mesaj boş bırakılamaz! Silmek istiyorsanız çöp kutusu simgesini kullanın.');
      return;
    }

    const isDm = state.activeViewType === 'dm';
    sendWs({
      type: 'edit-message',
      messageId: messageId,
      newText: newText,
      isDm: isDm,
      targetUserId: state.activeDmUserId
    });

    cancelEditMessage(messageId);
  };

  window.confirmDeleteMessage = (messageId) => {
    const msg = state.currentMessages.find(m => m.id === messageId);
    let promptTitle = 'Bu mesajı silmek istediğinize emin misiniz?';
    if (msg && msg.audioNote) {
      promptTitle = 'Bu sesli mesajı sunucudan ve sohbetten kalıcı olarak silmek istiyor musunuz?';
    } else if (msg && msg.image) {
      promptTitle = 'Bu görseli ve mesajı sunucudan kalıcı olarak silmek istiyor musunuz?';
    } else if (msg && msg.fileUrl) {
      promptTitle = 'Bu dosyayı ve mesajı sunucudan kalıcı olarak silmek istiyor musunuz?';
    }

    if (!confirm(promptTitle)) return;

    const isDm = state.activeViewType === 'dm';
    sendWs({
      type: 'delete-message',
      messageId: messageId,
      isDm: isDm,
      targetUserId: state.activeDmUserId
    });
  };

  function formatAudioTime(seconds) {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  window.toggleVoiceNote = (msgId) => {
    const audioUrl = voiceNoteAudioMap.get(msgId);
    if (!audioUrl) return;

    const playBtn = document.getElementById(`btn-vn-play-${msgId}`);
    const durationEl = document.getElementById(`vn-duration-${msgId}`);
    const progressEl = document.getElementById(`vn-progress-${msgId}`);
    const cardEl = document.getElementById(`voice-note-card-${msgId}`);

    // If currently playing the same voice note: pause / resume toggle
    if (currentVoiceNote && currentVoiceNote.msgId === msgId) {
      if (currentVoiceNote.audio.paused) {
        currentVoiceNote.audio.play().then(() => {
          if (playBtn) playBtn.textContent = '⏸';
          if (cardEl) cardEl.classList.add('playing');
        }).catch(console.warn);
      } else {
        currentVoiceNote.audio.pause();
        if (playBtn) playBtn.textContent = '▶';
        if (cardEl) cardEl.classList.remove('playing');
      }
      return;
    }

    // If another voice note was already playing, stop and reset it cleanly
    if (currentVoiceNote) {
      try {
        currentVoiceNote.audio.pause();
        currentVoiceNote.audio.currentTime = 0;
      } catch (e) {}
      if (currentVoiceNote.btn) currentVoiceNote.btn.textContent = '▶';
      if (currentVoiceNote.card) currentVoiceNote.card.classList.remove('playing');
      if (currentVoiceNote.progress) currentVoiceNote.progress.style.width = '0%';
      if (currentVoiceNote.durationEl && currentVoiceNote.totalDuration) {
        currentVoiceNote.durationEl.textContent = formatAudioTime(currentVoiceNote.totalDuration);
      }
      currentVoiceNote = null;
    }

    // Create and track the new audio instance
    const audio = new Audio(audioUrl);
    const vnState = {
      msgId: msgId,
      audio: audio,
      btn: playBtn,
      durationEl: durationEl,
      progress: progressEl,
      card: cardEl,
      totalDuration: 0
    };
    currentVoiceNote = vnState;

    audio.addEventListener('loadedmetadata', () => {
      vnState.totalDuration = audio.duration;
      if (durationEl) durationEl.textContent = `0:00 / ${formatAudioTime(audio.duration)}`;
    });

    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime;
      const dur = audio.duration || vnState.totalDuration || 0;
      if (dur > 0) {
        if (durationEl) durationEl.textContent = `${formatAudioTime(cur)} / ${formatAudioTime(dur)}`;
        if (progressEl) {
          const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
          progressEl.style.width = `${pct}%`;
        }
      } else {
        if (durationEl) durationEl.textContent = formatAudioTime(cur);
      }
    });

    audio.addEventListener('ended', () => {
      if (playBtn) playBtn.textContent = '▶';
      if (cardEl) cardEl.classList.remove('playing');
      if (progressEl) progressEl.style.width = '0%';
      if (durationEl && vnState.totalDuration) {
        durationEl.textContent = formatAudioTime(vnState.totalDuration);
      }
      currentVoiceNote = null;
    });

    audio.play().then(() => {
      if (playBtn) playBtn.textContent = '⏸';
      if (cardEl) cardEl.classList.add('playing');
    }).catch(err => {
      console.warn('[VoiceNote Play Warning]:', err);
      if (playBtn) playBtn.textContent = '▶';
      if (cardEl) cardEl.classList.remove('playing');
    });
  };

  window.playVoiceNoteAudio = (msgId, dataUrl) => {
    if (dataUrl && !voiceNoteAudioMap.has(msgId)) {
      voiceNoteAudioMap.set(msgId, dataUrl);
    }
    window.toggleVoiceNote(msgId);
  };

  window.toggleReaction = (messageId, emoji) => {
    const isDm = state.activeViewType === 'dm';
    sendWs({
      type: 'toggle-reaction',
      channelId: state.activeChannelId,
      messageId: messageId,
      emoji: emoji,
      isDm: isDm,
      targetUserId: state.activeDmUserId
    });
  };

  window.togglePinMessage = (messageId) => {
    const isDm = state.activeViewType === 'dm';
    sendWs({
      type: 'toggle-pin-message',
      channelId: state.activeChannelId,
      messageId: messageId,
      isDm: isDm,
      targetUserId: state.activeDmUserId
    });
  };

  function updateMessageReactionsUI(messageId, reactions) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;
    container.innerHTML = '';

    for (const [emoji, users] of Object.entries(reactions || {})) {
      if (!users || users.length === 0) continue;
      const pill = document.createElement('div');
      pill.className = 'reaction-pill' + (users.includes(state.selfId) ? ' reacted' : '');
      pill.innerHTML = `<span>${emoji}</span><span class="reaction-count">${users.length}</span>`;
      pill.onclick = () => window.toggleReaction(messageId, emoji);
      container.appendChild(pill);
    }
  }

  function sendChatMessage(audioDataUrl = null) {
    let text = el.chatTextarea.value.trim();
    const image = state.attachedImageBase64;
    const attachedFile = state.attachedFile;
    const replyTo = state.replyingTo;

    // Check Mini Chat Bot commands if there is no audio note
    let pollData = null;
    if (!audioDataUrl && text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/zar') {
        const sides = parseInt(parts[1] || '6', 10);
        const max = isNaN(sides) || sides <= 0 ? 6 : sides;
        const res = Math.floor(Math.random() * max) + 1;
        text = `🎲 [ZAR BOTU]: d${max} zarı attı ve **${res}** geldi!`;
      } else if (cmd === '/yazitura' || cmd === '/yazıtura') {
        const coin = Math.random() < 0.5 ? 'YAZI 🪙' : 'TURA 🪙';
        text = `🪙 [ŞANS BOTU]: Yazı-Tura attı: Sonuç **${coin}**!`;
      } else if (cmd === '/anket') {
        // Syntax: /anket "Soru?" "Seçenek 1" "Seçenek 2" ...
        const rawAfterCmd = text.substring(6).trim();
        const matches = [...rawAfterCmd.matchAll(/"([^"]+)"/g)].map(m => m[1]);
        if (matches.length >= 3) {
          const question = matches[0];
          const options = matches.slice(1).map(opt => ({ text: opt, votes: [] }));
          pollData = { question, options };
          text = `📊 Yeni Anket: **${question}**`;
        } else {
          showToast('⚠️ Anket Formatı: /anket "Soru" "Seçenek 1" "Seçenek 2"');
          return;
        }
      } else if (cmd === '/play' || cmd === '/çal') {
        const query = parts.slice(1).join(' ').trim();
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Müzik çalmak için önce bir ses kanalına bağlanmalısınız.');
          el.chatTextarea.value = '';
          return;
        }
        if (!query) {
          showToast('⚠️ Kullanım: /play <YouTube / YT Music linki veya radyo adı>');
          el.chatTextarea.value = '';
          return;
        }

        const RADIO_MAP = {
          'power': { name: 'Power FM', url: 'https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio' },
          'powerturk': { name: 'Power Türk', url: 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio' },
          'fenomen': { name: 'Radyo Fenomen', url: 'https://stream.radyofenomen.com/fenomen/mpeg/icecast.audio' },
          'slowturk': { name: 'Slow Türk', url: 'https://radyo.duhnet.tv/slowturk' },
          'metro': { name: 'Metro FM', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/METRO_FMAAC.aac' },
          'virgin': { name: 'Virgin Radio', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/VIRGIN_RADIOAAC.aac' },
          'joyturk': { name: 'Joy Türk', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_TURKAAC.aac' },
          'super': { name: 'Süper FM', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUPER_FMAAC.aac' },
          'alem': { name: 'Alem FM', url: 'https://turkmedya.radyotvonline.net/alemfmaac' },
          'radyod': { name: 'Radyo D', url: 'https://radyo.duhnet.tv/radyod' },
          'powerpop': { name: 'Power Pop', url: 'https://listen.powerapp.com.tr/powerpop/mpeg/icecast.audio' },
          'powerlove': { name: 'Power Love', url: 'https://listen.powerapp.com.tr/powerlove/mpeg/icecast.audio' },
          'nightride': { name: 'Nightride FM (Synthwave)', url: 'https://stream.nightride.fm/nightride.mp3' },
          'synthwave': { name: 'Nightride FM (Synthwave)', url: 'https://stream.nightride.fm/nightride.mp3' },
          'lofi': { name: 'Nightride FM (Chill/Synth)', url: 'https://stream.nightride.fm/nightride.mp3' },
          'paradise': { name: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-128' },
          'kral': { name: 'Power Türk (Kral Alternatifi)', url: 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio' }
        };

        const qLower = query.toLowerCase();
        let targetUrl = '';
        let targetName = '';

        if (RADIO_MAP[qLower]) {
          targetUrl = RADIO_MAP[qLower].url;
          targetName = RADIO_MAP[qLower].name;
        } else {
          const ytId = extractYouTubeId(query);
          if (ytId) {
            targetUrl = `https://www.youtube.com/watch?v=${ytId}`;
            targetName = query.includes('music.youtube.com') ? 'YouTube Müzik' : 'YouTube Parça';
          } else if (query.startsWith('http')) {
            targetUrl = query;
            targetName = 'Özel Akış';
          } else {
            const foundKey = Object.keys(RADIO_MAP).find(k => k.includes(qLower) || RADIO_MAP[k].name.toLowerCase().includes(qLower));
            if (foundKey) {
              targetUrl = RADIO_MAP[foundKey].url;
              targetName = RADIO_MAP[foundKey].name;
            } else {
              showToast('⚠️ Geçerli bir YouTube / YT Music linki veya radyo adı girin (Örn: /play power, /play slowturk, /play <link>)');
              el.chatTextarea.value = '';
              return;
            }
          }
        }

        sendWs({
          type: 'music-bot-command',
          command: 'play',
          stationUrl: targetUrl,
          stationName: targetName
        });

        text = `🤖 [MÜZİK BOTU]: 🎵 **${targetName}** çalınıyor! *(İsteyen: @${state.username})*`;
      } else if (cmd === '/stop' || cmd === '/dur') {
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Bir ses odasında değilsiniz.');
          el.chatTextarea.value = '';
          return;
        }
        sendWs({ type: 'music-bot-command', command: 'pause' });
        text = `🤖 [MÜZİK BOTU]: ⏹️ Müzik durduruldu. *(İsteyen: @${state.username})*`;
      } else if (cmd === '/pause' || cmd === '/duraklat') {
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Bir ses odasında değilsiniz.');
          el.chatTextarea.value = '';
          return;
        }
        sendWs({ type: 'music-bot-command', command: 'pause' });
        text = `🤖 [MÜZİK BOTU]: ⏸️ Müzik duraklatıldı. *(İsteyen: @${state.username})*`;
      } else if (cmd === '/resume' || cmd === '/devam') {
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Bir ses odasında değilsiniz.');
          el.chatTextarea.value = '';
          return;
        }
        sendWs({ type: 'music-bot-command', command: 'play' });
        text = `🤖 [MÜZİK BOTU]: ▶️ Müzik devam ettiriliyor. *(İsteyen: @${state.username})*`;
      } else if (cmd === '/volume' || cmd === '/ses') {
        const val = parseInt(parts[1], 10);
        if (isNaN(val) || val < 0 || val > 100) {
          showToast('⚠️ Kullanım: /ses <0-100>');
          el.chatTextarea.value = '';
          return;
        }
        if (el.musicBotVolume) el.musicBotVolume.value = val;
        if (state.musicAudio) state.musicAudio.volume = val / 100;
        sendMusicBotYtCommand('setVolume', [val]);
        const cardVol = document.getElementById('musicBotCardVolume');
        if (cardVol) cardVol.value = val;
        text = `🤖 [MÜZİK BOTU]: 🔊 Ses seviyesi %${val} olarak ayarlandı.`;
      } else if (cmd === '/müzik' || cmd === '/muzik' || cmd === '/bot') {
        showToast('🤖 Müzik Komutları: /play <link/radyo>, /dur, /duraklat, /devam, /ses <0-100>');
        el.chatTextarea.value = '';
        return;
      } else if (cmd === '/yardim' || cmd === '/help') {
        showToast('🤖 Komutlar: /play <link/radyo>, /dur, /ses <1-100>, /anket, /zar, /yazitura');
        el.chatTextarea.value = '';
        return;
      }
    }

    if (!text && !image && !audioDataUrl && !attachedFile && !pollData) return;

    const payload = {
      text: text,
      image: image,
      audioNote: audioDataUrl,
      replyTo: replyTo,
      poll: pollData
    };

    if (attachedFile) {
      payload.file = attachedFile.dataUrl;
      payload.fileName = attachedFile.name;
      payload.fileSize = attachedFile.size;
    }

    if (state.activeViewType === 'dm') {
      sendWs({
        type: 'send-dm-msg',
        targetUserId: state.activeDmUserId,
        ...payload
      });
    } else {
      sendWs({
        type: 'send-text-channel-msg',
        channelId: state.activeChannelId,
        ...payload
      });
    }

    el.chatTextarea.value = '';
    clearAttachedImage();
    clearAttachedFile();
    window.cancelReply();
  }

  // --- VOICE NOTE RECORDER ---
  function setupVoiceNoteRecorder() {
    function formatTime(sec) {
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = (sec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }

    function stopVoiceRecording(discard = false) {
      if (!state.isRecordingVoiceNote) return;

      if (state.voiceRecTimerInterval) {
        clearInterval(state.voiceRecTimerInterval);
        state.voiceRecTimerInterval = null;
      }
      state.isRecordingVoiceNote = false;
      state.cancelVoiceRecording = discard;

      if (el.voiceRecordingBar) el.voiceRecordingBar.classList.add('hidden');
      if (el.btnRecordVoiceNote) el.btnRecordVoiceNote.classList.remove('recording');

      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }

      if (discard) {
        state.audioChunks = [];
        showToast('🗑️ Ses kaydı iptal edildi ve silindi.');
      } else {
        showToast('✉️ Sesli mesaj gönderiliyor...');
      }
    }

    if (el.btnCancelVoiceRecording) {
      el.btnCancelVoiceRecording.addEventListener('click', () => {
        stopVoiceRecording(true);
      });
    }

    if (el.btnSendVoiceRecording) {
      el.btnSendVoiceRecording.addEventListener('click', () => {
        stopVoiceRecording(false);
      });
    }

    el.btnRecordVoiceNote.addEventListener('click', async () => {
      if (!state.isRecordingVoiceNote) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          state.audioChunks = [];
          state.cancelVoiceRecording = false;
          state.mediaRecorder = new MediaRecorder(stream);

          state.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && !state.cancelVoiceRecording) {
              state.audioChunks.push(e.data);
            }
          };

          state.mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());

            if (state.cancelVoiceRecording || state.audioChunks.length === 0) {
              state.audioChunks = [];
              return;
            }

            const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              sendChatMessage(reader.result);
            };
            reader.readAsDataURL(audioBlob);
          };

          state.mediaRecorder.start();
          state.isRecordingVoiceNote = true;
          el.btnRecordVoiceNote.classList.add('recording');

          // Live timer & status bar
          state.voiceRecSeconds = 0;
          if (el.voiceRecTime) el.voiceRecTime.textContent = '00:00';
          if (el.voiceRecordingBar) el.voiceRecordingBar.classList.remove('hidden');

          state.voiceRecTimerInterval = setInterval(() => {
            state.voiceRecSeconds++;
            if (el.voiceRecTime) el.voiceRecTime.textContent = formatTime(state.voiceRecSeconds);
          }, 1000);

          showToast('🎙️ Ses kaydı başladı! Göndermek için tekrar dokunun veya iptal edin.');
        } catch (err) {
          showToast('⚠️ Mikrofon izni alınamadı!');
        }
      } else {
        stopVoiceRecording(false);
      }
    });
  }

  // --- SOUNDBOARD SETUP ---
  function setupSoundboard() {
    el.btnCallSoundboard.addEventListener('click', () => {
      el.soundboardPopover.classList.toggle('hidden');
    });
    el.btnCloseSoundboard.addEventListener('click', () => {
      el.soundboardPopover.classList.add('hidden');
    });

    document.querySelectorAll('.soundboard-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const soundId = btn.getAttribute('data-sound');
        state.audioManager.playSoundboard(soundId);
        sendWs({
          type: 'play-soundboard',
          soundId: soundId
        });
      });
    });
  }

  // --- CUSTOM SOUNDBOARD SETUP ---
  function setupCustomSoundboard() {
    if (!el.btnCallSoundboard) return;

    el.btnCallSoundboard.addEventListener('click', () => {
      sendWs({ type: 'get-custom-sounds' });
    });

    if (el.btnUploadCustomSound && el.fileCustomSound) {
      el.btnUploadCustomSound.addEventListener('click', () => {
        el.fileCustomSound.click();
      });

      el.fileCustomSound.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          showToast('⚠️ Ses dosyası en fazla 2MB olabilir!');
          el.fileCustomSound.value = '';
          return;
        }

        const defaultName = file.name.replace(/\.[^/.]+$/, '').slice(0, 20);
        const soundName = prompt('Ses için bir başlık girin:', defaultName);
        if (!soundName) {
          el.fileCustomSound.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          sendWs({
            type: 'upload-custom-sound',
            name: soundName.trim(),
            dataUrl: reader.result
          });
          showToast('🔊 Ses yükleniyor...');
        };
        reader.readAsDataURL(file);
        el.fileCustomSound.value = '';
      });
    }
  }

  function renderCustomSoundsUI() {
    if (!el.customSoundboardGrid) return;
    el.customSoundboardGrid.innerHTML = '';

    if (!state.customSounds || state.customSounds.length === 0) {
      el.customSoundboardGrid.innerHTML = '<div style="grid-column: 1/-1; font-size:11px; color:var(--text-muted); text-align:center; padding:8px 0;">Henüz özel ses yüklenmedi</div>';
      return;
    }

    state.customSounds.forEach(snd => {
      const btn = document.createElement('div');
      btn.className = 'soundboard-custom-item';
      btn.innerHTML = `
        <button class="soundboard-btn soundboard-custom-play" title="Çal">
          <span>🎵</span>
          <span class="custom-sound-name">${escapeHtml(snd.name)}</span>
        </button>
        <button class="btn-delete-custom-sound" title="Sesi Sil">×</button>
      `;

      btn.querySelector('.soundboard-custom-play').addEventListener('click', () => {
        const soundUrl = snd.soundUrl || snd.sound_url || snd.file_url;
        state.audioManager.playCustomSound(soundUrl);
        sendWs({
          type: 'play-soundboard',
          soundId: snd.name,
          soundUrl: soundUrl,
          isCustom: true
        });
      });

      btn.querySelector('.btn-delete-custom-sound').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`"${snd.name}" sesini silmek istediğinize emin misiniz?`)) {
          sendWs({
            type: 'delete-custom-sound',
            soundId: snd.id
          });
        }
      });

      el.customSoundboardGrid.appendChild(btn);
    });
  }

  // --- MINI PiP / OVERLAY WIDGET ---
  function setupMiniPipOverlay() {
    if (state.miniPipEnabled) el.miniPipOverlay.classList.remove('hidden');
    el.btnCloseMiniPip.addEventListener('click', () => {
      el.miniPipOverlay.classList.add('hidden');
      state.miniPipEnabled = false;
      localStorage.setItem('talkapp_mini_pip', 'false');
      el.chkMiniPip.checked = false;
    });
  }

  // --- SOL MENÜ KANAL LİSTESİ KONUŞMA IŞIĞI (VOICE USER SPEAKING INDICATOR) ---
  function updateVoiceUserSpeakingState(userId, isSpeaking) {
    if (!userId) return;
    const items = document.querySelectorAll(`[data-voice-user-id="${userId}"]`);
    items.forEach(elItem => {
      elItem.classList.toggle('speaking', !!isSpeaking);
    });
    if (userId === state.selfId || userId === 'self') {
      document.querySelectorAll('[data-is-self="true"]').forEach(elItem => {
        elItem.classList.toggle('speaking', !!isSpeaking);
      });
    }
  }

  function updateMiniPipSpeaker(id, name, isSpeaking) {
    if (!state.miniPipEnabled) return;
    let row = document.getElementById(`pip-spk-${id}`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'mini-pip-speaker-row';
      row.id = `pip-spk-${id}`;
      row.innerHTML = `<span class="mini-pip-dot"></span><span>${escapeHtml(name)}</span>`;
      el.miniPipSpeakersList.appendChild(row);
    }
    const dot = row.querySelector('.mini-pip-dot');
    if (dot) dot.classList.toggle('speaking', isSpeaking);
  }

  function removeMiniPipSpeaker(id) {
    const row = document.getElementById(`pip-spk-${id}`);
    if (row) row.remove();
  }

  function clearMiniPipSpeakers() {
    el.miniPipSpeakersList.innerHTML = '';
  }

  // --- IMAGE & FILE ATTACHMENTS, DRAG & DROP & EMOJI PICKER ---
  function setupChatAttachments() {
    el.chatTextarea.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          handleImageFile(blob);
          e.preventDefault();
          break;
        }
      }
    });

    el.btnChatAttach.addEventListener('click', () => el.fileChatAttach.click());
    el.fileChatAttach.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.type.startsWith('image/')) {
          handleImageFile(file);
        } else {
          handleGenericFile(file);
        }
      }
      el.fileChatAttach.value = '';
    });

    el.btnRemoveImagePreview.addEventListener('click', () => {
      clearAttachedImage();
      clearAttachedFile();
    });

    // Drag & Drop File Upload on Chat View
    if (el.textChatView && el.chatDropOverlay) {
      let dragDepth = 0;
      el.textChatView.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        dragDepth++;
        el.chatDropOverlay.classList.remove('hidden');
      });

      el.textChatView.addEventListener('dragover', (e) => {
        if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      el.textChatView.addEventListener('dragleave', (e) => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) {
          el.chatDropOverlay.classList.add('hidden');
        }
      });

      el.textChatView.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDepth = 0;
        el.chatDropOverlay.classList.add('hidden');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
            handleImageFile(file);
          } else {
            handleGenericFile(file);
          }
        }
      });
    }
  }

  function setupEmojiPicker() {
    if (!el.btnToggleEmojiPicker || !el.emojiPickerPopover || !el.emojiPickerGrid) return;
    const EMOJIS = [
      '😀', '😂', '🤣', '😎', '🥳', '😍', '🤔', '🫡',
      '😭', '😡', '🤯', '🥶', '👍', '👎', '👏', '🙌',
      '🔥', '❤️', '💯', '✨', '🎉', '🎮', '🎧', '🎙️',
      '🚀', '⚡', '💎', '🏆', '🍕', '☕', '👀', '💀'
    ];
    el.emojiPickerGrid.innerHTML = '';
    EMOJIS.forEach(emo => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-picker-item';
      btn.textContent = emo;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.chatTextarea) {
          const start = el.chatTextarea.selectionStart || el.chatTextarea.value.length;
          const end = el.chatTextarea.selectionEnd || el.chatTextarea.value.length;
          const val = el.chatTextarea.value;
          el.chatTextarea.value = val.slice(0, start) + emo + val.slice(end);
          el.chatTextarea.focus();
          el.chatTextarea.selectionStart = el.chatTextarea.selectionEnd = start + emo.length;
        }
        el.emojiPickerPopover.classList.add('hidden');
      });
      el.emojiPickerGrid.appendChild(btn);
    });

    el.btnToggleEmojiPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      el.emojiPickerPopover.classList.toggle('hidden');
    });

    if (el.btnCloseEmojiPicker) {
      el.btnCloseEmojiPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        el.emojiPickerPopover.classList.add('hidden');
      });
    }

    document.addEventListener('click', (e) => {
      if (el.emojiPickerPopover && !el.emojiPickerPopover.contains(e.target) && e.target !== el.btnToggleEmojiPicker) {
        el.emojiPickerPopover.classList.add('hidden');
      }
    });
  }

  function handleImageFile(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('⚠️ Görsel boyutu en fazla 10MB olabilir!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      state.attachedImageBase64 = e.target.result;
      el.chatImagePreviewThumb.src = e.target.result;
      el.chatImagePreviewThumb.style.display = 'block';
      const label = el.lblChatAttachmentPreview || el.chatImagePreviewBar.querySelector('span');
      if (label) label.textContent = `🖼️ Görsel eklendi: ${file.name || 'Panodan'} (${formatBytes(file.size)})`;
      el.chatImagePreviewBar.style.display = 'flex';
      showToast('🖼️ Görsel eklendi (Mesajla birlikte gönderilecek)');
    };
    reader.readAsDataURL(file);
  }

  function handleGenericFile(file) {
    if (file.size > 25 * 1024 * 1024) {
      showToast('⚠️ Dosya boyutu en fazla 25MB olabilir!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      state.attachedFile = {
        name: file.name,
        size: file.size,
        dataUrl: e.target.result
      };
      el.chatImagePreviewThumb.src = '';
      el.chatImagePreviewThumb.style.display = 'none';
      const label = el.lblChatAttachmentPreview || el.chatImagePreviewBar.querySelector('span');
      if (label) label.textContent = `📁 Dosya Eklendi: ${file.name} (${formatBytes(file.size)})`;
      el.chatImagePreviewBar.style.display = 'flex';
      showToast(`📁 ${file.name} hazırlandı. Mesajla birlikte gönderebilirsiniz.`);
    };
    reader.readAsDataURL(file);
  }

  function clearAttachedImage() {
    state.attachedImageBase64 = null;
    if (el.chatImagePreviewThumb) {
      el.chatImagePreviewThumb.src = '';
      el.chatImagePreviewThumb.style.display = '';
    }
    if (!state.attachedFile && el.chatImagePreviewBar) {
      el.chatImagePreviewBar.style.display = 'none';
    }
  }

  function clearAttachedFile() {
    state.attachedFile = null;
    if (!state.attachedImageBase64 && el.chatImagePreviewBar) {
      el.chatImagePreviewBar.style.display = 'none';
    }
  }

  function formatMessageText(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // 1. Code blocks: ```code```
    escaped = escaped.replace(/```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g, (match, p1) => {
      return `<pre class="chat-code-block"><code>${p1.trim()}</code></pre>`;
    });

    // 2. Spoilers: ||spoiler||
    escaped = escaped.replace(/\|\|(.*?)\|\|/g, '<span class="chat-spoiler" onclick="this.classList.toggle(\'revealed\')" title="Tıkla ve Göster">$1</span>');

    // 3. Inline code: `code`
    escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 4. Bold: **text**
    escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

    // 5. Italic: *text*
    escaped = escaped.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, '$1<em>$2</em>$3');

    // 6. Strikethrough: ~~text~~
    escaped = escaped.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    // 7. Blockquotes: lines starting with &gt;
    escaped = escaped.replace(/(?:^|\n)&gt;\s+(.+)/g, '<div class="chat-blockquote">$1</div>');

    // 8. Mentions: @username, @everyone, etc.
    escaped = escaped.replace(/@([a-zA-Z0-9_\u00C0-\u017F-]+)/g, '<span class="mention-tag">@$1</span>');

    // 9. URLs
    escaped = escaped.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:var(--brand-light); text-decoration:underline;">$1</a>');

    return escaped;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  // --- EKRAN BÜYÜTME / TAM EKRAN (SCREEN ZOOM & MAXIMIZE) ---
  function toggleMaximizeParticipantCard(card) {
    if (!card) return;
    const isMaximized = card.classList.contains('card-maximized');
    if (isMaximized) {
      card.classList.remove('card-maximized');
      const closeBtn = card.querySelector('.btn-close-maximized-screen');
      if (closeBtn) closeBtn.remove();
    } else {
      document.querySelectorAll('.participant-card.card-maximized').forEach(c => {
        c.classList.remove('card-maximized');
        const btn = c.querySelector('.btn-close-maximized-screen');
        if (btn) btn.remove();
      });

      card.classList.add('card-maximized');
      let closeBtn = card.querySelector('.btn-close-maximized-screen');
      if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.className = 'btn-close-maximized-screen';
        closeBtn.type = 'button';
        closeBtn.innerHTML = `✕ Küçült (Esc)`;
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleMaximizeParticipantCard(card);
        });
        card.appendChild(closeBtn);
      }
    }
  }

  function toggleFullscreenParticipantCard(card) {
    if (!card) return;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } else {
      if (card.requestFullscreen) {
        card.requestFullscreen().catch(() => {
          const vid = card.querySelector('video');
          if (vid && vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
        });
      } else {
        const vid = card.querySelector('video');
        if (vid && vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const maximized = document.querySelector('.participant-card.card-maximized');
      if (maximized) {
        toggleMaximizeParticipantCard(maximized);
      }
    }
  });

  // --- VOICE CARDS & CONTROLS (Multi-Screen Grid Aware) ---
  function createPeerCard(peer) {
    if (document.getElementById(`card-${peer.id}`)) return;

    const card = document.createElement('div');
    card.className = 'participant-card' + (peer.screen ? ' screen-card' : '');
    card.id = `card-${peer.id}`;

    const initial = (peer.name || 'O').charAt(0).toUpperCase();
    let avatarContent = initial;
    if (peer.avatarUrl) {
      if (peer.avatarUrl.startsWith('http') || peer.avatarUrl.startsWith('/') || peer.avatarUrl.startsWith('data:')) {
        avatarContent = `<img src="${escapeHtml(peer.avatarUrl)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      } else {
        avatarContent = `<span style="font-size:32px;">${escapeHtml(peer.avatarUrl)}</span>`;
      }
    }
    const peerBadge = peer.badge ? `<span class="gamer-badge" style="margin-left:6px;">${escapeHtml(peer.badge)}</span>` : '';

    card.innerHTML = `
      <div class="participant-avatar-large" id="avatar-${peer.id}">${avatarContent}</div>
      <video class="video-element ${peer.screen ? 'screen-video' : ''}" id="video-${peer.id}" autoplay playsinline></video>
      
      <div class="card-bottom-bar">
        <div class="card-name-group">
          <span>${escapeHtml(peer.name)}</span>
          ${peerBadge}
        </div>
        <div class="card-controls">
          <div class="volume-slider-wrapper" title="Ses Seviyesi">
            <input type="range" class="volume-slider" min="0" max="200" value="100" data-peer-id="${peer.id}">
          </div>
          <span class="card-badge-icon muted ${peer.muted ? '' : 'hidden'}" id="badge-mute-${peer.id}">🔇</span>
          <span class="card-badge-icon screen ${peer.screen ? '' : 'hidden'}" id="badge-screen-${peer.id}">📺</span>
          <button class="card-btn btn-maximize-card" title="Ekranı Büyüt / Odakla">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 3l2.3 2.3-3.89 3.89 1.41 1.41L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 3.89 3.89 1.41-1.41L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 3.89-3.89-1.41-1.41L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-3.89-3.89-1.41 1.41 3.89 3.89L15 21h6v-6z"/>
            </svg>
          </button>
          <button class="card-btn btn-fullscreen" title="Tam Ekran">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('.volume-slider').addEventListener('input', (e) => {
      state.audioManager.setPeerVolume(peer.id, parseInt(e.target.value, 10));
    });

    const btnMax = card.querySelector('.btn-maximize-card');
    if (btnMax) {
      btnMax.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMaximizeParticipantCard(card);
      });
    }

    card.querySelector('.btn-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFullscreenParticipantCard(card);
    });

    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('.card-controls') || e.target.closest('.volume-slider-wrapper')) return;
      toggleMaximizeParticipantCard(card);
    });

    el.participantGrid.appendChild(card);
  }

  function updatePeerCardStatus(peerId, trackState) {
    const card = document.getElementById(`card-${peerId}`);
    if (!card) return;

    if (trackState.muted !== undefined) {
      const muteBadge = document.getElementById(`badge-mute-${peerId}`);
      if (muteBadge) muteBadge.classList.toggle('hidden', !trackState.muted);
    }
    if (trackState.screen !== undefined) {
      const screenBadge = document.getElementById(`badge-screen-${peerId}`);
      if (screenBadge) screenBadge.classList.toggle('hidden', !trackState.screen);
      card.classList.toggle('screen-card', !!trackState.screen);
      const vid = document.getElementById(`video-${peerId}`);
      if (vid) vid.classList.toggle('screen-video', !!trackState.screen);
      if (trackState.screen) attachScreenAnnotationToCard(card);
      else detachScreenAnnotationFromCard(card);
    }
    if (trackState.camera === false && trackState.screen === false) {
      card.classList.remove('has-video');
      card.classList.remove('screen-card');
      detachScreenAnnotationFromCard(card);
      const vid = document.getElementById(`video-${peerId}`);
      if (vid) {
        vid.srcObject = null;
        vid.classList.remove('screen-video');
      }
    }
  }

  function removePeerCard(peerId) {
    const card = document.getElementById(`card-${peerId}`);
    if (card) card.remove();
  }

  function clearAllRemoteCards() {
    el.participantGrid.querySelectorAll('.participant-card:not(#card-self)').forEach(c => c.remove());
  }

  function toggleMic() {
    if (state.serverMuted) {
      showToast('🔇 Sunucu yöneticisi tarafından susturulduğunuz için mikrofon açamazsınız!');
      return;
    }
    state.isMicMuted = !state.isMicMuted;
    state.isPtmPressed = false;
    state.audioManager.setPtmPressed(false);
    state.audioManager.setMicrophoneEnabled(!state.isMicMuted);

    el.btnDockMic.classList.toggle('active-red', state.isMicMuted);
    el.iconDockMicOn.classList.toggle('hidden', state.isMicMuted);
    el.iconDockMicOff.classList.toggle('hidden', !state.isMicMuted);
    el.btnCallMic.classList.toggle('muted-state', state.isMicMuted);
    el.lblBtnMic.textContent = state.isMicMuted ? 'Sessizde' : 'Mikrofon';
    if (el.badgeMicSelf) el.badgeMicSelf.classList.toggle('hidden', !state.isMicMuted);

    sendWs({ type: 'track-state', muted: state.isMicMuted });
    state.audioManager.playMicStatusSound(state.isMicMuted);
    showToast(state.isMicMuted ? '🔇 Mikrofon kapatıldı' : '🎙️ Mikrofon açıldı');
  }

  function setPushToMuteActive(isActive) {
    if (state.serverMuted || state.isMicMuted) return;
    if (state.isPtmPressed === isActive) return;

    state.isPtmPressed = isActive;
    state.audioManager.setPtmPressed(isActive);

    el.btnDockMic.classList.toggle('active-red', isActive);
    el.iconDockMicOn.classList.toggle('hidden', isActive);
    el.iconDockMicOff.classList.toggle('hidden', !isActive);
    el.btnCallMic.classList.toggle('muted-state', isActive);
    el.lblBtnMic.textContent = isActive ? 'Susturuldu (PTM)' : 'Mikrofon';
    if (el.badgeMicSelf) el.badgeMicSelf.classList.toggle('hidden', !isActive);

    sendWs({ type: 'track-state', muted: isActive });
    state.audioManager.playMicStatusSound(isActive);
    showToast(isActive ? '🤫 Mikrofon susturuldu (Açmak için tekrar aynı tuşa basın)' : '🎙️ Mikrofon açıldı', 2000);
  }

  function toggleDeafen() {
    state.isDeafened = !state.isDeafened;
    state.audioManager.setMasterDeafen(state.isDeafened);

    if (state.isDeafened && !state.isMicMuted) toggleMic();

    el.btnDockDeafen.classList.toggle('active-red', state.isDeafened);
    el.iconDockDeafenOff.classList.toggle('hidden', state.isDeafened);
    el.iconDockDeafenOn.classList.toggle('hidden', !state.isDeafened);
    el.btnCallDeafen.classList.toggle('muted-state', state.isDeafened);

    sendWs({ type: 'track-state', deafened: state.isDeafened });
    showToast(state.isDeafened ? '🔕 Kulaklık kapatıldı' : '🔔 Kulaklık açıldı');
  }

  async function toggleCamera() {
    if (state.isCameraOn) {
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
      }
      state.isCameraOn = false;
      el.btnCallCamera.classList.remove('active-state');
      state.webrtc.setCameraStream(null);
      if (!state.isScreenSharing) {
        el.videoSelf.srcObject = null;
        el.cardSelf.classList.remove('has-video');
      }
      sendWs({ type: 'track-state', camera: false });
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        state.cameraStream = stream;
        state.isCameraOn = true;
        el.btnCallCamera.classList.add('active-state');
        state.webrtc.setCameraStream(stream);

        if (!state.isScreenSharing) {
          el.videoSelf.srcObject = stream;
          el.videoSelf.classList.remove('screen-video');
          el.cardSelf.classList.add('has-video');
        }
        sendWs({ type: 'track-state', camera: true });
        showToast('📷 Kamera açıldı.');
      } catch (e) {
        showToast('⚠️ Kamera açılamadı!');
      }
    }
  }

  // --- MODALS & PROFILE UI ---
  function updateMyProfileUI() {
    el.myUsername.textContent = state.username;
    el.nameSelfCard.textContent = state.username;
    if (state.myAvatar) {
      if (state.myAvatar.startsWith('http') || state.myAvatar.startsWith('data:') || state.myAvatar.startsWith('/')) {
        el.myAvatar.innerHTML = `<img src="${state.myAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.outerHTML='${state.username.charAt(0).toUpperCase()}'">`;
        el.avatarSelfBig.innerHTML = `<img src="${state.myAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.outerHTML='${state.username.charAt(0).toUpperCase()}'">`;
        if (el.avatarSettingsPreview) {
          el.avatarSettingsPreview.innerHTML = `<img src="${state.myAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        }
      } else {
        el.myAvatar.textContent = state.myAvatar;
        el.avatarSelfBig.textContent = state.myAvatar;
        if (el.avatarSettingsPreview) el.avatarSettingsPreview.textContent = state.myAvatar;
      }
    } else {
      const initial = state.username.charAt(0).toUpperCase();
      el.myAvatar.textContent = initial;
      el.avatarSelfBig.textContent = initial;
      if (el.avatarSettingsPreview) el.avatarSettingsPreview.textContent = initial;
    }

    el.myRoleTag.textContent = state.myRole.toUpperCase() + (state.myBadge ? ` • ${state.myBadge}` : '');
    el.myRoleTag.className = 'role-tag role-' + state.myRole;
    el.myStatusDot.className = 'status-indicator ' + state.myStatus;

    el.inputSettingsUsername.value = state.username;
    el.selectSettingsStatus.value = state.myStatus;
    el.inputSettingsGameActivity.value = state.gameActivity;
    el.chkMiniPip.checked = state.miniPipEnabled;

    if (state.isLoggedIn && el.lblAuthStatusText) {
      el.lblAuthStatusText.textContent = `👤 ${state.username} (${state.myRole.toUpperCase()})`;
    }
  }

  function openUserActionModal(member) {
    if (member.id === state.selfId) {
      openSettingsModal('tab-profile');
      return;
    }

    state.selectedMember = member;
    el.userActionName.textContent = member.name;
    el.userActionId.textContent = '#' + member.id.slice(-4);
    el.userActionAvatar.textContent = (member.name || 'O').charAt(0).toUpperCase();
    el.userActionGame.textContent = member.gameActivity ? `🎮 ${member.gameActivity}` : '';

    const perm = state.currentServerPermissions || {};
    const isAdmin = perm.isAdministrator || state.myRole === 'admin' || (state.serverSettings && state.serverSettings.ownerId === state.selfId);
    const canKick = isAdmin || !!perm.kick_members || state.myRole === 'mod';
    const canMute = isAdmin || !!perm.mute_members || state.myRole === 'mod';
    const canMove = isAdmin || !!perm.move_members || state.myRole === 'mod';
    const canManageRoles = isAdmin || !!perm.manage_roles;

    const canMod = canKick || canMute || canMove;
    el.modActionGroup.classList.toggle('hidden', !canMod);
    if (el.btnKickVoiceMember) el.btnKickVoiceMember.style.display = canKick ? '' : 'none';
    if (el.btnServerMuteMember) {
      el.btnServerMuteMember.style.display = canMute ? '' : 'none';
      el.btnServerMuteMember.textContent = member.serverMuted ? '🔊 Susturmayı Kaldır' : '🔇 Sunucuda Sustur';
    }

    if (el.modMoveVoiceRow && el.selectMoveVoiceChannel) {
      const voiceChs = (state.channels.voice || []).filter(vc => vc.id !== 'temp-voice-creator');
      el.selectMoveVoiceChannel.innerHTML = '';
      voiceChs.forEach(vc => {
        const opt = document.createElement('option');
        opt.value = vc.id;
        opt.textContent = `🔊 ${vc.name}`;
        if (vc.id === member.voiceChannelId) opt.selected = true;
        el.selectMoveVoiceChannel.appendChild(opt);
      });
      el.modMoveVoiceRow.style.display = (canMove && member.voiceChannelId && voiceChs.length > 0) ? 'flex' : 'none';
    }

    // Role Badges Display
    if (el.userActionRoleBadges) {
      el.userActionRoleBadges.innerHTML = '';
      const roles = member.roles || [];
      if (roles.length === 0) {
        el.userActionRoleBadges.innerHTML = '<span style="font-size:11px; color:var(--text-muted); font-style:italic;">Rol atanmamış</span>';
      } else {
        roles.forEach(r => {
          const badge = document.createElement('span');
          badge.className = 'role-badge-pill';
          badge.style.borderLeft = `3px solid ${r.color || 'var(--brand)'}`;
          badge.style.background = 'rgba(255,255,255,0.06)';
          badge.style.padding = '3px 8px';
          badge.style.borderRadius = '4px';
          badge.style.fontSize = '11px';
          badge.style.fontWeight = '600';
          badge.style.color = r.color || 'var(--text-normal)';
          badge.textContent = r.name;
          el.userActionRoleBadges.appendChild(badge);
        });
      }
    }

    // Role Assignment Group
    if (el.adminRoleAssignGroup) {
      el.adminRoleAssignGroup.classList.toggle('hidden', !canManageRoles);
      if (canManageRoles && el.memberRolesCheckList) {
        el.memberRolesCheckList.innerHTML = '';
        const assignableRoles = (state.serverRoles || []).filter(r => !r.is_default);
        if (assignableRoles.length === 0) {
          el.memberRolesCheckList.innerHTML = '<div style="font-size:11px; color:var(--text-muted); font-style:italic;">Sunucuda atanabilir özel rol bulunmuyor.</div>';
        } else {
          const memberRoleIds = new Set(member.roleIds || (member.roles || []).map(r => r.id));
          assignableRoles.forEach(r => {
            const label = document.createElement('label');
            label.className = 'member-role-check-item';
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.fontSize = '12px';
            label.style.cursor = 'pointer';
            label.style.padding = '4px 6px';
            label.style.borderRadius = '4px';

            const isChecked = memberRoleIds.has(r.id);
            label.innerHTML = `
              <input type="checkbox" class="chk-assign-member-role" value="${r.id}" ${isChecked ? 'checked' : ''} style="cursor:pointer;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${escapeHtml(r.color || '#99aab5')};"></span>
              <span style="color:${escapeHtml(r.color || 'inherit')}; font-weight:600;">${escapeHtml(r.name)}</span>
            `;
            el.memberRolesCheckList.appendChild(label);
          });
        }
      }
    }

    el.modalUserAction.classList.add('show');
  }

  function updateCompanionUI() {
    if (el.inputCompanionToken) {
      el.inputCompanionToken.value = state.companionToken;
    }
    if (el.badgeCompanionStatus) {
      if (state.isCompanionConnected) {
        el.badgeCompanionStatus.textContent = '🟢 Masaüstü Yardımcısı: Bağlı & Aktif';
        el.badgeCompanionStatus.className = 'shortcut-status-badge active';
      } else {
        el.badgeCompanionStatus.textContent = '⚪ Masaüstü Yardımcısı: Bekleniyor';
        el.badgeCompanionStatus.className = 'shortcut-status-badge inactive';
      }
    }
  }

  async function probeAndPairLocalCompanion(showToastFeedback = false) {
    try {
      const pingResp = await fetch('http://127.0.0.1:39841/ping', { mode: 'cors' });
      if (pingResp.ok) {
        await fetch(`http://127.0.0.1:39841/pair?server=${encodeURIComponent(window.location.origin)}&token=${encodeURIComponent(state.companionToken)}`, { mode: 'cors' });
        state.isCompanionConnected = true;
        updateCompanionUI();
        showToast('🎮 TalkApp Companion yerel olarak bağlandı ve aktif!');
        return;
      }
    } catch {
      // Local helper not running or blocked
    }
    if (showToastFeedback) {
      showToast('ℹ️ TalkApp Companion bilgisayarınızda açık değil. Lütfen önce .exe dosyasını çalıştırın.');
    }
  }

  function handleCompanionHotkey(action) {
    if (!state.shortcutsMasterEnabled) return;

    switch (action) {
      case 'ptt_down': {
        if (state.audioManager && state.audioManager.inputMode === 'ptt') {
          if (!state.audioManager.pttPressed) {
            state.audioManager.setPttPressed(true);
            if (el.lblBtnMic) el.lblBtnMic.textContent = 'Konuşuluyor (PTT)';
            if (state.audioManager.pttSoundEnabled) state.audioManager.playMicStatusSound(false);
          }
        }
        break;
      }

      case 'ptt_up': {
        if (state.audioManager && state.audioManager.inputMode === 'ptt') {
          if (state.audioManager.pttPressed) {
            state.audioManager.setPttPressed(false);
            if (el.lblBtnMic) el.lblBtnMic.textContent = state.isMicMuted ? 'Sessizde' : 'Mikrofon';
            if (state.audioManager.pttSoundEnabled) state.audioManager.playMicStatusSound(true);
          }
        }
        break;
      }

      case 'ptm_toggle': {
        if (state.ptmShortcutEnabled && state.audioManager.inputMode !== 'ptt') {
          setPushToMuteActive(!state.isPtmPressed);
        }
        break;
      }

      case 'ptm_down': {
        if (state.ptmShortcutEnabled && state.audioManager.inputMode !== 'ptt') {
          setPushToMuteActive(true);
        }
        break;
      }

      case 'ptm_up': {
        if (state.ptmShortcutEnabled && state.audioManager.inputMode !== 'ptt') {
          setPushToMuteActive(false);
        }
        break;
      }

      case 'mute_toggle': {
        if (state.muteShortcutEnabled) {
          toggleMic();
        }
        break;
      }

      case 'deafen_toggle': {
        if (state.deafenShortcutEnabled) {
          toggleDeafen();
        }
        break;
      }
    }
  }

  // Tauri Desktop Native Global Hotkeys Bridge
  if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.event) {
    try {
      window.__TAURI__.event.listen('tauri-hotkey', (event) => {
        if (event && event.payload) {
          handleCompanionHotkey(event.payload);
        }
      });
      console.log('[Tauri] Native global hotkey bridge active.');
    } catch (e) {
      console.warn('[Tauri Bridge Warning]:', e);
    }
  }

  function openSettingsModal(defaultTab = 'tab-audio') {
    populateAudioDevices();
    updateMyProfileUI();
    updateWebhookSettingsUI();
    updateCompanionUI();
    updateShortcutSettingsUI();
    probeAndPairLocalCompanion(false);

    const p = state.currentServerPermissions || {};
    const isServerAdmin = p.isAdministrator || state.myRole === 'admin' || (state.serverSettings && state.serverSettings.ownerId === state.selfId);
    const isMod = isServerAdmin || !!p.manage_server || state.myRole === 'mod';

    const secAdminHeader = document.getElementById('secAdminHeader');
    if (secAdminHeader) secAdminHeader.style.display = (isServerAdmin || isMod) ? 'block' : 'none';

    const btnTabBackup = document.getElementById('btnTabBackup');
    if (btnTabBackup) btnTabBackup.style.display = isServerAdmin ? 'flex' : 'none';

    const btnTabPermissions = document.getElementById('btnTabPermissions');
    if (btnTabPermissions) btnTabPermissions.style.display = isServerAdmin ? 'flex' : 'none';

    const btnTabAudit = document.getElementById('btnTabAudit');
    if (btnTabAudit) btnTabAudit.style.display = isMod ? 'flex' : 'none';

    if ((defaultTab === 'tab-backup' || defaultTab === 'tab-permissions') && !isServerAdmin) {
      defaultTab = 'tab-audio';
    }
    if (defaultTab === 'tab-audit' && !isMod) {
      defaultTab = 'tab-audio';
    }

    switchSettingsTab(defaultTab);
    el.modalSettings.classList.add('show');
  }

  function switchSettingsTab(tabId) {
    if (tabId === 'tab-appearance') tabId = 'tab-profile';
    if (tabId === 'tab-pwa') tabId = 'tab-gaming';

    const p = state.currentServerPermissions || {};
    const isServerAdmin = p.isAdministrator || state.myRole === 'admin' || (state.serverSettings && state.serverSettings.ownerId === state.selfId);
    const isMod = isServerAdmin || !!p.manage_server || state.myRole === 'mod';

    if ((tabId === 'tab-backup' || tabId === 'tab-permissions') && !isServerAdmin) {
      showToast('⚠️ Bu ayara sadece Sunucu Yöneticisi (Admin) erişebilir!');
      tabId = 'tab-audio';
    }
    if (tabId === 'tab-audit' && !isMod) {
      showToast('⚠️ Bu ayara sadece Moderatörler ve Yöneticiler erişebilir!');
      tabId = 'tab-audio';
    }

    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.settings-tab-panel').forEach(panel => {
      panel.classList.toggle('hidden', panel.id !== tabId);
    });

    if (tabId === 'tab-audit') {
      sendWs({ type: 'get-audit-logs', serverId: state.currentServerId });
    }
  }

  async function populateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      el.selectInputDevice.innerHTML = '<option value="">Varsayılan Mikrofon</option>';
      el.selectOutputDevice.innerHTML = '<option value="">Varsayılan Ses Çıkışı</option>';

      devices.forEach(d => {
        if (d.kind === 'audioinput') {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Mikrofon (${d.deviceId.slice(0, 5)})`;
          el.selectInputDevice.appendChild(opt);
        } else if (d.kind === 'audiooutput') {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || `Hoparlör (${d.deviceId.slice(0, 5)})`;
          el.selectOutputDevice.appendChild(opt);
        }
      });

      if (state.audioManager && state.audioManager.selectedInputDeviceId) {
        el.selectInputDevice.value = state.audioManager.selectedInputDeviceId;
      }
      if (state.audioManager && state.audioManager.selectedOutputDeviceId) {
        el.selectOutputDevice.value = state.audioManager.selectedOutputDeviceId;
      }
    } catch (e) {}
  }

  function openCreateChannelModal(defaultType = 'text', defaultCategory = 'GENEL SOHBET') {
    if (defaultType === 'voice') el.radioTypeVoice.checked = true;
    else el.radioTypeChat.checked = true;

    if (el.voiceUserLimitGroup) {
      el.voiceUserLimitGroup.classList.toggle('hidden', defaultType !== 'voice');
    }
    if (el.selectVoiceUserLimit) {
      el.selectVoiceUserLimit.value = '0';
    }

    el.inputNewChannelName.value = '';
    el.inputChannelPassword.value = '';
    el.chkProtectPassword.checked = false;
    el.inputChannelPassword.classList.add('hidden');

    if (el.selectChannelCategory) {
      el.selectChannelCategory.value = defaultCategory;
      if (el.inputCustomCategory) el.inputCustomCategory.classList.add('hidden');
    }

    el.modalCreateChannel.classList.add('show');
    el.inputNewChannelName.focus();
  }

  // --- THEME & APPEARANCE ---
  function setupTheme() {
    const savedTheme = localStorage.getItem('talkapp_theme') || 'dark';
    state.appTheme = savedTheme;
    document.body.classList.toggle('theme-amoled', savedTheme === 'amoled');
    if (el.selectAppTheme) {
      el.selectAppTheme.value = savedTheme;
      el.selectAppTheme.addEventListener('change', (e) => {
        const theme = e.target.value;
        state.appTheme = theme;
        localStorage.setItem('talkapp_theme', theme);
        document.body.classList.toggle('theme-amoled', theme === 'amoled');
        showToast(theme === 'amoled' ? '🖤 AMOLED Saf Siyah Tema Aktif' : '🌙 Koyu Tema Aktif');
      });
    }
  }

  // --- AVATARS & GAMER BADGES ---
  function setupAvatarAndBadges() {
    state.myAvatar = localStorage.getItem('talkapp_avatar') || '';
    state.myBadge = localStorage.getItem('talkapp_badge') || '';

    if (el.selectGamerBadge) {
      el.selectGamerBadge.value = state.myBadge;
      el.selectGamerBadge.addEventListener('change', (e) => {
        state.myBadge = e.target.value;
        localStorage.setItem('talkapp_badge', state.myBadge);
        updateMyProfileUI();
        sendWs({
          type: 'set-profile',
          name: state.username,
          status: state.myStatus,
          gameActivity: state.gameActivity,
          avatarUrl: state.myAvatar,
          badge: state.myBadge
        });
        showToast(`🎖️ Gamer Rozeti güncellendi: ${state.myBadge || 'Yok'}`);
      });
    }

    if (el.inputCustomAvatarUrl) {
      el.inputCustomAvatarUrl.value = state.myAvatar.startsWith('http') ? state.myAvatar : '';
      el.inputCustomAvatarUrl.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
          state.myAvatar = url;
          localStorage.setItem('talkapp_avatar', url);
          document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('active'));
          updateMyProfileUI();
          sendWs({
            type: 'set-profile',
            name: state.username,
            status: state.myStatus,
            gameActivity: state.gameActivity,
            avatarUrl: state.myAvatar,
            badge: state.myBadge
          });
        }
      });
    }

    document.querySelectorAll('.avatar-preset-item').forEach(item => {
      const avatarVal = item.getAttribute('data-avatar');
      if (state.myAvatar === avatarVal) {
        document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }

      item.addEventListener('click', () => {
        document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        state.myAvatar = avatarVal;
        localStorage.setItem('talkapp_avatar', avatarVal);
        if (el.inputCustomAvatarUrl) el.inputCustomAvatarUrl.value = '';
        updateMyProfileUI();
        sendWs({
          type: 'set-profile',
          name: state.username,
          status: state.myStatus,
          gameActivity: state.gameActivity,
          avatarUrl: state.myAvatar,
          badge: state.myBadge
        });
        showToast(`🖼️ Avatar seçildi: ${avatarVal}`);
      });
    });

    if (el.btnPickAvatarFile && el.fileAvatarPicker) {
      el.btnPickAvatarFile.addEventListener('click', () => {
        el.fileAvatarPicker.click();
      });

      el.fileAvatarPicker.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          showToast('⚠️ Profil resmi en fazla 10MB olabilir!');
          el.fileAvatarPicker.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          state.myAvatar = dataUrl;
          localStorage.setItem('talkapp_avatar', dataUrl);
          document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('active'));
          if (el.inputCustomAvatarUrl) el.inputCustomAvatarUrl.value = '';

          updateMyProfileUI();
          sendWs({
            type: 'set-profile',
            name: state.username,
            status: state.myStatus,
            gameActivity: state.gameActivity,
            avatarUrl: dataUrl,
            avatarFileName: file.name,
            badge: state.myBadge
          });
          showToast('🖼️ Profil resmi yüklendi!');
        };
        reader.readAsDataURL(file);
        el.fileAvatarPicker.value = '';
      });
    }

    if (el.btnRemoveCustomAvatar) {
      el.btnRemoveCustomAvatar.addEventListener('click', () => {
        state.myAvatar = '';
        localStorage.removeItem('talkapp_avatar');
        document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('active'));
        if (el.inputCustomAvatarUrl) el.inputCustomAvatarUrl.value = '';

        updateMyProfileUI();
        sendWs({
          type: 'set-profile',
          name: state.username,
          status: state.myStatus,
          gameActivity: state.gameActivity,
          avatarUrl: '',
          badge: state.myBadge
        });
        showToast('Profil resmi kaldırıldı.');
      });
    }
  }

  // --- AUDIT LOGS ---
  function setupAuditLogs() {
    if (el.btnTabAudit) {
      el.btnTabAudit.addEventListener('click', () => {
        sendWs({ type: 'get-audit-logs', serverId: state.currentServerId });
      });
    }

    if (el.btnRefreshAuditLogs) {
      el.btnRefreshAuditLogs.addEventListener('click', () => {
        sendWs({ type: 'get-audit-logs', serverId: state.currentServerId });
        showToast('🔄 Denetim kaydı güncellendi.');
      });
    }

    if (el.btnRefreshGuildAudit) {
      el.btnRefreshGuildAudit.addEventListener('click', () => {
        sendWs({ type: 'get-audit-logs', serverId: state.currentServerId });
        showToast('🔄 Denetim kaydı güncellendi.');
      });
    }
  }

  function renderAuditLogs(logs) {
    const bodies = [el.auditTableBody, el.guildAuditTableBody].filter(Boolean);
    if (bodies.length === 0) return;

    bodies.forEach(body => {
      body.innerHTML = '';

      if (!logs || logs.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Henüz denetim kaydı bulunmuyor.</td></tr>';
        return;
      }

      logs.forEach(log => {
        const tr = document.createElement('tr');
        const timeStr = log.created_at ? new Date(log.created_at).toLocaleString('tr-TR') : '-';
        const act = log.action_type || log.action || '-';
        const actor = log.actor_name || log.performed_by_name || 'Sistem';

        let badgeClass = 'audit-badge';
        if (act.includes('DELETE') || act.includes('KICK')) badgeClass += ' kick';
        else if (act.includes('MUTE')) badgeClass += ' mute';
        else if (act.includes('ROLE') || act.includes('PERM')) badgeClass += ' role';
        else if (act.includes('CHANNEL') || act.includes('SERVER')) badgeClass += ' channel';
        else badgeClass += ' msg';

        tr.innerHTML = `
          <td style="white-space:nowrap; color:var(--text-muted); font-size:11px;">${timeStr}</td>
          <td><strong style="color:var(--text-heading);">${escapeHtml(actor)}</strong></td>
          <td><span class="${badgeClass}">${escapeHtml(act)}</span></td>
          <td><span style="color:var(--text-normal);">${escapeHtml(log.target_name || '-')}</span></td>
          <td style="color:var(--text-muted); font-size:11px;">${escapeHtml(log.details || '-')}</td>
        `;
        body.appendChild(tr);
      });
    });
  }

  // --- SCREEN SHARE QUALITY POPOVER ---
  function setupScreenQualityPopover() {
    if (!el.screenQualityPopover) return;

    if (el.btnCloseScreenQuality) {
      el.btnCloseScreenQuality.addEventListener('click', () => {
        el.screenQualityPopover.classList.add('hidden');
      });
    }

    document.querySelectorAll('.screen-quality-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        el.screenQualityPopover.classList.add('hidden');
        const fps = parseInt(btn.getAttribute('data-fps') || '30', 10);
        const width = parseInt(btn.getAttribute('data-width') || '1920', 10);

        let qKey = '1080p30';
        if (fps === 60) qKey = '1080p60';
        else if (width === 1280) qKey = '720p30';

        try {
          await state.screenManager.startShare({ quality: qKey, includeAudio: true });
        } catch (err) {
          console.warn('Ekran paylaşımı başlatılamadı:', err);
        }
      });
    });
  }

  // --- KANAL BİLDİRİM TERCİHLERİ ---
  function setupChannelNotifSettings() {
    if (!el.btnChannelNotifSettings || !el.channelNotifPopover) return;

    el.btnChannelNotifSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      el.channelNotifPopover.classList.toggle('hidden');
      updateChannelNotifPopoverUI();
    });

    document.querySelectorAll('.notif-option-btn, .channel-notif-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pref = btn.getAttribute('data-pref') || btn.getAttribute('data-notif');
        setChannelNotifPref(state.activeChannelId, pref);
        el.channelNotifPopover.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (el.channelNotifPopover && !el.channelNotifPopover.contains(e.target) && e.target !== el.btnChannelNotifSettings) {
        el.channelNotifPopover.classList.add('hidden');
      }
    });
  }

  function setChannelNotifPref(channelId, pref) {
    if (!channelId) return;
    state.channelNotifs[channelId] = pref;
    localStorage.setItem('talkapp_channel_notifs', JSON.stringify(state.channelNotifs));
    updateChannelNotifIcon(channelId);
    renderChannelsList();

    const desc = pref === 'mute' ? 'Susturuldu 🔕' : pref === 'mentions' ? 'Yalnızca Bahsetmeler 🔔' : 'Tüm Mesajlar 🔔';
    showToast(`Kanal bildirimleri: ${desc}`);
  }

  function updateChannelNotifIcon(channelId) {
    if (!el.iconChannelNotif) return;
    const pref = state.channelNotifs[channelId] || 'all';
    el.iconChannelNotif.textContent = pref === 'mute' ? '🔕' : '🔔';
  }

  function updateChannelNotifPopoverUI() {
    const pref = state.channelNotifs[state.activeChannelId] || 'all';
    document.querySelectorAll('.notif-option-btn, .channel-notif-btn').forEach(btn => {
      const btnPref = btn.getAttribute('data-pref') || btn.getAttribute('data-notif');
      btn.classList.toggle('active', btnPref === pref);
    });
  }

  // --- SOHBET İÇİ "YAZIYOR..." (TYPING) SİSTEMİ ---
  function setupTypingIndicator() {
    if (!el.chatTextarea) return;

    el.chatTextarea.addEventListener('input', () => {
      emitTyping();
    });

    el.chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        stopTyping();
      }
    });
  }

  function emitTyping() {
    if (!state.isCurrentlyTyping) {
      state.isCurrentlyTyping = true;
      sendWs({
        type: 'typing',
        channelId: state.activeChannelId,
        isDm: state.activeViewType === 'dm',
        targetUserId: state.activeDmUserId,
        isTyping: true
      });
    }

    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      stopTyping();
    }, 2500);
  }

  function stopTyping() {
    if (state.isCurrentlyTyping) {
      state.isCurrentlyTyping = false;
      sendWs({
        type: 'typing',
        channelId: state.activeChannelId,
        isDm: state.activeViewType === 'dm',
        targetUserId: state.activeDmUserId,
        isTyping: false
      });
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = null;
  }

  function handleUserTyping(data) {
    const uid = data.userId || data.fromUserId;
    const uname = data.userName || data.fromUserName || 'Birisi';
    const isMatching = data.isDm
      ? (state.activeViewType === 'dm' && uid === state.activeDmUserId)
      : (state.activeViewType === 'text' && data.channelId === state.activeChannelId && uid !== state.selfId);

    if (!isMatching || !uid) return;

    if (data.isTyping) {
      if (state.typingUsers.has(uid)) {
        clearTimeout(state.typingUsers.get(uid).timeout);
      }
      const timeout = setTimeout(() => {
        state.typingUsers.delete(uid);
        updateTypingBarUI();
      }, 4000);

      state.typingUsers.set(uid, { name: uname, timeout });
    } else {
      if (state.typingUsers.has(uid)) {
        clearTimeout(state.typingUsers.get(uid).timeout);
        state.typingUsers.delete(uid);
      }
    }

    updateTypingBarUI();
  }

  function updateTypingBarUI() {
    if (!el.chatTypingBar || !el.typingText) return;

    if (state.typingUsers.size === 0) {
      el.chatTypingBar.classList.add('hidden');
      return;
    }

    const names = Array.from(state.typingUsers.values()).map(u => u.name);
    let text = '';
    if (names.length === 1) {
      text = `<b>${escapeHtml(names[0])}</b> yazıyor...`;
    } else if (names.length === 2) {
      text = `<b>${escapeHtml(names[0])}</b> ve <b>${escapeHtml(names[1])}</b> yazıyor...`;
    } else {
      text = `<b>Birkaç kişi</b> yazıyor...`;
    }

    el.typingText.innerHTML = text;
    el.chatTypingBar.classList.remove('hidden');
  }

  // --- ARKADAŞLIK SİSTEMİ ---
  function setupFriendsSystem() {
    if (!el.btnOpenFriendsModal) return;

    el.btnOpenFriendsModal.addEventListener('click', () => {
      el.modalFriends.classList.add('show');
      sendWs({ type: 'get-friends' });
    });

    if (el.btnCloseFriendsModal) {
      el.btnCloseFriendsModal.addEventListener('click', () => {
        el.modalFriends.classList.remove('show');
      });
    }

    if (el.tabFriendsAll) {
      el.tabFriendsAll.addEventListener('click', () => {
        state.friendsTab = 'all';
        el.tabFriendsAll.classList.add('active');
        if (el.tabFriendsPending) el.tabFriendsPending.classList.remove('active');
        renderFriendsUI();
      });
    }

    if (el.tabFriendsPending) {
      el.tabFriendsPending.addEventListener('click', () => {
        state.friendsTab = 'pending';
        el.tabFriendsPending.classList.add('active');
        if (el.tabFriendsAll) el.tabFriendsAll.classList.remove('active');
        renderFriendsUI();
      });
    }

    if (el.btnSubmitAddFriend) {
      el.btnSubmitAddFriend.addEventListener('click', () => {
        const username = el.inputAddFriendUsername.value.trim();
        if (!username) return showToast('⚠️ Lütfen arkadaşınızın kullanıcı adını yazın!');
        sendWs({
          type: 'send-friend-request',
          targetUsername: username
        });
        el.inputAddFriendUsername.value = '';
      });
    }
  }

  function renderFriendsUI() {
    if (!el.friendsListContainer) return;
    el.friendsListContainer.innerHTML = '';

    const acceptedFriends = state.friends.filter(f => f.status === 'accepted');
    const pendingFriends = state.friends.filter(f => f.status === 'pending');

    if (el.countFriendsAll) el.countFriendsAll.textContent = acceptedFriends.length;
    if (el.countFriendsPending) el.countFriendsPending.textContent = pendingFriends.length;

    const currentList = state.friendsTab === 'pending' ? pendingFriends : acceptedFriends;

    if (currentList.length === 0) {
      el.friendsListContainer.innerHTML = `
        <div style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:13px;">
          ${state.friendsTab === 'pending' ? 'Bekleyen arkadaşlık isteği yok 🎉' : 'Henüz arkadaş listeniz boş. Yukarıdan arkadaş ekleyin!'}
        </div>
      `;
      return;
    }

    currentList.forEach(fr => {
      const isIncoming = fr.direction === 'incoming';
      const row = document.createElement('div');
      row.className = 'friend-item-row';

      const initial = (fr.username || 'O').charAt(0).toUpperCase();
      let avatarHtml = `<div class="avatar" style="width:36px; height:36px; font-size:14px;">${initial}</div>`;
      if (fr.avatar_url) {
        if (fr.avatar_url.startsWith('http') || fr.avatar_url.startsWith('/')) {
          avatarHtml = `<img src="${escapeHtml(fr.avatar_url)}" class="avatar" style="width:36px; height:36px; object-fit:cover;">`;
        } else {
          avatarHtml = `<div class="avatar" style="width:36px; height:36px; font-size:18px;">${fr.avatar_url}</div>`;
        }
      }

      let actionsHtml = '';
      if (fr.status === 'pending') {
        if (isIncoming) {
          actionsHtml = `
            <button class="friend-action-btn accept" onclick="window.acceptFriend('${fr.friend_user_id}')" title="İsteği Kabul Et">✓ Kabul</button>
            <button class="friend-action-btn reject" onclick="window.removeFriend('${fr.friend_user_id}')" title="İsteği Reddet">✕ Reddet</button>
          `;
        } else {
          actionsHtml = `<span style="font-size:11px; color:var(--text-muted);">İstek Gönderildi...</span>`;
        }
      } else {
        actionsHtml = `
          <button class="friend-action-btn" onclick="window.callFriend('${fr.friend_user_id}', 'audio')" title="Sesli Ara">📞</button>
          <button class="friend-action-btn" onclick="window.callFriend('${fr.friend_user_id}', 'video')" title="Görüntülü Ara">📹</button>
          <button class="friend-action-btn" onclick="window.openDmFromFriend('${fr.friend_user_id}', '${escapeHtml(fr.username)}')" title="Mesaj Gönder">💬</button>
          <button class="friend-action-btn reject" onclick="window.removeFriend('${fr.friend_user_id}')" title="Arkadaşı Sil">🗑️</button>
        `;
      }

      row.innerHTML = `
        <div class="friend-info">
          ${avatarHtml}
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--text-normal);">${escapeHtml(fr.username)}</div>
            <div style="font-size:11px; color:var(--text-muted);">${fr.status === 'pending' ? (isIncoming ? 'Gelen İstek' : 'Giden İstek') : (fr.game_activity ? `🎮 ${escapeHtml(fr.game_activity)}` : (fr.user_status === 'online' ? '🟢 Çevrimiçi' : '⚪ Çevrimdışı'))}</div>
          </div>
        </div>
        <div class="friend-actions">${actionsHtml}</div>
      `;

      el.friendsListContainer.appendChild(row);
    });
  }

  window.acceptFriend = (friendId) => {
    sendWs({ type: 'accept-friend-request', friendId });
  };

  window.removeFriend = (friendId) => {
    if (confirm('Bu kullanıcıyı arkadaş listenizden kaldırmak istediğinize emin misiniz?')) {
      sendWs({ type: 'remove-friend', friendId });
    }
  };

  window.openDmFromFriend = (friendId, friendName) => {
    if (el.modalFriends) el.modalFriends.classList.remove('show');
    openDmChat(friendId, friendName);
  };

  window.callFriend = (friendId, type) => {
    if (el.modalFriends) el.modalFriends.classList.remove('show');
    initiateDirectCall(friendId, type);
  };

  // --- BİREBİR CANLI ARAMA (DIRECT CALL - WebRTC) ---
  let directCallPc = null;
  let directCallLocalStream = null;
  let directCallRemoteAudio = null;

  function setupDirectCall() {
    if (el.btnDmVoiceCall) {
      el.btnDmVoiceCall.addEventListener('click', () => {
        if (!state.activeDmUserId) return;
        initiateDirectCall(state.activeDmUserId, 'audio');
      });
    }

    if (el.btnDmVideoCall) {
      el.btnDmVideoCall.addEventListener('click', () => {
        if (!state.activeDmUserId) return;
        initiateDirectCall(state.activeDmUserId, 'video');
      });
    }

    if (el.btnAcceptCall) {
      el.btnAcceptCall.addEventListener('click', () => {
        state.audioManager.stopRingtone();
        if (el.modalIncomingCall) el.modalIncomingCall.classList.remove('show');
        if (!state.incomingCallData) return;

        // Auto-leave active group voice channel before answering 1-1 call
        if (state.activeVoiceRoomId) {
          leaveCurrentVoice();
          showToast('📞 Birebir arama kabul edildiği için ses kanalından ayrıldınız.');
        }

        sendWs({
          type: 'direct-call-accept',
          callerId: state.incomingCallData.callerId,
          callType: state.incomingCallData.callType
        });
      });
    }

    if (el.btnDeclineCall) {
      el.btnDeclineCall.addEventListener('click', () => {
        state.audioManager.stopRingtone();
        if (el.modalIncomingCall) el.modalIncomingCall.classList.remove('show');
        if (!state.incomingCallData) return;

        sendWs({
          type: 'direct-call-reject',
          callerId: state.incomingCallData.callerId
        });
        state.incomingCallData = null;
      });
    }

    if (el.btnCancelOutgoingCall) {
      el.btnCancelOutgoingCall.addEventListener('click', () => {
        state.audioManager.stopDialTone();
        if (el.modalOutgoingCall) el.modalOutgoingCall.classList.remove('show');
        sendWs({ type: 'direct-call-hangup' });
      });
    }

    if (el.btnDirectCallToggleMic) {
      el.btnDirectCallToggleMic.addEventListener('click', () => {
        if (!directCallLocalStream) return;
        const audioTracks = directCallLocalStream.getAudioTracks();
        if (audioTracks.length === 0) return;
        const nextEnabled = !audioTracks[0].enabled;
        audioTracks.forEach(t => { t.enabled = nextEnabled; });
        el.btnDirectCallToggleMic.textContent = nextEnabled ? '🎙️' : '🔇';
        el.btnDirectCallToggleMic.classList.toggle('muted-state', !nextEnabled);
        showToast(nextEnabled ? '🎙️ Arama mikrofonu açıldı' : '🔇 Arama mikrofonu kapatıldı');
      });
    }

    if (el.btnDirectCallToggleCam) {
      el.btnDirectCallToggleCam.addEventListener('click', async () => {
        if (!directCallPc || !directCallLocalStream) return;
        const videoTracks = directCallLocalStream.getVideoTracks();
        if (videoTracks.length > 0) {
          const nextEnabled = !videoTracks[0].enabled;
          videoTracks.forEach(t => { t.enabled = nextEnabled; });
          if (el.directCallLocalVideo) el.directCallLocalVideo.classList.toggle('hidden', !nextEnabled);
          el.btnDirectCallToggleCam.classList.toggle('active-state', nextEnabled);
          showToast(nextEnabled ? '📷 Kamera açıldı' : '📷 Kamera kapatıldı');
        } else {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } });
            const vTrack = camStream.getVideoTracks()[0];
            if (vTrack) {
              directCallLocalStream.addTrack(vTrack);
              directCallPc.addTrack(vTrack, directCallLocalStream);
              if (el.directCallLocalVideo) {
                el.directCallLocalVideo.srcObject = directCallLocalStream;
                el.directCallLocalVideo.classList.remove('hidden');
              }
              el.btnDirectCallToggleCam.classList.add('active-state');
              if (state.activeDirectCall) {
                const offer = await directCallPc.createOffer();
                await directCallPc.setLocalDescription(offer);
                sendWs({
                  type: 'direct-call-signal-offer',
                  targetUserId: state.activeDirectCall.peerId,
                  offer: offer
                });
              }
            }
          } catch (err) {
            showToast('⚠️ Kamera açılamadı!');
          }
        }
      });
    }

    if (el.btnDirectCallExpand && el.directCallActivePanel) {
      el.btnDirectCallExpand.addEventListener('click', () => {
        el.directCallActivePanel.classList.toggle('expanded');
      });
    }

    if (el.btnDirectCallHangup) {
      el.btnDirectCallHangup.addEventListener('click', () => {
        endDirectCall(true);
        showToast('📞 Arama sonlandırıldı.');
      });
    }
  }

  function initiateDirectCall(targetUserId, type) {
    if (!targetUserId) return;
    if (state.activeDirectCall) {
      showToast('⚠️ Zaten devam eden bir aramanız var!');
      return;
    }

    // Auto-leave active group voice channel before placing direct call
    if (state.activeVoiceRoomId) {
      leaveCurrentVoice();
      showToast('📞 Birebir arama başlatıldığı için ses kanalından ayrıldınız.');
    }

    sendWs({
      type: 'direct-call-start',
      targetUserId: targetUserId,
      callType: type
    });
  }

  async function startDirectCallWebRtc(peerId, peerName, isCaller, callType) {
    endDirectCall(false);

    state.activeDirectCall = {
      peerId,
      peerName,
      type: callType,
      isCaller
    };

    acquireScreenWakeLock();
    startMobileAudioKeepAlive();

    el.activeVoiceBar.classList.remove('hidden');
    el.lblVoiceCurrentRoom.textContent = `📞 ${peerName} (Birebir Arama)`;

    if (el.directCallActivePanel) {
      el.directCallActivePanel.classList.remove('hidden');
      if (el.lblDirectCallPeerName) el.lblDirectCallPeerName.textContent = peerName;
      if (el.directCallPeerAvatar) el.directCallPeerAvatar.textContent = (peerName || 'A').charAt(0).toUpperCase();
      if (el.directCallAvatarFallback) el.directCallAvatarFallback.classList.remove('hidden');
      if (el.directCallRemoteVideo) el.directCallRemoteVideo.classList.add('hidden');
      if (el.directCallLocalVideo) el.directCallLocalVideo.classList.add('hidden');
      if (el.btnDirectCallToggleMic) {
        el.btnDirectCallToggleMic.textContent = '🎙️';
        el.btnDirectCallToggleMic.classList.remove('muted-state');
      }
      if (el.btnDirectCallToggleCam) {
        el.btnDirectCallToggleCam.classList.toggle('active-state', callType === 'video');
      }
      state.directCallStartTime = Date.now();
      if (el.lblDirectCallTimer) el.lblDirectCallTimer.textContent = '00:00';
      if (state.directCallTimerInterval) clearInterval(state.directCallTimerInterval);
      state.directCallTimerInterval = setInterval(() => {
        if (!state.directCallStartTime || !el.lblDirectCallTimer) return;
        const sec = Math.floor((Date.now() - state.directCallStartTime) / 1000);
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        el.lblDirectCallTimer.textContent = `${m}:${s}`;
      }, 1000);
    }

    try {
      const constraints = {
        audio: true,
        video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } : false
      };
      directCallLocalStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn('[Direct Call Media]:', err);
      try {
        directCallLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        showToast('⚠️ Mikrofon erişimi sağlanamadı!');
        sendWs({ type: 'direct-call-hangup', peerId });
        endDirectCall(false);
        return;
      }
    }

    if (directCallLocalStream && directCallLocalStream.getVideoTracks().length > 0 && el.directCallLocalVideo) {
      el.directCallLocalVideo.srcObject = directCallLocalStream;
      el.directCallLocalVideo.classList.remove('hidden');
    }

    const rtcConfig = {
      iceServers: (state.webrtc && state.webrtc.iceServers && state.webrtc.iceServers.length > 0)
        ? state.webrtc.iceServers
        : [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
    };

    directCallPc = new RTCPeerConnection(rtcConfig);

    directCallLocalStream.getTracks().forEach(track => {
      directCallPc.addTrack(track, directCallLocalStream);
    });

    directCallPc.ontrack = (e) => {
      const stream = e.streams && e.streams[0];
      if (!stream) return;

      if (!directCallRemoteAudio) {
        directCallRemoteAudio = new Audio();
        directCallRemoteAudio.autoplay = true;
      }
      directCallRemoteAudio.srcObject = stream;
      if (state.audioManager && state.audioManager.selectedOutputDeviceId && typeof directCallRemoteAudio.setSinkId === 'function') {
        directCallRemoteAudio.setSinkId(state.audioManager.selectedOutputDeviceId).catch(() => {});
      }

      if (e.track.kind === 'video' || stream.getVideoTracks().length > 0) {
        if (el.directCallRemoteVideo) {
          el.directCallRemoteVideo.srcObject = stream;
          el.directCallRemoteVideo.classList.remove('hidden');
        }
        if (el.directCallAvatarFallback) {
          el.directCallAvatarFallback.classList.add('hidden');
        }
      }
    };

    directCallPc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWs({
          type: 'direct-call-signal-candidate',
          targetUserId: peerId,
          candidate: e.candidate
        });
      }
    };

    directCallPc.oniceconnectionstatechange = () => {
      if (directCallPc && ['disconnected', 'failed', 'closed'].includes(directCallPc.iceConnectionState)) {
        endDirectCall(false);
      }
    };

    if (isCaller) {
      try {
        const offer = await directCallPc.createOffer();
        await directCallPc.setLocalDescription(offer);
        sendWs({
          type: 'direct-call-signal-offer',
          targetUserId: peerId,
          offer: offer
        });
      } catch (e) {
        console.error('[Direct Call Offer Error]:', e);
      }
    }
  }

  async function handleDirectCallOffer(senderId, offer) {
    if (!directCallPc) {
      const peerName = state.incomingCallData ? state.incomingCallData.callerName : 'Arkadaş';
      const cType = state.incomingCallData ? state.incomingCallData.callType : 'audio';
      await startDirectCallWebRtc(senderId, peerName, false, cType);
    }
    if (!directCallPc) return;
    try {
      await directCallPc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await directCallPc.createAnswer();
      await directCallPc.setLocalDescription(answer);
      sendWs({
        type: 'direct-call-signal-answer',
        targetUserId: senderId,
        answer: answer
      });
    } catch (e) {
      console.error('[Direct Call Handle Offer Error]:', e);
    }
  }

  async function handleDirectCallAnswer(senderId, answer) {
    if (directCallPc) {
      try {
        await directCallPc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) {
        console.error('[Direct Call Handle Answer Error]:', e);
      }
    }
  }

  async function handleDirectCallCandidate(senderId, candidate) {
    if (directCallPc && candidate) {
      try {
        await directCallPc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[Direct Call Candidate error]:', e);
      }
    }
  }

  function endDirectCall(notifyServer = true) {
    if (notifyServer && state.activeDirectCall) {
      sendWs({ type: 'direct-call-hangup', peerId: state.activeDirectCall.peerId });
    }

    if (state.directCallTimerInterval) {
      clearInterval(state.directCallTimerInterval);
      state.directCallTimerInterval = null;
    }
    state.directCallStartTime = null;

    if (directCallLocalStream) {
      directCallLocalStream.getTracks().forEach(t => t.stop());
      directCallLocalStream = null;
    }

    if (directCallPc) {
      try { directCallPc.close(); } catch (e) {}
      directCallPc = null;
    }

    if (directCallRemoteAudio) {
      directCallRemoteAudio.srcObject = null;
      directCallRemoteAudio = null;
    }

    if (el.directCallRemoteVideo) el.directCallRemoteVideo.srcObject = null;
    if (el.directCallLocalVideo) el.directCallLocalVideo.srcObject = null;
    if (el.directCallActivePanel) {
      el.directCallActivePanel.classList.add('hidden');
      el.directCallActivePanel.classList.remove('expanded');
    }

    state.activeDirectCall = null;
    state.incomingCallData = null;

    if (!state.activeVoiceRoomId) {
      el.activeVoiceBar.classList.add('hidden');
      releaseScreenWakeLock();
      stopMobileAudioKeepAlive();
    } else {
      el.lblVoiceCurrentRoom.textContent = state.activeVoiceRoomName;
    }
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Dock Actions
    el.btnDockMic.addEventListener('click', toggleMic);
    el.btnCallMic.addEventListener('click', toggleMic);
    el.btnDockDeafen.addEventListener('click', toggleDeafen);
    el.btnCallDeafen.addEventListener('click', toggleDeafen);
    el.btnCallCamera.addEventListener('click', toggleCamera);
    el.btnHangupVoiceBar.addEventListener('click', () => {
      if (state.activeDirectCall) {
        endDirectCall(true);
        showToast('📞 Arama sonlandırıldı.');
      } else {
        leaveCurrentVoice();
      }
    });
    el.btnCallDisconnect.addEventListener('click', leaveCurrentVoice);

    if (el.btnCallQuickChat) {
      el.btnCallQuickChat.addEventListener('click', () => {
        const ch = (state.channels.text || []).find(c => c.id === state.activeChannelId) || (state.channels.text || [])[0];
        if (ch) {
          selectTextChannel(ch.id, ch.name);
        } else {
          state.activeViewType = 'text';
          el.voiceArena.classList.add('hidden');
          el.textChatView.classList.remove('hidden');
          el.headerPrefix.textContent = '#';
          el.lblActiveChannelName.textContent = state.activeChannelName || 'genel-sohbet';
        }
        el.chatTextarea?.focus();
      });
    }

    // Audio Input & Output Device Change Listeners
    if (el.selectInputDevice) {
      el.selectInputDevice.addEventListener('change', async () => {
        const devId = el.selectInputDevice.value;
        const newStream = await state.audioManager.setInputDevice(devId);
        if (newStream && state.webrtc && state.activeVoiceRoomId) {
          state.webrtc.setLocalStream(newStream);
        }
        showToast('🎙️ Mikrofon giriş cihazı güncellendi.');
      });
    }

    if (el.selectOutputDevice) {
      el.selectOutputDevice.addEventListener('change', async () => {
        const devId = el.selectOutputDevice.value;
        await state.audioManager.setOutputDevice(devId);
        if (directCallRemoteAudio && typeof directCallRemoteAudio.setSinkId === 'function') {
          try { await directCallRemoteAudio.setSinkId(devId || ''); } catch (e) {}
        }
        showToast('🔊 Ses çıkış cihazı (hoparlör/kulaklık) güncellendi.');
      });
    }

    // Screen Share
    el.btnCallScreen.addEventListener('click', () => {
      if (state.isScreenSharing) {
        state.screenManager.stopShare();
      } else {
        if (el.screenQualityPopover) {
          el.screenQualityPopover.classList.toggle('hidden');
        } else {
          el.modalScreenShare.classList.add('show');
        }
      }
    });
    el.btnCloseScreenModal.addEventListener('click', () => el.modalScreenShare.classList.remove('show'));
    el.btnCancelScreenModal.addEventListener('click', () => el.modalScreenShare.classList.remove('show'));
    el.btnConfirmStartScreen.addEventListener('click', async () => {
      el.modalScreenShare.classList.remove('show');
      const chip = document.querySelector('.quality-chip.selected');
      const q = chip ? chip.getAttribute('data-quality') : '1080p60';
      await state.screenManager.startShare({ quality: q, includeAudio: el.chkShareAudio.checked });
    });

    document.querySelectorAll('.quality-chip').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.quality-chip').forEach(ch => ch.classList.remove('selected'));
        c.classList.add('selected');
      });
    });

    // Pinned Messages Header Button
    el.btnViewPinnedMessages.addEventListener('click', () => {
      el.pinnedMessagesList.innerHTML = '';
      const pinned = state.currentMessages.filter(m => m.isPinned);
      if (pinned.length === 0) {
        el.pinnedMessagesList.innerHTML = '<div class="empty-state"><p>Bu kanalda henüz sabitlenmiş mesaj yok.</p></div>';
      } else {
        pinned.forEach(m => {
          const div = document.createElement('div');
          div.className = 'chat-message-row is-pinned';
          div.innerHTML = `
            <div class="chat-msg-content" style="flex:1;">
              <div class="chat-msg-meta">
                <span>${escapeHtml(m.senderName)}</span>
                <span class="chat-msg-time">${m.time}</span>
                <button class="card-btn" style="margin-left:auto; color:var(--red);" onclick="togglePinMessage('${m.id}')">Kaldır ✕</button>
              </div>
              <div class="chat-msg-text">${formatMessageText(m.text || '')}</div>
            </div>
          `;
          el.pinnedMessagesList.appendChild(div);
        });
      }
      el.modalPinnedMessages.classList.add('show');
    });
    el.btnClosePinnedModal.addEventListener('click', () => el.modalPinnedMessages.classList.remove('show'));

    // Mobile Drawer Hamburger & Backdrop
    if (el.btnMobileMenuToggle) {
      el.btnMobileMenuToggle.addEventListener('click', toggleMobileDrawer);
    }
    if (el.mobileSidebarBackdrop) {
      el.mobileSidebarBackdrop.addEventListener('click', closeMobileDrawer);
    }

    // Toggle Voice View Button in Header
    el.btnToggleVoiceView.addEventListener('click', () => {
      if (state.activeVoiceRoomId) {
        state.activeViewType = 'voice';
        el.textChatView.classList.add('hidden');
        el.voiceArena.classList.remove('hidden');
        el.headerPrefix.textContent = '🔊';
        el.lblActiveChannelName.textContent = state.activeVoiceRoomName;
      }
    });

    // Toggle Right Member List (Drawer on mobile, hidden toggle on desktop)
    el.btnToggleMemberList.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        toggleMobileMembersDrawer();
      } else {
        el.memberSidebar.classList.toggle('hidden');
      }
    });

    // Mobile Background Audio & Visibility Change Recovery
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleMobileVisibilityRecovery();
      }
    });
    window.addEventListener('focus', () => {
      handleMobileVisibilityRecovery();
    });

    // Chat Textarea Enter to send
    el.chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // Multi-Tab Settings
    el.btnSettingsOpen.addEventListener('click', () => openSettingsModal());
    el.btnUserEdit.addEventListener('click', () => openSettingsModal('tab-profile'));
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchSettingsTab(btn.getAttribute('data-tab')));
    });

    if (el.btnCopyCompanionToken) {
      el.btnCopyCompanionToken.addEventListener('click', () => {
        navigator.clipboard.writeText(state.companionToken);
        showToast('📋 Companion Eşleşme Kodu panoya kopyalandı: ' + state.companionToken);
      });
    }

    if (el.btnPairCompanionLocal) {
      el.btnPairCompanionLocal.addEventListener('click', () => {
        probeAndPairLocalCompanion(true);
      });
    }

    el.btnSaveSettings.addEventListener('click', () => {
      const newName = el.inputSettingsUsername.value.trim();
      if (newName) {
        state.username = newName;
        localStorage.setItem('talkapp_username', newName);
      }
      state.myStatus = el.selectSettingsStatus.value;
      localStorage.setItem('talkapp_status', state.myStatus);

      state.gameActivity = el.inputSettingsGameActivity.value.trim();
      localStorage.setItem('talkapp_game', state.gameActivity);

      state.miniPipEnabled = el.chkMiniPip.checked;
      localStorage.setItem('talkapp_mini_pip', state.miniPipEnabled);
      el.miniPipOverlay.classList.toggle('hidden', !state.miniPipEnabled);

      state.audioManager.soundEffectsEnabled = el.chkSoundEffects.checked;

      // Stop mic loopback test if open
      if (state.isMicTesting) {
        state.audioManager.setSidetoneEnabled(false);
        state.isMicTesting = false;
        el.btnToggleMicTest.textContent = '▶ Kendi Sesini Dinle (Test Et)';
        el.btnToggleMicTest.classList.remove('btn-primary');
        el.btnToggleMicTest.classList.add('btn-secondary');
      }

      updateMyProfileUI();
      sendWs({
        type: 'set-profile',
        name: state.username,
        status: state.myStatus,
        gameActivity: state.gameActivity,
        avatarUrl: state.myAvatar,
        badge: state.myBadge
      });

      el.modalSettings.classList.remove('show');
      showToast('Ayarlar uygulandı.');
    });

    // Password Update Listener
    const btnUpdatePassword = document.getElementById('btnUpdatePassword');
    const inputOldPwd = document.getElementById('inputSettingsOldPassword');
    const inputNewPwd = document.getElementById('inputSettingsNewPassword');
    if (btnUpdatePassword) {
      btnUpdatePassword.addEventListener('click', () => {
        const oldVal = inputOldPwd ? inputOldPwd.value : '';
        const newVal = inputNewPwd ? inputNewPwd.value : '';
        if (!newVal || newVal.length < 4) {
          showToast('⚠️ Yeni şifre en az 4 karakter olmalıdır!');
          return;
        }
        sendWs({
          type: 'auth-change-password',
          oldPassword: oldVal,
          newPassword: newVal
        });
        if (inputOldPwd) inputOldPwd.value = '';
        if (inputNewPwd) inputNewPwd.value = '';
      });
    }

    // Save Server Identity (Name, Icon, Description)
    const btnSaveServerIdentity = document.getElementById('btnSaveServerIdentity');
    if (btnSaveServerIdentity) {
      btnSaveServerIdentity.addEventListener('click', () => {
        const name = document.getElementById('inputSettingsServerName')?.value.trim();
        const icon = document.getElementById('inputSettingsServerIcon')?.value.trim() || '🎮';
        const desc = document.getElementById('inputSettingsServerDesc')?.value.trim();
        if (!name) {
          showToast('⚠️ Sunucu adı boş bırakılamaz!');
          return;
        }
        sendWs({
          type: 'update-server-settings',
          serverName: name,
          serverIcon: icon,
          serverDesc: desc
        });
      });
    }

    // Sidebar Header Click (Open Server Settings for Admin)
    const sidebarHeaderBtn = document.getElementById('sidebarHeaderBtn');
    if (sidebarHeaderBtn) {
      sidebarHeaderBtn.addEventListener('click', (e) => {
        if (e.target.closest('#btnQuickCreateChannel')) return;
        if (state.myRole === 'admin') {
          openSettingsModal('tab-backup');
        } else {
          showToast(`🏛️ ${state.serverSettings?.serverName || 'TalkApp'}: ${state.serverSettings?.serverDesc || 'Topluluk Sunucusu'}`, 3000);
        }
      });
    }

    // Exit Settings Without Saving (Bug 2)
    function closeSettingsWithoutSaving() {
      if (state.isMicTesting) {
        state.audioManager.setSidetoneEnabled(false);
        state.isMicTesting = false;
        if (el.btnToggleMicTest) {
          el.btnToggleMicTest.textContent = '▶ Kendi Sesini Dinle (Test Et)';
          el.btnToggleMicTest.classList.remove('btn-primary');
          el.btnToggleMicTest.classList.add('btn-secondary');
        }
      }
      el.modalSettings.classList.remove('show');
    }

    if (el.btnCloseSettingsModal) {
      el.btnCloseSettingsModal.addEventListener('click', closeSettingsWithoutSaving);
    }
    if (el.btnCancelSettings) {
      el.btnCancelSettings.addEventListener('click', closeSettingsWithoutSaving);
    }
    if (el.modalSettings) {
      el.modalSettings.addEventListener('click', (e) => {
        if (e.target === el.modalSettings) closeSettingsWithoutSaving();
      });
    }

    // Webhook Settings Listeners
    if (el.selectWebhookChannel) {
      el.selectWebhookChannel.addEventListener('change', updateWebhookCodeBox);
    }
    if (el.lblWebhookUrl) {
      el.lblWebhookUrl.addEventListener('click', () => {
        navigator.clipboard.writeText(el.lblWebhookUrl.textContent.trim()).then(() => {
          showToast('📋 Webhook URL panoya kopyalandı!');
        });
      });
    }
    if (el.btnCopyWebhookUrl) {
      el.btnCopyWebhookUrl.addEventListener('click', () => {
        if (el.lblWebhookUrl && el.lblWebhookUrl.textContent) {
          navigator.clipboard.writeText(el.lblWebhookUrl.textContent.trim()).then(() => {
            showToast('📋 Webhook URL panoya kopyalandı!');
          });
        }
      });
    }
    if (el.codeWebhookSnippet) {
      el.codeWebhookSnippet.addEventListener('click', () => {
        navigator.clipboard.writeText(el.codeWebhookSnippet.textContent.trim()).then(() => {
          showToast('📋 cURL komutu panoya kopyalandı!');
        });
      });
    }

    // PWA Install Button
    if (el.btnInstallPwa) {
      el.btnInstallPwa.addEventListener('click', async () => {
        if (state.deferredInstallPrompt) {
          state.deferredInstallPrompt.prompt();
          const { outcome } = await state.deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') showToast('🚀 Masaüstü kurulumu tamamlandı!');
          state.deferredInstallPrompt = null;
        } else {
          showToast('💡 Tarayıcınızın adres çubuğundaki "Yükle" simgesine basabilirsiniz.');
        }
      });
    }

    // System Desktop Notifications Permission Button
    if (el.btnReqDesktopNotif) {
      el.btnReqDesktopNotif.addEventListener('click', () => {
        requestNotificationPermission();
      });
    }

    // WebRTC Audio Quality & Bitrate Preference
    if (el.selectVoiceBitrate) {
      const savedBitrate = localStorage.getItem('talkapp_voice_bitrate') || '64';
      el.selectVoiceBitrate.value = savedBitrate;
      if (state.webrtc) state.webrtc.setAudioBitrate(savedBitrate);
      if (el.lblVoiceCodecBadge) el.lblVoiceCodecBadge.textContent = `Opus ${savedBitrate}k`;

      el.selectVoiceBitrate.addEventListener('change', () => {
        const val = el.selectVoiceBitrate.value;
        localStorage.setItem('talkapp_voice_bitrate', val);
        if (state.webrtc) state.webrtc.setAudioBitrate(val);
        if (el.lblVoiceCodecBadge) el.lblVoiceCodecBadge.textContent = `Opus ${val}k`;
        showToast(`📶 WebRTC ses kalitesi ayarlandı: ${val} kbps`);
      });
    }

    // Live WebRTC Connection Quality HUD ticker
    setInterval(async () => {
      if (!state.activeVoiceRoomId || !el.voiceRtcStatsBar || !state.webrtc) return;
      const stats = await state.webrtc.getConnectionStats();
      if (!stats.connected) {
        if (el.lblVoiceQualitySummary) el.lblVoiceQualitySummary.textContent = 'Bağlantı Kuruluyor...';
        return;
      }

      if (el.lblVoiceRtt) el.lblVoiceRtt.textContent = `${stats.rtt} ms`;
      if (el.lblVoiceLoss) {
        el.lblVoiceLoss.textContent = `%${stats.packetLoss}`;
        el.lblVoiceLoss.style.color = stats.packetLoss > 5 ? 'var(--red)' : '#00e676';
      }
      if (el.lblVoiceJitter) el.lblVoiceJitter.textContent = `${stats.jitter} ms`;
      if (el.lblVoiceCodecBadge) {
        const bitrateVal = el.selectVoiceBitrate?.value || '64';
        el.lblVoiceCodecBadge.textContent = `${stats.codec} ${bitrateVal}k`;
      }
      if (el.voiceQualityDot) {
        el.voiceQualityDot.style.background = stats.rtt < 60 && stats.packetLoss === 0 ? '#00e676' : stats.rtt < 120 ? '#ffd600' : '#ff2d55';
      }
      if (el.lblVoiceQualitySummary) {
        el.lblVoiceQualitySummary.textContent = stats.rtt < 60 ? 'Mükemmel HD Bağlantı' : stats.rtt < 120 ? 'İyi Bağlantı' : 'Zayıf Bağlantı';
      }
    }, 2000);

    // Global Gamer Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isEditing = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);

      // Ctrl + Shift + M : Mikrofon Sustur / Aç
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        toggleMic();
        return;
      }

      // Ctrl + Shift + D : Sağırlaştır / Aç
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleDeafen();
        return;
      }

      // Ctrl + K : Hızlı Arama & Kanal Değiştirici
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (el.inputSearchMessages) {
          if (state.activeViewType === 'voice') {
            el.voiceArena.classList.add('hidden');
            el.textChatView.classList.remove('hidden');
            state.activeViewType = 'text';
          }
          el.inputSearchMessages.focus();
          el.inputSearchMessages.select();
        }
        return;
      }

      // Escape : Açık pencereleri kapat
      if (e.key === 'Escape' && !isEditing) {
        document.querySelectorAll('.modal-backdrop.show, .channel-notif-popover:not(.hidden), .channel-header-popover:not(.hidden), .emoji-picker-popover:not(.hidden)').forEach(modal => {
          modal.classList.remove('show');
          modal.classList.add('hidden');
        });
      }
    });

    // Moderation: Kick, Mute & Move Voice Member
    el.btnKickVoiceMember.addEventListener('click', () => {
      if (state.selectedMember) {
        sendWs({ type: 'kick-voice-member', targetUserId: state.selectedMember.id });
        el.modalUserAction.classList.remove('show');
      }
    });
    el.btnServerMuteMember.addEventListener('click', () => {
      if (state.selectedMember) {
        sendWs({
          type: 'server-mute-member',
          targetUserId: state.selectedMember.id,
          mute: !state.selectedMember.serverMuted
        });
        el.modalUserAction.classList.remove('show');
      }
    });
    if (el.btnMoveVoiceMember && el.selectMoveVoiceChannel) {
      el.btnMoveVoiceMember.addEventListener('click', () => {
        if (state.selectedMember && el.selectMoveVoiceChannel.value) {
          sendWs({
            type: 'move-voice-member',
            targetUserId: state.selectedMember.id,
            targetChannelId: el.selectMoveVoiceChannel.value
          });
          el.modalUserAction.classList.remove('show');
        }
      });
    }

    // Auth Modal (Login / Register & Account Management)
    function openAuthModal() {
      if (state.isLoggedIn) {
        if (el.authLoggedInSection) el.authLoggedInSection.classList.remove('hidden');
        if (el.authFormSection) el.authFormSection.classList.add('hidden');
        if (el.authFormFooter) el.authFormFooter.classList.add('hidden');
        if (el.lblAuthModalTitle) el.lblAuthModalTitle.textContent = '👤 Hesap Yönetimi';

        if (el.authCurrentUsername) el.authCurrentUsername.textContent = state.username;
        if (el.authCurrentUserId) el.authCurrentUserId.textContent = '#' + (state.selfId ? state.selfId.slice(-4) : '0000');
        if (el.authCurrentRoleTag) {
          el.authCurrentRoleTag.textContent = state.myRole.toUpperCase();
          el.authCurrentRoleTag.className = `role-tag role-${state.myRole}`;
        }
        if (el.authCurrentAvatar) {
          if (state.myAvatar && (state.myAvatar.startsWith('http') || state.myAvatar.startsWith('data:') || state.myAvatar.startsWith('/'))) {
            el.authCurrentAvatar.innerHTML = `<img src="${state.myAvatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
          } else {
            el.authCurrentAvatar.textContent = (state.username || 'O').charAt(0).toUpperCase();
          }
        }
      } else {
        if (el.authLoggedInSection) el.authLoggedInSection.classList.add('hidden');
        if (el.authFormSection) el.authFormSection.classList.remove('hidden');
        if (el.authFormFooter) el.authFormFooter.classList.remove('hidden');
        if (el.authErrorBanner) {
          el.authErrorBanner.classList.add('hidden');
          el.authErrorBanner.textContent = '';
        }
        switchAuthMode('login');
        if (el.inputAuthUsername) el.inputAuthUsername.value = state.username.startsWith('Oyuncu') ? '' : state.username;
        if (el.inputAuthPassword) el.inputAuthPassword.value = '';
        setTimeout(() => el.inputAuthUsername?.focus(), 100);
      }
      el.modalAuth.classList.add('show');
    }

    function switchAuthMode(mode) {
      state.authMode = mode;
      if (el.authErrorBanner) el.authErrorBanner.classList.add('hidden');
      if (mode === 'login') {
        el.btnAuthTabLogin.className = 'btn-primary';
        el.btnAuthTabRegister.className = 'btn-secondary';
        el.btnAuthTabRegister.style.background = 'var(--bg-secondary)';
        el.lblAuthModalTitle.textContent = '🔐 Kalıcı Hesap Girişi';
        el.btnSubmitAuth.textContent = 'Giriş Yap';
      } else {
        el.btnAuthTabRegister.className = 'btn-primary';
        el.btnAuthTabRegister.style.background = 'var(--brand)';
        el.btnAuthTabLogin.className = 'btn-secondary';
        el.btnAuthTabLogin.style.background = 'var(--bg-secondary)';
        el.lblAuthModalTitle.textContent = '📝 Yeni Hesap Oluştur';
        el.btnSubmitAuth.textContent = 'Kayıt Ol';
      }
    }

    function submitAuth() {
      const username = el.inputAuthUsername ? el.inputAuthUsername.value.trim() : '';
      const password = el.inputAuthPassword ? el.inputAuthPassword.value : '';
      if (!username || !password) {
        showAuthError('Lütfen kullanıcı adı ve şifre girin!');
        return;
      }
      if (state.authMode === 'register' && password.length < 4) {
        showAuthError('Şifre en az 4 karakter olmalıdır!');
        return;
      }

      if (el.authErrorBanner) el.authErrorBanner.classList.add('hidden');

      if (state.authMode === 'register') {
        sendWs({ type: 'auth-register', username, password });
      } else {
        sendWs({ type: 'auth-login', username, password });
      }
    }

    function showAuthError(msg) {
      if (el.authErrorBanner) {
        el.authErrorBanner.textContent = msg;
        el.authErrorBanner.classList.remove('hidden');
      }
      showToast(`❌ ${msg}`, 4000);
    }
    window.showAuthError = showAuthError;

    if (el.btnOpenAuthModal) el.btnOpenAuthModal.addEventListener('click', openAuthModal);
    if (el.btnCloseAuthModal) el.btnCloseAuthModal.addEventListener('click', () => el.modalAuth.classList.remove('show'));
    if (el.btnCancelAuth) el.btnCancelAuth.addEventListener('click', () => el.modalAuth.classList.remove('show'));

    if (el.btnAuthTabLogin) el.btnAuthTabLogin.addEventListener('click', () => switchAuthMode('login'));
    if (el.btnAuthTabRegister) el.btnAuthTabRegister.addEventListener('click', () => switchAuthMode('register'));

    if (el.btnSubmitAuth) el.btnSubmitAuth.addEventListener('click', submitAuth);

    [el.inputAuthUsername, el.inputAuthPassword].forEach(inp => {
      if (inp) {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAuth();
          }
        });
      }
    });

    if (el.btnTogglePasswordVis && el.inputAuthPassword) {
      el.btnTogglePasswordVis.addEventListener('click', () => {
        const isPwd = el.inputAuthPassword.type === 'password';
        el.inputAuthPassword.type = isPwd ? 'text' : 'password';
        el.btnTogglePasswordVis.textContent = isPwd ? '🙈' : '👁️';
      });
    }

    if (el.btnAuthSwitchAccount) {
      el.btnAuthSwitchAccount.addEventListener('click', () => {
        if (el.authLoggedInSection) el.authLoggedInSection.classList.add('hidden');
        if (el.authFormSection) el.authFormSection.classList.remove('hidden');
        if (el.authFormFooter) el.authFormFooter.classList.remove('hidden');
        switchAuthMode('login');
        if (el.inputAuthUsername) el.inputAuthUsername.value = '';
        if (el.inputAuthPassword) el.inputAuthPassword.value = '';
        el.inputAuthUsername?.focus();
      });
    }

    if (el.btnAuthLogout) {
      el.btnAuthLogout.addEventListener('click', () => {
        localStorage.removeItem('talkapp_token');
        state.authToken = null;
        state.isLoggedIn = false;
        state.username = 'Oyuncu' + Math.floor(Math.random() * 900 + 100);
        state.myRole = 'member';
        state.role = 'member';
        localStorage.setItem('talkapp_username', state.username);
        updateMyProfileUI();
        if (el.lblAuthStatusText) el.lblAuthStatusText.textContent = '🔐 Giriş Yap / Kayıt Ol';
        if (el.btnOpenAuthModal) el.btnOpenAuthModal.title = 'Kayıt Ol veya Giriş Yap';
        el.modalAuth.classList.remove('show');
        sendWs({
          type: 'set-profile',
          name: state.username,
          status: 'online',
          gameActivity: '',
          avatarUrl: '',
          badge: ''
        });
        showToast('👋 Başarıyla çıkış yapıldı.');
      });
    }

    if (el.modalAuth) {
      el.modalAuth.addEventListener('click', (e) => {
        if (e.target === el.modalAuth) el.modalAuth.classList.remove('show');
      });
    }

    // Create Channel Modal
    if (el.btnQuickCreateChannel) {
      el.btnQuickCreateChannel.addEventListener('click', () => openCreateChannelModal('text'));
    }

    el.btnCloseCreateChannelModal.addEventListener('click', () => el.modalCreateChannel.classList.remove('show'));
    el.btnCancelCreateChannel.addEventListener('click', () => el.modalCreateChannel.classList.remove('show'));

    if (el.radioTypeChat && el.radioTypeVoice && el.voiceUserLimitGroup) {
      el.radioTypeChat.addEventListener('change', () => {
        if (el.radioTypeChat.checked) el.voiceUserLimitGroup.classList.add('hidden');
      });
      el.radioTypeVoice.addEventListener('change', () => {
        if (el.radioTypeVoice.checked) el.voiceUserLimitGroup.classList.remove('hidden');
      });
    }

    if (el.selectChannelCategory) {
      el.selectChannelCategory.addEventListener('change', () => {
        const isCustom = el.selectChannelCategory.value === 'custom';
        if (el.inputCustomCategory) el.inputCustomCategory.classList.toggle('hidden', !isCustom);
      });
    }

    el.chkProtectPassword.addEventListener('change', (e) => {
      el.inputChannelPassword.classList.toggle('hidden', !e.target.checked);
    });

    el.btnConfirmCreateChannel.addEventListener('click', () => {
      const name = el.inputNewChannelName.value.trim();
      if (!name) return showToast('⚠️ Lütfen bir kanal adı girin!');
      const type = el.radioTypeVoice.checked ? 'voice' : 'text';
      const minRole = el.selectChannelMinRole.value;
      const pwd = el.chkProtectPassword.checked ? el.inputChannelPassword.value.trim() : null;
      const userLimit = type === 'voice' && el.selectVoiceUserLimit ? parseInt(el.selectVoiceUserLimit.value || '0', 10) : 0;

      let cat = el.selectChannelCategory ? el.selectChannelCategory.value : 'GENEL SOHBET';
      if (cat === 'custom' && el.inputCustomCategory) {
        cat = el.inputCustomCategory.value.trim() || 'DİĞER';
      }

      sendWs({
        type: 'create-channel',
        channelType: type,
        name: name,
        category: cat,
        minRole: minRole,
        password: pwd,
        userLimit: userLimit
      });
      el.modalCreateChannel.classList.remove('show');
    });

    // Password Submit Modal
    el.btnCloseChannelPasswordModal.addEventListener('click', () => el.modalChannelPassword.classList.remove('show'));
    el.btnCancelEnteredPassword.addEventListener('click', () => el.modalChannelPassword.classList.remove('show'));
    el.btnSubmitEnteredPassword.addEventListener('click', () => {
      const pwd = el.inputEnteredPassword.value.trim();
      if (state.pendingPasswordChannel) {
        const ch = state.pendingPasswordChannel;
        el.modalChannelPassword.classList.remove('show');
        if (ch.id.startsWith('voice-') || ch.id.includes('ses') || ch.id.includes('oyun')) {
          joinVoiceChannel(ch.id, ch.name, pwd);
        } else {
          selectTextChannel(ch.id, ch.name, pwd);
        }
      }
    });

    // User Action Modal
    el.btnCloseUserActionModal.addEventListener('click', () => el.modalUserAction.classList.remove('show'));
    el.btnStartDmFromModal.addEventListener('click', () => {
      el.modalUserAction.classList.remove('show');
      if (state.selectedMember) openDmChat(state.selectedMember.id, state.selectedMember.name);
    });
    if (el.btnConfirmAssignRole) {
      el.btnConfirmAssignRole.addEventListener('click', () => {
        if (!state.selectedMember) return;
        const checkedBoxes = el.memberRolesCheckList ? el.memberRolesCheckList.querySelectorAll('.chk-assign-member-role:checked') : [];
        const roleIds = Array.from(checkedBoxes).map(cb => cb.value);
        sendWs({
          type: 'assign-member-roles',
          serverId: state.currentServerId,
          targetUserId: state.selectedMember.id,
          roleIds: roleIds
        });
        showToast('💾 Roller güncellendi!');
        el.modalUserAction?.classList.remove('show');
      });
    }

    // Server Connect Modal & Domain Gateway
    const openServerModal = (tab = 'create') => {
      if (!el.modalServerConnect) return;
      el.modalServerConnect.classList.add('show');
      if (tab === 'join') {
        el.tabModalJoinServer?.click();
      } else if (tab === 'domain') {
        el.tabModalDomainGateway?.click();
      } else {
        el.tabModalCreateServer?.click();
      }
    };
    window.openServerModal = openServerModal;

    if (el.btnHeaderServer) {
      el.btnHeaderServer.addEventListener('click', () => openServerModal('domain'));
    }

    document.querySelectorAll('.server-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const host = btn.getAttribute('data-host');
        if (host && el.inputServerHost) {
          el.inputServerHost.value = host;
        }
      });
    });

    if (el.inputServerHost) {
      el.inputServerHost.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          el.btnConfirmServerConnect?.click();
        }
      });
    }

    if (el.btnConfirmServerConnect) {
      el.btnConfirmServerConnect.addEventListener('click', () => {
        const h = el.inputServerHost?.value.trim();
        if (h) {
          el.modalServerConnect?.classList.remove('show');
          switchServerHost(h);
        } else {
          showToast('⚠️ Lütfen bir sunucu adresi veya domain girin.');
        }
      });
    }

    // Keyboard Shortcuts, PTT, Push-to-Mute (PTM) & Toggle Mute Key Handling
    window.addEventListener('keydown', (e) => {
      // 1. Key binding capture in settings
      if (state.isBindingPttKey) {
        e.preventDefault();
        const keyName = e.code || e.key;
        state.pttKey = keyName;
        state.audioManager.setPttKey(keyName);
        el.btnBindPttKey.textContent = keyName;
        el.btnBindPttKey.classList.remove('recording');
        state.isBindingPttKey = false;
        showToast(`⌨️ Bas-Konuş tuşu ayarlandı: [${keyName}]`);
        return;
      }

      if (state.isBindingPtmKey) {
        e.preventDefault();
        const keyName = e.code || e.key;
        state.ptmKey = keyName;
        state.audioManager.setPtmKey(keyName);
        if (el.btnBindPtmKey) {
          el.btnBindPtmKey.textContent = keyName;
          el.btnBindPtmKey.classList.remove('recording');
        }
        state.isBindingPtmKey = false;
        showToast(`🤫 Bas-Sustur (Basılı Tutarken Sustur) tuşu ayarlandı: [${keyName}]`);
        return;
      }

      if (state.isBindingMuteToggleKey) {
        e.preventDefault();
        const keyName = e.code || e.key;
        state.muteToggleKey = keyName;
        state.audioManager.setMuteToggleKey(keyName);
        if (el.btnBindMuteToggleKey) {
          el.btnBindMuteToggleKey.textContent = keyName;
          el.btnBindMuteToggleKey.classList.remove('recording');
        }
        state.isBindingMuteToggleKey = false;
        showToast(`🔇 Mikrofon Aç/Kapat tuşu ayarlandı: [${keyName}]`);
        return;
      }

      if (state.isBindingDeafenKey) {
        e.preventDefault();
        const keyName = e.code || e.key;
        state.deafenKey = keyName;
        localStorage.setItem('talkapp_deafen_key', keyName);
        if (el.btnBindDeafenKey) {
          el.btnBindDeafenKey.textContent = keyName;
          el.btnBindDeafenKey.classList.remove('recording');
        }
        state.isBindingDeafenKey = false;
        showToast(`🎧 Kulaklık Kapatma tuşu ayarlandı: [${keyName}]`);
        return;
      }

      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || (document.activeElement && document.activeElement.isContentEditable)) {
        return;
      }

      // 1. Ana Kısayollar Kilidi (Oyun oynarken veya maç aralarında tuşların karışmasını önler)
      if (!state.shortcutsMasterEnabled) {
        return;
      }

      // Ignore key repeat events while holding a key down
      if (e.repeat) {
        if ((state.audioManager.inputMode === 'ptt' && (e.code === state.pttKey || e.key === state.pttKey)) ||
            (state.audioManager.inputMode !== 'ptt' && (e.code === state.ptmKey || e.key === state.ptmKey))) {
          e.preventDefault();
        }
        return;
      }

      // 2. PTT (Bas-Konuş) Activation
      if (state.audioManager.inputMode === 'ptt' && (e.code === state.pttKey || e.key === state.pttKey)) {
        e.preventDefault();
        if (!state.audioManager.pttPressed && !state.isMicMuted && !state.serverMuted) {
          state.audioManager.setPttPressed(true);
          if (el.lblBtnMic) el.lblBtnMic.textContent = 'Konuşuluyor (PTT)';
          if (state.audioManager.pttSoundEnabled) state.audioManager.playMicStatusSound(false);
        }
        return;
      }

      // 3. PTM (Bas-Sustur / Toggle Mute - Tekrar basana kadar susturur)
      if (state.ptmShortcutEnabled && state.audioManager.inputMode !== 'ptt' && (e.code === state.ptmKey || e.key === state.ptmKey)) {
        e.preventDefault();
        if (e.repeat) return; // Basılı tutulduğunda ardışık aç-kapa yapmasını engelle
        setPushToMuteActive(!state.isPtmPressed);
        return;
      }

      // 4. Toggle Mute (Bas-Kapat / Bas-Aç) & Deafen Shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (state.muteShortcutEnabled && (e.code === state.muteToggleKey || e.key === state.muteToggleKey || (state.muteToggleKey === 'KeyM' && (e.key === 'm' || e.key === 'M')))) {
        e.preventDefault();
        toggleMic();
        return;
      }
      if (state.deafenShortcutEnabled && (e.code === state.deafenKey || e.key === state.deafenKey || (state.deafenKey === 'KeyD' && (e.key === 'd' || e.key === 'D')))) {
        e.preventDefault();
        toggleDeafen();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (state.audioManager.inputMode === 'ptt' && (e.code === state.pttKey || e.key === state.pttKey)) {
        if (state.audioManager.pttPressed) {
          state.audioManager.setPttPressed(false);
          if (el.lblBtnMic) el.lblBtnMic.textContent = state.isMicMuted ? 'Sessizde' : 'Mikrofon';
          if (state.audioManager.pttSoundEnabled) state.audioManager.playMicStatusSound(true);
        }
      }
    });

    window.addEventListener('blur', () => {
      if (state.audioManager && state.audioManager.pttPressed) {
        state.audioManager.setPttPressed(false);
        if (el.lblBtnMic) el.lblBtnMic.textContent = state.isMicMuted ? 'Sessizde' : 'Mikrofon';
      }
    });
  }

  // ========================================================
  // VOICE CHANGER (GERÇEK ZAMANLI SES DEĞİŞTİRİCİ)
  // ========================================================
  function setupVoiceChangerUI() {
    if (!el.voiceFxGrid) return;
    const cards = el.voiceFxGrid.querySelectorAll('.voice-fx-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (!state.voiceChangerEnabled) {
          state.voiceChangerEnabled = true;
          localStorage.setItem('talkapp_voice_fx_enabled', 'true');
          if (el.chkVoiceChangerEnabled) el.chkVoiceChangerEnabled.checked = true;
          if (el.voiceFxGrid) el.voiceFxGrid.classList.remove('disabled');
        }
        const fx = card.getAttribute('data-fx') || 'none';
        state.activeVoiceFx = fx;
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const fxName = card.querySelector('.voice-fx-name')?.textContent || fx;
        if (el.lblActiveVoiceFx) {
          el.lblActiveVoiceFx.textContent = fxName;
          el.lblActiveVoiceFx.classList.remove('disabled');
        }
        state.audioManager.setVoiceEffect(fx);
        showToast(`🎭 Ses Değiştirici: ${fxName}`);
      });
    });
  }

  // ========================================================
  // WATCH PARTY (BİRLİKTE YOUTUBE İZLE)
  // ========================================================
  function extractYouTubeId(url) {
    if (!url) return null;
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    try {
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const parsed = new URL(trimmed);
        const v = parsed.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

        if (parsed.hostname === 'youtu.be' || parsed.hostname.endsWith('.youtu.be')) {
          const pathId = parsed.pathname.slice(1).split('/')[0];
          if (/^[a-zA-Z0-9_-]{11}$/.test(pathId)) return pathId;
        }

        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && ['embed', 'shorts', 'v', 'live'].includes(parts[0])) {
          if (/^[a-zA-Z0-9_-]{11}$/.test(parts[1])) return parts[1];
        }
      }
    } catch (e) {}

    const match = trimmed.match(/(?:(?:[a-zA-Z0-9-]+\.)?youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (match && match[1]) return match[1];
    return null;
  }

  function sendWatchPartyYtCommand(func, args = []) {
    const iframe = document.getElementById('wpIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    }
  }

  function sendMusicBotYtCommand(func, args = []) {
    const iframe = document.getElementById('bgMusicYtFrame');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    }
  }

  function sendYtIframeCommand(func, args = []) {
    sendWatchPartyYtCommand(func, args);
  }

  function setupWatchParty() {
    if (el.btnCallWatchParty) {
      el.btnCallWatchParty.addEventListener('click', () => {
        if (!state.activeVoiceRoomId) {
          showToast('⚠️ Watch Party için önce bir ses kanalına bağlanmalısınız.');
          return;
        }
        el.watchPartyContainer.classList.toggle('hidden');
        if (!el.watchPartyContainer.classList.contains('hidden')) {
          el.inputWatchPartyUrl?.focus();
        }
      });
    }

    if (el.btnCloseWatchParty) {
      el.btnCloseWatchParty.addEventListener('click', () => {
        if (state.activeVoiceRoomId) {
          sendWs({
            type: 'watch-party-command',
            roomId: state.activeVoiceRoomId,
            action: 'stop'
          });
        }
        closeWatchPartyPlayer();
      });
    }

    if (el.btnStartWatchPartyVideo) {
      el.btnStartWatchPartyVideo.addEventListener('click', () => {
        startWatchPartyFromInput();
      });
    }

    if (el.inputWatchPartyUrl) {
      el.inputWatchPartyUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startWatchPartyFromInput();
      });
    }

    document.querySelectorAll('.preset-pill[data-yt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const vid = btn.getAttribute('data-yt');
        if (vid) startWatchPartyVideo(vid);
      });
    });

    if (el.btnWpTogglePlay) {
      el.btnWpTogglePlay.addEventListener('click', () => {
        if (!state.activeVoiceRoomId || !state.watchPartyState.videoId) return;
        const isPlaying = state.watchPartyState.state === 'play' || state.watchPartyState.state === 'playing';
        const nextAction = isPlaying ? 'pause' : 'play';
        sendWs({
          type: 'watch-party-command',
          roomId: state.activeVoiceRoomId,
          action: nextAction,
          currentTime: state.watchPartyState.currentTime || 0
        });
      });
    }

    if (el.btnWpRewind) {
      el.btnWpRewind.addEventListener('click', () => {
        if (!state.activeVoiceRoomId || !state.watchPartyState.videoId) return;
        const newTime = Math.max(0, (state.watchPartyState.currentTime || 0) - 15);
        state.watchPartyState.currentTime = newTime;
        sendWs({
          type: 'watch-party-command',
          roomId: state.activeVoiceRoomId,
          action: 'seek',
          currentTime: newTime
        });
      });
    }

    if (el.btnWpForward) {
      el.btnWpForward.addEventListener('click', () => {
        if (!state.activeVoiceRoomId || !state.watchPartyState.videoId) return;
        const newTime = (state.watchPartyState.currentTime || 0) + 15;
        state.watchPartyState.currentTime = newTime;
        sendWs({
          type: 'watch-party-command',
          roomId: state.activeVoiceRoomId,
          action: 'seek',
          currentTime: newTime
        });
      });
    }



    if (el.btnWpFullscreen) {
      el.btnWpFullscreen.addEventListener('click', () => {
        const target = el.watchPartyPlayerBox || el.watchPartyIframeContainer;
        if (!target) return;
        if (!document.fullscreenElement) {
          target.requestFullscreen?.().catch(err => {
            showToast('⚠️ Tam ekran başlatılamadı: ' + err.message);
          });
        } else {
          document.exitFullscreen?.();
        }
      });
    }

    if (el.btnWpAudioOnlyToggle) {
      el.btnWpAudioOnlyToggle.addEventListener('click', () => {
        toggleWatchPartyAudioOnly();
      });
    }

    if (el.sliderWpVolume) {
      el.sliderWpVolume.addEventListener('input', () => {
        const val = parseInt(el.sliderWpVolume.value, 10);
        sendYtIframeCommand('setVolume', [val]);
        if (val === 0) sendYtIframeCommand('mute');
        else sendYtIframeCommand('unMute');
      });
    }

    // Local playback ticker to keep approximate currentTime accurate for rewinds/forwards
    setInterval(() => {
      if (state.watchPartyState && (state.watchPartyState.state === 'play' || state.watchPartyState.state === 'playing') && state.watchPartyState.videoId) {
        state.watchPartyState.currentTime = (state.watchPartyState.currentTime || 0) + 1;
      }
    }, 1000);
  }

  function toggleWatchPartyAudioOnly(forceState) {
    state.isWpAudioOnly = typeof forceState === 'boolean' ? forceState : !state.isWpAudioOnly;
    if (el.watchPartyPlayerBox) {
      el.watchPartyPlayerBox.classList.toggle('audio-only-active', state.isWpAudioOnly);
    }
    if (el.wpAudioOnlyBanner) {
      el.wpAudioOnlyBanner.classList.toggle('hidden', !state.isWpAudioOnly);
    }
    if (el.btnWpAudioOnlyToggle) {
      el.btnWpAudioOnlyToggle.textContent = state.isWpAudioOnly ? '📺 Video Modu' : '🎧 Sadece Ses';
      el.btnWpAudioOnlyToggle.classList.toggle('active-state', state.isWpAudioOnly);
    }
  }

  function startWatchPartyFromInput() {
    const rawUrl = el.inputWatchPartyUrl?.value.trim() || '';
    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      showToast('❌ Geçersiz YouTube video bağlantısı veya Video ID!');
      return;
    }
    if (rawUrl.includes('music.youtube.com')) {
      toggleWatchPartyAudioOnly(true);
    }
    startWatchPartyVideo(videoId);
  }

  function startWatchPartyVideo(videoId) {
    if (!state.activeVoiceRoomId) {
      showToast('⚠️ Watch Party başlatmak için bir ses odasında olmalısınız.');
      return;
    }

    // Optimistic local update: load player immediately without waiting for network round-trip
    handleWatchPartySync({
      roomId: state.activeVoiceRoomId,
      action: 'load',
      videoId: videoId,
      state: { videoId: videoId, state: 'play', currentTime: 0 }
    });

    sendWs({
      type: 'watch-party-command',
      roomId: state.activeVoiceRoomId,
      action: 'load',
      videoId: videoId
    });
    showToast('📺 Watch Party başlatılıyor...');
  }

  function handleWatchPartySync(data) {
    if (data.roomId !== state.activeVoiceRoomId) return;

    const videoId = data.videoId || (data.state && data.state.videoId);
    const action = data.action || (data.state && data.state.state);

    if (!videoId || action === 'stop' || action === 'close') {
      closeWatchPartyPlayer();
      return;
    }

    if (el.watchPartyContainer) el.watchPartyContainer.classList.remove('hidden');

    const needsReload = state.watchPartyState.videoId !== videoId || !document.getElementById('wpIframe');
    state.watchPartyState.videoId = videoId;

    const wpState = (data.state && data.state.state) || action || 'play';
    state.watchPartyState.state = wpState;

    if (data.state && typeof data.state.currentTime === 'number') {
      state.watchPartyState.currentTime = data.state.currentTime;
    } else if (typeof data.currentTime === 'number') {
      state.watchPartyState.currentTime = data.currentTime;
    }

    if (el.lblWpAudioTitle) {
      el.lblWpAudioTitle.textContent = data.title || (data.state && data.state.title) || 'YouTube Müzik / Video';
    }

    if (needsReload && el.watchPartyIframeContainer) {
      const startParam = Math.floor(state.watchPartyState.currentTime || 0);
      const ytSrc = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}&start=${startParam}`;
      el.watchPartyIframeContainer.innerHTML = `
        <iframe id="wpIframe" width="100%" height="100%" src="${ytSrc}" title="Watch Party" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen style="border-radius:var(--radius-sm); border:none; width:100%; height:100%;"></iframe>
      `;
    } else {
      if (action === 'pause' || wpState === 'pause' || wpState === 'paused') {
        sendYtIframeCommand('pauseVideo');
      } else if (action === 'play' || wpState === 'play' || wpState === 'playing') {
        sendYtIframeCommand('playVideo');
      }
      if (action === 'seek' && typeof state.watchPartyState.currentTime === 'number') {
        sendYtIframeCommand('seekTo', [state.watchPartyState.currentTime, true]);
      }
    }

    const isPlaying = wpState === 'play' || wpState === 'playing';
    if (el.lblWatchPartySyncStatus) {
      el.lblWatchPartySyncStatus.textContent = isPlaying ? '● Canlı İzleniyor' : '⏸️ Duraklatıldı';
    }
    if (el.btnWpTogglePlay) {
      el.btnWpTogglePlay.textContent = isPlaying ? '⏸️ Duraklat' : '▶️ Oynat';
    }

    if (data.senderName && data.senderName !== state.username) {
      if (action === 'load') showToast(`📺 @${data.senderName} yeni bir video başlattı!`);
      else if (action === 'pause') showToast(`⏸️ @${data.senderName} videoyu duraklattı.`);
      else if (action === 'play') showToast(`▶️ @${data.senderName} videoyu devam ettirdi.`);
      else if (action === 'seek') showToast(`⏩ @${data.senderName} videoyu sardı (${Math.round(state.watchPartyState.currentTime)}s).`);
    }
  }

  function closeWatchPartyPlayer() {
    try {
      sendYtIframeCommand('pauseVideo');
      sendYtIframeCommand('stopVideo');
    } catch (e) {}

    toggleWatchPartyAudioOnly(false);

    if (el.watchPartyContainer) el.watchPartyContainer.classList.add('hidden');
    if (el.watchPartyIframeContainer) {
      const iframe = el.watchPartyIframeContainer.querySelector('iframe');
      if (iframe) {
        iframe.src = 'about:blank';
        iframe.remove();
      }
      el.watchPartyIframeContainer.innerHTML = '';
    }
    state.watchPartyState.videoId = '';
    state.watchPartyState.state = 'paused';
    state.watchPartyState.currentTime = 0;
  }

  // ========================================================
  // SCREEN ANNOTATION & LASER POINTER
  // ========================================================
  function attachScreenAnnotationToCard(card) {
    if (!card || card.querySelector('.screen-annotation-canvas')) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'screen-annotation-canvas interactive';
    canvas.id = `annotation-canvas-${card.id}`;

    const laserDot = document.createElement('div');
    laserDot.className = 'laser-pointer-dot hidden';
    laserDot.id = `laser-dot-${card.id}`;
    laserDot.innerHTML = `<span class="laser-pointer-label" id="laser-label-${card.id}">${escapeHtml(state.username)}</span>`;

    const toolbar = document.createElement('div');
    toolbar.className = 'screen-annotation-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="annotation-btn active" data-tool="laser" title="Lazer Gösterici">🔴 Lazer</button>
      <button type="button" class="annotation-btn" data-tool="pen" title="Canlı Çizim">✏️ Çizim</button>
      <div style="display:flex; gap:4px; align-items:center;">
        <div class="annotation-color-dot active" data-color="#ff2d55" style="background:#ff2d55;" title="Kırmızı"></div>
        <div class="annotation-color-dot" data-color="#00e676" style="background:#00e676;" title="Yeşil"></div>
        <div class="annotation-color-dot" data-color="#00b0ff" style="background:#00b0ff;" title="Mavi"></div>
        <div class="annotation-color-dot" data-color="#ffd600" style="background:#ffd600;" title="Sarı"></div>
      </div>
      <button type="button" class="annotation-btn" data-tool="clear" title="Çizimleri Temizle">🧹 Temizle</button>
    `;

    card.appendChild(canvas);
    card.appendChild(laserDot);
    card.appendChild(toolbar);

    function resizeCanvas() {
      const rect = card.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d');

    toolbar.querySelectorAll('.annotation-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = btn.getAttribute('data-tool');
        if (tool === 'clear') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (state.activeVoiceRoomId) {
            sendWs({ type: 'screen-annotation-clear', roomId: state.activeVoiceRoomId });
          }
          return;
        }
        state.activeAnnotationTool = tool;
        toolbar.querySelectorAll('.annotation-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    toolbar.querySelectorAll('.annotation-color-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        toolbar.querySelectorAll('.annotation-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.annotationColor = dot.getAttribute('data-color') || '#ff2d55';
      });
    });

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
      if (state.activeAnnotationTool !== 'pen') return;
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      lastX = (e.clientX - rect.left) / rect.width;
      lastY = (e.clientY - rect.top) / rect.height;
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const curX = (e.clientX - rect.left) / rect.width;
      const curY = (e.clientY - rect.top) / rect.height;

      if (state.activeAnnotationTool === 'laser') {
        laserDot.classList.remove('hidden');
        laserDot.style.left = `${curX * 100}%`;
        laserDot.style.top = `${curY * 100}%`;
        const label = laserDot.querySelector('.laser-pointer-label');
        if (label) label.textContent = state.username;

        if (state.activeVoiceRoomId) {
          sendWs({
            type: 'screen-annotation-laser',
            roomId: state.activeVoiceRoomId,
            x: curX,
            y: curY,
            username: state.username
          });
        }
      } else if (state.activeAnnotationTool === 'pen' && isDrawing) {
        drawStroke(ctx, canvas, lastX, lastY, curX, curY, state.annotationColor);

        if (state.activeVoiceRoomId) {
          sendWs({
            type: 'screen-annotation-draw',
            roomId: state.activeVoiceRoomId,
            fromX: lastX,
            fromY: lastY,
            toX: curX,
            toY: curY,
            color: state.annotationColor
          });
        }
        lastX = curX;
        lastY = curY;
      }
    });

    const stopDrawing = () => {
      if (isDrawing) isDrawing = false;
    };
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', () => {
      stopDrawing();
      laserDot.classList.add('hidden');
    });
  }

  function detachScreenAnnotationFromCard(card) {
    if (!card) return;
    const canvas = card.querySelector('.screen-annotation-canvas');
    if (canvas) canvas.remove();
    const laserDot = card.querySelector('.laser-pointer-dot');
    if (laserDot) laserDot.remove();
    const toolbar = card.querySelector('.screen-annotation-toolbar');
    if (toolbar) toolbar.remove();
  }

  function drawStroke(ctx, canvas, fromX, fromY, toX, toY, color) {
    if (!ctx || !canvas) return;
    ctx.strokeStyle = color || '#ff2d55';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(fromX * canvas.width, fromY * canvas.height);
    ctx.lineTo(toX * canvas.width, toY * canvas.height);
    ctx.stroke();
  }

  function handleRemoteAnnotationDraw(data) {
    const canvases = document.querySelectorAll('.screen-annotation-canvas');
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      drawStroke(ctx, canvas, data.fromX, data.fromY, data.toX, data.toY, data.color);
    });
  }

  function handleRemoteLaserPointer(data) {
    const laserDots = document.querySelectorAll('.laser-pointer-dot');
    const name = data.username || data.senderName;
    laserDots.forEach(dot => {
      dot.classList.remove('hidden');
      dot.style.left = `${data.x * 100}%`;
      dot.style.top = `${data.y * 100}%`;
      const label = dot.querySelector('.laser-pointer-label');
      if (label && name) label.textContent = name;
    });
  }

  function handleRemoteAnnotationClear() {
    const canvases = document.querySelectorAll('.screen-annotation-canvas');
    canvases.forEach(canvas => {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  // ========================================================
  // ROLE & CHANNEL PERMISSIONS MATRIX
  // ========================================================
  const PERMISSIONS_LIST = [
    { key: 'manage_channels', label: '📢 Kanalları Yönet / Oluştur / Sil' },
    { key: 'kick_members', label: '🚪 Sesten Kullanıcı At' },
    { key: 'mute_members', label: '🔇 Kullanıcıları Sustur' },
    { key: 'upload_files', label: '📁 Dosya ve Sesli Not Yükle' },
    { key: 'use_soundboard', label: '🔊 Soundboard ve Efektleri Çal' },
    { key: 'create_temp_voice', label: '🎙️ Dinamik Geçici Oda Aç' },
    { key: 'mention_everyone', label: '🔔 @everyone & @hepsi Etiketle' },
    { key: 'watch_party', label: '📺 Watch Party Başlat' }
  ];

  function setupPermissionsMatrix() {
    if (el.btnTabPermissions) {
      el.btnTabPermissions.addEventListener('click', () => {
        sendWs({ type: 'get-role-permissions' });
      });
    }

    if (el.btnSaveRolePermissions) {
      el.btnSaveRolePermissions.addEventListener('click', () => {
        if (state.myRole !== 'admin') {
          showToast('⚠️ Sadece Sunucu Yöneticisi (Admin) izinleri değiştirebilir.');
          return;
        }
        const roles = ['member', 'vip', 'mod', 'admin'];
        roles.forEach(role => {
          const perms = {};
          PERMISSIONS_LIST.forEach(p => {
            const chk = document.getElementById(`perm-${role}-${p.key}`);
            perms[p.key] = !!(chk && chk.checked);
          });
          sendWs({
            type: 'update-role-permissions',
            role: role,
            permissions: perms
          });
        });
        showToast('🛡️ İzinler sunucuya kaydedildi.');
      });
    }
  }

  function hasPermEntry(roleEntry, key) {
    if (!roleEntry) return false;
    if (Array.isArray(roleEntry)) return roleEntry.includes(key);
    if (typeof roleEntry === 'object') return !!roleEntry[key];
    return false;
  }

  function renderRolePermissions(permMap) {
    if (!el.permMatrixBody || !permMap) return;
    el.permMatrixBody.innerHTML = '';

    PERMISSIONS_LIST.forEach(p => {
      const tr = document.createElement('tr');
      const isMember = hasPermEntry(permMap.member, p.key);
      const isVip = hasPermEntry(permMap.vip, p.key);
      const isMod = hasPermEntry(permMap.mod, p.key);
      const isAdmin = permMap.admin ? hasPermEntry(permMap.admin, p.key) : true;

      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-heading);">${p.label}</td>
        <td style="text-align:center;"><input type="checkbox" id="perm-member-${p.key}" ${isMember ? 'checked' : ''}></td>
        <td style="text-align:center;"><input type="checkbox" id="perm-vip-${p.key}" ${isVip ? 'checked' : ''}></td>
        <td style="text-align:center;"><input type="checkbox" id="perm-mod-${p.key}" ${isMod ? 'checked' : ''}></td>
        <td style="text-align:center;"><input type="checkbox" id="perm-admin-${p.key}" ${isAdmin ? 'checked' : ''}></td>
      `;
      el.permMatrixBody.appendChild(tr);
    });
  }

  // ========================================================
  // SERVER BACKUP & RESTORE
  // ========================================================
  function setupServerBackup() {
    if (el.btnTabBackup) {
      el.btnTabBackup.addEventListener('click', () => {
        // Tab activated
      });
    }

    if (el.btnExportServerBackup) {
      el.btnExportServerBackup.addEventListener('click', () => {
        sendWs({ type: 'get-server-backup' });
        showToast('📥 Sunucu yedeği hazırlanıyor...');
      });
    }

    if (el.btnTriggerRestoreBackup && el.fileServerBackup) {
      el.btnTriggerRestoreBackup.addEventListener('click', () => {
        el.fileServerBackup.click();
      });

      el.fileServerBackup.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const backup = JSON.parse(ev.target.result);
            if (!backup || !backup.channels) {
              throw new Error('Geçersiz yedek dosyası yapısı.');
            }
            if (confirm(`⚠️ Sunucuyu "${file.name}" yedeğinden geri yüklemek istediğinize emin misiniz? Mevcut kanallar ve ayarlar güncellenecektir.`)) {
              sendWs({
                type: 'restore-server-backup',
                backup: backup
              });
              showToast('⏳ Sunucu geri yükleniyor...');
            }
          } catch (err) {
            showToast('❌ Yedek dosyası okunamadı: ' + err.message);
          }
          el.fileServerBackup.value = '';
        };
        reader.readAsText(file);
      });
    }
  }

  function downloadServerBackupFile(backup) {
    if (!backup) return;
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talkapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('💾 Sunucu yedeği bilgisayarınıza indirildi!');
  }

  // ========================================================
  // THREADS (MESAJ KONULARI / ALT BAŞLIKLAR)
  // ========================================================
  function setupThreads() {
    if (el.btnCloseThreadSidebar) {
      el.btnCloseThreadSidebar.addEventListener('click', () => {
        el.chatThreadSidebar.classList.add('hidden');
        state.activeThreadParentId = null;
        state.activeThreadParentMsg = null;
      });
    }

    if (el.btnSendThreadMsg) {
      el.btnSendThreadMsg.addEventListener('click', sendThreadMessage);
    }

    if (el.threadTextarea) {
      el.threadTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendThreadMessage();
        }
      });
    }
  }

  window.openThreadForMessage = (messageId) => {
    const parentMsg = state.currentMessages.find(m => m.id === messageId);
    if (!parentMsg) return;

    state.activeThreadParentId = messageId;
    state.activeThreadParentMsg = parentMsg;

    if (el.threadParentCard) {
      el.threadParentCard.innerHTML = `
        <div style="font-weight:700; font-size:13px; color:var(--text-heading); margin-bottom:4px;">
          ${escapeHtml(parentMsg.senderName)} <span style="font-size:11px; font-weight:400; color:var(--text-muted);">${parentMsg.time || ''}</span>
        </div>
        <div style="font-size:13px; color:var(--text-normal); line-height:1.4;">
          ${formatMessageText(parentMsg.text || '')}
        </div>
      `;
    }

    if (el.threadMessagesList) {
      el.threadMessagesList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">Yanıtlar yükleniyor...</div>';
    }

    el.chatThreadSidebar.classList.remove('hidden');
    el.threadTextarea?.focus();

    sendWs({
      type: 'get-thread-messages',
      parentId: messageId
    });
  };

  function sendThreadMessage() {
    if (!state.activeThreadParentId) return;
    const text = el.threadTextarea.value.trim();
    if (!text) return;

    sendWs({
      type: 'send-thread-msg',
      parentId: state.activeThreadParentId,
      channelId: state.activeChannelId,
      text: text
    });

    el.threadTextarea.value = '';
  }

  function renderThreadMessagesList(parentId, messages) {
    if (state.activeThreadParentId !== parentId || !el.threadMessagesList) return;
    el.threadMessagesList.innerHTML = '';

    if (!messages || messages.length === 0) {
      el.threadMessagesList.innerHTML = `
        <div style="padding:24px 16px; text-align:center; color:var(--text-muted); font-size:12px;">
          💬 Bu konudaki ilk yanıtı sen yaz!
        </div>
      `;
      return;
    }

    messages.forEach(m => {
      appendThreadBubble(m);
    });
  }

  function appendThreadBubble(msg) {
    if (!el.threadMessagesList) return;
    const row = document.createElement('div');
    row.className = 'chat-message-row';
    row.style.padding = '8px 12px';
    row.innerHTML = `
      <div class="chat-msg-avatar" style="width:28px; height:28px; font-size:12px;">${(msg.senderName || 'O').charAt(0).toUpperCase()}</div>
      <div class="chat-msg-content" style="flex:1;">
        <div class="chat-msg-meta" style="font-size:12px;">
          <span style="font-weight:700; color:var(--text-heading);">${escapeHtml(msg.senderName)}</span>
          <span class="chat-msg-time">${msg.time || ''}</span>
        </div>
        <div class="chat-msg-text" style="font-size:13px;">${formatMessageText(msg.text || '')}</div>
      </div>
    `;
    el.threadMessagesList.appendChild(row);
    el.threadMessagesList.scrollTop = el.threadMessagesList.scrollHeight;
  }

  function handleNewThreadMessage(data) {
    if (!data) return;
    const msg = data.message || data;
    const parentId = data.parentId || msg.threadParentId || msg.thread_parent_id;
    if (!parentId) return;

    if (state.activeThreadParentId === parentId) {
      appendThreadBubble(msg);
    }
    const badge = document.getElementById(`thread-badge-${parentId}`);
    if (badge) {
      badge.classList.remove('hidden');
      const countSpan = badge.querySelector('span');
      if (countSpan) {
        const parentMsg = state.currentMessages.find(m => m.id === parentId);
        const prevCount = parentMsg ? (parentMsg.threadCount ?? parentMsg.thread_count ?? 0) : 0;
        const currentCount = data.threadCount !== undefined ? data.threadCount : prevCount + 1;
        if (parentMsg) {
          parentMsg.threadCount = currentCount;
          parentMsg.thread_count = currentCount;
        }
        countSpan.textContent = `🗂️ ${currentCount} yanıt`;
      }
    }
  }

  function saveRecentServer(host) {
    let recents = JSON.parse(localStorage.getItem('talkapp_recent_servers') || '[]');
    recents = recents.filter(h => h !== host);
    recents.unshift(host);
    if (recents.length > 6) recents.pop();
    localStorage.setItem('talkapp_recent_servers', JSON.stringify(recents));
    localStorage.setItem('talkapp_server_host', host);
    renderServerRail();
  }

  // ========================================================
  // DISCORD-STYLE MULTI-SERVER & HOME SYSTEM
  // ========================================================
  function switchServer(serverId) {
    if (!serverId) return;
    if (state.currentServerId === serverId) {
      if (serverId === 'home') {
        state.activeHomeView = 'friends';
        showFriendsDashboardView();
        renderChannelsList();
      }
      return;
    }

    state.unreadServers.delete(serverId);

    if (serverId === 'home') {
      state.currentServerId = 'home';
      state.activeHomeView = 'friends';
      sendWs({ type: 'switch-server', serverId: 'home' });
      renderServerRail();
      renderChannelsList();
      showFriendsDashboardView();
      return;
    }

    state.activeHomeView = 'channels';
    sendWs({ type: 'switch-server', serverId: serverId });
  }

  function renderServerRail() {
    // 1. Home button active state
    if (el.wrapRailHome) {
      const isHome = state.currentServerId === 'home';
      el.wrapRailHome.classList.toggle('active', isHome);
      el.btnRailHome?.classList.toggle('active', isHome);
    }

    if (!el.railServersList) return;
    el.railServersList.innerHTML = '';

    (state.myServers || []).forEach(srv => {
      const wrap = document.createElement('div');
      const isActive = state.currentServerId === srv.id;
      wrap.className = 'rail-item-wrap' + (isActive ? ' active' : '');
      wrap.title = srv.name;

      const pill = document.createElement('div');
      pill.className = 'rail-pill';

      const btn = document.createElement('button');
      btn.className = 'rail-btn' + (isActive ? ' active' : '');
      btn.title = srv.name;

      const hasUnread = state.unreadServers.has(srv.id);
      const unreadDot = hasUnread ? `<span class="rail-unread-dot"></span>` : '';

      const icon = srv.icon || '🎮';
      btn.innerHTML = `<span style="font-size: 20px;">${escapeHtml(icon)}</span>${unreadDot}`;

      btn.addEventListener('click', () => {
        switchServer(srv.id);
      });

      wrap.appendChild(pill);
      wrap.appendChild(btn);
      el.railServersList.appendChild(wrap);
    });
  }

  function showFriendsDashboardView() {
    if (el.textChatView) el.textChatView.classList.add('hidden');
    if (el.voiceArena && !state.activeVoiceRoomId) el.voiceArena.classList.add('hidden');
    if (el.friendsDashboardView) el.friendsDashboardView.classList.remove('hidden');

    if (el.lblActiveChannelName) el.lblActiveChannelName.textContent = 'Arkadaşlar';
    if (el.headerPrefix) el.headerPrefix.textContent = '👥';

    switchFriendsDashTab(state.activeHomeTab || 'online');
  }

  function switchFriendsDashTab(tabName) {
    state.activeHomeTab = tabName;

    // Update pill button classes
    [el.pillFriendsOnline, el.pillFriendsAll, el.pillFriendsPending, el.pillFriendsAdd].forEach(btn => {
      if (!btn) return;
      const tab = btn.getAttribute('data-tab');
      btn.classList.toggle('active', tab === tabName);
    });

    // Hide all sub panels
    if (el.friendsAddPanel) el.friendsAddPanel.classList.add('hidden');
    if (el.friendsPendingPanel) el.friendsPendingPanel.classList.add('hidden');
    if (el.friendsListPanel) el.friendsListPanel.classList.add('hidden');
    if (el.friendsSearchBox) el.friendsSearchBox.classList.remove('hidden');

    if (tabName === 'add') {
      if (el.friendsAddPanel) el.friendsAddPanel.classList.remove('hidden');
      if (el.friendsSearchBox) el.friendsSearchBox.classList.add('hidden');
      setTimeout(() => el.inputDashAddFriend?.focus(), 50);
    } else if (tabName === 'pending') {
      if (el.friendsPendingPanel) el.friendsPendingPanel.classList.remove('hidden');
      renderDashPendingRequests();
    } else {
      if (el.friendsListPanel) el.friendsListPanel.classList.remove('hidden');
      renderDashFriendsList(tabName);
    }

    renderActiveNowPanel();
    updateFriendsCounts();
  }

  function updateFriendsCounts() {
    const onlineCount = (state.friends || []).filter(f => f.onlineStatus !== 'offline' && f.relationship === 'friend').length;
    const allCount = (state.friends || []).filter(f => f.relationship === 'friend').length;
    const pendingCount = (state.friends || []).filter(f => f.relationship === 'pending_in' || f.relationship === 'pending_out').length;

    if (el.countDashOnline) el.countDashOnline.textContent = onlineCount;
    if (el.countDashAll) el.countDashAll.textContent = allCount;
    if (el.countDashPending) el.countDashPending.textContent = pendingCount;
  }

  function renderDashFriendsList(tabName = 'online') {
    if (!el.dashFriendsCardsContainer) return;
    el.dashFriendsCardsContainer.innerHTML = '';

    const filterText = (el.inputFriendsFilter?.value || '').trim().toLowerCase();

    let list = (state.friends || []).filter(f => f.relationship === 'friend');
    if (tabName === 'online') {
      list = list.filter(f => f.onlineStatus !== 'offline');
    }

    if (filterText) {
      list = list.filter(f => (f.username || f.name || '').toLowerCase().includes(filterText));
    }

    if (el.lblFriendsListSectionTitle) {
      el.lblFriendsListSectionTitle.textContent = `${tabName === 'online' ? 'ÇEVRİMİÇİ' : 'TÜM ARKADAŞLAR'} — ${list.length}`;
    }

    if (list.length === 0) {
      el.dashFriendsCardsContainer.innerHTML = `
        <div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:13px;">
          ${tabName === 'online' ? '💤 Şu an çevrimiçi arkadaşınız yok.' : 'Henüz arkadaş listeniz boş. "Arkadaş Ekle" sekmesinden ekleyebilirsiniz.'}
        </div>
      `;
      return;
    }

    list.forEach(f => {
      const card = document.createElement('div');
      card.className = 'friend-dash-card';

      const initial = (f.username || f.name || 'O').charAt(0).toUpperCase();
      const statusColor = f.onlineStatus === 'online' ? 'var(--green)' : f.onlineStatus === 'idle' ? '#faa81a' : f.onlineStatus === 'dnd' ? 'var(--red)' : '#747f8d';
      const statusText = f.gameActivity ? `🎮 ${escapeHtml(f.gameActivity)}` : (f.onlineStatus === 'online' ? 'Çevrimiçi' : f.onlineStatus === 'idle' ? 'Boşta' : f.onlineStatus === 'dnd' ? 'Rahatsız Etmeyin' : 'Çevrimdışı');

      card.innerHTML = `
        <div class="friend-dash-left">
          <div class="avatar-wrapper" style="width:38px; height:38px; position:relative;">
            <div class="avatar" style="width:38px; height:38px; font-size:16px;">
              ${f.avatarUrl ? `<img src="${escapeHtml(f.avatarUrl)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : initial}
            </div>
            <div class="status-indicator" style="background:${statusColor}; width:12px; height:12px; border:2px solid var(--bg-primary); position:absolute; bottom:-1px; right:-1px; border-radius:50%;"></div>
          </div>
          <div class="friend-dash-info">
            <span class="friend-dash-name">${escapeHtml(f.username || f.name || 'Arkadaş')}</span>
            <span class="friend-dash-status">${statusText}</span>
          </div>
        </div>
        <div class="friend-dash-actions">
          <button type="button" class="friend-action-circle-btn btn-action-dm" title="Mesaj Gönder (DM)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
            </svg>
          </button>
          <button type="button" class="friend-action-circle-btn btn-action-call" title="Sesli Ara">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.053 15.053 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1.01A11.36 11.36 0 0 1 8.5 3.92c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.54c0-.54-.45-.99-1-.99z"/>
            </svg>
          </button>
          <button type="button" class="friend-action-circle-btn danger btn-action-remove" title="Arkadaşlıktan Çıkar">
            ✕
          </button>
        </div>
      `;

      card.querySelector('.btn-action-dm').addEventListener('click', (e) => {
        e.stopPropagation();
        state.activeHomeView = 'dm';
        if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
        if (el.textChatView) el.textChatView.classList.remove('hidden');
        openDmChat(f.id, f.username || f.name);
      });

      card.querySelector('.btn-action-call').addEventListener('click', (e) => {
        e.stopPropagation();
        startDirectCall(f.id, f.username || f.name, 'voice');
      });

      card.querySelector('.btn-action-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`"${f.username || f.name}" adlı kullanıcıyı arkadaşlıktan çıkarmak istediğinize emin misiniz?`)) {
          sendWs({ type: 'remove-friend', targetUserId: f.id });
        }
      });

      card.addEventListener('click', () => {
        state.activeHomeView = 'dm';
        if (el.friendsDashboardView) el.friendsDashboardView.classList.add('hidden');
        if (el.textChatView) el.textChatView.classList.remove('hidden');
        openDmChat(f.id, f.username || f.name);
      });

      el.dashFriendsCardsContainer.appendChild(card);
    });
  }

  function renderDashPendingRequests() {
    if (!el.friendsPendingContainer) return;
    el.friendsPendingContainer.innerHTML = '';

    const pending = (state.friends || []).filter(f => f.relationship === 'pending_in' || f.relationship === 'pending_out');
    if (el.lblPendingCount) el.lblPendingCount.textContent = `BEKLEYEN İSTEKLER — ${pending.length}`;

    if (pending.length === 0) {
      el.friendsPendingContainer.innerHTML = `
        <div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:13px;">
          Bekleyen bir arkadaşlık isteği bulunmuyor.
        </div>
      `;
      return;
    }

    pending.forEach(f => {
      const isIncoming = f.relationship === 'pending_in';
      const row = document.createElement('div');
      row.className = 'friend-dash-card';
      row.innerHTML = `
        <div class="friend-dash-left">
          <div class="avatar" style="width:36px; height:36px; font-size:15px;">${(f.username || 'O').charAt(0).toUpperCase()}</div>
          <div class="friend-dash-info">
            <span class="friend-dash-name">${escapeHtml(f.username || 'Kullanıcı')}</span>
            <span class="friend-dash-status">${isIncoming ? '📥 Gelen Arkadaşlık İsteği' : '📤 Giden Arkadaşlık İsteği (Yanıt bekleniyor)'}</span>
          </div>
        </div>
        <div class="friend-dash-actions">
          ${isIncoming ? `
            <button type="button" class="btn-primary btn-accept-req" style="padding:6px 14px; font-size:12px;">Kabul Et</button>
            <button type="button" class="friend-action-circle-btn danger btn-reject-req" title="Reddet">✕</button>
          ` : `
            <button type="button" class="friend-action-circle-btn danger btn-cancel-req" title="İsteği İptal Et">✕</button>
          `}
        </div>
      `;

      if (isIncoming) {
        row.querySelector('.btn-accept-req').addEventListener('click', () => {
          sendWs({ type: 'respond-friend-request', requesterId: f.id, accept: true });
        });
        row.querySelector('.btn-reject-req').addEventListener('click', () => {
          sendWs({ type: 'respond-friend-request', requesterId: f.id, accept: false });
        });
      } else {
        row.querySelector('.btn-cancel-req').addEventListener('click', () => {
          sendWs({ type: 'remove-friend', targetUserId: f.id });
        });
      }

      el.friendsPendingContainer.appendChild(row);
    });
  }

  function renderActiveNowPanel() {
    if (!el.activeNowList) return;
    el.activeNowList.innerHTML = '';

    const activeFriends = (state.friends || []).filter(f => f.relationship === 'friend' && (f.gameActivity || f.voiceRoomId));

    if (activeFriends.length === 0) {
      el.activeNowList.innerHTML = `
        <div style="font-size:12px; color:var(--text-muted); line-height:1.5; padding:10px 0; font-style:italic;">
          Şu an aktif bir etkinlikte olan arkadaşınız yok. Arkadaşlarınız bir oyuna girdiğinde veya ses kanalına bağlandığında burada göreceksiniz.
        </div>
      `;
      return;
    }

    activeFriends.forEach(f => {
      const card = document.createElement('div');
      card.className = 'active-now-card';
      const initial = (f.username || 'O').charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="active-now-user">
          <div class="avatar" style="width:32px; height:32px; font-size:14px;">${initial}</div>
          <span style="font-weight:700; color:var(--text-heading); font-size:13px;">${escapeHtml(f.username)}</span>
        </div>
        <div class="active-now-activity">
          ${f.gameActivity ? `🎮 ${escapeHtml(f.gameActivity)}` : `🔊 Ses Kanalında`}
        </div>
      `;
      el.activeNowList.appendChild(card);
    });
  }

  function setupServerModalsAndDropdown() {
    // 1. Home button click
    if (el.btnRailHome) {
      el.btnRailHome.addEventListener('click', () => {
        switchServer('home');
      });
    }

    // 2. Add server (+) button click -> Open modal
    if (el.btnQuickAddServer) {
      el.btnQuickAddServer.addEventListener('click', () => {
        if (el.modalServerConnect) {
          el.modalServerConnect.classList.add('show');
          el.tabModalCreateServer?.click();
          setTimeout(() => el.inputNewServerName?.focus(), 60);
        }
      });
    }

    // Modal Tabs
    if (el.tabModalCreateServer) {
      el.tabModalCreateServer.addEventListener('click', () => {
        el.tabModalCreateServer.classList.add('active');
        el.tabModalJoinServer?.classList.remove('active');
        el.tabModalDomainGateway?.classList.remove('active');
        el.tabModalCreateServer.style.borderBottom = '2px solid var(--brand)';
        if (el.tabModalJoinServer) el.tabModalJoinServer.style.borderBottom = 'none';
        if (el.tabModalDomainGateway) el.tabModalDomainGateway.style.borderBottom = 'none';
        el.panelCreateServer?.classList.remove('hidden');
        el.panelJoinServer?.classList.add('hidden');
        el.panelDomainGateway?.classList.add('hidden');
      });
    }

    if (el.tabModalJoinServer) {
      el.tabModalJoinServer.addEventListener('click', () => {
        el.tabModalJoinServer.classList.add('active');
        el.tabModalCreateServer?.classList.remove('active');
        el.tabModalDomainGateway?.classList.remove('active');
        el.tabModalJoinServer.style.borderBottom = '2px solid var(--brand)';
        if (el.tabModalCreateServer) el.tabModalCreateServer.style.borderBottom = 'none';
        if (el.tabModalDomainGateway) el.tabModalDomainGateway.style.borderBottom = 'none';
        el.panelJoinServer?.classList.remove('hidden');
        el.panelCreateServer?.classList.add('hidden');
        el.panelDomainGateway?.classList.add('hidden');
        setTimeout(() => el.inputJoinInviteCode?.focus(), 50);
      });
    }

    if (el.tabModalDomainGateway) {
      el.tabModalDomainGateway.addEventListener('click', () => {
        el.tabModalDomainGateway.classList.add('active');
        el.tabModalCreateServer?.classList.remove('active');
        el.tabModalJoinServer?.classList.remove('active');
        el.tabModalDomainGateway.style.borderBottom = '2px solid var(--brand)';
        if (el.tabModalCreateServer) el.tabModalCreateServer.style.borderBottom = 'none';
        if (el.tabModalJoinServer) el.tabModalJoinServer.style.borderBottom = 'none';
        el.panelDomainGateway?.classList.remove('hidden');
        el.panelCreateServer?.classList.add('hidden');
        el.panelJoinServer?.classList.add('hidden');
        renderRecentServersModal();
      });
    }

    // Emoji Picker for new server
    document.querySelectorAll('.server-icon-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.server-icon-choice').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const icon = btn.getAttribute('data-icon') || '🎮';
        if (el.inputSelectedServerIcon) el.inputSelectedServerIcon.value = icon;
      });
    });

    // Submit Create Server
    if (el.btnSubmitCreateServer) {
      el.btnSubmitCreateServer.addEventListener('click', () => {
        const name = (el.inputNewServerName?.value || '').trim();
        if (!name) {
          showToast('⚠️ Lütfen bir sunucu adı girin!');
          el.inputNewServerName?.focus();
          return;
        }
        const icon = el.inputSelectedServerIcon?.value || '🎮';
        const description = (el.inputNewServerDesc?.value || '').trim();
        sendWs({
          type: 'create-server',
          name: name,
          icon: icon,
          description: description
        });
        if (el.inputNewServerName) el.inputNewServerName.value = '';
        if (el.inputNewServerDesc) el.inputNewServerDesc.value = '';
      });
    }

    // Submit Join Server by Code
    if (el.btnSubmitJoinServer) {
      el.btnSubmitJoinServer.addEventListener('click', () => {
        let code = (el.inputJoinInviteCode?.value || '').trim();
        if (!code) {
          showToast('⚠️ Lütfen geçerli bir davet kodu girin!');
          el.inputJoinInviteCode?.focus();
          return;
        }
        if (code.includes('/invite/')) {
          code = code.split('/invite/')[1].split('/')[0].split('?')[0];
        }
        sendWs({
          type: 'join-server-by-code',
          inviteCode: code
        });
        if (el.inputJoinInviteCode) el.inputJoinInviteCode.value = '';
      });
    }

    // Cancel / Close buttons
    [el.btnCloseServerModal, el.btnCancelCreateServer, el.btnCancelJoinServer, el.btnCancelDomainConnect].forEach(btn => {
      if (btn) btn.addEventListener('click', () => el.modalServerConnect?.classList.remove('show'));
    });

    // Server Header Dropdown Menu Toggle
    const toggleServerDropdown = (e) => {
      if (e) e.stopPropagation();
      if (state.currentServerId === 'home') return;
      if (!el.serverHeaderDropdown) return;
      const isHidden = el.serverHeaderDropdown.classList.toggle('hidden');
      if (!isHidden) {
        if (el.menuInviteCodeBadge) {
          el.menuInviteCodeBadge.textContent = state.serverSettings?.inviteCode || 'KOD';
        }
        const isOwner = state.serverSettings?.ownerId === state.selfId || state.myRole === 'admin';
        if (el.menuItemDeleteServer) {
          el.menuItemDeleteServer.classList.toggle('hidden', !isOwner || state.currentServerId === 'srv_default');
        }
        if (el.menuItemLeaveServer) {
          el.menuItemLeaveServer.classList.toggle('hidden', state.currentServerId === 'srv_default');
        }
      }
    };

    if (el.btnServerDropdownToggle) el.btnServerDropdownToggle.addEventListener('click', toggleServerDropdown);
    if (el.sidebarHeaderBtn) {
      el.sidebarHeaderBtn.addEventListener('click', (e) => {
        if (e.target.closest('#btnQuickCreateChannel') || e.target.closest('#btnServerDropdownToggle')) return;
        toggleServerDropdown(e);
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#serverHeaderDropdown') && !e.target.closest('#sidebarHeaderBtn')) {
        el.serverHeaderDropdown?.classList.add('hidden');
      }
    });

    if (el.menuItemInvite) {
      el.menuItemInvite.addEventListener('click', () => {
        el.serverHeaderDropdown?.classList.add('hidden');
        const code = state.serverSettings?.inviteCode || 'TALKAPP';
        navigator.clipboard?.writeText(code);
        showToast(`📋 Sunucu davet kodu kopyalandı: ${code}`, 3000);
      });
    }

    if (el.menuItemCreateChannel) {
      el.menuItemCreateChannel.addEventListener('click', () => {
        el.serverHeaderDropdown?.classList.add('hidden');
        openCreateChannelModal('text');
      });
    }

    if (el.menuItemServerSettings) {
      el.menuItemServerSettings.addEventListener('click', () => {
        el.serverHeaderDropdown?.classList.add('hidden');
        openGuildSettingsModal();
      });
    }

    if (el.menuItemLeaveServer) {
      el.menuItemLeaveServer.addEventListener('click', () => {
        el.serverHeaderDropdown?.classList.add('hidden');
        if (confirm(`"${state.serverSettings?.serverName}" sunucusundan ayrılmak istediğinize emin misiniz?`)) {
          sendWs({ type: 'leave-server', serverId: state.currentServerId });
        }
      });
    }

    if (el.menuItemDeleteServer) {
      el.menuItemDeleteServer.addEventListener('click', () => {
        el.serverHeaderDropdown?.classList.add('hidden');
        if (confirm(`⚠️ "${state.serverSettings?.serverName}" sunucusunu KALICI OLARAK silmek istediğinize emin misiniz? Tüm kanallar ve sohbet silinecektir!`)) {
          sendWs({ type: 'delete-server', serverId: state.currentServerId });
        }
      });
    }

    function switchGuildSettingsTab(tab) {
      const tabConfigs = [
        { id: 'overview', btn: el.btnGuildTabOverview, panel: el.panelGuildOverview },
        { id: 'roles', btn: el.btnGuildTabRoles, panel: el.panelGuildRoles },
        { id: 'audit', btn: el.btnGuildTabAudit, panel: el.panelGuildAudit }
      ];

      tabConfigs.forEach(t => {
        const isActive = (t.id === tab);
        if (t.btn) {
          t.btn.classList.toggle('active', isActive);
          t.btn.style.color = isActive ? 'var(--text-heading)' : 'var(--text-muted)';
          t.btn.style.borderBottom = isActive ? '2px solid var(--brand)' : 'none';
        }
        if (t.panel) {
          t.panel.classList.toggle('hidden', !isActive);
        }
      });

      if (tab === 'roles') {
        sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
        renderGuildRolesList();
      } else if (tab === 'audit') {
        sendWs({ type: 'get-audit-logs', serverId: state.currentServerId });
      }
    }

    function renderGuildRolesList() {
      if (!el.guildRolesList) return;
      el.guildRolesList.innerHTML = '';

      if (!state.serverRoles || state.serverRoles.length === 0) {
        el.roleEditorEmpty?.classList.remove('hidden');
        el.roleEditorContent?.classList.add('hidden');
        return;
      }

      if (!state.selectedRoleId || !state.serverRoles.some(r => r.id === state.selectedRoleId)) {
        state.selectedRoleId = state.serverRoles[0].id;
      }

      state.serverRoles.forEach(r => {
        const item = document.createElement('div');
        item.className = 'role-sidebar-item' + (r.id === state.selectedRoleId ? ' active' : '');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.padding = '8px 10px';
        item.style.borderRadius = '6px';
        item.style.cursor = 'pointer';
        item.style.background = r.id === state.selectedRoleId ? 'rgba(88,101,242,0.18)' : 'transparent';
        item.style.border = r.id === state.selectedRoleId ? '1px solid rgba(88,101,242,0.4)' : '1px solid transparent';
        item.style.transition = 'background 0.15s ease';

        const dot = document.createElement('span');
        dot.style.display = 'inline-block';
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.borderRadius = '50%';
        dot.style.background = r.color || '#99aab5';
        dot.style.flexShrink = '0';

        const nameSpan = document.createElement('span');
        nameSpan.style.flex = '1';
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        nameSpan.style.whiteSpace = 'nowrap';
        nameSpan.style.fontSize = '13px';
        nameSpan.style.fontWeight = r.id === state.selectedRoleId ? '700' : '500';
        nameSpan.style.color = r.id === state.selectedRoleId ? 'var(--text-heading)' : 'var(--text-normal)';
        nameSpan.textContent = r.name;

        item.appendChild(dot);
        item.appendChild(nameSpan);

        if (r.is_default) {
          const defBadge = document.createElement('span');
          defBadge.style.fontSize = '9px';
          defBadge.style.background = 'rgba(255,255,255,0.08)';
          defBadge.style.padding = '2px 5px';
          defBadge.style.borderRadius = '4px';
          defBadge.style.color = 'var(--text-muted)';
          defBadge.textContent = 'HERKES';
          item.appendChild(defBadge);
        }

        item.addEventListener('click', () => {
          selectRoleInEditor(r.id);
        });

        el.guildRolesList.appendChild(item);
      });

      selectRoleInEditor(state.selectedRoleId);
    }

    function selectRoleInEditor(roleId) {
      state.selectedRoleId = roleId;
      const role = (state.serverRoles || []).find(r => r.id === roleId);
      if (!role) return;

      // Update sidebar active classes
      if (el.guildRolesList) {
        const items = el.guildRolesList.children;
        state.serverRoles.forEach((r, idx) => {
          if (items[idx]) {
            const isAct = r.id === roleId;
            items[idx].style.background = isAct ? 'rgba(88,101,242,0.18)' : 'transparent';
            items[idx].style.border = isAct ? '1px solid rgba(88,101,242,0.4)' : '1px solid transparent';
            const nameEl = items[idx].querySelector('span:nth-child(2)');
            if (nameEl) {
              nameEl.style.fontWeight = isAct ? '700' : '500';
              nameEl.style.color = isAct ? 'var(--text-heading)' : 'var(--text-normal)';
            }
          }
        });
      }

      el.roleEditorEmpty?.classList.add('hidden');
      el.roleEditorContent?.classList.remove('hidden');

      if (el.lblEditRoleHeading) el.lblEditRoleHeading.textContent = role.name;
      if (el.lblEditRoleSubtitle) {
        el.lblEditRoleSubtitle.textContent = role.is_default
          ? 'Sunucudaki tüm yeni ve mevcut üyeler için temel izinleri belirler'
          : 'Sunucu içi yetkileri ve rengi yapılandırın';
      }

      if (el.inputEditRoleName) {
        el.inputEditRoleName.value = role.name;
        el.inputEditRoleName.disabled = !!role.is_default;
      }

      if (el.btnDeleteRole) {
        el.btnDeleteRole.style.display = role.is_default ? 'none' : '';
      }

      if (el.chkEditRoleHoist) {
        el.chkEditRoleHoist.checked = !!role.hoist;
        el.chkEditRoleHoist.disabled = !!role.is_default;
      }

      const color = role.color || '#99aab5';
      if (el.inputEditRoleColorCustom) el.inputEditRoleColorCustom.value = color;
      if (el.lblEditRoleColorHex) el.lblEditRoleColorHex.textContent = color.toUpperCase();

      document.querySelectorAll('.role-color-swatch').forEach(swatch => {
        const swatchCol = swatch.getAttribute('data-color') || '';
        swatch.style.borderColor = swatchCol.toLowerCase() === color.toLowerCase() ? '#ffffff' : 'transparent';
      });

      let perms = role.permissions || {};
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = {}; }
      }

      document.querySelectorAll('.chk-role-perm').forEach(chk => {
        const permKey = chk.getAttribute('data-perm');
        chk.checked = !!perms[permKey];
      });
    }

    function openGuildSettingsModal() {
      if (!el.modalGuildSettings) return;
      if (el.inputEditGuildName) el.inputEditGuildName.value = state.serverSettings?.serverName || '';
      if (el.inputEditGuildIcon) el.inputEditGuildIcon.value = state.serverSettings?.serverIcon || '🎮';
      if (el.inputEditGuildDesc) el.inputEditGuildDesc.value = state.serverSettings?.serverDesc || '';
      if (el.lblGuildSettingsInviteCode) el.lblGuildSettingsInviteCode.textContent = state.serverSettings?.inviteCode || '----';

      const isOwner = state.serverSettings?.ownerId === state.selfId || state.myRole === 'admin';
      if (el.dangerZoneGuildDelete) {
        el.dangerZoneGuildDelete.classList.toggle('hidden', !isOwner || state.currentServerId === 'srv_default');
      }

      switchGuildSettingsTab('overview');
      sendWs({ type: 'get-server-roles', serverId: state.currentServerId });
      el.modalGuildSettings.classList.add('show');
    }

    if (el.btnGuildTabOverview) {
      el.btnGuildTabOverview.addEventListener('click', () => switchGuildSettingsTab('overview'));
    }
    if (el.btnGuildTabRoles) {
      el.btnGuildTabRoles.addEventListener('click', () => switchGuildSettingsTab('roles'));
    }
    if (el.btnGuildTabAudit) {
      el.btnGuildTabAudit.addEventListener('click', () => switchGuildSettingsTab('audit'));
    }

    // Role Color Swatches Selection
    document.querySelectorAll('.role-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.getAttribute('data-color');
        if (!color) return;
        if (el.inputEditRoleColorCustom) el.inputEditRoleColorCustom.value = color;
        if (el.lblEditRoleColorHex) el.lblEditRoleColorHex.textContent = color.toUpperCase();
        document.querySelectorAll('.role-color-swatch').forEach(s => s.style.borderColor = 'transparent');
        swatch.style.borderColor = '#ffffff';
      });
    });

    if (el.inputEditRoleColorCustom) {
      el.inputEditRoleColorCustom.addEventListener('input', (e) => {
        const color = e.target.value;
        if (el.lblEditRoleColorHex) el.lblEditRoleColorHex.textContent = color.toUpperCase();
        document.querySelectorAll('.role-color-swatch').forEach(s => {
          s.style.borderColor = (s.getAttribute('data-color') || '').toLowerCase() === color.toLowerCase() ? '#ffffff' : 'transparent';
        });
      });
    }

    if (el.btnCreateNewRole) {
      el.btnCreateNewRole.addEventListener('click', () => {
        sendWs({
          type: 'create-server-role',
          serverId: state.currentServerId,
          name: 'Yeni Rol',
          color: '#99aab5',
          hoist: 0,
          permissions: {
            send_messages: true,
            upload_files: true,
            connect_voice: true,
            speak_voice: true
          }
        });
        showToast('➕ Yeni rol oluşturuluyor...');
      });
    }

    if (el.btnDeleteRole) {
      el.btnDeleteRole.addEventListener('click', () => {
        if (!state.selectedRoleId) return;
        const role = (state.serverRoles || []).find(r => r.id === state.selectedRoleId);
        if (!role) return;
        if (role.is_default) {
          showToast('⚠️ @everyone varsayılan rolü silinemez!');
          return;
        }
        if (confirm(`"${role.name}" rolünü kalıcı olarak silmek istediğinize emin misiniz?`)) {
          sendWs({
            type: 'delete-server-role',
            serverId: state.currentServerId,
            roleId: state.selectedRoleId
          });
          showToast('🗑️ Rol silindi!');
        }
      });
    }

    if (el.btnSaveRoleChanges) {
      el.btnSaveRoleChanges.addEventListener('click', () => {
        if (!state.selectedRoleId) return;
        const role = (state.serverRoles || []).find(r => r.id === state.selectedRoleId);
        if (!role) return;

        const name = role.is_default ? role.name : (el.inputEditRoleName?.value || '').trim() || role.name;
        const color = el.inputEditRoleColorCustom?.value || role.color || '#99aab5';
        const hoist = role.is_default ? 0 : (el.chkEditRoleHoist?.checked ? 1 : 0);

        const permissions = {};
        document.querySelectorAll('.chk-role-perm').forEach(chk => {
          const permKey = chk.getAttribute('data-perm');
          if (permKey) permissions[permKey] = chk.checked;
        });

        sendWs({
          type: 'update-server-role',
          serverId: state.currentServerId,
          roleId: state.selectedRoleId,
          name: name,
          color: color,
          hoist: hoist,
          permissions: permissions
        });
        showToast(`💾 "${name}" rolü başarıyla kaydedildi!`);
      });
    }

    if (el.btnCopyGuildInviteCode) {
      el.btnCopyGuildInviteCode.addEventListener('click', () => {
        const code = state.serverSettings?.inviteCode || '';
        navigator.clipboard?.writeText(code);
        showToast(`📋 Davet kodu kopyalandı: ${code}`);
      });
    }

    if (el.btnSaveGuildSettings) {
      el.btnSaveGuildSettings.addEventListener('click', () => {
        const name = (el.inputEditGuildName?.value || '').trim();
        const icon = (el.inputEditGuildIcon?.value || '🎮').trim();
        const desc = (el.inputEditGuildDesc?.value || '').trim();
        if (!name) {
          showToast('⚠️ Sunucu adı boş bırakılamaz!');
          return;
        }
        sendWs({
          type: 'update-server-settings',
          serverId: state.currentServerId,
          name: name,
          icon: icon,
          description: desc
        });
        el.modalGuildSettings?.classList.remove('show');
      });
    }

    if (el.btnDeleteCurrentGuild) {
      el.btnDeleteCurrentGuild.addEventListener('click', () => {
        if (confirm(`⚠️ "${state.serverSettings?.serverName}" sunucusunu kalıcı olarak silmek istediğinize emin misiniz?`)) {
          el.modalGuildSettings?.classList.remove('show');
          sendWs({ type: 'delete-server', serverId: state.currentServerId });
        }
      });
    }

    [el.btnCloseGuildSettingsModal, el.btnCancelGuildSettings].forEach(btn => {
      if (btn) btn.addEventListener('click', () => el.modalGuildSettings?.classList.remove('show'));
    });
  }

  function setupFriendsDashboard() {
    [el.pillFriendsOnline, el.pillFriendsAll, el.pillFriendsPending, el.pillFriendsAdd].forEach(btn => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchFriendsDashTab(tab);
      });
    });

    if (el.inputFriendsFilter) {
      el.inputFriendsFilter.addEventListener('input', () => {
        renderDashFriendsList(state.activeHomeTab || 'online');
      });
    }

    if (el.btnDashSendFriendReq) {
      el.btnDashSendFriendReq.addEventListener('click', () => {
        const username = (el.inputDashAddFriend?.value || '').trim();
        if (!username) {
          if (el.dashAddFriendStatus) el.dashAddFriendStatus.innerHTML = '<span style="color:var(--red);">Lütfen bir kullanıcı adı girin.</span>';
          return;
        }
        sendWs({ type: 'send-friend-request', targetUsername: username });
        if (el.inputDashAddFriend) el.inputDashAddFriend.value = '';
        if (el.dashAddFriendStatus) el.dashAddFriendStatus.innerHTML = `<span style="color:var(--green);">"${escapeHtml(username)}" kullanıcısına istek gönderildi!</span>`;
        setTimeout(() => {
          if (el.dashAddFriendStatus) el.dashAddFriendStatus.innerHTML = '';
        }, 4000);
      });
    }
  }

  function renderRecentServersModal() {
    if (!el.recentServersList) return;
    el.recentServersList.innerHTML = '';

    const recents = JSON.parse(localStorage.getItem('talkapp_recent_servers') || '[]');
    if (recents.length === 0) {
      el.recentServersList.innerHTML = `<div style="font-size:12px; color:var(--text-muted); font-style:italic; padding:6px 0;">Henüz kaydedilmiş sunucu yok.</div>`;
      return;
    }

    recents.forEach(host => {
      const row = document.createElement('div');
      const isActive = host === state.serverHost;
      row.className = 'recent-server-row' + (isActive ? ' active' : '');
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:14px;">🌐</span>
          <span style="font-weight:600; color:var(--text-heading);">${escapeHtml(host)}</span>
          ${isActive ? '<span class="role-tag" style="font-size:9px; background:var(--green); color:#fff;">Bağlı</span>' : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button type="button" class="btn-primary btn-switch-host" style="padding:2px 8px; font-size:11px;">Bağlan</button>
          <button type="button" class="card-btn btn-del-host" title="Listeden Kaldır" style="font-size:12px; color:var(--text-muted); padding:2px 6px;">✕</button>
        </div>
      `;

      row.querySelector('.btn-switch-host').addEventListener('click', (e) => {
        e.stopPropagation();
        el.modalServerConnect.classList.remove('show');
        switchServerHost(host);
      });

      row.querySelector('.btn-del-host').addEventListener('click', (e) => {
        e.stopPropagation();
        removeRecentServer(host);
      });

      row.addEventListener('click', () => {
        if (el.inputServerHost) el.inputServerHost.value = host;
      });

      el.recentServersList.appendChild(row);
    });
  }

  function removeRecentServer(host) {
    let recents = JSON.parse(localStorage.getItem('talkapp_recent_servers') || '[]');
    recents = recents.filter(h => h !== host);
    localStorage.setItem('talkapp_recent_servers', JSON.stringify(recents));
    renderRecentServersModal();
    renderServerRail();
  }

  function switchServerHost(newHost) {
    const cleanHost = newHost.trim().replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '');
    if (!cleanHost) return;
    state.serverHost = cleanHost;
    saveRecentServer(cleanHost);
    showToast(`🔄 ${cleanHost} sunucusuna bağlanılıyor...`);
    connectToServer(cleanHost);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
