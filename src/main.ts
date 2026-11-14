import './style.css';
import {
  STAGES, STORY_INTRO, WEAPONS, MAX_LEVEL, bestWeapon, bestArmor, ARMORS, HELMETS, SUBS, CHARMS, SKINS, HAIRS, PLUMES, TRIMS, CAPES, CAPE_NAMES, BOOTS, COLOR_NAMES,
  expForLevel, maxHpFor, atkFor, defFor, type StageDef, type MonsterDef,
} from './data';
import { randomQuestion } from './questions';
import {
  heroFrame, npcSprite, monsterSprite, groundTile, pathTile, obstacleSprite, decorSprite, drawShadow, flashed, tinted, waterTile, chestSprite,
  type Sprite, type DecorKind, type Dir,
} from './sprites';
import { sfx, setMusic, unlockAudio, isMuted, setMuted } from './audio';
import {
  $, esc, toast, panel, panelOpen, closeAllPanels, closeTopPanel, dialog, confirmBox, askQuestion,
  updateHud, loadSave, writeSave, freshSave, wipeSave, type Save,
} from './ui';

// ================================================================== setup
const canvas = $('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let W = 0, H = 0, DPR = 1, Z = 4;
let vignette: HTMLCanvasElement | null = null;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.floor(window.innerWidth * DPR); H = Math.floor(window.innerHeight * DPR);
  canvas.width = W; canvas.height = H;
  Z = Math.max(2, Math.round(Math.min(W, H) / 150));
  vignette = document.createElement('canvas'); vignette.width = 256; vignette.height = 256;
  const v = vignette.getContext('2d')!;
  const g = v.createRadialGradient(128, 128, 60, 128, 128, 182);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
  v.fillStyle = g; v.fillRect(0, 0, 256, 256);
}
window.addEventListener('resize', resize);
resize();

const TS = 16;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
function seeded(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

// per-stage mood
const AMBIENT = ['#fff6e0', '#d8ead2', '#f4e8d0', '#b8b8d0', '#bcd4c0', '#ffe8b4', '#ffe2b0', '#f6ecdc', '#c8e0c4', '#a89cdc'];
const DECOR: DecorKind[][] = [
  ['flower', 'tuft', 'mush'], ['mush', 'tuft', 'flower'], ['pebble', 'bone', 'tuft'], ['pebble', 'shard'], ['mush', 'tuft', 'bone'],
  ['bone', 'pebble', 'tuft'], ['pebble', 'bone', 'tuft'], ['pebble', 'bone'], ['tuft', 'pebble', 'flower'], ['shard', 'pebble'],
];
const WEATHER = [
  { c: '#fff7b0', s: 1, vy: 3, vx: 4, g: true }, { c: '#b8e8a0', s: 1.4, vy: 6, vx: -5, g: false }, { c: '#e8d8b0', s: 1, vy: -2, vx: 10, g: false },
  { c: '#b0c8ff', s: 1, vy: -3, vx: 2, g: true }, { c: '#d0ff90', s: 1.2, vy: -2, vx: 3, g: true }, { c: '#f4d490', s: 1, vy: 1, vx: 26, g: false },
  { c: '#f0c880', s: 1, vy: 1, vx: 22, g: false }, { c: '#e8e0d0', s: 1, vy: -1, vx: 6, g: false }, { c: '#ffe890', s: 1.2, vy: -2, vx: 3, g: true },
  { c: '#e070ff', s: 1.3, vy: -10, vx: 3, g: true },
];

// ================================================================== state
let save: Save = loadSave();
type Scene = 'title' | 'map';
let scene: Scene = 'title';
let hp = maxHpFor(save.level);
let inStage = false;
let stage: StageDef = STAGES[0];
let time = 0;

const gw = () => WEAPONS[clamp(save.gear.weapon, 0, WEAPONS.length - 1)];
const ga = () => ARMORS[clamp(save.gear.armor, 0, ARMORS.length - 1)];
const stats = () => ({
  maxHp: Math.round(maxHpFor(save.level) * (save.gear.charm === 2 ? 1.18 : 1)),
  atk: atkFor(save.level) + gw().atk,
  def: defFor(save.level) + ga().def,
});
const need = () => expForLevel(save.level);
const weaponIdx = () => clamp(save.gear.weapon, 0, WEAPONS.length - 1);
const armorTier = () => clamp(save.gear.armor, 0, ARMORS.length - 1);
const critChance = () => 0.15 + (save.gear.charm === 1 ? 0.15 : 0);
const spMul = () => (save.gear.charm === 3 ? 1.6 : 1);
// old saves without a prep step: equip the best unlocked gear
if (!save.prepped && save.level > 1) { save.gear.weapon = WEAPONS.indexOf(bestWeapon(save.level + 0)); save.gear.armor = ARMORS.indexOf(bestArmor(save.level + 0)); }

let sp = 0; // wisdom charge 0..100
function refreshHud() {
  updateHud(save.level, hp, stats().maxHp, save.level >= MAX_LEVEL ? need() : save.exp, need(), save.gold, scene === 'title' ? '' : `${stage.name}  •  มอนสเตอร์ LV ${stage.rec}-${stage.rec + 2}`);
  ($('hud-sp') as HTMLElement).style.width = `${sp}%`;
  $('sp-bar').classList.toggle('full', sp >= 100);
  ['btn-s1', 'btn-s2', 'btn-s3'].forEach((id, i) => { const b = $(id); b.title = SKILL_NAMES[weaponIdx()][i]; b.style.borderColor = gw().glow; });
  ($('btn-skill') as HTMLButtonElement).disabled = sp < 100;
}

// ================================================================== input
const keys = new Set<string>();
const flags = { act: false, atk: false, dodge: false, skill: false, s1: false, s2: false, s3: false };
const held = { atk: false };
const stick = { x: 0, y: 0 };

window.addEventListener('keydown', e => {
  unlockAudio();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  const k = e.key.toLowerCase();
  if (!e.repeat) {
    keys.add(k);
    if (k === 'e' || k === 'enter') flags.act = true;
    if (k === ' ' || k === 'j' || k === 'z') flags.atk = true;
    if (k === 'k' || k === 'x' || k === 'shift') flags.dodge = true;
    if (k === 'q' || k === 'l' || k === 'c') flags.skill = true;
    if (k === '1' || k === 'u') flags.s1 = true;
    if (k === '2' || k === 'i') flags.s2 = true;
    if (k === '3' || k === 'o') flags.s3 = true;
    if (k === 'm') toggleMute();
    if (k === 'escape') { if (panelOpen()) closeTopPanel(); else if (scene === 'map') openMenu(); }
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); held.atk = false; });

const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (!touchCapable) $('stick').classList.add('hidden');

(function setupStick() {
  const el = $('stick'), knob = $('knob');
  let id = -1; const R = 46;
  const set = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.hypot(dx, dy) / R;
    stick.x = m < 0.18 ? 0 : dx / R; stick.y = m < 0.18 ? 0 : dy / R;
  };
  el.addEventListener('pointerdown', e => { unlockAudio(); id = e.pointerId; el.setPointerCapture(id); set(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; stick.x = stick.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
})();

function bindBtn(id: string, flag: keyof typeof flags, hold = false) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); unlockAudio(); flags[flag] = true; if (hold) { held.atk = true; b.setPointerCapture(e.pointerId); } });
  if (hold) { const up = () => { held.atk = false; }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); }
}
bindBtn('btn-s1', 's1'); bindBtn('btn-s2', 's2'); bindBtn('btn-s3', 's3'); bindBtn('btn-act', 'act'); bindBtn('btn-atk', 'atk', true); bindBtn('btn-dodge', 'dodge'); bindBtn('btn-skill', 'skill');

function toggleMute() { setMuted(!isMuted()); $('btn-mute').classList.toggle('off', isMuted()); if (!isMuted()) sfx('click'); }
$('btn-mute').classList.toggle('off', isMuted());
$('btn-mute').addEventListener('click', () => { unlockAudio(); toggleMute(); });
$('btn-home').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene === 'map' && !panelOpen()) void goHome(); });
$('btn-menu').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene === 'map' && !panelOpen()) openMenu(); });

// ================================================================== map
interface Obst { x: number; y: number; spr: Sprite; sway: number; ph: number; }
interface GameMap {
  w: number; h: number; solid: Uint8Array; water: Uint8Array; reach: Uint8Array; img: HTMLCanvasElement; obst: Obst[]; waters: { x: number; y: number; ph: number }[];
  start: { x: number; y: number }; boss: { x: number; y: number }; path: { x: number; y: number }[]; spots: { x: number; y: number }[]; mm: HTMLCanvasElement;
}
const WATER_COL = ['#3f7ab0', '#3a7a8a', '#4a7a98', '#2a4a6a', '#3a6a5a', '#2f8ab0', '#3a86a8', '#4a80a8', '#3a6a60', '#6a3ab0'];
const ENEMY_MAX = 18;

function hexShift(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => clamp(v + amt, 0, 255).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
function valueNoise(w: number, h: number, scale: number, seed: number) {
  const r = seeded(seed), gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = r();
  return (x: number, y: number) => {
    const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

function genMap(st: StageDef): GameMap {
  const w = 72, h = 54;
  const r = seeded(st.id * 7919 + 13);
  const n1 = valueNoise(w, h, 7, st.id * 11 + 1), n2 = valueNoise(w, h, 10, st.id * 11 + 2), n3 = valueNoise(w, h, 4, st.id * 11 + 3);
  const solid = new Uint8Array(w * h), water = new Uint8Array(w * h), path = new Uint8Array(w * h);
  const wthr = st.id === 6 ? 0.8 : 0.7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { solid[i] = 1; continue; }
    if (n2(x, y) > wthr) water[i] = 1;
    else if (n1(x, y) > 0.6 && r() < 0.62) solid[i] = 1;
    else if (r() < 0.035) solid[i] = 1;
  }
  const carve = (cx: number, cy: number, rad: number, mark = true) => {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x > w - 2 || y > h - 2) continue;
      const i = y * w + x; solid[i] = 0; water[i] = 0; if (mark) path[i] = 1;
    }
  };
  const walk = (a: { x: number; y: number }, b: { x: number; y: number }, rad: number) => {
    const out: { x: number; y: number }[] = []; let x = a.x, y = a.y, guard = 0;
    while ((x !== b.x || y !== b.y) && guard++ < 600) {
      carve(x, y, rad); out.push({ x, y });
      const dx = Math.sign(b.x - x), dy = Math.sign(b.y - y);
      if (r() < 0.12) { const jx = r() < 0.5 ? 1 : -1, jy = r() < 0.5 ? 1 : -1; if (dy !== 0 && x + jx > 2 && x + jx < w - 3) { x += jx; continue; } if (dx !== 0 && y + jy > 2 && y + jy < h - 3) { y += jy; continue; } }
      if (dx !== 0 && (dy === 0 || r() < 0.55)) x += dx; else if (dy !== 0) y += dy;
    }
    return out;
  };
  const s = { x: 5, y: h - 6 }, b = { x: w - 8, y: 9 };
  const rnd = (a: number, c: number) => a + Math.floor(r() * (c - a));
  const wps = [s, { x: Math.round(w * 0.27), y: rnd(10, h - 10) }, { x: Math.round(w * 0.5), y: rnd(10, h - 10) }, { x: Math.round(w * 0.74), y: rnd(10, h - 10) }, b];
  const trail: { x: number; y: number }[] = [];
  for (let i = 0; i < wps.length - 1; i++) trail.push(...walk(wps[i], wps[i + 1], 1));
  // side clearings (camp + treasure)
  const spots: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 200 && spots.length < 4; tries++) {
    const c = { x: rnd(12, w - 12), y: rnd(10, h - 10) };
    if (Math.hypot(c.x - s.x, c.y - s.y) < 16 || Math.hypot(c.x - b.x, c.y - b.y) < 16) continue;
    if (spots.some(o => Math.hypot(o.x - c.x, o.y - c.y) < 16)) continue;
    let near = trail[0], bd = 1e9;
    for (const t of trail) { const d = Math.hypot(t.x - c.x, t.y - c.y); if (d < bd) { bd = d; near = t; } }
    if (bd < 6 || bd > 22) continue;
    walk(near, c, 1); carve(c.x, c.y, 3, false); spots.push(c);
  }
  carve(s.x, s.y, 2); carve(b.x, b.y, 4);
  for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) solid[(b.y + dy) * w + (b.x + dx)] = 1;

  const reach = new Uint8Array(w * h);
  const q = [s.y * w + s.x]; reach[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!; const cx = c % w, cy = (c / w) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (solid[i] || water[i] || reach[i]) continue;
      reach[i] = 1; q.push(i);
    }
  }

  // ---- pre-render floor
  const img = document.createElement('canvas'); img.width = w * TS; img.height = h * TS;
  const g = img.getContext('2d')!; g.imageSmoothingEnabled = false;
  const grounds = [-9, 0, 9].map((sh, t) => [0, 1, 2, 3, 4, 5].map(i => groundTile(hexShift(st.theme.g1, sh), hexShift(st.theme.g2, sh), st.id * 31 + i + t * 7)));
  const paths = [0, 1, 2, 3].map(i => pathTile(st.theme.path, st.id * 17 + i));
  const waters = [0, 1, 2].map(i => waterTile(WATER_COL[st.id - 1], st.id * 13 + i));
  const waterList: { x: number; y: number; ph: number }[] = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx, v = (tx * 7 + ty * 13);
    if (water[i]) { g.drawImage(waters[v % 3], tx * TS, ty * TS); waterList.push({ x: tx * TS, y: ty * TS, ph: (tx * 3 + ty) * 0.9 }); continue; }
    const nv = n3(tx, ty), tint = nv < 0.36 ? 0 : nv < 0.64 ? 1 : 2;
    g.drawImage(path[i] ? paths[v & 3] : grounds[tint][v % 6], tx * TS, ty * TS);
  }
  const isW = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && water[y * w + x] === 1;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx;
    if (water[i]) {
      g.fillStyle = 'rgba(255,255,255,.3)';
      if (!isW(tx - 1, ty)) g.fillRect(tx * TS, ty * TS, 1, TS);
      if (!isW(tx + 1, ty)) g.fillRect(tx * TS + 15, ty * TS, 1, TS);
      if (!isW(tx, ty - 1)) g.fillRect(tx * TS, ty * TS, TS, 1);
      if (!isW(tx, ty + 1)) g.fillRect(tx * TS, ty * TS + 15, TS, 1);
    } else {
      g.fillStyle = 'rgba(236,226,176,.42)';
      if (isW(tx - 1, ty)) g.fillRect(tx * TS, ty * TS, 2, TS);
      if (isW(tx + 1, ty)) g.fillRect(tx * TS + 14, ty * TS, 2, TS);
      if (isW(tx, ty - 1)) g.fillRect(tx * TS, ty * TS, TS, 2);
      if (isW(tx, ty + 1)) g.fillRect(tx * TS, ty * TS + 14, TS, 2);
    }
  }
  g.fillStyle = 'rgba(0,0,0,.2)';
  for (let ty = 1; ty < h - 1; ty++) for (let tx = 1; tx < w - 1; tx++) {
    if (!path[ty * w + tx]) continue;
    if (!path[ty * w + tx - 1]) g.fillRect(tx * TS, ty * TS, 1, TS);
    if (!path[ty * w + tx + 1]) g.fillRect(tx * TS + TS - 1, ty * TS, 1, TS);
    if (!path[(ty - 1) * w + tx]) g.fillRect(tx * TS, ty * TS, TS, 1);
    if (!path[(ty + 1) * w + tx]) g.fillRect(tx * TS, ty * TS + TS - 1, TS, 1);
  }
  const decs = DECOR[st.id - 1].map((k, i) => [0, 1, 2].map(n => decorSprite(k, st.theme.g1, st.id * 53 + i * 7 + n)));
  for (let ty = 1; ty < h - 1; ty++) for (let tx = 1; tx < w - 1; tx++) {
    const i = ty * w + tx;
    if (solid[i] || water[i] || path[i] || r() > 0.36) continue;
    const set = decs[Math.floor(r() * decs.length)];
    g.drawImage(set[Math.floor(r() * 3)], tx * TS + Math.floor(r() * 8), ty * TS + Math.floor(r() * 8));
  }
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
  g.beginPath(); g.arc(b.x * TS + 8, b.y * TS + 8, 56, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,230,150,.2)'; g.beginPath(); g.arc(b.x * TS + 8, b.y * TS + 8, 50, 0, Math.PI * 2); g.stroke();
  for (const c of spots) { g.strokeStyle = 'rgba(255,230,150,.16)'; g.beginPath(); g.arc(c.x * TS + 8, c.y * TS + 8, 30, 0, Math.PI * 2); g.stroke(); }

  const variants = [0, 1, 2].map(v => obstacleSprite(st.theme.obs, st.theme.oc, v));
  const obst: Obst[] = [];
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    if (!solid[ty * w + tx]) continue;
    obst.push({ x: tx * TS + 8, y: ty * TS + 15, spr: variants[(tx * 5 + ty * 11) % 3], sway: st.theme.obs === 'tree' || st.theme.obs === 'cactus' ? 1 : 0, ph: (tx + ty) * 0.7 });
  }
  const mm = document.createElement('canvas'); mm.width = w; mm.height = h;
  const m = mm.getContext('2d')!;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx;
    m.fillStyle = water[i] ? WATER_COL[st.id - 1] : solid[i] ? hexShift(st.theme.oc, -60) : path[i] ? st.theme.path : hexShift(st.theme.g1, -10);
    m.fillRect(tx, ty, 1, 1);
  }
  const W2 = (p: { x: number; y: number }) => ({ x: p.x * TS + 8, y: p.y * TS + 12 });
  return { w, h, solid, water, reach, img, obst, waters: waterList, mm, start: W2(s), boss: { x: b.x * TS + 8, y: b.y * TS + 16 }, path: trail, spots: spots.map(W2) };
}

// ================================================================== entities
interface Enemy {
  x: number; y: number; def: MonsterDef; spr: Sprite; level: number; boss: boolean;
  hp: number; maxHp: number; atk: number; speed: number; r: number; scale: number;
  vx: number; vy: number; kx: number; ky: number; wt: number; flip: number;
  st: 'idle' | 'wind' | 'act' | 'rec'; stT: number; stDur: number; cd: number; ang: number; pat: string;
  flash: number; hurtT: number; slow: number; burn: number; awake: boolean; ph: number; born: number; didHit: boolean; rage: boolean; dead: boolean;
  elite: boolean; sub: number; segT: number; tx: number; ty: number; sx: number; sy: number; z: number;
}
interface Npc { x: number; y: number; idx: number; spr: Sprite; }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; g: number; add: boolean; }
interface Ring { x: number; y: number; r: number; max: number; life: number; dur: number; c: string; w: number; }
interface Slash { x: number; y: number; a: number; dir: number; spread: number; R: number; t: number; dur: number; c: string; glow: string; pow: boolean; }
interface Bolt { pts: [number, number][]; life: number; c: string; w: number; }
interface Floater { x: number; y: number; t: string; c: string; life: number; big: boolean; }
interface Orb { x: number; y: number; vx: number; vy: number; t: number; gold: boolean; }
interface Proj { x: number; y: number; vx: number; vy: number; dmg: number; life: number; c: string; r: number; home?: boolean; }
interface Telegraph { x: number; y: number; kind: 'circle' | 'line'; r: number; ang: number; len: number; t: number; dur: number; owner?: Enemy; boom?: boolean; dmg?: number; done?: boolean; color?: string; }

let map: GameMap;
let enemies: Enemy[] = [];
let npcs: Npc[] = [];
let parts: Part[] = [], rings: Ring[] = [], slashes: Slash[] = [], bolts: Bolt[] = [], floaters: Floater[] = [], orbs: Orb[] = [], projs: Proj[] = [], teles: Telegraph[] = [];
let weather: { x: number; y: number; ph: number; sp: number }[] = [];
let shake = 0, flashA = 0, hurtVig = 0, freeze = 0, slowmo = 0, comboShow = 0, comboN = 0;
let respawnT = 0, bossAlive = true, bossAnnounced = false, nearNpc: Npc | null = null, lockToastT = 0;
const cam = { x: 0, y: 0 };

const P = {
  x: 0, y: 0, fa: 0, moving: false, inv: 0, dashT: 0, dashCd: 0, dvx: 0, dvy: 0, kx: 0, ky: 0,
  scd: [0, 0, 0] as number[], strike: false, strikeHit: new Set<Enemy>(), subT: 0, orbA: 0, swingT: 0, swingDur: 0.26, swingHit: false, step: 0, comboT: 0, atkBuf: 0, anim: 0, dead: false, afters: [] as { x: number; y: number; t: number; fa: number }[],
};

const spriteCache = new Map<string, Sprite>();
function monsterSpr(m: MonsterDef) {
  const k = m.name + m.c1 + m.c2; let s = spriteCache.get(k);
  if (!s) { s = monsterSprite(m); spriteCache.set(k, s); } return s;
}

function tileSolid(tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  return map.solid[ty * map.w + tx] === 1;
}
function blockedAt(x: number, y: number, hw = 4) {
  return tileSolid(Math.floor((x - hw) / TS), Math.floor((y - 4) / TS)) || tileSolid(Math.floor((x + hw) / TS), Math.floor((y - 4) / TS)) ||
    tileSolid(Math.floor((x - hw) / TS), Math.floor(y / TS)) || tileSolid(Math.floor((x + hw) / TS), Math.floor(y / TS));
}

function mkEnemy(def: MonsterDef, level: number, boss: boolean, x: number, y: number, elite = false): Enemy {
  const em = elite ? 2.6 : 1;
  const maxHp = Math.round((30 + level * 22) * (boss ? 7 : 2.0) * em);
  const sp0 = (def.type === 'beast' ? 44 : def.type === 'blob' ? 27 : 22) * (elite ? 1.1 : 1);
  return {
    x, y, def, spr: monsterSpr(def), level, boss, hp: maxHp, maxHp, atk: (5 + level * 2.6) * (boss ? 1.25 : 1.15 * (elite ? 1.3 : 1)),
    speed: boss ? 30 : sp0, r: boss ? 14 : elite ? 9 : 7, scale: boss ? 2 : elite ? 1.3 : 1, vx: 0, vy: 0, kx: 0, ky: 0, wt: rand(0, 2), flip: 1,
    st: 'idle', stT: 0, stDur: 0, cd: rand(0.4, 1.2), ang: 0, pat: '', flash: 0, hurtT: 0, slow: 0, burn: 0,
    awake: false, ph: rand(0, 6), born: boss ? 1 : 0, didHit: false, rage: false, dead: false,
    elite, sub: 0, segT: 0, tx: 0, ty: 0, sx: 0, sy: 0, z: 0,
  };
}

function randomFreeSpot(minDist: number) {
  for (let n = 0; n < 200; n++) {
    const tx = 2 + Math.floor(Math.random() * (map.w - 4)), ty = 2 + Math.floor(Math.random() * (map.h - 4));
    if (!map.reach[ty * map.w + tx]) continue;
    const x = tx * TS + 8, y = ty * TS + 12;
    if (dist(x, y, P.x, P.y) < minDist) continue;
    if (dist(x, y, map.boss.x, map.boss.y) < 60) continue;
    if (enemies.some(e => dist(e.x, e.y, x, y) < 24)) continue;
    return { x, y };
  }
  return null;
}
function spawnEnemy(far = 110) {
  const p = randomFreeSpot(far); if (!p) return;
  const def = stage.enemies[Math.floor(Math.random() * stage.enemies.length)];
  const elite = Math.random() < 0.12; const e = mkEnemy(def, stage.rec + (elite ? 2 : Math.random() < 0.5 ? 0 : 1), false, p.x, p.y, elite); e.born = 0.01;
  enemies.push(e);
}

interface Chest { x: number; y: number; open: boolean; }
interface Dagger { x: number; y: number; vx: number; vy: number; life: number; a: number; }
let chests: Chest[] = [], daggers: Dagger[] = [];
const orbHit = new Map<Enemy, number>();
let expl = new Uint8Array(1), mmShow: HTMLCanvasElement | null = null, lastTile = -1, mmT = 0;
const mmEl = $('minimap') as HTMLCanvasElement;
const chestSprites = { closed: chestSprite(false), open: chestSprite(true) };

function revealMap() {
  const tx = Math.floor(P.x / TS), ty = Math.floor(P.y / TS), idx = ty * map.w + tx;
  if (idx === lastTile || !mmShow) return; lastTile = idx;
  const c = mmShow.getContext('2d')!; const R = 10;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
    const i = y * map.w + x; if (expl[i]) continue; expl[i] = 1; c.drawImage(map.mm, x, y, 1, 1, x, y, 1, 1);
  }
}
function startStage(id: number) {
  stage = STAGES[id - 1];
  map = genMap(stage);
  P.x = map.start.x; P.y = map.start.y; P.inv = 1.5; P.dead = false; P.swingT = 0; P.dashT = 0; P.fa = 0.3; P.subT = 0.5; P.orbA = 0;
  cam.x = P.x - W / Z / 2; cam.y = P.y - H / Z / 2;
  enemies = []; parts = []; rings = []; slashes = []; bolts = []; floaters = []; orbs = []; projs = []; teles = []; daggers = []; puddles = []; waves = [];
  orbHit.clear();
  for (const sp0 of map.spots) for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + rand(0, 1), x = sp0.x + Math.cos(a) * 24, y = sp0.y + Math.sin(a) * 20;
    if (blockedAt(x, y, 7)) continue;
    const def = stage.enemies[Math.floor(Math.random() * stage.enemies.length)];
    const el = k === 0; const e = mkEnemy(def, stage.rec + (el ? 2 : Math.random() < 0.5 ? 0 : 1), false, x, y, el); enemies.push(e);
  }
  chests = map.spots.map(s0 => ({ x: s0.x, y: s0.y, open: false }));
  while (enemies.length < ENEMY_MAX) { const before = enemies.length; spawnEnemy(100); if (enemies.length === before) break; }
  bossAlive = true; bossAnnounced = false;
  const bd = stage.boss;
  const boss = mkEnemy(bd, stage.rec + 2, true, map.boss.x, map.boss.y); boss.flip = -1;
  enemies.push(boss);
  npcs = [];
  [0.3, 0.62].forEach((f, idx) => {
    const t = map.path[Math.floor(map.path.length * f)];
    const d = stage.npcs[idx];
    let nx = t.x * TS + 8, ny = t.y * TS + 30;
    if (blockedAt(nx, ny)) { nx = t.x * TS + 26; ny = t.y * TS + 12; }
    if (blockedAt(nx, ny)) { nx = t.x * TS + 8; ny = t.y * TS + 12; }
    npcs.push({ x: nx, y: ny, idx, spr: npcSprite(d.robe, d.hat) });
  });
  const wc = WEATHER[id - 1];
  weather = Array.from({ length: wc.g ? 34 : 46 }, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, 6), sp: rand(0.6, 1.4) }));
  respawnT = 8; sp = Math.min(sp, 60);
  expl = new Uint8Array(map.w * map.h); lastTile = -1;
  mmShow = document.createElement('canvas'); mmShow.width = map.w; mmShow.height = map.h;
  const mc = mmShow.getContext('2d')!; mc.fillStyle = '#05030a'; mc.fillRect(0, 0, map.w, map.h);
  mmEl.width = map.w; mmEl.height = map.h; mmEl.classList.remove('hidden');
  revealMap();
  scene = 'map'; inStage = true;
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden'); $('bossbar').classList.add('hidden'); $('side-btns').classList.remove('hidden'); gpsKey = ''; gpsT = 0;
  setMusic('map', id);
  refreshHud();
}

async function enterStage(id: number) {
  closeAllPanels();
  startStage(id);
  if (!save.cleared.includes(id)) {
    await dialog(`ด่าน ${id}: ${stage.name}`, [stage.intro, `เลเวลที่แนะนำ: ${stage.rec}  |  บอสประจำด่าน: ${stage.boss.name}`], 'ออกเดินทาง');
  }
}

// ================================================================== effects helpers
function burst(x: number, y: number, cols: string[], n: number, spd: number, up = 0, add = true, g = 60) {
  for (let i = 0; i < n && parts.length < 600; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.25, 1) * spd;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: rand(0.3, 0.7), max: 0.7, c: cols[i % cols.length], s: rand(0.8, 1.7), g, add });
  }
}
function ring(x: number, y: number, r: number, c: string, dur = 0.4, w = 2) { rings.push({ x, y, r: 0, max: r, life: dur, dur, c, w }); }
function floater(x: number, y: number, t: string, c: string, big = false) { floaters.push({ x, y, t, c, life: 0.95, big }); }
function bolt(x1: number, y1: number, x2: number, y2: number, c: string, w = 1.4, jag = 5) {
  const pts: [number, number][] = [[x1, y1]]; const n = 7;
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rand(-jag, jag), y1 + (y2 - y1) * t + rand(-jag, jag)]); }
  pts.push([x2, y2]); bolts.push({ pts, life: 0.2, c, w });
}
function addShake(n: number) { shake = Math.max(shake, n); }

// ================================================================== progression
interface LevelUp { from: number; to: number; }
function addExp(n: number): LevelUp | null {
  const from = save.level;
  if (save.level < MAX_LEVEL) {
    save.exp += n;
    while (save.level < MAX_LEVEL && save.exp >= expForLevel(save.level)) { save.exp -= expForLevel(save.level); save.level++; }
    if (save.level >= MAX_LEVEL) save.exp = 0;
  }
  writeSave(save);
  if (save.level > from) { hp = stats().maxHp; return { from, to: save.level }; }
  return null;
}
let bannerT = 0;
function banner(title: string, lines: string[], ms = 3200) {
  const b = $('banner');
  b.innerHTML = `<b>${esc(title)}</b>${lines.map(l => `<span>${esc(l)}</span>`).join('')}`;
  b.classList.add('show'); clearTimeout(bannerT);
  bannerT = window.setTimeout(() => b.classList.remove('show'), ms);
}
function levelUpFx(lu: LevelUp) {
  sfx('levelup');
  const unlocks: string[] = [];
  const wOld = bestWeapon(lu.from), wNew = bestWeapon(lu.to), aOld = bestArmor(lu.from), aNew = bestArmor(lu.to);
  if (save.gear.weapon === WEAPONS.indexOf(wOld) && wNew !== wOld) save.gear.weapon = WEAPONS.indexOf(wNew);
  if (save.gear.armor === ARMORS.indexOf(aOld) && aNew !== aOld) save.gear.armor = ARMORS.indexOf(aNew);
  writeSave(save);
  if (wNew !== wOld) unlocks.push(`ดาบประจำตัวพัฒนา: ${wNew.name}`);
  if (aNew !== aOld) unlocks.push(`เกราะใหม่: ${aNew.name}`);
  for (const s of STAGES) if (s.rec > lu.from && s.rec <= lu.to && (s.id === 1 || save.cleared.includes(s.id - 1))) unlocks.push(`ปลดล็อกด่าน: ${s.name}`);
  for (const grp of [HELMETS, SUBS, CHARMS]) for (const o of grp) if (o.minLevel > lu.from && o.minLevel <= lu.to) unlocks.push('ปลดล็อกในหน้าเตรียมตัว: ' + o.name);
  banner(`LEVEL ${lu.to}`, [`ฟื้นฟูพลังเต็ม  โจมตี ${stats().atk}  ป้องกัน ${stats().def}`, ...unlocks], 3600);
  for (let i = 0; i < 4; i++) setTimeout(() => ring(P.x, P.y - 8, 34 + i * 10, i % 2 ? '#fff6b0' : '#ffd84a', 0.7, 2.5), i * 90);
  burst(P.x, P.y - 8, ['#ffd84a', '#fff6b0', '#ffffff'], 60, 70, 40, true, 20);
  flashA = 0.5; addShake(10);
  if (wNew !== wOld) { burst(P.x, P.y - 12, [wNew.color, wNew.glow], 40, 60, 20); }
  refreshHud();
}

// ================================================================== combat: player
function hurtPlayer(dmg: number, fx: number, fy: number, kb = 90): boolean {
  if (P.inv > 0 || P.dead || P.dashT > 0) return false;
  const d = Math.max(1, Math.round((dmg - stats().def * 0.5) * (save.gear.sub === 1 ? 0.85 : 1)));
  hp = Math.max(0, hp - d); P.inv = 0.7;
  const a = Math.atan2(P.y - fy, P.x - fx); P.kx = Math.cos(a) * kb; P.ky = Math.sin(a) * kb;
  floater(P.x, P.y - 22, `-${d}`, '#ff6a5a', true);
  burst(P.x, P.y - 10, ['#ff6a5a', '#ffb0a0'], 12, 60);
  hurtVig = 0.45; addShake(8); freeze = 0.05; sfx('hurt'); refreshHud();
  if (hp <= 0) void playerDie();
  return true;
}

async function playerDie() {
  P.dead = true; setMusic('off'); sfx('lose');
  $('bossbar').classList.add('hidden');
  await new Promise(r => setTimeout(r, 700));
  const lost = Math.floor(save.gold * 0.1);
  save.gold -= lost; writeSave(save);
  await new Promise<void>(res => {
    const p = panel(`<h2>ล้มลง...</h2><p style="text-align:center">เจ้าพ่ายแพ้ ฟื้นขึ้นที่จุดเริ่มต้นของด่าน${lost ? ` (เสียทอง ${lost})` : ''}</p><p style="text-align:center;font-size:14px;opacity:.8">เคล็ดลับ: กดพุ่งเพื่อหลบท่าที่มีวงแดงเตือน และสะสมพลังปัญญาเพื่อปล่อยท่าไม้ตาย</p><button class="btn gold" id="l-ok">ลุกขึ้นสู้ใหม่</button>`);
    p.onX = () => (p.el.querySelector('#l-ok') as HTMLElement).click();
    (p.el.querySelector('#l-ok') as HTMLElement).onclick = () => { sfx('click'); p.close(); res(); };
  });
  hp = stats().maxHp;
  const boss = enemies.find(e => e.boss);
  if (boss && bossAlive) { boss.hp = boss.maxHp; boss.awake = false; boss.st = 'idle'; bossAnnounced = false; boss.rage = false; }
  projs = []; teles = [];
  P.x = map.start.x; P.y = map.start.y; P.inv = 2; P.dead = false;
  setMusic('map', stage.theme.root); refreshHud();
}

// ================================================================== weapon skills (no quiz needed)
const SKILL_CD = 1; // seconds per skill (tunable)
const SKILL_NAMES: string[][] = [
  ['คลื่นกระแทก', 'หมุนพลอง', 'พุ่งทุบ'],
  ['คลื่นสำริด', 'วงฟันสำริด', 'พุ่งฟันสำริด'],
  ['คลื่นเหล็กกล้า', 'วงดาบเหล็ก', 'พุ่งทะลวง'],
  ['คลื่นเพลิง', 'วงเพลิงนรก', 'พุ่งอัคคี'],
  ['คลื่นสายฟ้า', 'พายุฟ้าผ่า', 'พุ่งอสนี'],
  ['ลมหายใจมังกร', 'วงน้ำแข็งแช่แข็ง', 'พุ่งธารน้ำแข็ง'],
];
interface Wave { x: number; y: number; vx: number; vy: number; life: number; dmg: number; ang: number; wi: number; hit: Set<Enemy>; }
let waves: Wave[] = [];

function elemOnHit(e: Enemy, dmg: number, wi: number) {
  if (wi === 3) { e.burn = 2.4; burst(e.x, e.y - 8, ['#ff7a2f', '#ffcf4a', '#ff3a1a'], 8, 40, 40); }
  if (wi === 4) {
    let chain = 0;
    for (const o of enemies) {
      if (o === e || o.dead || chain >= 2) continue;
      if (dist(o.x, o.y, e.x, e.y) < 60 && (!o.boss || bossAnnounced)) { chain++; bolt(e.x, e.y - 8, o.x, o.y - 8, '#fffbc0', 1.4, 5); hitEnemy(o, Math.round(dmg * 0.45), 0, 30, false, false, true); }
    }
    bolt(e.x + rand(-6, 6), e.y - 90, e.x, e.y - 6, '#fffbc0', 1.6, 6);
  }
  if (wi === 5) { e.slow = 2.2; burst(e.x, e.y - 8, ['#7ff0ff', '#d8fbff', '#ffffff'], 10, 55); }
}

function castSkill(i: number) {
  if (P.dead || P.scd[i] > 0) return;
  P.scd[i] = SKILL_CD;
  const wi = weaponIdx(), w = WEAPONS[wi], atk = stats().atk;
  floater(P.x, P.y - 30, SKILL_NAMES[wi][i], w.glow, true);
  sfx(i === 1 ? 'crit' : 'swing');
  if (i === 0) { // piercing wave
    const a = aimAngle(); P.fa = a;
    waves.push({ x: P.x + Math.cos(a) * 12, y: P.y - 12 + Math.sin(a) * 12, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.75, dmg: atk * 1.1, ang: a, wi, hit: new Set() });
    P.swingT = 0.2; P.swingDur = 0.2; P.swingHit = true; P.step = 0;
    slashes.push({ x: P.x, y: P.y - 9, a, dir: 1, spread: 1.0, R: 30, t: 0, dur: 0.2, c: w.color, glow: w.glow, pow: false });
    burst(P.x + Math.cos(a) * 14, P.y - 10 + Math.sin(a) * 14, [w.color, w.glow], 8, 60);
  } else if (i === 1) { // nova around the hero
    ring(P.x, P.y - 4, 64, w.glow, 0.4, 4); ring(P.x, P.y - 4, 40, w.color, 0.3, 3);
    burst(P.x, P.y - 8, [w.color, w.glow, '#fff'], 30, 110, 10);
    slashes.push({ x: P.x, y: P.y - 9, a: 0, dir: 1, spread: Math.PI, R: 54, t: 0, dur: 0.3, c: w.color, glow: w.glow, pow: true });
    slashes.push({ x: P.x, y: P.y - 9, a: Math.PI, dir: 1, spread: Math.PI, R: 54, t: 0, dur: 0.3, c: w.color, glow: w.glow, pow: true });
    P.swingT = 0.3; P.swingDur = 0.3; P.swingHit = true; P.step = 2;
    addShake(8); freeze = Math.max(freeze, 0.04);
    for (const e of enemies.slice()) {
      if (e.dead || (e.boss && !bossAnnounced)) continue;
      if (dist(P.x, P.y, e.x, e.y) > 64 + e.r) continue;
      const dmg = Math.round(atk * 1.0 * rand(0.9, 1.1));
      hitEnemy(e, dmg, Math.atan2(e.y - P.y, e.x - P.x), 170, true, false); elemOnHit(e, dmg, wi);
    }
    for (const p of projs) if (dist(P.x, P.y, p.x, p.y) < 70) { p.life = 0; burst(p.x, p.y, [p.c, '#fff'], 6, 40); }
    projs = projs.filter(p => p.life > 0);
  } else { // dash strike
    const a = aimAngle(); P.fa = a;
    P.dashT = 0.24; P.dvx = Math.cos(a) * 300; P.dvy = Math.sin(a) * 300; P.inv = Math.max(P.inv, 0.35); P.strike = true; P.strikeHit.clear();
    P.swingT = 0.24; P.swingDur = 0.24; P.swingHit = true; P.step = 1;
    slashes.push({ x: P.x, y: P.y - 9, a, dir: 1, spread: 1.1, R: 34, t: 0, dur: 0.24, c: w.color, glow: w.glow, pow: true });
  }
  sp = Math.min(100, sp + 2 * spMul()); refreshHud();
}

function strikeHits() {
  const wi = weaponIdx(), w = WEAPONS[wi];
  burst(P.x, P.y - 10, [w.color, w.glow], 2, 30, 0);
  for (const e of enemies) {
    if (e.dead || P.strikeHit.has(e) || (e.boss && !bossAnnounced)) continue;
    if (dist(P.x, P.y, e.x, e.y) < 22 + e.r) {
      P.strikeHit.add(e);
      const dmg = Math.round(stats().atk * 1.4 * rand(0.9, 1.1));
      hitEnemy(e, dmg, P.fa, 140, true, false); elemOnHit(e, dmg, wi);
      ring(e.x, e.y - 8, 18, w.glow, 0.25, 3); addShake(5); freeze = Math.max(freeze, 0.05);
    }
  }
}

function updateWaves(dt: number) {
  for (const wv of waves) {
    wv.x += wv.vx * dt; wv.y += wv.vy * dt; wv.life -= dt;
    if (tileSolid(Math.floor(wv.x / TS), Math.floor(wv.y / TS))) wv.life = 0;
    const w = WEAPONS[wv.wi];
    if (Math.random() < 0.8) parts.push({ x: wv.x + rand(-4, 4), y: wv.y + rand(-6, 6), vx: 0, vy: wv.wi === 3 ? -20 : 0, life: 0.3, max: 0.3, c: Math.random() < 0.5 ? w.color : w.glow, s: 1.4, g: 0, add: true });
    for (const e of enemies) {
      if (e.dead || wv.hit.has(e) || (e.boss && !bossAnnounced)) continue;
      if (dist(wv.x, wv.y, e.x, e.y - 6) < e.r + 9) { wv.hit.add(e); const dmg = Math.round(wv.dmg * rand(0.9, 1.1)); hitEnemy(e, dmg, wv.ang, 90, true, false); elemOnHit(e, dmg, wv.wi); }
    }
    for (const p of projs) if (dist(wv.x, wv.y, p.x, p.y) < 12) { p.life = 0; burst(p.x, p.y, [p.c, '#fff'], 6, 40); }
  }
  projs = projs.filter(p => p.life > 0); waves = waves.filter(w => w.life > 0);
}

function drawWave(wv: Wave) {
  const w = WEAPONS[wv.wi];
  ctx.save(); ctx.translate(wv.x, wv.y); ctx.rotate(wv.ang); ctx.globalAlpha = clamp(wv.life * 2, 0, 1);
  ctx.fillStyle = w.glow; ctx.beginPath(); ctx.arc(-6, 0, 17, -1.1, 1.1); ctx.arc(-1, 0, 11, 1.1, -1.1, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = w.color; ctx.beginPath(); ctx.arc(-6, 0, 15, -0.9, 0.9); ctx.arc(-2, 0, 11, 0.9, -0.9, true); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function aimAngle(): number {
  let best: Enemy | null = null, bd = 62;
  for (const e of enemies) { if (e.dead) continue; const d = dist(P.x, P.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best ? Math.atan2(best.y - P.y, best.x - P.x) : P.fa;
}

function startSwing() {
  P.step = P.comboT > 0 ? (P.step + 1) % 3 : 0;
  P.fa = aimAngle();
  P.swingDur = P.step === 2 ? 0.4 : 0.24; P.swingT = P.swingDur; P.swingHit = false; P.comboT = 0;
  const lunge = P.step === 2 ? 130 : 80;
  P.kx += Math.cos(P.fa) * lunge; P.ky += Math.sin(P.fa) * lunge;
  const w = gw();
  slashes.push({ x: P.x, y: P.y - 9, a: P.fa, dir: P.step === 1 ? -1 : 1, spread: P.step === 2 ? Math.PI : 1.25, R: P.step === 2 ? 40 : 30, t: 0, dur: P.swingDur, c: w.color, glow: w.glow, pow: P.step === 2 });
  sfx('swing');
  if (weaponIdx() === 3) burst(P.x + Math.cos(P.fa) * 14, P.y - 9 + Math.sin(P.fa) * 14, ['#ff7a2f', '#ffcf4a'], 8, 40, 20);
}

function swingHit() {
  const step = P.step, R = step === 2 ? 44 : 33, half = step === 2 ? Math.PI : 1.2;
  const wi = weaponIdx(), w = WEAPONS[wi];
  let hits = 0;
  for (const e of enemies.slice()) {
    if (e.dead) continue;
    const d = dist(P.x, P.y, e.x, e.y);
    if (d > R + e.r) continue;
    if (step !== 2 && angDiff(Math.atan2(e.y - P.y, e.x - P.x), P.fa) > half + (e.r / Math.max(d, 8))) continue;
    if (e.boss && !bossAnnounced) continue;
    const crit = Math.random() < critChance();
    let dmg = stats().atk * rand(0.9, 1.1) * (step === 2 ? 1.7 : 1) * (crit ? 1.8 : 1);
    dmg = Math.max(1, Math.round(dmg));
    hitEnemy(e, dmg, Math.atan2(e.y - P.y, e.x - P.x), step === 2 ? 150 : 90, crit || step === 2, false);
    hits++;
    // weapon specials
    if (wi === 3) { e.burn = 2.4; burst(e.x, e.y - 8, ['#ff7a2f', '#ffcf4a', '#ff3a1a'], 10, 40, 40); }
    if (wi === 4) {
      let chain = 0;
      for (const o of enemies) { if (o === e || o.dead || chain >= 2) continue; if (dist(o.x, o.y, e.x, e.y) < 60 && (!o.boss || bossAnnounced)) { chain++; bolt(e.x, e.y - 8, o.x, o.y - 8, '#fffbc0', 1.4, 5); hitEnemy(o, Math.round(dmg * 0.45), 0, 30, false, false, true); } }
      bolt(e.x + rand(-6, 6), e.y - 90, e.x, e.y - 6, '#fffbc0', 1.6, 6);
    }
    if (wi === 5) { e.slow = 2; burst(e.x, e.y - 8, ['#7ff0ff', '#d8fbff', '#fff'], 12, 55); }
  }
  // deflect projectiles
  for (const p of projs) if (dist(P.x, P.y, p.x, p.y) < R + 4) { p.life = 0; burst(p.x, p.y, [p.c, '#fff'], 6, 40); }
  projs = projs.filter(p => p.life > 0);
  if (hits) {
    comboN += 1; comboShow = 1.6;
    sp = Math.min(100, sp + 5 * hits * spMul()); refreshHud();
    freeze = Math.max(freeze, step === 2 ? 0.1 : 0.05);
    addShake(step === 2 ? 10 : 4);
    if (step === 2) { ring(P.x, P.y - 4, R, w.glow, 0.35, 3); burst(P.x, P.y - 4, [w.color, w.glow], 24, 100, 0); }
  }
}

function hitEnemy(e: Enemy, dmg: number, ang: number, kb: number, big: boolean, power: boolean, silent = false) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.1; e.hurtT = 2.2;
  const kk = e.boss ? 0.15 : 1; e.kx += Math.cos(ang) * kb * kk; e.ky += Math.sin(ang) * kb * kk;
  if (!e.boss && e.st === 'wind' && (!e.elite || Math.random() < 0.5)) { e.st = 'idle'; e.cd = 0.6; teles = teles.filter(t => t.owner !== e); }
  e.awake = true;
  const wi = weaponIdx(), w = WEAPONS[wi];
  floater(e.x + rand(-4, 4), e.y - 12 * e.scale, String(dmg), power ? '#ffd84a' : big ? '#ffb040' : '#ffffff', big || power);
  if (!silent) sfx(big || power ? 'crit' : 'hit');
  burst(e.x, e.y - 8, [w.color, w.glow, '#fff'], big ? 18 : 9, big ? 90 : 60);
  // impact flash star
  rings.push({ x: e.x, y: e.y - 8, r: 0, max: big ? 16 : 10, life: 0.16, dur: 0.16, c: w.glow, w: 2 });
  if (e.hp <= 0) killEnemy(e);
  else if (e.boss) refreshBossBar();
}

function killEnemy(e: Enemy) {
  e.dead = true; teles = teles.filter(t => t.owner !== e);
  burst(e.x, e.y - 8, [e.def.c1, e.def.c2, '#fff'], e.boss ? 80 : 26, e.boss ? 120 : 80, 20, false, 80);
  burst(e.x, e.y - 8, ['#ffd84a', '#fff6b0'], e.boss ? 40 : 10, 70, 30, true, 40);
  ring(e.x, e.y - 6, e.boss ? 70 : 24, '#fff', 0.45, 2.5);
  sfx('crit');
  const mult = e.boss ? 5 : e.elite ? 2.5 : 1;
  const xp = Math.round((10 + e.level * 12) * mult), gold = Math.round((5 + e.level * 4) * mult);
  save.gold += gold; sp = Math.min(100, sp + (e.boss ? 0 : 18) * spMul());
  floater(e.x, e.y - 22 * e.scale, `+${xp} EXP`, '#7fe0ff', true);
  floater(e.x, e.y - 30 * e.scale, `+${gold}`, '#ffd84a', false);
  for (let i = 0; i < (e.boss ? 14 : 4); i++) orbs.push({ x: e.x, y: e.y - 6, vx: rand(-50, 50), vy: rand(-80, -20), t: 0, gold: i % 2 === 0 });
  const lu = addExp(xp);
  if (!lu) hp = Math.min(stats().maxHp, hp + Math.round(stats().maxHp * (e.boss ? 0 : 0.06)));
  writeSave(save);
  freeze = e.boss ? 0.2 : 0.07; addShake(e.boss ? 24 : 7);
  comboShow = 1.6;
  if (lu) levelUpFx(lu);
  refreshHud();
  if (e.boss) { slowmo = 1.6; flashA = 0.7; void bossDefeated(); }
  else enemies = enemies.filter(x => x !== e);
}

async function bossDefeated() {
  bossAlive = false; setMusic('off'); sfx('win');
  $('bossbar').classList.add('hidden');
  projs = []; teles = [];
  await new Promise(r => setTimeout(r, 1700));
  enemies = enemies.filter(x => !x.boss);
  if (!save.cleared.includes(stage.id)) save.cleared.push(stage.id);
  writeSave(save);
  await dialog('ด่านสำเร็จ', [stage.clear], stage.id === 10 ? 'ถึงตอนจบ' : 'ไปต่อ');
  if (stage.id === 10) await dialog('ตอนจบ', ['เจ้าได้นำความรู้และประวัติศาสตร์กลับคืนสู่แผ่นดิน ชื่อของเจ้าจะถูกจารึกไว้ตลอดกาล', 'ขอบคุณที่ร่วมผจญภัย — เจ้ายังกลับไปฟาร์มเลเวลและเก็บภารกิจที่เหลือได้เสมอ'], 'กลับสู่แผนที่');
  setMusic('map', stage.theme.root);
  openStageSelect();
}

function refreshBossBar() {
  const b = enemies.find(e => e.boss); if (!b) return;
  ($('boss-hp') as HTMLElement).style.width = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
}

function ultimate() {
  if (sp < 100 || P.dead || panelOpen()) return;
  const q = randomQuestion(save.level);
  void askQuestion(q, 'ตอบถูกเพื่อปล่อยท่าไม้ตายปัญญา!').then(ok => {
    save.stats.answered++;
    if (!ok) { sp = 35; writeSave(save); refreshHud(); toast('ท่าไม้ตายพลาด ลองสะสมพลังใหม่'); return; }
    save.stats.correct++; writeSave(save);
    sp = 0; P.inv = Math.max(P.inv, 1);
    const w = gw();
    sfx('crit'); sfx('levelup');
    flashA = 1; addShake(30); freeze = 0.16;
    for (let i = 0; i < 4; i++) setTimeout(() => ring(P.x, P.y - 6, 150, i % 2 ? w.glow : '#ffffff', 0.55, 4), i * 80);
    burst(P.x, P.y - 8, [w.color, w.glow, '#fff', '#ffd84a'], 90, 160, 20, true, 10);
    slashes.push({ x: P.x, y: P.y - 8, a: 0, dir: 1, spread: Math.PI, R: 110, t: 0, dur: 0.5, c: w.color, glow: w.glow, pow: true });
    slashes.push({ x: P.x, y: P.y - 8, a: Math.PI, dir: 1, spread: Math.PI, R: 110, t: 0, dur: 0.5, c: w.color, glow: w.glow, pow: true });
    setTimeout(() => {
      const dmgBase = stats().atk * 4.5;
      for (const e of enemies.slice()) {
        if (e.dead || dist(e.x, e.y, P.x, P.y) > 160) continue;
        if (e.boss && !bossAnnounced) continue;
        bolt(e.x + rand(-10, 10), e.y - 130, e.x, e.y - 4, '#fff6b0', 2.4, 10);
        bolt(e.x + rand(-10, 10), e.y - 130, e.x, e.y - 4, w.glow, 1.4, 8);
        hitEnemy(e, Math.round(dmgBase * rand(0.95, 1.1)), Math.atan2(e.y - P.y, e.x - P.x), 220, true, true);
      }
      hp = Math.min(stats().maxHp, hp + Math.round(stats().maxHp * 0.15)); refreshHud();
    }, 160);
    banner('ท่าไม้ตายปัญญา!', [], 1100);
  });
}

// ================================================================== NPC quests
async function talkNpc(n: Npc) {
  const def = stage.npcs[n.idx];
  const key = `${stage.id}-${n.idx}`;
  if (save.quests[key]) { await dialogP(n.spr, def.name, ['ขอบใจนะผู้กล้า เจ้าช่วยข้าไว้มากจริง ๆ ขอให้โชคดีตลอดทาง']); return; }
  await dialogP(n.spr, def.name, def.lines);
  const yes = await confirmBox('ภารกิจจากชาวบ้าน', 'ตอบคำถาม 3 ข้อ ถูกอย่างน้อย 2 ข้อถือว่าสำเร็จ รับ EXP และทองเป็นรางวัล', 'รับภารกิจ', 'ไว้ก่อน');
  if (!yes) return;
  let correct = 0;
  for (let i = 0; i < 3; i++) {
    const q = randomQuestion(save.level, def.subject);
    const ok = await askQuestion(q, `ภารกิจ ข้อ ${i + 1}/3 — ตอบถูกแล้ว ${correct} ข้อ`);
    save.stats.answered++; if (ok) { correct++; save.stats.correct++; }
  }
  if (correct >= 2) {
    const mult = correct === 3 ? 1.5 : 1;
    const xp = Math.round((25 + save.level * 10) * mult), gold = Math.round((15 + save.level * 5) * mult);
    save.gold += gold; save.quests[key] = true;
    sfx('coin');
    await dialogP(n.spr, def.name, [`เยี่ยมมาก! เจ้าตอบถูก ${correct} ข้อ`, `รางวัล: EXP +${xp}  ทอง +${gold}`], 'รับรางวัล');
    const lu = addExp(xp); writeSave(save); refreshHud();
    if (lu) levelUpFx(lu);
  } else {
    writeSave(save);
    await dialogP(n.spr, def.name, [`ตอบถูกเพียง ${correct} ข้อ ยังไม่ผ่านนะ กลับมาลองใหม่ได้เสมอ`]);
  }
}

// ================================================================== menus
const dialogP = (por: Sprite, who: string, lines: string[], btn = 'ต่อไป') => dialog(who, lines, btn, por);

function openChest(c: Chest) {
  c.open = true; sfx('chest');
  const gold = 25 + save.level * 9, xp = 20 + save.level * 7;
  save.gold += gold;
  floater(c.x, c.y - 18, `+${gold}`, '#ffd84a', true); floater(c.x, c.y - 28, `+${xp} EXP`, '#7fe0ff', true);
  burst(c.x, c.y - 8, ['#ffd84a', '#fff6b0', '#ffffff'], 34, 80, 50, true, 40);
  ring(c.x, c.y - 6, 26, '#ffe27a', 0.5, 2.5);
  for (let i = 0; i < 6; i++) orbs.push({ x: c.x, y: c.y - 8, vx: rand(-40, 40), vy: rand(-70, -20), t: 0, gold: i % 2 === 0 });
  if (Math.random() < 0.5) { const hl = Math.round(stats().maxHp * 0.3); hp = Math.min(stats().maxHp, hp + hl); floater(c.x, c.y - 38, `+${hl} HP`, '#8aff8a', true); }
  const lu = addExp(xp); writeSave(save); refreshHud();
  if (lu) levelUpFx(lu);
}

function drawPreview(cv: HTMLCanvasElement, dirIdx: number) {
  const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
  const dir: Dir = (['down', 'side', 'up'] as Dir[])[dirIdx % 3];
  const spr = heroFrame(dir, 0, save.gear.armor, save.look, save.gear.sub === 1);
  const ox = Math.round(20 - spr.width / 2), oy = 44 - spr.height;
  x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(20, 44, 8, 2, 0, 0, 6.3); x.fill();
  const w = gw();
  const sword = (px: number, py: number, ang: number) => {
    x.save(); x.translate(px, py); x.rotate(ang);
    x.fillStyle = '#1a1410'; x.fillRect(-3, -1.6, 19, 3.2); x.fillStyle = '#5a3a1e'; x.fillRect(-2, -0.9, 3, 1.8);
    x.fillStyle = '#e0b040'; x.fillRect(1, -2.4, 1.4, 4.8); x.fillStyle = w.color; x.fillRect(2.4, -1, 12, 2); x.fillStyle = w.glow; x.fillRect(2.4, -1, 12, 0.8);
    x.restore();
  };
  if (dir === 'up') sword(14, 33, -2.2);
  x.drawImage(spr, ox, oy);
  if (dir === 'down') sword(26, 34, 1.9); else if (dir === 'side') sword(23, 33, -1.15);
}

type Row = { h: string } | { html: string; on: boolean; locked: boolean; cls: string; pick: () => void };

function openPrep(done?: () => void) {
  let tab = 'body', dirIdx = 0;
  const p = panel(
    `<h2>เตรียมตัวออกศึก</h2><div class="sub">แต่งกายและเลือกอุปกรณ์ของอัศวิน — ไอเท็มใหม่ปลดล็อกตามเลเวล (แตะตัวละครเพื่อหมุนดู)</div>` +
    `<div class="prep-body"><div><div class="prep-view"><canvas id="pv" width="40" height="48"></canvas></div><div class="prep-stats" id="pst"></div></div>` +
    `<div><div class="tabs" id="tabs"></div><div class="opts" id="opts"></div></div></div><button class="btn gold" id="prep-ok">พร้อมออกเดินทาง</button>`);
  p.el.classList.add('prep');
  const pv = p.el.querySelector('#pv') as HTMLCanvasElement, tabsEl = p.el.querySelector('#tabs') as HTMLElement, optsEl = p.el.querySelector('#opts') as HTMLElement, pst = p.el.querySelector('#pst') as HTMLElement;
  const TABS: [string, string][] = [['body', 'ร่างกาย'], ['head', 'ศีรษะ'], ['armor', 'เกราะ'], ['cape', 'ผ้าคลุม'], ['boots', 'รองเท้า'], ['weapon', 'ดาบ'], ['sub', 'อาวุธเสริม'], ['charm', 'เครื่องราง']];
  const sw = (c: string | null) => `<span class="sw" style="background:${c ?? '#cdbb86'}"></span>`;

  const colorSet = (title: string, colors: (string | null)[], names: string[], cur: number, set: (i: number) => void): Row[] => [
    { h: title },
    ...colors.map((c, i): Row => ({ html: `${sw(c)}${names[i]}`, on: cur === i, locked: false, cls: 'sw-opt', pick: () => set(i) })),
  ];
  const itemSet = (title: string, list: { name: string; desc: string; minLevel: number }[], cur: number, set: (i: number) => void): Row[] => [
    { h: title },
    ...list.map((o, i): Row => ({ html: `${o.name}<small>${o.minLevel > save.level ? `ปลดล็อกที่เลเวล ${o.minLevel}` : o.desc}</small>`, on: cur === i, locked: o.minLevel > save.level, cls: '', pick: () => set(i) })),
  ];
  const rowsFor = (): Row[] => {
    const L = save.look, G = save.gear;
    switch (tab) {
      case 'body': return [...colorSet('สีผิว', SKINS, COLOR_NAMES.skin, L.skin, i => { L.skin = i; }), ...colorSet('สีผม', HAIRS, COLOR_NAMES.hair, L.hair, i => { L.hair = i; })];
      case 'head': return [...itemSet('หมวก / เครื่องประดับศีรษะ', HELMETS, L.helmet, i => { L.helmet = i; }), ...colorSet('สีพู่ / ผ้าคาดศีรษะ', PLUMES, COLOR_NAMES.plume, L.plume, i => { L.plume = i; })];
      case 'armor': return [...itemSet('เกราะ', ARMORS.map(a => ({ name: a.name, desc: `ป้องกัน +${a.def}`, minLevel: a.minLevel })), G.armor, i => { G.armor = i; }), ...colorSet('สีขอบเกราะและเข็มขัด', TRIMS, COLOR_NAMES.trim, L.trim, i => { L.trim = i; })];
      case 'cape': return colorSet('ผ้าคลุม', CAPES, CAPE_NAMES, L.cape, i => { L.cape = i; });
      case 'boots': return colorSet('รองเท้าบู๊ต', BOOTS, COLOR_NAMES.boots, L.boots, i => { L.boots = i; });
      case 'weapon': return itemSet('ดาบประจำตัว', WEAPONS.map(w => ({ name: w.name, desc: `โจมตี +${w.atk}`, minLevel: w.minLevel })), G.weapon, i => { G.weapon = i; });
      case 'sub': return itemSet('อาวุธเสริม (ใช้งานอัตโนมัติ)', SUBS, G.sub, i => { G.sub = i; });
      default: return itemSet('เครื่องราง', CHARMS, G.charm, i => { G.charm = i; });
    }
  };
  const refresh = () => {
    drawPreview(pv, dirIdx);
    const s = stats();
    pst.innerHTML = `LV <b>${save.level}</b> • HP <b>${s.maxHp}</b> • โจมตี <b>${s.atk}</b> • ป้องกัน <b>${s.def}</b><br>${esc(gw().name)} • ${esc(ga().name)}<br>${esc(SUBS[save.gear.sub].name)} • ${esc(CHARMS[save.gear.charm].name)}`;
    tabsEl.innerHTML = '';
    for (const [k, label] of TABS) {
      const b = document.createElement('button'); b.className = 'tab' + (k === tab ? ' on' : ''); b.textContent = label;
      b.onclick = () => { tab = k; sfx('click'); refresh(); }; tabsEl.appendChild(b);
    }
    optsEl.innerHTML = '';
    for (const row of rowsFor()) {
      if ('h' in row) { const d = document.createElement('div'); d.className = 'opt-h'; d.textContent = row.h; optsEl.appendChild(d); continue; }
      const b = document.createElement('button'); b.className = `opt ${row.cls}${row.on ? ' on' : ''}${row.locked ? ' locked' : ''}`; b.innerHTML = row.html;
      b.onclick = () => {
        if (row.locked) { sfx('wrong'); toast('ยังไม่ปลดล็อก — เลเวลยังไม่ถึง'); return; }
        row.pick(); hp = Math.min(hp, stats().maxHp); save.prepped = true; writeSave(save); sfx('equip'); refreshHud(); refresh();
      };
      optsEl.appendChild(b);
    }
  };
  pv.onclick = () => { dirIdx++; sfx('click'); drawPreview(pv, dirIdx); };
  p.onX = () => (p.el.querySelector('#prep-ok') as HTMLElement).click();
  (p.el.querySelector('#prep-ok') as HTMLElement).onclick = () => { sfx('click'); save.prepped = true; writeSave(save); p.close(); done?.(); };
  refresh();
}

interface Puddle { x: number; y: number; r: number; delay: number; life: number; tick: number; c: string; dmg: number; }
let puddles: Puddle[] = [];

function rainStrike(e: Enemy) {
  const n = e.rage ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), r0 = i === 0 ? 0 : rand(14, 64);
    teles.push({ x: P.x + Math.cos(a) * r0, y: P.y + Math.sin(a) * r0, kind: 'circle', r: 22, ang: 0, len: 0, t: -i * 0.12, dur: 0.95, boom: true, dmg: e.atk * 1.1, color: e.def.c2 });
  }
}
function summonMinions(e: Enemy) {
  if (enemies.filter(x => !x.boss && !x.dead).length > ENEMY_MAX + 4) return;
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI + rand(0, 1), x = e.x + Math.cos(a) * 34, y = e.y + Math.sin(a) * 26;
    if (blockedAt(x, y, 7)) continue;
    const def = stage.enemies[k % stage.enemies.length];
    const m = mkEnemy(def, stage.rec, false, x, y); m.awake = true; m.born = 0.01; enemies.push(m);
    ring(x, y, 20, e.def.c2, 0.4, 2.5); burst(x, y - 6, [e.def.c2, '#fff'], 14, 60, 20);
  }
  sfx('crit');
}

// ================================================================== GPS / quest route
let gpsOn = true, gpsKey = '', gpsPath: { x: number; y: number }[] = [], gpsT = 0, gpsMeters = 0;
let gpsTarget: { x: number; y: number; text: string; kind: string } | null = null;
let gpsField: Int16Array | null = null;

function currentObjective() {
  if (!bossAlive) return null;
  for (let i = 0; i < stage.npcs.length; i++) {
    const n = npcs.find(x => x.idx === i);
    if (n && !save.quests[`${stage.id}-${i}`]) return { x: n.x, y: n.y, text: `ไปคุยกับ ${stage.npcs[i].name} เพื่อรับภารกิจ`, kind: 'npc' };
  }
  if (save.level < stage.rec + 1) {
    let best: Enemy | null = null, bd = 1e9;
    for (const e of enemies) { if (e.boss || e.dead) continue; const d = dist(e.x, e.y, P.x, P.y); if (d < bd) { bd = d; best = e; } }
    if (best) return { x: best.x, y: best.y, text: `ฝึกเลเวลให้ถึง LV ${stage.rec + 1} ก่อนท้าบอส (ตอนนี้ LV ${save.level})`, kind: 'grind' };
  }
  const b = enemies.find(e => e.boss && !e.dead);
  return b ? { x: b.x, y: b.y, text: `ท้าสู้ ${stage.boss.name} ที่ลานบอส`, kind: 'boss' } : null;
}
function computeField(tx: number, ty: number) {
  const w = map.w, f = new Int16Array(w * map.h).fill(-1);
  const q: number[] = [ty * w + tx]; f[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % w, cy = (c / w) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
      const i = ny * w + nx;
      if (f[i] >= 0 || map.solid[i] || map.water[i]) continue;
      f[i] = f[c] + 1; q.push(i);
    }
  }
  return f;
}
function updateGps(dt: number) {
  gpsT -= dt; if (gpsT > 0) return; gpsT = 0.3;
  const obj = currentObjective(); gpsTarget = obj;
  const box = $('objective');
  if (!obj) { gpsPath = []; box.classList.add('hidden'); return; }
  const ttx = clamp(Math.floor(obj.x / TS), 0, map.w - 1), tty = clamp(Math.floor(obj.y / TS), 0, map.h - 1);
  const key = `${ttx},${tty}`;
  if (key !== gpsKey || !gpsField) { gpsKey = key; gpsField = computeField(ttx, tty); }
  const f = gpsField, w = map.w;
  let cx = Math.floor(P.x / TS), cy = Math.floor(P.y / TS);
  const pts = [{ x: P.x, y: P.y }]; let steps = 0;
  if (f[cy * w + cx] < 0) { // standing on a blocked tile edge: hop to the closest open neighbour
    let bv = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = f[(cy + dy) * w + (cx + dx)]; if (v >= 0 && v < bv) { bv = v; } }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (f[(cy + dy) * w + (cx + dx)] === bv) { cx += dx; cy += dy; dy = 2; break; }
  }
  let cur = f[cy * w + cx];
  while (cur > 0 && steps++ < 600) {
    let bx = cx, by = cy, bv = cur;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
      const v = f[ny * w + nx]; if (v < 0 || v >= bv) continue;
      if (ox && oy && (f[cy * w + nx] < 0 || f[ny * w + cx] < 0)) continue;
      bv = v; bx = nx; by = ny;
    }
    if (bx === cx && by === cy) break;
    cx = bx; cy = by; cur = bv; pts.push({ x: cx * TS + 8, y: cy * TS + 8 });
  }
  pts.push({ x: obj.x, y: obj.y });
  gpsPath = pts; gpsMeters = Math.round(steps * 2);
  box.classList.remove('hidden');
  $('obj-text').textContent = obj.text; $('obj-dist').textContent = `ห่างอีกประมาณ ${gpsMeters} ม.`;
  box.dataset.kind = obj.kind;
}

function renderMini(c: CanvasRenderingContext2D) {
  if (!mmShow) return;
  c.clearRect(0, 0, map.w, map.h); c.drawImage(mmShow, 0, 0);
  const at = (x: number, y: number) => expl[Math.floor(y / TS) * map.w + Math.floor(x / TS)] === 1;
  if (gpsOn && gpsPath.length > 1) {
    c.strokeStyle = '#ffe27a'; c.lineWidth = 1; c.beginPath();
    gpsPath.forEach((p, i) => i ? c.lineTo(p.x / TS, p.y / TS) : c.moveTo(p.x / TS, p.y / TS)); c.stroke();
  }
  for (const n of npcs) if (at(n.x, n.y)) { c.fillStyle = '#ffd84a'; c.fillRect(Math.floor(n.x / TS) - 1, Math.floor(n.y / TS) - 1, 3, 3); }
  for (const ch of chests) if (!ch.open && at(ch.x, ch.y)) { c.fillStyle = '#ff9a3a'; c.fillRect(Math.floor(ch.x / TS) - 1, Math.floor(ch.y / TS) - 1, 3, 3); }
  const bs = enemies.find(e => e.boss && !e.dead);
  if (bs && Math.floor(time * 2) % 2) { c.fillStyle = '#ff3a3a'; c.fillRect(Math.floor(bs.x / TS) - 2, Math.floor(bs.y / TS) - 2, 5, 5); }
  if (gpsOn && gpsTarget) { c.strokeStyle = '#fff'; c.strokeRect(Math.floor(gpsTarget.x / TS) - 2.5, Math.floor(gpsTarget.y / TS) - 2.5, 5, 5); }
  c.fillStyle = '#fff'; c.fillRect(Math.floor(P.x / TS) - 1, Math.floor(P.y / TS) - 1, 3, 3);
  c.fillStyle = '#3a8aff'; c.fillRect(Math.floor(P.x / TS), Math.floor(P.y / TS), 1, 1);
}
function drawMinimap() { renderMini(mmEl.getContext('2d')!); }

function openWorldMap() {
  if (scene !== 'map' || !mmShow) return;
  const p = panel(
    `<h2>แผนที่ ${esc(stage.name)}</h2><div class="sub">${gpsTarget ? esc(gpsTarget.text) : 'สำรวจเพื่อเปิดเผยแผนที่'}</div>` +
    `<canvas id="wm" class="wm"></canvas>` +
    `<div class="legend"><span><i style="background:#fff"></i>คุณ</span><span><i style="background:#ffd84a"></i>NPC</span><span><i style="background:#ff9a3a"></i>หีบสมบัติ</span><span><i style="background:#ff3a3a"></i>บอส</span><span><i style="background:#ffe27a"></i>เส้นทางนำทาง</span></div>` +
    `<div class="row"><button class="btn alt" id="wm-close">ปิด</button><button class="btn" id="wm-stage">เลือกด่าน</button></div>`);
  const cv = p.el.querySelector('#wm') as HTMLCanvasElement; cv.width = map.w; cv.height = map.h;
  renderMini(cv.getContext('2d')!);
  (p.el.querySelector('#wm-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
  (p.el.querySelector('#wm-stage') as HTMLElement).onclick = () => { sfx('click'); p.close(); openStageSelect(); };
}

$('btn-map').addEventListener('click', () => { unlockAudio(); sfx('click'); if (!panelOpen()) openWorldMap(); });
mmEl.addEventListener('click', () => { unlockAudio(); sfx('click'); if (!panelOpen()) openWorldMap(); });
$('btn-prep').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene === 'map' && !panelOpen()) openPrep(); });
$('btn-gps').addEventListener('click', () => { unlockAudio(); sfx('click'); gpsOn = !gpsOn; $('btn-gps').classList.toggle('on', gpsOn); toast(gpsOn ? 'เปิดระบบนำทาง' : 'ปิดระบบนำทาง'); });

function openStageSelect() { showTitle(); }

async function goHome() {
  if (await confirmBox('กลับหน้าหลัก?', 'ความคืบหน้าบันทึกอัตโนมัติแล้ว จะกลับไปที่หน้าหลักเพื่อเลือกเมนู', 'กลับหน้าหลัก', 'เล่นต่อ')) { closeAllPanels(); showTitle(); }
}

function openMenu() {
  const s = stats(), w = gw(), a = ga();
  const nextW = WEAPONS.find(x => x.minLevel > save.level);
  const acc = save.stats.answered ? Math.round(save.stats.correct / save.stats.answered * 100) : 0;
  const p = panel(
    `<h2>อัศวินผู้กล้า</h2><div class="sub">เลเวล ${save.level} • EXP ${save.exp}/${need()}</div>` +
    `<div class="stat-grid"><span>HP <b>${Math.ceil(hp)}/${s.maxHp}</b></span><span>ทอง <b>${save.gold}</b></span><span>โจมตี <b>${s.atk}</b></span><span>ป้องกัน <b>${s.def}</b></span>` +
    `<span>ดาบ <b>${esc(w.name)}</b></span><span>เกราะ <b>${esc(a.name)}</b></span><span>ตอบถูก <b>${save.stats.correct}/${save.stats.answered}</b></span><span>แม่นยำ <b>${acc}%</b></span></div>` +
    (nextW ? `<div class="unlock">ดาบประจำตัวถัดไป: ${esc(nextW.name)} ที่เลเวล ${nextW.minLevel}</div>` : '') +
    `<button class="btn gold" id="m-resume">เล่นต่อ</button><button class="btn" id="m-prep">เตรียมตัว / แต่งกาย / อุปกรณ์</button><button class="btn" id="m-stage">เลือกด่าน</button><button class="btn" id="m-home">กลับหน้าหลัก</button><button class="btn alt" id="m-reset">เริ่มเกมใหม่ทั้งหมด</button>`);
  (p.el.querySelector('#m-resume') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
  (p.el.querySelector('#m-prep') as HTMLElement).onclick = () => { sfx('click'); p.close(); openPrep(); };
  (p.el.querySelector('#m-stage') as HTMLElement).onclick = () => { sfx('click'); p.close(); openStageSelect(); };
  (p.el.querySelector('#m-home') as HTMLElement).onclick = () => { sfx('click'); p.close(); void goHome(); };
  (p.el.querySelector('#m-reset') as HTMLElement).onclick = async () => {
    if (await confirmBox('เริ่มใหม่?', 'ความคืบหน้าทั้งหมดจะหายไป', 'เริ่มใหม่', 'ยกเลิก')) { p.close(); wipeSave(); save = freshSave(); hp = stats().maxHp; sp = 0; showTitle(); }
  };
}

const TIPS = [
  'เคล็ดลับ: กดพุ่งหลบเมื่อเห็นวงหรือเส้นสีแดงบนพื้น',
  'เคล็ดลับ: ฟันต่อเนื่อง 3 ครั้ง ท่าสุดท้ายเป็นฟันหมุนรอบตัว',
  'เคล็ดลับ: ตอบคำถามถูกเพื่อปล่อยท่าไม้ตายปัญญาใส่ศัตรูทั้งจอ',
  'เคล็ดลับ: เปิดหีบสมบัติตามลานกลางป่า ได้ทอง EXP และบางครั้งฟื้น HP',
  'เคล็ดลับ: ตามเส้นนำทางสีทองเพื่อไปหา NPC และบอสให้ถูกทาง',
  'เคล็ดลับ: มอนสเตอร์ที่มีดาว ★ คือหัวหน้า แข็งแกร่งกว่าแต่ได้ EXP มากกว่า',
  'เคล็ดลับ: ฟันกระสุนของศัตรูให้สะท้อนทิ้งได้',
  'เคล็ดลับ: ชื่อมอนสเตอร์สีแดงหมายถึงเลเวลสูงกว่าเรามาก ระวังตัว',
];
let tipTimer = 0;
function hideLobby() { $('lobby').classList.add('hidden'); clearInterval(tipTimer); }

function openHowTo() {
  const p = panel(
    `<h2>วิธีเล่น</h2><div class="sub">เป้าหมาย: เดินทาง 10 ดินแดน เอาชนะบอสทุกตน และเก็บความรู้กลับคืนมา</div>` +
    `<div class="how"><b>บนมือถือ</b><span>จอยสติ๊กซ้าย = เดิน • ฟัน (กดค้างได้) • พุ่ง = หลบพร้อมอมตะสั้น ๆ • ปัญญา = ตอบคำถามปล่อยท่าไม้ตาย</span>` +
    `<b>บนคอมพิวเตอร์</b><span>WASD / ลูกศร = เดิน • Space/J = ฟัน • K/Shift = พุ่ง • Q = ปัญญา • E = คุย/เปิดหีบ • Esc = เมนู</span>` +
    `<b>การต่อสู้</b><span>ฟันติดกัน 3 ท่าเป็นคอมโบ มอนสเตอร์มีท่าโจมตีเฉพาะตัว ให้ดูวงหรือเส้นสีแดงบนพื้นแล้วกดพุ่งหลบ</span>` +
    `<b>คำถามปัญญา</b><span>ประวัติศาสตร์ คณิต วิทย์ ความยากปรับตามเลเวล ตอบถูกจึงปล่อยท่าไม้ตายได้</span>` +
    `<b>นำทาง</b><span>เส้นสีทองบนพื้นพาไปหา NPC เควส และบอสตามลำดับ ปุ่ม "แผนที่" ดูภาพรวมทั้งด่านได้</span>` +
    `<b>เลเวลและอุปกรณ์</b><span>เลเวลสูงขึ้นปลดล็อกดาบ เกราะ อาวุธเสริม เครื่องราง และด่านใหม่ ปรับแต่งได้ที่ปุ่ม "แต่งตัว"</span></div>` +
    `<button class="btn gold" id="how-ok">เข้าใจแล้ว</button>`);
  (p.el.querySelector('#how-ok') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
}

function showTitle() {
  scene = 'title'; inStage = false;
  closeAllPanels();
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('bossbar').classList.add('hidden'); mmEl.classList.add('hidden'); $('side-btns').classList.add('hidden'); $('objective').classList.add('hidden');
  setMusic('off');
  const lobby = $('lobby');
  const has = save.started;
  const stageRows = STAGES.map(st => {
    const prevOk = st.id === 1 || save.cleared.includes(st.id - 1), open = prevOk && save.level >= st.rec;
    const badge = save.cleared.includes(st.id) ? 'ผ่านแล้ว' : open ? 'เปิด' : !prevOk ? 'ผ่านด่านก่อน' : `ต้อง LV ${st.rec}`;
    return `<button class="lb-stage ${open ? '' : 'locked'} ${save.cleared.includes(st.id) ? 'done' : ''}" data-id="${st.id}"><b>${st.id}</b><span>${esc(st.name)}<small>${esc(st.sub)} • แนะนำ LV ${st.rec}</small></span><i>${badge}</i></button>`;
  }).join('');
  lobby.innerHTML =
    `<div class="lb-logo"><div class="lb-title">THE FIGHT<br>KING</div><div class="lb-sub">ตำนานอัศวินผู้พิทักษ์ปัญญา</div><div class="lb-tag">ผจญภัย 10 ดินแดน • ฟาร์มเลเวล • เรียนรู้ไปพร้อมกัน</div></div>` +
    `<div class="lb-menu">` +
    (has
      ? `<div class="lb-card"><div class="lb-lv">LV<b>${save.level}</b></div><div class="lb-info"><b>อัศวินผู้กล้า</b><br>ผ่านแล้ว <b>${save.cleared.length}/10</b> ด่าน • ทอง <b>${save.gold}</b><br>${esc(gw().name)} • ${esc(ga().name)}</div></div>` +
        `<div class="lb-modes"><button class="lb-mode on" id="lbm-story">เนื้อเรื่อง</button><button class="lb-mode soon" id="lbm-cave">ถ้ำ/เหมือง<em>เร็ว ๆ นี้</em></button><button class="lb-mode soon" id="lbm-free">อิสระ<em>เร็ว ๆ นี้</em></button></div>` +
        `<div class="lb-stages" id="lb-stages">${stageRows}</div>`
      : `<button class="lb-btn primary" id="lb-start"><span>เริ่มการผจญภัย</span><small>รับพระราชโองการและออกเดินทาง</small></button>`) +
    `<div class="lb-actions"><button class="lb-act" id="lb-prep"><b>แต่งตัว</b><small>ชุด/อาวุธ/เครื่องราง</small></button><button class="lb-act soon" id="lb-party"><b>ชวนเพื่อน</b><small>ออนไลน์ เร็ว ๆ นี้</small></button><button class="lb-act" id="lb-how"><b>วิธีเล่น</b><small>ปุ่มและเคล็ดลับ</small></button></div>` +
    `<div class="lb-foot"><button class="lb-mini" id="lb-mute">${isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด'}</button>${has ? '<button class="lb-mini" id="lb-reset">เริ่มเกมใหม่</button>' : ''}</div></div>` +
    `<div class="lb-tip" id="lb-tip">${TIPS[0]}</div><div class="lb-ver">v0.5 • บันทึกอัตโนมัติ</div>`;
  lobby.classList.remove('hidden');
  let ti = 0; clearInterval(tipTimer);
  tipTimer = window.setInterval(() => { ti = (ti + 1) % TIPS.length; const el = document.getElementById('lb-tip'); if (el) { el.classList.remove('in'); void el.offsetWidth; el.textContent = TIPS[ti]; el.classList.add('in'); } }, 4200);

  const el = (id: string) => lobby.querySelector('#' + id) as HTMLElement | null;
  const startNew = async () => {
    save = freshSave(); save.started = true; writeSave(save); hp = stats().maxHp; sp = 0;
    hideLobby();
    await dialog('พระราชโองการ', [STORY_INTRO], 'รับบัญชา');
    openPrep(() => showTitle());
  };
  const st0 = el('lb-start'); if (st0) st0.onclick = () => { unlockAudio(); sfx('click'); void startNew(); };
  const rs = el('lb-reset'); if (rs) rs.onclick = async () => { unlockAudio(); sfx('click'); if (await confirmBox('เริ่มใหม่?', 'ความคืบหน้าเดิมจะหายไป', 'เริ่มใหม่', 'ยกเลิก')) { wipeSave(); await startNew(); } };
  lobby.querySelectorAll<HTMLButtonElement>('.lb-stage').forEach(b => {
    b.onclick = () => {
      unlockAudio();
      const id = +b.dataset.id!, sdef = STAGES[id - 1];
      if (b.classList.contains('locked')) { sfx('wrong'); toast(save.level < sdef.rec ? `ต้องเลเวล ${sdef.rec} ขึ้นไป` : 'ต้องผ่านด่านก่อนหน้าก่อน'); return; }
      sfx('click'); hideLobby(); $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden'); void enterStage(id);
    };
  });
  for (const id of ['lbm-cave', 'lbm-free', 'lb-party']) { const b = el(id); if (b) b.onclick = () => { sfx('click'); toast(id === 'lb-party' ? 'โหมดออนไลน์และชวนเพื่อน เร็ว ๆ นี้' : 'โหมดนี้เร็ว ๆ นี้'); }; }
  el('lb-prep')!.onclick = () => { unlockAudio(); sfx('click'); openPrep(() => showTitle()); };
  el('lb-how')!.onclick = () => { unlockAudio(); sfx('click'); openHowTo(); };
  el('lb-mute')!.onclick = () => { unlockAudio(); toggleMute(); el('lb-mute')!.textContent = isMuted() ? 'เสียง: ปิด' : 'เสียง: เปิด'; };
}

// ================================================================== update: enemies
function attackersCount() { return enemies.filter(e => !e.dead && !e.boss && (e.st === 'wind' || e.st === 'act')).length; }

function updateEnemy(e: Enemy, dt: number) {
  e.flash = Math.max(0, e.flash - dt); e.hurtT = Math.max(0, e.hurtT - dt); e.slow = Math.max(0, e.slow - dt);
  if (e.born > 0 && !e.boss) e.born = Math.min(1, e.born + dt * 2); // fade-in
  if (e.burn > 0) { e.burn -= dt; e.hp -= (stats().atk * 0.5) * dt; if (Math.random() < dt * 14) burst(e.x, e.y - 8, ['#ff7a2f', '#ffcf4a'], 1, 20, 40); if (e.hp <= 0) { killEnemy(e); return; } }
  // knockback
  const kdec = Math.exp(-dt * 9);
  const nx = e.x + e.kx * dt, ny = e.y + e.ky * dt;
  if (!blockedAt(nx, e.y, e.r)) e.x = nx; else e.kx = 0;
  if (!blockedAt(e.x, ny, e.r)) e.y = ny; else e.ky = 0;
  e.kx *= kdec; e.ky *= kdec;

  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  const slow = e.slow > 0 ? 0.45 : 1;
  const move = (ax: number, ay: number, spd: number) => {
    const mx = e.x + ax * spd * slow * dt, my = e.y + ay * spd * slow * dt;
    if (!blockedAt(mx, e.y, e.r)) e.x = mx;
    if (!blockedAt(e.x, my, e.r)) e.y = my;
    if (Math.abs(ax) > 0.15) e.flip = ax > 0 ? 1 : -1;
  };
  if (e.boss) { updateBoss(e, dt, dx, dy, d, move); return; }

  if (!e.awake) {
    e.wt -= dt;
    if (e.wt <= 0) { e.wt = rand(1, 2.4); const a = Math.random() * 6.28, s = Math.random() < 0.4 ? 0 : 1; e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s; }
    move(e.vx, e.vy, 12);
    if (d < 78 && P.inv < 90 && !P.dead) e.awake = true;
    return;
  }
  const type = e.def.type;
  const PATS: Record<string, string[]> = { blob: ['leap', 'spit'], beast: ['combo', 'pounce'], skull: ['orb', 'volley'] };
  const RANGE: Record<string, number> = { leap: 74, spit: 105, combo: 64, pounce: 52, orb: 135, volley: 100 };
  const WIND: Record<string, number> = { leap: 0.7, spit: 0.6, combo: 0.5, pounce: 0.55, orb: 0.75, volley: 0.6 };
  e.cd -= dt;
  if (e.st === 'idle') {
    const pref = type === 'skull' ? 70 : type === 'beast' ? 30 : 26;
    if (type === 'skull' && d < 52) move(-dx / d, -dy / d, e.speed);
    else if (d > pref) move(dx / d, dy / d, e.speed);
    if (d > 260) e.awake = false;
    if (e.cd <= 0 && attackersCount() < 2 && !P.dead) {
      const opts = PATS[type].filter(p => d <= RANGE[p]);
      if (opts.length) {
        e.pat = opts[Math.floor(Math.random() * opts.length)];
        e.st = 'wind'; e.stT = 0; e.didHit = false; e.sub = 0; e.segT = 0; e.ang = Math.atan2(dy, dx);
        e.stDur = WIND[e.pat] * (e.elite ? 0.85 : 1);
        e.tx = P.x; e.ty = P.y; e.sx = e.x; e.sy = e.y;
        if (e.pat === 'leap') teles.push({ x: e.tx, y: e.ty, kind: 'circle', r: 28, ang: 0, len: 0, t: 0, dur: e.stDur, owner: e });
        if (e.pat === 'spit') teles.push({ x: e.tx, y: e.ty, kind: 'circle', r: 24, ang: 0, len: 0, t: 0, dur: e.stDur + 0.35, owner: e });
        if (e.pat === 'combo' || e.pat === 'pounce') teles.push({ x: e.x, y: e.y, kind: 'line', r: 6, ang: e.ang, len: e.pat === 'combo' ? 74 : 66, t: 0, dur: e.stDur, owner: e });
        sfx('telegraph');
      } else e.cd = 0.3;
    }
  } else if (e.st === 'wind') {
    e.stT += dt;
    if (e.stT < e.stDur * 0.55) { // lock-on: tracks the player, then commits
      e.ang = Math.atan2(dy, dx);
      if (e.pat === 'leap' || e.pat === 'spit') { e.tx = P.x; e.ty = P.y; }
      for (const t of teles) if (t.owner === e) { if (t.kind === 'circle') { t.x = e.tx; t.y = e.ty; } else { t.x = e.x; t.y = e.y; t.ang = e.ang; } }
    }
    if (e.pat === 'orb' && Math.random() < 0.6) burst(e.x, e.y - 10, [e.def.c2, '#fff'], 1, 14, 0, true, 0);
    if (e.stT >= e.stDur) {
      e.st = 'act'; e.stT = 0; e.didHit = false; e.sub = 0; e.segT = 0; e.sx = e.x; e.sy = e.y;
      if (e.pat === 'leap') e.stDur = 0.42;
      else if (e.pat === 'spit') {
        e.stDur = 0.2; sfx('swing');
        puddles.push({ x: e.tx, y: e.ty, r: 24, delay: 0.35, life: 3.4, tick: 0, c: e.def.c1, dmg: e.atk * 0.45 });
        burst(e.x, e.y - 8, [e.def.c1, '#fff'], 10, 60, 30, false, 60);
      } else if (e.pat === 'combo') e.stDur = 0.66;
      else if (e.pat === 'pounce') e.stDur = 0.3;
      else if (e.pat === 'orb') {
        e.stDur = 0.2; sfx('crit');
        projs.push({ x: e.x, y: e.y - 10, vx: Math.cos(e.ang) * 52, vy: Math.sin(e.ang) * 52, dmg: e.atk * 1.2, life: 4.5, c: e.def.c2, r: 4.5, home: true });
      } else {
        e.stDur = 0.2; sfx('swing');
        const n = e.elite ? 5 : 3;
        for (let i = 0; i < n; i++) { const a = e.ang + (i / (n - 1) - 0.5) * (n > 3 ? 0.9 : 0.6); projs.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 84, vy: Math.sin(a) * 84, dmg: e.atk * 0.8, life: 2.6, c: e.def.c2, r: 3 }); }
      }
    }
  } else if (e.st === 'act') {
    e.stT += dt;
    if (e.pat === 'leap') {
      const k = clamp(e.stT / e.stDur, 0, 1);
      e.x = e.sx + (e.tx - e.sx) * k; e.y = e.sy + (e.ty - e.sy) * k; e.z = Math.sin(k * Math.PI) * 20;
      if (k >= 1 && !e.didHit) {
        e.didHit = true; e.z = 0;
        if (blockedAt(e.x, e.y, e.r)) { e.x = e.sx; e.y = e.sy; }
        ring(e.x, e.y - 2, 30, e.def.c1, 0.3, 3); burst(e.x, e.y - 2, [e.def.c1, '#fff'], 18, 70, 10, false, 60); addShake(5); sfx('hit');
        if (dist(e.x, e.y, P.x, P.y) < 30) hurtPlayer(e.atk * 1.4, e.x, e.y, 120);
      }
    } else if (e.pat === 'combo') {
      e.segT += dt;
      if (e.segT >= 0.22) { e.segT = 0; e.sub++; e.didHit = false; e.ang = Math.atan2(dy, dx); sfx('swing'); }
      if (e.sub < 3) {
        move(Math.cos(e.ang), Math.sin(e.ang), 175);
        if (Math.random() < 0.7) burst(e.x, e.y - 6, [e.def.c1, '#fff'], 1, 20, 5, true, 0);
        if (!e.didHit && dist(e.x, e.y, P.x, P.y) < 13) { e.didHit = true; hurtPlayer(e.atk * 0.8, e.x, e.y, 90); }
      }
    } else if (e.pat === 'pounce') {
      move(Math.cos(e.ang), Math.sin(e.ang), 235);
      if (Math.random() < 0.8) burst(e.x, e.y - 6, [e.def.c1, '#fff'], 1, 24, 5, true, 0);
      if (!e.didHit && dist(e.x, e.y, P.x, P.y) < 14) { e.didHit = true; hurtPlayer(e.atk * 1.6, e.x, e.y, 150); }
    }
    if (e.stT >= e.stDur) { e.st = 'rec'; e.stT = 0; e.stDur = e.pat === 'combo' ? 0.8 : 0.6; e.z = 0; teles = teles.filter(t => t.owner !== e); }
  } else {
    e.stT += dt;
    if (e.stT >= e.stDur) { e.st = 'idle'; e.cd = rand(0.7, 1.6) / (e.elite ? 1.3 : 1); }
  }
  // separate
  for (const o of enemies) {
    if (o === e || o.dead || o.boss) continue;
    const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy);
    if (od < 10 && od > 0.01) { e.x += (ox / od) * 20 * dt; e.y += (oy / od) * 20 * dt; }
  }
}

function updateBoss(e: Enemy, dt: number, dx: number, dy: number, d: number, move: (ax: number, ay: number, s: number) => void) {
  const locked = save.level < stage.rec + 1;
  if (!bossAnnounced) {
    if (d < 120 && !locked && !P.dead) {
      bossAnnounced = true; e.awake = true;
      ($('boss-name') as HTMLElement).textContent = `${e.def.name}  Lv.${e.level}`;
      $('bossbar').classList.remove('hidden'); refreshBossBar();
      sfx('telegraph'); setMusic('battle', stage.theme.root - 5); addShake(10);
      void dialog(e.def.name, [stage.bossIntro], 'เข้าต่อสู้!', e.spr);
    }
    return;
  }
  if (P.dead) return;
  e.rage = e.hp < e.maxHp * 0.5;
  e.cd -= dt;
  if (e.st === 'idle') {
    if (d > 36) move(dx / d, dy / d, e.speed * (e.rage ? 1.4 : 1));
    if (e.cd <= 0) {
      const pats = e.rage ? ['slam', 'charge', 'fan', 'rain', 'rain', 'summon', 'slam'] : ['slam', 'charge', 'fan', 'rain'];
      e.pat = pats[Math.floor(Math.random() * pats.length)];
      e.st = 'wind'; e.stT = 0; e.didHit = false; e.ang = Math.atan2(dy, dx);
      e.stDur = e.pat === 'slam' ? 0.95 : e.pat === 'charge' ? 0.8 : e.pat === 'summon' ? 0.8 : 0.65;
      if (e.rage) e.stDur *= 0.8;
      if (e.pat === 'slam') teles.push({ x: e.x, y: e.y, kind: 'circle', r: 46, ang: 0, len: 0, t: 0, dur: e.stDur });
      if (e.pat === 'charge') teles.push({ x: e.x, y: e.y, kind: 'line', r: 12, ang: e.ang, len: 140, t: 0, dur: e.stDur });
      sfx('telegraph');
    }
  } else if (e.st === 'wind') {
    e.stT += dt;
    if (e.pat === 'charge' && e.stT < e.stDur * 0.5) { e.ang = Math.atan2(dy, dx); const t = teles[teles.length - 1]; if (t) { t.ang = e.ang; t.x = e.x; t.y = e.y; } }
    if (e.stT >= e.stDur) {
      e.st = 'act'; e.stT = 0; e.didHit = false;
      if (e.pat === 'slam') {
        e.stDur = 0.2; addShake(18); sfx('crit');
        ring(e.x, e.y - 2, 46, '#ffb060', 0.35, 4); burst(e.x, e.y - 2, [e.def.c1, '#fff'], 34, 100, 10);
        if (dist(P.x, P.y, e.x, e.y) < 48) hurtPlayer(e.atk * 1.5, e.x, e.y, 150);
        if (e.rage) for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; projs.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * 62, vy: Math.sin(a) * 62, dmg: e.atk * 0.7, life: 3, c: e.def.c2, r: 3 }); }
      } else if (e.pat === 'charge') e.stDur = 0.5;
      else if (e.pat === 'rain') { e.stDur = 1.0; rainStrike(e); }
      else if (e.pat === 'summon') { e.stDur = 0.6; summonMinions(e); }
      else {
        e.stDur = 0.2; const n = e.rage ? 9 : 5, spread = e.rage ? 2.6 : 1.2;
        for (let i = 0; i < n; i++) { const a = e.ang + ((i / (n - 1) - 0.5) * spread); projs.push({ x: e.x, y: e.y - 14, vx: Math.cos(a) * 78, vy: Math.sin(a) * 78, dmg: e.atk * 0.8, life: 3, c: e.def.c2, r: 3.5 }); }
        sfx('crit');
      }
    }
  } else if (e.st === 'act') {
    e.stT += dt;
    if (e.pat === 'charge') {
      move(Math.cos(e.ang), Math.sin(e.ang), 230);
      if (Math.random() < 0.6) burst(e.x, e.y - 2, [e.def.c1, '#fff'], 1, 20, 10, false, 10);
      if (!e.didHit && dist(e.x, e.y, P.x, P.y) < 18) { e.didHit = true; hurtPlayer(e.atk * 1.3, e.x, e.y, 160); }
    }
    if (e.stT >= e.stDur) { e.st = 'rec'; e.stT = 0; e.stDur = 0.55; teles = teles.filter(t => t.kind !== 'line'); }
  } else {
    e.stT += dt;
    if (e.stT >= e.stDur) { e.st = 'idle'; e.cd = e.rage ? rand(0.4, 0.8) : rand(0.8, 1.4); }
  }
}

// ================================================================== update: world
function updateWorld(dt: number) {
  // ---- player
  P.inv = Math.max(0, P.inv - dt); P.dashCd = Math.max(0, P.dashCd - dt); P.comboT = Math.max(0, P.comboT - dt);
  P.anim += dt;
  let mx = stick.x, my = stick.y;
  if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
  if (keys.has('arrowright') || keys.has('d')) mx += 1;
  if (keys.has('arrowup') || keys.has('w')) my -= 1;
  if (keys.has('arrowdown') || keys.has('s')) my += 1;
  const m = Math.hypot(mx, my);
  P.moving = m > 0.1 && P.dashT <= 0;
  if (m > 1) { mx /= m; my /= m; }

  if (flags.dodge && P.dashCd <= 0) {
    flags.dodge = false;
    const a = m > 0.1 ? Math.atan2(my, mx) : P.fa;
    P.dashT = 0.17; P.dashCd = 0.65; P.dvx = Math.cos(a) * 250; P.dvy = Math.sin(a) * 250; P.inv = Math.max(P.inv, 0.3); P.fa = a;
    sfx('dodge'); burst(P.x, P.y - 2, ['#fff', '#cfe8ff'], 10, 40, 10, false, 0);
  }
  flags.dodge = false;
  if (flags.atk) { P.atkBuf = 0.22; flags.atk = false; }
  P.atkBuf = Math.max(0, P.atkBuf - dt);
  const wantAtk = P.atkBuf > 0 || held.atk || keys.has(' ') || keys.has('j') || keys.has('z');
  if (flags.skill) { flags.skill = false; ultimate(); }
  for (let i = 0; i < 3; i++) P.scd[i] = Math.max(0, P.scd[i] - dt);
  if (flags.s1) { flags.s1 = false; castSkill(0); }
  if (flags.s2) { flags.s2 = false; castSkill(1); }
  if (flags.s3) { flags.s3 = false; castSkill(2); }
  ['btn-s1', 'btn-s2', 'btn-s3'].forEach((id, i) => { const b = $(id), c = P.scd[i]; b.classList.toggle('cd', c > 0); const t = c > 0 ? c.toFixed(1) : ''; if (b.dataset.cd !== t) b.dataset.cd = t; });

  if (P.swingT > 0) {
    P.swingT -= dt;
    if (!P.swingHit && P.swingT <= P.swingDur * 0.62) { P.swingHit = true; swingHit(); }
    if (P.swingT <= 0) { P.comboT = 0.45; }
  } else if (wantAtk && P.dashT <= 0) { P.atkBuf = 0; startSwing(); }

  let vx = 0, vy = 0;
  if (P.dashT > 0) { P.dashT -= dt; vx = P.dvx; vy = P.dvy; if (Math.random() < 0.7) P.afters.push({ x: P.x, y: P.y, t: 0.22, fa: P.fa }); if (P.strike) { strikeHits(); if (P.dashT <= 0) P.strike = false; } }
  else if (P.moving) {
    const sp2 = P.swingT > 0 ? 28 : 78;
    vx = mx * sp2; vy = my * sp2;
    if (P.swingT <= 0) P.fa = Math.atan2(my, mx);
  }
  vx += P.kx; vy += P.ky; P.kx *= Math.exp(-dt * 10); P.ky *= Math.exp(-dt * 10);
  const nx = P.x + vx * dt, ny = P.y + vy * dt;
  if (!blockedAt(nx, P.y)) P.x = nx;
  if (!blockedAt(P.x, ny)) P.y = ny;
  P.afters = P.afters.filter(a => (a.t -= dt) > 0);
  if (comboShow > 0) { comboShow -= dt; if (comboShow <= 0) comboN = 0; }

  // lock boss arena when under-leveled
  const boss = enemies.find(e => e.boss && !e.dead);
  if (boss && !bossAnnounced && save.level < stage.rec + 1) {
    const d = dist(P.x, P.y, boss.x, boss.y);
    if (d < 96) {
      const a = Math.atan2(P.y - boss.y, P.x - boss.x); P.kx = Math.cos(a) * 180; P.ky = Math.sin(a) * 180;
      lockToastT -= dt;
      if (lockToastT <= 0) { toast(`ผนึกของบอสยังแข็งแกร่งเกินไป ฟาร์มเลเวล ${stage.rec + 1} ก่อนนะ`); sfx('wrong'); lockToastT = 3; }
    }
  }

  // ---- sub weapons
  const sub = save.gear.sub;
  if (sub === 2) {
    P.subT -= dt;
    if (P.subT <= 0) {
      let best: Enemy | null = null, bd2 = 110;
      for (const e of enemies) { if (e.dead || (e.boss && !bossAnnounced)) continue; const d = dist(P.x, P.y, e.x, e.y); if (d < bd2) { bd2 = d; best = e; } }
      if (best) { P.subT = 1.7; const a = Math.atan2(best.y - P.y, best.x - P.x); for (const off of [-0.12, 0.12]) daggers.push({ x: P.x, y: P.y - 9, vx: Math.cos(a + off) * 190, vy: Math.sin(a + off) * 190, life: 0.8, a: a + off }); sfx('swing'); } else P.subT = 0.3;
    }
  }
  for (const d of daggers) {
    d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
    if (tileSolid(Math.floor(d.x / TS), Math.floor(d.y / TS))) d.life = 0;
    for (const e of enemies) { if (e.dead || (e.boss && !bossAnnounced)) continue; if (dist(d.x, d.y, e.x, e.y - 6) < e.r + 3) { d.life = 0; hitEnemy(e, Math.round(stats().atk * 0.6 * rand(0.9, 1.1)), d.a, 40, false, false, true); break; } }
  }
  daggers = daggers.filter(d => d.life > 0);
  if (sub === 3) {
    P.orbA += dt * 3.4;
    for (let k = 0; k < 2; k++) {
      const a = P.orbA + k * Math.PI, ox = P.x + Math.cos(a) * 24, oy = P.y - 9 + Math.sin(a) * 14;
      for (const e of enemies) { if (e.dead || (e.boss && !bossAnnounced)) continue; if (dist(ox, oy, e.x, e.y - 6) < e.r + 5 && (orbHit.get(e) ?? 0) <= time) { orbHit.set(e, time + 0.55); hitEnemy(e, Math.round(stats().atk * 0.45 * rand(0.9, 1.1)), a, 50, false, false, true); } }
    }
  }

  // ---- enemies
  for (const e of enemies.slice()) if (!e.dead) updateEnemy(e, dt);
  respawnT -= dt;
  if (respawnT <= 0) { respawnT = 7; if (enemies.filter(e => !e.boss && !e.dead).length < ENEMY_MAX) spawnEnemy(120); }

  // ---- projectiles
  for (const p of projs) {
    if (p.home) {
      let cur = Math.atan2(p.vy, p.vx); const want = Math.atan2(P.y - 6 - p.y, P.x - p.x);
      const diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI; cur += clamp(diff, -2.0 * dt, 2.0 * dt);
      const spd = Math.hypot(p.vx, p.vy); p.vx = Math.cos(cur) * spd; p.vy = Math.sin(cur) * spd;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (Math.random() < 0.5) parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: p.c, s: 1.2, g: 0, add: true });
    if (tileSolid(Math.floor(p.x / TS), Math.floor(p.y / TS))) p.life = 0;
    if (dist(p.x, p.y, P.x, P.y - 6) < p.r + 5 && hurtPlayer(p.dmg, p.x - p.vx, p.y - p.vy, 70)) p.life = 0;
  }
  projs = projs.filter(p => p.life > 0);
  for (const t of teles) {
    t.t += dt;
    if (t.boom && !t.done && t.t >= t.dur) {
      t.done = true; ring(t.x, t.y - 2, t.r + 6, t.color ?? '#ffb060', 0.35, 3.5); burst(t.x, t.y - 4, [t.color ?? '#ffb060', '#fff'], 22, 90, 30, true, 50); addShake(8); sfx('hit');
      if (dist(P.x, P.y, t.x, t.y) < t.r + 2) hurtPlayer(t.dmg ?? 10, t.x, t.y, 130);
    }
  }
  teles = teles.filter(t => t.t < t.dur + 0.05);
  for (const pd of puddles) {
    if (pd.delay > 0) { pd.delay -= dt; if (pd.delay <= 0) { burst(pd.x, pd.y - 2, [pd.c, '#fff'], 14, 50, 20, false, 60); sfx('hit'); } continue; }
    pd.life -= dt; pd.tick -= dt;
    if (Math.random() < dt * 8) parts.push({ x: pd.x + rand(-pd.r, pd.r) * 0.7, y: pd.y + rand(-pd.r, pd.r) * 0.5, vx: 0, vy: -rand(8, 18), life: 0.6, max: 0.6, c: pd.c, s: 1.4, g: 0, add: false });
    if (pd.tick <= 0 && dist(P.x, P.y, pd.x, pd.y) < pd.r) { pd.tick = 0.5; hurtPlayer(pd.dmg, pd.x, pd.y, 10); }
  }
  puddles = puddles.filter(pd => pd.life > 0);
  updateGps(dt);

  updateWaves(dt);

  // ---- orbs fly to player
  for (const o of orbs) {
    o.t += dt;
    if (o.t < 0.35) { o.x += o.vx * dt; o.y += o.vy * dt; o.vy += 220 * dt; }
    else { const a = Math.atan2(P.y - 8 - o.y, P.x - o.x), sp3 = 60 + (o.t - 0.35) * 420; o.x += Math.cos(a) * sp3 * dt; o.y += Math.sin(a) * sp3 * dt; }
    if (o.t > 0.35 && dist(o.x, o.y, P.x, P.y - 8) < 5) { o.t = 99; if (o.gold) sfx('coin'); burst(P.x, P.y - 8, o.gold ? ['#ffd84a'] : ['#7fe0ff'], 3, 30, 10); }
  }
  orbs = orbs.filter(o => o.t < 90);

  // ---- NPC proximity
  nearNpc = null; let bd = 26;
  for (const n of npcs) { const d = dist(P.x, P.y, n.x, n.y); if (d < bd) { bd = d; nearNpc = n; } }
  let nearChest: Chest | null = null, cd2 = 20;
  for (const c of chests) if (!c.open) { const d = dist(P.x, P.y, c.x, c.y); if (d < cd2) { cd2 = d; nearChest = c; } }
  const actBtn = $('btn-act');
  actBtn.classList.toggle('hidden', !nearNpc && !nearChest); actBtn.textContent = nearNpc ? 'คุย' : 'เปิด';
  if (flags.act) { flags.act = false; if (nearNpc) { sfx('click'); void talkNpc(nearNpc); } else if (nearChest) openChest(nearChest); }

  // slow regen out of combat
  const inCombat = enemies.some(e => !e.dead && e.awake && dist(e.x, e.y, P.x, P.y) < 120);
  if (!inCombat && hp < stats().maxHp) hp = Math.min(stats().maxHp, hp + stats().maxHp * 0.02 * dt);
  sp = Math.min(100, sp + dt * (inCombat ? 1.2 : 0.4) * spMul());
  hudT -= dt; if (hudT <= 0) { hudT = 0.25; refreshHud(); }
  revealMap(); mmT -= dt; if (mmT <= 0) { mmT = 0.1; drawMinimap(); }
}
let hudT = 0;

function updateFx(dt: number) {
  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const r of rings) { r.life -= dt; r.r = r.max * (1 - Math.pow(r.life / r.dur, 2)); }
  rings = rings.filter(r => r.life > 0);
  for (const s of slashes) s.t += dt;
  slashes = slashes.filter(s => s.t < s.dur + 0.14);
  for (const b of bolts) b.life -= dt;
  bolts = bolts.filter(b => b.life > 0);
  for (const f of floaters) { f.y -= 16 * dt; f.life -= dt; }
  floaters = floaters.filter(f => f.life > 0);
  shake = Math.max(0, shake - dt * 50); flashA = Math.max(0, flashA - dt * 2.2); hurtVig = Math.max(0, hurtVig - dt * 1.6);
}

// ================================================================== rendering
function drawSword(x: number, y: number, ang: number, glowing: boolean, t: number, spawn = true) {
  const w = gw(), wi = weaponIdx();
  const len = 10 + wi * 0.8;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  if (glowing) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = w.glow; ctx.globalAlpha = 0.5; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(len + 3, 0); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  ctx.fillStyle = '#1a1410'; ctx.fillRect(-3, -1.6, len + 6, 3.2);
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-2, -0.9, 3, 1.8);
  ctx.fillStyle = '#e0b040'; ctx.fillRect(1, -2.4, 1.4, 4.8);
  ctx.fillStyle = w.color; ctx.fillRect(2.4, -1, len, 2);
  ctx.fillStyle = w.glow; ctx.fillRect(2.4, -1, len, 0.8);
  ctx.fillStyle = '#fff'; ctx.fillRect(2.4 + len - 1, -0.6, 1.2, 1.2);
  ctx.restore();
  // aura sparkles on the tip
  if (spawn && Math.random() < 0.35) {
    const tx = x + Math.cos(ang) * (len + 2), ty = y + Math.sin(ang) * (len + 2);
    if (wi === 3) parts.push({ x: tx, y: ty, vx: rand(-6, 6), vy: -rand(14, 30), life: 0.5, max: 0.5, c: Math.random() < 0.5 ? '#ff7a2f' : '#ffcf4a', s: 1.3, g: 0, add: true });
    else if (wi === 4) { if (Math.random() < 0.3) bolt(tx, ty, tx + rand(-8, 8), ty + rand(-8, 8), '#fffbc0', 0.9, 2); }
    else if (wi === 5) parts.push({ x: tx, y: ty, vx: rand(-6, 6), vy: rand(2, 12), life: 0.6, max: 0.6, c: '#d8fbff', s: 1.1, g: 0, add: true });
    else if (wi >= 1) parts.push({ x: tx, y: ty, vx: rand(-4, 4), vy: rand(-8, 0), life: 0.35, max: 0.35, c: w.glow, s: 1, g: 0, add: true });
  }
  void t;
}

function drawSlash(s: Slash) {
  const k = clamp(s.t / s.dur, 0, 1), fade = s.t > s.dur ? 1 - (s.t - s.dur) / 0.14 : 1;
  const a0 = s.a - s.spread * s.dir, a1 = a0 + 2 * s.spread * s.dir * Math.min(1, k * 1.15);
  const trailLen = s.pow ? 1.5 : 1.0;
  const aStart = a1 - (a1 - a0) * Math.min(1, trailLen);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(fade, 0, 1) * 0.42;
  const R2 = s.R * 0.74, ccw = s.dir < 0;
  ctx.fillStyle = s.glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.R, aStart, a1, ccw);
  ctx.arc(s.x, s.y, R2, a1, aStart, !ccw);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = clamp(fade, 0, 1) * 0.7;
  ctx.fillStyle = s.c;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.R * 0.98, aStart, a1, ccw);
  ctx.arc(s.x, s.y, s.R * 0.86, a1, aStart, !ccw);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s.pow ? 2.2 : 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(s.x, s.y, s.R, aStart + (a1 - aStart) * 0.35, a1, ccw); ctx.stroke();
  ctx.restore();
}

function drawEnemy(e: Enemy) {
  const s = e.spr, sc = e.scale, w = s.width * sc, h = s.height * sc;
  const bob = Math.sin(time * (e.def.type === 'beast' ? 7 : 4) + e.ph);
  let sx = 1 + bob * 0.04, sy = 1 - bob * 0.05;
  let yOff = 0, xOff = 0;
  if (e.st === 'wind') { const k = e.stT / Math.max(e.stDur, 0.01); sx = 1.15 + Math.sin(time * 40) * 0.04; sy = 0.82 - k * 0.1; xOff = -Math.cos(e.ang) * k * 2; }
  if (e.st === 'act' && e.def.type === 'beast') { sx = 1.3; sy = 0.8; }
  if (e.st === 'act' && e.def.type === 'blob') { sy = 1.25; sx = 0.85; yOff = -4; }
  drawShadow(ctx, e.x, e.y, 6.5 * sc, 2.4 * sc);
  if (e.boss || e.elite) { // aura
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(e.x, e.y - h / 2, 4, e.x, e.y - h / 2, 36 + Math.sin(time * 3) * 3);
    g.addColorStop(0, e.rage ? 'rgba(255,60,40,.5)' : 'rgba(255,200,80,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(e.x - 44, e.y - h - 30, 88, h + 60); ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = e.born > 0 && e.born < 1 ? e.born : 1;
  ctx.translate(e.x + xOff, e.y + yOff - e.z); ctx.scale(e.flip * sx, sy);
  let img = s;
  if (e.burn > 0) img = tinted(s, '#ff6a1a', `b${e.def.name}`); else if (e.slow > 0) img = tinted(s, '#7fe0ff', `s${e.def.name}`);
  if (e.flash > 0) img = flashed(s);
  ctx.drawImage(img, -w / 2, -h, w, h);
  if (e.st === 'wind') { ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 40); ctx.drawImage(flashed(s), -w / 2, -h, w, h); }
  ctx.restore();
  if (e.st === 'wind') { ctx.fillStyle = '#ff4a3a'; ctx.font = 'bold 9px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText('!', e.x, e.y - h - 3 + Math.sin(time * 30)); }
}

function drawPlayer() {
  const x = P.x, y = P.y, fa = P.fa;
  const c = Math.cos(fa), s = Math.sin(fa);
  const dir: Dir = Math.abs(c) >= Math.abs(s) * 0.9 ? 'side' : s > 0 ? 'down' : 'up';
  const flip = c < 0 ? -1 : 1;
  const frame = P.moving || P.dashT > 0 ? [0, 1, 0, 2][Math.floor(P.anim * 10) % 4] : 0;
  const spr = heroFrame(dir, frame, armorTier(), save.look, save.gear.sub === 1);
  const bob = P.moving ? Math.abs(Math.sin(P.anim * 10)) * 1 : Math.sin(P.anim * 3) * 0.3;
  // afterimages
  for (const a of P.afters) {
    ctx.save(); ctx.globalAlpha = a.t * 1.6; ctx.globalCompositeOperation = 'lighter';
    ctx.translate(a.x, a.y); ctx.scale(flip, 1); ctx.drawImage(tinted(spr, '#7fc8ff', 'dash'), -spr.width / 2, -spr.height + 1); ctx.restore();
  }
  drawShadow(ctx, x, y, 5.5, 2.2);
  // sword pivot / angle
  const swinging = P.swingT > 0;
  let swAng: number, px: number, py: number;
  const handSide = dir === 'side' ? flip : 1;
  if (swinging) {
    const sl = slashes[slashes.length - 1];
    const k = 1 - P.swingT / P.swingDur;
    const dirS = P.step === 1 ? -1 : 1, spread = P.step === 2 ? Math.PI : 1.25;
    swAng = (sl ? sl.a : fa) - spread * dirS + 2 * spread * dirS * clamp(k * 1.15, 0, 1);
    px = x; py = y - 9;
  } else {
    if (dir === 'side') { swAng = flip > 0 ? -1.15 : Math.PI + 1.15; px = x + 3 * flip; py = y - 11; }
    else if (dir === 'down') { swAng = 1.9; px = x + 6; py = y - 10; }
    else { swAng = -2.2; px = x - 6; py = y - 11; }
  }
  void handSide;
  if (dir === 'up' && !swinging) drawSword(px, py, swAng, false, time);
  ctx.save();
  if (P.inv > 0 && P.dashT <= 0 && Math.floor(time * 20) % 2) ctx.globalAlpha = 0.55;
  ctx.translate(x, y - bob); ctx.scale(dir === 'side' ? flip : 1, 1);
  ctx.drawImage(spr, -spr.width / 2, -spr.height + 1);
  ctx.restore();
  if (!(dir === 'up' && !swinging)) drawSword(px, py - bob, swAng, swinging, time);
  // weapon aura at high tiers
  if (weaponIdx() >= 3 && Math.random() < 0.2) parts.push({ x: x + rand(-5, 5), y: y - rand(2, 20), vx: 0, vy: -rand(8, 20), life: 0.7, max: 0.7, c: gw().glow, s: 0.9, g: 0, add: true });
}

function drawWorld() {
  const vw = W / Z, vh = H / Z;
  const mw = map.w * TS, mh = map.h * TS;
  let tx = P.x - vw / 2 + Math.cos(P.fa) * 6, ty = P.y - vh / 2 + Math.sin(P.fa) * 4;
  tx = mw <= vw ? (mw - vw) / 2 : clamp(tx, 0, mw - vw);
  ty = mh <= vh ? (mh - vh) / 2 : clamp(ty, 0, mh - vh);
  cam.x += (tx - cam.x) * 0.12; cam.y += (ty - cam.y) * 0.12;
  const sx = shake ? rand(-shake, shake) * 0.12 : 0, sy = shake ? rand(-shake, shake) * 0.12 : 0;
  const camX = cam.x + sx, camY = cam.y + sy;
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(Z, 0, 0, Z, -Math.round(camX * Z), -Math.round(camY * Z));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(map.img, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  for (const wt of map.waters) {
    if (wt.x < camX - 16 || wt.x > camX + vw || wt.y < camY - 16 || wt.y > camY + vh) continue;
    const o = (time * 5 + wt.ph) % 14; ctx.fillRect(wt.x + o - 2, wt.y + 4 + (wt.ph % 5), 4, 1); ctx.fillRect(wt.x + ((o + 7) % 14), wt.y + 11, 3, 1);
  }

  // telegraphs on the floor
  for (const t of teles) {
    if (t.t < 0) continue;
    const k = clamp(t.t / t.dur, 0, 1);
    ctx.save();
    if (t.kind === 'circle') {
      ctx.fillStyle = `rgba(255,60,40,${0.12 + 0.18 * k})`; ctx.beginPath(); ctx.arc(t.x, t.y - 2, t.r, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,60,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(t.x, t.y - 2, t.r, 0, 6.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,60,.4)'; ctx.beginPath(); ctx.arc(t.x, t.y - 2, t.r * k, 0, 6.3); ctx.fill();
    } else {
      ctx.translate(t.x, t.y - 2); ctx.rotate(t.ang);
      ctx.fillStyle = `rgba(255,60,40,${0.15 + 0.25 * k})`; ctx.fillRect(0, -t.r, t.len, t.r * 2);
      ctx.strokeStyle = 'rgba(255,90,60,.9)'; ctx.lineWidth = 1; ctx.strokeRect(0, -t.r, t.len, t.r * 2);
    }
    ctx.restore();
  }
  // acid / poison puddles
  for (const pd of puddles) {
    ctx.save();
    if (pd.delay > 0) { ctx.strokeStyle = 'rgba(255,90,60,.9)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(pd.x, pd.y - 1, pd.r * (1 - pd.delay * 0.4), 0, 6.3); ctx.stroke(); }
    else {
      const g2 = ctx.createRadialGradient(pd.x, pd.y - 1, 2, pd.x, pd.y - 1, pd.r);
      g2.addColorStop(0, pd.c); g2.addColorStop(0.7, pd.c); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = clamp(pd.life, 0, 1) * 0.6; ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(pd.x, pd.y - 1, pd.r, pd.r * 0.72, 0, 0, 6.3); ctx.fill();
      ctx.globalAlpha = clamp(pd.life, 0, 1) * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(pd.x, pd.y - 1, pd.r * 0.9, pd.r * 0.64, 0, 0, 6.3); ctx.stroke();
    }
    ctx.restore();
  }
  // GPS route
  if (gpsOn && gpsPath.length > 1 && gpsTarget) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -time * 16;
    const trace = (oy: number) => { ctx.beginPath(); gpsPath.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - 2 + oy) : ctx.moveTo(p.x, p.y - 2 + oy)); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3; trace(0.8);
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 1.7; trace(0);
    ctx.setLineDash([]); const gt = gpsTarget, pulse = (time * 1.4) % 1;
    ctx.strokeStyle = `rgba(255,226,122,${1 - pulse})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gt.x, gt.y - 2, 6 + pulse * 18, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#ffe27a'; ctx.beginPath(); const by = gt.y - 34 + Math.sin(time * 4) * 2; ctx.moveTo(gt.x, by + 7); ctx.lineTo(gt.x - 5, by); ctx.lineTo(gt.x + 5, by); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  // lock ring
  const boss = enemies.find(e => e.boss && !e.dead);
  if (boss && !bossAnnounced && save.level < stage.rec + 1) {
    ctx.strokeStyle = `rgba(255,120,80,${0.4 + 0.3 * Math.sin(time * 4)})`; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(boss.x, boss.y - 2, 96, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
  }

  // y-sorted drawables
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  const x0 = camX - 24, x1 = camX + vw + 24, y0 = camY - 10, y1 = camY + vh + 40;
  for (const o of map.obst) {
    if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
    items.push({ y: o.y, draw: () => {
      if (o.sway) { ctx.save(); ctx.translate(o.x, o.y); ctx.transform(1, 0, Math.sin(time * 1.6 + o.ph) * 0.03, 1, 0, 0); ctx.drawImage(o.spr, -10, -27); ctx.restore(); }
      else ctx.drawImage(o.spr, o.x - 10, o.y - 27);
    } });
  }
  for (const n of npcs) {
    const done = save.quests[`${stage.id}-${n.idx}`];
    items.push({ y: n.y, draw: () => {
      drawShadow(ctx, n.x, n.y, 5, 2);
      ctx.drawImage(n.spr, n.x - 8, n.y - 15 + Math.sin(time * 2 + n.idx) * 0.3);
      if (!done) { ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 9px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText('!', n.x, n.y - 18 + Math.sin(time * 5) * 1.5); }
      if (n === nearNpc && touchCapable === false) { ctx.fillStyle = '#fff'; ctx.font = '5px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText('[E] คุย', n.x, n.y + 8); }
    } });
  }
  for (const c of chests) items.push({ y: c.y, draw: () => { drawShadow(ctx, c.x, c.y, 6, 2); ctx.drawImage(c.open ? chestSprites.open : chestSprites.closed, c.x - 8, c.y - 14); if (!c.open) { ctx.fillStyle = '#ffe27a'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 5); ctx.fillRect(c.x - 4 + Math.sin(time * 3) * 4, c.y - 16, 1, 1); ctx.globalAlpha = 1; } } });
  for (const e of enemies) if (!e.dead) items.push({ y: e.y, draw: () => drawEnemy(e) });
  if (!P.dead) items.push({ y: P.y, draw: drawPlayer });
  items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

  // additive effects
  for (const s of slashes) drawSlash(s);
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const r of rings) { ctx.globalAlpha = clamp(r.life / r.dur, 0, 1); ctx.strokeStyle = r.c; ctx.lineWidth = r.w; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.3); ctx.stroke(); }
  for (const b of bolts) {
    ctx.globalAlpha = clamp(b.life / 0.2, 0, 1) ; ctx.strokeStyle = b.c; ctx.lineWidth = b.w; ctx.lineJoin = 'round';
    ctx.beginPath(); b.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.lineWidth = b.w * 3; ctx.globalAlpha *= 0.25; ctx.stroke();
  }
  for (const wv of waves) drawWave(wv);
  if (save.gear.sub === 3 && !P.dead) for (let k = 0; k < 2; k++) {
    const a = P.orbA + k * Math.PI, ox = P.x + Math.cos(a) * 24, oy = P.y - 9 + Math.sin(a) * 14, gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, 8);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#9ad8ff'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.fillRect(ox - 8, oy - 8, 16, 16);
    if (Math.random() < 0.4) parts.push({ x: ox, y: oy, vx: 0, vy: 0, life: 0.3, max: 0.3, c: '#9ad8ff', s: 1, g: 0, add: true });
  }
  for (const d of daggers) { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a); ctx.globalAlpha = 1; ctx.fillStyle = '#e8f0f8'; ctx.fillRect(-4, -0.7, 8, 1.4); ctx.fillStyle = '#fff'; ctx.fillRect(2, -0.7, 3, 1.4); ctx.restore(); }
  for (const p of parts) if (p.add) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  for (const pr of projs) { ctx.globalAlpha = 1; const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.4); g.addColorStop(0, '#fff'); g.addColorStop(0.35, pr.c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(pr.x - pr.r * 3, pr.y - pr.r * 3, pr.r * 6, pr.r * 6); }
  for (const o of orbs) { ctx.globalAlpha = 1; ctx.fillStyle = o.gold ? '#ffd84a' : '#7fe0ff'; ctx.fillRect(o.x - 1, o.y - 1, 2, 2); ctx.globalAlpha = 0.4; ctx.fillRect(o.x - 2, o.y - 2, 4, 4); }
  ctx.restore();
  for (const p of parts) if (!p.add) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;

  // soft light around the hero
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(P.x, P.y - 8, 2, P.x, P.y - 8, 54);
  lg.addColorStop(0, 'rgba(255,214,140,.16)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.fillRect(P.x - 56, P.y - 64, 112, 112); ctx.restore();

  // ---- screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // ambient grade
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = AMBIENT[stage.id - 1]; ctx.fillRect(0, 0, W, H); ctx.restore();
  // weather
  const wc = WEATHER[stage.id - 1];
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of weather) {
    p.x += (wc.vx * 0.0016 + Math.sin(time + p.ph) * 0.0006) * p.sp; p.y += wc.vy * 0.0016 * p.sp;
    if (p.x > 1.05) p.x = -0.05; if (p.x < -0.05) p.x = 1.05; if (p.y > 1.05) p.y = -0.05; if (p.y < -0.05) p.y = 1.05;
    const a = wc.g ? 0.35 + 0.65 * Math.abs(Math.sin(time * 1.5 + p.ph)) : 0.55;
    ctx.globalAlpha = a; ctx.fillStyle = wc.c;
    const sz = Math.max(2, Z * 0.7 * wc.s);
    ctx.fillRect(p.x * W, p.y * H, wc.vx > 15 ? sz * 4 : sz, sz);
  }
  ctx.restore();
  // vignette
  if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
  const lowHp = hp / stats().maxHp < 0.3 ? 0.2 + 0.12 * Math.sin(time * 6) : 0;
  const red = Math.max(hurtVig, lowHp);
  if (red > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(220,20,20,${red})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  if (flashA > 0) { ctx.fillStyle = `rgba(255,255,240,${Math.min(1, flashA)})`; ctx.fillRect(0, 0, W, H); }

  // monster labels: level, name, health
  for (const e of enemies) {
    if (e.dead || e.boss) continue;
    if (dist(e.x, e.y, P.x, P.y) > 130 && e.hurtT <= 0) continue;
    const px = (e.x - camX) * Z, py = (e.y - e.spr.height * e.scale - 7 - camY) * Z;
    if (px < -80 || px > W + 80 || py < -40 || py > H + 40) continue;
    const diff = e.level - save.level, col = diff <= -2 ? '#8aff8a' : diff <= 0 ? '#ffffff' : diff <= 1 ? '#ffd070' : '#ff7a6a';
    const bw = Math.max(18, e.spr.width * e.scale) * Z * 0.95, bh = Z * 2.2;
    ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(px - bw / 2 - 2, py - bh - 2, bw + 4, bh + 4);
    ctx.fillStyle = '#4a1a14'; ctx.fillRect(px - bw / 2, py - bh, bw, bh);
    ctx.fillStyle = e.elite ? '#e8a02a' : '#e8604a'; ctx.fillRect(px - bw / 2, py - bh, bw * clamp(e.hp / e.maxHp, 0, 1), bh);
    ctx.font = `${Math.round(Z * 3.5)}px Mitr, Sarabun, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = Z * 0.9; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
    const label = `Lv.${e.level}  ${e.elite ? '★ ' : ''}${e.def.name}`;
    ctx.strokeText(label, px, py - bh - Z * 1.3); ctx.fillStyle = col; ctx.fillText(label, px, py - bh - Z * 1.3);
  }
  // off-screen objective arrow
  if (gpsOn && gpsTarget && !P.dead) {
    const tx2 = (gpsTarget.x - camX) * Z, ty2 = (gpsTarget.y - camY) * Z, m2 = 46 * DPR;
    if (tx2 < m2 || tx2 > W - m2 || ty2 < m2 || ty2 > H - m2) {
      const ang = Math.atan2(ty2 - H / 2, tx2 - W / 2), ax = clamp(tx2, m2, W - m2), ay = clamp(ty2, m2 + 60 * DPR, H - m2 - 60 * DPR);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 3 * DPR; ctx.beginPath(); ctx.moveTo(14 * DPR, 0); ctx.lineTo(-8 * DPR, -10 * DPR); ctx.lineTo(-3 * DPR, 0); ctx.lineTo(-8 * DPR, 10 * DPR); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      ctx.font = `${Math.round(11 * DPR)}px Mitr, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3 * DPR; ctx.strokeStyle = '#000'; ctx.strokeText(`${gpsMeters} ม.`, ax, ay + 24 * DPR); ctx.fillStyle = '#ffe27a'; ctx.fillText(`${gpsMeters} ม.`, ax, ay + 24 * DPR);
    }
  }
  // floaters (world -> screen)
  ctx.textAlign = 'center';
  for (const f of floaters) {
    const px = (f.x - camX) * Z, py = (f.y - camY) * Z;
    ctx.globalAlpha = clamp(f.life / 0.45, 0, 1);
    ctx.font = `bold ${Math.round(Z * (f.big ? 5.4 : 4))}px "Pixelify Sans", Mitr, sans-serif`;
    ctx.lineWidth = Z * 1.1; ctx.strokeStyle = '#000'; ctx.strokeText(f.t, px, py);
    ctx.fillStyle = f.c; ctx.fillText(f.t, px, py);
  }
  ctx.globalAlpha = 1;
  // combo counter
  if (comboShow > 0 && comboN >= 2) {
    ctx.globalAlpha = clamp(comboShow, 0, 1);
    ctx.font = `bold ${Math.round(Z * 9)}px "Pixelify Sans", sans-serif`; ctx.textAlign = 'right';
    ctx.lineWidth = Z * 1.6; ctx.strokeStyle = '#000'; ctx.strokeText(`${comboN} HIT`, W - 20 * DPR, H * 0.3);
    ctx.fillStyle = '#ffd84a'; ctx.fillText(`${comboN} HIT`, W - 20 * DPR, H * 0.3); ctx.globalAlpha = 1;
  }
}

function drawTitleBg() {
  const portrait = H > W * 1.05;
  const hz = H * (portrait ? 0.56 : 0.72), mr = Math.min(W, H) * 0.075;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#0c0818'); sky.addColorStop(0.55, '#2a1840'); sky.addColorStop(0.85, '#8a3a4a'); sky.addColorStop(1, '#e08a4a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 2);
  for (let i = 0; i < 80; i++) {
    const x = (i * 9301 % 1000) / 1000 * W, y = (i * 4973 % 1000) / 1000 * hz * 0.75, a = 0.25 + 0.7 * Math.abs(Math.sin(time * 1.3 + i));
    ctx.globalAlpha = a; ctx.fillStyle = '#ffe9b0'; const sz = (i % 5 === 0 ? 3 : 2) * DPR; ctx.fillRect(x, y, sz, sz);
  }
  ctx.globalAlpha = 1;
  const mx = W * (portrait ? 0.72 : 0.64), my = hz * 0.33;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const mg = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 4); mg.addColorStop(0, 'rgba(255,220,160,.45)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mg; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8); ctx.restore();
  ctx.fillStyle = '#fff1cc'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(200,170,130,.5)'; for (const [dx, dy, r2] of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.1, 0.35, 0.12]]) { ctx.beginPath(); ctx.arc(mx + dx * mr, my + dy * mr, r2 * mr, 0, 6.3); ctx.fill(); }
  for (let k = 0; k < 4; k++) {
    const cx = ((time * 7 * (1 + k * 0.45) + k * W * 0.31) % (W + 500)) - 250, cy = hz * (0.25 + k * 0.14);
    ctx.fillStyle = 'rgba(90,50,100,.32)'; ctx.beginPath(); ctx.ellipse(cx, cy, 190 + k * 30, 20 + k * 4, 0, 0, 6.3); ctx.ellipse(cx + 70, cy - 12, 110, 22, 0, 0, 6.3); ctx.fill();
  }
  const ridge = (col: string, base: number, amp: number, f1: number, f2: number, ph: number) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, hz);
    for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, hz - base - Math.sin(x * f1 + ph) * amp - Math.sin(x * f2 + ph * 2) * amp * 0.4);
    ctx.lineTo(W, hz); ctx.fill();
  };
  ridge('#2e1d3e', mr * 1.7, mr * 1.1, 0.004, 0.011, 1); ridge('#21152f', mr * 0.9, mr * 0.7, 0.006, 0.017, 3);
  // pagoda silhouette
  const px = W * (portrait ? 0.2 : 0.12), ps = mr * 0.5;
  ctx.fillStyle = '#170f22'; ctx.beginPath();
  ctx.moveTo(px - ps * 3.2, hz); ctx.lineTo(px - ps * 2.6, hz - ps * 1.4); ctx.lineTo(px - ps * 1.6, hz - ps * 1.6); ctx.lineTo(px - ps * 1.4, hz - ps * 3.6);
  ctx.quadraticCurveTo(px - ps * 1.2, hz - ps * 5.2, px, hz - ps * 7.2); ctx.quadraticCurveTo(px + ps * 1.2, hz - ps * 5.2, px + ps * 1.4, hz - ps * 3.6);
  ctx.lineTo(px + ps * 1.6, hz - ps * 1.6); ctx.lineTo(px + ps * 2.6, hz - ps * 1.4); ctx.lineTo(px + ps * 3.2, hz); ctx.fill();
  ctx.fillRect(px - 1.5 * DPR, hz - ps * 9.4, 3 * DPR, ps * 2.4);
  const gg = ctx.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, '#1b1424'); gg.addColorStop(1, '#09060c');
  ctx.fillStyle = gg; ctx.fillRect(0, hz, W, H - hz);
  ctx.fillStyle = '#120c1a'; for (let x = 0; x < W; x += 16 * DPR) { const hh = (6 + ((x * 7) % 11)) * DPR; ctx.beginPath(); ctx.moveTo(x, hz + 2); ctx.lineTo(x + 5 * DPR, hz - hh); ctx.lineTo(x + 10 * DPR, hz + 2); ctx.fill(); }
  // hero
  const S = Math.max(4, Math.floor(Math.min(W * (portrait ? 0.7 : 0.4), H * 0.5) / 26));
  const hx = W * (portrait ? 0.5 : 0.3), hy = hz + (H - hz) * (portrait ? 0.4 : 0.26), bob = Math.sin(time * 2.4) * 0.35;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ag = ctx.createRadialGradient(hx, hy - S * 10, S * 2, hx, hy - S * 10, S * 22); ag.addColorStop(0, 'rgba(255,200,120,.28)'); ag.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ag; ctx.fillRect(hx - S * 24, hy - S * 34, S * 48, S * 48); ctx.restore();
  ctx.save(); ctx.translate(hx, hy); ctx.scale(S, S); ctx.imageSmoothingEnabled = false;
  drawShadow(ctx, 0, 0, 7, 2.4);
  const spr = heroFrame('side', 0, armorTier(), save.look, save.gear.sub === 1);
  ctx.drawImage(spr, -spr.width / 2, -spr.height + 1 + bob);
  drawSword(3, -11 + bob, -1.15 + Math.sin(time * 1.2) * 0.04, true, time, false);
  const w0 = gw();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) { const ph = (time * 0.6 + i / 9) % 1; ctx.globalAlpha = 1 - ph; ctx.fillStyle = i % 2 ? w0.glow : w0.color; ctx.fillRect(9 + Math.sin(i * 2.3) * 3, -22 - ph * 12, 0.8, 0.8); }
  ctx.restore();
  // fireflies
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const fx = ((i * 7919) % 1000) / 1000 * W + Math.sin(time * 0.7 + i) * 24 * DPR, fy = hz + (((i * 4421) % 1000) / 1000) * (H - hz) * 0.9 - 20 * DPR + Math.cos(time * 0.9 + i * 2) * 14 * DPR;
    ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(time * 1.6 + i)); ctx.fillStyle = '#ffe9a0'; ctx.fillRect(fx, fy, 3 * DPR, 3 * DPR);
  }
  ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// ================================================================== landscape only (phones)
const portraitMQ = matchMedia('(orientation: portrait) and (pointer: coarse)');
function isPortraitTouch() { return portraitMQ.matches; }
function tryLockLandscape() {
  const o = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
  try { o?.lock?.('landscape')?.catch(() => {}); } catch { /* needs fullscreen/PWA; overlay is the fallback */ }
}
window.addEventListener('pointerdown', tryLockLandscape, { once: true });

// block page zoom (iOS ignores user-scalable=no)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = n; }, { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// ================================================================== main loop
let last = performance.now();
function frame(now: number) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (scene === 'map' && map) {
    if (!panelOpen() && !isPortraitTouch()) {
      if (freeze > 0) { freeze -= dt; dt = 0; }
      else if (slowmo > 0) { slowmo -= dt; dt *= 0.3; }
      if (dt > 0) updateWorld(dt);
    } else { flags.act = flags.atk = flags.dodge = flags.s1 = flags.s2 = flags.s3 = false; }
    updateFx(panelOpen() ? 0 : dt);
    drawWorld();
  } else { flags.act = flags.atk = flags.dodge = flags.skill = false; drawTitleBg(); }
  requestAnimationFrame(frame);
}

showTitle();
requestAnimationFrame(frame);

