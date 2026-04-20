/* ═══════════════════════════════════════════════════════
   STATE + PERSISTENCE
════════════════════════════════════════════════════════ */
const DEFAULT_FAVS = ['ibai','auronplay','rubius','elxokas','rivers_gg','illojuan'];

const PALETTE = [
  { name: 'Violeta', value: '#7c6fff' },
  { name: 'Rosa',    value: '#ec4899' },
  { name: 'Cyan',    value: '#22d3ee' },
  { name: 'Verde',   value: '#22d3a0' },
  { name: 'Naranja', value: '#f59e0b' },
  { name: 'Rojo',    value: '#ef4444' }
];

let S = {
  channel:       'ibai',
  volume:        0.5,
  muted:         false,
  chatOpen:      true,
  theater:       false,
  multiOn:       false,
  multiLayout:   'grid',
  quality:       'auto',
  favorites:     [...DEFAULT_FAVS],
  multiChannels: ['','','',''],
  recent:        [],
  miniOn:        false,
  miniPos:       null,
  miniSize:      null,
  miniVolume:    0.5,
  accentColor:   '#7c6fff',
  notifications: false,
  liveStatus:    {},
  favSort:       'live',
  favOnlyLive:   false,
  twitchAuth:    { clientId: '', token: null, user: null, follows: [], followsMap: {} }
};

let viewerCounts = {};

function loadS() {
  try {
    const raw = localStorage.getItem('trunkstv_state');
    if (!raw) return;
    const d = JSON.parse(raw);
    Object.assign(S, {
      channel:       d.channel    || S.channel,
      volume:        d.volume     != null ? d.volume : S.volume,
      muted:         d.muted      || false,
      chatOpen:      d.chatOpen   != null ? d.chatOpen : true,
      favorites:     Array.isArray(d.favorites) ? d.favorites : DEFAULT_FAVS,
      multiChannels: Array.isArray(d.multiChannels) ? d.multiChannels : S.multiChannels,
      multiLayout:   d.multiLayout || 'grid',
      quality:       d.quality    || 'auto',
      recent:        Array.isArray(d.recent) ? d.recent : [],
      miniPos:       d.miniPos    || null,
      miniSize:      d.miniSize   || null,
      miniVolume:    typeof d.miniVolume === 'number' ? d.miniVolume : 0.5,
      accentColor:   d.accentColor || '#7c6fff',
      notifications: d.notifications === true,
      liveStatus:    (d.liveStatus && typeof d.liveStatus === 'object') ? d.liveStatus : {},
      favSort:       ['live','viewers','alpha'].includes(d.favSort) ? d.favSort : 'live',
      favOnlyLive:   d.favOnlyLive === true,
      twitchAuth:    (d.twitchAuth && typeof d.twitchAuth === 'object')
        ? {
            clientId:   d.twitchAuth.clientId   || '',
            token:      d.twitchAuth.token      || null,
            user:       d.twitchAuth.user       || null,
            follows:    Array.isArray(d.twitchAuth.follows) ? d.twitchAuth.follows : [],
            followsMap: (d.twitchAuth.followsMap && typeof d.twitchAuth.followsMap === 'object') ? d.twitchAuth.followsMap : {}
          }
        : S.twitchAuth
    });
  } catch(e){}
}

/* ═══════════════════════════════════════════════════════
   TWITCH OAUTH (Implicit Flow)
════════════════════════════════════════════════════════ */
const TWITCH_CLIENT_ID = 'poi5vrscl0i82kz5me4gbdee56x0z2';
const TWITCH_SCOPES = 'user:read:follows';

function getClientId() {
  return TWITCH_CLIENT_ID;
}

function isTwitchLoggedIn() {
  return !!(S.twitchAuth && S.twitchAuth.token && S.twitchAuth.user);
}

function currentFavs() {
  return isTwitchLoggedIn() ? S.twitchAuth.follows : S.favorites;
}

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

function handleTwitchRedirect() {
  if (!window.location.hash || !window.location.hash.includes('access_token=')) return false;
  const hp = new URLSearchParams(window.location.hash.slice(1));
  const token = hp.get('access_token');
  if (!token) return false;
  S.twitchAuth.token = token;
  saveS();
  history.replaceState(null, '', redirectUri());
  return true;
}

function loginWithTwitch() {
  const cid = getClientId();
  if (!cid) { toast('Client-ID no configurado'); return; }
  const params = new URLSearchParams({
    client_id:     cid,
    redirect_uri:  redirectUri(),
    response_type: 'token',
    scope:         TWITCH_SCOPES,
    force_verify:  'false'
  });
  window.location.href = 'https://id.twitch.tv/oauth2/authorize?' + params.toString();
}

async function logoutTwitch() {
  const token = S.twitchAuth.token;
  const cid   = getClientId();
  S.twitchAuth.token = null;
  S.twitchAuth.user = null;
  S.twitchAuth.follows = [];
  S.twitchAuth.followsMap = {};
  saveS();
  if (token && cid) {
    try {
      await fetch('https://id.twitch.tv/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: cid, token }).toString()
      });
    } catch(e){}
  }
  toast('Sesión de Twitch cerrada');
  renderSettingsMenu();
  updateCurrentFavIcon();
  toggleFavButtonVisibility();
  showLanding();
  if ($chDrop.classList.contains('open')) buildDropdown($chInput.value);
}

async function twitchApi(path) {
  const res = await fetch('https://api.twitch.tv/helix' + path, {
    headers: {
      'Authorization': 'Bearer ' + S.twitchAuth.token,
      'Client-Id':     getClientId()
    }
  });
  if (res.status === 401) { logoutTwitch(); throw new Error('Sesión expirada'); }
  if (!res.ok) throw new Error('Twitch API ' + res.status);
  return res.json();
}

async function fetchTwitchUser() {
  const d = await twitchApi('/users');
  const u = d.data && d.data[0];
  if (!u) throw new Error('Usuario no encontrado');
  S.twitchAuth.user = { id: u.id, login: u.login, display_name: u.display_name, avatar: u.profile_image_url };
  saveS();
  return S.twitchAuth.user;
}

async function fetchTwitchFollows() {
  if (!S.twitchAuth.user) await fetchTwitchUser();
  const uid = S.twitchAuth.user.id;
  let cursor = '';
  const all = [];
  for (let i = 0; i < 20; i++) {
    const q = '/channels/followed?user_id=' + uid + '&first=100' + (cursor ? '&after=' + cursor : '');
    const d = await twitchApi(q);
    (d.data || []).forEach(f => all.push({ login: f.broadcaster_login, name: f.broadcaster_name }));
    cursor = d.pagination && d.pagination.cursor;
    if (!cursor) break;
  }
  const map = {};
  all.forEach(f => { map[f.login] = f.name; });
  S.twitchAuth.follows = all.map(f => f.login);
  S.twitchAuth.followsMap = map;
  saveS();
  return S.twitchAuth.follows;
}

async function refreshTwitchFollows() {
  try {
    await fetchTwitchFollows();
    toast('Seguidos actualizados (' + S.twitchAuth.follows.length + ')');
    renderSettingsMenu();
    if ($chDrop.classList.contains('open')) buildDropdown($chInput.value);
    pollFavoritesLive();
  } catch(e) { toast('Error: ' + e.message); }
}

function toggleFavButtonVisibility() {
  const btn = document.getElementById('btn-fav-current');
  if (!btn) return;
  btn.style.display = isTwitchLoggedIn() ? 'none' : '';
}

function showLanding() {
  const el = document.getElementById('landing');
  if (el) el.classList.add('on');
}
function hideLanding() {
  const el = document.getElementById('landing');
  if (el) el.classList.remove('on');
}
function continueAsGuest() {
  try { sessionStorage.setItem('trunkstv_guest', '1'); } catch(e){}
  hideLanding();
}
function shouldShowLanding() {
  if (isTwitchLoggedIn()) return false;
  try { if (sessionStorage.getItem('trunkstv_guest') === '1') return false; } catch(e){}
  return true;
}

function saveS() {
  try {
    localStorage.setItem('trunkstv_state', JSON.stringify(S));
  } catch(e){}
}

/* ═══════════════════════════════════════════════════════
   REFS & VARIABLES GLOBALES
════════════════════════════════════════════════════════ */
const $app        = document.getElementById('app');
const $controls   = document.getElementById('controls');
const $infoBar    = document.getElementById('info-bar');
const $chInput    = document.getElementById('chInput');
const $chDrop     = document.getElementById('chDropdown');
const $settings   = document.getElementById('settingsMenu');
const $chat       = document.getElementById('chat-panel');
const $chatTog    = document.getElementById('chatTog');
const $chatFrm    = document.getElementById('chatFrame');
const $multiG     = document.getElementById('multi-grid');
const $mini       = document.getElementById('mini-player');
const $miniEmb    = document.getElementById('mini-embed');
const $chatTabs   = document.getElementById('chat-tabs');
const $miniBar    = document.getElementById('miniBar');
const $miniResize = document.getElementById('miniResize');

let mainPlayer = null;
let miniPlayer2 = null;
let multiPlayers = [null,null,null,null];
let activeSlot = 0;
let viewerTimer = null;
let infoTimer = null;
let currentChatChannel = S.channel;

const getParents = () => [window.location.hostname || 'localhost', '127.0.0.1', 'localhost'];

/* ═══════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════ */
window.addEventListener('load', async () => {
  loadS();
  const freshLogin = handleTwitchRedirect();

  $chInput.value = channelToDisplay(S.channel);
  document.getElementById('vol').value = S.volume;

  if (!S.chatOpen) {
    $chat.classList.add('hidden');
    $chatTog.classList.remove('on');
  }
  if (S.theater) {
    document.body.classList.add('theater');
    document.getElementById('btn-theater').classList.add('on');
  }

  $multiG.className = `layout-${S.multiLayout}`;

  applyAccentColor(S.accentColor);

  const miniVolEl = document.getElementById('miniVol');
  if (miniVolEl) miniVolEl.value = S.miniVolume;

  initPlayer(S.channel);
  tickClock();
  setInterval(tickClock, 1000);

  toggleFavButtonVisibility();

  if (S.twitchAuth && S.twitchAuth.token) {
    try {
      if (freshLogin || !S.twitchAuth.user) await fetchTwitchUser();
      if (freshLogin || !S.twitchAuth.follows.length) await fetchTwitchFollows();
      if (freshLogin) toast('Sesión iniciada: @' + S.twitchAuth.user.login);
    } catch(e) { console.warn('Twitch auth init fail', e); }
  }

  if (shouldShowLanding()) showLanding();
  else hideLanding();

  pollFavoritesLive();
  setInterval(pollFavoritesLive, 120000);
});

/* ═══════════════════════════════════════════════════════
   FUENTES: PARSER (TWITCH vs OVENPLAYER)
════════════════════════════════════════════════════════ */
function parsePlayerSource(input) {
  const s = (input || '').trim();
  if (!s) return { kind: 'twitch', channel: '' };
  const low = s.toLowerCase();
  if (low.startsWith('oven:')) {
    const rest = s.slice(5).trim();
    if (rest.toLowerCase() === 'iluenp' || rest.toLowerCase() === 'ilutvlive') {
      return { kind: 'oven', source: 'iluenp', label: 'ilutvlive' };
    }
    return { kind: 'oven', source: 'url', url: rest, label: rest.split('/').pop() || rest };
  }
  if (low.startsWith('iframe:')) {
    const rest = s.slice(7).trim();
    const r = rest.toLowerCase();
    if (r === 'shonen' || r === 'shonensemanal' || r === 'shonen semanal') {
      return { kind: 'iframe', source: 'shonen', url: 'https://watch.shonensemanal.site/', label: 'Shonen Semanal' };
    }
    return { kind: 'iframe', source: 'url', url: rest, label: rest };
  }
  return { kind: 'twitch', channel: s };
}

// Alias del usuario → canal canónico interno
function aliasToChannel(name) {
  const raw = (name || '').trim();
  const n = raw.toLowerCase();
  if (n === 'iluenp' || n === 'ilutvlive') return 'oven:iluenp';
  if (n === 'shonensemanal' || n === 'shonen' || n === 'shonen semanal') return 'iframe:shonen';

  // URLs de iluenp
  const ilUrl = n.match(/^(?:https?:\/\/)?(?:www\.)?watch\.iluenp\.com(?:\/.*)?$/);
  if (ilUrl) return 'oven:iluenp';

  // URLs de Shonen Semanal
  const shUrl = n.match(/^(?:https?:\/\/)?(?:www\.)?watch\.shonensemanal\.site(?:\/.*)?$/);
  if (shUrl) return 'iframe:shonen';

  // URLs de Twitch → extrae el canal
  const twUrl = n.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([a-z0-9_]+)/);
  if (twUrl) return twUrl[1];

  return raw;
}
// Canal canónico → nombre bonito para mostrar
function channelToDisplay(ch) {
  const p = parsePlayerSource(ch);
  if (p.kind === 'oven' && p.source === 'iluenp') return 'Iluenp';
  if (p.kind === 'iframe' && p.source === 'shonen') return 'Shonen Semanal';
  return ch;
}
// Si el canal tiene metadatos en Twitch (título/categoría/avatar), devuelve el username Twitch
function metaTwitchChannel(ch) {
  const p = parsePlayerSource(ch);
  if (p.kind === 'twitch') return p.channel;
  if (p.kind === 'oven' && p.source === 'iluenp') return 'ilutvlive';
  return null;
}

let _ilFp = null, _ilDomainCache = { value: null, ts: 0 };
let _ilEverLiveThisSession = false, _ilOfflineShown = false;

function clearIluenpOffline() {
  _ilOfflineShown = false;
  const ph = document.getElementById('iluenp-offline');
  if (ph) ph.remove();
}

async function handleIluenpOffline() {
  if (_ilOfflineShown) return;
  _ilOfflineShown = true;

  let live = false;
  try { const r = await iluenpView(); live = r.is_live === true; } catch(e){}

  if (live) {
    _ilOfflineShown = false;
    return;
  }

  const today = new Date().toISOString().slice(0,10);
  let lastLive = null;
  try { lastLive = localStorage.getItem('trunkstv_il_lastLiveDate'); } catch(e){}
  const earlierToday = _ilEverLiveThisSession || lastLive === today;

  const title = earlierToday
    ? 'IluTvlive ya transmitió más temprano hoy'
    : 'IluTvlive no está viendo animes en este momento';
  const subtitle = earlierToday
    ? 'La transmisión de hoy ya terminó. Vuelve más tarde.'
    : 'Cuando inicie una nueva transmisión podrás verla aquí.';

  const emb = document.getElementById('twitch-embed');
  if (emb) {
    emb.innerHTML = `
      <div id="iluenp-offline" style="
        width:100%;height:100%;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:10px;text-align:center;
        background:linear-gradient(135deg,#0d0d10,#1a1a22);color:#e7e7ee;
        padding:24px;font-family:inherit;">
        <div style="font-size:42px;line-height:1;">🌙</div>
        <div style="font-size:18px;font-weight:600;">${title}</div>
        <div style="font-size:13px;opacity:.7;max-width:380px;">${subtitle}</div>
      </div>`;
  }
  toast(title);
}

function _fallbackFingerprint() {
  let v = localStorage.getItem('trunkstv_fp');
  if (v) return v;
  const rnd = (crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('')
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
  localStorage.setItem('trunkstv_fp', rnd);
  return rnd;
}
async function getIluenpFingerprint() {
  if (_ilFp) return _ilFp;
  if (window.FingerprintJS) {
    try {
      const fp = await FingerprintJS.load({ monitoring: false });
      const r = await fp.get();
      _ilFp = r.visitorId;
      return _ilFp;
    } catch(e) { /* fallback abajo */ }
  }
  _ilFp = _fallbackFingerprint();
  return _ilFp;
}
async function getIluenpDomain() {
  if (_ilDomainCache.value && (Date.now() - _ilDomainCache.ts) < 5*60*1000) return _ilDomainCache.value;
  const fp = await getIluenpFingerprint();
  const res = await fetch(`https://watch.iluenp.com/api/playback-domain?fingerprint=${fp}`);
  if (!res.ok) throw new Error('iluenp API ' + res.status);
  const j = await res.json();
  _ilDomainCache = { value: j.domain, ts: Date.now() };
  return j.domain;
}

const IL_PROXIES = [
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => 'https://proxy.cors.sh/' + u,
  u => u
];
let _ilProxyIdx = 0;

async function iluenpView() {
  const fp = await getIluenpFingerprint();
  const body = JSON.stringify({ fingerprint: fp });
  const headers = { 'Content-Type': 'application/json' };
  if (_ilDomainCache.value) headers['X-Origin-Server'] = _ilDomainCache.value;
  const target = 'https://watch.iluenp.com/api/view?_=' + Date.now();

  let lastErr;
  for (let i = 0; i < IL_PROXIES.length; i++) {
    const idx = (_ilProxyIdx + i) % IL_PROXIES.length;
    try {
      const res = await fetch(IL_PROXIES[idx](target), {
        method: 'POST', headers, body, cache: 'no-store'
      });
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
      const text = await res.text();
      if (!text || text.trim().startsWith('<')) {
        lastErr = new Error('proxy bloqueado'); continue;
      }
      _ilProxyIdx = idx;
      return JSON.parse(text);
    } catch(e) { lastErr = e; }
  }
  throw lastErr || new Error('iluenp /view failed');
}

async function resolveOvenSources(parsed) {
  if (parsed.source === 'url') {
    const u = parsed.url;
    const type = u.includes('.mpd') ? 'dash' : (u.startsWith('ws') ? 'webrtc' : 'hls');
    return [{ file: u, type }];
  }
  if (parsed.source === 'iluenp') {
    const domain = await getIluenpDomain();
    const base = `https://${domain}/hls/public`;
    const isMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isMobile) return [{ file: `${base}/ts:abr.m3u8`, type: 'hls' }];
    return [
      { file: `${base}/ts:1080p.m3u8`, label: '1080p', type: 'hls' },
      { file: `${base}/ts:720p.m3u8`,  label: '720p',  type: 'hls' },
      { file: `${base}/ts:480p.m3u8`,  label: '480p',  type: 'hls' },
      { file: `${base}/ts:360p.m3u8`,  label: '360p',  type: 'hls' },
      { file: `${base}/ts:160p.m3u8`,  label: '160p',  type: 'hls' }
    ];
  }
  return [];
}

/* ═══════════════════════════════════════════════════════
   WRAPPER UNIFICADO (Twitch.Player ↔ OvenPlayer)
════════════════════════════════════════════════════════ */
function makePlayerWrapper(kind, inst) {
  return {
    kind, inst,
    play()    { try { inst.play(); } catch(e){} },
    pause()   { try { inst.pause(); } catch(e){} },
    isPaused(){
      try { return kind === 'twitch' ? inst.isPaused() : (inst.getState() !== 'playing'); }
      catch(e){ return true; }
    },
    setMuted(b){ try { kind === 'twitch' ? inst.setMuted(b) : inst.setMute(b); } catch(e){} },
    getMuted() { try { return kind === 'twitch' ? inst.getMuted() : inst.getMute(); } catch(e){ return false; } },
    setVolume(v01){
      try {
        if (kind === 'twitch') inst.setVolume(v01);
        else inst.setVolume(Math.round(Math.max(0, Math.min(1, v01)) * 100));
      } catch(e){}
    },
    getVolume(){
      try { return kind === 'twitch' ? inst.getVolume() : (inst.getVolume()/100); }
      catch(e){ return 0; }
    },
    getQualities(){
      try {
        if (kind === 'twitch') return inst.getQualities() || [];
        const ls = inst.getQualityLevels() || [];
        return ls.map(q => ({ name: q.label || (q.height ? q.height+'p' : 'auto'), group: q.label }));
      } catch(e){ return []; }
    },
    setQuality(name){
      try {
        if (kind === 'twitch') { inst.setQuality(name); return; }
        const ls = inst.getQualityLevels() || [];
        const idx = ls.findIndex(q => (q.label || '') === name);
        if (idx >= 0) inst.setCurrentQuality(idx);
      } catch(e){}
    },
    onPlaying(cb){
      if (kind === 'twitch') inst.addEventListener(Twitch.Player.PLAYING, cb);
      else inst.on('stateChanged', e => { if (e.newstate === 'playing') cb(); });
    },
    onPause(cb){
      if (kind === 'twitch') inst.addEventListener(Twitch.Player.PAUSE, cb);
      else inst.on('stateChanged', e => { if (e.newstate === 'paused') cb(); });
    },
    destroy(){
      try { if (kind === 'oven') inst.remove(); } catch(e){}
    }
  };
}

/* ═══════════════════════════════════════════════════════
   PLAYER Y MUTE
════════════════════════════════════════════════════════ */
async function initPlayer(ch) {
  S.channel = ch;

  if(ch) {
    S.recent = S.recent.filter(c => c.toLowerCase() !== ch.toLowerCase());
    S.recent.unshift(ch);
    if(S.recent.length > 5) S.recent.pop();
  }
  saveS();

  const emb = document.getElementById('twitch-embed');
  if (mainPlayer && mainPlayer.destroy) mainPlayer.destroy();
  emb.innerHTML = '';

  const parsed = parsePlayerSource(ch);

  if (parsed.kind === 'twitch') {
    const inst = new Twitch.Player('twitch-embed', {
      channel: parsed.channel,
      width:'100%', height:'100%',
      autoplay:true, controls:false,
      parent: getParents(),
    });
    mainPlayer = makePlayerWrapper('twitch', inst);
  } else if (parsed.kind === 'iframe') {
    emb.innerHTML = `<iframe src="${parsed.url}" style="width:100%;height:100%;border:none;background:#000;" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>`;
    mainPlayer = null;
  } else {
    if (typeof OvenPlayer === 'undefined') { toast('OvenPlayer no cargado'); return; }
    if (parsed.source === 'iluenp') clearIluenpOffline();
    emb.innerHTML = '<video id="oven-video" playsinline style="width:100%;height:100%;background:#000;"></video>';
    let sources;
    try { sources = await resolveOvenSources(parsed); }
    catch(e) { toast('OvenPlayer: ' + e.message); return; }

    const inst = OvenPlayer.create('oven-video', {
      autoFallback: false,
      autoStart: true,
      mute: S.muted,
      parseStream: { enabled: true },
      hlsConfig: {
        preserveManualLevelOnError: true,
        liveSyncDuration: 6,
        liveMaxLatencyDuration: 12,
        maxLiveSyncPlaybackRate: 1.11
      },
      sources
    });
    inst.on('error', e => {
      if (parsed.source === 'iluenp') { handleIluenpOffline(); return; }
      toast('OvenPlayer error: ' + (e?.message || e?.code || 'desconocido'));
    });
    mainPlayer = makePlayerWrapper('oven', inst);
  }

  if (mainPlayer) {
    mainPlayer.onPlaying(() => {
      setPlayBtn(true);
      mainPlayer.setVolume(S.volume);
      if (S.muted) {
        mainPlayer.setMuted(true);
        setMuteBtn(true);
        document.getElementById('vol').value = 0;
      } else {
        mainPlayer.setMuted(false);
        setMuteBtn(false);
        document.getElementById('vol').value = S.volume;
      }
    });
    mainPlayer.onPause(() => setPlayBtn(false));
  }

  updateChatTabs();
  updateCurrentFavIcon();

  clearInterval(viewerTimer);
  clearInterval(infoTimer);

  const meta = metaTwitchChannel(ch);
  if (meta) {
    loadAvatar(ch, document.getElementById('chAvatarImg'));
    fetchInfo(ch);
    infoTimer = setInterval(() => fetchInfo(S.channel), 60000);
  } else {
    const img = document.getElementById('chAvatarImg');
    if (img) { img.style.display = 'none'; img.src = ''; }
    document.getElementById('streamTitle').textContent = parsed.label || 'Stream OvenPlayer';
    document.getElementById('streamGame').textContent  = 'OvenPlayer';
    document.getElementById('uptimeText').textContent  = 'LIVE';
  }

  if (parsed.kind === 'twitch') {
    fetchViewers(ch);
    viewerTimer = setInterval(() => fetchViewers(S.channel), 12000);
  } else if (parsed.source === 'iluenp') {
    const pollIl = async () => {
      try {
        const r = await iluenpView();
        document.getElementById('viewerCount').textContent =
          (r.view_count ?? 0).toLocaleString('es-ES');
        const lb = document.getElementById('liveBadge');
        const live = r.is_live === true;
        if (live) {
          lb.classList.remove('offline');
          lb.innerHTML = '<div class="live-dot"></div>LIVE';
        } else {
          lb.classList.add('offline');
          lb.innerHTML = 'OFFLINE';
        }
        S.liveStatus['oven:iluenp'] = live;
        if (live) {
          _ilEverLiveThisSession = true;
          try { localStorage.setItem('trunkstv_il_lastLiveDate', new Date().toISOString().slice(0,10)); } catch(e){}
          clearIluenpOffline();
        }
        if ($chDrop.classList.contains('open')) buildDropdown($chInput.value);
      } catch(e) { console.warn('iluenp poll fail', e); }
    };
    pollIl();
    viewerTimer = setInterval(pollIl, 20000);
  } else {
    document.getElementById('viewerCount').textContent = parsed.kind === 'iframe' ? 'Web Externa' : '—';
    const lb = document.getElementById('liveBadge');
    lb.classList.remove('offline');
    lb.innerHTML = '<div class="live-dot"></div>LIVE';
  }
}

function loadChat(ch) {
  const parsed = parsePlayerSource(ch);
  let url;
  if (parsed.kind === 'iframe') {
    if ($chatFrm.src !== 'about:blank') $chatFrm.src = 'about:blank';
    return;
  }
  if (parsed.kind === 'oven') {
    if (parsed.source === 'iluenp') {
      url = `https://www.twitch.tv/embed/ilutvlive/chat?darkpopout&parent=${window.location.hostname || 'localhost'}`;
    } else {
      if ($chatFrm.src !== 'about:blank') $chatFrm.src = 'about:blank';
      return;
    }
  } else {
    url = `https://www.twitch.tv/embed/${ch}/chat?darkpopout&parent=${window.location.hostname || 'localhost'}`;
  }
  if ($chatFrm.src !== url) $chatFrm.src = url;
}

function togglePlay() {
  if(mainPlayer) {
    mainPlayer.isPaused() ? mainPlayer.play() : mainPlayer.pause();
  }
}

function setPlayBtn(p) {
  document.getElementById('btn-play').innerHTML = p
    ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg><span class="btn-tip">Pause (Space)</span>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span class="btn-tip">Play (Space)</span>`;
}

function setMuteBtn(m) {
  document.getElementById('btn-mute').innerHTML = m
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg><span class="btn-tip">Activar sonido (M)</span>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg><span class="btn-tip">Silenciar (M)</span>`;
}

function toggleMute() {
  if(!mainPlayer) return;

  const isMuted = mainPlayer.getMuted();

  if (isMuted) {
    mainPlayer.setMuted(false);
    S.muted = false;
    if (S.volume === 0) S.volume = 0.5;
    mainPlayer.setVolume(S.volume);
    document.getElementById('vol').value = S.volume;
  } else {
    mainPlayer.setMuted(true);
    S.muted = true;
    document.getElementById('vol').value = 0;
  }

  setMuteBtn(S.muted);
  saveS();
}

function changeVolume(v) {
  if(!mainPlayer) return;
  S.volume = parseFloat(v);
  mainPlayer.setVolume(S.volume);

  if(S.volume > 0) {
    S.muted = false;
    mainPlayer.setMuted(false);
  } else {
    S.muted = true;
    mainPlayer.setMuted(true);
  }

  setMuteBtn(S.muted);
  saveS();
}

/* ═══════════════════════════════════════════════════════
   BUSCADOR DE CANALES
════════════════════════════════════════════════════════ */
function toggleFavStatus(ch) {
  if (isTwitchLoggedIn()) {
    toast('Sesión Twitch activa: usa Twitch para seguir/dejar de seguir');
    return;
  }
  const cLow = ch.toLowerCase().trim();
  const idx = S.favorites.findIndex(f => f.toLowerCase() === cLow);
  if(idx > -1) {
    S.favorites.splice(idx, 1);
  } else {
    S.favorites.push(ch);
  }
  saveS();
  updateCurrentFavIcon();
  buildDropdown($chInput.value);
}

function updateCurrentFavIcon() {
  const icon = document.getElementById('fav-icon-current');
  const btn = document.getElementById('btn-fav-current');
  if (!icon || !btn) return;
  const favs = currentFavs();
  if (favs.some(f => f.toLowerCase() === S.channel.toLowerCase())) {
    icon.setAttribute('fill', 'currentColor');
    btn.classList.add('on');
  } else {
    icon.setAttribute('fill', 'none');
    btn.classList.remove('on');
  }
}

function fmtViewers(n) {
  if (n == null) return '';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function sortChannels(list) {
  const arr = list.slice();
  const vc = (ch) => viewerCounts[ch.toLowerCase()] || 0;
  const live = (ch) => !!S.liveStatus[ch.toLowerCase()];
  if (S.favSort === 'viewers') {
    arr.sort((a, b) => vc(b) - vc(a));
  } else if (S.favSort === 'alpha') {
    arr.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } else {
    // 'live': en vivo primero (por viewers desc), luego offline (A-Z)
    arr.sort((a, b) => {
      const la = live(a), lb = live(b);
      if (la !== lb) return lb - la;
      if (la && lb) return vc(b) - vc(a);
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }
  return arr;
}

function renderFavToolbar(container) {
  const bar = document.createElement('div');
  bar.className = 'dd-toolbar';
  bar.onmousedown = e => e.preventDefault();
  const mk = (val, label) =>
    `<button class="dd-chip ${S.favSort===val?'on':''}" data-sort="${val}">${label}</button>`;
  bar.innerHTML = `
    <div class="dd-chips">
      ${mk('live','En vivo')}
      ${mk('viewers','Viewers')}
      ${mk('alpha','A–Z')}
    </div>
    <button class="dd-chip dd-only-live ${S.favOnlyLive?'on':''}" title="Solo en vivo">
      <span class="dd-live-dot"></span>
    </button>
  `;
  bar.querySelectorAll('button[data-sort]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      S.favSort = btn.dataset.sort;
      saveS();
      buildDropdown($chInput.value);
    };
  });
  bar.querySelector('.dd-only-live').onclick = (e) => {
    e.preventDefault();
    S.favOnlyLive = !S.favOnlyLive;
    saveS();
    buildDropdown($chInput.value);
  };
  container.appendChild(bar);
}

function buildChannelList(container, filter, onPick, opts = {}) {
  container.innerHTML = '';
  const lf = (filter || '').toLowerCase().trim();
  let pool = [];

  const favList = currentFavs();
  const favTitle = isTwitchLoggedIn() ? 'Seguidos en Twitch' : 'Favoritos';
  let favs = favList.filter(c => c.toLowerCase().includes(lf));
  if (S.favOnlyLive) favs = favs.filter(c => S.liveStatus[c.toLowerCase()]);
  favs = sortChannels(favs);
  const showToolbar = !opts.hideToolbar && favList.length > 0;
  if (favs.length > 0) pool.push({ title: favTitle, items: favs });

  if (!lf && !S.favOnlyLive && S.recent.length > 0) {
    const recs = S.recent.filter(c => !favList.some(f => f.toLowerCase() === c.toLowerCase()));
    if (recs.length > 0) pool.push({ title: 'Últimos Vistos', items: recs });
  }

  if (lf && !favList.some(c => c.toLowerCase() === lf)) {
    if (pool.length === 0) pool.push({ title: 'Buscar', items: [filter] });
    else pool[0].items.unshift(filter);
  }

  if (showToolbar) renderFavToolbar(container);

  if (pool.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dd-empty';
    empty.textContent = S.favOnlyLive ? 'Ningún canal en vivo' : 'No hay canales';
    container.appendChild(empty);
    return;
  }

  pool.forEach(section => {
    const lbl = document.createElement('div');
    lbl.className = 'dd-section';
    lbl.innerHTML = `<span>${section.title}</span>`;
    container.appendChild(lbl);

    section.items.forEach((ch) => {
      const item = document.createElement('div');
      item.className = 'dd-item';
      const favLow = favList.map(x => x.toLowerCase());
      const isFav = favLow.includes(ch.toLowerCase());
      const isLive = !!S.liveStatus[ch.toLowerCase()];
      const favIdx = favLow.indexOf(ch.toLowerCase());
      const kbdHint = (!opts.hideKbd && (section.title === 'Favoritos' || section.title === 'Seguidos en Twitch') && favIdx >= 0 && favIdx < 9)
        ? `<span class="dd-kbd">${favIdx + 1}</span>` : '';

      const avId = `dav-${container.id}-${ch}`;
      const display = channelToDisplay(ch);
      const vc = viewerCounts[ch.toLowerCase()];
      const viewerBadge = (isLive && vc) ? `<span class="dd-viewers" title="${vc.toLocaleString('es-ES')} viewers">${fmtViewers(vc)}</span>` : '';
      item.innerHTML = `
        <div class="dd-av-wrap">
          <div class="dd-av" id="${avId}">${display.substring(0,2).toUpperCase()}</div>
          ${isLive ? '<span class="dd-live-indicator" title="En directo"></span>' : ''}
        </div>
        <span class="dd-name">${display}</span>
        ${viewerBadge}
        ${kbdHint}
        <button class="fav-btn ${isFav?'on':''}" title="${isFav?'Quitar':'Agregar'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>`;

      item.onmousedown = e => {
        if (e.target.closest('.fav-btn')) return;
        e.preventDefault();
        onPick(ch);
      };

      item.querySelector('.fav-btn').onmousedown = e => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavStatus(ch);
      };

      container.appendChild(item);
      loadAvatar(ch, null, avId);
    });
  });
}

function buildDropdown(filter = '') {
  buildChannelList($chDrop, filter, switchChannel);
}

$chInput.addEventListener('focus', () => { buildDropdown($chInput.value); $chDrop.classList.add('open'); });
$chInput.addEventListener('input', () => buildDropdown($chInput.value));
$chInput.addEventListener('blur', () => setTimeout(() => $chDrop.classList.remove('open'), 180));
$chInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const v = $chInput.value.trim();
    if(v) switchChannel(v);
    e.target.blur();
  }
});

function switchChannel(name) {
  const canonical = aliasToChannel(name);
  $chInput.value = channelToDisplay(canonical);
  $chDrop.classList.remove('open');
  if(canonical !== S.channel) initPlayer(canonical);
}

/* ═══════════════════════════════════════════════════════
   AJUSTES (SÓLO CALIDAD)
════════════════════════════════════════════════════════ */
function openSettings(e) {
  if (e) e.stopPropagation();
  renderSettingsMenu();
  $settings.classList.toggle('open');
}

window.addEventListener('click', e => {
  if(!e.target.closest('#settingsMenu') && !e.target.closest('button[onclick="openSettings(event)"]')) {
    $settings.classList.remove('open');
  }
});

function renderSettingsMenu() {
  $settings.innerHTML = '';

  // ── Calidad ──
  const secQ = document.createElement('div');
  secQ.className = 'sm-section';
  secQ.textContent = 'Calidad de Video';
  $settings.appendChild(secQ);
  createQItem('auto', 'Auto');
  if (mainPlayer) {
    try {
      const qs = mainPlayer.getQualities();
      if (qs && qs.length) qs.forEach(q => { if (q.name !== 'auto') createQItem(q.name, q.name); });
    } catch(e) {}
  }

  // ── Notificaciones ──
  addDivider();
  const secN = document.createElement('div');
  secN.className = 'sm-section';
  secN.textContent = 'Notificaciones';
  $settings.appendChild(secN);
  const notifItem = document.createElement('div');
  notifItem.className = 'sm-item';
  notifItem.innerHTML = `
    <span>Avisarme cuando un favorito emita</span>
    <div class="tog ${S.notifications ? 'on' : ''}"><div class="tog-thumb"></div></div>`;
  notifItem.onclick = async () => {
    if (!S.notifications) {
      if (!('Notification' in window)) { toast('Tu navegador no soporta notificaciones'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Permiso denegado'); return; }
      S.notifications = true;
      toast('Notificaciones activadas');
    } else {
      S.notifications = false;
      toast('Notificaciones desactivadas');
    }
    saveS();
    renderSettingsMenu();
  };
  $settings.appendChild(notifItem);

  // ── Color de acento ──
  addDivider();
  const secC = document.createElement('div');
  secC.className = 'sm-section';
  secC.textContent = 'Color de acento';
  $settings.appendChild(secC);
  const pal = document.createElement('div');
  pal.className = 'sm-palette';
  PALETTE.forEach(p => {
    const b = document.createElement('button');
    b.className = `pal-swatch ${S.accentColor === p.value ? 'on' : ''}`;
    b.style.background = p.value;
    b.title = p.name;
    b.onclick = () => { applyAccentColor(p.value); S.accentColor = p.value; saveS(); renderSettingsMenu(); };
    pal.appendChild(b);
  });
  $settings.appendChild(pal);

  // ── Cuenta Twitch ──
  addDivider();
  const secT = document.createElement('div');
  secT.className = 'sm-section';
  secT.textContent = 'Cuenta Twitch';
  $settings.appendChild(secT);

  if (isTwitchLoggedIn()) {
    const u = S.twitchAuth.user;
    const info = document.createElement('div');
    info.className = 'sm-item';
    info.style.cursor = 'default';
    info.innerHTML = `<span>Conectado: <strong>@${u.login}</strong></span><span style="font-size:11px; color:var(--muted,#a1a1aa);">${S.twitchAuth.follows.length} seguidos</span>`;
    info.onclick = (ev) => ev.stopPropagation();
    $settings.appendChild(info);
    createMenuItem('↻ Actualizar seguidos', false, async () => { $settings.classList.remove('open'); await refreshTwitchFollows(); });
    createMenuItem('⎋ Cerrar sesión de Twitch', false, () => { $settings.classList.remove('open'); logoutTwitch(); });
  } else {
    createMenuItem('🔐 Iniciar sesión con Twitch', false, () => { $settings.classList.remove('open'); loginWithTwitch(); });
  }

  // ── Acciones ──
  addDivider();
  const secA = document.createElement('div');
  secA.className = 'sm-section';
  secA.textContent = 'Acciones';
  $settings.appendChild(secA);
  createMenuItem('↗ Abrir en Twitch.tv', false, () => { openInTwitch(); $settings.classList.remove('open'); });

  // ── Reiniciar ──
  addDivider();
  const reset = document.createElement('div');
  reset.className = 'sm-item sm-reset';
  reset.innerHTML = '<span>Restablecer preferencias</span>';
  reset.onclick = () => {
    if (confirm('¿Borrar todas las preferencias guardadas?')) {
      localStorage.removeItem('trunkstv_state');
      location.reload();
    }
  };
  $settings.appendChild(reset);
}

function addDivider() {
  const d = document.createElement('div');
  d.className = 'sm-divider';
  $settings.appendChild(d);
}

function createMenuItem(label, active, onClick) {
  const d = document.createElement('div');
  d.className = `sm-item ${active ? 'on' : ''}`;
  d.innerHTML = `<span>${label}</span>${active ? '<span class="sm-check">✓</span>' : ''}`;
  d.onclick = onClick;
  $settings.appendChild(d);
  return d;
}

function createQItem(val, lbl) {
  createMenuItem(lbl, S.quality === val, () => {
    if (mainPlayer) { try { mainPlayer.setQuality(val); } catch(e){} }
    S.quality = val;
    saveS();
    renderSettingsMenu();
    $settings.classList.remove('open');
  });
}

/* ═══════════════════════════════════════════════════════
   MULTISTREAM
════════════════════════════════════════════════════════ */
function toggleMulti() {
  S.multiOn = !S.multiOn;

  if (S.multiOn) {
    document.getElementById('btn-multi').classList.add('on');
    document.getElementById('btn-layout').style.display = 'flex';
    document.getElementById('btn-multi-clear').style.display = 'flex';
    $multiG.classList.add('on');
    document.getElementById('twitch-embed').style.display = 'none';
    $infoBar.style.display = 'none';

    if(mainPlayer) mainPlayer.pause();
    initMulti();
  } else {
    document.getElementById('btn-multi').classList.remove('on');
    document.getElementById('btn-layout').style.display = 'none';
    document.getElementById('btn-multi-clear').style.display = 'none';
    $multiG.classList.remove('on');
    document.getElementById('twitch-embed').style.display = 'block';
    $infoBar.style.display = '';

    if(mainPlayer) mainPlayer.play();
    $multiG.innerHTML = '';
    multiPlayers = [null,null,null,null];

    updateChatTabs();
  }
}

function toggleLayout() {
  S.multiLayout = S.multiLayout === 'grid' ? '1main' : 'grid';
  saveS();
  $multiG.className = `on layout-${S.multiLayout}`;
}

async function initMulti() {
  $multiG.innerHTML = '';
  multiPlayers.forEach(p => { try { p && p.destroy && p.destroy(); } catch(e){} });
  multiPlayers = [null,null,null,null];

  for(let i=0; i<4; i++) {
    const slot = document.createElement('div');
    slot.className = `m-slot ${i === activeSlot ? 'active-slot' : ''}`;
    slot.id = `mslot-${i}`;

    slot.onclick = (e) => {
      if(!e.target.closest('input') && !e.target.closest('.m-slot-close')) {
        setActiveSlot(i);
      }
    };

    const ch = S.multiChannels[i];
    if (ch) {
      const display = channelToDisplay(ch);
      slot.innerHTML = `
        <div class="m-slot-label">${display}</div>
        <button class="m-slot-promote" onclick="promoteSlot(${i})" title="Mover a principal">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
        </button>
        <button class="m-slot-close" onclick="closeMultiChannel(${i})">X</button>
        <div id="mplayer-${i}" style="width:100%;height:100%"></div>
        <div class="m-slot-ctrl" id="mctrl-${i}">
          <button class="m-btn m-play" title="Play/Pause">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          </button>
          <button class="m-btn m-mute" title="Silenciar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
          <input type="range" class="m-vol" min="0" max="1" step="0.01" value="${i === activeSlot ? 1 : 0}">
        </div>`;
      $multiG.appendChild(slot);

      const parsed = parsePlayerSource(ch);
      const muted = i !== activeSlot;

      if (parsed.kind === 'twitch') {
        const inst = new Twitch.Player(`mplayer-${i}`, {
          channel: parsed.channel,
          width: '100%', height: '100%',
          muted, controls: false,
          parent: getParents()
        });
        multiPlayers[i] = makePlayerWrapper('twitch', inst);
        attachSlotControls(i);
      } else if (parsed.kind === 'iframe') {
        const cont = document.getElementById(`mplayer-${i}`);
        cont.innerHTML = `<iframe src="${parsed.url}" style="width:100%;height:100%;border:none;background:#000;" allowfullscreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture"></iframe>`;
        multiPlayers[i] = null;
        const ctl = document.getElementById('mctrl-' + i);
        if (ctl) ctl.style.display = 'none';
      } else {
        if (typeof OvenPlayer === 'undefined') { toast('OvenPlayer no cargado'); continue; }
        const cont = document.getElementById(`mplayer-${i}`);
        cont.innerHTML = `<video id="oven-mvideo-${i}" playsinline style="width:100%;height:100%;background:#000;"></video>`;
        try {
          const sources = await resolveOvenSources(parsed);
          const inst = OvenPlayer.create(`oven-mvideo-${i}`, {
            autoFallback: false, autoStart: true, mute: muted,
            parseStream: { enabled: true },
            hlsConfig: {
              preserveManualLevelOnError: true,
              liveSyncDuration: 6,
              liveMaxLatencyDuration: 12,
              maxLiveSyncPlaybackRate: 1.11
            },
            sources
          });
          inst.on('error', e => {
            if (parsed.source === 'iluenp') {
              cont.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0d0d10;color:#888;font-size:12px;text-align:center;padding:12px;">IluTvlive offline</div>`;
            } else {
              toast('Slot ' + (i+1) + ': ' + (e?.message || e?.code || 'error'));
            }
          });
          multiPlayers[i] = makePlayerWrapper('oven', inst);
          attachSlotControls(i);
        } catch(e) {
          toast('Slot ' + (i+1) + ': ' + e.message);
        }
      }
    } else {
      slot.innerHTML = `
        <div class="m-slot-prompt">
          <p>Añadir stream</p>
          <div class="slot-picker-wrap">
            <input type="text" class="m-slot-prompt-input" id="spi-${i}" placeholder="Canal o URL..." autocomplete="off" spellcheck="false">
            <div class="slot-picker-dropdown" id="spd-${i}"></div>
          </div>
        </div>`;
      $multiG.appendChild(slot);
      multiPlayers[i] = null;
      const inp = slot.querySelector(`#spi-${i}`);
      const drp = slot.querySelector(`#spd-${i}`);
      attachSlotPicker(inp, drp, (val) => setMultiChannel(i, val));
    }
  }
  updateChatTabs();
}

function attachSlotControls(i) {
  const ctrl = document.getElementById('mctrl-' + i);
  if (!ctrl) return;
  const p = multiPlayers[i];
  if (!p) { ctrl.style.display = 'none'; return; }

  const btnPlay = ctrl.querySelector('.m-play');
  const btnMute = ctrl.querySelector('.m-mute');
  const vol     = ctrl.querySelector('.m-vol');

  const stop = (e) => e.stopPropagation();
  ctrl.addEventListener('click', stop);
  ctrl.addEventListener('mousedown', stop);

  const iconPlay  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const iconPause = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>`;
  const iconUnmute = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  const iconMute   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;

  const refreshMuteIcon = () => { btnMute.innerHTML = p.getMuted() ? iconMute : iconUnmute; };
  refreshMuteIcon();

  p.onPlaying(() => { btnPlay.innerHTML = iconPause; });
  p.onPause(()   => { btnPlay.innerHTML = iconPlay;  });

  btnPlay.onclick = (e) => { stop(e); try { p.isPaused() ? p.play() : p.pause(); } catch(e){} };
  btnMute.onclick = (e) => {
    stop(e);
    const m = !p.getMuted();
    p.setMuted(m);
    if (!m && parseFloat(vol.value) === 0) { p.setVolume(0.5); vol.value = 0.5; }
    refreshMuteIcon();
  };
  vol.oninput = (e) => {
    const v = parseFloat(e.target.value);
    p.setVolume(v);
    p.setMuted(v === 0);
    refreshMuteIcon();
  };
}

function setMultiChannel(idx, ch) {
  const raw = (ch || '').trim();
  if (!raw) return;
  S.multiChannels[idx] = aliasToChannel(raw);
  saveS();
  initMulti();
}

function closeMultiChannel(idx) {
  S.multiChannels[idx] = '';
  saveS();
  initMulti();
}

function setActiveSlot(idx) {
  activeSlot = idx;
  document.querySelectorAll('.m-slot').forEach((el, i) => {
    el.classList.toggle('active-slot', i === idx);
    const p = multiPlayers[i];
    if (!p) return;
    try {
      p.setMuted(i !== idx);
      if (i === idx) p.setVolume(1);
    } catch(e){}
    const vol = el.querySelector('.m-vol');
    if (vol) vol.value = i === idx ? 1 : 0;
    const btnMute = el.querySelector('.m-mute');
    if (btnMute) {
      const muted = i !== idx;
      btnMute.innerHTML = muted
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    }
  });
}

/* ═══════════════════════════════════════════════════════
   TABS DE CHAT (SIN OMNICHAT)
════════════════════════════════════════════════════════ */
function updateChatTabs() {
  if(!S.multiOn) {
    $chatTabs.classList.remove('show');
    currentChatChannel = S.channel;
    loadChat(S.channel);
    return;
  }

  const activeChans = S.multiChannels.filter(c => c !== '');
  if(activeChans.length === 0) activeChans.push(S.channel);

  $chatTabs.classList.add('show');
  $chatTabs.innerHTML = '';

  if (!activeChans.includes(currentChatChannel)) {
      currentChatChannel = activeChans[0];
  }

  activeChans.forEach(ch => {
    const btn = document.createElement('div');
    btn.className = `chat-tab ${ch === currentChatChannel ? 'active' : ''}`;
    btn.textContent = channelToDisplay(ch);
    btn.onclick = () => {
      currentChatChannel = ch;
      loadChat(ch);
      updateChatTabs();
    };
    $chatTabs.appendChild(btn);
  });

  loadChat(currentChatChannel);
}

/* ═══════════════════════════════════════════════════════
   DATOS DECAPI (METADATA)
════════════════════════════════════════════════════════ */
function decapiOk(s) {
  return typeof s === 'string' && !s.toLowerCase().includes('error') && !s.startsWith('<') && s.length < 500;
}

async function fetchInfo(ch) {
  const meta = metaTwitchChannel(ch);
  if (!meta) return;
  try {
    const [t,g,u] = await Promise.all([
      fetch(`https://decapi.me/twitch/title/${meta}`).then(r=>r.text()),
      fetch(`https://decapi.me/twitch/game/${meta}`).then(r=>r.text()),
      fetch(`https://decapi.me/twitch/uptime/${meta}`).then(r=>r.text())
    ]);
    document.getElementById('streamTitle').textContent = decapiOk(t) ? t : '—';
    document.getElementById('streamGame').textContent  = decapiOk(g) ? g : '—';
    document.getElementById('uptimeText').textContent  = (decapiOk(u) && !u.toLowerCase().includes('offline')) ? u : 'Offline';
  } catch(e){}
}

async function fetchViewers(ch) {
  const meta = metaTwitchChannel(ch);
  if (!meta) return;
  try {
    const res = await fetch(`https://decapi.me/twitch/viewercount/${meta}`);
    const text = await res.text();
    if (decapiOk(text) && !text.toLowerCase().includes('offline')) {
      document.getElementById('viewerCount').textContent = parseInt(text).toLocaleString('es-ES');
      document.getElementById('liveBadge').classList.remove('offline');
      document.getElementById('liveBadge').innerHTML = '<div class="live-dot"></div>LIVE';
    } else {
      document.getElementById('viewerCount').textContent = '0';
      document.getElementById('liveBadge').classList.add('offline');
      document.getElementById('liveBadge').innerHTML = 'OFFLINE';
    }
  } catch(e) {}
}

async function loadAvatar(ch, imgEl, idStr) {
  const meta = metaTwitchChannel(ch);
  if (!meta) return;
  const el = imgEl || (idStr ? document.querySelector(`#${CSS.escape(idStr)} img`) : null);
  if (!el && !idStr) return;
  try {
    const res = await fetch(`https://decapi.me/twitch/avatar/${meta}`);
    const url = await res.text();
    if (decapiOk(url) && url.startsWith('http')) {
      if(!el) {
        document.getElementById(idStr).innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
      } else {
        el.src = url;
        el.style.display = 'block';
      }
    }
  } catch(e) {}
}

/* ═══════════════════════════════════════════════════════
   MINI PLAYER (ARRASTRABLE)
════════════════════════════════════════════════════════ */
function toggleMini() {
  if (!S.miniOn && parsePlayerSource(S.channel).kind === 'oven') {
    toast('Mini player no soportado para fuentes OvenPlayer'); return;
  }
  if (!S.miniOn && parsePlayerSource(S.channel).kind === 'iframe') {
    toast('Mini player no soportado para webs externas'); return;
  }
  S.miniOn = !S.miniOn;
  if(S.miniOn) {
    if (S.miniSize) {
      $mini.style.width  = S.miniSize.width  + 'px';
      $mini.style.height = S.miniSize.height + 'px';
    }
    if (S.miniPos) {
      $mini.style.left   = S.miniPos.left + 'px';
      $mini.style.top    = S.miniPos.top  + 'px';
      $mini.style.right  = 'auto';
      $mini.style.bottom = 'auto';
    }
    $mini.classList.add('on');
    initMiniEmbed(S.channel);
  } else {
    $mini.classList.remove('on');
    $miniEmb.innerHTML = '';
    miniPlayer2 = null;
  }
  saveS();
}

function initMiniEmbed(ch) {
  $miniEmb.innerHTML = '';
  miniPlayer2 = new Twitch.Player('mini-embed', {
    channel: ch,
    width: '100%',
    height: '100%',
    muted: true,
    controls: false,
    parent: getParents()
  });
  miniPlayer2.addEventListener(Twitch.Player.PLAYING, () => {
    miniPlayer2.setVolume(S.miniVolume || 0.5);
    updateMiniAudioUI();
  });
}

let isDragging = false, startX, startY, initialX, initialY;
$miniBar.addEventListener('mousedown', e => {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  const rect = $mini.getBoundingClientRect();
  initialX = rect.left;
  initialY = rect.top;
  $mini.classList.add('dragging');
  $miniBar.classList.add('dragging');
});

window.addEventListener('mousemove', e => {
  if(!isDragging) return;
  $mini.style.left = `${initialX + (e.clientX - startX)}px`;
  $mini.style.top = `${initialY + (e.clientY - startY)}px`;
  $mini.style.bottom = 'auto';
  $mini.style.right = 'auto';
});

window.addEventListener('mouseup', () => {
  if (isDragging) {
    const rect = $mini.getBoundingClientRect();
    S.miniPos = { left: rect.left, top: rect.top };
    saveS();
  }
  isDragging = false;
  $mini.classList.remove('dragging');
  $miniBar.classList.remove('dragging');
});

/* ═══════════════════════════════════════════════════════
   UI TOGGLES GLOBALES
════════════════════════════════════════════════════════ */
function toggleChat() {
  S.chatOpen = !S.chatOpen;
  if(S.chatOpen) {
    $chat.classList.remove('hidden');
    $chatTog.classList.add('on');
  } else {
    $chat.classList.add('hidden');
    $chatTog.classList.remove('on');
  }
  saveS();
}

function toggleFullscreen() {
  const d = window.document.documentElement;
  if (!window.document.fullscreenElement) {
    (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
  } else {
    window.document.exitFullscreen();
  }
}

function toggleTheater() {
  S.theater = !S.theater;
  const btn = document.getElementById('btn-theater');
  if(S.theater) {
    document.body.classList.add('theater');
    btn.classList.add('on');
  } else {
    document.body.classList.remove('theater');
    btn.classList.remove('on');
  }
  saveS();
}

function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('es-ES', {hour12: false});
}

let uiTimer;
window.addEventListener('mousemove', () => {
  $controls.classList.remove('hide');
  $infoBar.classList.remove('hide');
  document.body.style.cursor = 'default';

  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    if(!document.fullscreenElement) return;
    $controls.classList.add('hide');
    $infoBar.classList.add('hide');
    document.body.style.cursor = 'none';
  }, 3500);
});

window.addEventListener('keydown', (e) => {
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)) return;

  const k = e.key.toLowerCase();

  // Números 1-9 → favoritos
  if (k >= '1' && k <= '9') {
    const idx = parseInt(k) - 1;
    const favs = currentFavs();
    if (favs[idx]) { switchChannel(favs[idx]); return; }
  }

  switch(k) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'm': toggleMute(); break;
    case 'f': toggleFullscreen(); break;
    case 't': toggleTheater(); break;
    case 'p': toggleMini(); break;
    case 'g': toggleMulti(); break;
    case 'l': if(S.multiOn) toggleLayout(); break;
    case 's': shareChannel(); break;
    case 'arrowup':   e.preventDefault(); adjustVolume(0.1); break;
    case 'arrowdown': e.preventDefault(); adjustVolume(-0.1); break;
    case 'escape':
      $chDrop.classList.remove('open');
      $settings.classList.remove('open');
      document.getElementById('kb-panel').classList.remove('open');
      break;
    case '?': document.getElementById('kb-panel').classList.add('open'); break;
  }
});

/* ═══════════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════════════ */
function toast(msg, duration = 2400) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ═══════════════════════════════════════════════════════
   COMPARTIR
════════════════════════════════════════════════════════ */
function shareChannel() {
  const parsed = parsePlayerSource(S.channel);
  const url = parsed.kind === 'oven'
    ? (parsed.source === 'iluenp' ? 'https://watch.iluenp.com/' : (parsed.url || S.channel))
    : parsed.kind === 'iframe'
      ? (parsed.url || S.channel)
      : `https://www.twitch.tv/${S.channel}`;
  const write = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(url)
    : Promise.reject();
  write.then(() => toast(`Enlace copiado: ${url}`))
       .catch(() => {
         const ta = document.createElement('textarea');
         ta.value = url;
         document.body.appendChild(ta);
         ta.select();
         try { document.execCommand('copy'); toast(`Enlace copiado: ${url}`); }
         catch(e) { toast(url); }
         ta.remove();
       });
}

/* ═══════════════════════════════════════════════════════
   VOLUMEN (flechas + rueda)
════════════════════════════════════════════════════════ */
function adjustVolume(delta) {
  const input = document.getElementById('vol');
  const cur = parseFloat(input.value);
  const v = Math.max(0, Math.min(1, Math.round((cur + delta) * 100) / 100));
  input.value = v;
  changeVolume(v);
  toast(`Volumen ${Math.round(v * 100)}%`, 900);
}

document.querySelector('.vol-wrap').addEventListener('wheel', (e) => {
  e.preventDefault();
  adjustVolume(e.deltaY < 0 ? 0.05 : -0.05);
}, { passive: false });

/* ═══════════════════════════════════════════════════════
   COLOR DE ACENTO
════════════════════════════════════════════════════════ */
function applyAccentColor(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  const rgb = hexToRgb(hex);
  if (rgb) {
    document.documentElement.style.setProperty('--accent-dim', `rgba(${rgb.r},${rgb.g},${rgb.b},.18)`);
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
}

/* ═══════════════════════════════════════════════════════
   POLL DE FAVORITOS EN DIRECTO
════════════════════════════════════════════════════════ */
let lastLivePoll = 0;

async function pollFavoritesLive() {
  const favs = currentFavs();
  const previous = { ...S.liveStatus };

  if (isTwitchLoggedIn() && favs.length > 0) {
    // Helix: 1 petición por cada 100 logins, estado en vivo + viewer count
    try {
      for (let i = 0; i < favs.length; i += 100) {
        const chunk = favs.slice(i, i + 100);
        const qs = chunk.map(l => 'user_login=' + encodeURIComponent(l)).join('&');
        const d = await twitchApi('/streams?' + qs + '&first=100');
        const liveMap = {};
        (d.data || []).forEach(s => {
          const k = (s.user_login || '').toLowerCase();
          liveMap[k] = s.viewer_count || 0;
        });
        chunk.forEach(l => {
          const low = l.toLowerCase();
          const isLive = low in liveMap;
          S.liveStatus[low] = isLive;
          if (isLive) viewerCounts[low] = liveMap[low];
          else delete viewerCounts[low];
        });
      }
    } catch(e) { console.warn('Helix streams poll fail', e); }
  } else {
    const unique = [...new Set([...favs, ...S.recent])]
      .filter(c => parsePlayerSource(c).kind === 'twitch')
      .map(c => c.toLowerCase());
    if (unique.length === 0) { lastLivePoll = Date.now(); return; }
    await Promise.all(unique.map(async (ch) => {
      try {
        const res = await fetch(`https://decapi.me/twitch/uptime/${ch}`);
        const t = await res.text();
        S.liveStatus[ch] = decapiOk(t) && !t.toLowerCase().includes('offline');
      } catch(e) {
        // mantener estado previo
      }
    }));
  }

  // Notificaciones para favoritos que acaban de entrar en directo
  if (S.notifications && 'Notification' in window && Notification.permission === 'granted') {
    favs.forEach(ch => {
      const low = ch.toLowerCase();
      if (S.liveStatus[low] && !previous[low]) {
        const n = new Notification(`${ch} está en directo`, {
          body: 'Haz clic para ver en TrunksTV',
          silent: false
        });
        n.onclick = () => { window.focus(); switchChannel(ch); n.close(); };
      }
    });
  }

  lastLivePoll = Date.now();
  saveS();
  if ($chDrop.classList.contains('open')) buildDropdown($chInput.value);
}

// Refrescar estado al abrir dropdown si han pasado > 45s
$chInput.addEventListener('focus', () => {
  if (Date.now() - lastLivePoll > 45000) pollFavoritesLive();
});

/* ═══════════════════════════════════════════════════════
   MINI PLAYER — REDIMENSIONADO
════════════════════════════════════════════════════════ */
let isResizing = false, rsX, rsY, rsW, rsH;

if ($miniResize) {
  $miniResize.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    rsX = e.clientX; rsY = e.clientY;
    const r = $mini.getBoundingClientRect();
    rsW = r.width; rsH = r.height;
  });
}

window.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const w = Math.max(240, rsW + (e.clientX - rsX));
  const h = Math.max(140, rsH + (e.clientY - rsY));
  $mini.style.width  = `${w}px`;
  $mini.style.height = `${h}px`;
});

window.addEventListener('mouseup', () => {
  if (isResizing) {
    const r = $mini.getBoundingClientRect();
    S.miniSize = { width: r.width, height: r.height };
    saveS();
  }
  isResizing = false;
});

/* ═══════════════════════════════════════════════════════
   PICKER DE SLOT (MULTISTREAM)
════════════════════════════════════════════════════════ */
function attachSlotPicker(input, dropdown, onPick) {
  const refresh = () => buildChannelList(dropdown, input.value, (ch) => {
    dropdown.classList.remove('open');
    onPick(ch);
  }, { hideKbd: true });

  input.addEventListener('focus', () => {
    refresh();
    dropdown.classList.add('open');
    if (Date.now() - lastLivePoll > 45000) pollFavoritesLive();
  });
  input.addEventListener('input', refresh);
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('open'), 180));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v) { dropdown.classList.remove('open'); onPick(v); }
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
      input.blur();
    }
  });
}

/* ═══════════════════════════════════════════════════════
   ACCIONES SOBRE MULTISTREAM
════════════════════════════════════════════════════════ */
function promoteSlot(idx) {
  const ch = S.multiChannels[idx];
  if (!ch) return;
  if (S.multiOn) toggleMulti();
  const display = channelToDisplay(ch);
  $chInput.value = display;
  if (ch.toLowerCase() !== S.channel.toLowerCase()) {
    initPlayer(ch);
  }
  toast(`Principal: ${display}`);
}

function clearMulti() {
  if (!S.multiChannels.some(c => c)) { toast('No hay canales en multi'); return; }
  if (!confirm('¿Vaciar todos los slots de multistream?')) return;
  S.multiChannels = ['','','',''];
  saveS();
  if (S.multiOn) initMulti();
  toast('Slots vaciados');
}

/* ═══════════════════════════════════════════════════════
   AUDIO DEL MINI PLAYER
════════════════════════════════════════════════════════ */
function toggleMiniMute() {
  if (!miniPlayer2) return;
  const wasMuted = miniPlayer2.getMuted();
  miniPlayer2.setMuted(!wasMuted);
  if (wasMuted) {
    // Activamos audio del mini → silenciamos principal para evitar doble audio
    miniPlayer2.setVolume(S.miniVolume || 0.5);
    if (mainPlayer && !mainPlayer.getMuted()) {
      mainPlayer.setMuted(true);
      S.muted = true;
      setMuteBtn(true);
    }
  }
  updateMiniAudioUI();
  saveS();
}

function changeMiniVolume(v) {
  if (!miniPlayer2) return;
  v = parseFloat(v);
  S.miniVolume = v;
  miniPlayer2.setVolume(v);
  if (v > 0 && miniPlayer2.getMuted()) {
    miniPlayer2.setMuted(false);
    if (mainPlayer && !mainPlayer.getMuted()) {
      mainPlayer.setMuted(true);
      S.muted = true;
      setMuteBtn(true);
    }
  } else if (v === 0) {
    miniPlayer2.setMuted(true);
  }
  updateMiniAudioUI();
  saveS();
}

function updateMiniAudioUI() {
  if (!miniPlayer2) return;
  const muted = miniPlayer2.getMuted();
  const icon = document.getElementById('miniMuteIcon');
  if (icon) {
    icon.innerHTML = muted
      ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
  }
}

/* ═══════════════════════════════════════════════════════
   ABRIR EN TWITCH
════════════════════════════════════════════════════════ */
function openInTwitch() {
  const parsed = parsePlayerSource(S.channel);
  const url = parsed.kind === 'oven'
    ? (parsed.source === 'iluenp' ? 'https://watch.iluenp.com/' : (parsed.url || ''))
    : parsed.kind === 'iframe'
      ? (parsed.url || '')
      : `https://www.twitch.tv/${S.channel}`;
  if (url) window.open(url, '_blank', 'noopener');
}
