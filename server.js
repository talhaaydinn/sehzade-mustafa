// TikTok Şehzade Mustafa Cenazesi — olay köprüsü
// TikTok canlı yayınındaki olayları (hediye, yorum, beğeni, takip, paylaşım) dinler,
// sadeleştirip tarayıcıdaki oyuna WebSocket ile iletir.
//
// Kullanım:
//   node server.js                -> sadece test modu (TikTok'a bağlanmaz)
//   node server.js kullaniciadi   -> @kullaniciadi canlı yayınına bağlanır

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const DEBUG = process.argv.includes('--debug') || !!process.env.DEBUG; // gelen yorumları terminale yaz
const HOST = process.env.HOST || '127.0.0.1';
const USERNAME = (process.argv[2] || process.env.TIKTOK_USERNAME || '')
  .replace('https://www.tiktok.com/', '')
  .replace('/live', '')
  .replace(/^@/, '')
  .trim();
const RETRY_MS = 20_000;

// ---------------------------------------------------------------- hediye kaydı
// Her hediye terminale yazılır ve logs/hediyeler-YYYY-AA-GG.csv dosyasına eklenir (Excel'de açılır).
// Test panelinden gelen sahte hediyeler sadece terminalde "(test)" olarak görünür, dosyaya yazılmaz.
const LOG_DIR = path.join(__dirname, 'logs');
const session = new Map(); // kullanıcı -> { name, coins, gifts } (bu çalıştırmadaki toplamlar)
const pad = (n) => String(n).padStart(2, '0');
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function logGift(e, isTest) {
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const unit = Math.max(1, Number(e.diamonds) || 1), count = Math.max(1, Number(e.count) || 1), total = unit * count;
  const who = e.user?.id || '?', name = e.user?.name || who;
  const giftName = (e.giftName || 'Hediye') + (e.manual ? ' (elle)' : '');
  console.log(`[${time}] 🎁 ${isTest ? '(test) ' : ''}@${who} (${name}) → ${giftName}${e.giftId && e.giftId !== 'manual' ? ` #${e.giftId}` : ''} x${count} = ${total} jeton`);
  if (isTest) return;
  const s = session.get(who) || { name, coins: 0, gifts: 0 };
  s.name = name; s.coins += total; s.gifts += count;
  session.set(who, s);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `hediyeler-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.csv`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, '﻿tarih;saat;kullanici_adi;isim;hediye;adet;birim_jeton;toplam_jeton\n');
    const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    fs.appendFileSync(file, [date, time, who, name, giftName, count, unit, total].map(csvCell).join(';') + '\n');
  } catch (err) {
    console.error('[hediye kaydı yazılamadı]', err.message);
  }
}

function printSummary() {
  if (!session.size) return;
  const list = [...session.entries()].sort((a, b) => b[1].coins - a[1].coins);
  const total = list.reduce((a, [, s]) => a + s.coins, 0);
  console.log(`\n  🏆 Bu yayının özeti: ${list.length} kişi, toplam ${total} jeton`);
  list.slice(0, 10).forEach(([id, s], i) => console.log(`  ${String(i + 1).padStart(2)}. @${id} (${s.name}): ${s.coins} jeton, ${s.gifts} hediye`));
  console.log(`  Tüm kayıt: ${LOG_DIR}\n`);
}
let exiting = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (exiting) return; exiting = true; printSummary(); process.exit(0); });
}

// ---------------------------------------------------------------- HTTP (statik dosyalar)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
};
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm']);
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');
const MUSIC_DIR = path.join(PUBLIC_DIR, 'music');

// public/music/ altındaki ses dosyalarını listeler (kök klasör + alt klasörler)
function listMusic() {
  const out = {};
  try {
    out.root = fs.readdirSync(MUSIC_DIR).filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase())).map((f) => `music/${encodeURIComponent(f)}`);
  } catch { out.root = []; }
  let cats = [];
  try { cats = fs.readdirSync(MUSIC_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return out; }
  for (const c of cats) {
    try {
      out[c.name] = fs.readdirSync(path.join(MUSIC_DIR, c.name))
        .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
        .map((f) => `music/${encodeURIComponent(c.name)}/${encodeURIComponent(f)}`);
    } catch { out[c.name] = []; }
  }
  return out;
}

function sendFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı');
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) { // ses dosyalarında ileri sarma için
      let start = range[1] ? Number(range[1]) : st.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : st.size - 1;
      start = Math.max(0, start); end = Math.min(end, st.size - 1);
      if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

// TikTok profil fotoğrafları başka siteden gelir; oyun onları 3D sahnede (WebGL) kullanabilsin diye
// aynı adresten sunulur. Sadece TikTok'un resim sunucularına izin verilir, sonuçlar bellekte tutulur.
const AVATAR_HOSTS = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|ibyteimg\.com|byteimg\.com|muscdn\.com|tiktokv\.com)$/i;
const avatarCache = new Map(); // url -> { type, buf }
async function avatarProxy(req, res) {
  const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
  let target;
  try { target = new URL(u); } catch { res.writeHead(400).end(); return; }
  if (target.protocol !== 'https:' || !AVATAR_HOSTS.test(target.hostname)) { res.writeHead(403).end(); return; }
  let hit = avatarCache.get(u);
  if (!hit) {
    try {
      const r = await fetch(target, { signal: AbortSignal.timeout(8000) });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !type.startsWith('image/')) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 2_000_000) throw new Error('çok büyük');
      hit = { type, buf };
      avatarCache.set(u, hit);
      if (avatarCache.size > 600) avatarCache.delete(avatarCache.keys().next().value);
    } catch {
      res.writeHead(502).end();
      return;
    }
  }
  res.writeHead(200, { 'Content-Type': hit.type, 'Content-Length': hit.buf.length, 'Cache-Control': 'max-age=3600' });
  res.end(hit.buf);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (urlPath === '/api/music') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(listMusic()));
    return;
  }
  if (urlPath === '/api/avatar') { avatarProxy(req, res); return; }
  let baseDir = PUBLIC_DIR, rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (rel.startsWith('vendor/three/')) { baseDir = THREE_DIR; rel = rel.slice('vendor/three/'.length); }
  const file = path.resolve(baseDir, rel);
  if (!file.startsWith(baseDir + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  sendFile(req, res, file);
});

// ---------------------------------------------------------------- WebSocket (oyuna yayın)
const wss = new WebSocketServer({ server, path: '/ws' });
let status = {
  type: 'status',
  mode: USERNAME ? 'live' : 'test',
  connected: false,
  username: USERNAME,
  message: USERNAME ? 'Bağlanılıyor…' : 'Test modu (TikTok bağlı değil)',
};

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

function setStatus(patch) {
  status = { ...status, ...patch };
  console.log(`[durum] ${status.message}`);
  broadcast(status);
}

const SIM_TYPES = new Set(['chat', 'gift', 'like', 'follow', 'share', 'reset', 'camera']);

// ---------------------------------------------------------------- yönetim paneli (admin.html)
// Gerçek olaylar numaralanıp saklanır. Oyun ekranı her olayı işleyince "ack" gönderir;
// panel böylece hangi hediyenin oyuna ulaşıp ulaşmadığını görür ve gerekirse tekrar uygular.
const HISTORY_MAX = 400;
const history = [];
let nextEid = 1, lastState = null;
const clientsOf = (role) => [...wss.clients].filter((c) => c.readyState === 1 && c.role === role);
function toAdmins(obj) { const m = JSON.stringify(obj); for (const c of clientsOf('admin')) c.send(m); }
function sendClientCounts() { toAdmins({ type: 'clients', games: clientsOf('game').length, admins: clientsOf('admin').length }); }

// Olayı numaralandırıp geçmişe ekler ve herkese yayınlar
function emit(evt) {
  evt.eid = nextEid++; evt.at = Date.now(); evt.acks = 0;
  history.push(evt);
  if (history.length > HISTORY_MAX) history.shift();
  broadcast(evt);
  return evt;
}

const cleanId = (s) => String(s ?? '').trim().replace(/^@/, '').slice(0, 40);
const ADMIN_ACTIONS = new Set(['join', 'keep', 'kick', 'score', 'role', 'unrole', 'music']);
const ROLES = new Set(['portre', 'omuz', 'sancak']);

function handleAdmin(msg) {
  const a = msg.action;
  const id = cleanId(msg.user?.id);
  const user = id ? { id, name: String(msg.user?.name || '').trim().slice(0, 40) || id, avatar: String(msg.user?.avatar || '') } : null;
  if (a === 'gift') {
    if (!user) return;
    const coins = Math.max(1, Math.min(100000, Math.round(Number(msg.coins) || 1)));
    const evt = { type: 'gift', user, giftId: 'manual', giftName: String(msg.giftName || '').trim().slice(0, 40) || 'Hediye', giftImage: '', diamonds: coins, count: 1, manual: true };
    if (msg.log !== false) logGift(evt, false);
    else logGift(evt, true);
    emit(evt);
  } else if (a === 'replay') {
    const ev = history.find((h) => h.eid === Number(msg.eid));
    if (!ev) return;
    console.log(`[panel] #${ev.eid} tekrar uygulandı (${ev.type} @${ev.user?.id})`);
    broadcast({ ...ev, replay: true });
  } else if (a === 'reset') {
    broadcast({ type: a });
  } else if (a === 'camera') {
    broadcast({ type: 'camera', shot: String(msg.shot || 'wide') });
  } else if (ADMIN_ACTIONS.has(a)) {
    if (['join', 'keep', 'kick', 'score', 'role'].includes(a) && !user) return;
    if ((a === 'role' || a === 'unrole') && !ROLES.has(msg.role)) return;
    broadcast({ type: 'admin', action: a, user, delta: Math.round(Number(msg.delta) || 0),
      role: msg.role, slot: Number.isInteger(msg.slot) ? msg.slot : -1, off: !!msg.off });
  }
}

wss.on('connection', (ws) => {
  ws.role = 'game';
  ws.send(JSON.stringify(status));
  sendClientCounts();
  ws.on('close', sendClientCounts);
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg?.type) {
      case 'hello': // panel kendini "admin", test paneli "panel" olarak tanıtır; tanıtmayan oyun ekranıdır
        ws.role = ['admin', 'panel'].includes(msg.role) ? msg.role : 'game';
        if (ws.role === 'admin') ws.send(JSON.stringify({ type: 'init', history, state: lastState, status }));
        sendClientCounts();
        return;
      case 'state': // oyun ekranının durumu (sadece ilk açılan ekranınki kullanılır)
        if (ws.role === 'game' && clientsOf('game')[0] === ws) { lastState = msg.state; toAdmins({ type: 'state', state: msg.state }); }
        return;
      case 'ack': {
        const ev = history.find((h) => h.eid === Number(msg.eid));
        if (ev) { ev.acks++; toAdmins({ type: 'ack', eid: ev.eid, acks: ev.acks }); }
        return;
      }
      case 'admin':
        if (ws.role === 'admin') handleAdmin(msg);
        return;
      case 'sim': // test paneli / klavye kısayolları sahte olay gönderir, herkese aynen yayınlanır
        if (msg.event && SIM_TYPES.has(msg.event.type)) {
          if (msg.event.type === 'gift') logGift(msg.event, true);
          broadcast({ ...msg.event, sim: true });
        }
    }
  });
});

// ---------------------------------------------------------------- TikTok verisini sadeleştirme
function userOf(u) {
  if (!u) return null;
  const id = u.uniqueId || u.displayId || u.userId || u.id;
  if (!id) return null;
  return {
    id: String(id),
    name: u.nickname || String(id),
    avatar:
      u.profilePictureUrl ||
      u.profilePicture?.url?.[0] ||
      u.profilePicture?.urls?.[0] ||
      u.avatarThumb?.urlList?.[0] ||
      u.avatarMedium?.urlList?.[0] ||
      '',
  };
}

// Seri (streak) hediyeler: TikTok aynı seriyi artan repeatCount ile tekrar tekrar gönderir.
// Her olayda sadece aradaki farkı (delta) iletiyoruz, böylece hem anında tepki verir hem de çift sayılmaz.
const streaks = new Map(); // key -> { count, at }

function handleGift(d) {
  const user = userOf(d.user);
  if (!user) return;
  const giftType = d.giftDetails?.giftType ?? d.gift?.type ?? 0;
  const diamonds = Number(d.giftDetails?.diamondCount ?? d.gift?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1) || 1;
  const giftName = d.giftDetails?.giftName || d.gift?.name || d.extendedGiftInfo?.name || 'Hediye';
  const giftImage = d.gift?.image?.urlList?.[0] || d.giftDetails?.giftImage?.giftPictureUrl || '';
  const repeatCount = Math.max(1, Number(d.repeatCount) || 1);
  const repeatEnd = Boolean(d.repeatEnd);

  let count = repeatCount;
  if (giftType === 1) {
    const key = `${user.id}:${d.giftId}:${d.groupId || ''}`;
    const prev = streaks.get(key)?.count || 0;
    count = repeatCount - prev;
    if (repeatEnd) streaks.delete(key);
    else streaks.set(key, { count: repeatCount, at: Date.now() });
    if (count <= 0) return;
  }
  const evt = { type: 'gift', user, giftId: String(d.giftId), giftName, giftImage, diamonds, count };
  logGift(evt, false);
  emit(evt);
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, v] of streaks) if (v.at < cutoff) streaks.delete(k);
}, 30_000);

// ---------------------------------------------------------------- TikTok bağlantısı
let connection = null;
let retryTimer = null;

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => { retryTimer = null; connectTikTok(); }, RETRY_MS);
}

async function connectTikTok() {
  try {
    setStatus({ connected: false, message: `@${USERNAME} yayınına bağlanılıyor…` });
    const state = await connection.connect();
    setStatus({ connected: true, message: `Canlı: @${USERNAME} (oda ${state.roomId})` });
  } catch (err) {
    const msg = err?.message || String(err);
    const reason = err?.name === 'UserOfflineError' || /online/i.test(msg) ? 'şu an canlı yayında değil' : msg;
    setStatus({ connected: false, message: `Bağlanamadı (${reason}). ${RETRY_MS / 1000} sn sonra tekrar denenecek.` });
    scheduleRetry();
  }
}

function startTikTok() {
  const options = {};
  if (process.env.SIGN_API_KEY) options.signApiKey = process.env.SIGN_API_KEY;
  connection = new TikTokLiveConnection(USERNAME, options);

  connection.on(WebcastEvent.CHAT, (d) => {
    const user = userOf(d.user);
    const text = d.content ?? d.comment; // v2.5 (proto v3): content · eski sürümler: comment
    if (user && text) {
      if (DEBUG) console.log(`[yorum] @${user.id}: ${text}`);
      emit({ type: 'chat', user, text: String(text).slice(0, 150) });
    }
  });
  connection.on(WebcastEvent.GIFT, handleGift);
  connection.on(WebcastEvent.LIKE, (d) => {
    const user = userOf(d.user);
    if (user) broadcast({ type: 'like', user, count: Number(d.likeCount ?? d.count) || 1 });
  });
  connection.on(WebcastEvent.FOLLOW, (d) => {
    const user = userOf(d.user);
    if (user) emit({ type: 'follow', user });
  });
  connection.on(WebcastEvent.SHARE, (d) => {
    const user = userOf(d.user);
    if (user) emit({ type: 'share', user });
  });
  connection.on(WebcastEvent.STREAM_END, () => {
    setStatus({ connected: false, message: 'Yayın sona erdi. Yeni yayın bekleniyor…' });
    scheduleRetry();
  });
  connection.on(ControlEvent.DISCONNECTED, ({ code, reason } = {}) => {
    setStatus({ connected: false, message: `Bağlantı koptu (${code ?? ''} ${reason ?? ''}). Tekrar denenecek…` });
    scheduleRetry();
  });
  connection.on(ControlEvent.ERROR, ({ info, exception } = {}) => {
    console.error('[tiktok hata]', info || '', exception?.message || exception || '');
  });

  connectTikTok();
}

// ---------------------------------------------------------------- başlat
server.listen(PORT, HOST, () => {
  const base = `http://localhost:${PORT}`;
  console.log('');
  console.log('  🕌  Şehzade Mustafa cenaze alayı hazır');
  console.log(`  Oyun ekranı : ${base}/`);
  console.log(`  Yönetim     : ${base}/admin.html`);
  console.log(USERNAME ? `  Yayın       : @${USERNAME}` : '  Mod         : TEST (TikTok\'a bağlanmak için: npm start -- kullaniciadi)');
  console.log('');
  if (USERNAME) startTikTok();
});
