// =====================================================================
//  3D sahne: Şehzade Mustafa'nın cenaze alayı.
//  En önde şehzadenin portresini taşıyan, ardından 2 sancaktar, ortada 8 kişinin omuzladığı tabut, arkada saflar.
//  Karakterler Mixamo iskeletli modeller; yürüyüş hazır animasyon değil,
//  kemikler her karede ters kinematik (IK) ile hesaplanır. Kaftan, sarık,
//  üsküf ve ferace kemiklere bağlı basit 3D parçalarla giydirilir.
//  Alay yerinde yürür; yol, servi ağaçları ve mezar taşları geriye akar.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const C = window.CENAZE_CONFIG;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (x) => x - Math.floor(x);
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hashOf = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickH = (arr, h, salt = 0) => arr[(((h >>> salt) ^ Math.imul(h, salt + 7)) >>> 0) % arr.length];

const BONE_NAMES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
const normName = (n) => n.replace(/^mixamorig\d*[:_]?/i, '');

// ---------------------------------------------------------------- alay yerleşimi (metre)
export const LAYOUT = {
  poleX: 0.44,                 // tabut sırıklarının merkeze uzaklığı
  carrierX: 0.64,              // taşıyıcıların merkeze uzaklığı
  carrierZ: [1.5, 0.5, -0.5, -1.5],
  flagX: 1.15, flagZ: 3.7,
  portreZ: 5.3,                // portreyi taşıyan (en önde)
  crowdZ: -3.0,                // ilk safın konumu
};
export function carrierPlace(i) {
  const side = i < 4 ? -1 : 1;
  return V(side * LAYOUT.carrierX, 0, LAYOUT.carrierZ[i % 4]);
}
export function portraitPlace(i) { const n = C.portraitBearers || 1; return V((i - (n - 1) / 2) * 0.9, 0, LAYOUT.portreZ); }
export function flagPlace(i) { return V((i === 0 ? -1 : 1) * LAYOUT.flagX, 0, LAYOUT.flagZ); }
export function mournerPlace(n) {
  const w = C.rowWidth, row = Math.floor(n / w), col = n % w;
  const x = (col - (w - 1) / 2) * C.colSpacing + (row % 2 ? 0.1 : -0.1);
  return V(x, 0, LAYOUT.crowdZ - row * C.rowSpacing);
}

// ---------------------------------------------------------------- kemik yardımcıları
const _a = V(), _b = V(), _c = V();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _dp = V(), _ds = V();
const wpos = (o, out) => out.setFromMatrixPosition(o.matrixWorld);
const wquat = (o, out) => { o.matrixWorld.decompose(_dp, out, _ds); return out; };
function refreshSelf(bone) { bone.updateMatrix(); bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix); }
function refreshTo(bone, from) {
  if (!bone) return;
  const chain = [];
  for (let o = bone; o && o !== from && o.parent; o = o.parent) chain.push(o);
  for (let i = chain.length - 1; i >= 0; i--) refreshSelf(chain[i]);
}
function aimBone(bone, child, target) {
  refreshTo(child, bone);
  const bp = wpos(bone, _a);
  const cur = wpos(child, _b).sub(bp);
  const want = _c.copy(target).sub(bp);
  if (cur.lengthSq() < 1e-10 || want.lengthSq() < 1e-10) return;
  cur.normalize(); want.normalize();
  _q1.setFromUnitVectors(cur, want);
  wquat(bone, _q2);
  wquat(bone.parent, _q3);
  bone.quaternion.copy(_q3.invert().multiply(_q1.multiply(_q2)));
  refreshSelf(bone);
  refreshTo(child, bone);
}
function rotateWorld(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  wquat(bone, _q2);
  wquat(bone.parent, _q3);
  _q1.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(_q3.invert().multiply(_q1.multiply(_q2)));
  refreshSelf(bone);
}
const _S = V(), _E = V(), _T = V(), _D = V(), _P = V(), _EL = V();
function solveIK(upper, lower, end, target, pole) {
  wpos(upper, _S);
  const la = _S.distanceTo(wpos(lower, _E));
  const lb = _E.distanceTo(wpos(end, _T));
  _D.copy(target).sub(_S);
  let d = _D.length();
  if (d < 1e-6) return;
  _D.divideScalar(d);
  d = clamp(d, Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const x = (la * la - lb * lb + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, la * la - x * x));
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D));
  if (_P.lengthSq() < 1e-8) _P.set(0, -1, 0).addScaledVector(_D, -_D.y);
  _P.normalize();
  _EL.copy(_S).addScaledVector(_D, x).addScaledVector(_P, h);
  aimBone(upper, lower, _EL);
  aimBone(lower, end, target);
}

// ---------------------------------------------------------------- dokular
function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const BLOB = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}, { srgb: false });

// toprak yol (kenarları saydam, çimenle karışır)
function roadTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a07c58'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { // toprak dokusu
      const x = rnd() * w, y = rnd() * h, r = 1 + rnd() * 5;
      g.fillStyle = `rgba(${rnd() < 0.5 ? '70,48,30' : '200,170,130'},${0.08 + rnd() * 0.12})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill();
    }
    for (const rx of [0.36, 0.64]) { // tekerlek izleri
      for (let y = 0; y < h; y += 2) {
        const x = rx * w + Math.sin(y / 60) * 6;
        g.fillStyle = 'rgba(60,40,24,.10)'; g.fillRect(x - 10, y, 20, 2);
      }
    }
    for (let i = 0; i < 70; i++) { // taşlar
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 6;
      g.fillStyle = `rgba(${150 + rnd() * 60},${130 + rnd() * 50},${110 + rnd() * 40},.85)`;
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(40,25,15,.25)'; g.beginPath(); g.ellipse(x + 1, y + 2, r, r * 0.5, 0, 0, TAU); g.fill();
    }
    // kenarları yumuşak saydam
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1), edge = Math.min(u, 1 - u);
      const a = smooth((edge - 0.02) / 0.16);
      for (let y = 0; y < h; y++) d[(y * w + x) * 4 + 3] = Math.round(255 * a * (0.9 + 0.1 * Math.sin(y / 9 + x)));
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
}
function grassTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#6d6a3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const x = rnd() * w, y = rnd() * h;
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '120,118,60' : '70,72,36'},${0.25 + rnd() * 0.35})`;
      g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); g.stroke();
    }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(160,130,90,${0.15 + rnd() * 0.2})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 3 + rnd() * 10, 0, TAU); g.fill(); }
  }, { repeat: true });
}
// tabut örtüsü: yeşil kumaş, altın bordür ve geometrik desen
function clothTexture() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#0f4a2c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 8); }
    const gold = '#d9b25a';
    g.strokeStyle = gold; g.lineWidth = 10; g.strokeRect(22, 22, w - 44, h - 44);
    g.lineWidth = 3; g.strokeRect(44, 44, w - 88, h - 88);
    g.fillStyle = gold;
    for (let y = 120; y < h - 80; y += 150) { // sekiz köşeli yıldızlar
      for (const x of [w * 0.3, w * 0.7]) {
        g.save(); g.translate(x, y);
        for (let k = 0; k < 2; k++) { g.rotate(Math.PI / 4); g.strokeRect(-26, -26, 52, 52); }
        g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
        g.restore();
      }
    }
    for (let x = 30; x < w - 20; x += 22) { g.beginPath(); g.arc(x, 30, 4, 0, TAU); g.arc(x, h - 30, 4, 0, TAU); g.fill(); }
  });
}
// sancak: kırmızı ya da yeşil zemin üstünde beyaz hilal (kırmızıda yanında yıldız), altın saçak
function flagTexture(bg, star = false) {
  return canvasTex(512, 340, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, 'rgba(0,0,0,.25)'); grd.addColorStop(0.15, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6efe0';
    g.beginPath(); g.arc(w * 0.48, h * 0.5, h * 0.27, 0, TAU); g.fill();
    g.fillStyle = bg; g.beginPath(); g.arc(w * 0.535, h * 0.5, h * 0.22, 0, TAU); g.fill();
    if (star) { // beş köşeli yıldız, bir ucu hilale bakar
      const cx = w * 0.48 + h * 0.37, cy = h * 0.5, R = h * 0.12, r = R * 0.382;
      g.fillStyle = '#f6efe0'; g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = Math.PI + (i * Math.PI) / 5, rr = i % 2 ? r : R;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    }
    g.fillStyle = '#d9b25a';
    for (let x = 0; x < w; x += 14) { g.fillRect(x, h - 16, 8, 16); g.fillRect(x, 0, 8, 10); }
    g.fillRect(w - 18, 0, 18, h);
  });
}

// ---------------------------------------------------------------- malzemeler (renk başına bir tane)
const matCache = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, ...opts }); matCache.set(key, m); }
  return m;
}

// ---------------------------------------------------------------- model şablonları
async function loadTemplate(def) {
  let root;
  if (/\.fbx$/i.test(def.file)) root = await new FBXLoader().loadAsync(def.file);
  else root = (await new GLTFLoader().loadAsync(def.file)).scene;
  const bones = {};
  root.traverse((o) => { if (o.isBone) { const n = normName(o.name); if (!bones[n]) bones[n] = o; } });
  for (const need of ['Hips', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Head']) {
    if (!bones[need]) throw new Error(`${def.file}: Mixamo iskeleti bulunamadı (${need} yok)`);
  }
  const measure = () => {
    root.updateMatrixWorld(true);
    const top = (bones.HeadTop_End || bones.Head).getWorldPosition(V()).y + (bones.HeadTop_End ? 0 : 0.12);
    const toes = [bones.LeftToeBase, bones.RightToeBase, bones.LeftFoot, bones.RightFoot].filter(Boolean).map((b) => b.getWorldPosition(V()).y);
    const bottom = Math.min(...toes);
    return { top, bottom: bottom - (top - bottom) * 0.012 };
  };
  let m = measure();
  root.scale.multiplyScalar((def.height || 1.75) / (m.top - m.bottom));
  m = measure();
  root.position.y -= m.bottom;
  const hide = (def.hide || []).map((s) => s.toLowerCase());
  const tint = def.tint || {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (hide.some((h) => (o.name || '').toLowerCase() === h || mats.some((mt) => (mt.name || '').toLowerCase() === h))) o.visible = false;
    mats.forEach((mt) => {
      if (mt.map) mt.map.anisotropy = 4;
      if ('roughness' in mt) mt.roughness = Math.max(mt.roughness, 0.6);
      if (tint[mt.name]) mt.color.set(tint[mt.name]);
    });
  });
  return { def, root };
}

// ---------------------------------------------------------------- kıyafetler
// look: { gender, robe, robe2, sash, hat, hatColor, trim }
const PALETTE = {
  mourner: ['#5a3a2a', '#4a4630', '#3b4250', '#6b4a32', '#55302c', '#3f3a34', '#5d5440', '#2f3a3a', '#6a5a48', '#4b3b4f'],
  rich: ['#7a1d26', '#1d3f6e', '#2d5a3a', '#6b2a5a', '#8a5a14'],
  female: ['#2a2430', '#3b2a2a', '#1f2a3a', '#4a3028', '#2e3a30', '#4a2a3a'],
  sash: ['#b08a4a', '#7a2a2a', '#c8b89a', '#3a5a3a', '#8a6a3a'],
  turban: ['#f2ece0', '#efe6d4', '#e8dcc6'],
};
export function lookFor(id, { gender = 'male', role = 'mourner', rich = false } = {}) {
  const h = hashOf(id);
  if (gender === 'female') {
    return { gender, robe: pickH(PALETTE.female, h, 1), scarf: pickH(['#f1ebe0', '#e9e2d6', '#d9d0c4'], h, 3), sash: pickH(PALETTE.sash, h, 5), rich };
  }
  if (role === 'omuz') return { gender, robe: '#2c4f86', robe2: '#1d355c', sash: '#c9a24c', hat: 'uskuf', hatColor: '#f4efe4', trim: '#d9b25a', rich };
  if (role === 'portre') return { gender, robe: '#1d4a32', robe2: '#123522', sash: '#d9b25a', hat: 'kavuk', hatColor: '#f4efe4', trim: '#d9b25a', rich: true };
  if (role === 'sancak') return { gender, robe: '#9c1c22', robe2: '#6e1015', sash: '#d9b25a', hat: 'uskuf', hatColor: '#f4efe4', trim: '#d9b25a', rich: true };
  return {
    gender, rich,
    robe: rich ? pickH(PALETTE.rich, h, 1) : pickH(PALETTE.mourner, h, 1),
    sash: rich ? '#d9b25a' : pickH(PALETTE.sash, h, 4),
    hat: pickH(['sarik', 'sarik', 'sarik', 'kavuk', 'kalpak'], h, 6),
    hatColor: pickH(PALETTE.turban, h, 2),
    trim: rich ? '#d9b25a' : null,
  };
}

const SCARF_R = 0.098;
// Şablon (model) başına bir kez kurulan kıyafet geometrileri
function costumeGeos(tpl, m) {
  if (tpl.geos) return tpl.geos;
  const waist = m.hipY + 0.07;
  const r0 = Math.max(0.15, m.hipX + 0.085);
  const lathe = (pts, seg = 22) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const top = m.shoulderY - waist;
  const hl = m.headLen;
  const g = {
    waist,
    // kaftan eteği (belden baldıra) ve uzun ferace eteği (belden yere)
    skirt: lathe([[r0 - 0.012, 0.03], [r0, -0.05], [r0 + 0.035, -0.25], [r0 + 0.075, -0.5], [r0 + 0.11, -(waist - 0.16)], [r0 + 0.105, -(waist - 0.15)]]),
    skirtLong: lathe([[r0 - 0.012, 0.03], [r0, -0.05], [r0 + 0.06, -0.3], [r0 + 0.14, -0.6], [r0 + 0.22, -(waist - 0.04)], [r0 + 0.21, -(waist - 0.03)]]),
    // üst beden (belden omuza)
    bodice: lathe([[r0 - 0.01, -0.03], [r0 + 0.005, top * 0.35], [r0 + 0.03, top * 0.72], [r0 + 0.02, top * 0.92], [0.11, top + 0.04], [0.07, top + 0.07], [0.062, top + 0.1]]),
    sash: new THREE.TorusGeometry(r0 - 0.005, 0.022, 8, 28),
    sleeveU: new THREE.CylinderGeometry(0.058, 0.07, 1, 10, 1, true).translate(0, 0.5, 0),
    sleeveL: new THREE.CylinderGeometry(0.075, 0.056, 1, 10, 1, true).translate(0, 0.5, 0),
    // sarık: yuvarlak beyaz sarık + tepede renkli kavuk
    sarikCore: new THREE.SphereGeometry(hl * 0.66, 18, 12).scale(1, 0.72, 1),
    sarikWrap: new THREE.TorusGeometry(hl * 0.56, hl * 0.2, 10, 24).rotateX(Math.PI / 2),
    sarikTop: new THREE.SphereGeometry(hl * 0.3, 12, 8).scale(1, 0.9, 1),
    // kavuk: uzun silindir, alt kısmı sarıklı
    kavukTall: new THREE.CylinderGeometry(hl * 0.38, hl * 0.48, hl * 1.0, 16).translate(0, hl * 0.5, 0),
    // kalpak: kürk başlık
    kalpak: new THREE.CylinderGeometry(hl * 0.6, hl * 0.56, hl * 0.85, 18).translate(0, hl * 0.32, 0),
    // yeniçeri üsküfü (börk): uzun beyaz keçe, arkaya sarkan yatırtma, önde altın kaşıklık
    uskufBand: new THREE.TorusGeometry(hl * 0.5, hl * 0.07, 8, 24).rotateX(Math.PI / 2),
    uskuf: new THREE.CylinderGeometry(hl * 0.36, hl * 0.5, hl * 1.9, 16, 1, true).translate(0, hl * 0.9, 0),
    uskufCap: new THREE.CircleGeometry(hl * 0.36, 16).rotateX(-Math.PI / 2).translate(0, hl * 1.85, 0),
    uskufFlap: new THREE.PlaneGeometry(hl * 0.66, hl * 2.6, 1, 4).translate(0, -hl * 1.3, 0),
    kasiklik: new THREE.CylinderGeometry(hl * 0.07, hl * 0.1, hl * 0.6, 8).translate(0, hl * 0.3, 0),
    // kadın: başı saran, yüzü açık bırakan başörtüsü + omuzlara inen örtü
    scarfCap: new THREE.SphereGeometry(SCARF_R, 24, 10, 0, TAU, 0, Math.PI * 0.36),
    scarfSides: new THREE.SphereGeometry(SCARF_R, 24, 12, Math.PI / 2 + 0.95, TAU - 1.9, Math.PI * 0.36 - 0.002, Math.PI * 0.5),
    scarfDrape: lathe([[0.08, 0.02], [0.1, -0.05], [0.14, -0.14], [0.185, -0.25], [0.195, -0.29]], 24),
  };
  tpl.geos = g;
  return g;
}

class Costume {
  constructor(ch, look, scene) {
    this.ch = ch; this.look = look; this.scene = scene;
    const g = costumeGeos(ch.tpl, ch.m);
    this.g = g;
    this.group = new THREE.Group();
    const add = (geo, material, extra = {}) => { const ms = new THREE.Mesh(geo, material); ms.frustumCulled = false; Object.assign(ms.userData, extra); this.group.add(ms); return ms; };
    const female = look.gender === 'female';
    const robe = mat(look.robe), robe2 = mat(look.robe2 || look.robe);
    this.skirt = add(female ? g.skirtLong : g.skirt, robe);
    // modelin ceketi boyanabiliyorsa üst beden ve kollar onunla olur, yoksa kodla giydirilir
    const solid = ch.solidMats.length > 0;
    if (solid) ch.solidMats.forEach((m) => m.color.set(look.robe2 || look.robe));
    this.bodice = solid ? null : add(g.bodice, robe2);
    this.sash = solid ? null : add(g.sash, mat(look.sash, { roughness: 0.6 }));
    this.sleeves = solid ? [] : [add(g.sleeveU, robe2), add(g.sleeveL, robe2), add(g.sleeveU, robe2), add(g.sleeveL, robe2)];
    this.hat = new THREE.Group(); this.group.add(this.hat);
    const hl = ch.m.headLen;
    const H = (geo, material, y = 0) => { const ms = new THREE.Mesh(geo, material); ms.position.y = y; ms.frustumCulled = false; this.hat.add(ms); return ms; };
    if (female) {
      const sm = mat(look.scarf, { roughness: 0.95 });
      const sc = H(g.scarfCap, sm, 0), ss = H(g.scarfSides, sm, 0);
      for (const o of [sc, ss]) { o.scale.set(1.04, 1.14, 1.1); o.position.z = -0.004; }
      const dr = H(g.scarfDrape, sm, -0.06); dr.scale.set(1.08, 1, 0.78); dr.position.z = -0.025;
      this.hatOffset = 0.44; // baş kemiği ile tepe arasındaki konum (0-1): başın ortası
    } else if (look.hat === 'uskuf') {
      H(g.uskufBand, mat(look.trim || '#d9b25a', { metalness: 0.5, roughness: 0.4 }), 0);
      const body = H(g.uskuf, mat(look.hatColor), 0); body.rotation.x = -0.38;
      const cap = H(g.uskufCap, mat(look.hatColor), 0); cap.rotation.x = -0.38;
      const flap = H(g.uskufFlap, mat(look.hatColor), hl * 1.62); flap.position.z = -hl * 0.72; flap.rotation.x = 0.28;
      const k = H(g.kasiklik, mat('#d9b25a', { metalness: 0.6, roughness: 0.35 }), 0); k.position.z = hl * 0.5; k.rotation.x = 0.1;
      this.hatOffset = 0.6;
    } else if (look.hat === 'kalpak') {
      H(g.kalpak, mat('#2a1d16', { roughness: 1 }), 0);
      this.hatOffset = 0.6;
    } else if (look.hat === 'kavuk') {
      H(g.kavukTall, mat('#e4d6b8'), 0); // krem keçe kavuk, altı sarıklı
      H(g.sarikWrap, mat(look.hatColor), hl * 0.05).scale.set(1.02, 1.1, 1.02);
      H(g.sarikTop, mat(look.rich ? '#8a1d26' : '#6a2a22'), hl * 1.0).scale.set(0.8, 0.4, 0.8);
      this.hatOffset = 0.6;
    } else { // sarık
      H(g.sarikCore, mat(look.hatColor), hl * 0.05);
      H(g.sarikWrap, mat(look.hatColor), 0);
      H(g.sarikTop, mat(look.rich ? '#8a1d26' : '#6a2a22'), hl * 0.38);
      this.hatOffset = 0.58;
    }
    this.hatOffset -= 0; // ince ayar için
    scene.add(this.group);
  }

  dispose() { this.scene.remove(this.group); }

  update(scale) {
    const ch = this.ch, g = this.g, q = ch.groundQ;
    if (!q) return;
    this.group.visible = scale > 0.02;
    const hips = ch.worldOf('Hips');
    const base = V(hips.x, hips.y + (g.waist - ch.m.hipY) * scale, hips.z);
    this.skirt.position.copy(base); this.skirt.quaternion.copy(q);
    this.skirt.scale.set(scale, scale, scale * 0.86);
    const spineDir = ch.worldOf('Neck').sub(ch.worldOf('Spine')).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, spineDir);
    if (this.bodice) {
      this.bodice.position.copy(base); this.bodice.quaternion.copy(tilt).multiply(q);
      this.bodice.scale.set(scale * 1.12, scale, scale * 0.74);
    }
    if (this.sash) this.sash.position.copy(base);
    if (this.sash) { this.sash.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
    this.sash.scale.set(scale * 1.0, scale * 0.76, scale * 0.7);
    }
    const pairs = [['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand']];
    pairs.forEach(([a, b], i) => {
      const pa = ch.worldOf(a), pb = ch.worldOf(b), d = pb.clone().sub(pa), len = d.length();
      const sl = this.sleeves[i];
      if (!sl || len < 1e-4) return;
      if (i % 2 === 0) pa.addScaledVector(d, -0.08); // omuza biraz gir
      sl.position.copy(pa);
      sl.quaternion.setFromUnitVectors(UP, d.normalize());
      sl.scale.set(scale, len * (i % 2 === 0 ? 1.08 : 0.92), scale);
    });
    const head = ch.worldOf('Head'), top = ch.b.HeadTop_End ? ch.worldOf('HeadTop_End') : head.clone().add(V(0, ch.m.headLen, 0));
    const hd = top.clone().sub(head).normalize();
    this.hat.position.copy(head).lerp(top, this.hatOffset);
    this.hat.quaternion.setFromUnitVectors(UP, hd).multiply(q);
    this.hat.scale.setScalar(scale);
  }
}

// ---------------------------------------------------------------- karakter
class Character {
  constructor(tpl) {
    this.tpl = tpl;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(tpl.root);
    this.root.add(this.model);
    this.b = {};
    this.model.traverse((o) => {
      if (o.isBone) { const n = normName(o.name); if (BONE_NAMES.includes(n) && !this.b[n]) this.b[n] = o; }
      if (o.isMesh) o.frustumCulled = false;
    });
    this.rest = [...Object.values(this.b)].map((bone) => [bone, bone.quaternion.clone()]);
    // def.solid: modelin kendi kıyafeti (ör. ceket) dokusuz, kaftan renginde boyanır
    this.solidMats = [];
    const solid = (tpl.def.solid || []).map((x) => x.toLowerCase());
    if (solid.length) this.model.traverse((o) => {
      if (!o.isMesh) return;
      const one = (mt) => { if (!solid.includes((mt.name || '').toLowerCase())) return mt; const c = mt.clone(); c.map = null; c.normalMap = null; c.roughness = 0.9; this.solidMats.push(c); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; this.root.add(blob);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 40), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.025; this.root.add(this.aura);

    this.root.updateMatrixWorld(true);
    const wp = (n) => this.b[n].getWorldPosition(V());
    const la = wp('LeftArm'), lf = wp('LeftFoot');
    const head = wp('Head'), top = this.b.HeadTop_End ? wp('HeadTop_End') : head.clone().add(V(0, 0.2, 0));
    this.m = {
      shoulderY: la.y, shoulderX: Math.abs(la.x),
      hipY: wp('LeftUpLeg').y, hipX: Math.abs(wp('LeftUpLeg').x),
      ankleY: lf.y,
      toe: this.b.LeftToeBase ? wp('LeftToeBase').sub(lf) : V(0, -lf.y * 0.6, 0.13),
      headTop: top.y, headLen: 0.2 * (tpl.def.height || 1.75) / 1.75, rawHeadLen: top.distanceTo(head),
    };
    this.m.toe.x = 0;
  }

  resetPose() { for (const [bone, q] of this.rest) bone.quaternion.copy(q); }
  local(x, y, z, out = V()) { return out.set(x, y, z).applyMatrix4(this.ground); }
  localDir(x, y, z) { return V(x, y, z).applyQuaternion(this.groundQ).normalize(); }

  apply(P, place, hands = {}) {
    this.resetPose();
    this.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, place.yaw + (P.yaw || 0));
    this.ground = new THREE.Matrix4().compose(place.pos, this.groundQ, V(1, 1, 1));
    const fwd = this.localDir(0, 0, 1), right = this.localDir(1, 0, 0);
    this.root.position.copy(place.pos).addScaledVector(right, P.sway || 0);
    this.root.position.y += P.rootY || 0;
    this.root.quaternion.copy(this.groundQ);
    this.root.updateMatrixWorld(true);
    const b = this.b;
    rotateWorld(b.Spine, right, (P.lean || 0) * 0.5);
    rotateWorld(b.Spine, fwd, P.roll || 0);
    refreshTo(b.Spine1, b.Spine); rotateWorld(b.Spine1, right, (P.lean || 0) * 0.5);
    refreshTo(b.Spine2, b.Spine1); rotateWorld(b.Spine2, UP, P.twist || 0);
    refreshTo(b.Head, b.Spine2); rotateWorld(b.Head, right, P.nod || 0); rotateWorld(b.Head, UP, P.look || 0);
    refreshTo(b.LeftHand, b.Spine2); refreshTo(b.RightHand, b.Spine2);
    const lh = hands.L || this.local(...P.lh), rh = hands.R || this.local(...P.rh);
    solveIK(b.LeftArm, b.LeftForeArm, b.LeftHand, lh, this.localDir(...P.elbowL));
    solveIK(b.RightArm, b.RightForeArm, b.RightHand, rh, this.localDir(...P.elbowR));
    for (const [leg, side] of [['Left', 1], ['Right', -1]]) {
      const f = side > 0 ? P.lf : P.rf;
      const foot = this.local(f[0], f[1], f[2]);
      solveIK(b[`${leg}UpLeg`], b[`${leg}Leg`], b[`${leg}Foot`], foot, this.localDir(side * 0.12, 0, 1));
      const toeBone = b[`${leg}ToeBase`];
      if (toeBone) aimBone(b[`${leg}Foot`], toeBone, this.local(f[0], f[1] + this.m.toe.y - (f[3] || 0), f[2] + this.m.toe.z));
    }
  }

  worldOf(name, out = V()) { return this.b[name].getWorldPosition(out); }
}

// ---------------------------------------------------------------- yürüyüş pozu
// k: { step (adım sayacı), stride, mode: mourner|omuz|sancak, hands, dua, t, h (kişiye özel sayı) }
// Yerel eksen: x = karakterin solu, y = yukarı, z = ileri
function walkPose(m, k) {
  const A = m.ankleY, s = k.stride, cyc = k.step / 2;
  const foot = (u, x) => {
    u = frac(u);
    if (u < 0.5) return [x, A, s / 2 - (u / 0.5) * s, 0];
    const w = (u - 0.5) / 0.5, lift = Math.sin(Math.PI * w);
    return [x, A + lift * 0.085, -s / 2 + smooth(w) * s, 0.05 * lift];
  };
  const fp = frac(k.step);
  const swing = Math.sin(TAU * cyc); // + : sol ayak önde
  const P = {
    rootY: -0.035 + 0.022 * Math.sin(Math.PI * fp), sway: 0.018 * Math.sin(TAU * cyc + Math.PI / 2), yaw: 0,
    lean: 0.06, roll: 0.015 * Math.sin(TAU * cyc), twist: -0.05 * swing, nod: 0.16, look: 0,
    lf: foot(cyc, m.hipX + 0.01), rf: foot(cyc + 0.5, -m.hipX - 0.01),
    // kollar yürürken bacağın tersine sallanır
    lh: [m.shoulderX + 0.06, m.hipY - 0.08, -0.14 * swing + 0.03], rh: [-m.shoulderX - 0.06, m.hipY - 0.08, 0.14 * swing + 0.03],
    elbowL: [0.25, -1, -0.6], elbowR: [-0.25, -1, -0.6],
  };
  if (k.mode === 'mourner') {
    const hm = k.dua ? 'dua' : k.hands;
    if (hm === 'clasp') { // eller önde kavuşturulmuş
      P.lh = [0.03, m.hipY + 0.06, 0.2]; P.rh = [-0.03, m.hipY + 0.08, 0.21];
      P.elbowL = [1, -0.6, -0.2]; P.elbowR = [-1, -0.6, -0.2];
    } else if (hm === 'chest') { // sağ el göğüste
      P.rh = [0.02, m.shoulderY - 0.18, 0.17]; P.elbowR = [-1, -0.7, 0];
    } else if (hm === 'dua') { // dua: avuçlar yukarı, göğüs hizasında
      const lift = 0.02 * Math.sin(k.t * 1.3 + k.h);
      P.lh = [0.17, m.shoulderY - 0.16 + lift, 0.3]; P.rh = [-0.17, m.shoulderY - 0.16 + lift, 0.3];
      P.elbowL = [0.4, -1, -0.2]; P.elbowR = [-0.4, -1, -0.2];
      P.nod = 0.26;
    }
    P.nod += 0.05 * ((k.h % 7) / 7);
  } else if (k.mode === 'omuz') {
    P.nod = 0.06; P.lean = 0.08;
    P.look = -k.side * 0.12; // başı sırıktan öteye hafif çevrik
  } else if (k.mode === 'sancak') {
    P.nod = -0.02; P.lean = 0.0;
  } else if (k.mode === 'portre') { // resmi göğüs hizasında iki eliyle tutar
    P.nod = 0.1; P.lean = -0.02; P.twist *= 0.3;
    P.elbowL = [0.8, -0.7, -0.3]; P.elbowR = [-0.8, -0.7, -0.3];
  }
  return P;
}

// ---------------------------------------------------------------- sahne
export class Stage {
  constructor(canvas, width, height, bgCanvas, transparent) {
    this.W = width; this.H = height;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: transparent, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb08c72, 38, 95);
    if (!transparent) this.buildSky();

    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a3828, 1.25));
    const sun = new THREE.DirectionalLight(0xffc48a, 2.3); sun.position.set(-7, 10, 6); scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb2ff, 0.55); fill.position.set(6, 6, -8); scene.add(fill);

    this.chars = new Map();     // id -> { ch, costume, key, gpos, h, enter, leaving }
    this.anchors = new Map();
    this.templates = [];
    this.scroll = 0;
    this.buildGround();
    this.buildCoffin();
    this.buildFlags();
    this.buildPortraits();
    this.setupCamera();
  }

  // ---------------------------------------------------------------- gökyüzü ve uzak şehir silueti
  // Gerçek 3D: kameranın etrafında bir kubbe ve silindir. Kamera dönünce/yaklaşınca
  // gökyüzü ve ufuk da doğru şekilde hareket eder (eskiden ekrana yapışık bir resimdi).
  buildSky() {
    const FOG = '#b08c72';
    // gökyüzü kubbesi (equirect doku: üst satır = tepe, orta = ufuk)
    const skyT = canvasTex(1024, 512, (g, w, h) => {
      const hz = h / 2;
      const gr = g.createLinearGradient(0, 0, 0, hz);
      gr.addColorStop(0, '#1e1830'); gr.addColorStop(0.45, '#4a3046'); gr.addColorStop(0.75, '#8a5550'); gr.addColorStop(0.92, '#c98a5e'); gr.addColorStop(1, FOG);
      g.fillStyle = gr; g.fillRect(0, 0, w, hz);
      g.fillStyle = FOG; g.fillRect(0, hz, w, h - hz);
      // güneş: -z yönünde (kameranın baktığı taraf), ufka yakın
      for (const sx of [0.75 * w - 40]) {
        const sun = g.createRadialGradient(sx, hz - 22, 4, sx, hz - 22, 230);
        sun.addColorStop(0, 'rgba(255,222,160,.95)'); sun.addColorStop(0.08, 'rgba(255,200,130,.6)'); sun.addColorStop(0.4, 'rgba(255,170,110,.18)'); sun.addColorStop(1, 'rgba(255,170,110,0)');
        g.fillStyle = sun; g.fillRect(0, 0, w, hz + 40);
      }
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    // uzak siluet: tepeler, kubbeler, minareler, serviler (silindirin iç yüzü)
    const R = 170, HC = 60, below = 20; // ufuk silindirin alt kenarından 20 m yukarıda
    const silT = canvasTex(4096, 512, (g, w, h) => {
      let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const px = h / HC;             // 1 m kaç piksel
      const hz = h - below * px;     // ufuk satırı
      g.clearRect(0, 0, w, h);
      // uzak tepeler (puslu)
      g.fillStyle = 'rgba(120,80,78,.55)'; g.beginPath(); g.moveTo(0, hz);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, hz - (5 + 3 * Math.sin(x / 260) + 1.6 * Math.sin(x / 71)) * px);
      g.lineTo(w, hz); g.closePath(); g.fill();
      g.fillStyle = 'rgba(88,58,60,.8)';
      const mosque = (cx, s) => { // s: metre ölçeği
        const by = hz - 1 * px, u = px * s;
        g.fillRect(cx - 9 * u, by - 5 * u, 18 * u, 5 * u + 2);
        g.beginPath(); g.arc(cx, by - 5 * u, 5.5 * u, Math.PI, 0); g.fill();
        for (const dx of [-7, 7]) { g.beginPath(); g.arc(cx + dx * u, by - 5 * u, 2.4 * u, Math.PI, 0); g.fill(); }
        for (const dx of [-11.5, 11.5]) {
          g.fillRect(cx + dx * u - 0.5 * u, by - 17 * u, 1 * u, 17 * u);
          g.beginPath(); g.moveTo(cx + dx * u - 0.7 * u, by - 17 * u); g.lineTo(cx + dx * u, by - 20.5 * u); g.lineTo(cx + dx * u + 0.7 * u, by - 17 * u); g.fill();
          g.fillRect(cx + dx * u - 0.8 * u, by - 12 * u, 1.6 * u, 0.5 * u);
        }
        g.fillRect(cx - 0.15 * u, by - 12.5 * u, 0.3 * u, 2 * u);
      };
      // ön taraf (u ~ 0.5 = -z) iki büyük cami, çevrede küçük kubbeler
      mosque(w * 0.5 + 60, 1.0); mosque(w * 0.5 - 520, 0.6); mosque(w * 0.5 + 900, 0.5); mosque(w * 0.12, 0.55); mosque(w * 0.85, 0.65);
      for (let i = 0; i < 140; i++) { // evler
        const x = r() * w, bw = (2 + r() * 5) * px, bh = (1 + r() * 2.5) * px;
        g.fillRect(x, hz - bh - px, bw, bh + px + 2);
      }
      g.fillStyle = 'rgba(60,52,44,.75)';
      for (let i = 0; i < 90; i++) { // uzak serviler
        const x = r() * w, ch = (5 + r() * 5) * px, cw = (0.9 + r() * 0.6) * px;
        g.beginPath(); g.moveTo(x - cw / 2, hz); g.quadraticCurveTo(x - cw / 2, hz - ch * 0.6, x, hz - ch); g.quadraticCurveTo(x + cw / 2, hz - ch * 0.6, x + cw / 2, hz); g.fill();
      }
      g.fillStyle = FOG; g.fillRect(0, hz - 0.6 * px, w, h - hz + 0.6 * px); // ufkun altı: sis rengi
    });
    const sil = new THREE.Mesh(new THREE.CylinderGeometry(R, R, HC, 96, 1, true).translate(0, HC / 2 - below, 0),
      new THREE.MeshBasicMaterial({ map: silT, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false })); // derinlik testi açık: karakterler önünde kalır
    sil.renderOrder = -9; sil.frustumCulled = false;
    this.scene.add(sky, sil);
    this.sky = [sky, sil];
  }

  // ---------------------------------------------------------------- zemin ve dekor
  buildGround() {
    const GL = 480; // zemin ufka kadar uzansın (sis onu ufuk rengine boğar)
    const grassT = grassTexture(); grassT.repeat.set(GL / 8, GL / 8);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(GL, GL), new THREE.MeshStandardMaterial({ map: grassT, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0, -60); this.scene.add(grass);
    this.grassL = GL;
    const roadT = roadTexture(); roadT.repeat.set(1, 19.2);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 192), new THREE.MeshStandardMaterial({ map: roadT, roughness: 1, transparent: true, depthWrite: false }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.006, -40); this.scene.add(road);
    this.grassT = grassT; this.roadT = roadT;

    // servi ağaçları, mezar taşları, alçak taş duvar: geriye doğru akar ve baştan döner
    this.props = [];
    this.propSpan = [-70, 22];
    const cypMat = mat('#1f3a26', { roughness: 0.95 }), cypMat2 = mat('#284a30', { roughness: 0.95 }), trunk = mat('#4a3424');
    const stone = mat('#b9ae9a', { roughness: 0.95 }), stoneDark = mat('#8e8574', { roughness: 0.95 });
    const cone = new THREE.ConeGeometry(0.55, 5.2, 10).translate(0, 3.0, 0);
    const cone2 = new THREE.ConeGeometry(0.42, 3.6, 10).translate(0, 4.6, 0);
    const trunkG = new THREE.CylinderGeometry(0.09, 0.12, 0.8, 6).translate(0, 0.4, 0);
    for (let z = this.propSpan[0]; z < this.propSpan[1]; z += 3.4) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.2) continue;
        const g = new THREE.Group();
        const s = 0.8 + rnd() * 0.5;
        g.add(new THREE.Mesh(trunkG, trunk));
        g.add(new THREE.Mesh(cone, rnd() < 0.5 ? cypMat : cypMat2));
        g.add(new THREE.Mesh(cone2, cypMat2));
        g.scale.set(s, s * (0.9 + rnd() * 0.4), s);
        g.position.set(side * (6.2 + rnd() * 3.5), 0, z + rnd() * 1.5);
        this.scene.add(g); this.props.push(g);
      }
    }
    // mezar taşları (sarıklı başlıklı)
    const slab = new THREE.BoxGeometry(0.32, 1.0, 0.1).translate(0, 0.5, 0);
    const turbanTop = new THREE.SphereGeometry(0.2, 12, 8).scale(1, 0.7, 1).translate(0, 1.08, 0);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(slab, rnd() < 0.5 ? stone : stoneDark));
      if (rnd() < 0.7) g.add(new THREE.Mesh(turbanTop, stone));
      const side = rnd() < 0.5 ? -1 : 1;
      g.position.set(side * (5.2 + rnd() * 6), 0, lerp(this.propSpan[0], this.propSpan[1], rnd()));
      g.rotation.set((rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.15);
      g.scale.setScalar(0.8 + rnd() * 0.5);
      this.scene.add(g); this.props.push(g);
    }
    // yol kenarında alçak taş duvar
    const wallG = new THREE.BoxGeometry(0.45, 0.55, 3.0).translate(0, 0.27, 0);
    for (let z = this.propSpan[0]; z < this.propSpan[1]; z += 3.4) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.3) continue;
        const w = new THREE.Mesh(wallG, rnd() < 0.5 ? stone : stoneDark);
        w.position.set(side * 4.9, 0, z); w.rotation.y = (rnd() - 0.5) * 0.05; w.scale.y = 0.8 + rnd() * 0.4;
        this.scene.add(w); this.props.push(w);
      }
    }
  }

  // ---------------------------------------------------------------- tabut
  buildCoffin() {
    const g = new THREE.Group();
    const wood = mat('#5a3a22', { roughness: 0.7 }), woodDark = mat('#3e2716', { roughness: 0.75 });
    for (const s of [-1, 1]) { // sırıklar
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 4.0), woodDark);
      p.position.set(s * LAYOUT.poleX, 0, 0); g.add(p);
    }
    for (const z of [-0.95, 0.95]) { const cb = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.06, 0.08), woodDark); cb.position.set(0, 0.06, z); g.add(cb); }
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.34, 2.0), wood); box.position.y = 0.26; g.add(box);
    // örtü: yeşil kumaş, beşik çatı biçiminde, kenarlardan sarkar
    const cloth = clothTexture();
    const clothM = new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.9, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 2.1, 3, 1, false), clothM);
    roof.rotation.set(Math.PI / 2, 0, 0); roof.rotation.z = Math.PI; roof.scale.set(1, 1, 0.5);
    roof.rotation.order = 'ZXY';
    roof.position.y = 0.47; g.add(roof);
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.3, 2.12), clothM); drape.position.y = 0.3; g.add(drape);
    // şehzadenin sarığı ve sorgucu (baş tarafta)
    const turban = new THREE.Group();
    turban.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14).scale(1, 0.75, 1), mat('#f6f1e6', { roughness: 0.8 })));
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 10, 28), mat('#efe8da', { roughness: 0.8 })); wrap.rotation.x = Math.PI / 2; turban.add(wrap);
    const kavuk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat('#8e1b22', { roughness: 0.6 })); kavuk.position.y = 0.12; turban.add(kavuk);
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#2bd1a0', { metalness: 0.4, roughness: 0.2, emissive: 0x0b5a40 })); jewel.position.set(0, 0.05, 0.19); turban.add(jewel);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 8).translate(0, 0.16, 0), mat('#f4f1ea')); plume.position.set(0, 0.07, 0.17); plume.rotation.x = -0.35; turban.add(plume);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.08, 8), mat('#d9b25a', { metalness: 0.7, roughness: 0.3 })); pin.position.set(0, 0.06, 0.18); turban.add(pin);
    turban.position.set(0, 0.62, 0.72); turban.rotation.x = -0.25;
    g.add(turban);
    this.coffin = g;
    this.scene.add(g);
  }

  // ---------------------------------------------------------------- sancaklar
  buildFlags() {
    this.flags = [flagTexture('#a3161d', true), flagTexture('#14613a')].map((tex) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 3.3, 8).translate(0, 1.65, 0), mat('#4a2e1a', { roughness: 0.6 }));
      const alem = new THREE.Group(); // tepede altın alem (hilal)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat('#d9b25a', { metalness: 0.75, roughness: 0.3 }));
      const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20, Math.PI * 1.35), mat('#d9b25a', { metalness: 0.75, roughness: 0.3 }));
      crescent.position.y = 0.15; crescent.rotation.z = Math.PI * 0.82;
      alem.add(ball, crescent);
      const geo = new THREE.PlaneGeometry(1.15, 0.78, 16, 8).translate(0.575, -0.39, 0);
      const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
      flag.frustumCulled = false;
      const base = geo.attributes.position.array.slice();
      this.scene.add(pole, alem, flag);
      return { pole, alem, flag, base };
    });
  }

  // ---------------------------------------------------------------- şehzadenin portresi (altın çerçeve, köşesinde siyah yas kurdelesi)
  buildPortraits() {
    const PW = 0.46, PH = 0.57;
    const c = document.createElement('canvas'); c.width = 620; c.height = 768;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const paint = (img) => {
      const w = c.width, h = c.height;
      g.fillStyle = '#2a1a10'; g.fillRect(0, 0, w, h);
      if (img) { // resmi taşırmadan, ortalayarak kırp
        const s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
        g.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
      }
      g.strokeStyle = 'rgba(30,18,8,.85)'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
      g.strokeStyle = '#e0bf6a'; g.lineWidth = 4; g.strokeRect(18, 18, w - 36, h - 36);
      g.fillStyle = '#0b0908'; // sağ üst köşede yas kurdelesi
      g.beginPath(); g.moveTo(w - 190, 0); g.lineTo(w - 120, 0); g.lineTo(w, 120); g.lineTo(w, 190); g.closePath(); g.fill();
      tex.needsUpdate = true;
    };
    paint(null);
    const img = new Image();
    img.onload = () => paint(img);
    img.onerror = () => console.warn('Portre resmi yüklenemedi:', C.portrait);
    img.src = C.portrait || 'resimler/images.jfif';
    const gold = mat('#c99a3a', { metalness: 0.65, roughness: 0.35 });
    const frameGeo = new THREE.BoxGeometry(PW + 0.08, PH + 0.08, 0.035);
    const picGeo = new THREE.PlaneGeometry(PW, PH);
    const picMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
    this.portraits = Array.from({ length: C.portraitBearers || 1 }, () => {
      const grp = new THREE.Group();
      const fr = new THREE.Mesh(frameGeo, gold); fr.position.z = -0.02;
      const pic = new THREE.Mesh(picGeo, picMat);
      grp.add(fr, pic);
      grp.traverse((o) => { o.frustumCulled = false; });
      this.scene.add(grp);
      return grp;
    });
    this.portraitSize = { w: PW + 0.08, h: PH + 0.08 };
  }

  // ---------------------------------------------------------------- kamera
  setupCamera() {
    const cam = this.camera = new THREE.PerspectiveCamera(C.camera.fov, this.W / this.H, 0.1, 400);
    this.viewShift = 150; // görüntüyü aşağı kaydır (üstte başlık kartı var)
    cam.setViewOffset(this.W, this.H, 0, -this.viewShift, this.W, this.H);
    this.cam = { pos: V(0, 20, 20), target: V(0, 0, -3), fov: C.camera.fov };
    this.wide = { pos: V(0, 20, 20), target: V(0, 0, -3), key: '' };
    this.shot = { kind: 'wide', t: 0, dur: Infinity, prio: -1 };
    this.shotQueue = [];
    this.joinQueue = [];
    this.wideT = 0; this.autoT = 0; this.nextAuto = this.randAuto();
    this.fitCam = new THREE.PerspectiveCamera(C.camera.fov, this.W / this.H, 0.1, 400);
    this.fitCam.setViewOffset(this.W, this.H, 0, -this.viewShift, this.W, this.H);
  }
  randAuto() { const [a, b] = C.camera.autoShotEvery || [10, 16]; return a + Math.random() * (b - a); }

  // Geniş açı: alayın tamamını (bayraklardan son safa) ekrana sığdıran en yakın konum
  fitWide(rows) {
    const key = `${rows}`;
    if (this.wide.key === key) return;
    this.wide.key = key;
    const zFront = Math.max(LAYOUT.flagZ, LAYOUT.portreZ) + 0.9, zBack = LAYOUT.crowdZ - Math.max(0, rows - 1) * C.rowSpacing - 0.6;
    const halfW = Math.max((C.rowWidth - 1) / 2 * C.colSpacing + 0.4, LAYOUT.flagX + 0.5);
    const pts = [V(-LAYOUT.flagX - 0.4, 0, zFront), V(LAYOUT.flagX + 0.4, 0, zFront), V(-LAYOUT.flagX - 0.5, 3.3, LAYOUT.flagZ - 0.4), V(LAYOUT.flagX + 0.5, 3.3, LAYOUT.flagZ - 0.4),
      V(-halfW, 1.9, zBack), V(halfW, 1.9, zBack), V(0, 2.5, zBack), V(-0.5, 2.1, LAYOUT.portreZ), V(0.5, 2.1, LAYOUT.portreZ)];
    const pitch = THREE.MathUtils.degToRad(C.camera.pitch);
    const dir = V(0, Math.sin(pitch), Math.cos(pitch));
    const cam = this.fitCam, top = C.camera.topLimit, bottom = C.camera.bottomLimit;
    // her hedef konumu için sığan en yakın mesafeyi bul, en yakın olanı seç
    const measure = (target, d) => {
      cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld();
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const p of pts) { const s = p.clone().project(cam); if (s.z < -1 || s.z > 1) return false; const y = (1 - s.y) / 2 * this.H, x = (s.x + 1) / 2 * this.W; minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      return minY >= top && maxY <= bottom && minX >= 20 && maxX <= this.W - 20;
    };
    cam.updateProjectionMatrix();
    let best = null;
    for (let tz = zBack - 2; tz <= zFront + 2; tz += 0.25) {
      const target = V(0, 0.8, tz);
      let lo = 2, hi = 120;
      if (!measure(target, hi)) continue;
      for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (measure(target, mid)) hi = mid; else lo = mid; }
      if (!best || hi < best.d) best = { d: hi, target };
    }
    if (!best) best = { d: 30, target: V(0, 0.8, (zFront + zBack) / 2) };
    best.pos = best.target.clone().addScaledVector(dir, best.d);
    this.wide.pos.copy(best.pos); this.wide.target.copy(best.target);
  }

  // kind: wide | mourner (id) | portre (slot) | omuz (slot) | sancak (slot) | tabut | dua
  focus(kind, arg = null, dur = 4, prio = 1) {
    if (C.camera.director === false && prio < 4 && kind !== 'mourner') return false;
    const shot = { kind, arg, dur, prio, t: 0 };
    const cur = this.shot;
    if (cur.kind !== 'wide' && cur.prio > prio) {
      if (this.shotQueue.length < 3) this.shotQueue.push(shot);
      return false;
    }
    this.shot = shot;
    return true;
  }
  // Saflara yeni girene yakın çekim: sıraya alınır, rol çekimleri her zaman önce gelir
  queueJoin(id) {
    if (!(C.camera.joinShotSeconds > 0)) return;
    this.joinQueue.push(id);
    const max = C.camera.joinQueueMax ?? 4;
    while (this.joinQueue.length > max) this.joinQueue.shift();
  }

  posOf(id) { return this.chars.get(id)?.gpos || null; }

  shotPose(shot, k) {
    const t = shot.t;
    switch (shot.kind) {
      case 'wide': {
        const d = V(Math.sin(k.t * 0.13) * 0.35, Math.sin(k.t * 0.17) * 0.15, 0);
        return { pos: this.wide.pos.clone().add(d), target: this.wide.target.clone(), fov: C.camera.fov, rate: 1.6 };
      }
      case 'mourner': {
        const p = this.posOf(shot.arg);
        if (!p) return null;
        // kişinin bulunduğu taraftan, önden-yandan (ön saftakilerde tabut araya girmesin)
        const side = Math.abs(p.x) > 0.2 ? Math.sign(p.x) : (hashOf(shot.arg) % 2 ? 1 : -1);
        const nearCoffin = clamp((p.z + 6) / 3.5, 0, 1); // ön saflara yaklaştıkça daha yandan
        return { pos: p.clone().add(V(side * (0.9 + 1.6 * nearCoffin - t * 0.08), 2.7, 3.0 - 1.2 * nearCoffin - t * 0.12)), target: p.clone().add(V(0, 1.3, 0.15)), fov: 30, rate: 2.8 };
      }
      case 'portre': { // önden, resim ve taşıyanı birlikte
        const p = this.posOf(this.roleIds?.portre[shot.arg ?? 0]) || portraitPlace(shot.arg ?? 0);
        return { pos: p.clone().add(V(Math.sin(t * 0.3) * 0.6, 1.75, 3.0 - t * 0.12)), target: p.clone().add(V(0, 1.3, 0.25)), fov: 34, rate: 2.4 };
      }
      case 'omuz': {
        const p = this.posOf(this.roleIds?.omuz[shot.arg]) || carrierPlace(shot.arg);
        const side = Math.sign(p.x) || 1;
        return { pos: p.clone().add(V(side * (2.3 - t * 0.08), 2.35, 2.7 - t * 0.12)), target: p.clone().add(V(-side * 0.15, 1.4, 0.2)), fov: 32, rate: 2.4 };
      }
      case 'sancak': {
        if (shot.arg == null) { // iki sancaktar birden, alttan, gökyüzüne karşı
          return { pos: V(Math.sin(t * 0.25) * 1.2, 1.6 + t * 0.05, LAYOUT.flagZ + 7.4 - t * 0.12), target: V(0, 2.75, LAYOUT.flagZ - 1.5), fov: 44, rate: 2.2 };
        }
        const p = this.posOf(this.roleIds?.sancak[shot.arg]) || flagPlace(shot.arg);
        const side = Math.sign(p.x) || 1;
        return { pos: p.clone().add(V(side * 1.6, 1.9, 4.4 - t * 0.12)), target: p.clone().add(V(side * 0.35, 2.35, 0)), fov: 40, rate: 2.4 };
      }
      case 'tabut': {
        const a = (shot.seed ?? 0.5) * 2 - 1;
        return { pos: V(a * 2.8 + Math.sin(t * 0.3) * 0.8, 4.2, 5.4 - t * 0.15), target: V(0, 1.4, -0.1), fov: 36, rate: 2.0 };
      }
      case 'dua': {
        const a = -0.8 + t * 0.12;
        return { pos: V(Math.sin(a) * 9, 5.5, -3 + Math.cos(a) * 9), target: V(0, 1.2, -3), fov: 40, rate: 1.4 };
      }
      default: return null;
    }
  }

  tagIdsFor(shot) {
    const idOf = (r, i) => this.roleIds?.[r]?.[i] || `@npc_${r}_${i}`;
    switch (shot.kind) {
      case 'mourner': return [shot.arg];
      case 'portre': return [idOf('portre', shot.arg ?? 0)];
      case 'omuz': return [idOf('omuz', shot.arg)];
      case 'sancak': return shot.arg == null ? [idOf('sancak', 0), idOf('sancak', 1), idOf('portre', 0)] : [idOf('sancak', shot.arg)];
      case 'tabut': return Array.from({ length: C.carriers }, (_, i) => idOf('omuz', i));
      default: return null;
    }
  }

  updateDirector(dt, k) {
    const cam = this.camera;
    this.fitWide(k.rows);
    this.shot.t += dt;
    let want = this.shotPose(this.shot, k);
    if (!want || this.shot.t > this.shot.dur) {
      let next = null;
      while (this.shotQueue.length && !next) { const q = this.shotQueue.shift(); if (this.shotPose(q, k)) next = q; }
      this.shot = next || { kind: 'wide', t: 0, dur: Infinity, prio: -1 };
      if (!next) this.wideT = 0;
      want = this.shotPose(this.shot, k);
    }
    if (this.shot.kind === 'wide') {
      this.wideT += dt; this.autoT += dt;
      const auto = C.camera.director !== false && this.autoT > this.nextAuto;
      if (auto) { // ara sıra taşıyıcılara / sancaktarlara / tabuta yaklaş (öncelikli)
        this.autoT = 0; this.nextAuto = this.randAuto();
        const r = Math.random();
        const filledOmuz = (this.roleIds?.omuz || []).map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
        const filledFlag = (this.roleIds?.sancak || []).map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
        const pickOf = (arr, n) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : Math.floor(Math.random() * n));
        if (r < 0.32) this.focus('omuz', pickOf(filledOmuz, C.carriers), 4.5, 0.8);
        else if (r < 0.55) this.focus('portre', 0, 4.5, 0.8);
        else if (r < 0.78) this.focus('sancak', Math.random() < 0.5 ? null : pickOf(filledFlag, 2), 4.5, 0.8);
        else this.focus('tabut', null, 5, 0.8);
        this.shot.seed = Math.random();
        want = this.shotPose(this.shot, k) || want;
      } else if (this.joinQueue.length && this.wideT >= (C.camera.joinShotGap ?? 0.6)) {
        const id = this.joinQueue.shift();
        if (this.posOf(id)) { this.focus('mourner', id, C.camera.joinShotSeconds, 0.5); want = this.shotPose(this.shot, k) || want; }
      }
    }
    const a = 1 - Math.exp(-dt * (want.rate || 2));
    this.cam.pos.lerp(want.pos, a); this.cam.target.lerp(want.target, a); this.cam.fov += (want.fov - this.cam.fov) * a;
    cam.position.copy(this.cam.pos);
    cam.lookAt(this.cam.target);
    if (Math.abs(cam.fov - this.cam.fov) > 0.01) { cam.fov = this.cam.fov; cam.updateProjectionMatrix(); }
    if (this.sky) for (const m of this.sky) m.position.set(cam.position.x, 0, cam.position.z);
    // yakınlık: geniş açıya göre ne kadar yakındayız (arayüz için)
    this.closeness = clamp(1 - this.cam.pos.distanceTo(this.cam.target) / Math.max(1, this.wide.pos.distanceTo(this.wide.target)), 0, 1);
    // yakın çekimde hangi isimler görünsün (null = hepsi). Geniş açıya dönerken kamera uzaklaşana kadar eskisi kalır.
    const ids = this.tagIdsFor(this.shot);
    if (ids) this.tagFocus = new Set(ids);
    else if (this.shot.kind !== 'wide' || this.closeness < 0.12) this.tagFocus = null;
  }

  // ---------------------------------------------------------------- modeller
  async load() {
    const results = await Promise.allSettled(C.models.map(loadTemplate));
    this.templates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    this.loadErrors = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message || String(r.reason));
    if (!this.templates.length) throw new Error(this.loadErrors.join('; ') || 'Model yok');
    // kamerayı doğrudan geniş açıya koy
    this.fitWide(1); this.cam.pos.copy(this.wide.pos); this.cam.target.copy(this.wide.target);
    return this;
  }

  templateFor(gender) {
    return this.templates.find((t) => t.def.gender === gender) || this.templates.find((t) => t.def.gender === 'male') || this.templates[0];
  }

  // people: [{ id, mode: mourner|omuz|sancak, slot, gender, rich, hands?, enter, leaving, npc }]
  update(dt, k) {
    this.dt = dt;
    if (!this.templates.length) return;
    const stepsPerSec = (C.stepsPerMinute || 76) / 60;
    const speed = stepsPerSec * C.strideLength;
    // dünya geriye akar (alay ileri, kameraya doğru yürür)
    this.scroll += speed * dt;
    this.roadT.offset.y = -(this.scroll / 192) * this.roadT.repeat.y;
    this.grassT.offset.y = -(this.scroll / this.grassL) * this.grassT.repeat.y;
    const [z0, z1] = this.propSpan, span = z1 - z0;
    for (const p of this.props) { p.position.z -= speed * dt; if (p.position.z < z0) p.position.z += span; }

    // karakterleri eşitle
    const alive = new Set();
    for (const d of k.people) {
      alive.add(d.id);
      const tpl = this.templateFor(d.gender);
      const look = lookFor(d.id, { gender: d.gender, role: d.mode, rich: d.rich });
      const lookKey = JSON.stringify(look);
      let e = this.chars.get(d.id);
      if (e && e.ch.tpl !== tpl) { // kadın/erkek değişti
        this.scene.remove(e.ch.root); e.costume.dispose();
        const ch = new Character(tpl); this.scene.add(ch.root);
        e.ch = ch; e.costume = new Costume(ch, look, this.scene); e.key = lookKey;
      }
      if (!e) {
        const ch = new Character(tpl); this.scene.add(ch.root);
        e = { ch, costume: new Costume(ch, look, this.scene), key: lookKey, h: hashOf(d.id), gpos: null };
        this.chars.set(d.id, e);
      }
      if (e.key !== lookKey) { e.costume.dispose(); e.costume = new Costume(e.ch, look, this.scene); e.key = lookKey; }
      e.d = d;
    }
    for (const [id, e] of this.chars) if (!alive.has(id)) { this.scene.remove(e.ch.root); e.costume.dispose(); this.chars.delete(id); }

    // sırık yüksekliği: taşıyıcıların omuz hizası
    const maleT = this.templateFor('male');
    const shoulder = (this.poleShoulder ||= new Character(maleT).m.shoulderY);
    const bob = 0.018 * Math.sin(Math.PI * frac(k.step));
    const poleY = shoulder + 0.08 + bob;
    this.coffin.position.set(0, poleY, 0);
    this.coffin.rotation.z = 0.01 * Math.sin(Math.PI * k.step / 2);

    this.roleIds = { portre: Array(C.portraitBearers || 1).fill(null), omuz: Array(C.carriers).fill(null), sancak: Array(2).fill(null) };
    for (const d of k.people) if (!d.npc && d.mode !== 'mourner') this.roleIds[d.mode][d.slot] = d.id;

    let flagIdx = 0;
    for (const [id, e] of this.chars) {
      const d = e.d, ch = e.ch;
      // hedef konum
      let target;
      if (d.mode === 'omuz') target = carrierPlace(d.slot);
      else if (d.mode === 'sancak') target = flagPlace(d.slot);
      else if (d.mode === 'portre') target = portraitPlace(d.slot);
      else target = mournerPlace(d.slot);
      if (!e.gpos) e.gpos = d.spawnBehind ? target.clone().add(V(0, 0, -2.2)) : target.clone();
      const moveRate = d.mode === 'mourner' ? 2.2 : 2.6;
      e.gpos.lerp(target, 1 - Math.exp(-dt * moveRate));
      const scale = d.leaving ? Math.max(0.001, 1 - d.leaving / 0.7) : easeOutBack(clamp((d.enter ?? 1) / 0.6, 0, 1));
      ch.root.scale.setScalar(Math.max(0.001, scale));
      const place = { pos: e.gpos.clone(), yaw: 0 };
      const handsMode = ['clasp', 'clasp', 'swing', 'chest'][e.h % 4];
      const P = walkPose(ch.m, { step: k.step + (d.mode === 'mourner' ? ((e.h % 13) / 13) * 0.6 : 0), stride: C.strideLength, mode: d.mode, hands: handsMode, dua: k.dua, t: k.t, h: e.h % 100, side: Math.sign(target.x) || 1 });
      const hands = {};
      if (d.mode === 'omuz') {
        const side = Math.sign(target.x); // -1: tabutun solunda, iç el sol el
        const grip = V(side * LAYOUT.poleX, poleY + 0.04, e.gpos.z + 0.12);
        if (side < 0) { hands.L = grip; P.elbowL = [0.15, -1, 0.5]; } else { hands.R = grip; P.elbowR = [-0.15, -1, 0.5]; }
        P.rootY *= 0.6;
      } else if (d.mode === 'portre') {
        const fr = this.portraits[d.slot] || this.portraits[0];
        ch.groundQ = new THREE.Quaternion();
        ch.ground = new THREE.Matrix4().compose(place.pos, ch.groundQ, V(1, 1, 1));
        const s = scale, sw = Math.sin(k.t * 1.6 + d.slot);
        const cy = (ch.m.shoulderY - 0.25 + P.rootY * 0.7) * s, fz = 0.34 * s, half = this.portraitSize.w / 2 * s;
        fr.position.copy(ch.local(0, cy, fz));
        fr.rotation.set(-0.12, 0.02 * sw, 0.015 * sw);
        fr.scale.setScalar(s);
        // eller çerçevenin iki yanında, ortanın biraz altında
        const side = V(Math.cos(0.02 * sw), 0, -Math.sin(0.02 * sw));
        hands.L = fr.position.clone().addScaledVector(side, half + 0.01).add(V(0, -0.07 * s, -0.035 * s));
        hands.R = fr.position.clone().addScaledVector(side, -half - 0.01).add(V(0, -0.07 * s, -0.035 * s));
      } else if (d.mode === 'sancak') {
        const fl = this.flags[d.slot] || this.flags[flagIdx++ % 2];
        const side = Math.sign(target.x) || 1;
        // sancağı iki yana sallar
        // direk hep dışa yatık kalır (yüzün önünden geçmesin), dışa doğru sallanır
        const ang = side * (0.12 + 0.14 * Math.sin(k.t * 1.1 + d.slot * 1.7));
        const dir = V(Math.sin(ang), Math.cos(ang), 0.2).normalize();
        ch.groundQ = new THREE.Quaternion().setFromAxisAngle(UP, 0);
        ch.ground = new THREE.Matrix4().compose(place.pos, ch.groundQ, V(1, 1, 1));
        const baseP = ch.local(side * 0.12, ch.m.hipY + 0.08, 0.3);
        hands.R = baseP.clone().addScaledVector(dir, 0.05);
        hands.L = baseP.clone().addScaledVector(dir, 0.48);
        P.elbowL = [0.7, -0.6, -0.2]; P.elbowR = [-0.7, -0.6, -0.2];
        const s = scale;
        fl.pole.position.copy(baseP).addScaledVector(dir, -0.35 * s);
        fl.pole.quaternion.setFromUnitVectors(UP, dir); fl.pole.scale.setScalar(s);
        const topP = fl.pole.position.clone().addScaledVector(dir, 3.3 * s);
        fl.alem.position.copy(topP); fl.alem.quaternion.copy(fl.pole.quaternion); fl.alem.scale.setScalar(s);
        // bayrak bezi: direğin tepesinden dışa ve geriye doğru dalgalanır
        const out = V(-side * 0.45, 0, -0.9).normalize(); // geriye ve hafif içe dalgalanır
        const xAxis = out.clone().addScaledVector(dir, -out.dot(dir)).normalize();
        const zAxis = V().crossVectors(xAxis, dir).normalize();
        const m4 = new THREE.Matrix4().makeBasis(xAxis, dir, zAxis);
        fl.flag.quaternion.setFromRotationMatrix(m4);
        fl.flag.position.copy(topP).addScaledVector(dir, -0.08 * s);
        fl.flag.scale.setScalar(s);
        const pos = fl.flag.geometry.attributes.position, base = fl.base;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1];
          pos.setZ(i, Math.sin(x * 5.5 - k.t * 6.5 + y * 1.5) * 0.09 * (x / 1.15) + Math.sin(x * 2.3 - k.t * 3) * 0.05 * x);
          pos.setY(i, y - x * x * 0.06);
        }
        pos.needsUpdate = true;
        fl.used = true;
      }
      ch.apply(P, place, hands);
      e.costume.update(ch.root.scale.x);
      const ring = d.mode === 'omuz' ? '#d9b25a' : d.mode === 'sancak' ? '#ff5a4d' : d.rich ? '#ffd34d' : null;
      ch.aura.material.color.set(ring || '#ffffff');
      ch.aura.material.opacity = d.npc || !ring ? 0 : (d.mode === 'mourner' ? 0.12 : 0.22) + 0.08 * Math.sin(k.t * 3 + e.h);
    }

    this.updateDirector(dt, k);

    // ekrandaki baş noktaları (isim/avatar için)
    this.anchors.clear();
    this.camera.updateMatrixWorld();
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    for (const [id, e] of this.chars) {
      const ch = e.ch;
      const head = ch.b.HeadTop_End ? ch.worldOf('HeadTop_End') : ch.worldOf('Head').add(V(0, 0.15, 0));
      head.y += (e.d.mode === 'mourner' || e.d.gender === 'female' ? 0.16 : 0.34) * ch.root.scale.y; // sarık / üsküf payı
      const depth = -head.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
      if (depth < 0.5) continue;
      const p = head.clone().project(this.camera);
      this.anchors.set(id, { x: (p.x + 1) / 2 * this.W, y: (1 - p.y) / 2 * this.H, depth, ppm: this.H / (2 * tanHalf * depth), scale: ch.root.scale.x, world: head });
    }
    const coffinTop = V(0, this.coffin.position.y + 0.9, 0.7).project(this.camera);
    this.anchors.set('@tabut', { x: (coffinTop.x + 1) / 2 * this.W, y: (1 - coffinTop.y) / 2 * this.H });
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; }
