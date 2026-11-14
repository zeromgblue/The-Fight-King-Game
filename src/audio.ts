// Synthesized sound effects only — no asset files, no background music.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('knws_muted') === '1'; } catch { /* ignore */ }

function ensure(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.25;
    comp.connect(master); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ensure(); }
export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('knws_muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.85;
}
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- sfx
function tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
  const c = ensure(); if (!c || !sfxBus) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
}
function noiseBuf(dur: number) {
  const c = ctx!; const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  return buf;
}
function noise(dur: number, vol: number, when = 0, hp = 800, dest?: AudioNode) {
  const c = ensure(); if (!c || !sfxBus) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf(dur);
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(dest ?? sfxBus); s.start(c.currentTime + when);
}

export type Sfx = 'swing' | 'hit' | 'crit' | 'hurt' | 'dodge' | 'correct' | 'wrong' | 'levelup' | 'click' | 'coin' | 'telegraph' | 'win' | 'lose' | 'step' | 'chest' | 'equip';

export function sfx(n: Sfx) {
  if (muted) return;
  switch (n) {
    case 'swing': noise(0.14, 0.22, 0, 1800); tone(420, 0.12, 'sawtooth', 0.04, 0, 1400); break;
    case 'hit': noise(0.1, 0.32, 0, 500); tone(190, 0.12, 'square', 0.1, 0, 70); tone(900, 0.05, 'triangle', 0.06); break;
    case 'crit': noise(0.24, 0.42, 0, 300); tone(300, 0.25, 'sawtooth', 0.13, 0, 60); tone(1100, 0.2, 'square', 0.07, 0.02, 220); break;
    case 'hurt': tone(210, 0.2, 'sawtooth', 0.15, 0, 60); noise(0.1, 0.2, 0, 300); break;
    case 'dodge': noise(0.16, 0.12, 0, 2500); tone(600, 0.14, 'triangle', 0.07, 0, 1300); break;
    case 'telegraph': tone(330, 0.08, 'square', 0.05); tone(330, 0.08, 'square', 0.05, 0.1); break;
    case 'correct': [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, i * 0.07)); break;
    case 'wrong': tone(220, 0.3, 'sawtooth', 0.1, 0, 110); break;
    case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, 'triangle', 0.11, i * 0.09)); break;
    case 'click': tone(700, 0.05, 'triangle', 0.07); break;
    case 'coin': tone(988, 0.07, 'square', 0.05); tone(1318, 0.14, 'square', 0.05, 0.07); break;
    case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.12)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, 'triangle', 0.12, i * 0.16)); break;
    case 'step': noise(0.03, 0.03, 0, 2500); break;
    case 'chest': tone(300, 0.1, 'square', 0.06); [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, 0.1 + i * 0.07)); break;
    case 'equip': noise(0.08, 0.2, 0, 3000); tone(520, 0.08, 'triangle', 0.08); tone(780, 0.12, 'triangle', 0.08, 0.06); break;
  }
}

/** typewriter blip — soft, pitch varies per letter */
let blipN = 0;
export function blip(base = 520) {
  if (muted) return;
  blipN++;
  const f = base * (1 + ((blipN * 7) % 5) * 0.06);
  tone(f, 0.045, 'triangle', 0.055);
}

// Background music and ambience were removed on request; kept as a no-op so callers stay simple.
export function setMusic(_mode: 'map' | 'battle' | 'title' | 'off' = 'off', _stage = 1) { /* no music */ }
