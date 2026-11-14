import { SUBJECT_NAME, type Question } from './questions';
import { sfx, blip } from './audio';
import { defaultLook, defaultGear, type Look, type Gear } from './data';

export interface Save {
  level: number; exp: number; gold: number;
  cleared: number[]; quests: Record<string, boolean>; started: boolean;
  stats: { answered: number; correct: number };
  look: Look; gear: Gear; prepped: boolean;
}

const KEY = 'knws_quest_v1';
export const freshSave = (): Save => ({ level: 1, exp: 0, gold: 0, cleared: [], quests: {}, started: false, stats: { answered: 0, correct: 0 }, look: defaultLook(), gear: defaultGear(), prepped: false });

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); const f = freshSave(); return { ...f, ...o, look: { ...f.look, ...(o.look || {}) }, gear: { ...f.gear, ...(o.gear || {}) }, stats: { ...f.stats, ...(o.stats || {}) } }; }
  } catch { /* ignore */ }
  return freshSave();
}
export function writeSave(s: Save) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function wipeSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

let toastTimer = 0;
export function toast(msg: string, ms = 1900) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

export interface PanelHandle { el: HTMLElement; close(): void; onX?: () => void; }
const panelStack: PanelHandle[] = [];
export function closeTopPanel() { const h = panelStack[panelStack.length - 1]; if (h) (h.onX ?? h.close)(); }
export function panel(html: string): PanelHandle {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="panel">${html}</div>`;
  $('overlay').appendChild(scrim);
  const h: PanelHandle = { el: scrim.firstElementChild as HTMLElement, close: () => { scrim.remove(); const i = panelStack.indexOf(h); if (i >= 0) panelStack.splice(i, 1); } };
  const x = document.createElement('button');
  x.className = 'panel-x'; x.setAttribute('aria-label', 'ปิด');
  x.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';
  x.onclick = () => { sfx('click'); (h.onX ?? h.close)(); };
  h.el.appendChild(x); panelStack.push(h);
  return h;
}
export const panelOpen = () => $('overlay').children.length > 0;
export function closeAllPanels() { $('overlay').innerHTML = ''; panelStack.length = 0; }

export function dialog(speaker: string, lines: string[], btn = 'ต่อไป', portrait?: HTMLCanvasElement): Promise<void> {
  return new Promise(res => {
    let i = 0, pos = 0, timer = 0, typing = false;
    const p = panel(
      `<div class="dlg-head">${portrait ? '<div class="portrait" id="dlg-portrait"></div>' : ''}<div class="speaker">${esc(speaker)}</div></div>` +
      `<p id="dlg-text" class="dlg-text"></p><button class="btn" id="dlg-next"></button>`);
    const text = p.el.querySelector('#dlg-text') as HTMLElement;
    const next = p.el.querySelector('#dlg-next') as HTMLButtonElement;
    const por = p.el.querySelector('#dlg-portrait') as HTMLElement | null;
    if (por && portrait) { const c = document.createElement('canvas'); c.width = portrait.width; c.height = portrait.height; c.getContext('2d')!.drawImage(portrait, 0, 0); por.appendChild(c); }
    const pitch = 380 + (speaker.length % 7) * 40;
    const finish = () => { clearInterval(timer); typing = false; text.textContent = lines[i]; text.classList.remove('typing'); por?.classList.remove('talk'); next.textContent = i < lines.length - 1 ? 'ต่อไป' : btn; next.disabled = false; };
    const start = () => {
      pos = 0; typing = true; text.textContent = ''; text.classList.add('typing'); por?.classList.add('talk'); next.textContent = 'ข้าม'; next.disabled = false;
      const full = lines[i];
      timer = window.setInterval(() => {
        pos += 1; text.textContent = full.slice(0, pos);
        const ch = full[pos - 1];
        if (ch && ' .,!?()'.indexOf(ch) < 0 && !(ch.charCodeAt(0) >= 0x0E31 && ch.charCodeAt(0) <= 0x0E4E && ch !== 'า') && pos % 2 === 0) blip(pitch);
        if (pos >= full.length) finish();
      }, 28);
    };
    const advance = () => {
      if (typing) { finish(); return; }
      sfx('click');
      if (++i >= lines.length) { cleanup(); p.close(); res(); } else start();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } };
    const cleanup = () => { clearInterval(timer); window.removeEventListener('keydown', onKey); };
    window.addEventListener('keydown', onKey);
    p.onX = () => { cleanup(); p.close(); res(); };
    next.onclick = advance; text.onclick = () => { if (typing) finish(); };
    start();
  });
}

export function confirmBox(title: string, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise(res => {
    const p = panel(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn alt" id="c-no">${esc(no)}</button><button class="btn gold" id="c-yes">${esc(yes)}</button></div>`);
    p.onX = () => { p.close(); res(false); };
    (p.el.querySelector('#c-yes') as HTMLElement).onclick = () => { sfx('click'); p.close(); res(true); };
    (p.el.querySelector('#c-no') as HTMLElement).onclick = () => { sfx('click'); p.close(); res(false); };
  });
}

export function askQuestion(q: Question, title = 'คำถามปัญญา'): Promise<boolean> {
  return new Promise(res => {
    const letters = ['ก', 'ข', 'ค', 'ง'];
    const p = panel(
      `<span class="tag ${q.subject}">${SUBJECT_NAME[q.subject]}</span><div class="sub" style="text-align:left;margin:0">${esc(title)}</div>` +
      `<div class="qtext">${esc(q.q)}</div><div class="choices">` +
      q.choices.map((c, i) => `<button class="choice" data-i="${i}">${letters[i]}. ${esc(c)}</button>`).join('') +
      `</div><div id="q-fb"></div>`
    );
    const btns = Array.from(p.el.querySelectorAll<HTMLButtonElement>('.choice'));
    let done = false, result = false;
    const pick = (i: number) => {
      if (done) return; done = true;
      const ok = i === q.answer; result = ok;
      btns[i].classList.add(ok ? 'right' : 'wrong');
      btns[q.answer].classList.add('right');
      sfx(ok ? 'correct' : 'wrong');
      const fb = p.el.querySelector('#q-fb') as HTMLElement;
      if (ok) {
        fb.innerHTML = `<p style="color:#2f6b32;margin:10px 0 0"><b>ถูกต้อง!</b></p>`;
        setTimeout(() => { cleanup(); p.close(); res(true); }, 650);
      } else {
        fb.innerHTML = `<p style="margin:10px 0 0"><b style="color:#b8412c">ยังไม่ถูก</b> — ${esc(q.ex ?? '')}</p><button class="btn" id="q-next">ต่อไป</button>`;
        (fb.querySelector('#q-next') as HTMLElement).onclick = () => { sfx('click'); cleanup(); p.close(); res(false); };
      }
    };
    btns.forEach((b, i) => { b.onclick = () => pick(i); });
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.choices.length) pick(n - 1);
    };
    const cleanup = () => window.removeEventListener('keydown', onKey);
    window.addEventListener('keydown', onKey);
    p.onX = () => { cleanup(); p.close(); res(result); };
  });
}

export function updateHud(lv: number, hp: number, maxHp: number, exp: number, need: number, gold: number, stage: string) {
  $('hud-lv').textContent = String(lv);
  ($('hud-hp') as HTMLElement).style.width = `${Math.max(0, hp / maxHp) * 100}%`;
  $('hud-hp-t').textContent = `${Math.ceil(hp)}/${maxHp}`;
  ($('hud-xp') as HTMLElement).style.width = `${Math.min(1, exp / need) * 100}%`;
  ($('lv-ring') as HTMLElement).style.setProperty('--p', String(Math.min(1, exp / need) * 100));
  $('hud-xp-t').textContent = `${exp}/${need}`;
  $('hud-gold').textContent = String(gold);
  $('hud-stage').textContent = stage;
}
