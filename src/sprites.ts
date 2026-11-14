import { SKINS, HAIRS, PLUMES, TRIMS, CAPES, BOOTS, type MonsterDef, type MonsterType, type ObsKind, type Look } from './data';

export type Sprite = HTMLCanvasElement;

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}
const OUT = '#1a1410';
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function clamp(v: number) { return Math.max(0, Math.min(255, v)); }
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${clamp(((n >> 16) & 255) + amt)},${clamp(((n >> 8) & 255) + amt)},${clamp((n & 255) + amt)})`;
}

// ---- auto shading: highlight top edges, darken bottom edges -> volume
function shadeSprite(c: Sprite): Sprite {
  const x = c.getContext('2d')!, w = c.width, h = c.height;
  const d = x.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(d.data);
  const isOut = (i: number) => src[i] === 26 && src[i + 1] === 20 && src[i + 2] === 16;
  const solid = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return false;
    const i = (py * w + px) * 4; return src[i + 3] > 0 && !isOut(i);
  };
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const i = (y * w + xx) * 4;
    if (src[i + 3] === 0 || isOut(i)) continue;
    let amt = 0;
    if (!solid(xx, y - 1)) amt = 34; else if (!solid(xx, y + 1)) amt = -34; else if (!solid(xx - 1, y)) amt = 14; else if (!solid(xx + 1, y)) amt = -18;
    if (amt) { d.data[i] = clamp(src[i] + amt); d.data[i + 1] = clamp(src[i + 1] + amt); d.data[i + 2] = clamp(src[i + 2] + amt); }
  }
  x.putImageData(d, 0, 0);
  return c;
}

// outline every opaque pixel with 1px dark border (canvas grows by 2)
function outlined(src: Sprite): Sprite {
  const [c, x] = mk(src.width + 2, src.height + 2);
  const s = src.getContext('2d')!.getImageData(0, 0, src.width, src.height);
  x.fillStyle = OUT;
  for (let y = 0; y < src.height; y++) for (let xx = 0; xx < src.width; xx++) {
    if (s.data[(y * src.width + xx) * 4 + 3] === 0) continue;
    x.fillRect(xx, y + 1, 3, 1); x.fillRect(xx + 1, y, 1, 3);
  }
  x.drawImage(src, 1, 1);
  return c;
}

function fromGrid(rows: string[], pal: Record<string, string>): Sprite {
  const w = 16, h = rows.length;
  const [c, x] = mk(w, h);
  rows.forEach((r, y) => {
    for (let i = 0; i < w; i++) {
      const ch = r[i]; if (!ch || ch === '.') continue;
      const col = pal[ch]; if (!col) continue;
      x.fillStyle = col; x.fillRect(i, y, 1, 1);
    }
  });
  return shadeSprite(c);
}

// ---------------------------------------------------------------- hero (parametric, 3 directions x 3 frames)
export interface ArmorLook { m: string; md: string; ml: string; }
export const ARMOR_LOOKS: ArmorLook[] = [
  { m: '#8a5a32', md: '#5e3a1e', ml: '#b07a4a' },
  { m: '#c98a4a', md: '#8a5424', ml: '#f0b878' },
  { m: '#aab4c0', md: '#6a7480', ml: '#e8f0f8' },
  { m: '#e0b040', md: '#a07a1c', ml: '#fff0a0' },
  { m: '#7a4ac0', md: '#4a2a80', ml: '#b890f0' },
];
export type Dir = 'down' | 'up' | 'side';
const heroCache = new Map<string, Sprite>();

export function heroFrame(dir: Dir, frame: number, tier: number, look: Look, shield = false): Sprite {
  const key = `${dir}${frame}${tier}${look.skin}${look.hair}${look.helmet}${look.plume}${look.trim}${look.cape}${look.boots}${shield ? 1 : 0}`;
  let s = heroCache.get(key); if (s) return s;
  const [c, x] = mk(20, 24);
  const A = ARMOR_LOOKS[tier];
  const r = (px: number, py: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  const skin = SKINS[look.skin], skinD = shade(skin, -34), hair = HAIRS[look.hair], plume = PLUMES[look.plume], trim = TRIMS[look.trim];
  const cape = CAPES[look.cape], capeD = cape ? shade(cape, -45) : '#000', boot = BOOTS[look.boots], bootD = shade(boot, -34);
  const cloth = '#6a4a38', hv = look.helmet;
  const lL = frame === 1 ? 1 : 0, lR = frame === 2 ? 1 : 0;
  const head = (back: boolean, side: boolean) => {
    const hx = side ? 6 : 6;
    if (hv === 0 || hv === 2) { // metal helm
      r(hx, 1, 8, 7, A.m); r(7, 1, 4, 2, A.ml); r(hx, 6, 8, 2, A.md);
      if (hv === 0) { r(side ? 8 : 9, 0, 2, 3, plume); r(side ? 8 : 9, 0, 1, 3, shade(plume, 40)); }
      else { r(4, 1, 2, 3, '#e8dcc0'); r(3, 0, 1, 2, '#e8dcc0'); r(14, 1, 2, 3, '#e8dcc0'); r(16, 0, 1, 2, '#e8dcc0'); r(4, 3, 2, 1, '#b8a888'); r(14, 3, 2, 1, '#b8a888'); }
    } else { // hair-based
      r(hx, 1, 8, back ? 8 : 5, hair); r(7, 1, 4, 1, shade(hair, 30)); if (!back) r(hx, 5, 1, 3, hair); if (!back && !side) r(13, 5, 1, 3, hair);
      if (hv === 1) { r(hx, 3, 8, 1, plume); if (side || back) r(3, 3, 3, 2, plume); }
      else { r(hx, 1, 8, 2, trim); r(6, 0, 1, 1, trim); r(9, 0, 2, 1, trim); r(13, 0, 1, 1, trim); r(9, 1, 2, 1, '#e04a4a'); }
    }
    if (!back) {
      if (side) { r(11, 5, 3, 4, skin); r(12, 6, 1, 1, '#2a1a14'); r(11, 4, 3, 1, hv === 0 || hv === 2 ? A.md : hair); }
      else { r(7, 5, 6, 4, skin); r(7, 8, 6, 1, skinD); r(8, 6, 1, 1, '#2a1a14'); r(11, 6, 1, 1, '#2a1a14'); r(6, 4, 8, 1, hv === 0 || hv === 2 ? A.md : hair); }
    } else if (hv === 0 || hv === 2) { r(7, 4, 6, 5, A.m); r(9, 4, 2, 5, A.md); }
    r(7, 9, 6, 1, back || hv === 0 || hv === 2 ? A.md : skinD);
  };
  if (dir === 'down' || dir === 'up') {
    const back = dir === 'up';
    if (back && cape) { r(5, 9, 10, 11, cape); r(5, 9, 2, 11, capeD); r(13, 9, 2, 11, capeD); }
    r(7, 18, 3, 3 - lL, cloth); r(10, 18, 3, 3 - lR, cloth);
    r(6, 21 - lL, 4, 2, boot); r(10, 21 - lR, 4, 2, boot); r(6, 23 - lL, 4, 1, bootD); r(10, 23 - lR, 4, 1, bootD);
    if (!back) {
      r(6, 9, 8, 8, A.m); r(7, 10, 3, 5, A.ml); r(12, 10, 2, 6, A.md); r(9, 9, 2, 8, A.md);
      r(6, 15, 8, 2, trim); r(9, 15, 2, 2, shade(trim, 50));
      r(6, 17, 8, 2, cape ?? shade(trim, -50)); r(6, 18, 8, 1, cape ? capeD : shade(trim, -80));
    } else { r(6, 9, 8, 10, cape ?? A.m); r(6, 9, 8, 2, A.md); if (cape) r(9, 11, 2, 7, capeD); }
    r(4, 10, 3, 3, A.ml); r(13, 10, 3, 3, A.m); r(4, 13, 2, 4, A.md); r(14, 13, 2, 4, A.md);
    r(4, 17, 2, 1, skin); r(14, 17, 2, 1, skin);
    if (shield) { r(1, 10, 5, 7, '#7a5230'); r(1, 10, 5, 1, '#a8782e'); r(2, 11, 3, 5, '#a8782e'); r(3, 12, 1, 3, trim); r(1, 16, 5, 1, '#4a2e16'); }
    head(back, false);
  } else {
    if (cape) { r(3, 9, 4, 10, cape); r(3, 9, 1, 10, capeD); r(4, 17 + (frame ? 1 : 0), 3, 2, cape); }
    const sw = frame === 1 ? 2 : frame === 2 ? -2 : 0;
    r(8 - sw, 18, 3, 3, cloth); r(9 + sw, 18, 3, 3, '#5a4030');
    r(8 - sw, 21, 4, 2, boot); r(9 + sw, 21, 4, 2, bootD);
    r(7, 9, 7, 9, A.m); r(8, 10, 2, 5, A.ml); r(7, 15, 7, 2, trim); r(7, 17, 7, 2, cape ?? shade(trim, -50));
    if (shield) { r(5, 10, 4, 7, '#7a5230'); r(5, 10, 4, 1, '#a8782e'); r(6, 11, 2, 5, '#a8782e'); r(6, 12, 1, 3, trim); }
    r(10, 10, 3, 3, A.ml); r(10, 13, 3, 4, A.md); r(11, 17, 2, 1, skin);
    head(false, true);
  }
  s = outlined(shadeSprite(c));
  heroCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------- NPC / monsters (16px grids, auto-shaded)
const NPC = [
  '................', '.....oooooo.....', '....oppppppo....', '...oppppppppo...', '...osssssssso...', '...osksssskso...',
  '...owsssssswo...', '....owwwwwwo....', '...occcccccco...', '..osccccccccso..', '..osccGGGGccso..', '...occcccccco...',
  '...occcccccco...', '..occcccccccco..', '..oooooooooooo..',
];
const BLOB = [
  '................', '................', '......oooo......', '....ooggggoo....', '...oggggggggo...', '..oggwwggwwggo..',
  '..oggwkggwkggo..', '.oggggggggggggo.', '.ogggddddddgggo.', '.oggggggggggggo.', '..oggggggggggo..', '...oooooooooo...',
];
const SKULL = [
  '................', '....oooooooo....', '...owwwwwwwwo...', '..owwwwwwwwwwo..', '..owwwwwwwwwwo..', '..owkkkwwkkkwo..',
  '..owkeekwwkeeo..', '..owkkkwwkkkwo..', '..owwwwooowwwo..', '...owwwwwwwwo...', '....owowowwo....', '....owowowwo....', '.....oooooo.....',
];
const BEAST = [
  '..oo........oo..', '.ommo......ommo.', '.ommmoooooommmo.', '..ommmmmmmmmmo..', '.ommmmmmmmmmmmo.', '.ommwkmmmmwkmmo.',
  '.ommmmmmmmmmmmo.', '..ommmoddommmo..', '..ommmdwwdmmmo..', '...ommmwwmmmo...', '....oooooooo....',
];

export function npcSprite(robe: string, hat: string): Sprite {
  return fromGrid(NPC, { o: OUT, p: hat, s: '#f2c9a0', k: '#2a1a14', w: '#f4f0e6', c: robe, G: '#e0c04a' });
}
export function monsterSprite(m: MonsterDef): Sprite {
  const rows: Record<MonsterType, string[]> = { blob: BLOB, skull: SKULL, beast: BEAST };
  const pal: Record<MonsterType, Record<string, string>> = {
    blob: { o: OUT, g: m.c1, d: m.c2, w: '#fff', k: '#1a1410' },
    skull: { o: OUT, w: m.c1, k: '#1a1410', e: m.c2 },
    beast: { o: OUT, m: m.c1, d: m.c2, w: '#fff', k: '#1a1410' },
  };
  return fromGrid(rows[m.type], pal[m.type]);
}

// ---------------------------------------------------------------- terrain
export function groundTile(g1: string, g2: string, seed: number): Sprite {
  const [c, x] = mk(16, 16);
  x.fillStyle = g1; x.fillRect(0, 0, 16, 16);
  const r = rng(seed);
  for (let i = 0; i < 18; i++) { x.fillStyle = r() < 0.6 ? g2 : shade(g1, 12); x.fillRect(Math.floor(r() * 16), Math.floor(r() * 16), 1 + Math.floor(r() * 2), 1); }
  for (let i = 0; i < 3; i++) { // grass tufts
    const px = 1 + Math.floor(r() * 13), py = 3 + Math.floor(r() * 11);
    x.fillStyle = shade(g1, -26); x.fillRect(px, py, 1, 2); x.fillRect(px + 2, py + 1, 1, 1);
    x.fillStyle = shade(g1, 22); x.fillRect(px, py - 1, 1, 1); x.fillRect(px + 2, py, 1, 1);
  }
  return c;
}
export function pathTile(col: string, seed: number): Sprite {
  const [c, x] = mk(16, 16);
  x.fillStyle = col; x.fillRect(0, 0, 16, 16);
  const r = rng(seed + 99);
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(0,0,0,.11)'; x.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 2, 1); }
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 1, 1); }
  for (let i = 0; i < 3; i++) { // pebbles
    const px = Math.floor(r() * 13), py = Math.floor(r() * 13);
    x.fillStyle = shade(col, -30); x.fillRect(px, py + 1, 3, 2); x.fillStyle = shade(col, 20); x.fillRect(px, py, 2, 1);
  }
  return c;
}

export type DecorKind = 'flower' | 'mush' | 'bone' | 'pebble' | 'tuft' | 'shard';
export function decorSprite(kind: DecorKind, col: string, seed: number): Sprite {
  const [c, x] = mk(8, 8);
  const r = rng(seed);
  const px = (a: number, b: number, w: number, h: number, f: string) => { x.fillStyle = f; x.fillRect(a, b, w, h); };
  switch (kind) {
    case 'flower': { const cols = ['#f4e060', '#f4f4f4', '#f08aa8', '#9ac8f4']; const f = cols[Math.floor(r() * cols.length)]; px(3, 4, 1, 4, '#3f7a36'); px(2, 3, 3, 1, f); px(3, 2, 1, 3, f); px(3, 3, 1, 1, '#c8501a'); break; }
    case 'mush': px(3, 5, 2, 3, '#e8dcc0'); px(1, 3, 6, 3, '#c8452f'); px(2, 3, 1, 1, '#fff'); px(5, 4, 1, 1, '#fff'); break;
    case 'bone': px(1, 5, 6, 1, '#eae2cc'); px(0, 4, 2, 1, '#eae2cc'); px(0, 6, 2, 1, '#eae2cc'); px(6, 4, 2, 1, '#eae2cc'); px(6, 6, 2, 1, '#eae2cc'); px(1, 6, 6, 1, 'rgba(0,0,0,.2)'); break;
    case 'pebble': px(1, 5, 3, 2, shade(col, -10)); px(1, 4, 2, 1, shade(col, 25)); px(4, 6, 3, 2, shade(col, -20)); px(4, 5, 2, 1, shade(col, 15)); break;
    case 'tuft': px(2, 3, 1, 5, shade(col, -10)); px(4, 2, 1, 6, shade(col, 15)); px(6, 4, 1, 4, shade(col, -25)); break;
    case 'shard': px(3, 2, 2, 6, col); px(3, 2, 1, 6, '#fff'); px(1, 5, 2, 3, shade(col, -30)); px(5, 4, 2, 4, shade(col, -15)); break;
  }
  return c;
}

function disc(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, col: string) {
  x.fillStyle = col;
  for (let y = -ry; y <= ry; y++) for (let xx = -rx; xx <= rx; xx++) if ((xx * xx) / (rx * rx) + (y * y) / (ry * ry) <= 1.02) x.fillRect(Math.round(cx + xx), Math.round(cy + y), 1, 1);
}

// tall obstacle sprites (20x28), anchored on the bottom of the tile
export function obstacleSprite(kind: ObsKind, col: string, variant: number): Sprite {
  const [c, x] = mk(20, 28);
  const dark = shade(col, -42), light = shade(col, 38), mid = shade(col, -16);
  const px = (a: number, b: number, w: number, h: number, f: string) => { x.fillStyle = f; x.fillRect(a, b, w, h); };
  const r = rng(variant * 977 + col.length * 131);
  disc(x, 10, 26, 8, 2, 'rgba(0,0,0,.30)'); // ground shadow
  switch (kind) {
    case 'tree': {
      px(9, 15, 3, 11, '#5a3a1e'); px(11, 15, 1, 11, '#3a2412'); px(9, 15, 1, 11, '#7a5230'); px(7, 24, 7, 2, '#4a2e16');
      const dy = variant % 2;
      disc(x, 10, 10 + dy, 9, 7, dark); disc(x, 5, 13, 5, 5, dark); disc(x, 15, 13, 5, 5, dark);
      disc(x, 10, 8 + dy, 8, 6, mid); disc(x, 6, 11, 4, 4, mid); disc(x, 14, 11, 4, 4, mid);
      disc(x, 9, 6 + dy, 5, 3, col); disc(x, 14, 9, 3, 2, col);
      disc(x, 7, 5 + dy, 2, 1, light); disc(x, 12, 7, 2, 1, light);
      for (let i = 0; i < 26; i++) { const lx = 3 + Math.floor(r() * 14), ly = 3 + Math.floor(r() * 14); x.fillStyle = r() < 0.5 ? light : dark; x.fillRect(lx, ly, 1, 1); }
      break;
    }
    case 'rock': {
      disc(x, 10, 21, 8, 5, dark); disc(x, 10, 20, 7, 4, col); disc(x, 8, 18, 4, 2, light); disc(x, 12, 22, 4, 2, mid);
      disc(x, 16, 24, 3, 2, dark); disc(x, 16, 23, 2, 1, col); disc(x, 4, 24, 3, 2, dark); disc(x, 4, 23, 2, 1, mid);
      px(7, 17, 1, 1, '#fff'); px(11, 22, 3, 1, dark);
      break;
    }
    case 'pillar': {
      const h = variant % 2 ? 12 : 4;
      px(5, h, 10, 24 - h, col); px(5, h, 3, 24 - h, light); px(12, h, 3, 24 - h, dark); px(9, h, 1, 24 - h, mid); px(7, h, 1, 24 - h, mid);
      px(3, 22, 14, 4, dark); px(4, 22, 12, 3, col); px(4, 22, 12, 1, light);
      if (!(variant % 2)) { px(3, 1, 14, 4, col); px(3, 1, 14, 1, light); px(3, 4, 14, 1, dark); px(5, 5, 10, 1, dark); }
      else { px(5, 10, 3, 2, dark); px(10, 11, 4, 1, dark); px(13, 12, 2, 1, 'rgba(0,0,0,0)'); }
      break;
    }
    case 'cactus': {
      px(8, 5, 5, 20, col); px(8, 5, 2, 20, light); px(11, 5, 2, 20, dark); px(9, 4, 3, 1, col);
      px(3, 11, 5, 3, col); px(3, 7, 3, 7, col); px(3, 7, 1, 7, light); px(13, 9, 5, 3, col); px(15, 5, 3, 7, col); px(17, 5, 1, 7, dark);
      x.fillStyle = '#fff'; for (let i = 0; i < 10; i++) x.fillRect(8 + Math.floor(r() * 5), 6 + Math.floor(r() * 18), 1, 1);
      px(9, 2, 3, 3, '#f08aa8'); px(10, 3, 1, 1, '#f4e060');
      break;
    }
    case 'wall': {
      px(1, 9, 18, 17, col); px(1, 9, 18, 2, light); px(1, 24, 18, 2, dark);
      x.fillStyle = dark; for (let yy = 13; yy < 26; yy += 4) x.fillRect(1, yy, 18, 1);
      for (let row = 0; row < 3; row++) { const off = row % 2 ? 0 : 4; for (let xx = 1 + off; xx < 19; xx += 8) x.fillRect(xx, 13 + row * 4, 1, 4); }
      px(1, 5, 5, 4, col); px(8, 5, 4, 4, col); px(14, 5, 5, 4, col); px(1, 5, 5, 1, light); px(8, 5, 4, 1, light); px(14, 5, 5, 1, light);
      px(17, 9, 2, 17, dark);
      break;
    }
    case 'crystal': {
      const gl = (cx: number, top: number, hw: number, bot: number, f: string) => {
        for (let y = top; y <= bot; y++) { const w = Math.min(hw, Math.round((y - top) * 0.45) + 1); x.fillStyle = f; x.fillRect(cx - w, y, w * 2, 1); }
      };
      gl(10, 3, 4, 24, dark); gl(10, 3, 3, 23, col); px(9, 5, 1, 16, '#fff'); px(8, 8, 1, 8, light);
      gl(4, 12, 3, 25, dark); gl(4, 12, 2, 24, col); gl(16, 14, 3, 25, dark); gl(16, 14, 2, 24, mid); px(3, 15, 1, 5, light);
      break;
    }
  }
  return c;
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill();
}

const flashCache = new WeakMap<Sprite, Sprite>();
export function flashed(s: Sprite): Sprite {
  let f = flashCache.get(s); if (f) return f;
  const [c, x] = mk(s.width, s.height);
  x.drawImage(s, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = '#fff'; x.fillRect(0, 0, s.width, s.height);
  flashCache.set(s, c);
  return c;
}
const tintCache = new Map<string, Sprite>();
export function tinted(s: Sprite, col: string, key: string): Sprite {
  const k = key + col; let f = tintCache.get(k); if (f) return f;
  const [c, x] = mk(s.width, s.height);
  x.drawImage(s, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = 0.5; x.fillStyle = col; x.fillRect(0, 0, s.width, s.height);
  tintCache.set(k, c);
  return c;
}

export function waterTile(col: string, seed: number): Sprite {
  const [c, x] = mk(16, 16);
  x.fillStyle = col; x.fillRect(0, 0, 16, 16);
  const r = rng(seed + 5);
  for (let i = 0; i < 6; i++) { x.fillStyle = shade(col, 22); x.fillRect(Math.floor(r() * 12), Math.floor(r() * 15), 3 + Math.floor(r() * 3), 1); }
  for (let i = 0; i < 4; i++) { x.fillStyle = shade(col, -22); x.fillRect(Math.floor(r() * 12), Math.floor(r() * 15), 3, 1); }
  return c;
}

export function chestSprite(open: boolean): Sprite {
  const [c, x] = mk(16, 16);
  const px = (a: number, b: number, w: number, h: number, f: string) => { x.fillStyle = f; x.fillRect(a, b, w, h); };
  px(2, 14, 12, 1, 'rgba(0,0,0,.3)');
  px(2, 7, 12, 7, '#7a4a22'); px(2, 7, 12, 1, '#a8682e'); px(2, 11, 12, 1, '#4a2a12'); px(7, 8, 2, 4, '#e0b040'); px(2, 7, 1, 7, '#e0b040'); px(13, 7, 1, 7, '#e0b040');
  if (!open) { px(2, 3, 12, 5, '#8a5a2a'); px(3, 2, 10, 2, '#a8682e'); px(2, 4, 1, 4, '#e0b040'); px(13, 4, 1, 4, '#e0b040'); px(7, 6, 2, 3, '#e0b040'); }
  else { px(2, 0, 12, 4, '#8a5a2a'); px(3, 0, 10, 1, '#a8682e'); px(3, 5, 10, 3, '#ffe27a'); px(5, 4, 2, 1, '#fff'); px(9, 5, 2, 1, '#fff'); }
  return outlined(c);
}
