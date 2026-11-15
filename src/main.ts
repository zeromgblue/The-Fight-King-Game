import { fbConfigured, watchAuth, googleSignIn, logout, loadProfile, pushProfile, rtConfigured, joinRoom, patchPresence, type Presence, type User } from './firebase';
import './style.css';
import {
  STAGES, ISLANDS, islandIndex, getStage, ITEMS, RECIPES, WEAPONS, MAX_LEVEL, bestWeapon, bestArmor, ARMORS, HELMETS, SUBS, CHARMS, SKINS, HAIRS, PLUMES, TRIMS, CAPES, CAPE_NAMES, BOOTS, COLOR_NAMES,
  expForLevel, maxHpFor, atkFor, defFor, type StageDef, type MonsterDef, type Look,
} from './data';
import { randomQuestion } from './questions';
import {
  heroFrame, npcSprite, monsterSprite, groundTile, pathTile, obstacleSprite, decorSprite, drawShadow, flashed, tinted, waterTile, chestSprite,
  type Sprite, type DecorKind, type Dir,
} from './sprites';
import { sfx, setMusic, unlockAudio, isMuted, setMuted } from './audio';
import {
  $, esc, toast, panel, panelOpen, closeAllPanels, closeTopPanel, dialog, confirmBox, askQuestion,
  updateHud, loadSave, writeSave, freshSave, wipeSave, mergeSave, setSaveOwner, saveHooks, takeLegacySave, dropLegacySave, type Save,
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
  Z = Math.max(2, Math.round(Math.min(W, H) / 200));
  vignette = document.createElement('canvas'); vignette.width = 256; vignette.height = 256;
  const v = vignette.getContext('2d')!;
  const g = v.createRadialGradient(128, 128, 60, 128, 128, 182);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)');
  v.fillStyle = g; v.fillRect(0, 0, 256, 256);
}
window.addEventListener('resize', resize);
resize();

const TS = 16;
const themeIx = (id: number) => (id === 0 ? 15 : id - 1);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
function seeded(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

// per-stage mood
const AMBIENT = ['#fff6e0', '#d8ead2', '#f4e8d0', '#b8b8d0', '#bcd4c0', '#ffe8b4', '#ffe2b0', '#f6ecdc', '#c8e0c4', '#a89cdc', '#c8b890', '#9cb4e8', '#a8a0c0', '#f0a880', '#f0d890', '#fff4e0'];
const DECOR: DecorKind[][] = [
  ['flower', 'tuft', 'mush'], ['mush', 'tuft', 'flower'], ['pebble', 'bone', 'tuft'], ['pebble', 'shard'], ['mush', 'tuft', 'bone'],
  ['bone', 'pebble', 'tuft'], ['pebble', 'bone', 'tuft'], ['pebble', 'bone'], ['tuft', 'pebble', 'flower'], ['shard', 'pebble'],
  ['pebble', 'bone'], ['shard', 'pebble'], ['bone', 'pebble', 'mush'], ['pebble', 'shard'], ['shard', 'pebble'],
  ['flower', 'tuft', 'pebble'],
];
const WEATHER = [
  { c: '#fff7b0', s: 1, vy: 3, vx: 4, g: true }, { c: '#b8e8a0', s: 1.4, vy: 6, vx: -5, g: false }, { c: '#e8d8b0', s: 1, vy: -2, vx: 10, g: false },
  { c: '#b0c8ff', s: 1, vy: -3, vx: 2, g: true }, { c: '#d0ff90', s: 1.2, vy: -2, vx: 3, g: true }, { c: '#f4d490', s: 1, vy: 1, vx: 26, g: false },
  { c: '#f0c880', s: 1, vy: 1, vx: 22, g: false }, { c: '#e8e0d0', s: 1, vy: -1, vx: 6, g: false }, { c: '#ffe890', s: 1.2, vy: -2, vx: 3, g: true },
  { c: '#e070ff', s: 1.3, vy: -10, vx: 3, g: true },
  { c: '#d8c8a8', s: 1, vy: 2, vx: 2, g: false }, { c: '#a8d8ff', s: 1.2, vy: -2, vx: 1, g: true }, { c: '#c8b8e0', s: 1, vy: 1, vx: 8, g: false },
  { c: '#ff9a4a', s: 1.2, vy: -9, vx: 2, g: true }, { c: '#ffe27a', s: 1.2, vy: -3, vx: 2, g: true },
  { c: '#fff7b0', s: 1, vy: 3, vx: 4, g: true },
];

// ================================================================== state
let save: Save = loadSave();
type Scene = 'title' | 'map' | 'sea';
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
function renderHotbar() {
  const el = $('hotbar');
  if (el.childElementCount !== WEAPONS.length) {
    el.innerHTML = WEAPONS.map((w, i) => `<button class="slot" data-i="${i}" aria-label="${w.name}"><span class="swd" style="--c:${w.color};--g:${w.glow}"></span><small>${i + 1}</small></button>`).join('');
    el.querySelectorAll<HTMLButtonElement>('.slot').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.i!, w = WEAPONS[i];
        if (w.craft && !save.inv['w' + i]) { sfx('wrong'); toast(`${w.name} ต้องคราฟที่ช่างตีดาบ`); return; }
        if (w.minLevel > save.level) { sfx('wrong'); toast(`${w.name} ปลดล็อกที่เลเวล ${w.minLevel}`); return; }
        save.gear.weapon = i; save.prepped = true; writeSave(save); sfx('equip'); refreshHud();
      };
    });
  }
  el.querySelectorAll<HTMLButtonElement>('.slot').forEach((b, i) => {
    b.classList.toggle('on', save.gear.weapon === i);
    const lk = WEAPONS[i].minLevel > save.level || (!!WEAPONS[i].craft && !save.inv['w' + i]);
    b.classList.toggle('lock', lk);
    b.title = WEAPONS[i].craft ? `${WEAPONS[i].name} (คราฟ)` : `${WEAPONS[i].name} (LV ${WEAPONS[i].minLevel})`;
  });
}
// combat is only allowed while a quest from the quest-giver is active and unfinished
const canFight = () => !!save.quest && save.quest.have < save.quest.need;
let hintT = -9;
function questHint() {
  if (time - hintT < 2.5) return; hintT = time;
  toast(save.quest ? 'ภารกิจสำเร็จแล้ว — ไปรับรางวัลและรับภารกิจใหม่ที่ผู้ดูแลภารกิจ' : 'ต้องรับภารกิจจากผู้ดูแลภารกิจก่อน ถึงจะทำดาเมจมอนสเตอร์ได้');
}
function refreshQuestPill() {
  const el = $('quest-pill'), q = save.quest;
  if (scene !== 'map') { el.classList.add('hidden'); return; }
  if (!q) { el.classList.remove('hidden', 'done'); el.classList.add('none'); el.textContent = 'ยังไม่มีภารกิจ — รับก่อนถึงจะตีมอนสเตอร์ได้'; return; }
  el.classList.remove('none');
  el.classList.remove('hidden');
  const done = q.have >= q.need;
  el.classList.toggle('done', done);
  el.textContent = done ? 'ภารกิจสำเร็จ! กลับไปรับรางวัลที่ผู้ดูแลภารกิจ' : `ภารกิจ: ${q.text} ${q.have}/${q.need}`;
}
function refreshHud() {
  renderHotbar(); refreshQuestPill();
  updateHud(save.level, hp, stats().maxHp, save.level >= MAX_LEVEL ? need() : save.exp, need(), save.gold, scene === 'title' ? '' : scene === 'sea' ? 'ทะเลโลก 1 • ล่องเรือไปยังเกาะต่าง ๆ' : stage.town ? `${stage.name} • เขตปลอดภัย` : `${stage.name}  •  มอนสเตอร์ LV ${stage.rec}-${stage.rec + 2}`);
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
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
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
    if (k === 'b' && scene !== 'title' && !panelOpen()) openPrep(undefined, false, 'bag');
    if (k === 'v' && scene !== 'title' && !panelOpen()) openPrep(undefined, false, 'body');
    if (k === 't' && scene === 'map' && !panelOpen()) { e.preventDefault(); openChat(); }
    if (k === 'escape') { if (panelOpen()) closeTopPanel(); else if (scene !== 'title') openMenu(); }
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); held.atk = false; });

const touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (!touchCapable) $('stick').classList.add('hidden');

// floating joystick: touch anywhere in the left part of the screen; the base appears under the thumb and follows it
(function setupStick() {
  const el = $('stick'), knob = $('knob'), zone = $('stick-zone');
  if (!touchCapable) { zone.classList.add('hidden'); return; }
  let id = -1, cx = 0, cy = 0;
  el.classList.add('idle');
  const place = () => { const w = el.offsetWidth; el.style.left = `${cx - w / 2}px`; el.style.top = `${cy - w / 2}px`; el.style.bottom = 'auto'; };
  const reset = () => { id = -1; stick.x = stick.y = 0; knob.style.transform = ''; el.classList.add('idle'); el.style.left = el.style.top = el.style.bottom = ''; };
  const move = (e: PointerEvent) => {
    const R = el.offsetWidth * 0.42;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > R) { const k = (d - R) / d; cx += dx * k; cy += dy * k; place(); dx = e.clientX - cx; dy = e.clientY - cy; } // base trails the thumb
    const m = Math.min(1, Math.hypot(dx, dy) / R);
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    if (m < 0.14) { stick.x = stick.y = 0; } else { const sc = (m - 0.14) / 0.86, an = Math.atan2(dy, dx); stick.x = Math.cos(an) * sc; stick.y = Math.sin(an) * sc; }
  };
  zone.addEventListener('pointerdown', e => {
    if (id !== -1 || $('touch').classList.contains('hidden')) return;
    unlockAudio(); id = e.pointerId; try { zone.setPointerCapture(id); } catch { /* ignore */ }
    cx = e.clientX; cy = e.clientY; el.classList.remove('idle'); place(); move(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) zone.addEventListener(t, e => { if ((e as PointerEvent).pointerId === id) reset(); });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
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
$('btn-home').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene !== 'title' && !panelOpen()) void goHome(); });
$('btn-menu').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene === 'map' && !panelOpen()) openMenu(); });

// ================================================================== map
interface Prop { kind: 'house' | 'fountain' | 'lamp' | 'crate' | 'anvil' | 'bench' | 'flowerbed' | 'banner' | 'sign' | 'pier'; x: number; y: number; v: number; }
interface Obst { x: number; y: number; spr: Sprite; sway: number; ph: number; }
interface GameMap {
  w: number; h: number; solid: Uint8Array; water: Uint8Array; reach: Uint8Array; img: HTMLCanvasElement; obst: Obst[]; waters: { x: number; y: number; ph: number }[];
  props: Prop[]; hub?: { x: number; y: number }; spawn?: { x: number; y: number }; npcSpots?: { x: number; y: number }[];
  dock?: { x: number; y: number }; dockLand?: { x: number; y: number }; shipSpot?: { x: number; y: number };
  start: { x: number; y: number }; boss: { x: number; y: number }; path: { x: number; y: number }[]; spots: { x: number; y: number }[]; mm: HTMLCanvasElement;
}
const WATER_COL = ['#3f7ab0', '#3a7a8a', '#4a7a98', '#2a4a6a', '#3a6a5a', '#2f8ab0', '#3a86a8', '#4a80a8', '#3a6a60', '#6a3ab0', '#3a3a48', '#2a5a9a', '#3a3450', '#e0501a', '#d8a020', '#4a90c0'];
const ENEMY_MAX = 26;

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
  const w = st.hub ? 156 : 108, h = st.hub ? 116 : 80;
  const r = seeded(st.id * 7919 + 13);
  const n1 = valueNoise(w, h, 7, st.id * 11 + 1), n2 = valueNoise(w, h, 10, st.id * 11 + 2), n3 = valueNoise(w, h, 4, st.id * 11 + 3);
  const solid = new Uint8Array(w * h), water = new Uint8Array(w * h), path = new Uint8Array(w * h);
  const wthr = st.town ? 9 : st.id === 6 ? 0.8 : 0.7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { solid[i] = 1; continue; }
    if (n2(x, y) > wthr) water[i] = 1;
    else if (!st.town && n1(x, y) > 0.6 && r() < 0.62) solid[i] = 1;
    else if (r() < (st.town ? 0.004 : 0.035)) solid[i] = 1;
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
  for (let tries = 0; tries < 700 && spots.length < (st.hub ? 9 : 6); tries++) {
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
  // ---- hub island: plaza with fountain, houses, market stalls
  const props: Prop[] = [], foot: [number, number, number, number][] = [];
  let hub: { x: number; y: number } | undefined, spawn: { x: number; y: number } | undefined, npcSpots: { x: number; y: number }[] | undefined;
  if (st.hub) {
    const hx = 38, hy = h - 32;
    for (let dy = -21; dy <= 21; dy++) for (let dx = -21; dx <= 21; dx++) {
      const dd = Math.hypot(dx, dy), x = hx + dx, y = hy + dy;
      if (x < 1 || y < 1 || x > w - 2 || y > h - 2 || dd > 20.5) continue;
      const i = y * w + x; solid[i] = 0; water[i] = 0; if (dd <= 13.5) path[i] = 1;
    }
    walk(s, { x: hx, y: hy }, 1);
    hub = { x: hx * TS + 8, y: hy * TS + 8 }; spawn = { x: hx * TS + 8, y: (hy + 10) * TS + 8 };
    npcSpots = [[9, 3], [-9, 2], [-8, -7], [7, -9], [-1, 21], [0, 7]].map(([dx, dy]) => ({ x: (hx + dx) * TS + 8, y: (hy + dy) * TS + 12 }));
    props.push({ kind: 'fountain', x: hx * TS, y: hy * TS, v: 1 });
    foot.push([hx - 2, hy - 2, 4, 4]);
    ([[-16, -11, 0], [-5, -17, 1], [8, -17, 2], [17, -7, 0], [17, 6, 1], [-17, 5, 2]] as [number, number, number][]).forEach(([dx, dy, v]) => { props.push({ kind: 'house', x: (hx + dx) * TS, y: (hy + dy) * TS, v }); foot.push([hx + dx, hy + dy, 4, 3]); });
    for (let k = 0; k < 10; k++) { const a = k * 0.6283 + 0.3; props.push({ kind: 'lamp', x: (hx + Math.cos(a) * 11.5) * TS + 8, y: (hy + Math.sin(a) * 11.5) * TS + 12, v: 0 }); }
    for (let k = 0; k < 8; k++) { const a = k * 0.7854 + 0.39; props.push({ kind: 'flowerbed', x: (hx + Math.cos(a) * 6.2) * TS + 8, y: (hy + Math.sin(a) * 6.2) * TS + 10, v: k }); }
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) props.push({ kind: 'bench', x: (hx + dx) * TS + 8, y: (hy + dy) * TS + 10, v: dx > 0 ? 1 : 0 });
    for (const [dx, dy] of [[-3, 11], [3, 11], [-11, 0], [11, 0]]) props.push({ kind: 'banner', x: (hx + dx) * TS + 8, y: (hy + dy) * TS + 12, v: dx > 0 || dy > 0 ? 1 : 0 });
    props.push({ kind: 'sign', x: hx * TS + 8, y: (hy + 12) * TS + 8, v: 0 });
    props.push({ kind: 'crate', x: (hx + 11) * TS + 4, y: (hy + 4) * TS + 8, v: 0 }, { kind: 'crate', x: (hx + 11) * TS + 15, y: (hy + 4) * TS + 12, v: 1 }, { kind: 'anvil', x: (hx + 7) * TS + 10, y: (hy + 4) * TS + 8, v: 0 });
  }
  let dock: { x: number; y: number } | undefined, dockLand: { x: number; y: number } | undefined, shipSpot: { x: number; y: number } | undefined;
  if (st.hub && hub) {
    const hx = Math.round((hub.x - 8) / TS), bayTop = h - 9;
    for (let y = bayTop; y <= h - 2; y++) for (let x = hx - 11; x <= hx + 11; x++) { if (x < 1) continue; const i = y * w + x; solid[i] = 0; water[i] = 1; path[i] = 0; }
    for (let y = Math.round((hub.y - 8) / TS) + 12; y <= bayTop + 4; y++) for (let x = hx - 1; x <= hx + 1; x++) { const i = y * w + x; solid[i] = 0; water[i] = 0; path[i] = 1; }
    for (let x = hx - 3; x <= hx + 3; x++) for (let y = bayTop - 1; y <= bayTop; y++) { const i = y * w + x; solid[i] = 0; water[i] = 0; path[i] = 1; }
    dock = { x: hx * TS + 8, y: (bayTop + 4) * TS + 8 }; dockLand = { x: hx * TS + 8, y: (bayTop - 2) * TS + 8 };
    shipSpot = { x: (hx + 4) * TS + 8, y: (bayTop + 4) * TS + 12 };
    props.push({ kind: 'pier', x: (hx - 1) * TS, y: bayTop * TS, v: 0 });
  }
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
  const waters = [0, 1, 2].map(i => waterTile(WATER_COL[themeIx(st.id)], st.id * 13 + i));
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
  const decs = DECOR[themeIx(st.id)].map((k, i) => [0, 1, 2].map(n => decorSprite(k, st.theme.g1, st.id * 53 + i * 7 + n)));
  for (let ty = 1; ty < h - 1; ty++) for (let tx = 1; tx < w - 1; tx++) {
    const i = ty * w + tx;
    if (solid[i] || water[i] || path[i] || r() > (st.hub ? 0.56 : 0.36)) continue;
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
  for (const [fx, fy, fw, fh] of foot) for (let j = 0; j < fh; j++) for (let k = 0; k < fw; k++) solid[(fy + j) * w + fx + k] = 1;
  const mm = document.createElement('canvas'); mm.width = w; mm.height = h;
  const m = mm.getContext('2d')!;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx;
    m.fillStyle = water[i] ? WATER_COL[themeIx(st.id)] : solid[i] ? hexShift(st.theme.oc, -60) : path[i] ? st.theme.path : hexShift(st.theme.g1, -10);
    m.fillRect(tx, ty, 1, 1);
  }
  const W2 = (p: { x: number; y: number }) => ({ x: p.x * TS + 8, y: p.y * TS + 12 });
  return { w, h, solid, water, reach, img, obst, waters: waterList, mm, start: W2(s), boss: { x: b.x * TS + 8, y: b.y * TS + 16 }, path: trail, spots: spots.map(W2), props, hub, spawn, npcSpots, dock, dockLand, shipSpot };
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
interface Pending { t: number; x: number; y: number; def: MonsterDef; elite: boolean; }
let pending: Pending[] = [];
let bossRespawnT = 0, respawnT = 0, bossAlive = true, bossAnnounced = false, nearNpc: Npc | null = null, lockToastT = 0;
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
    if (map.hub && dist(x, y, map.hub.x, map.hub.y) < 400) continue;
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
interface Loot { x: number; y: number; vx: number; vy: number; t: number; id: string; }
let loots: Loot[] = [];
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
let arriveFromSea = false;
// quest-giver outpost: right beside the nearest monster-farming spot so nobody has to walk far
function farmOutpost(): { x: number; y: number } | null {
  const hub = map.hub, ref = hub ?? map.start;
  const cands = map.spots.filter(sp => !hub || dist(sp.x, sp.y, hub.x, hub.y) > 420).sort((a, b) => dist(a.x, a.y, ref.x, ref.y) - dist(b.x, b.y, ref.x, ref.y));
  for (const sp of cands) for (const [ox, oy] of [[-34, 26], [34, 26], [-34, -26], [34, -26], [0, 38], [0, -38]]) {
    const x = sp.x + ox, y = sp.y + oy;
    if (!blockedAt(x, y, 6)) return { x, y };
  }
  return null;
}
let shipCall: { st: 'none' | 'coming' | 'moored'; t: number } = { st: 'none', t: 0 };
function startStage(id: number) {
  stage = getStage(id);
  map = genMap(stage);
  { const fo = !stage.hub ? farmOutpost() : null, pi = map.path[Math.min(8, map.path.length - 1)];
    const inland = fo ? (!blockedAt(fo.x, fo.y + 22, 5) ? { x: fo.x, y: fo.y + 22 } : fo) : pi && !blockedAt(pi.x * TS + 8, pi.y * TS + 12) ? { x: pi.x * TS + 8, y: pi.y * TS + 12 } : map.start;
    const at = stage.hub && map.spawn ? map.spawn : inland; shipCall = { st: stage.hub && arriveFromSea ? 'moored' : 'none', t: 1 }; P.x = at.x; P.y = at.y; arriveFromSea = false; }
  P.inv = 1.5; P.dead = false; P.swingT = 0; P.dashT = 0; P.fa = 0.3; P.subT = 0.5; P.orbA = 0;
  cam.x = P.x - W / Z / 2; cam.y = P.y - H / Z / 2;
  enemies = []; parts = []; rings = []; slashes = []; bolts = []; floaters = []; orbs = []; projs = []; teles = []; daggers = []; puddles = []; waves = [];
  orbHit.clear(); loots = [];
  if (!stage.town) for (const sp0 of map.spots) for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + rand(0, 1), x = sp0.x + Math.cos(a) * 24, y = sp0.y + Math.sin(a) * 20;
    if (blockedAt(x, y, 7)) continue;
    if (map.hub && dist(x, y, map.hub.x, map.hub.y) < 400) continue;
    const def = stage.enemies[Math.floor(Math.random() * stage.enemies.length)];
    const el = k === 0; const e = mkEnemy(def, stage.rec + (el ? 2 : Math.random() < 0.5 ? 0 : 1), false, x, y, el); enemies.push(e);
  }
  chests = stage.town ? [] : map.spots.map(s0 => ({ x: s0.x, y: s0.y, open: false }));
  while (!stage.town && enemies.length < ENEMY_MAX) { const before = enemies.length; spawnEnemy(100); if (enemies.length === before) break; }
  bossAlive = !stage.town; bossAnnounced = false; bossRespawnT = 0;
  if (!stage.town) { const boss = mkEnemy(stage.boss, stage.rec + 2, true, map.boss.x, map.boss.y); boss.flip = -1; enemies.push(boss); }
  npcs = [];
  stage.npcs.forEach((_d, idx) => {
    const f = (idx + 1) / (stage.npcs.length + 1);
    const t = stage.npcs[idx].quest && !map.npcSpots ? map.path[Math.min(12, map.path.length - 1)] : map.path[Math.floor(map.path.length * f)];
    const d = stage.npcs[idx];
    let nx = t.x * TS + 8, ny = t.y * TS + 30;
    if (map.npcSpots && map.npcSpots[idx]) { nx = map.npcSpots[idx].x; ny = map.npcSpots[idx].y; }
    if (d.quest && (d.outpost || !map.npcSpots)) { const fo = farmOutpost(); if (fo) { nx = fo.x; ny = fo.y; } }
    if (blockedAt(nx, ny)) { nx = t.x * TS + 26; ny = t.y * TS + 12; }
    if (blockedAt(nx, ny)) { nx = t.x * TS + 8; ny = t.y * TS + 12; }
    npcs.push({ x: nx, y: ny, idx, spr: npcSprite(d.robe, d.hat) });
  });
  const wc = WEATHER[themeIx(id)];
  weather = Array.from({ length: wc.g ? 34 : 46 }, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, 6), sp: rand(0.6, 1.4) }));
  respawnT = 8; pending = []; sp = Math.min(sp, 60);
  expl = new Uint8Array(map.w * map.h); lastTile = -1;
  mmShow = document.createElement('canvas'); mmShow.width = map.w; mmShow.height = map.h;
  const mc = mmShow.getContext('2d')!; mc.fillStyle = '#05030a'; mc.fillRect(0, 0, map.w, map.h);
  mc.drawImage(map.mm, 0, 0); expl.fill(1);
  mmEl.width = map.w; mmEl.height = map.h; mmEl.classList.remove('hidden');
  revealMap();
  scene = 'map'; inStage = true;
  $('touch').classList.remove('sea'); $('btn-dodge').textContent = 'พุ่ง';
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden'); $('bossbar').classList.add('hidden'); $('side-btns').classList.remove('hidden'); gpsKey = ''; gpsT = 0;
  setMusic('map', id);
  refreshHud();
  $('chatlog').classList.remove('hidden'); joinIslandRoom();
}

async function enterStage(id: number) {
  closeAllPanels();
  startStage(id);
  save.loc = { kind: 'island', id }; writeSave(save);
  if (!save.quests[`visit-${id}`]) {
    save.quests[`visit-${id}`] = true; writeSave(save);
    await dialog(`เกาะที่ ${islandIndex(id) + 1}: ${stage.name}`, [stage.intro, `เลเวลที่แนะนำ: ${stage.rec}  |  บอสประจำด่าน: ${stage.boss.name}`], 'ออกเดินทาง');
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
  for (const s of ISLANDS) if (s.rec > lu.from && s.rec <= lu.to) unlocks.push(`ปลดล็อกเกาะ: ${s.name}`);
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
  /* index 0..5 below, crafted sword appended after the array */
  ['คลื่นกระแทก', 'หมุนพลอง', 'พุ่งทุบ'],
  ['คลื่นสำริด', 'วงฟันสำริด', 'พุ่งฟันสำริด'],
  ['คลื่นเหล็กกล้า', 'วงดาบเหล็ก', 'พุ่งทะลวง'],
  ['คลื่นเพลิง', 'วงเพลิงนรก', 'พุ่งอัคคี'],
  ['คลื่นสายฟ้า', 'พายุฟ้าผ่า', 'พุ่งอสนี'],
  ['ลมหายใจมังกร', 'วงน้ำแข็งแช่แข็ง', 'พุ่งธารน้ำแข็ง'],
  ['คลื่นฟางทอง', 'วงทองคำ', 'พุ่งแสงทอง'],
];
interface Wave { x: number; y: number; vx: number; vy: number; life: number; dmg: number; ang: number; wi: number; hit: Set<Enemy>; }
let waves: Wave[] = [];

function elemOnHit(e: Enemy, dmg: number, wi: number) {
  if (!canFight()) return;
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
  sendAction(i + 1, P.fa);
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
  sfx('swing'); sendAction(0, P.fa);
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
  if (!canFight()) { questHint(); return; } // monsters can only be hurt while a quest is active
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
  const xp = Math.max(1, Math.round((10 + e.level * 12) * mult * 0.35)), gold = Math.round((5 + e.level * 4) * mult);
  save.gold += gold; sp = Math.min(100, sp + (e.boss ? 0 : 18) * spMul());
  floater(e.x, e.y - 22 * e.scale, `+${xp} EXP`, '#7fe0ff', true);
  floater(e.x, e.y - 30 * e.scale, `+${gold}`, '#ffd84a', false);
  const dr = stage.drops;
  if (dr) {
    const give = (id: string, n: number) => { for (let i = 0; i < n; i++) loots.push({ x: e.x, y: e.y - 6, vx: rand(-45, 45), vy: rand(-95, -45), t: 0, id }); sfx('chest'); };
    if (e.boss) give(dr.boss[0], dr.boss[1] + Math.floor(Math.random() * (dr.boss[2] - dr.boss[1] + 1)));
    else if (Math.random() < dr.mob[1] * (e.elite ? 1.6 : 1)) give(dr.mob[0], 1);
  }
  for (let i = 0; i < (e.boss ? 14 : 4); i++) orbs.push({ x: e.x, y: e.y - 6, vx: rand(-50, 50), vy: rand(-80, -20), t: 0, gold: i % 2 === 0 });
  let questJustDone = false;
  const q = save.quest;
  if (q && q.have < q.need) {
    const hit = q.kind === 'kill' || (q.kind === 'elite' && e.elite && !e.boss) || (q.kind === 'boss' && e.boss);
    if (hit) {
      q.have++;
      if (q.have >= q.need) questJustDone = true;
      else floater(e.x, e.y - 52 * e.scale, `ภารกิจ ${q.have}/${q.need}`, '#9affb0', false);
    }
  }
  const lu = addExp(xp);
  if (!lu) hp = Math.min(stats().maxHp, hp + Math.round(stats().maxHp * (e.boss ? 0 : 0.06)));
  writeSave(save);
  freeze = e.boss ? 0.2 : 0.07; addShake(e.boss ? 24 : 7);
  comboShow = 1.6;
  if (lu) levelUpFx(lu);
  refreshHud();
  if (questJustDone) claimQuest(!!lu);
  if (e.boss) { slowmo = 1.6; flashA = 0.7; void bossDefeated(); }
  else { enemies = enemies.filter(x => x !== e); if (pending.length < 40) pending.push({ t: 7 + Math.random() * 5, x: e.x, y: e.y, def: e.def, elite: e.elite }); }
}

async function bossDefeated() {
  bossAlive = false; sfx('win');
  $('bossbar').classList.add('hidden');
  projs = []; teles = [];
  if (!save.cleared.includes(stage.id)) save.cleared.push(stage.id);
  writeSave(save);
  banner('บอสพ่ายแพ้!', [stage.clear, 'บอสจะกลับมาอีกครั้งใน 45 วินาที'], 4200);
  await new Promise(r => setTimeout(r, 1700));
  enemies = enemies.filter(x => !x.boss);
  bossRespawnT = 45;
}
function respawnBoss() {
  const boss = mkEnemy(stage.boss, stage.rec + 2, true, map.boss.x, map.boss.y); boss.flip = -1;
  enemies.push(boss); bossAlive = true; bossAnnounced = false; bossRespawnT = 0;
  toast('บอสกลับมาแล้ว!');
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
  if (def.harbor) {
    if (shipCall.st === 'moored') { await dialogP(n.spr, def.name, ['เรือของเจ้าจอดรออยู่ที่ท่าแล้ว เดินไปที่ปลายท่าเรือแล้วขึ้นเรือได้เลย']); return; }
    if (shipCall.st === 'coming') { await dialogP(n.spr, def.name, ['เรือของเจ้ากำลังเข้าท่า รอสักครู่']); return; }
    await dialogP(n.spr, def.name, def.lines);
    if (await confirmBox('เรียกเรือ', 'ให้เรือของเจ้าแล่นเข้าท่าตอนนี้ไหม?', 'เรียกเรือ', 'ไว้ก่อน')) { shipCall = { st: 'coming', t: 0 }; sfx('equip'); toast('กำลังเรียกเรือของคุณเข้าท่า...'); }
    return;
  }
  if (def.quest) { if (!save.quest && save.questDone === 0) await dialogP(n.spr, def.name, def.lines); openQuest(); return; }
  if (!def.quiz) { await dialogP(n.spr, def.name, def.lines); if (def.craft) openCraft(); return; }
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

const QUEST_TPL: { kind: 'kill' | 'elite' | 'boss'; need: number; mul: number; text: string }[] = [
  { kind: 'kill', need: 5, mul: 0.5, text: 'ปราบมอนสเตอร์ 5 ตัว' },
  { kind: 'kill', need: 12, mul: 1.2, text: 'ปราบมอนสเตอร์ 12 ตัว' },
  { kind: 'elite', need: 2, mul: 1.0, text: 'ปราบมอนสเตอร์ตัวแข็ง 2 ตัว' },
  { kind: 'boss', need: 1, mul: 2.0, text: 'ปราบบอสประจำเกาะ 1 ตัว' },
];
const questReward = (mul: number) => ({ xp: Math.max(1, Math.round(expForLevel(save.level) * mul)), gold: Math.round((30 + save.level * 4) * mul) });
// the reward is paid the moment the quest is finished; a new quest must be taken from the quest-giver before fighting again
function claimQuest(afterLevelUp: boolean) {
  const q = save.quest; if (!q) return;
  const r = questReward(q.mul);
  save.gold += r.gold; save.quest = null; save.questDone++;
  const lu = addExp(r.xp); writeSave(save); refreshHud(); sfx('win'); sfx('coin');
  const show = () => {
    if (lu) levelUpFx(lu);
    else banner('ภารกิจสำเร็จ!', [`ได้รับ EXP +${r.xp}  ทอง +${r.gold}`, 'รับภารกิจใหม่ที่ผู้ดูแลภารกิจเพื่อสู้ต่อ'], 3600);
  };
  if (afterLevelUp) setTimeout(show, 1400); else show();
}
function openQuest() {
  const q = save.quest;
  const head = '<h2>ผู้ดูแลภารกิจ</h2><div class="sub">ทำภารกิจต่อเนื่องเพื่อรับ EXP และทอง ใช้อัปเลเวล</div>';
  if (!q) {
    let t = QUEST_TPL[save.questDone % QUEST_TPL.length];
    if (t.kind === 'boss' && save.level < 2) t = QUEST_TPL[0];
    const r = questReward(t.mul);
    const p = panel(`${head}<div class="rc"><div class="rc-h"><b>${t.text}</b><small>ภารกิจที่ ${save.questDone + 1}</small></div><div class="rc-n"><span class="ok">EXP +${r.xp}</span><span class="ok">ทอง +${r.gold}</span></div><button class="btn gold" id="q-take">รับภารกิจ</button></div><div class="row"><button class="btn alt" id="q-close">ปิด</button></div>`);
    (p.el.querySelector('#q-take') as HTMLElement).onclick = () => { save.quest = { kind: t.kind, need: t.need, have: 0, mul: t.mul, text: t.text }; writeSave(save); sfx('equip'); p.close(); refreshHud(); toast(`รับภารกิจ: ${t.text}`); };
    (p.el.querySelector('#q-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
  } else if (q.have < q.need) {
    const p = panel(`${head}<div class="rc"><div class="rc-h"><b>${q.text}</b><small>กำลังทำ</small></div><div class="rc-n"><span class="${q.have > 0 ? 'ok' : 'no'}">ความคืบหน้า ${q.have}/${q.need}</span></div></div><div class="row"><button class="btn alt" id="q-close">ปิด</button><button class="btn" id="q-drop">ยกเลิกภารกิจ</button></div>`);
    (p.el.querySelector('#q-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
    (p.el.querySelector('#q-drop') as HTMLElement).onclick = async () => { if (await confirmBox('ยกเลิกภารกิจ?', 'ความคืบหน้าจะหายไป', 'ยกเลิกภารกิจ', 'กลับ')) { save.quest = null; writeSave(save); p.close(); refreshHud(); } };
  } else {
    const r = questReward(q.mul);
    const p = panel(`${head}<div class="rc"><div class="rc-h"><b>${q.text}</b><small>สำเร็จแล้ว!</small></div><div class="rc-n"><span class="ok">EXP +${r.xp}</span><span class="ok">ทอง +${r.gold}</span></div><button class="btn gold" id="q-claim">รับรางวัล</button></div>`);
    (p.el.querySelector('#q-claim') as HTMLElement).onclick = () => {
      save.gold += r.gold; save.quest = null; save.questDone++; sfx('coin');
      const lu = addExp(r.xp); writeSave(save); p.close(); refreshHud();
      if (lu) levelUpFx(lu); else banner('รับรางวัลแล้ว', [`EXP +${r.xp}  ทอง +${r.gold}`], 2600);
      setTimeout(openQuest, lu ? 3200 : 1200);
    };
  }
}

function openCraft() {
  const have = (k: string) => save.inv[k] ?? 0;
  const rows = RECIPES.map((r, ri) => {
    const w = WEAPONS[r.weapon], owned = !!save.inv['w' + r.weapon];
    const can = !owned && Object.entries(r.need).every(([k, n]) => have(k) >= n) && save.gold >= r.gold;
    const needs = Object.entries(r.need).map(([k, n]) => `<span class="${have(k) >= n ? 'ok' : 'no'}">${ITEMS[k].name} ${have(k)}/${n}</span>`).join('') + `<span class="${save.gold >= r.gold ? 'ok' : 'no'}">ทอง ${save.gold}/${r.gold}</span>`;
    return `<div class="rc"><div class="rc-h"><b>${esc(w.name)}</b><small>โจมตี +${w.atk} • สกิลพิเศษ</small></div><div class="rc-n">${needs}</div><button class="btn ${can ? 'gold' : ''}" data-i="${ri}" ${can ? '' : 'disabled'}>${owned ? 'มีแล้ว' : 'คราฟ'}</button></div>`;
  }).join('');
  const p = panel(`<h2>ช่างตีดาบ</h2><div class="sub">เอาวัตถุดิบจากมอนสเตอร์และบอสมาตีเป็นอาวุธ</div>${rows}<div class="row"><button class="btn alt" id="rc-close">ปิด</button></div>`);
  p.el.querySelectorAll<HTMLButtonElement>('.rc .btn[data-i]').forEach(b => {
    b.onclick = () => {
      const r = RECIPES[+b.dataset.i!];
      for (const [k, n] of Object.entries(r.need)) save.inv[k] = have(k) - n;
      save.gold -= r.gold; save.inv['w' + r.weapon] = 1; save.gear.weapon = r.weapon; save.prepped = true; writeSave(save);
      sfx('equip'); sfx('levelup'); p.close(); refreshHud();
      banner('คราฟสำเร็จ!', [`ได้ ${WEAPONS[r.weapon].name} และสวมใส่แล้ว`], 3600);
    };
  });
  (p.el.querySelector('#rc-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
}

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

function openPrep(done?: () => void, forceDone = false, startTab = 'body') {
  let tab = startTab, dirIdx = 0;
  const BAG_TABS = ['bag', 'weapon', 'armor', 'sub', 'charm'], bagMode = BAG_TABS.includes(startTab);
  const p = panel(
    `<h2>${bagMode ? 'กระเป๋า' : 'แต่งตัว'}</h2><div class="sub">${bagMode ? 'ดูไอเทม วัตถุดิบ และสวมใส่อุปกรณ์ — ปลดล็อกตามเลเวลหรือคราฟ' : 'เปลี่ยนหน้าตาและเสื้อผ้าของอัศวิน (แตะตัวละครเพื่อหมุนดู)'}</div>` +
    `<div class="prep-body"><div><div class="prep-view"><canvas id="pv" width="40" height="48"></canvas></div><div class="prep-stats" id="pst"></div></div>` +
    `<div><div class="tabs" id="tabs"></div><div class="opts" id="opts"></div></div></div><button class="btn gold" id="prep-ok">${forceDone ? 'พร้อมออกเดินทาง' : 'ปิด'}</button>`);
  p.el.classList.add('prep');
  if (forceDone) p.onX = () => (p.el.querySelector('#prep-ok') as HTMLElement).click();
  const pv = p.el.querySelector('#pv') as HTMLCanvasElement, tabsEl = p.el.querySelector('#tabs') as HTMLElement, optsEl = p.el.querySelector('#opts') as HTMLElement, pst = p.el.querySelector('#pst') as HTMLElement;
  const ALL_TABS: [string, string][] = [['bag', 'วัตถุดิบ'], ['weapon', 'ดาบ'], ['armor', 'เกราะ'], ['sub', 'อาวุธเสริม'], ['charm', 'เครื่องราง'], ['body', 'ร่างกาย'], ['head', 'ศีรษะ'], ['trim', 'สีเกราะ'], ['cape', 'ผ้าคลุม'], ['boots', 'รองเท้า']];
  const TABS = ALL_TABS.filter(([k]) => BAG_TABS.includes(k) === bagMode);
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
      case 'bag': {
        const rows: Row[] = [{ h: `วัตถุดิบและไอเทม • ทอง ${save.gold}` }];
        for (const [k, it] of Object.entries(ITEMS)) {
          const n = save.inv[k] ?? 0;
          rows.push({ html: `<span class="sw" style="background:${it.color}"></span>${it.name} ×${n}<small>${n ? it.desc : 'ยังไม่มี — ล่ามอนสเตอร์เพื่อเก็บ'}</small>`, on: false, locked: n === 0, cls: '', pick: () => { toast(it.desc); } });
        }
        rows.push({ h: 'อาวุธที่คราฟแล้ว' });
        WEAPONS.forEach((w, wi) => { if (w.craft) rows.push({ html: `${w.name}<small>${save.inv['w' + wi] ? 'ไปที่แท็บ "ดาบ" เพื่อสวมใส่' : 'ยังไม่ได้คราฟ — ไปที่ช่างตีดาบ'}</small>`, on: save.gear.weapon === wi, locked: !save.inv['w' + wi], cls: '', pick: () => { tab = 'weapon'; } }); });
        return rows;
      }
      case 'body': return [...colorSet('สีผิว', SKINS, COLOR_NAMES.skin, L.skin, i => { L.skin = i; }), ...colorSet('สีผม', HAIRS, COLOR_NAMES.hair, L.hair, i => { L.hair = i; })];
      case 'head': return [...itemSet('หมวก / เครื่องประดับศีรษะ', HELMETS, L.helmet, i => { L.helmet = i; }), ...colorSet('สีพู่ / ผ้าคาดศีรษะ', PLUMES, COLOR_NAMES.plume, L.plume, i => { L.plume = i; })];
      case 'armor': return itemSet('เกราะ', ARMORS.map(a => ({ name: a.name, desc: `ป้องกัน +${a.def}`, minLevel: a.minLevel })), G.armor, i => { G.armor = i; });
      case 'trim': return colorSet('สีขอบเกราะและเข็มขัด', TRIMS, COLOR_NAMES.trim, L.trim, i => { L.trim = i; });
      case 'cape': return colorSet('ผ้าคลุม', CAPES, CAPE_NAMES, L.cape, i => { L.cape = i; });
      case 'boots': return colorSet('รองเท้าบู๊ต', BOOTS, COLOR_NAMES.boots, L.boots, i => { L.boots = i; });
      case 'weapon': return itemSet('ดาบประจำตัว', WEAPONS.map((w, wi) => ({ name: w.name, desc: w.craft ? `โจมตี +${w.atk} • คราฟเอง` : `โจมตี +${w.atk}`, minLevel: w.craft && !save.inv['w' + wi] ? 99999 : w.minLevel })), G.weapon, i => { G.weapon = i; });
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
  if (!canFight()) {
    const qn = npcs.filter(n => stage.npcs[n.idx].quest).sort((a, b) => dist(a.x, a.y, P.x, P.y) - dist(b.x, b.y, P.x, P.y))[0];
    return qn ? { x: qn.x, y: qn.y, text: save.quest ? 'กลับไปรับรางวัลภารกิจ' : 'ไปรับภารกิจจากผู้ดูแลภารกิจ', kind: 'npc' } : null;
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
  if (scene === 'sea') { openSeaChart(); return; }
  if (scene !== 'map' || !mmShow) return;
  const p = panel(
    `<h2>แผนที่ ${esc(stage.name)}</h2><div class="sub">${gpsTarget ? esc(gpsTarget.text) : 'สำรวจเพื่อเปิดเผยแผนที่'}</div>` +
    `<canvas id="wm" class="wm"></canvas>` +
    `<div class="legend"><span><i style="background:#fff"></i>คุณ</span><span><i style="background:#ffd84a"></i>NPC</span><span><i style="background:#ff9a3a"></i>หีบสมบัติ</span><span><i style="background:#ff3a3a"></i>บอส</span><span><i style="background:#ffe27a"></i>เส้นทางนำทาง</span></div>` +
    `<div class="row"><button class="btn alt" id="wm-close">ปิด</button><button class="btn" id="wm-stage">กลับล็อบบี้</button></div>`);
  const cv = p.el.querySelector('#wm') as HTMLCanvasElement; cv.width = map.w; cv.height = map.h;
  renderMini(cv.getContext('2d')!);
  (p.el.querySelector('#wm-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
  (p.el.querySelector('#wm-stage') as HTMLElement).onclick = () => { sfx('click'); p.close(); openStageSelect(); };
}

$('btn-map').addEventListener('click', () => { unlockAudio(); sfx('click'); if (!panelOpen()) openWorldMap(); });
mmEl.addEventListener('click', () => { unlockAudio(); sfx('click'); if (!panelOpen()) openWorldMap(); });
$('btn-prep').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene !== 'title' && !panelOpen()) openPrep(undefined, false, 'bag'); });
$('btn-dress').addEventListener('click', () => { unlockAudio(); sfx('click'); if (scene !== 'title' && !panelOpen()) openPrep(undefined, false, 'body'); });
$('btn-gps').addEventListener('click', () => { unlockAudio(); sfx('click'); gpsOn = !gpsOn; $('btn-gps').classList.toggle('on', gpsOn); toast(gpsOn ? 'เปิดระบบนำทาง' : 'ปิดระบบนำทาง'); });

function openStageSelect() { showTitle(); }

async function goHome() {
  if (await confirmBox('กลับลานเมือง?', 'ความคืบหน้าบันทึกอัตโนมัติแล้ว จะวาร์ปกลับไปที่ลานเมืองเกาะสุโขทัย', 'กลับลานเมือง', 'ยกเลิก')) { closeAllPanels(); flushCloud(); void startPlaying(); }
}

function openMenu() {
  const s = stats(), w = gw(), a = ga();
  const nextW = WEAPONS.find(x => x.minLevel > save.level);
  const acc = save.stats.answered ? Math.round(save.stats.correct / save.stats.answered * 100) : 0;
  const p = panel(
    `<h2>${esc(save.name || 'อัศวินผู้กล้า')}</h2><div class="sub">เลเวล ${save.level} • EXP ${save.exp}/${need()}</div>` +
    `<div class="stat-grid"><span>HP <b>${Math.ceil(hp)}/${s.maxHp}</b></span><span>ทอง <b>${save.gold}</b></span><span>โจมตี <b>${s.atk}</b></span><span>ป้องกัน <b>${s.def}</b></span>` +
    `<span>ดาบ <b>${esc(w.name)}</b></span><span>เกราะ <b>${esc(a.name)}</b></span><span>ตอบถูก <b>${save.stats.correct}/${save.stats.answered}</b></span><span>แม่นยำ <b>${acc}%</b></span></div>` +
    (nextW ? `<div class="unlock">ดาบประจำตัวถัดไป: ${esc(nextW.name)} ที่เลเวล ${nextW.minLevel}</div>` : '') +
    (Object.keys(save.inv).some(k => ITEMS[k] && save.inv[k] > 0) ? `<div class="unlock">วัตถุดิบ: ${Object.keys(save.inv).filter(k => ITEMS[k] && save.inv[k] > 0).map(k => `${esc(ITEMS[k].name)} ×${save.inv[k]}`).join(' • ')}</div>` : '') +
    `<button class="btn gold" id="m-resume">เล่นต่อ</button><button class="btn" id="m-prep">เตรียมตัว / แต่งกาย / อุปกรณ์</button><button class="btn" id="m-stage">กลับล็อบบี้</button><button class="btn" id="m-how">วิธีเล่น</button><button class="btn" id="m-home">ออกจากระบบ</button><button class="btn alt" id="m-reset">เริ่มเกมใหม่ทั้งหมด</button>`);
  (p.el.querySelector('#m-resume') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
  (p.el.querySelector('#m-prep') as HTMLElement).onclick = () => { sfx('click'); p.close(); openPrep(); };
  (p.el.querySelector('#m-stage') as HTMLElement).onclick = () => { sfx('click'); p.close(); openStageSelect(); };
  (p.el.querySelector('#m-how') as HTMLElement).onclick = () => { sfx('click'); p.close(); openHowTo(); };
  (p.el.querySelector('#m-home') as HTMLElement).onclick = async () => { sfx('click'); if (await confirmBox('ออกจากระบบ?', 'ความคืบหน้าถูกบันทึกไว้กับบัญชี Google แล้ว', 'ออกจากระบบ', 'ยกเลิก')) { p.close(); flushCloud(); await logout(); } };
  (p.el.querySelector('#m-reset') as HTMLElement).onclick = async () => {
    if (await confirmBox('เริ่มใหม่?', 'ความคืบหน้าทั้งหมดจะหายไป', 'เริ่มใหม่', 'ยกเลิก')) { p.close(); wipeSave(); { const keep = { name: save.name, look: save.look }; save = freshSave(); save.name = keep.name; save.look = keep.look; save.started = true; } hp = stats().maxHp; sp = 0; showTitle(); }
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

function showTitle() { void startPlaying(); }

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
  if (!canFight()) { if (e.st !== 'idle') { e.st = 'idle'; teles = teles.filter(t => t.owner !== e); } e.awake = false; return; }
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
  if (!bossAlive && bossRespawnT > 0) { bossRespawnT -= dt; if (bossRespawnT <= 0) respawnBoss(); }
  for (const pd of pending) pd.t -= dt;
  for (let i = pending.length - 1; i >= 0; i--) {
    const pd = pending[i]; if (pd.t > 0) continue;
    const alive = enemies.filter(e => !e.boss && !e.dead).length;
    if (alive >= ENEMY_MAX + 4) { pending.splice(i, 1); continue; }
    if (dist(pd.x, pd.y, P.x, P.y) < 150 || blockedAt(pd.x, pd.y, 7) || (map.hub && dist(pd.x, pd.y, map.hub.x, map.hub.y) < 400)) { pd.t = 3; continue; }
    const e = mkEnemy(pd.def, stage.rec + (pd.elite ? 2 : Math.random() < 0.5 ? 0 : 1), false, pd.x, pd.y, pd.elite); e.born = 0.01; enemies.push(e); pending.splice(i, 1);
  }
  respawnT -= dt;
  if (respawnT <= 0) { respawnT = 3; if (!stage.town && enemies.filter(e => !e.boss && !e.dead).length < ENEMY_MAX) spawnEnemy(240); }

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
  for (const l of loots) {
    l.t += dt;
    if (l.t < 0.45) { l.x += l.vx * dt; l.y += l.vy * dt; l.vy += 260 * dt; }
    else { const d0 = dist(l.x, l.y, P.x, P.y - 6); if (d0 < 48) { const a = Math.atan2(P.y - 6 - l.y, P.x - l.x), spd = 70 + (48 - d0) * 9; l.x += Math.cos(a) * spd * dt; l.y += Math.sin(a) * spd * dt; } }
    if (l.t > 0.45 && dist(l.x, l.y, P.x, P.y - 6) < 8) {
      save.inv[l.id] = (save.inv[l.id] ?? 0) + 1; floater(P.x, P.y - 28, `+${ITEMS[l.id].name}`, ITEMS[l.id].color, true);
      sfx('coin'); burst(P.x, P.y - 8, [ITEMS[l.id].color, '#fff'], 8, 40, 14); l.t = 999; writeSave(save);
    }
  }
  loots = loots.filter(l => l.t < 60);

  // ---- NPC proximity
  nearNpc = null; let bd = 26;
  for (const n of npcs) { const d = dist(P.x, P.y, n.x, n.y); if (d < bd) { bd = d; nearNpc = n; } }
  let nearChest: Chest | null = null, cd2 = 20;
  for (const c of chests) if (!c.open) { const d = dist(P.x, P.y, c.x, c.y); if (d < cd2) { cd2 = d; nearChest = c; } }
  if (shipCall.st === 'coming') { shipCall.t += dt / 3.4; if (shipCall.t >= 1) { shipCall = { st: 'moored', t: 1 }; sfx('equip'); banner('เรือมาถึงแล้ว', ['เดินไปที่ท่าเรือแล้วกด "ขึ้นเรือ"'], 3400); } }
  const boatAt = map.dock ? (shipCall.st === 'moored' ? map.dock : null) : { x: map.start.x - 10, y: map.start.y + 4 };
  const nearBoat = !!boatAt && !nearNpc && !nearChest && dist(P.x, P.y, boatAt.x, boatAt.y) < (map.dock ? 44 : 24);
  const actBtn = $('btn-act');
  actBtn.classList.toggle('hidden', !nearNpc && !nearChest && !nearBoat); actBtn.textContent = nearNpc ? 'คุย' : nearChest ? 'เปิด' : map.dock ? 'ขึ้นเรือ' : 'ลงเรือ';
  if (flags.act) { flags.act = false; if (nearNpc) { sfx('click'); void talkNpc(nearNpc); } else if (nearChest) openChest(nearChest); else if (nearBoat) { sfx('click'); enterSea(stage.id); } }

  updateMultiplayer(dt);

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
  drawTag(x, y - 24 - bob, save.name || 'ฉัน', save.level, true);
  if (myBubble.t > 0) drawBubble(x, y - 31 - bob, myBubble.text, myBubble.t);
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
  for (const r of remotes.values()) items.push({ y: r.y, draw: () => drawRemote(r) });
  for (const p of map.props) items.push({ y: p.kind === 'house' ? p.y + 3 * TS : p.kind === 'fountain' ? p.y + 12 : p.y + 6, draw: () => drawProp(p) });
  if (!map.dock) items.push({ y: map.start.y + 8, draw: () => drawShip(map.start.x - 10, map.start.y + 8, -1, time, { sails: false, rider: false, scale: 0.8 }) });
  if (map.shipSpot && shipCall.st !== 'none') items.push({ y: map.shipSpot.y + 6, draw: () => {
    const k = shipCall.st === 'moored' ? 1 : 1 - Math.pow(1 - shipCall.t, 3), sx = map.shipSpot!.x - (1 - k) * 280, sy = map.shipSpot!.y;
    if (shipCall.st === 'coming') { ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let q = 0; q < 6; q++) ctx.fillRect(sx - 26 - q * 7, sy + 4 + (q % 2), 4, 1); }
    drawShip(sx, sy, 1, time, { sails: shipCall.st === 'coming', rider: false, scale: 0.9 });
  } });
  for (const n of npcs) {
    const nd = stage.npcs[n.idx];
    const done = nd.quest ? !!save.quest && save.quest.have < save.quest.need : !nd.quiz || save.quests[`${stage.id}-${n.idx}`];
    items.push({ y: n.y, draw: () => {
      if (stage.town || stage.hub) {
        ctx.fillStyle = '#5a3818'; ctx.fillRect(n.x - 11, n.y - 24, 2, 17); ctx.fillRect(n.x + 9, n.y - 24, 2, 17);
        ctx.fillStyle = stage.npcs[n.idx].robe; ctx.fillRect(n.x - 13, n.y - 28, 26, 6);
        ctx.fillStyle = '#f4ecd8'; for (let k = 0; k < 4; k++) ctx.fillRect(n.x - 13 + k * 7 + 2, n.y - 28, 3, 6);
        ctx.fillStyle = '#7a5a2a'; ctx.fillRect(n.x - 12, n.y - 6, 24, 3);
      }
      drawShadow(ctx, n.x, n.y, 5, 2);
      ctx.drawImage(n.spr, n.x - 8, n.y - 15 + Math.sin(time * 2 + n.idx) * 0.3);
      { const nd0 = stage.npcs[n.idx], col = nd0.quest ? '#7cc8ff' : nd0.craft ? '#ffb868' : nd0.harbor ? '#6ee8e8' : nd0.role ? '#d8d0a0' : '#c8e8a8'; drawNpcTag(n.x, n.y - (stage.hub ? 32 : 19), nd0.name, npcRole(nd0), col); }
      if (!done) { ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 9px "Pixelify Sans", monospace'; ctx.textAlign = 'center'; ctx.fillText('!', n.x, n.y - (stage.hub ? 47 : 34) + Math.sin(time * 5) * 1.5); }
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
  for (const l of loots) {
    const by = l.y + Math.sin(time * 5 + l.x) * 1.2, col = ITEMS[l.id].color;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(l.x, by, 0, l.x, by, 9); gl.addColorStop(0, col + 'aa'); gl.addColorStop(1, col + '00'); ctx.fillStyle = gl; ctx.fillRect(l.x - 9, by - 9, 18, 18); ctx.restore();
    ctx.fillStyle = '#000'; ctx.fillRect(l.x - 3, by - 3, 6, 6); ctx.fillStyle = col; ctx.fillRect(l.x - 2, by - 2, 4, 4); ctx.fillStyle = '#fff'; ctx.fillRect(l.x - 1, by - 2, 1, 1);
  }
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
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = AMBIENT[themeIx(stage.id)]; ctx.fillRect(0, 0, W, H); ctx.restore();
  // weather
  const wc = WEATHER[themeIx(stage.id)];
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

// ================================================================== in-app browsers are not supported
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|MicroMessenger|KAKAOTALK|Pinterest|LinkedInApp/i.test(navigator.userAgent);
if (IN_APP) {
  document.body.classList.add('inapp');
  const url = location.href;
  $('inapp-open').onclick = () => {
    if (/Android/i.test(navigator.userAgent)) location.href = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
    else { const w = window.open(url, '_blank'); if (!w) $('inapp-sub').textContent = 'เปิดอัตโนมัติไม่ได้ กรุณาทำตามขั้นตอนด้านล่าง'; }
  };
  $('inapp-copy').onclick = async () => { try { await navigator.clipboard.writeText(url); $('inapp-copy').textContent = 'คัดลอกแล้ว — นำไปวางใน Chrome/Safari'; } catch { prompt('คัดลอกลิงก์นี้', url); } };
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


// ================================================================== sea (world 1): floating islands you sail between
const SEA_W = 300, SEA_H = 210, SC = 2; // tiles; SC = world px per terrain cell (fine coastlines)
const ISLAND_POS: [number, number][] = [[40, 168], [92, 176], [143, 187], [204, 167], [265, 184], [255, 126], [197, 109], [139, 129], [78, 112], [34, 68], [92, 44], [153, 65], [214, 41], [272, 75], [275, 24]];
interface SeaIsland { id: number; cx: number; cy: number; R: number; ph: number[]; dock: { x: number; y: number }; ang: number; hut: { x: number; y: number }; }
interface SeaTree { x: number; y: number; spr: Sprite; }
interface Sea { img: HTMLCanvasElement; mini: HTMLCanvasElement; land: Uint8Array; gw: number; gh: number; islands: SeaIsland[]; trees: SeaTree[]; }
let sea: Sea | null = null;
const ship = { x: 0, y: 0, vx: 0, vy: 0, face: 1, boost: 0, boostCd: 0, wakeT: 0, saveT: 0, hudT: 0, wake: [] as { x: number; y: number; t: number }[] };
let nearDock: SeaIsland | null = null;
const clouds = Array.from({ length: 22 }, (_, i) => ({ x: (i * 977) % (SEA_W * TS), y: (i * 613) % (SEA_H * TS), r: 70 + (i % 5) * 28, sp: 6 + (i % 4) * 2.5 }));
const shoreR = (i: { R: number; ph: number[] }, th: number) =>
  i.R * (1 + 0.2 * Math.sin(2 * th + i.ph[0]) + 0.14 * Math.sin(3 * th + i.ph[1]) + 0.09 * Math.sin(5 * th + i.ph[2]) + 0.05 * Math.sin(9 * th + i.ph[3]));
const hexRgb = (hx: string): [number, number, number] => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function genSea(): Sea {
  const w = SEA_W, h = SEA_H, gw = w * TS / SC, gh = h * TS / SC, r = seeded(777), CT = TS / SC; // CT = cells per tile
  const islands: SeaIsland[] = ISLANDS.map((st, i) => {
    const [cx, cy] = ISLAND_POS[i];
    return { id: st.id, cx, cy, R: i === 0 ? 15 : 9 + (i % 3) * 1.5 + Math.min(5, i / 3), ph: [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28], dock: { x: 0, y: 0 }, ang: 0, hut: { x: 0, y: 0 } };
  });
  islands.forEach((isl, i) => {
    isl.ang = i === 0 ? Math.PI / 2 : Math.atan2(islands[i - 1].cy - isl.cy, islands[i - 1].cx - isl.cx);
    const rr = shoreR(isl, isl.ang) + 3;
    isl.dock = { x: (isl.cx + Math.cos(isl.ang) * rr) * TS, y: (isl.cy + Math.sin(isl.ang) * rr) * TS };
    isl.hut = { x: isl.dock.x - Math.cos(isl.ang) * 62 + Math.sin(isl.ang) * 22, y: isl.dock.y - Math.sin(isl.ang) * 62 - Math.cos(isl.ang) * 22 };
  });
  const E = new Float32Array(gw * gh).fill(99), BI = new Uint8Array(gw * gh), Hh = new Float32Array(gw * gh), land = new Uint8Array(gw * gh);
  const nzA = valueNoise(gw, gh, 70, 5), nzB = valueNoise(gw, gh, 26, 6), nzC = valueNoise(gw, gh, 12, 8), nzD = valueNoise(gw, gh, 5, 9);
  // pass 1: signed distance to the nearest coast (tiles), ragged by noise
  islands.forEach((isl, k) => {
    const lim = isl.R * 1.55 + 14;
    const x0 = Math.max(0, Math.floor((isl.cx - lim) * CT)), x1 = Math.min(gw - 1, Math.ceil((isl.cx + lim) * CT));
    const y0 = Math.max(0, Math.floor((isl.cy - lim) * CT)), y1 = Math.min(gh - 1, Math.ceil((isl.cy + lim) * CT));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const u = (cx + 0.5) / CT, v = (cy + 0.5) / CT, dx = u - isl.cx, dy = v - isl.cy;
      const e = Math.hypot(dx, dy) - shoreR(isl, Math.atan2(dy, dx)) + (nzD(cx, cy) - 0.5) * 1.4;
      const i = cy * gw + cx;
      if (e < E[i]) { E[i] = e; BI[i] = k; }
    }
  });
  // heights (land only): inland depth + hills + a peak per island
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const i = cy * gw + cx;
    if (E[i] >= 0) continue;
    land[i] = 1;
    const isl = islands[BI[i]], u = (cx + 0.5) / CT, v = (cy + 0.5) / CT;
    const px = isl.cx + Math.cos(isl.ph[0]) * isl.R * 0.25, py = isl.cy + Math.sin(isl.ph[1]) * isl.R * 0.25;
    const bump = Math.max(0, 1 - Math.hypot(u - px, v - py) / (isl.R * 0.62)) * isl.R * 0.6;
    Hh[i] = -E[i] * 0.85 + (nzA(cx, cy) - 0.5) * 6 + (nzB(cx, cy) - 0.5) * 2.4 + bump;
  }
  // pass 2: colour
  const img = document.createElement('canvas'); img.width = gw; img.height = gh;
  const g = img.getContext('2d')!; const id = g.createImageData(gw, gh), px = id.data;
  const WATER: [number, [number, number, number]][] = [[0, [150, 238, 244]], [0.08, [102, 216, 250]], [0.3, [58, 172, 242]], [0.7, [36, 138, 228]], [1, [26, 114, 208]]];
  const waterCol = (d: number): [number, number, number] => {
    for (let k = 1; k < WATER.length; k++) if (d <= WATER[k][0]) { const [d0, c0] = WATER[k - 1], [d1, c1] = WATER[k], f = (d - d0) / (d1 - d0); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; }
    return WATER[WATER.length - 1][1];
  };
  const themeCols = islands.map((_, k) => { const t = ISLANDS[k].theme; return { g1: hexRgb(t.g1), g2: hexRgb(t.g2), oc: hexRgb(t.oc) }; });
  const mix = (a: number[], b: number[], f: number): [number, number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const i = cy * gw + cx, e = E[i], bay = BAYER[(cy & 3) * 4 + (cx & 3)] / 16 - 0.5, sp = (nzD((cx * 13) % gw, (cy * 7) % gh) - 0.5) * 7;
    let c: [number, number, number];
    if (e >= 0) {
      c = waterCol(Math.min(1, e / 14));
      c = [c[0] + sp * 0.6, c[1] + sp * 0.6, c[2] + sp * 0.6];
      const foam = 1 - e / 0.8;
      if (e < 0.8 && foam > bay + 0.55 * (nzC(cx, cy) - 0.5) + 0.35) c = [240, 252, 255];
      else if (e > 1.5 && e < 2.2 && (nzC((cx + 9) % gw, cy) > 0.62) && bay > 0.1) c = mix(c, [210, 240, 250], 0.5);
    } else {
      const k = BI[i], th = themeCols[k], isl = islands[k], d = -e, hh = Hh[i];
      if (d < 0.9) c = [196, 178, 130];
      else if (d < 2.8 + (nzC(cx, cy) - 0.5) * 1.6) c = mix([236, 220, 168], [226, 208, 152], (d - 0.9) / 1.9);
      else {
        const t = hh / (isl.R * 0.9);
        const base = mix(th.g1, th.g2, nzC(cx, cy) > 0.5 ? 0.85 : 0.1);
        if (t < 0.5) c = base;
        else if (t < 0.85) c = mix(base, [base[0] * 0.62, base[1] * 0.7, base[2] * 0.62], Math.min(1, (t - 0.5) / 0.15));
        else if (t < 1.15 || isl.R < 11) c = mix([126, 118, 106], th.oc, 0.35 + (nzC(cx, cy) - 0.5) * 0.4);
        else c = [236, 240, 244];
        // relief shading (light from north-west)
        const ia = Math.max(0, cy - 1) * gw + Math.max(0, cx - 1), ib = Math.min(gh - 1, cy + 1) * gw + Math.min(gw - 1, cx + 1);
        const sh = Math.max(-18, Math.min(18, (Hh[ia] - Hh[ib]) * 4.2));
        c = [c[0] + sh + sp, c[1] + sh + sp, c[2] + sh + sp];
      }
    }
    const o = i * 4; px[o] = Math.max(0, Math.min(255, Math.round(c[0] / 5 + bay * 0.8) * 5)); px[o + 1] = Math.max(0, Math.min(255, Math.round(c[1] / 5 + bay * 0.8) * 5)); px[o + 2] = Math.max(0, Math.min(255, Math.round(c[2] / 5 + bay * 0.8) * 5)); px[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  // minimap (1px per tile)
  const mini = document.createElement('canvas'); mini.width = w; mini.height = h;
  const m = mini.getContext('2d')!;
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = Math.floor((ty + 0.5) * CT) * gw + Math.floor((tx + 0.5) * CT), e = E[i];
    if (e >= 0) { const c = waterCol(Math.min(1, e / 14)); m.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
    else { const t = themeCols[BI[i]]; m.fillStyle = e > -1.6 ? '#e6d6a0' : Hh[i] / (islands[BI[i]].R * 0.9) > 0.85 ? '#8a8272' : `rgb(${t.g1[0] | 0},${t.g1[1] | 0},${t.g1[2] | 0})`; }
    m.fillRect(tx, ty, 1, 1);
  }
  // trees and rocks
  const sprites = islands.map((_, k) => [0, 1, 2].map(v => obstacleSprite(ISLANDS[k].theme.obs, ISLANDS[k].theme.oc, v)));
  const rocks = [0, 1, 2].map(v => obstacleSprite('rock', '#8a8070', v));
  const trees: SeaTree[] = [];
  for (let ty = 2; ty < h - 2; ty++) for (let tx = 2; tx < w - 2; tx++) {
    const i = Math.floor((ty + 0.5) * CT) * gw + Math.floor((tx + 0.5) * CT);
    if (!land[i] || -E[i] < 3.4) continue;
    const k = BI[i], isl = islands[k], t = Hh[i] / (isl.R * 0.9);
    const wx = tx * TS + 4 + r() * 8, wy = ty * TS + 12 + r() * 3;
    if (Math.hypot(wx - isl.dock.x, wy - isl.dock.y) < 80 || Math.hypot(wx - isl.hut.x, wy - isl.hut.y) < 26) continue;
    const dens = t < 0.15 ? 0.04 : t < 0.5 ? 0.09 : t < 0.85 ? 0.34 : 0.07;
    if (r() > dens) continue;
    trees.push({ x: wx, y: wy, spr: t >= 0.85 ? rocks[(tx + ty) % 3] : sprites[k][(tx * 3 + ty) % 3] });
  }
  trees.sort((a, b) => a.y - b.y);
  return { img, mini, land, gw, gh, islands, trees };
}

function seaBlocked(x: number, y: number) {
  const s = sea!;
  for (const [ox, oy] of [[0, 0], [6, 0], [-6, 0], [0, 4], [0, -4]]) {
    const cx = Math.floor((x + ox) / SC), cy = Math.floor((y + oy) / SC);
    if (cx < 8 || cy < 8 || cx >= s.gw - 8 || cy >= s.gh - 8 || s.land[cy * s.gw + cx]) return true;
  }
  return false;
}

function enterSea(fromIsland: number | null = null) {
  closeAllPanels();
  if (!sea) sea = genSea();
  const s = sea;
  scene = 'sea'; inStage = false;
  const idx = fromIsland !== null ? Math.max(0, islandIndex(fromIsland)) : 0;
  if (fromIsland !== null || !(save.sea.x > 0)) { ship.x = s.islands[idx].dock.x; ship.y = s.islands[idx].dock.y; }
  else { ship.x = save.sea.x; ship.y = save.sea.y; }
  if (seaBlocked(ship.x, ship.y)) { ship.x = s.islands[idx].dock.x; ship.y = s.islands[idx].dock.y; }
  ship.vx = ship.vy = 0; ship.boost = 0; ship.boostCd = 0; ship.wake = []; ship.hudT = 0; navT = 0; navFor = -9; navAuto = { key: '', id: 0 };
  leaveIslandRoom(); closeChat(); $('chatlog').classList.add('hidden');
  save.loc = { kind: 'sea', id: 0 }; save.sea = { x: ship.x, y: ship.y, a: 0 }; writeSave(save);
  cam.x = ship.x - W / Math.max(2, Z - 1) / 2; cam.y = ship.y - H / Math.max(2, Z - 1) / 2;
  enemies = []; parts = []; rings = []; slashes = []; bolts = []; floaters = []; orbs = []; projs = []; teles = []; daggers = []; puddles = []; waves = [];
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden'); $('touch').classList.add('sea'); $('btn-dodge').textContent = 'เร่ง';
  $('bossbar').classList.add('hidden'); $('side-btns').classList.remove('hidden'); $('btn-act').classList.add('hidden');
  mmEl.width = SEA_W; mmEl.height = SEA_H; mmEl.classList.remove('hidden');
  weather = [];
  setMusic('map', 0);
  refreshHud();
  toast('ล่องเรือ: เข้าใกล้ท่าเรือของเกาะแล้วกด "ขึ้นเกาะ"');
}

let navAuto = { key: '', id: 0 };
function navTarget(): SeaIsland {
  const s = sea!;
  if (save.nav) { const t = s.islands.find(i => i.id === save.nav - 1); if (t) return t; }
  const unlocked = s.islands.filter(i => getStage(i.id).rec <= save.level);
  const key = (canFight() ? 'farm' : 'quest') + save.level;
  if (navAuto.key !== key || !s.islands.some(i => i.id === navAuto.id)) {
    const pick = canFight()
      ? unlocked[unlocked.length - 1]
      : unlocked.reduce((bst, i) => dist(ship.x, ship.y, i.dock.x, i.dock.y) < dist(ship.x, ship.y, bst.dock.x, bst.dock.y) ? i : bst, unlocked[0]);
    navAuto = { key, id: pick.id };
  }
  return s.islands.find(i => i.id === navAuto.id)!;
}

// ---- GPS route over open water (grid path-finding around the islands)
const NGC = 8;
let navW = 0, navH = 0, navBlock: Uint8Array | null = null, navField: Uint16Array | null = null, navFor = -9, navPts: { x: number; y: number }[] = [], navT = 0;
function navInit() {
  const s = sea!, per = NGC / SC;
  navW = Math.ceil(SEA_W * TS / NGC); navH = Math.ceil(SEA_H * TS / NGC);
  const raw = new Uint8Array(navW * navH);
  for (let y = 0; y < navH; y++) for (let x = 0; x < navW; x++) {
    let land = x < 2 || y < 2 || x >= navW - 2 || y >= navH - 2;
    for (let j = 0; j < per && !land; j++) for (let k = 0; k < per; k++) { const cx = x * per + k, cy = y * per + j; if (cx < s.gw && cy < s.gh && s.land[cy * s.gw + cx]) { land = true; break; } }
    raw[y * navW + x] = land ? 1 : 0;
  }
  navBlock = new Uint8Array(navW * navH);
  for (let y = 0; y < navH; y++) for (let x = 0; x < navW; x++) {
    let bl = 0;
    for (let j = -1; j <= 1 && !bl; j++) for (let k = -1; k <= 1; k++) { const nx = x + k, ny = y + j; if (nx < 0 || ny < 0 || nx >= navW || ny >= navH || raw[ny * navW + nx]) { bl = 1; break; } }
    navBlock[y * navW + x] = bl;
  }
}
function navFree(cx: number, cy: number, maxR = 8): [number, number] | null {
  const bl = navBlock!;
  for (let r = 0; r <= maxR; r++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
    if (Math.max(Math.abs(j), Math.abs(k)) !== r) continue;
    const x = cx + k, y = cy + j; if (x >= 0 && y >= 0 && x < navW && y < navH && !bl[y * navW + x]) return [x, y];
  }
  return null;
}
function navBuild(targetId: number) {
  if (!navBlock) navInit();
  const tg = sea!.islands.find(i => i.id === targetId)!, bl = navBlock!;
  const start = navFree(Math.floor(tg.dock.x / NGC), Math.floor(tg.dock.y / NGC), 10);
  navFor = targetId; navField = new Uint16Array(navW * navH).fill(65535);
  if (!start) return;
  const f = navField, q = new Int32Array(navW * navH); let qh = 0, qt = 0;
  f[start[1] * navW + start[0]] = 0; q[qt++] = start[1] * navW + start[0];
  while (qh < qt) {
    const c = q[qh++], cx = c % navW, cy = (c / navW) | 0, cv = f[c];
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      if (!j && !k) continue;
      const nx = cx + k, ny = cy + j; if (nx < 0 || ny < 0 || nx >= navW || ny >= navH) continue;
      const ni = ny * navW + nx; if (bl[ni] || f[ni] !== 65535) continue;
      if (j && k && (bl[cy * navW + nx] || bl[ny * navW + cx])) continue;
      f[ni] = cv + 1; q[qt++] = ni;
    }
  }
}
function navRoute() {
  const f = navField; navPts = [];
  if (!f) return;
  const start = navFree(Math.floor(ship.x / NGC), Math.floor(ship.y / NGC), 8);
  if (!start) return;
  let cx = start[0], cy = start[1], guard = 0; const pts: { x: number; y: number }[] = [];
  while (guard++ < 4000) {
    pts.push({ x: cx * NGC + NGC / 2, y: cy * NGC + NGC / 2 });
    const cv = f[cy * navW + cx]; if (cv === 0 || cv === 65535) break;
    let best = cv, bx = cx, by = cy;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      if (!j && !k) continue;
      const nx = cx + k, ny = cy + j; if (nx < 0 || ny < 0 || nx >= navW || ny >= navH) continue;
      const v = f[ny * navW + nx]; if (v < best) { best = v; bx = nx; by = ny; }
    }
    if (bx === cx && by === cy) break;
    cx = bx; cy = by;
  }
  const out: { x: number; y: number }[] = [{ x: ship.x, y: ship.y }];
  for (let i = 2; i < pts.length - 1; i += 3) out.push(pts[i]);
  const tg = sea!.islands.find(i => i.id === navFor);
  if (tg) out.push({ x: tg.dock.x, y: tg.dock.y });
  navPts = out;
}

function boardIsland(isl: SeaIsland) {
  const st = getStage(isl.id);
  if (save.level < st.rec) { sfx('wrong'); toast(`ต้องเลเวล ${st.rec} ก่อนขึ้นเกาะ ${st.name}`); return; }
  sfx('click');
  if (save.nav - 1 === isl.id) save.nav = 0;
  navAuto = { key: '', id: 0 };
  save.sea = { x: ship.x, y: ship.y, a: 0 }; writeSave(save);
  hideLobby();
  arriveFromSea = true;
  void enterStage(st.id);
}

function updateSea(dt: number) {
  const s = sea!;
  ship.boost = Math.max(0, ship.boost - dt); ship.boostCd = Math.max(0, ship.boostCd - dt);
  let mx = stick.x, my = stick.y;
  if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
  if (keys.has('arrowright') || keys.has('d')) mx += 1;
  if (keys.has('arrowup') || keys.has('w')) my -= 1;
  if (keys.has('arrowdown') || keys.has('s')) my += 1;
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  if (flags.dodge && ship.boostCd <= 0) { ship.boost = 1.4; ship.boostCd = 4; sfx('dodge'); }
  flags.dodge = false; flags.atk = false; flags.skill = false; flags.s1 = flags.s2 = flags.s3 = false;
  const spd = ship.boost > 0 ? 200 : 115, k = Math.min(1, dt * 3);
  ship.vx += (mx * spd - ship.vx) * k; ship.vy += (my * spd - ship.vy) * k;
  if (Math.abs(ship.vx) > 4) ship.face = Math.sign(ship.vx);
  const nx = ship.x + ship.vx * dt, ny = ship.y + ship.vy * dt;
  if (!seaBlocked(nx, ship.y)) ship.x = nx; else ship.vx *= -0.2;
  if (!seaBlocked(ship.x, ny)) ship.y = ny; else ship.vy *= -0.2;
  ship.wakeT -= dt;
  if (ship.wakeT <= 0 && Math.hypot(ship.vx, ship.vy) > 20) { ship.wakeT = 0.07; ship.wake.push({ x: ship.x - Math.sign(ship.vx || 1) * 8, y: ship.y + 4, t: 0.9 }); }
  ship.wake = ship.wake.filter(p => (p.t -= dt) > 0);
  hp = Math.min(stats().maxHp, hp + stats().maxHp * 0.04 * dt);

  nearDock = null; let bd = 34;
  for (const isl of s.islands) { const d = dist(ship.x, ship.y, isl.dock.x, isl.dock.y); if (d < bd) { bd = d; nearDock = isl; } }
  const actBtn = $('btn-act');
  actBtn.classList.toggle('hidden', !nearDock); actBtn.textContent = 'ขึ้นเกาะ';
  if (flags.act) { flags.act = false; if (nearDock) boardIsland(nearDock); }

  ship.saveT -= dt;
  if (ship.saveT <= 0) { ship.saveT = 5; save.sea = { x: ship.x, y: ship.y, a: 0 }; writeSave(save); }
  navT -= dt;
  if (navT <= 0) { navT = 0.3; const tg0 = navTarget(); if (navFor !== tg0.id) navBuild(tg0.id); navRoute(); }
  ship.hudT -= dt;
  if (ship.hudT <= 0) {
    ship.hudT = 0.25;
    const t = navTarget(), st = getStage(t.id), d = Math.round(dist(ship.x, ship.y, t.dock.x, t.dock.y) / TS);
    const o = $('objective'); o.classList.remove('hidden'); o.dataset.kind = save.level >= st.rec ? 'grind' : 'boss';
    const why = save.nav ? 'ล่องเรือไป' : !save.quest ? 'ไปรับภารกิจที่' : canFight() ? 'ไปฟาร์มที่' : 'ไปรับรางวัลภารกิจที่';
    $('obj-text').textContent = save.level >= st.rec ? `${why} ${st.name}` : `${st.name} (ต้องเลเวล ${st.rec})`;
    $('obj-dist').textContent = `ห่างอีกประมาณ ${d} ช่อง`;
    refreshHud();
  }
}

function drawProp(p: Prop) {
  if (p.kind === 'house') {
    const x = Math.round(p.x), y = Math.round(p.y), w = 4 * TS, bh = 3 * TS;
    const roofC = ['#b8412c', '#3f7a9a', '#6a8a3a'][p.v % 3], wallC = ['#e8dab0', '#e0e4d0', '#f0e0c0'][p.v % 3];
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 2, y + bh - 3, w, 5);
    ctx.fillStyle = wallC; ctx.fillRect(x + 4, y + 14, w - 8, bh - 14);
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x + 4, y + bh - 6, w - 8, 6);
    ctx.fillStyle = '#7a5a2c'; ctx.fillRect(x + 4, y + 14, 2, bh - 14); ctx.fillRect(x + w - 6, y + 14, 2, bh - 14); ctx.fillRect(x + 4, y + 26, w - 8, 2);
    ctx.fillStyle = '#5a3818'; ctx.fillRect(x + w / 2 - 5, y + bh - 20, 10, 20); ctx.fillStyle = '#ffd84a'; ctx.fillRect(x + w / 2 + 2, y + bh - 11, 2, 2);
    for (const wx of [x + 12, x + w - 22]) {
      ctx.fillStyle = '#4a3418'; ctx.fillRect(wx - 1, y + 30, 12, 12); ctx.fillStyle = '#9ad0f0'; ctx.fillRect(wx, y + 31, 10, 10);
      ctx.fillStyle = '#fff'; ctx.fillRect(wx + 1, y + 32, 3, 3); ctx.fillStyle = '#4a3418'; ctx.fillRect(wx + 4, y + 31, 1, 10);
    }
    ctx.fillStyle = roofC; ctx.beginPath(); ctx.moveTo(x - 4, y + 20); ctx.lineTo(x + w / 2, y - 10); ctx.lineTo(x + w + 4, y + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(x + w / 2, y - 10); ctx.lineTo(x + w + 4, y + 20); ctx.lineTo(x + w / 2, y + 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 4, y + 19, w + 8, 2);
    ctx.fillStyle = '#7a6a5a'; ctx.fillRect(x + w - 18, y - 2, 6, 12);
    for (let k = 0; k < 3; k++) { const tt = (time * 0.5 + k / 3) % 1; ctx.globalAlpha = (1 - tt) * 0.5; ctx.fillStyle = '#f0f0f0'; ctx.fillRect(x + w - 17 + Math.sin(tt * 6 + k) * 3, y - 5 - tt * 24, 4 + tt * 3, 4 + tt * 3); }
    ctx.globalAlpha = 1;
  } else if (p.kind === 'fountain') {
    const fk = p.v === 1 ? 1.6 : 1; ctx.save(); ctx.translate(p.x, p.y); ctx.scale(fk, fk); const cx = 0, cy = 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 10, 21, 8, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#9a9aa8'; ctx.beginPath(); ctx.ellipse(cx, cy + 5, 19, 10, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#c4c4d0'; ctx.beginPath(); ctx.ellipse(cx, cy + 3, 19, 9.5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#5cc0ee'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 15, 7, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(cx - 9 + ((time * 8) % 14), cy + 3, 4, 1);
    ctx.fillStyle = '#b0b0be'; ctx.fillRect(cx - 2, cy - 14, 4, 18); ctx.fillStyle = '#d4d4de'; ctx.fillRect(cx - 5, cy - 16, 10, 3);
    for (let k = 0; k < 8; k++) {
      const a = k * 0.785, tt = (time * 1.3 + k * 0.125) % 1, rr = tt * 11;
      ctx.fillStyle = 'rgba(210,240,255,.85)'; ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy - 14 - Math.sin(Math.PI * tt) * 9 + tt * 14), 1.5, 1.5);
    }
    ctx.restore();
  } else if (p.kind === 'lamp') {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 3, y - 1, 8, 2);
    ctx.fillStyle = '#2a1c10'; ctx.fillRect(x - 1, y - 20, 2, 20); ctx.fillStyle = '#3a2a1c'; ctx.fillRect(x - 3, y - 24, 6, 5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(x, y - 21, 1, x, y - 21, 30 + Math.sin(time * 5 + x) * 1.5); gr.addColorStop(0, 'rgba(255,200,110,.32)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - 34, y - 56, 68, 68); ctx.restore();
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - 2, y - 23, 4, 3);
  } else if (p.kind === 'bench') {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 9, y - 1, 19, 3);
    ctx.fillStyle = '#6a4420'; ctx.fillRect(x - 8, y - 5, 2, 5); ctx.fillRect(x + 6, y - 5, 2, 5);
    ctx.fillStyle = '#a8743a'; ctx.fillRect(x - 9, y - 7, 18, 3); ctx.fillStyle = '#8a5a2c'; ctx.fillRect(x - 9, y - 11, 18, 2);
  } else if (p.kind === 'flowerbed') {
    const x = Math.round(p.x), y = Math.round(p.y), cols = ['#ff6a8a', '#ffd84a', '#ffffff', '#b890f0', '#ff9a4a'];
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x - 9, y - 1, 19, 3);
    ctx.fillStyle = '#9a9aa8'; ctx.fillRect(x - 9, y - 7, 18, 7); ctx.fillStyle = '#5a3c20'; ctx.fillRect(x - 8, y - 6, 16, 5);
    for (let k = 0; k < 7; k++) { const fx = x - 7 + k * 2.4, sw = Math.sin(time * 2 + k + p.v) * 0.6; ctx.fillStyle = '#3f8a3a'; ctx.fillRect(fx, y - 8 + sw * 0.3, 1, 3); ctx.fillStyle = cols[(k + p.v) % 5]; ctx.fillRect(fx - 0.5 + sw, y - 10, 2, 2); }
  } else if (p.kind === 'banner') {
    const x = Math.round(p.x), y = Math.round(p.y), c = p.v ? '#c23a2a' : '#2a6aa8';
    ctx.fillStyle = '#3a2410'; ctx.fillRect(x - 1, y - 28, 2, 28); ctx.fillRect(x - 1, y - 30, 12, 2);
    for (let k = 0; k < 14; k++) { ctx.fillStyle = k % 5 === 0 ? '#ffd84a' : c; ctx.fillRect(x + 1 + Math.sin(time * 3 + k * 0.4) * 1.2, y - 28 + k, 8, 1); }
  } else if (p.kind === 'sign') {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 24, y - 1, 48, 3);
    ctx.fillStyle = '#4a2a10'; ctx.fillRect(x - 20, y - 18, 3, 18); ctx.fillRect(x + 17, y - 18, 3, 18);
    ctx.fillStyle = '#a8743a'; ctx.fillRect(x - 24, y - 30, 48, 14); ctx.fillStyle = '#c8945a'; ctx.fillRect(x - 24, y - 30, 48, 2);
    ctx.fillStyle = '#3a2410'; ctx.font = 'bold 6px "Pixelify Sans", "Mitr", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('เกาะสุโขทัย', x, y - 24); ctx.fillText('ยินดีต้อนรับ', x, y - 18);
  } else if (p.kind === 'pier') {
    const x = Math.round(p.x), y = Math.round(p.y), len = 6 * TS;
    ctx.fillStyle = 'rgba(0,30,70,.28)'; ctx.fillRect(x + 4, y + 8, 3 * TS, len);
    ctx.fillStyle = '#9a6a34'; ctx.fillRect(x, y, 3 * TS, len);
    ctx.fillStyle = '#6a4420'; for (let k = 0; k < len; k += 6) ctx.fillRect(x, y + k, 3 * TS, 1);
    ctx.fillStyle = '#7a4e24'; ctx.fillRect(x, y, 2, len); ctx.fillRect(x + 3 * TS - 2, y, 2, len);
    ctx.fillStyle = '#3a2410'; for (let k = 6; k < len; k += 24) { ctx.fillRect(x - 2, y + k, 4, 5); ctx.fillRect(x + 3 * TS - 2, y + k, 4, 5); }
    ctx.fillStyle = '#c8a050'; ctx.fillRect(x + 3 * TS - 3, y + len - 6, 5, 5);
  } else if (p.kind === 'crate') {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 5, y - 1, 12, 3);
    ctx.fillStyle = p.v ? '#8a5a2c' : '#9a6a34'; ctx.fillRect(x - 5, y - 9, 10, 9); ctx.fillStyle = '#6a4420'; ctx.fillRect(x - 5, y - 9, 10, 1); ctx.fillRect(x - 5, y - 1, 10, 1); ctx.fillRect(x - 1, y - 9, 2, 9);
  } else {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 8, y - 1, 16, 3);
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(x - 4, y - 5, 8, 5); ctx.fillStyle = '#5a5a66'; ctx.fillRect(x - 7, y - 9, 14, 4); ctx.fillRect(x + 6, y - 8, 4, 2);
    const fl = 120 + Math.sin(time * 12) * 40;
    ctx.fillStyle = `rgba(255,${fl | 0},40,.95)`; ctx.fillRect(x + 11, y - 7, 4, 6); ctx.fillStyle = '#ffd84a'; ctx.fillRect(x + 12, y - 5, 2, 3);
  }
}

function drawShip(x: number, y: number, face: number, t: number, o: { sails: boolean; rider: boolean; vx?: number; scale?: number }) {
  const sc = o.scale ?? 1, roll = Math.sin(t * 1.7) * 0.025 + (o.vx ?? 0) * 0.0004;
  ctx.save(); ctx.translate(Math.round(x), Math.round(y + Math.sin(t * 2.4) * 0.9)); ctx.scale(face * sc, sc); ctx.rotate(roll);
  const R = (px: number, py: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
  // water contact
  ctx.fillStyle = 'rgba(0,40,90,.28)'; ctx.beginPath(); ctx.ellipse(0, 5, 27, 5, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(1, 3.5, 25, 3.6, 0, 0, 6.3); ctx.fill();
  // hull (planked rows, bow to the right)
  const rows: [number, number, number][] = [[-7, -19, 43], [-6, -20, 46], [-5, -20, 48], [-4, -19, 48], [-3, -18, 46], [-2, -17, 43], [-1, -15, 39], [0, -13, 34], [1, -10, 28]];
  rows.forEach(([ry, rx, rw], k) => R(rx, ry, rw, 1, k < 2 ? '#b07a40' : k % 2 ? '#7a4a22' : '#8a5a2c'));
  R(-18, -5, 44, 1, '#4a2a10'); R(-14, -1, 36, 1, '#4a2a10'); R(-9, 1, 24, 1, '#3a2010');
  R(-19, -9, 43, 2, '#c08a4c'); for (let p = -17; p < 23; p += 7) R(p, -11, 2, 3, '#8a5a2c');
  R(24, -8, 3, 2, '#c08a4c'); R(27, -9, 8, 1.5, '#7a4a22'); R(33, -11, 3, 3, '#ffd84a'); R(35, -10, 2, 1.5, '#e0b030');
  R(-4, -4, 3, 2, '#1c1008'); R(7, -4, 3, 2, '#1c1008'); R(16, -4, 3, 2, '#1c1008');
  R(-20, -6, 2, 5, '#6a3a18');
  // stern cabin
  R(-18, -17, 13, 8, '#8a5a2c'); R(-18, -17, 13, 1, '#a8743a'); R(-19, -19, 15, 3, '#5a3818'); R(-15, -15, 4, 3, '#ffe9a0'); R(-9, -15, 3, 3, '#ffe9a0');
  // rider: the player's own hero standing at the helm
  if (o.rider) {
    const spr = heroFrame('side', 0, armorTier(), save.look, false);
    ctx.save(); ctx.translate(-1, -9 + Math.sin(t * 2.6) * 0.4); ctx.rotate(-roll); ctx.drawImage(spr, -10, -23); ctx.restore();
    R(-3, -10, 6, 2, '#4a2a10');
  }
  // masts, sails, rigging
  R(3, -40, 3, 31, '#4a2a10'); R(-1, -42, 11, 3, '#6a3a18'); R(-8, -26, 20, 2, '#5a3412');
  const bill = Math.sin(t * 1.9) * 1.2;
  if (o.sails) {
    ctx.fillStyle = '#f6efdc'; ctx.beginPath(); ctx.moveTo(6, -39); ctx.quadraticCurveTo(26 + bill, -30, 27 + bill * 0.6, -13); ctx.lineTo(6, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,130,90,.35)'; ctx.beginPath(); ctx.moveTo(16, -34); ctx.quadraticCurveTo(26 + bill, -28, 27 + bill * 0.6, -13); ctx.lineTo(16, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d4c8a8'; for (let k = 0; k < 4; k++) ctx.fillRect(7, -34 + k * 6, 20, 0.8);
    ctx.fillStyle = '#c23a2a'; ctx.beginPath(); ctx.arc(15, -24, 4, 0, 6.3); ctx.fill(); ctx.fillStyle = '#f6efdc'; ctx.fillRect(13, -25, 4, 1.5); ctx.fillRect(14.5, -27, 1.5, 5);
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(-7, -26 + bill * 0.4); ctx.lineTo(-7, -12); ctx.lineTo(8, -12); ctx.closePath(); ctx.fill();
  } else { R(-8, -26, 20, 4, '#e8dcc0'); }
  ctx.strokeStyle = 'rgba(40,24,10,.75)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(4, -41); ctx.lineTo(34, -10); ctx.moveTo(4, -41); ctx.lineTo(-19, -10); ctx.moveTo(4, -41); ctx.lineTo(24, -9); ctx.stroke();
  // flag
  R(4, -48, 1, 7, '#3a2410'); ctx.fillStyle = '#d8402c';
  for (let k = 0; k < 7; k++) ctx.fillRect(5 + k, -48 + Math.sin(t * 6 + k * 0.7) * 0.9, 1, 4 - k * 0.3);
  ctx.restore();
}

function drawSea() {
  const ZS = Math.max(2, Z - 1), s = sea!, vw = W / ZS, vh = H / ZS, mw = SEA_W * TS, mh = SEA_H * TS;
  const tx = clamp(ship.x - vw / 2, 0, mw - vw), ty = clamp(ship.y - vh / 2, 0, mh - vh);
  cam.x += (tx - cam.x) * 0.1; cam.y += (ty - cam.y) * 0.1;
  const camX = cam.x, camY = cam.y;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#2a7ccc'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(ZS, 0, 0, ZS, -Math.round(camX * ZS), -Math.round(camY * ZS));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, 0, 0, mw, mh);
  // wave glints on open water
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  const x0 = Math.max(0, Math.floor(camX / TS)), x1 = Math.min(SEA_W - 1, Math.ceil((camX + vw) / TS)), y0 = Math.max(0, Math.floor(camY / TS)), y1 = Math.min(SEA_H - 1, Math.ceil((camY + vh) / TS));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    if ((xx * 11 + yy * 17) % 5 !== 0) continue;
    if (s.land[Math.floor((yy * TS + 8) / SC) * s.gw + Math.floor((xx * TS + 8) / SC)]) continue;
    const o = (time * 7 + xx * 3 + yy * 2) % 16; ctx.fillRect(xx * TS + o - 3, yy * TS + 5 + (xx % 5), 5, 1);
  }
  // piers + huts
  for (const isl of s.islands) {
    if (isl.dock.x < camX - 90 || isl.dock.x > camX + vw + 90 || isl.dock.y < camY - 90 || isl.dock.y > camY + vh + 90) continue;
    ctx.save(); ctx.translate(isl.dock.x, isl.dock.y); ctx.rotate(isl.ang + Math.PI);
    ctx.fillStyle = '#7a4e24'; ctx.fillRect(0, -4, 36, 8);
    ctx.fillStyle = '#5a3818'; for (let p = 4; p < 36; p += 6) ctx.fillRect(p, -4, 1, 8);
    ctx.fillStyle = '#3a2410'; ctx.fillRect(-1, -5, 3, 3); ctx.fillRect(-1, 2, 3, 3); ctx.fillRect(34, -5, 3, 3); ctx.fillRect(34, 2, 3, 3);
    ctx.restore();
    const hx = Math.round(isl.hut.x), hy = Math.round(isl.hut.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(hx - 10, hy, 22, 3);
    ctx.fillStyle = '#d8c89c'; ctx.fillRect(hx - 9, hy - 10, 18, 10); ctx.fillStyle = '#b8a678'; ctx.fillRect(hx - 9, hy - 3, 18, 3);
    ctx.fillStyle = '#a8412c'; ctx.fillRect(hx - 11, hy - 14, 22, 5); ctx.fillRect(hx - 8, hy - 17, 16, 3);
    ctx.fillStyle = '#5a3818'; ctx.fillRect(hx - 2, hy - 7, 4, 7); ctx.fillStyle = '#ffe27a'; ctx.fillRect(hx + 4, hy - 8, 3, 3);
  }
  // trees and rocks (sorted by y)
  for (const t of s.trees) {
    if (t.x < camX - 24 || t.x > camX + vw + 24 || t.y < camY - 10 || t.y > camY + vh + 40) continue;
    ctx.drawImage(t.spr, Math.round(t.x - t.spr.width / 2 + Math.sin(time * 1.5 + t.x * 0.05) * 0.4), Math.round(t.y - t.spr.height));
  }
  // island labels
  ctx.textAlign = 'center'; ctx.font = 'bold 7px "Pixelify Sans", "Mitr", sans-serif';
  s.islands.forEach((isl, i) => {
    const st = getStage(isl.id), lock = save.level < st.rec, lx = isl.cx * TS, ly = (isl.cy - shoreR(isl, -Math.PI / 2) - 2.2) * TS;
    if (lx < camX - 80 || lx > camX + vw + 80 || ly < camY - 24 || ly > camY + vh + 24) return;
    const label = `${i + 1}. ${st.name}`, wlab = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(lx - wlab / 2, ly - 8, wlab, 10);
    ctx.fillStyle = lock ? '#ff9a8a' : '#fff6c0'; ctx.fillText(label, lx, ly);
    ctx.font = '6px "Pixelify Sans", "Mitr", sans-serif'; ctx.fillStyle = lock ? '#ffb0a0' : '#9affb0';
    ctx.fillText(i === 0 ? 'บ้านเกิด' : lock ? `LV ${st.rec}` : save.quests[`visit-${isl.id}`] ? 'เปิดแล้ว' : 'ใหม่!', lx, ly + 8);
    ctx.font = 'bold 7px "Pixelify Sans", "Mitr", sans-serif';
  });
  // dock pulse on the target
  const tg = navTarget();
  ctx.strokeStyle = 'rgba(255,230,120,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tg.dock.x, tg.dock.y, 10 + Math.sin(time * 4) * 2.5, 0, 6.3); ctx.stroke();
  // GPS route line
  if (gpsOn && navPts.length > 1) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); navPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(0,50,110,.5)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.6; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -time * 22; ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#fff6c0';
    let acc = 0;
    for (let i = 1; i < navPts.length; i++) {
      const p0 = navPts[i - 1], p1 = navPts[i], sl = Math.hypot(p1.x - p0.x, p1.y - p0.y); acc += sl;
      if (acc > 90) { acc = 0; const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x); ctx.save(); ctx.translate(p1.x, p1.y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
    ctx.restore();
  }
  // wake + ship
  for (const p of ship.wake) { ctx.globalAlpha = Math.max(0, p.t); ctx.fillStyle = '#e8f8ff'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 1); }
  ctx.globalAlpha = 1;
  drawShip(ship.x, ship.y, ship.face, time, { sails: true, rider: true, vx: ship.vx });
  drawTag(ship.x, ship.y - 54, save.name || 'ฉัน', save.level, true);
  // drifting cloud shadows
  ctx.fillStyle = 'rgba(14,60,130,.1)';
  for (const c of clouds) {
    c.x += c.sp * 0.016; if (c.x > mw + 150) c.x = -150;
    if (c.x < camX - c.r * 2 || c.x > camX + vw + c.r * 2 || c.y < camY - c.r || c.y > camY + vh + c.r) continue;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, c.r, c.r * 0.5, 0, 0, 6.3); ctx.ellipse(c.x + c.r * 0.5, c.y - c.r * 0.12, c.r * 0.7, c.r * 0.36, 0, 0, 6.3); ctx.ellipse(c.x - c.r * 0.55, c.y + c.r * 0.1, c.r * 0.6, c.r * 0.3, 0, 0, 6.3); ctx.fill();
  }
  // light grading + vignette
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#f6f9ff'; ctx.fillRect(0, 0, W, H); ctx.restore();
  if (vignette) { ctx.globalAlpha = 0.32; ctx.drawImage(vignette, 0, 0, W, H); ctx.globalAlpha = 1; }
  // navigation arrow when the target is off screen
  const sx = (tg.dock.x - camX) * ZS, sy = (tg.dock.y - camY) * ZS, mg = 44 * DPR;
  if (gpsOn && (sx < mg || sx > W - mg || sy < mg || sy > H - mg)) {
    const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - mg) / Math.max(1, Math.abs(dx)), (H / 2 - mg) / Math.max(1, Math.abs(dy)));
    const ax = cx + dx * k, ay = cy + dy * k, a = Math.atan2(dy, dx), st = getStage(tg.id);
    ctx.save(); ctx.translate(ax, ay);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(0, 0, 17 * DPR, 0, 6.3); ctx.fill();
    ctx.rotate(a); ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(13 * DPR, 0); ctx.lineTo(-7 * DPR, -9 * DPR); ctx.lineTo(-3 * DPR, 0); ctx.lineTo(-7 * DPR, 9 * DPR); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.font = `${Math.round(11 * DPR)}px "Mitr", sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    const label = `${st.name} • ${Math.round(dist(ship.x, ship.y, tg.dock.x, tg.dock.y) / TS)}`;
    const ly = ay + (ay < H / 2 ? 30 : -24) * DPR; ctx.strokeText(label, ax, ly); ctx.fillText(label, ax, ly);
  }
  // minimap
  const mc = mmEl.getContext('2d')!;
  mc.drawImage(s.mini, 0, 0);
  if (gpsOn && navPts.length > 1) { mc.strokeStyle = '#ffe27a'; mc.lineWidth = 1.6; mc.beginPath(); navPts.forEach((p, i) => i ? mc.lineTo(p.x / TS, p.y / TS) : mc.moveTo(p.x / TS, p.y / TS)); mc.stroke(); }
  mc.fillStyle = '#ffd84a'; mc.fillRect(Math.floor(tg.dock.x / TS) - 3, Math.floor(tg.dock.y / TS) - 3, 7, 7);
  mc.fillStyle = '#fff'; mc.fillRect(Math.floor(ship.x / TS) - 3, Math.floor(ship.y / TS) - 3, 6, 6);
  mc.strokeStyle = 'rgba(255,255,255,.7)'; mc.lineWidth = 1.5; mc.strokeRect(Math.floor(camX / TS), Math.floor(camY / TS), Math.floor(vw / TS), Math.floor(vh / TS));
}

function openSeaChart() {
  const s = sea!;
  const rows = s.islands.map((isl, i) => {
    const st = getStage(isl.id), lock = save.level < st.rec, on = navTarget().id === isl.id;
    return `<button class="sc-row ${lock ? 'lock' : ''} ${on ? 'on' : ''}" data-id="${isl.id}"><b>${i + 1}</b><span>${esc(st.name)}</span><i>${lock ? 'LV ' + st.rec : save.quests[`visit-${isl.id}`] ? 'เปิดแล้ว' : 'ใหม่'}</i></button>`;
  }).join('');
  const p = panel(`<h2>แผนที่ทะเล โลก 1</h2><div class="sub">แตะเกาะเพื่อตั้งเป็นเป้าหมายนำทาง</div><canvas id="sc" class="wm"></canvas><div class="sc-list">${rows}</div><div class="row"><button class="btn alt" id="sc-close">ปิด</button></div>`);
  const cv = p.el.querySelector('#sc') as HTMLCanvasElement; cv.width = SEA_W; cv.height = SEA_H;
  const c = cv.getContext('2d')!; c.drawImage(s.mini, 0, 0);
  const tg = navTarget();
  s.islands.forEach((isl, i) => { c.fillStyle = save.level >= getStage(isl.id).rec ? '#fff' : '#ff8a7a'; c.fillRect(isl.cx - 3, isl.cy - 3, 6, 6); c.font = 'bold 13px sans-serif'; c.fillStyle = '#000'; c.fillText(String(i + 1), isl.cx + 6, isl.cy - 5); });
  c.strokeStyle = '#ffd84a'; c.lineWidth = 2; c.strokeRect(tg.cx - 9, tg.cy - 9, 18, 18);
  c.fillStyle = '#ffe14a'; c.fillRect(Math.floor(ship.x / TS) - 4, Math.floor(ship.y / TS) - 4, 8, 8);
  p.el.querySelectorAll<HTMLButtonElement>('.sc-row').forEach(b => { b.onclick = () => { save.nav = +b.dataset.id! + 1; writeSave(save); sfx('click'); toast(`ตั้งเป้าหมายนำทาง: ${getStage(save.nav - 1).name}`); p.close(); }; });
  (p.el.querySelector('#sc-close') as HTMLElement).onclick = () => { sfx('click'); p.close(); };
}

// ================================================================== other players + chat (Realtime Database)
interface Remote { uid: string; n: string; l: number; x: number; y: number; tx: number; ty: number; d: number; f: number; m: number; k: number[]; a: number; w: number; anim: number; bubble: string; bubbleT: number; ct: number; q: number; swingT: number; swingA: number; }
const remotes = new Map<string, Remote>();
let roomId = '', leaveRoom: (() => void) | null = null, sendT = 0, lastPres: Presence | null = null, lastChatAt = 0, actSeq = 0;
let myBubble = { text: '', t: 0 };
const lookOf = (k: number[]): Look => ({ skin: k[0] ?? 0, hair: k[1] ?? 0, helmet: k[2] ?? 0, plume: k[3] ?? 0, trim: k[4] ?? 0, cape: k[5] ?? 0, boots: k[6] ?? 0 });
function presenceNow(): Presence {
  const L = save.look, c = Math.cos(P.fa), sn = Math.sin(P.fa);
  return { n: save.name, l: save.level, x: Math.round(P.x), y: Math.round(P.y), d: Math.abs(c) >= Math.abs(sn) * 0.9 ? 0 : sn > 0 ? 1 : 2, f: c < 0 ? -1 : 1, m: P.moving ? 1 : 0, k: [L.skin, L.hair, L.helmet, L.plume, L.trim, L.cape, L.boots], a: armorTier(), w: weaponIdx() };
}
function leaveIslandRoom() { if (leaveRoom) { leaveRoom(); leaveRoom = null; } remotes.clear(); roomId = ''; lastPres = null; }
function joinIslandRoom() {
  leaveIslandRoom();
  if (!uid || !rtConfigured || !save.name) return;
  roomId = 'i' + stage.id; lastPres = presenceNow();
  const mk = (id: string, p: Presence): Remote => ({ uid: id, n: String(p.n ?? '?').slice(0, 14), l: p.l ?? 1, x: p.x, y: p.y, tx: p.x, ty: p.y, d: p.d ?? 1, f: p.f ?? 1, m: p.m ?? 0, k: p.k ?? [], a: p.a ?? 0, w: p.w ?? 0, anim: 0, bubble: '', bubbleT: 0, ct: p.ct ?? 0, q: p.q ?? 0, swingT: 0, swingA: 0 });
  leaveRoom = joinRoom(roomId, uid, presenceNow(), {
    add: (id, p) => { const r = mk(id, p); if (p.c && p.ct && Date.now() - p.ct < 8000) { r.bubble = String(p.c).slice(0, 80); r.bubbleT = 5; } remotes.set(id, r); },
    change: (id, p) => {
      const r = remotes.get(id); if (!r) { remotes.set(id, mk(id, p)); return; }
      r.n = String(p.n ?? r.n).slice(0, 14); r.l = p.l ?? r.l; r.tx = p.x; r.ty = p.y; r.d = p.d ?? r.d; r.f = p.f ?? r.f; r.k = p.k ?? r.k; r.a = p.a ?? r.a; r.w = p.w ?? r.w;
      if (p.c && p.ct && p.ct !== r.ct) { r.ct = p.ct; r.bubble = String(p.c).slice(0, 80); r.bubbleT = 6; addChatLine(r.n, r.bubble); }
      if (p.q && p.q !== r.q) { r.q = p.q; remoteAction(r, p.qk ?? 0, (p.qa ?? 0) / 100); }
    },
    remove: id => { remotes.delete(id); },
  });
}
function updateMultiplayer(dt: number) {
  for (const r of remotes.values()) {
    const k = Math.min(1, dt * 12), mv = Math.hypot(r.tx - r.x, r.ty - r.y);
    r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.m = mv > 1.2 ? 1 : 0;
    r.anim += dt; r.bubbleT = Math.max(0, r.bubbleT - dt); r.swingT = Math.max(0, r.swingT - dt);
  }
  myBubble.t = Math.max(0, myBubble.t - dt);
  sendT -= dt;
  if (leaveRoom && sendT <= 0) {
    sendT = 0.125; const p = presenceNow(), patch: Record<string, unknown> = {};
    for (const key of Object.keys(p) as (keyof Presence)[]) {
      if (key === 'k') { if (!lastPres || p.k.join() !== lastPres.k.join()) patch.k = p.k; }
      else if (!lastPres || p[key] !== lastPres[key]) patch[key] = p[key];
    }
    lastPres = p;
    if (Object.keys(patch).length) patchPresence(roomId, uid, patch as Partial<Presence>);
  }
}
// tell the room about a swing (0) or a skill (1-3) so everyone sees the same moves
function sendAction(kind: number, ang: number) {
  if (!leaveRoom) return;
  actSeq = (Math.floor(Date.now() / 5) % 2000000000) + 1;
  patchPresence(roomId, uid, { q: actSeq, qk: kind, qa: Math.round(ang * 100) });
}
// visual-only replay of someone else's attack
function remoteAction(r: Remote, kind: number, ang: number) {
  const wp = WEAPONS[clamp(r.w, 0, WEAPONS.length - 1)], c = Math.cos(ang), sn = Math.sin(ang);
  r.swingT = 0.22; r.swingA = ang; r.d = Math.abs(c) >= Math.abs(sn) * 0.9 ? 0 : sn > 0 ? 1 : 2; r.f = c < 0 ? -1 : 1;
  if (dist(r.x, r.y, P.x, P.y) < 180) sfx(kind === 2 ? 'crit' : 'swing');
  if (kind === 0) slashes.push({ x: r.x, y: r.y - 9, a: ang, dir: Math.random() < 0.5 ? 1 : -1, spread: 1.25, R: 28, t: 0, dur: 0.22, c: wp.color, glow: wp.glow, pow: false });
  else if (kind === 1) {
    slashes.push({ x: r.x, y: r.y - 9, a: ang, dir: 1, spread: 1.0, R: 30, t: 0, dur: 0.2, c: wp.color, glow: wp.glow, pow: false });
    for (let i = 0; i < 12; i++) parts.push({ x: r.x + c * 12, y: r.y - 12 + sn * 12, vx: c * rand(150, 230) + rand(-15, 15), vy: sn * rand(150, 230) + rand(-15, 15), life: 0.5, max: 0.5, c: i % 2 ? wp.color : wp.glow, s: 1.4, g: 0, add: true });
  } else if (kind === 2) {
    ring(r.x, r.y - 4, 64, wp.glow, 0.4, 4); ring(r.x, r.y - 4, 40, wp.color, 0.3, 3); burst(r.x, r.y - 8, [wp.color, wp.glow, '#fff'], 24, 110, 10);
    slashes.push({ x: r.x, y: r.y - 9, a: 0, dir: 1, spread: Math.PI, R: 54, t: 0, dur: 0.3, c: wp.color, glow: wp.glow, pow: true }, { x: r.x, y: r.y - 9, a: Math.PI, dir: 1, spread: Math.PI, R: 54, t: 0, dur: 0.3, c: wp.color, glow: wp.glow, pow: true });
  } else {
    slashes.push({ x: r.x, y: r.y - 9, a: ang, dir: 1, spread: 1.1, R: 34, t: 0, dur: 0.24, c: wp.color, glow: wp.glow, pow: true });
    burst(r.x, r.y - 8, [wp.glow, '#fff'], 14, 90, 6);
  }
}
function pillPath(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
// small capsule: [name | Lv.N]
function drawTag(x: number, y: number, name: string, lv: number, me: boolean) {
  ctx.save(); ctx.textAlign = 'center';
  ctx.font = 'bold 3.4px "Mitr", "Pixelify Sans", sans-serif';
  const lt = 'Lv.' + lv, wl = ctx.measureText(lt).width + 5;
  ctx.font = '3.6px "Mitr", "Pixelify Sans", sans-serif';
  const wn = ctx.measureText(name).width + 6, w = wn + wl, h = 6.4, x0 = Math.round(x - w / 2), y0 = Math.round(y - 6);
  ctx.fillStyle = 'rgba(0,0,0,.28)'; pillPath(x0 + 0.4, y0 + 0.8, w, h, 3.2); ctx.fill();
  ctx.fillStyle = 'rgba(14,18,30,.72)'; pillPath(x0, y0, w, h, 3.2); ctx.fill();
  ctx.strokeStyle = me ? 'rgba(140,210,255,.75)' : 'rgba(255,230,160,.45)'; ctx.lineWidth = 0.45; ctx.stroke();
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  if (me) { g.addColorStop(0, '#9adcff'); g.addColorStop(1, '#3a86c8'); } else { g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#c8901c'); }
  ctx.save(); pillPath(x0, y0, w, h, 3.2); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x0 + wn, y0, wl, h); ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(name, x0 + wn / 2 + 0.3, y0 + 4.8);
  ctx.fillStyle = me ? '#cfeaff' : '#fff'; ctx.fillText(name, x0 + wn / 2, y0 + 4.5);
  ctx.font = 'bold 3.4px "Mitr", "Pixelify Sans", sans-serif'; ctx.fillStyle = '#1a1410'; ctx.fillText(lt, x0 + wn + wl / 2, y0 + 4.4);
  ctx.restore();
}
function npcRole(nd: { quest?: boolean; craft?: boolean; harbor?: boolean; role?: string }) {
  if (nd.role) return nd.role;
  return nd.quest ? 'รับภารกิจ' : nd.craft ? 'ร้านช่างตีดาบ' : nd.harbor ? 'ท่าเรือ • เรียกเรือ' : 'เล่าเรื่อง';
}
// role chip (coloured) with a tiny name under it
function drawNpcTag(x: number, y: number, name: string, role: string, col: string) {
  ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold 3.6px "Mitr", "Pixelify Sans", sans-serif';
  const w = ctx.measureText(role).width + 6, h = 6.2, x0 = Math.round(x - w / 2), y0 = Math.round(y - 11);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; pillPath(x0 + 0.4, y0 + 0.8, w, h, 3.1); ctx.fill();
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, col); g.addColorStop(1, col + 'bb');
  ctx.fillStyle = g; pillPath(x0, y0, w, h, 3.1); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.4; ctx.stroke();
  ctx.fillStyle = '#16100a'; ctx.fillText(role, Math.round(x), y0 + 4.3);
  ctx.font = '3.2px "Mitr", "Pixelify Sans", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillText(name, Math.round(x) + 0.3, y0 + h + 3.7); ctx.fillStyle = '#f4ecd4'; ctx.fillText(name, Math.round(x), y0 + h + 3.4);
  ctx.restore();
}
function drawBubble(x: number, y: number, text: string, a: number) {
  const lines: string[] = []; for (let i = 0; i < text.length; i += 16) lines.push(text.slice(i, i + 16));
  ctx.save(); ctx.globalAlpha = Math.min(1, a * 2); ctx.font = '4.4px "Mitr", "Pixelify Sans", sans-serif'; ctx.textAlign = 'center';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 7, h = lines.length * 6 + 4, bx = Math.round(x - w / 2), by = Math.round(y - h);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; pillPath(bx + 0.5, by + 0.8, w, h, 2.4); ctx.fill();
  ctx.fillStyle = '#fffdf4'; pillPath(bx, by, w, h, 2.4); ctx.fill(); ctx.strokeStyle = '#2a1f17'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = '#fffdf4'; ctx.beginPath(); ctx.moveTo(Math.round(x) - 1.6, by + h - 0.2); ctx.lineTo(Math.round(x) + 1.6, by + h - 0.2); ctx.lineTo(Math.round(x), by + h + 2.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a1f17'; lines.forEach((l, i) => ctx.fillText(l, Math.round(x), by + 5.4 + i * 6)); ctx.restore();
}
function drawRemote(r: Remote) {
  const dir = (['side', 'down', 'up'] as Dir[])[r.d] ?? 'down', fr = r.m ? [0, 1, 0, 2][Math.floor(r.anim * 10) % 4] : 0;
  const spr = heroFrame(dir, fr, r.a, lookOf(r.k), false), bob = r.m ? Math.abs(Math.sin(r.anim * 10)) : Math.sin(r.anim * 3) * 0.3;
  drawShadow(ctx, r.x, r.y, 5.5, 2.2);
  ctx.save(); ctx.translate(r.x, r.y - bob); ctx.scale(dir === 'side' ? r.f : 1, 1); ctx.drawImage(spr, -spr.width / 2, -spr.height + 1); ctx.restore();
  const wp = WEAPONS[clamp(r.w, 0, WEAPONS.length - 1)], sw = r.swingT > 0, kk = sw ? 1 - r.swingT / 0.22 : 0;
  const idle = dir === 'side' ? (r.f > 0 ? -1.15 : Math.PI + 1.15) : dir === 'down' ? 1.9 : -2.2;
  ctx.save(); ctx.translate(r.x + (dir === 'side' ? 4 * r.f : dir === 'down' ? 6 : -6), r.y - 11 - bob);
  ctx.rotate(sw ? r.swingA - 1.2 + 2.4 * kk : idle);
  const len = (10 + r.w * 0.8) * (sw ? 1.25 : 1);
  if (sw) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = wp.glow; ctx.globalAlpha = 0.55; ctx.fillRect(1, -2.2, len, 4.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = wp.color; ctx.fillRect(1, -1, len, 2); ctx.fillStyle = '#7a5a2a'; ctx.fillRect(-1, -1.5, 3, 3); ctx.restore();
  drawTag(r.x, r.y - 24 - bob, r.n, r.l, false);
  if (r.bubbleT > 0 && r.bubble) drawBubble(r.x, r.y - 31 - bob, r.bubble, r.bubbleT);
}

// chat bar + log
const chatBar = $('chatbar'), chatIn = $('chat-in') as HTMLInputElement;
function openChat() { if (scene !== 'map' || panelOpen()) return; chatBar.classList.remove('hidden'); setTimeout(() => chatIn.focus(), 30); }
function closeChat() { chatBar.classList.add('hidden'); chatIn.blur(); chatIn.value = ''; }
function addChatLine(name: string, text: string) {
  const log = $('chatlog'), d = document.createElement('div'), b = document.createElement('b');
  d.className = 'cl'; b.textContent = name + ': '; d.appendChild(b); d.appendChild(document.createTextNode(text)); log.appendChild(d);
  while (log.childElementCount > 6) log.firstElementChild!.remove();
  setTimeout(() => d.classList.add('old'), 9000); setTimeout(() => d.remove(), 10800);
}
function sendChat() {
  const text = chatIn.value.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!text) { closeChat(); return; }
  if (Date.now() - lastChatAt < 1200) { toast('พิมพ์เร็วเกินไป รอสักครู่'); return; }
  lastChatAt = Date.now(); myBubble = { text, t: 6 }; addChatLine(save.name || 'ฉัน', text);
  if (leaveRoom) patchPresence(roomId, uid, { c: text, ct: lastChatAt });
  sfx('click'); closeChat();
}
$('chat-send').addEventListener('click', sendChat);
chatIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } else if (e.key === 'Escape') closeChat(); });
$('btn-chat').addEventListener('click', () => { unlockAudio(); sfx('click'); if (chatBar.classList.contains('hidden')) openChat(); else closeChat(); });

// ================================================================== main loop
let last = performance.now();
function frame(now: number) {
  if (IN_APP) { requestAnimationFrame(frame); return; }
  let dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (scene === 'map' && map) {
    if (!panelOpen() && !isPortraitTouch()) {
      if (freeze > 0) { freeze -= dt; dt = 0; }
      else if (slowmo > 0) { slowmo -= dt; dt *= 0.3; }
      if (dt > 0) updateWorld(dt);
    } else { flags.act = flags.atk = flags.dodge = flags.s1 = flags.s2 = flags.s3 = false; }
    updateFx(panelOpen() ? 0 : dt);
    drawWorld();
  } else if (scene === 'sea' && sea) {
    if (!panelOpen() && !isPortraitTouch()) updateSea(dt); else { flags.act = flags.dodge = false; }
    drawSea();
  } else { flags.act = flags.atk = flags.dodge = flags.skill = false; drawTitleBg(); }
  requestAnimationFrame(frame);
}

// ================================================================== account (Google sign-in only) + cloud save
let uid = '', syncT = 0;
function flushCloud() {
  clearTimeout(syncT);
  if (!uid || !save.name) return;
  void pushProfile(uid, { name: save.name, save }).catch(() => { /* retried on next save */ });
}
saveHooks.onSave = () => { if (!uid) return; clearTimeout(syncT); syncT = window.setTimeout(flushCloud, 1500); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCloud(); });
addEventListener('pagehide', flushCloud);

function hideAllForLogin() {
  leaveIslandRoom(); closeChat(); $('chatlog').classList.add('hidden');
  closeAllPanels(); scene = 'title'; inStage = false; setMusic('off');
  for (const id of ['hud', 'touch', 'bossbar', 'side-btns', 'lobby', 'objective']) $(id).classList.add('hidden');
  mmEl.classList.add('hidden');
}
function showLogin(msg = '') {
  hideAllForLogin();
  const el = $('login');
  el.innerHTML = `<div class="lg-box"><div class="lb-title lg-title">THE FIGHT<br>KING</div><div class="lg-sub">ล็อกอินเพื่อบันทึกความคืบหน้าและเล่นต่อจากทุกอุปกรณ์</div>` +
    `<button class="lg-google" id="lg-go"><svg viewBox="0 0 48 48" width="22" height="22"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.8-2.1 15.7-5.7l-7.6-5.9c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg><span>ล็อกอินด้วย Google</span></button>` +
    `<div class="lg-msg" id="lg-msg">${esc(msg)}</div></div>`;
  el.classList.remove('hidden');
  const go = $('lg-go') as HTMLButtonElement;
  if (!fbConfigured) { $('lg-msg').textContent = 'ยังไม่ได้ตั้งค่า Firebase (ดู .env.example)'; go.disabled = true; return; }
  go.onclick = async () => {
    unlockAudio(); sfx('click'); go.disabled = true; $('lg-msg').textContent = 'กำลังเปิดหน้าล็อกอิน Google...';
    try { await googleSignIn(); }
    catch (e) {
      const c = (e as { code?: string }).code ?? '';
      $('lg-msg').textContent = c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' ? 'ยกเลิกการล็อกอิน' : 'ล็อกอินไม่สำเร็จ ลองใหม่อีกครั้ง';
      go.disabled = false;
    }
  };
}
function showCreate() {
  hideAllForLogin(); $('login').classList.add('hidden');
  const p = panel(`<h2>ตั้งชื่ออัศวิน</h2><div class="sub">ยินดีต้อนรับ! ตั้งชื่อตัวละครของคุณ แล้วไปแต่งตัวต่อ</div>` +
    `<input id="nm" class="nm-in" maxlength="14" placeholder="ชื่อตัวละคร (2-14 ตัวอักษร)" autocomplete="off" /><div class="nm-err" id="nm-err"></div>` +
    `<button class="btn gold" id="nm-ok">ต่อไป: แต่งตัวละคร</button><button class="btn alt" id="nm-out">ออกจากระบบ</button>`);
  p.onX = () => {};
  const inp = p.el.querySelector('#nm') as HTMLInputElement, err = p.el.querySelector('#nm-err') as HTMLElement;
  inp.value = save.name; setTimeout(() => inp.focus(), 50);
  const ok = () => {
    const name = inp.value.replace(/\s+/g, ' ').trim();
    if (name.length < 2) { err.textContent = 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร'; sfx('wrong'); return; }
    sfx('click'); save.name = name; writeSave(save); flushCloud(); p.close();
    openPrep(() => { save.prepped = true; writeSave(save); flushCloud(); void startPlaying(); }, true);
  };
  (p.el.querySelector('#nm-ok') as HTMLElement).onclick = ok;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  (p.el.querySelector('#nm-out') as HTMLElement).onclick = async () => { sfx('click'); p.close(); await logout(); };
}
async function startPlaying() {
  hideLobby(); $('login').classList.add('hidden');
  save.loc = { kind: 'island', id: 1 };
  $('hud').classList.remove('hidden'); $('touch').classList.remove('hidden');
  await enterStage(1);
}
let authSeq = 0;
async function onUser(u: User | null) {
  const seq = ++authSeq;
  if (!u) { uid = ''; setSaveOwner(''); showLogin(); return; }
  hideAllForLogin(); const el = $('login'); el.innerHTML = '<div class="lg-box"><div class="lg-sub">กำลังโหลดข้อมูลผู้เล่น...</div></div>'; el.classList.remove('hidden');
  let prof: Awaited<ReturnType<typeof loadProfile>>;
  try { prof = await loadProfile(u.uid); }
  catch { if (seq === authSeq) { uid = ''; setSaveOwner(''); showLogin('เชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง'); } return; }
  if (seq !== authSeq) return;
  uid = u.uid; setSaveOwner(uid);
  if (prof?.save) { save = mergeSave(prof.save as Partial<Save>); if (prof.name) save.name = prof.name; }
  else { const legacy = takeLegacySave(); if (legacy) { save = legacy; dropLegacySave(); } else save = loadSave(); }
  hp = stats().maxHp; sp = 0;
  $('login').classList.add('hidden');
  if (!save.name) showCreate(); else { writeSave(save); void startPlaying(); }
}
function devFake() {
  const mkr = (id: string, n: string, l: number, dx: number, dy: number, k: number[], text = ''): Remote => ({ uid: id, n, l, x: P.x + dx, y: P.y + dy, tx: P.x + dx, ty: P.y + dy, d: 1, f: 1, m: 0, k, a: 1, w: 2, anim: 0, bubble: text, bubbleT: text ? 999 : 0, ct: 0, q: 0, swingT: 0, swingA: 0 });
  remotes.set('a', mkr('a', 'นักรบฟ้า', 12, -50, -10, [1, 2, 1, 3, 2, 3, 1], 'สวัสดีทุกคน! ไปฟาร์มกันไหม'));
  remotes.set('b', mkr('b', 'Mimi', 45, 46, 8, [3, 0, 2, 1, 4, 0, 2]));
  remotes.set('c', mkr('c', 'ปลาทอง', 3, 8, -46, [0, 4, 0, 5, 0, 1, 0], 'รับเควสที่ไหนครับ'));
  myBubble = { text: 'เกมนี้สนุกมาก!', t: 999 };
  setInterval(() => { const a = remotes.get('a'), b = remotes.get('b'), c2 = remotes.get('c'); if (a) remoteAction(a, 0, 0.3); if (b) remoteAction(b, 2, 0); if (c2) remoteAction(c2, 1, -1.2); }, 650);
}
function devAtDock() { if (map.dock) { P.x = map.dock.x; P.y = map.dock.y - 36; } }
function devAtFarm() { const fo = farmOutpost(); if (fo) { P.x = fo.x; P.y = fo.y + 24; } }
const devQs = new URLSearchParams(location.search);
if (import.meta.env.DEV && devQs.has('dbg')) {
  save = freshSave(); save.name = 'ทดสอบ'; save.started = true; save.level = +(devQs.get('lv') ?? 10); hp = stats().maxHp;
  $('login').classList.add('hidden');
  const isl = devQs.get('island');
  save.nav = +(devQs.get('nav') ?? 0);
  if (isl) save.quests['visit-' + isl] = true;
  if (devQs.get('sea') !== null) { enterSea(); if (devQs.has('chart')) openSeaChart(); } else if (isl) { void enterStage(+isl); if (devQs.has('q')) setTimeout(openQuest, 900); if (devQs.has('bag')) setTimeout(() => openPrep(undefined, false, 'bag'), 900); if (devQs.has('dress')) setTimeout(() => openPrep(undefined, false, 'body'), 900);
    if (devQs.get('ship')) shipCall = { st: devQs.get('ship') === 'coming' ? 'coming' : 'moored', t: devQs.get('ship') === 'coming' ? 0.5 : 1 };
    if (devQs.get('at') === 'dock') devAtDock();
    if (devQs.get('at') === 'farm') devAtFarm();
    if (devQs.has('fake')) devFake(); if (devQs.has('doing')) { save.quest = { kind: 'kill', need: 5, have: 3, mul: 0.5, text: 'ปราบมอนสเตอร์ 5 ตัว' }; refreshHud(); } } else showTitle();
} else watchAuth(u => { void onUser(u); });
requestAnimationFrame(frame);


setTimeout(() => { if (!sea) sea = genSea(); }, 2500);
