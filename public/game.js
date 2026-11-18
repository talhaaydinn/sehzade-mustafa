// =====================================================================
//  Şehzade Mustafa'nın Cenazesi — oyun mantığı + arayüz (1080x1920 dikey)
//  3D sahne: scene3d.js · müzik: music.js · ses: audio.js
// =====================================================================
import * as THREE from 'three';
import { Stage } from './scene3d.js';
import { FuneralMusic } from './music.js';
import { audio, sfx } from './audio.js';

const C = window.CENAZE_CONFIG;
const W = 1080, H = 1920, TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const TRANSPARENT = params.has('transparent');
if (TRANSPARENT) document.body.classList.add('transparent');

const sceneCanvas = document.getElementById('scene');
const ui = document.getElementById('ui');
let ctx = ui.getContext('2d'); // isim etiketleri çizilirken geçici olarak etiket tuvaline döner
ui.width = W; ui.height = H;
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  for (const c of [sceneCanvas, ui]) { c.style.width = `${W * s}px`; c.style.height = `${H * s}px`; }
}
addEventListener('resize', fit); fit();

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
const serif = (px, w = 800) => `${w} ${Math.round(px)}px ${SERIF}, ${EMOJI}`;
const sans = (px, w = 700) => `${w} ${Math.round(px)}px ${SANS}, ${EMOJI}`;
const GOLD = '#d9b25a', CREAM = '#f3e6c8';

// ---------------------------------------------------------------- yardımcılar
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashHue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 360; };
const short = (s, n) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function pill(text, cx, cy, { size = 30, bg = 'rgba(0,0,0,.55)', fg = '#fff', padX = 18, alpha = 1, stroke = null, f = sans } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = f(size);
  const w = ctx.measureText(text).width + padX * 2, hh = size * 1.42;
  rrect(ctx, cx - w / 2, cy - hh / 2, w, hh, hh / 2);
  ctx.fillStyle = bg; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1.5, size * 0.1); ctx.stroke(); }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.05);
  ctx.restore();
  return w;
}
const imgCache = new Map();
function getImg(url) {
  if (!url) return null;
  let im = imgCache.get(url);
  if (!im) {
    im = new Image(); im.referrerPolicy = 'no-referrer';
    // başka siteden gelen fotoğraflar sunucu üzerinden alınır (3D sahnede kullanılabilsin diye)
    im.src = /^https?:/i.test(url) && !url.startsWith(location.origin) ? `/api/avatar?u=${encodeURIComponent(url)}` : url;
    imgCache.set(url, im);
    if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value);
  }
  return im.complete && im.naturalWidth > 0 ? im : null;
}
function drawAvatar(u, x, y, r, ring = 'rgba(255,255,255,.9)') {
  const g = ctx, img = getImg(u.avatar);
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.closePath();
  if (img) { g.clip(); g.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    g.fillStyle = `hsl(${u.hue} 45% 40%)`; g.fill();
    g.fillStyle = '#fff'; g.font = sans(r * 1.15, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText([...(u.name || '?')][0].toLocaleUpperCase('tr'), x, y + r * 0.08);
  }
  g.restore();
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = Math.max(2, r * 0.12); g.strokeStyle = ring; g.stroke();
}

// ---------------------------------------------------------------- arka plan (gün batımı, uzakta kubbeler)
function makeBackground() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const HZ = 980;
  const sky = g.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#2a1e33'); sky.addColorStop(0.45, '#7a4a4a'); sky.addColorStop(0.8, '#c98a5e'); sky.addColorStop(1, '#b08c72');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(300, HZ - 120, 10, 300, HZ - 120, 420);
  sun.addColorStop(0, 'rgba(255,214,150,.75)'); sun.addColorStop(0.2, 'rgba(255,190,120,.35)'); sun.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, HZ + 200);
  // uzak tepeler
  g.fillStyle = 'rgba(90,60,60,.55)'; g.beginPath(); g.moveTo(0, HZ);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, HZ - 70 + Math.sin(x / 160) * 30 + Math.sin(x / 53) * 8);
  g.lineTo(W, HZ); g.fill();
  // şehir silueti: kubbeler ve minareler
  g.fillStyle = 'rgba(60,38,42,.85)';
  const mosque = (cx, s) => {
    const by = HZ - 30;
    g.fillRect(cx - 90 * s, by - 50 * s, 180 * s, 50 * s);
    g.beginPath(); g.arc(cx, by - 50 * s, 55 * s, Math.PI, 0); g.fill();
    for (const dx of [-70, 70]) { g.beginPath(); g.arc(cx + dx * s, by - 50 * s, 24 * s, Math.PI, 0); g.fill(); }
    for (const dx of [-115, 115]) {
      g.fillRect(cx + dx * s - 5 * s, by - 170 * s, 10 * s, 170 * s);
      g.beginPath(); g.moveTo(cx + dx * s - 7 * s, by - 170 * s); g.lineTo(cx + dx * s, by - 205 * s); g.lineTo(cx + dx * s + 7 * s, by - 170 * s); g.fill();
      g.fillRect(cx + dx * s - 8 * s, by - 120 * s, 16 * s, 5 * s);
    }
    g.fillRect(cx - 1.5 * s, by - 125 * s, 3 * s, 20 * s);
  };
  mosque(760, 1.0); mosque(180, 0.55);
  for (let i = 0; i < 18; i++) { const x = rnd() * W, w = 20 + rnd() * 50, h = 15 + rnd() * 30; g.fillRect(x, HZ - 30 - h, w, h + 30); }
  g.fillStyle = '#b08c72'; g.fillRect(0, HZ - 32, W, H - HZ + 32);
  return c;
}

// ---------------------------------------------------------------- oyun durumu
const users = new Map();
const mourners = [];                         // { u, kept, joined, enter, leaving, pop, bubble, bubbleT, slot }
const ROLE_KEYS = ['portre', 'omuz', 'sancak'];
const roles = { portre: Array(C.portraitBearers || 1).fill(null), omuz: Array(C.carriers).fill(null), sancak: Array(C.flagBearers).fill(null) }; // { u, since, enter, bubble, bubbleT }
const particles = [], toasts = [], banners = [];
let energy = 0, duaTime = 0, step = 0, joinSeq = 0, roleSeq = 0;
let status = { connected: false, message: 'Sunucuya bağlanılıyor…' };
let stage = null, stageError = null;
const music = new FuneralMusic();

function touchUser(u) {
  let r = users.get(u.id);
  if (!r) { r = { id: u.id, name: u.name || u.id, avatar: u.avatar || '', score: 0, hue: hashHue(u.id), gender: 'male' }; users.set(u.id, r); }
  else { if (u.name) r.name = u.name; if (u.avatar) r.avatar = u.avatar; }
  return r;
}
const findMourner = (id) => mourners.find((d) => d.u.id === id && !d.leaving);
const roleOf = (id) => {
  for (const r of ROLE_KEYS) { const i = roles[r].findIndex((s) => s?.u.id === id); if (i >= 0) return { role: r, slot: i }; }
  return null;
};
const inProcession = (id) => !!(findMourner(id) || roleOf(id));
const isKept = (d) => d.u.score > 0 || d.kept;
const activeMourners = () => mourners.filter((d) => !d.leaving);
const oldestFree = () => activeMourners().filter((d) => !isKept(d)).reduce((a, d) => (!a || d.joined < a.joined ? d : a), null);

// Saflara katılım: yorumla gelen arkaya girer; hediyeli olan ön saflara geçer.
// Saflar doluyken yeni biri gelince yorumla girmiş en eski kişi ayrılır. Süre yoktur.
function joinProcession(user, { kept = false, shot = true } = {}) {
  const u = touchUser(user);
  if (roleOf(u.id)) return { isNew: false };
  const d = findMourner(u.id);
  if (d) { if (kept) d.kept = true; d.pop = 1; return { dancer: d, isNew: false }; }
  if (activeMourners().length >= C.maxMourners) {
    const out = oldestFree();
    if (out) out.leaving = 0.001;
    else if (!kept && !(u.score > 0)) return { full: true };
  }
  const nd = { u, kept, joined: ++joinSeq, enter: 0, pop: 1, bubble: '', bubbleT: 0, leaving: 0, slot: activeMourners().length };
  mourners.push(nd);
  if (shot) setTimeout(() => stage?.queueJoin(u.id), 250);
  return { dancer: nd, isNew: true };
}

// Rol (omuz / sancak): boş koltuğa oturur; hepsi doluysa o rolde en uzun süredir duranın yerine geçer
function assignRole(role, user, slot = -1) {
  const u = touchUser(user);
  const cur = roleOf(u.id);
  if (cur?.role === role && (slot < 0 || cur.slot === slot)) return;
  if (cur) roles[cur.role][cur.slot] = null;
  const mi = mourners.findIndex((d) => d.u.id === u.id);
  if (mi >= 0) mourners.splice(mi, 1);
  const seats = roles[role];
  if (slot < 0 || slot >= seats.length) {
    slot = seats.findIndex((s) => !s);
    if (slot < 0) slot = seats.reduce((best, s, i) => (s.since < seats[best].since ? i : best), 0);
  }
  const prev = seats[slot];
  if (prev && prev.u.id !== u.id) { // yerinden olan ön saflara döner
    mourners.push({ u: prev.u, kept: true, joined: ++joinSeq, enter: 1, pop: 1, bubble: '', bubbleT: 0, leaving: 0, slot: 0 });
  }
  seats[slot] = { u, since: ++roleSeq, enter: cur || mi >= 0 ? 1 : 0, bubble: '', bubbleT: 0 };
  const name = `@${short(u.name, 16)}`;
  if (role === 'omuz') banner('⚰️ OMUZ VERDİ', prev ? `${name} · ${short(prev.u.name, 12)} yerine` : name, GOLD);
  else if (role === 'portre') banner('🖼️ ŞEHZADENİN PORTRESİ', prev ? `${name} · ${short(prev.u.name, 12)} yerine` : name, '#7fd6a0');
  else banner('🚩 YENİ SANCAKTAR', name, '#ff6a5a');
  stage?.focus(role, slot, 4.2, 2);
  sfx.horn();
  petals(role === 'sancak' ? 20 : 40);
}

function anchorOf(id) { return stage?.anchors.get(id) || { x: W / 2, y: 1000, ppm: 120, scale: 1 }; }

// ---------------------------------------------------------------- efektler
function sparkle(x, y, n = 14, color = GOLD) {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), sp = rand(100, 300);
    particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, c: color, life: rand(0.6, 1.1), max: 1.1, size: rand(4, 8) }); }
}
function petals(n) {
  const a = anchorOf('@tabut');
  for (let i = 0; i < n; i++) particles.push({ kind: 'petal', x: a.x + rand(-300, 300), y: a.y - rand(60, 500), vx: rand(-20, 20), vy: rand(50, 120),
    r: rand(0, TAU), vr: rand(-3, 3), wob: rand(0, TAU), life: rand(3, 5), max: 5, size: rand(7, 11), c: ['#b3122c', '#d8324a', '#8e0f22', '#f2e6d0'][i % 4] });
}
function toast(text, color = 'rgba(30,14,8,.8)') { toasts.unshift({ text, color, t: 0 }); if (toasts.length > 3) toasts.length = 3; }
function banner(title, sub = '', color = GOLD) { if (banners.length > 4) banners.splice(1, 1); banners.push({ title, sub, color, t: 0, dur: 3 }); }

// ---------------------------------------------------------------- olaylar
function onEvent(e) {
  switch (e.type) {
    case 'status': status = e; break;
    case 'chat': onChat(e); break;
    case 'gift': onGift(e); break;
    case 'like': onLike(e); break;
    case 'follow': onFollow(e); break;
    case 'share': onShare(e); break;
    case 'camera': cameraCmd(e.shot); break;
    case 'reset': resetGame(); break;
    case 'admin': adminAction(e); break;
  }
}

function cameraCmd(shot) {
  if (!stage) return;
  if (shot === 'wide') stage.focus('wide', null, 0, 9);
  else if (shot === 'omuz') stage.focus('omuz', Math.floor(Math.random() * C.carriers), 5, 4);
  else if (shot === 'sancak') stage.focus('sancak', null, 6, 4);
  else if (shot === 'portre') stage.focus('portre', 0, 6, 4);
  else stage.focus(shot || 'tabut', null, 6, 4);
}

function adminAction(e) {
  const u = e.user?.id ? touchUser(e.user) : null;
  const name = u ? short(u.name, 16) : '';
  switch (e.action) {
    case 'join': if (u) { const r = joinProcession(u); if (r.isNew) { toast(`🕯️ ${name} saflara katıldı`); sfx.bell(); } } break;
    case 'keep': { if (!u) return; const d = findMourner(u.id) || joinProcession(u).dancer; if (d) { d.kept = !e.off; toast(e.off ? `${name} artık sırayla ayrılabilir` : `📌 ${name} saflarda sabitlendi`); } break; }
    case 'kick': {
      if (!u) return;
      const d = findMourner(u.id); if (d) d.leaving = 0.001;
      const r = roleOf(u.id); if (r) roles[r.role][r.slot] = null;
      break;
    }
    case 'score': if (u) u.score = Math.max(0, u.score + (e.delta || 0)); break;
    case 'role': if (u && roles[e.role]) assignRole(e.role, u, e.slot ?? -1); break;
    case 'unrole': {
      const seats = roles[e.role]; if (!seats) return;
      const idx = e.slot >= 0 ? [e.slot] : seats.map((_, i) => i);
      for (const i of idx) { const s = seats[i]; if (!s) continue; seats[i] = null; joinProcession(s.u, { kept: true, shot: false }); }
      break;
    }
    case 'music': setMusicOff(!!e.off); break;
  }
}

function onChat(e) {
  if (!e.user) return;
  const text = String(e.text || ''), low = text.toLocaleLowerCase('tr');
  const u = touchUser(e.user);
  const name = short(u.name, 16);
  const words = low.split(/[^a-zçğıöşüâîû0-9]+/);
  const gender = C.femaleKeywords?.some((k) => words.includes(k)) ? 'female' : C.maleKeywords?.some((k) => words.includes(k)) ? 'male' : null;
  if (gender && u.gender !== gender) {
    u.gender = gender;
    if (inProcession(u.id)) { const a = anchorOf(u.id); sparkle(a.x, a.y, 14, gender === 'female' ? '#e8b4c8' : '#9cc4ff'); }
  }
  if (!inProcession(u.id)) {
    const r = joinProcession(u);
    if (r.isNew) { toast(`🕯️ ${name} saflara katıldı`); sfx.bell(); }
  }
  if (C.chatBubbles) {
    const holder = findMourner(u.id) || (() => { const r = roleOf(u.id); return r && roles[r.role][r.slot]; })();
    if (holder) { holder.bubble = short(text, 26); holder.bubbleT = 4.5; }
  }
}

function onGift(e) {
  if (!e.user) return;
  const coins = Math.max(1, Number(e.diamonds) || 1) * Math.max(1, Number(e.count) || 1);
  const u = touchUser(e.user);
  const first = u.score === 0;
  u.score += coins;
  energy = clamp(energy + coins * C.giftEnergy, 0, 1);
  sfx.chime(coins >= 100 ? 3 : coins >= 10 ? 2 : 1);
  const role = giftRole(e);
  if (role) assignRole(role, u);
  else {
    const r = joinProcession(u, { kept: true, shot: false });
    if (first && !roleOf(u.id)) {
      banner('🎁 ÖN SAFA GEÇTİ', `@${short(u.name, 16)}`, '#ffd34d');
      setTimeout(() => stage?.focus('mourner', u.id, 2.6, 1), r.isNew ? 400 : 0);
    }
  }
  const a = anchorOf(u.id); sparkle(a.x, a.y - 20, 10 + Math.min(30, coins), GOLD);
  if (/gül|rose|rosa/i.test(e.giftName || '')) petals(Math.min(40, 6 * coins));
}

const normGift = (x) => String(x ?? '').toLocaleLowerCase('tr').normalize('NFC').replace(/\s+/g, ' ').trim();
function giftRole(e) {
  const list = C.giftRoles || [];
  const byId = list.find((r) => (r.ids || []).some((id) => String(id) === String(e.giftId)));
  if (byId) return byId.role;
  const n = normGift(e.giftName);
  return list.find((r) => (r.names || []).some((x) => normGift(x) === n))?.role || null;
}

function onLike(e) { energy = clamp(energy + Math.max(1, Number(e.count) || 1) * C.likeEnergy, 0, 1); }
function onFollow(e) {
  if (!e.user) return;
  const r = joinProcession(e.user);
  toast(`➕ ${short(e.user.name, 16)} takip etti${r.isNew ? ', saflara katıldı' : ''}`, 'rgba(20,60,90,.85)');
  sfx.bell();
}
function onShare(e) {
  if (!e.user) return;
  joinProcession(e.user);
  toast(`↗️ ${short(e.user.name, 16)} yayını paylaştı`, 'rgba(30,80,40,.85)');
  energy = clamp(energy + 0.05, 0, 1);
}

function resetGame() {
  users.clear(); mourners.length = 0; particles.length = 0; toasts.length = 0; banners.length = 0;
  for (const r of ROLE_KEYS) roles[r].fill(null);
  energy = 0; duaTime = 0;
  toast('🔄 Alay yeniden başladı');
}

// ---------------------------------------------------------------- güncelleme
// Saf sırası: hediyeliler önde (çok atan daha önde), sonra yorumla girenler geliş sırasıyla
function orderMourners() {
  const act = activeMourners();
  act.sort((a, b) => {
    const ga = a.u.score > 0, gb = b.u.score > 0;
    if (ga !== gb) return ga ? -1 : 1;
    if (ga && a.u.score !== b.u.score) return b.u.score - a.u.score;
    return a.joined - b.joined;
  });
  act.forEach((d, i) => { d.slot = i; });
  return act.length;
}

function update(dt, t) {
  if (duaTime > 0) { duaTime -= dt; if (duaTime <= 0) { duaTime = 0; energy = 0.3; } }
  else {
    const full = energy >= 0.999; // beğeniler sayacı doldurduysa (sönümlemeden önce bak)
    energy = clamp(energy - C.energyDecay * dt, 0, 1);
    if (full) { duaTime = C.duaSeconds; banner('🤲 RUHUNA EL-FATİHA', 'Bütün saflar dua ediyor', GOLD); stage?.focus('dua', null, 9, 1.5); petals(60); }
  }
  if (C.music) music.update(); // oyun müziği kapalı (config.js → music: true ile açılır)
  step = music.step();

  for (let i = mourners.length - 1; i >= 0; i--) {
    const d = mourners[i];
    d.enter += dt;
    if (d.leaving) { d.leaving += dt; if (d.leaving > 0.7) mourners.splice(i, 1); continue; }
    d.pop = Math.max(0, d.pop - dt * 2.5);
    d.bubbleT = Math.max(0, d.bubbleT - dt);
  }
  for (const r of ROLE_KEYS) for (const s of roles[r]) if (s) { s.enter += dt; s.bubbleT = Math.max(0, s.bubbleT - dt); }
  const n = orderMourners();

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0 || p.y > H + 50) { particles.splice(i, 1); continue; }
    if (p.kind === 'spark') { p.vy += 500 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    else if (p.kind === 'petal') { p.wob += dt * 3; p.x += (p.vx + Math.sin(p.wob) * 35) * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
  }
  for (const tt of toasts) tt.t += dt;
  while (toasts.length && toasts[toasts.length - 1].t > 5) toasts.pop();
  if (banners.length) { banners[0].t += dt; if (banners[0].t > banners[0].dur) banners.shift(); }

  if (stage) {
    const people = [];
    for (const d of mourners) people.push({ id: d.u.id, mode: 'mourner', slot: d.slot, gender: d.u.gender, rich: d.u.score > 0, enter: d.enter, leaving: d.leaving, spawnBehind: true });
    for (const r of ROLE_KEYS) {
      roles[r].forEach((s, i) => {
        if (s) people.push({ id: s.u.id, mode: r, slot: i, gender: s.u.gender, rich: true, enter: s.enter });
        else people.push({ id: `@npc_${r}_${i}`, mode: r, slot: i, gender: 'male', npc: true, enter: 1 });
      });
    }
    stage.update(dt, { step, t, dua: duaTime > 0, people, rows: Math.max(1, Math.ceil(n / C.rowWidth)) });
  }
}

// ---------------------------------------------------------------- arayüz
const EMO = { 'gül': '🌹', 'kalp': '❤️', 'çay': '☕', 'donut': '🍩' };
function roleLabels(role) {
  return (C.giftRoles || []).filter((r) => r.role === role).map((r) => `${EMO[normGift(r.label)] ? EMO[normGift(r.label)] + ' ' : ''}${r.label}`).join(' / ');
}

let headerCache = null;
document.fonts?.ready.then(() => { headerCache = null; });
setTimeout(() => { headerCache = null; }, 2500);
function drawHeader() {
  if (!headerCache) {
    const c = document.createElement('canvas'); c.width = W; c.height = 340;
    const g = c.getContext('2d');
    // başlık levhası (parşömen)
    const x = 40, y = 30, w = W - 80, h = 104;
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 20; g.shadowOffsetY = 6;
    rrect(g, x, y, w, h, 10);
    const pg = g.createLinearGradient(0, y, 0, y + h); pg.addColorStop(0, '#f6ead0'); pg.addColorStop(1, '#e0c999');
    g.fillStyle = pg; g.fill(); g.restore();
    g.lineWidth = 6; g.strokeStyle = '#4a2a16'; rrect(g, x, y, w, h, 10); g.stroke();
    g.lineWidth = 2; g.strokeStyle = GOLD; rrect(g, x + 9, y + 9, w - 18, h - 18, 6); g.stroke();
    for (const ex of [x + 30, x + w - 30]) { // köşe süsleri
      g.save(); g.translate(ex, y + h / 2); g.rotate(Math.PI / 4); g.fillStyle = '#7a1d26'; g.fillRect(-9, -9, 18, 18); g.strokeStyle = GOLD; g.lineWidth = 2; g.strokeRect(-9, -9, 18, 18); g.restore();
    }
    g.fillStyle = '#3a1a0e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 56; g.font = serif(fs, 900);
    while (g.measureText(C.title).width > w - 120 && fs > 30) { fs -= 2; g.font = serif(fs, 900); }
    g.fillText(C.title, W / 2, y + h / 2 + 3);

    // kurallar paneli
    const py = 146, ph = 178;
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
    rrect(g, x, py, w, ph, 14);
    const bg = g.createLinearGradient(0, py, 0, py + ph); bg.addColorStop(0, 'rgba(58,26,18,.9)'); bg.addColorStop(1, 'rgba(30,12,8,.92)');
    g.fillStyle = bg; g.fill(); g.restore();
    g.lineWidth = 2; g.strokeStyle = 'rgba(217,178,90,.75)'; rrect(g, x, py, w, ph, 14); g.stroke();
    // ekranda hediye istenmez: sadece yorumla katılım ve cinsiyet anlatılır
    const cols = [
      ['Saflara katıl', 'YORUM yaz'],
    ];
    const cw = w / cols.length;
    cols.forEach(([t1, t2], i) => {
      const cx = x + cw * (i + 0.5);
      let f1 = 38; g.font = serif(f1, 800);
      while (g.measureText(t1).width > cw - 20 && f1 > 22) { f1--; g.font = serif(f1, 800); }
      g.fillStyle = CREAM; g.fillText(t1, cx, py + 46);
      let f2 = 27; g.font = sans(f2, 800);
      while (g.measureText(t2).width > cw - 24 && f2 > 16) { f2--; g.font = sans(f2, 800); }
      g.fillStyle = GOLD; g.fillText(t2, cx, py + 92);
      if (i) { g.strokeStyle = 'rgba(217,178,90,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + cw * i, py + 20); g.lineTo(x + cw * i, py + 112); g.stroke(); }
    });
    g.strokeStyle = 'rgba(217,178,90,.35)'; g.beginPath(); g.moveTo(x + 30, py + 126); g.lineTo(x + w - 30, py + 126); g.stroke();
    // alt satır: **vurgulu** kelimeler altın renginde
    const line = 'Cinsiyet değiştirmek için sohbete **KADIN** veya **ERKEK** yaz';
    const parts = line.split('**');
    g.font = sans(25, 700);
    const total = parts.reduce((a, p, i) => { g.font = sans(25, i % 2 ? 800 : 600); return a + g.measureText(p).width; }, 0);
    let cx = W / 2 - total / 2; g.textAlign = 'left';
    parts.forEach((p, i) => { g.font = sans(25, i % 2 ? 800 : 600); g.fillStyle = i % 2 ? GOLD : 'rgba(243,230,200,.85)'; g.fillText(p, cx, py + 152); cx += g.measureText(p).width; });
    headerCache = c;
  }
  ctx.drawImage(headerCache, 0, 0);
}

function drawDuaBar(t) {
  const g = ctx, bx = 40, by = 336, bw = W - 80, bh = 38, dua = duaTime > 0;
  rrect(g, bx, by, bw, bh, bh / 2); g.fillStyle = 'rgba(30,12,8,.85)'; g.fill();
  const fill = dua ? duaTime / C.duaSeconds : energy;
  if (fill > 0.005) {
    const eg = g.createLinearGradient(bx, 0, bx + bw, 0);
    eg.addColorStop(0, '#7a4a1a'); eg.addColorStop(0.6, '#c99a3a'); eg.addColorStop(1, dua ? `hsl(45 90% ${60 + 10 * Math.sin(t * 4)}%)` : '#f0d080');
    g.save(); rrect(g, bx, by, bw, bh, bh / 2); g.clip();
    g.fillStyle = eg; g.fillRect(bx, by, bw * fill, bh);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(bx, by + 3, bw * fill, bh * 0.35);
    g.restore();
  }
  rrect(g, bx, by, bw, bh, bh / 2); g.strokeStyle = 'rgba(217,178,90,.6)'; g.lineWidth = 2; g.stroke();
  g.font = sans(20, 800); const label = '🤲 DUA';
  const lw = g.measureText(label).width + 26;
  rrect(g, bx + 5, by + 5, lw, bh - 10, (bh - 10) / 2); g.fillStyle = '#5a1a1e'; g.fill();
  g.fillStyle = CREAM; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, bx + 5 + lw / 2, by + bh / 2 + 1);
  g.font = sans(21, 800);
  g.fillText(dua ? `Ruhuna El-Fatiha · ${Math.ceil(duaTime)} sn` : `❤️ Beğen, dua dolsun · %${Math.round(energy * 100)}`, bx + bw / 2 + lw / 2, by + bh / 2 + 1);
}

function bubble(text, x, y, size, maxW = W) {
  const g = ctx;
  g.save();
  g.font = sans(size, 600);
  const w = g.measureText(text).width + size * 1.2, h = size * 1.9;
  const bx = clamp(x - w / 2, 4, maxW - w - 4), by = y - h - size * 0.6;
  rrect(g, bx, by, w, h, h / 2.4); g.fillStyle = '#fbf5e8'; g.fill();
  g.beginPath(); g.moveTo(x - size * 0.4, by + h - 1); g.lineTo(x + size * 0.4, by + h - 1); g.lineTo(x, by + h + size * 0.55); g.closePath(); g.fill();
  g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, bx + w / 2, by + h / 2 + 1);
  g.restore();
}

// ---------------------------------------------------------------- isim etiketleri (3D)
// Etiketler 3D sahnenin içinde, kameraya dönük düzlemler olarak çizilir: önde duran karakter
// arkadakinin ismini kapatır (isim karakterin arkasında kalır). Ekrandaki boyutları yine
// mesafeye göre sınırlanır, uzaktakiler okunamayacak kadar küçülmez.
const TAG_D = 2;                            // etiket tuvali çözünürlüğü (ekran ölçeğinin kaç katı)
const TAG_CW = 512, TAG_CH = 256, TAG_AX = 256, TAG_AY = 200; // etiket tuvali ve bağlanma noktası
const BUB_D = 1.5, BUB_CW = 640, BUB_CH = 120, BUB_AY = 118;
const tags3d = new Map();                   // id -> { tag, bub }
let tagGroup = null;
function makeSprite(cw, ch) {
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false, toneMapped: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 5;
  tagGroup.add(sprite);
  return { canvas, tex, mat, sprite, key: null };
}
function freeSprite(s) { if (!s) return; tagGroup.remove(s.sprite); s.tex.dispose(); s.mat.dispose(); }
function paintSprite(s, key, draw) {
  if (s.key === key) return;
  s.key = key;
  const g = s.canvas.getContext('2d');
  g.clearRect(0, 0, s.canvas.width, s.canvas.height);
  const keep = ctx; ctx = g;
  try { draw(g); } finally { ctx = keep; }
  s.tex.needsUpdate = true;
}
// world noktasını kameraya doğru çeker (kendi şapkasının içine gömülmesin), ekran yeri aynı kalır
const _tv = new THREE.Vector3();
function placeSprite(s, a, k, px, py, alpha) {
  const cam = stage.camera.position;
  _tv.copy(cam).sub(a.world);
  const dist = _tv.length();
  const pull = Math.min(0.45, dist * 0.3);
  s.sprite.position.copy(a.world).addScaledVector(_tv, pull / dist);
  const ppm = a.ppm * dist / (dist - pull);
  const cw = s.canvas.width, ch = s.canvas.height;
  s.sprite.scale.set(cw * k / ppm, ch * k / ppm, 1);
  s.sprite.center.set(px / cw, 1 - py / ch);
  s.mat.opacity = alpha;
  s.sprite.visible = alpha > 0.01;
}

function updateTags3D() {
  if (!stage) return;
  if (!tagGroup) { tagGroup = new THREE.Group(); stage.scene.add(tagGroup); }
  const items = [];
  for (const d of mourners) { const a = stage.anchors.get(d.u.id); if (a) items.push({ id: d.u.id, kind: 'mourner', d, u: d.u, a }); }
  for (const r of ROLE_KEYS) {
    roles[r].forEach((s, i) => {
      if (!s) return; // boş koltukta (isimsiz yeniçeri) etiket yok, hediye daveti gösterilmez
      const id = s.u.id, a = stage.anchors.get(id);
      if (!a) return;
      items.push({ id, kind: r, d: s, u: s?.u, a, empty: !s });
    });
  }
  const seen = new Set();
  for (const it of items) {
    const { a, u, d } = it;
    const sc = clamp(a.ppm / 95, 0.72, 1.6) * clamp(a.scale, 0, 1) * (1 + (d?.pop || 0) * 0.15);
    if (sc < 0.05) continue;
    seen.add(it.id);
    let e = tags3d.get(it.id);
    if (!e) { e = { tag: makeSprite(TAG_CW, TAG_CH), bub: null }; tags3d.set(it.id, e); }
    // uzaktan bakarken yan yana isimler çakışmasın: saftaki her ikinci kişinin ismi biraz yukarıda
    const far = clamp((0.9 - a.ppm / 95) / 0.3, 0, 1);
    const lift = it.kind === 'mourner' ? ((d.slot % C.rowWidth) % 2) * 24 * sc * far : 0;
    const D = TAG_D, X = TAG_AX, Y = TAG_AY;
    if (it.empty) {
      const first = roleLabels(it.kind).split(' / ')[0];
      const label = it.kind === 'omuz' ? `${first || '🌹'} → omuz ver` : it.kind === 'portre' ? `${first || '🍩'} → portreyi taşı` : `🚩 sancak boş`;
      paintSprite(e.tag, `e|${label}`, () => pill(label, X, Y, { size: 15 * D, padX: 8 * D, bg: 'rgba(20,10,6,.55)', fg: 'rgba(243,230,200,.9)', alpha: 0.85 }));
    } else if (it.kind === 'mourner' && !(u.score > 0)) {
      const name = short(u.name, 12), hasImg = !!getImg(u.avatar);
      paintSprite(e.tag, `m|${name}|${u.avatar}|${hasImg}`, () => {
        const r = 18 * D;
        pill(name, X, Y, { size: 17 * D, padX: 9 * D, bg: 'rgba(246,240,228,.9)', fg: '#2a1a10' });
        drawAvatar(u, X, Y - r - 11 * D, r, 'rgba(246,240,228,.95)');
      });
    } else {
      const role = it.kind;
      const bg = role === 'omuz' ? 'rgba(28,52,96,.92)' : role === 'sancak' ? 'rgba(130,20,26,.92)' : role === 'portre' ? 'rgba(20,70,44,.92)' : 'rgba(110,70,10,.9)';
      const icon = role === 'omuz' ? '⚰️ ' : role === 'sancak' ? '🚩 ' : role === 'portre' ? '🖼️ ' : '';
      const name = `${icon}${short(u.name, 12)}`, hasImg = !!getImg(u.avatar);
      paintSprite(e.tag, `r|${role}|${name}|${u.avatar}|${hasImg}`, () => {
        const r = 21 * D;
        pill(name, X, Y + 2 * D, { size: 18 * D, padX: 10 * D, bg, fg: '#fff', stroke: GOLD });
        drawAvatar(u, X, Y - r - 12 * D, r, GOLD);
      });
    }
    const alpha = d?.leaving ? clamp(1 - d.leaving / 0.6, 0, 1) : 1;
    const k = sc / D; // ekran pikseli / tuval pikseli
    placeSprite(e.tag, a, k, X, Y + lift / k, alpha);
    // sohbet balonu
    if (d?.bubbleT > 0) {
      if (!e.bub) e.bub = makeSprite(BUB_CW, BUB_CH);
      paintSprite(e.bub, d.bubble, () => bubble(d.bubble, BUB_CW / 2, BUB_AY, 19 * BUB_D, BUB_CW));
      const off = (it.kind === 'mourner' && !(u.score > 0) ? 50 : 56) * sc;
      const kb = sc / BUB_D;
      placeSprite(e.bub, a, kb, BUB_CW / 2, BUB_AY + off / kb, clamp(d.bubbleT / 0.4, 0, 1) * alpha);
    } else if (e.bub) { freeSprite(e.bub); e.bub = null; }
  }
  for (const [id, e] of tags3d) if (!seen.has(id)) { freeSprite(e.tag); freeSprite(e.bub); tags3d.delete(id); }
}

function drawUI(t) {
  const g = ctx;
  drawHeader();
  drawDuaBar(t);
  toasts.forEach((tt, i) => {
    const a = clamp(tt.t / 0.25, 0, 1) * clamp((5 - tt.t) / 0.6, 0, 1);
    pill(tt.text, W / 2, 412 + i * 46, { size: 25, bg: tt.color, alpha: a, stroke: 'rgba(217,178,90,.4)' });
  });
  const n = activeMourners().length;
  const countText = !n ? '🕯️ Saflar boş · bir yorum yaz, ilk sen katıl' : n >= C.maxMourners ? `🕯️ Saflar dolu · ${n}/${C.maxMourners}` : `🕯️ Saflarda ${n}/${C.maxMourners} kişi`;
  pill(countText, W / 2, H - 92, { size: 27, bg: 'rgba(30,12,8,.75)', fg: CREAM, stroke: 'rgba(217,178,90,.5)' });

  const bn = banners[0];
  if (bn) {
    const p = bn.t, inA = clamp(p / 0.25, 0, 1), outA = clamp((bn.dur - p) / 0.4, 0, 1);
    const sc = 0.7 + 0.3 * (1 - (1 - inA) ** 3);
    g.save(); g.globalAlpha = outA; g.translate(W / 2, 640); g.scale(sc, sc);
    const band = g.createLinearGradient(-W / 2, 0, W / 2, 0);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.2, 'rgba(25,10,6,.85)'); band.addColorStop(0.8, 'rgba(25,10,6,.85)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band; g.fillRect(-W / 2, -90, W, 180);
    g.strokeStyle = 'rgba(217,178,90,.6)'; g.lineWidth = 2;
    for (const yy of [-90, 90]) { g.beginPath(); g.moveTo(-W * 0.32, yy); g.lineTo(W * 0.32, yy); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = serif(64, 900); g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(bn.title, 0, -22);
    g.fillStyle = bn.color; g.fillText(bn.title, 0, -22);
    if (bn.sub) { g.font = sans(42, 700); g.fillStyle = CREAM; g.fillText(bn.sub, 0, 44); }
    g.restore();
  }
  if (!stage) pill(stageError ? `⚠️ ${short(stageError, 60)}` : '⏳ 3D karakterler yükleniyor…', W / 2, 1050, { size: 28, bg: stageError ? 'rgba(160,20,40,.85)' : 'rgba(0,0,0,.6)' });
  g.font = sans(22, 600); g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = status.connected ? '#7dff6b' : '#ffd34d';
  g.fillText(`${status.connected ? '●' : '○'} ${status.message || ''}`, 20, H - 24);
}

function drawParticles() {
  const g = ctx;
  for (const p of particles) {
    if (p.kind === 'spark') {
      g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.c;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, TAU); g.fill(); g.globalAlpha = 1;
    } else if (p.kind === 'petal') {
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = clamp(p.life / 0.8, 0, 1);
      g.fillStyle = p.c; g.beginPath(); g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, TAU); g.fill(); g.restore();
    }
  }
}

// ---------------------------------------------------------------- döngü
let last = performance.now();
const perf = { update: 0 };
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  try {
    const t0 = performance.now();
    update(dt, t);
    updateTags3D();
    perf.update = perf.update * 0.9 + (performance.now() - t0) * 0.1;
    if (stage) stage.render();
    ctx.clearRect(0, 0, W, H);
    drawUI(t);
    drawParticles();
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- başlat
const hint = document.getElementById('hint');
const musicBtn = document.getElementById('musicBtn');
function setMusicOff(off) {
  audio.setMusicMuted(off);
  musicBtn.textContent = off ? '🔇 Müzik kapalı' : '🎵 Müzik açık';
  musicBtn.classList.toggle('off', off);
}
musicBtn.addEventListener('click', () => setMusicOff(!audio.musicMuted));
setMusicOff(audio.musicMuted);
addEventListener('pointerdown', () => audio.ensure());
addEventListener('keydown', () => audio.ensure());
audio.ensure();
setInterval(() => { hint.style.display = (C.sound && !audio.muted && !audio.running) ? 'block' : 'none'; }, 700);

(async () => {
  try {
    const st = new Stage(sceneCanvas, W, H, null, TRANSPARENT);
    await st.load();
    if (st.loadErrors.length) console.warn('Yüklenemeyen modeller:', st.loadErrors);
    stage = st;
  } catch (err) {
    console.error(err);
    stageError = `3D yüklenemedi: ${err.message || err}`;
  }
})();
requestAnimationFrame(frame);
if (C.music) music.loadLibrary().then(() => music.start());
else { music.title = "kapalı"; musicBtn.style.display = "none"; }

// ---------------------------------------------------------------- sunucu bağlantısı
let ws = null;
function connectWS() {
  if (location.protocol === 'file:') { status = { connected: false, message: 'Sayfayı sunucudan aç: npm start → http://localhost:3000' }; return; }
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'game' }));
  ws.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data);
      onEvent(e);
      if (e.eid) ws.send(JSON.stringify({ type: 'ack', eid: e.eid }));
    } catch (err) { console.error(err); }
  };
  ws.onclose = () => { status = { connected: false, message: 'Sunucu bağlantısı yok, tekrar deneniyor…' }; setTimeout(connectWS, 2000); };
}
connectWS();

// Yönetim paneli için anlık durum (saniyede bir)
function snapshot() {
  const seat = (s) => (s ? { id: s.u.id, name: s.u.name, avatar: s.u.avatar, score: s.u.score } : null);
  const act = activeMourners();
  return {
    mourners: act.map((d) => ({ id: d.u.id, name: d.u.name, avatar: d.u.avatar, score: d.u.score, kept: isKept(d), gifted: d.u.score > 0, joined: d.joined, slot: d.slot, gender: d.u.gender })),
    capacity: C.maxMourners, full: act.length >= C.maxMourners,
    roles: Object.fromEntries(ROLE_KEYS.map((r) => [r, roles[r].map(seat)])),
    top: [...users.values()].filter((u) => u.score > 0).sort((a, b) => b.score - a.score).slice(0, 15).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, score: u.score })),
    musicOff: audio.musicMuted, music: music.title, dua: Math.round(energy * 100), duaOn: duaTime > 0,
    rules: { giftRoles: C.giftRoles || [] },
  };
}
setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'state', state: snapshot() })); }, 1000);

function sendSim(evt) {
  if (!evt) return;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'sim', event: evt }));
  else onEvent(evt);
}
window.Cenaze = { sendSim, onEvent, music, get stage() { return stage; }, mourners, roles };

// ---------------------------------------------------------------- test kısayolları
const help = document.getElementById('help');
if (params.has('test')) help.style.display = 'block';
const S = window.CenazeSim;

if (params.has('demo')) {
  for (let i = 0; i < 22; i++) onEvent(S.make('join', { reuse: 0 }));
  onEvent(S.make('gift', { user: S.pool[3], coins: 10, giftName: 'Kalp' }));
  onEvent(S.make('gift', { user: S.pool[6], coins: 1, giftName: 'Gül' }));
  onEvent(S.make('gift', { user: S.pool[8], coins: 10, giftName: 'Kalp' }));
  onEvent(S.make('gift', { user: S.pool[9], coins: 30, giftName: 'Donut' }));
  onEvent(S.make('gift', { user: S.pool[12], coins: 20, giftName: 'Hediye' }));
  onEvent(S.make('gift', { user: S.pool[14], coins: 15, giftName: 'Çay' }));
  setInterval(() => {
    const r = Math.random();
    if (r < 0.35) onEvent(S.make('join', { reuse: 0.1 }));
    else if (r < 0.55) onEvent(S.make('like', { count: 20 }));
    else if (r < 0.75) { const d = mourners[Math.floor(Math.random() * mourners.length)]; onEvent(S.make('comment', d ? { user: d.u } : {})); }
    else if (r < 0.92) onEvent(S.make('gift', { coins: [1, 1, 5, 10, 15, 30][Math.floor(Math.random() * 6)], reuse: 0.5 }));
    else onEvent(S.make('follow'));
  }, 2200);
}

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const gift = { 2: [1, 'Gül'], 3: [10, 'Kalp'], 4: [5, 'Parmak Kalp'], 5: [15, 'Çay'], 6: [30, 'Donut'], 7: [100, 'Hediye Kutusu'], 8: [20, 'Hediye'] }[k];
  if (gift) return sendSim(S.make('gift', { coins: gift[0], giftName: gift[1], reuse: 0.5 }));
  switch (k) {
    case '1': return sendSim(S.make('join'));
    case 'k': return sendSim(S.make('comment', { text: 'kadın', reuse: 0.6 }));
    case 'e': return sendSim(S.make('comment', { text: 'erkek', reuse: 0.6 }));
    case 'c': { const d = mourners[Math.floor(Math.random() * mourners.length)]; return sendSim(S.make('comment', d ? { user: d.u } : {})); }
    case 'l': return sendSim(S.make('like', { count: 40 }));
    case 'f': return sendSim(S.make('follow'));
    case 's': return sendSim(S.make('share'));
    case 'v': return sendSim({ type: 'camera', shot: ['tabut', 'sancak', 'omuz', 'portre', 'wide'][Math.floor(Math.random() * 4)] });
    case 'b': for (let i = 0; i < 8; i++) setTimeout(() => sendSim(S.make('join', { reuse: 0 })), i * 180); return;
    case 'r': return sendSim(S.make('reset'));
    case 'm': toast(audio.toggleMute() ? '🔇 Ses kapalı' : '🔊 Ses açık'); return;
    case 'h': help.style.display = help.style.display === 'block' ? 'none' : 'block'; return;
  }
});
if (params.has('debug')) setInterval(() => console.log('DBG', JSON.stringify({ n: mourners.length, step: step.toFixed(2), shot: stage?.shot.kind, updMs: perf.update.toFixed(1) })), 2000);
