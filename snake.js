// ======================================================
// snake.js — Ular Tangga (papan digambar dari data, bukan gambar luar)
// - Posisi ular/tangga & pion SELALU sinkron karena memakai data & rumus yang sama
// - Aturan lempar dadu satu sumber (snakeComputeRoll) dipakai pemain & bot
// - Animasi pion juga terlihat di layar pemain lain
// ======================================================

// Tidak ada ujung ular/tangga yang jatuh persis di kepala ular/tangga lain (tidak ada rantai)
const SNAKES_AND_LADDERS = [
  { start: 29, end: 7 },   { start: 24, end: 12 }, { start: 15, end: 37 },
  { start: 23, end: 41 },  { start: 72, end: 36 }, { start: 49, end: 86 },
  { start: 90, end: 56 },  { start: 75, end: 64 }, { start: 74, end: 95 },
  { start: 91, end: 71 },  { start: 97, end: 78 }
];

const PLAYER_COLORS = [
  { main: '#ef4444', dark: '#991b1b', light: '#fca5a5' },
  { main: '#3b82f6', dark: '#1e40af', light: '#93c5fd' },
  { main: '#eab308', dark: '#854d0e', light: '#fef08a' },
  { main: '#10b981', dark: '#065f46', light: '#6ee7b7' },
  { main: '#a855f7', dark: '#6b21a8', light: '#d8b4fe' },
  { main: '#f97316', dark: '#9a3412', light: '#fdba74' },
  { main: '#ec4899', dark: '#9d174d', light: '#fbcfe8' }
];

const SNAKE_BODY_COLORS = ['#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#be185d', '#65a30d', '#b45309', '#4f46e5'];
const SNAKE_TILE = 80;            // 10 x 10 kotak, kanvas 800 x 800

let snakeUnsub = null;
let snakeRefGlobal = null;
let isAnimatingLocal = false;
let snakeRemoteBusy = false;
let snakeLastSeenSeq = null;
let currentGameState = null;
let localVisualPositions = {};

// ---------------------- Suara ----------------------
let audioCtxSnake = null;
function getSnakeAudioContext() {
  if (!audioCtxSnake) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtxSnake = new AudioContextClass();
  }
  if (audioCtxSnake && audioCtxSnake.state === 'suspended') audioCtxSnake.resume();
  return audioCtxSnake;
}

function playSnakeStepSound() {
  try {
    const ctx = getSnakeAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

function playSnakeEventSound(isLadder) {
  try {
    const ctx = getSnakeAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = isLadder ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(isLadder ? 380 : 520, t);
    osc.frequency.exponentialRampToValueAtTime(isLadder ? 1000 : 120, t + 0.4);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.43);
  } catch (e) {}
}

// ---------------------- Suara tambahan ----------------------
function playSnakeTone(freq0, freq1, dur, type, vol, delay) {
  try {
    const ctx = getSnakeAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq0, t);
    if (freq1 && freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    gain.gain.setValueAtTime(vol || 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch (e) {}
}
function playSnakeBumpSound() { playSnakeTone(180, 60, 0.28, 'square', 0.12); }
function playSnakeWinSound() { [523, 659, 784, 1047].forEach((f, i) => playSnakeTone(f, f, 0.22, 'triangle', 0.13, i * 0.11)); }
function playSnakeDiceTick() { playSnakeTone(900 + Math.random() * 300, 500, 0.04, 'square', 0.05); }

// ---------------------- CSS efek ----------------------
(function injectSnakeCss() {
  if (document.getElementById('snakeFxStyle')) return;
  const st = document.createElement('style');
  st.id = 'snakeFxStyle';
  st.textContent = `
    .snake-toast-box { position:absolute; left:0; right:0; top:10px; z-index:10; display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; }
    .snake-toast { background:rgba(0,0,0,.84); color:#fff; font-weight:800; font-size:13px; padding:8px 14px; border-radius:20px; border:1px solid #facc15;
      max-width:92%; text-align:center; animation: snakeToastIn .38s cubic-bezier(.2,1.3,.4,1); transition: opacity .3s ease, transform .3s ease; box-shadow:0 6px 16px rgba(0,0,0,.4); }
    .snake-toast.out { opacity:0; transform: translateY(-10px) scale(.96); }
    @keyframes snakeToastIn { from { opacity:0; transform: translateY(-16px) scale(.88); } to { opacity:1; transform:none; } }
    .snake-flash { position:absolute; inset:0; z-index:6; pointer-events:none; opacity:0; }
    #snakeBtnRoll.snake-pulse:not(:disabled) { animation: snakeRollPulse 1.3s ease-in-out infinite; }
    @keyframes snakeRollPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(232,172,31,.0); } 50% { box-shadow: 0 0 0 7px rgba(232,172,31,.35); } }
    #snakeDiceBox { will-change: transform; transition: box-shadow .2s ease; }
    #snakeDiceBox.six { box-shadow: 0 0 0 3px #facc15, 0 0 26px rgba(250,204,21,.8) !important; }
    #snakePlayersList > div { transition: box-shadow .25s ease, border-color .25s ease, transform .25s ease; animation: snakeChipIn .3s ease; }
    @keyframes snakeChipIn { from { opacity:.0; transform: translateY(4px); } to { opacity:1; transform:none; } }
    @media (prefers-reduced-motion: reduce) { .snake-toast, #snakeBtnRoll.snake-pulse { animation:none !important; } }
  `;
  document.head.appendChild(st);
})();

const SNAKE_SPEED = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0.4 : 1;

// ---------------------- Geometri papan ----------------------
// Pusat kotak `pos` (1..100). Dipakai untuk papan DAN pion supaya selalu pas.
function getTileCenter(pos) {
  pos = Math.max(1, Math.min(100, pos | 0));
  const row = Math.floor((pos - 1) / 10);
  const col = (pos - 1) % 10;
  const actualCol = (row % 2 === 0) ? col : (9 - col);
  const actualRow = 9 - row;
  return { x: actualCol * SNAKE_TILE + SNAKE_TILE / 2, y: actualRow * SNAKE_TILE + SNAKE_TILE / 2 };
}

function getBoardCoordinates(pos, playerIndex) {
  const base = getTileCenter(pos);
  const offsets = [
    { x: -12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: 12 },
    { x: 12, y: -12 }, { x: 0, y: -16 }, { x: 0, y: 16 }, { x: 0, y: 0 }
  ];
  const o = offsets[playerIndex % offsets.length];
  return { x: base.x + o.x, y: base.y + o.y };
}

// ---------------------- Lapisan kanvas ----------------------
// z1 papan+tangga (statis) · z2 ular (animasi) · z3 nomor (statis) · z4 pion + efek
function snakeLayer(id, z) {
  const area = document.getElementById('snakeBoardArea');
  if (!area) return null;
  let cv = document.getElementById(id);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = id; cv.width = 800; cv.height = 800;
    cv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:block; pointer-events:none; z-index:' + z + ';';
    area.appendChild(cv);
  }
  return cv;
}

function snakeEnsureBoardCanvas() {
  const img = document.getElementById('snakeBoardBg');
  if (img) img.style.display = 'none';                 // gambar luar dimatikan (sumber ketidakcocokan & error)
  const main = snakeLayer('snakeBoardCanvas', 1);
  snakeLayer('snakeAnimCanvas', 2);
  snakeLayer('snakeNumCanvas', 3);
  const pawn = document.getElementById('snakeCanvas');
  if (pawn) pawn.style.zIndex = '4';
  return main;
}

function snakeDrawLadder(ctx, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, w = 11;
  ctx.save();
  ctx.lineCap = 'round';
  // bayangan
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 8;
  [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(a.x + nx * w * s + 3, a.y + ny * w * s + 4); ctx.lineTo(b.x + nx * w * s + 3, b.y + ny * w * s + 4); ctx.stroke(); });
  // anak tangga
  ctx.strokeStyle = '#a16207'; ctx.lineWidth = 6;
  const n = Math.max(3, Math.floor(len / 30));
  for (let i = 1; i < n; i++) {
    const t = i / n, cx = a.x + dx * t, cy = a.y + dy * t;
    ctx.beginPath(); ctx.moveTo(cx - nx * w, cy - ny * w); ctx.lineTo(cx + nx * w, cy + ny * w); ctx.stroke();
  }
  // tiang
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 8;
  [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(a.x + nx * w * s, a.y + ny * w * s); ctx.lineTo(b.x + nx * w * s, b.y + ny * w * s); ctx.stroke(); });
  ctx.strokeStyle = '#d6a15c'; ctx.lineWidth = 3;
  [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(a.x + nx * w * s, a.y + ny * w * s); ctx.lineTo(b.x + nx * w * s, b.y + ny * w * s); ctx.stroke(); });
  ctx.restore();
}

// ---------------------- Ular (data bersama: papan, pion yang meluncur) ----------------------
let SNAKE_GEOM = null;
function snakeGeom() {
  if (SNAKE_GEOM) return SNAKE_GEOM;
  SNAKE_GEOM = SNAKES_AND_LADDERS.filter(s => s.end < s.start).map((s, i) => {
    const head = getTileCenter(s.start), tail = getTileCenter(s.end);
    const dx = tail.x - head.x, dy = tail.y - head.y, len = Math.hypot(dx, dy) || 1;
    return { start: s.start, end: s.end, head, tail, dx, dy, len, nx: -dy / len, ny: dx / len,
             waves: Math.max(1.2, len / 150), amp: 15, seed: i * 1.7, color: SNAKE_BODY_COLORS[i % SNAKE_BODY_COLORS.length] };
  });
  return SNAKE_GEOM;
}

// Titik di badan ular pada posisi t (0 = kepala, 1 = ekor). Gelombang merambat (meliuk) sesuai waktu;
// kepala & ekor selalu terkunci di tengah kotak.
function snakePointAt(g, t, time) {
  const taper = Math.sin(Math.min(1, t * 6) * Math.PI / 2) * Math.sin(Math.min(1, (1 - t) * 8) * Math.PI / 2);
  const off = Math.sin(t * Math.PI * 2 * g.waves + g.seed + time * 1.7) * g.amp * taper;
  return { x: g.head.x + g.dx * t + g.nx * off, y: g.head.y + g.dy * t + g.ny * off };
}

function snakeDrawSnake(ctx, g, time) {
  const steps = 44, pts = [];
  for (let i = 0; i <= steps; i++) { const t = i / steps, p = snakePointAt(g, t, time); p.t = t; pts.push(p); }
  const color = g.color;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (w, style) => {
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
    pts.forEach((p, i) => { if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();
  };
  stroke(20, 'rgba(0,0,0,0.28)');                      // bayangan
  stroke(18, '#111827');                               // garis tepi
  stroke(14, color);                                   // badan
  stroke(5, 'rgba(255,255,255,0.33)');                 // kilau
  // corak belang
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4;
  for (let i = 3; i < pts.length - 1; i += 4) {
    const p = pts[i], q = pts[i + 1];
    const tx = q.x - p.x, ty = q.y - p.y, tl = Math.hypot(tx, ty) || 1, px = -ty / tl, py = tx / tl;
    ctx.beginPath(); ctx.moveTo(p.x - px * 6, p.y - py * 6); ctx.lineTo(p.x + px * 6, p.y + py * 6); ctx.stroke();
  }
  // ekor
  const e = pts[pts.length - 1];
  ctx.fillStyle = color; ctx.strokeStyle = '#111827'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(e.x, e.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // kepala
  const h = pts[0], h2 = pts[1];
  const ang = Math.atan2(h.y - h2.y, h.x - h2.x);
  ctx.translate(h.x, h.y); ctx.rotate(ang);
  ctx.fillStyle = color; ctx.strokeStyle = '#111827'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(4, 0, 17, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const flick = Math.max(0, Math.sin(time * 5 + g.seed * 3));                      // lidah menjulur-masuk
  const tl = 20 + 13 * flick;
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(tl, 0); ctx.lineTo(tl + 4, -4 * flick); ctx.moveTo(tl, 0); ctx.lineTo(tl + 4, 4 * flick); ctx.stroke();
  const blink = (Math.sin(time * 0.9 + g.seed * 5) > 0.985) ? 0.15 : 1;            // berkedip sesekali
  [-6, 6].forEach(oy => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(8, oy, 4.5, 4.5 * blink, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(9.5, oy, 2.2, 2.2 * blink, 0, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// ---------------------- Papan statis (sekali) ----------------------
function drawStaticBoard() {
  const cv = snakeEnsureBoardCanvas();
  if (!cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 800, 800);

  for (let pos = 1; pos <= 100; pos++) {
    const c = getTileCenter(pos), x = c.x - SNAKE_TILE / 2, y = c.y - SNAKE_TILE / 2;
    const row = Math.floor((pos - 1) / 10), col = (pos - 1) % 10;
    const light = (row + col) % 2 === 0;
    const g = ctx.createLinearGradient(x, y, x, y + SNAKE_TILE);
    if (pos === 100) { g.addColorStop(0, '#fde047'); g.addColorStop(1, '#eab308'); }
    else if (pos === 1) { g.addColorStop(0, '#bbf7d0'); g.addColorStop(1, '#4ade80'); }
    else if (light) { g.addColorStop(0, '#fffbeb'); g.addColorStop(1, '#fef3c7'); }
    else { g.addColorStop(0, '#fde68a'); g.addColorStop(1, '#fcd34d'); }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, SNAKE_TILE, SNAKE_TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';                       // kilau tipis di tepi atas
    ctx.fillRect(x + 1, y + 1, SNAKE_TILE - 2, 3);
    ctx.strokeStyle = 'rgba(120,53,15,0.32)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, SNAKE_TILE - 1.5, SNAKE_TILE - 1.5);
  }
  ctx.fillStyle = '#166534'; ctx.font = '800 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('START', getTileCenter(1).x, getTileCenter(1).y + SNAKE_TILE / 2 - 4);
  ctx.fillStyle = '#854d0e';
  ctx.fillText('FINISH', getTileCenter(100).x, getTileCenter(100).y + SNAKE_TILE / 2 - 4);
  ctx.font = '26px sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('🏁', getTileCenter(100).x, getTileCenter(100).y + 4);

  SNAKES_AND_LADDERS.filter(s => s.end > s.start).forEach(s => snakeDrawLadder(ctx, getTileCenter(s.start), getTileCenter(s.end)));

  // nomor kotak di lapisan sendiri (di atas ular) dengan halo supaya selalu terbaca
  const nv = document.getElementById('snakeNumCanvas');
  const nctx = nv && nv.getContext('2d');
  if (nctx) {
    nctx.clearRect(0, 0, 800, 800);
    nctx.font = '700 15px "Space Grotesk", sans-serif'; nctx.textAlign = 'left'; nctx.textBaseline = 'top';
    for (let pos = 1; pos <= 100; pos++) {
      const c = getTileCenter(pos), x = c.x - SNAKE_TILE / 2 + 5, y = c.y - SNAKE_TILE / 2 + 4;
      nctx.lineWidth = 4; nctx.strokeStyle = 'rgba(255,251,235,0.95)'; nctx.strokeText(String(pos), x, y);
      nctx.fillStyle = 'rgba(92,45,10,0.95)'; nctx.fillText(String(pos), x, y);
    }
  }
}

// ======================================================
// ENGINE EFEK (satu loop requestAnimationFrame: tween, partikel, pion, ular)
// ======================================================
const fx = { running: false, last: 0, time: 0, tweens: [], parts: [], rings: [], pawns: {}, inactiveSince: 0 };

const ease = {
  linear: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
};

function snakeTween(dur, onUpdate, easeFn) {
  return new Promise(res => {
    const tw = { start: performance.now(), dur: Math.max(1, dur * SNAKE_SPEED), onUpdate, ease: easeFn || ease.linear, done: false };
    tw.finish = () => {
      if (tw.done) return;
      tw.done = true; clearTimeout(tw.timer);
      const i = fx.tweens.indexOf(tw); if (i >= 0) fx.tweens.splice(i, 1);
      try { onUpdate(1); } catch (e) {}
      res();
    };
    tw.timer = setTimeout(tw.finish, tw.dur + 160);        // cadangan kalau tab di background (rAF berhenti)
    fx.tweens.push(tw);
    snakeKick();
  });
}
const snakeWait = ms => snakeTween(ms, () => {});
const snakeSleep = ms => new Promise(r => setTimeout(r, ms));

function snakeKick() {
  if (fx.running) return;
  fx.running = true; fx.last = performance.now(); fx.inactiveSince = 0;
  requestAnimationFrame(snakeFrame);
}

function snakePawn(key) {
  return fx.pawns[key] || (fx.pawns[key] = { x: 0, y: 0, z: 0, sx: 1, sy: 1, tx: 0, ty: 0, pos: 1, own: false, init: false });
}
function snakeIndexOf(key) {
  return currentGameState && currentGameState.players ? Math.max(0, Object.keys(currentGameState.players).indexOf(key)) : 0;
}

// ---- partikel ----
function snakeEmit(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    if (fx.parts.length > 420) fx.parts.shift();
    const a = (o.dir !== undefined ? o.dir + (Math.random() - 0.5) * (o.spread || 1) : Math.random() * Math.PI * 2);
    const sp = (o.speed || 60) * (0.4 + Math.random() * 0.8);
    fx.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g || 0, drag: o.drag || 0,
      life: 0, max: (o.life || 0.6) * (0.7 + Math.random() * 0.6), size: (o.size || 4) * (0.6 + Math.random() * 0.8),
      color: Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : (o.color || '#fff'),
      shape: o.shape || 'circle', rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12
    });
  }
  snakeKick();
}
function snakeRing(x, y, r0, r1, color, life, lw) {
  fx.rings.push({ x, y, r0, r1, color, life: 0, max: (life || 0.45), lw: lw || 4 });
  snakeKick();
}
function snakeDust(x, y) {
  snakeEmit(x, y, 5, { speed: 55, g: 90, life: 0.38, size: 3.4, color: 'rgba(255,248,225,1)', dir: -Math.PI / 2, spread: 2.6 });
}
function snakeConfetti() {
  const cols = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7', '#f97316', '#ec4899', '#ffffff'];
  const burst = (x, y, n) => {
    snakeEmit(x, y, n, { speed: 330, g: 420, drag: 0.8, life: 1.9, size: 8, color: cols, shape: 'rect', dir: -Math.PI / 2, spread: 2.2 });
    snakeEmit(x, y, Math.round(n / 3), { speed: 200, life: 0.9, size: 7, color: ['#fde047', '#fff'], shape: 'spark' });
    snakeRing(x, y, 10, 90, 'rgba(250,204,21,.9)', 0.6, 5);
  };
  const c = getTileCenter(100);
  burst(c.x, c.y, 60);
  setTimeout(() => burst(180 + Math.random() * 440, 320, 36), 260);
  setTimeout(() => burst(180 + Math.random() * 440, 300, 36), 520);
  playSnakeWinSound();
}

// ---- efek papan (kocok & kilat) ----
function snakeBoardShake() {
  const area = document.getElementById('snakeBoardArea');
  if (!area || !area.animate || SNAKE_SPEED < 1) return;
  area.animate([
    { transform: 'translate(0,0)' }, { transform: 'translate(-6px,3px) rotate(-.4deg)' }, { transform: 'translate(5px,-3px) rotate(.3deg)' },
    { transform: 'translate(-4px,2px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(0,0)' }
  ], { duration: 420, easing: 'ease-out' });
}
function snakeBoardFlash(rgba) {
  const area = document.getElementById('snakeBoardArea');
  if (!area || !area.animate) return;
  const f = document.createElement('div');
  f.className = 'snake-flash';
  f.style.background = 'radial-gradient(circle at 50% 50%, ' + rgba + ', transparent 70%)';
  area.appendChild(f);
  const a = f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  a.onfinish = () => f.remove();
}

// ---- gambar pion ----
function snakeDrawPawn(ctx, p, color, label, isTurn, time, i) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  const lift = Math.max(0, p.z + (isTurn && !p.own ? pulse * 4 : 0));
  const shr = Math.max(0.45, 1 - lift / 120);
  ctx.save();
  if (isTurn) {                                       // lingkaran sorot giliran (berdenyut)
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 27 + pulse * 3, 12 + pulse * 1.5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(250,204,21,' + (0.65 + pulse * 0.35).toFixed(2) + ')'; ctx.lineWidth = 3.5;
    ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10 + pulse * 8; ctx.stroke(); ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 0.42 * (0.45 + 0.55 * shr);       // bayangan mengecil saat pion melompat
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 14, 18 * shr, 8 * shr, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.translate(p.x, p.y - lift + 22); ctx.scale(p.sx, p.sy); ctx.translate(0, -22);   // squash & stretch dari dasar pion
  const gr = ctx.createRadialGradient(-6, -8, 2, 0, 0, 22);
  gr.addColorStop(0, color.light); gr.addColorStop(0.4, color.main); gr.addColorStop(1, color.dark);
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fillStyle = gr; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';             // kilau
  ctx.beginPath(); ctx.ellipse(-7, -10, 7, 4, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 14px "Space Grotesk", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function snakeDrawStar(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.18, -r * 0.18, r, 0); ctx.quadraticCurveTo(r * 0.18, r * 0.18, 0, r);
  ctx.quadraticCurveTo(-r * 0.18, r * 0.18, -r, 0); ctx.quadraticCurveTo(-r * 0.18, -r * 0.18, 0, -r);
  ctx.fill();
}

// ---- loop utama ----
function snakeFrame(now) {
  const screen = document.getElementById('snakeScreen');
  if (!screen || !screen.classList.contains('active')) {
    if (!fx.inactiveSince) fx.inactiveSince = now;
    if (now - fx.inactiveSince > 1000) { fx.running = false; return; }   // berhenti kalau layar sudah ditutup
    fx.last = now; requestAnimationFrame(snakeFrame); return;
  }
  fx.inactiveSince = 0;
  const dt = Math.min(0.05, Math.max(0, (now - fx.last) / 1000));
  fx.last = now; fx.time = now / 1000;
  const pn = performance.now();

  fx.tweens.slice().forEach(tw => {
    if (tw.done) return;
    const pr = Math.min(1, (pn - tw.start) / tw.dur);
    try { tw.onUpdate(tw.ease(pr)); } catch (e) {}
    if (pr >= 1) tw.finish();
  });

  // pion yang tidak sedang dianimasikan meluncur halus ke target
  const k = 1 - Math.exp(-dt * 16);
  Object.keys(fx.pawns).forEach(key => {
    const p = fx.pawns[key];
    if (p.own) return;
    p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    p.z += (0 - p.z) * k; p.sx += (1 - p.sx) * k; p.sy += (1 - p.sy) * k;
  });

  // partikel & ring
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const q = fx.parts[i];
    q.life += dt;
    if (q.life >= q.max) { fx.parts.splice(i, 1); continue; }
    if (q.drag) { const d = Math.max(0, 1 - q.drag * dt); q.vx *= d; q.vy *= d; }
    q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
  }
  for (let i = fx.rings.length - 1; i >= 0; i--) { fx.rings[i].life += dt; if (fx.rings[i].life >= fx.rings[i].max) fx.rings.splice(i, 1); }

  // ---- gambar ular ----
  const av = document.getElementById('snakeAnimCanvas');
  const actx = av && av.getContext('2d');
  if (actx) { actx.clearRect(0, 0, 800, 800); snakeGeom().forEach(g => snakeDrawSnake(actx, g, fx.time)); }

  // ---- gambar pion + efek ----
  const ctx = getCanvasContext();
  if (ctx) {
    ctx.clearRect(0, 0, 800, 800);
    fx.rings.forEach(r => {
      const t = r.life / r.max, e = 1 - Math.pow(1 - t, 3);
      ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = r.color; ctx.lineWidth = r.lw * (1 - t * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
    const data = currentGameState;
    if (data && data.players) {
      const keys = Object.keys(data.players), turnKey = keys[data.turnIndex];
      const order = keys.map((key, i) => ({ key, i, p: fx.pawns[key] })).filter(o => o.p && o.p.init)
        .sort((a, b) => (a.p.own - b.p.own) || ((a.p.y - a.p.z * 0.2) - (b.p.y - b.p.z * 0.2)));
      order.forEach(o => snakeDrawPawn(ctx, o.p, PLAYER_COLORS[o.i % PLAYER_COLORS.length], o.key.toUpperCase(),
        o.key === turnKey && data.status !== 'ended', fx.time, o.i));
    }
    fx.parts.forEach(q => {
      const t = q.life / q.max;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t * t); ctx.fillStyle = q.color;
      ctx.translate(q.x, q.y); ctx.rotate(q.rot);
      if (q.shape === 'rect') ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
      else if (q.shape === 'spark') snakeDrawStar(ctx, q.size * (1 - t * 0.5));
      else { ctx.beginPath(); ctx.arc(0, 0, q.size * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
  }
  requestAnimationFrame(snakeFrame);
}

// Dipanggil setiap data/posisi berubah: hanya memperbarui TARGET pion; loop yang menggambar.
function drawCanvasState() {
  const data = currentGameState;
  if (data && data.players) {
    Object.keys(data.players).forEach((key, i) => {
      const p = snakePawn(key);
      const pos = localVisualPositions[key] || data.players[key].pos || 1;
      const c = getBoardCoordinates(pos, i);
      if (!p.init) { p.x = p.tx = c.x; p.y = p.ty = c.y; p.init = true; p.pos = pos; }
      else if (!p.own && pos < p.pos) snakeFlyBack(key, i, pos);     // terinjak -> terlempar kembali
      p.tx = c.x; p.ty = c.y; p.pos = pos;
    });
  }
  snakeKick();
}

function getCanvasContext() {
  const canvas = document.getElementById('snakeCanvas');
  return canvas ? canvas.getContext('2d') : null;
}

// ---------------------- Toast di papan (bertumpuk, tidak memblokir layar) ----------------------
function snakeToast(text) {
  const area = document.getElementById('snakeBoardArea');
  if (!area) return;
  let box = document.getElementById('snakeToastBox');
  if (!box) { box = document.createElement('div'); box.id = 'snakeToastBox'; box.className = 'snake-toast-box'; area.appendChild(box); }
  while (box.children.length >= 3) box.removeChild(box.firstChild);
  const t = document.createElement('div');
  t.className = 'snake-toast'; t.textContent = text;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 2000);
}

// ======================================================
// ANIMASI GERAK (dipakai pemain sendiri & pemain lain)
// ======================================================
// Lompat satu kotak: busur parabola + squash & stretch + debu saat mendarat
async function snakeHop(key, idx, from, to) {
  const p = snakePawn(key);
  const A = getBoardCoordinates(from, idx), B = getBoardCoordinates(to, idx);
  await snakeTween(230, t => {
    const e = ease.inOutSine(t);
    p.x = A.x + (B.x - A.x) * e; p.y = A.y + (B.y - A.y) * e;
    p.z = Math.sin(Math.PI * t) * 30;
    if (t < 0.85) { const s = Math.sin(Math.PI * t / 0.85); p.sy = 1 + 0.16 * s; p.sx = 1 - 0.09 * s; }
    else { const s = Math.sin(Math.PI * (t - 0.85) / 0.15); p.sy = 1 - 0.2 * s; p.sx = 1 + 0.12 * s; }
  });
  p.z = 0; p.sx = 1; p.sy = 1;
  snakeDust(B.x, B.y + 16);
  playSnakeStepSound();
}

// Naik tangga: meluncur lurus sambil berkilau
function snakeClimb(key, ev) {
  const p = snakePawn(key);
  const A = getTileCenter(ev.start), B = getTileCenter(ev.end);
  const x0 = p.x, y0 = p.y;
  const dur = Math.max(700, Math.min(1400, Math.hypot(B.x - A.x, B.y - A.y) * 2.4));
  snakeRing(A.x, A.y, 8, 60, 'rgba(250,204,21,.95)', 0.5, 5);
  return snakeTween(dur, e => {
    const k = Math.min(1, e * 6);
    const tx = A.x + (B.x - A.x) * e, ty = A.y + (B.y - A.y) * e;
    p.x = x0 + (tx - x0) * k; p.y = y0 + (ty - y0) * k;
    p.z = 10 + Math.abs(Math.sin(e * Math.PI * 9)) * 6;
    p.sy = 1 + 0.06 * Math.sin(e * Math.PI * 18);
    if (Math.random() < 0.7) snakeEmit(p.x + (Math.random() - 0.5) * 22, p.y - p.z + 8, 1, { speed: 26, g: -10, life: 0.55, size: 5.5, color: ['#fde047', '#fff', '#fbbf24'], shape: 'spark' });
  }, ease.inOut).then(() => {
    p.z = 0; p.sx = 1; p.sy = 1;
    snakeRing(B.x, B.y, 8, 70, 'rgba(250,204,21,.95)', 0.55, 5);
    snakeEmit(B.x, B.y, 16, { speed: 150, g: 80, life: 0.7, size: 6, color: ['#fde047', '#fff', '#fbbf24'], shape: 'spark' });
    snakeBoardFlash('rgba(250,204,21,.5)');
  });
}

// Termakan ular: meluncur mengikuti badan ular yang meliuk
function snakeSlither(key, ev) {
  const p = snakePawn(key);
  const g = snakeGeom().find(s => s.start === ev.start);
  if (!g) return snakeWait(400);
  const x0 = p.x, y0 = p.y;
  const dur = Math.max(950, Math.min(1800, g.len * 3.2));
  snakeRing(g.head.x, g.head.y, 8, 62, 'rgba(239,68,68,.95)', 0.5, 5);
  snakeBoardShake();
  return snakeTween(dur, e => {
    const pt = snakePointAt(g, e, fx.time), k = Math.min(1, e * 7);
    p.x = x0 + (pt.x - x0) * k; p.y = y0 + (pt.y - y0) * k;
    p.z = 2;
    p.sx = 1 + 0.1 * Math.sin(e * Math.PI * 16); p.sy = 1 - 0.08 * Math.sin(e * Math.PI * 16);
    if (Math.random() < 0.5) snakeEmit(p.x, p.y + 6, 1, { speed: 22, g: 30, life: 0.5, size: 4.5, color: [g.color, 'rgba(0,0,0,.5)'] });
  }, ease.inOutSine).then(() => {
    p.z = 0; p.sx = 1; p.sy = 1;
    snakeRing(g.tail.x, g.tail.y, 6, 44, 'rgba(255,255,255,.7)', 0.4, 4);
  });
}

// Pion yang terinjak terlempar ke START dengan busur tinggi
function snakeFlyBack(key, idx, toPos) {
  const p = snakePawn(key);
  if (p.own) return;
  p.own = true;
  const x0 = p.x, y0 = p.y;
  const col = PLAYER_COLORS[idx % PLAYER_COLORS.length];
  snakeToast('💥 ' + key.toUpperCase() + ' terinjak! Kembali ke START');
  playSnakeBumpSound();
  snakeRing(x0, y0 + 8, 8, 52, 'rgba(255,255,255,.9)', 0.45, 5);
  snakeEmit(x0, y0, 14, { speed: 170, g: 260, life: 0.6, size: 5.5, color: [col.main, col.light, '#fff'] });
  snakeTween(720, e => {
    const to = getBoardCoordinates(localVisualPositions[key] || toPos, idx);
    p.x = x0 + (to.x - x0) * e; p.y = y0 + (to.y - y0) * e;
    p.z = Math.sin(Math.PI * e) * 90;
    p.sx = 1 + 0.12 * Math.sin(e * Math.PI * 6); p.sy = 1 - 0.1 * Math.sin(e * Math.PI * 6);
  }, ease.inOutSine).then(() => {
    p.z = 0; p.sx = 1; p.sy = 1; p.own = false;
    const to = getBoardCoordinates(localVisualPositions[key] || toPos, idx);
    snakeDust(to.x, to.y + 16); snakeRing(to.x, to.y + 10, 6, 34, 'rgba(255,255,255,.8)', 0.35, 4);
  });
}

async function snakeAnimatePath(pKey, from, landed, to, event) {
  const idx = snakeIndexOf(pKey);
  const p = snakePawn(pKey);
  const s0 = getBoardCoordinates(from, idx);
  p.own = true; p.init = true; p.pos = from;
  p.x = s0.x; p.y = s0.y; p.z = 0; p.sx = 1; p.sy = 1;
  try {
    let cur = from;
    while (cur < landed) {
      await snakeHop(pKey, idx, cur, cur + 1);
      cur++; localVisualPositions[pKey] = cur; p.pos = cur;
    }
    if (event) {
      await snakeWait(200);
      const isLadder = event.end > event.start;
      snakeToast(isLadder ? ('🚀 NAIK TANGGA! ke kotak ' + event.end) : ('😱 TERMAKAN ULAR! jatuh ke kotak ' + event.end));
      playSnakeEventSound(isLadder);
      if (isLadder) await snakeClimb(pKey, event); else await snakeSlither(pKey, event);
      await snakeWait(120);
    }
    localVisualPositions[pKey] = to; p.pos = to;
    const fin = getBoardCoordinates(to, idx), fx0 = p.x, fy0 = p.y;
    await snakeTween(170, e => { p.x = fx0 + (fin.x - fx0) * e; p.y = fy0 + (fin.y - fy0) * e; }, ease.out);
    p.tx = fin.x; p.ty = fin.y;
  } finally {
    p.own = false; p.z = 0; p.sx = 1; p.sy = 1;
  }
  if (to >= 100) snakeConfetti();
  drawCanvasState();
}

// Kocokan dadu: bergoyang, wajah berganti makin lambat, lalu "pop" saat berhenti
async function snakeDiceTumble(dice, total) {
  const box = document.getElementById('snakeDiceBox');
  if (!box) return;
  total = total * SNAKE_SPEED;
  box.classList.remove('six');
  if (box.animate) {
    box.animate([
      { transform: 'rotate(0deg) scale(1) translateY(0)' },
      { transform: 'rotate(-28deg) scale(1.38) translateY(-16px)', offset: 0.22 },
      { transform: 'rotate(34deg) scale(1.3) translateY(-4px)', offset: 0.5 },
      { transform: 'rotate(-14deg) scale(1.18) translateY(-8px)', offset: 0.75 },
      { transform: 'rotate(0deg) scale(1.1) translateY(0)' }
    ], { duration: total, easing: 'ease-in-out' });
  }
  const t0 = performance.now();
  let delay = 45;
  while (performance.now() - t0 < total) {
    box.textContent = Math.floor(Math.random() * 6) + 1;
    playSnakeDiceTick();
    await snakeSleep(delay);
    delay = Math.min(150, delay * 1.14);
  }
  box.textContent = dice;
  box.classList.toggle('six', dice === 6);
  if (box.animate) box.animate([{ transform: 'scale(1.55) rotate(-8deg)' }, { transform: 'scale(.92) rotate(3deg)', offset: 0.55 }, { transform: 'scale(1) rotate(0deg)' }],
    { duration: 380, easing: 'cubic-bezier(.2,1.4,.4,1)' });
}

async function snakeAnimateRemote(move) {
  snakeRemoteBusy = true;
  try {
    const ev = move.event ? SNAKES_AND_LADDERS.find(s => s.start === move.landed) : null;
    localVisualPositions[move.by] = move.from;
    drawCanvasState();
    await snakeDiceTumble(move.dice, 600);
    await snakeSleep(180);
    await snakeAnimatePath(move.by, move.from, move.landed, move.to, ev);
  } catch (e) { console.error('Snake remote anim error:', e); }
  snakeRemoteBusy = false;
  snakeSyncFromState();
}

function snakeSyncFromState() {
  const data = currentGameState;
  if (!data) return;
  Object.keys(data.players || {}).forEach(k => { localVisualPositions[k] = data.players[k].pos || 1; });
  drawCanvasState();
  updateSnakeControls(data);
}

// ---------------------- ATURAN (satu sumber, dipakai pemain & bot) ----------------------
// Menerapkan lemparan `dice` untuk pemain `key` ke `state` (diubah di tempat).
function snakeComputeRoll(state, key, dice) {
  const keys = Object.keys(state.players);
  const me = state.players[key];
  const from = me.pos || 1;
  let pos = from + dice;
  if (pos > 100) pos = 100;
  const landed = pos;
  const ev = SNAKES_AND_LADDERS.find(s => s.start === pos) || null;
  if (ev) pos = ev.end;

  const bumped = [];
  keys.forEach(k => {
    if (k !== key && state.players[k].pos === pos && pos < 100 && !state.players[k].rank) { state.players[k].pos = 1; bumped.push(k); }
  });
  me.pos = pos;

  let ranked = 0;
  if (pos >= 100 && !me.rank) { ranked = keys.filter(k => state.players[k].rank > 0).length + 1; me.rank = ranked; }

  const finishedCount = keys.filter(k => state.players[k].rank > 0).length;
  let extra = false;
  if (finishedCount >= keys.length - 1) {
    state.status = 'ended';
  } else if (dice === 6 && pos < 100) {
    extra = true;
  } else {
    let n = state.turnIndex || 0;
    do { n = (n + 1) % keys.length; } while (state.players[keys[n]].rank > 0);
    state.turnIndex = n;
  }
  state.lastDice = dice;
  state.isRolling = false;
  state.moveSeq = (state.moveSeq || 0) + 1;
  state.lastMove = { seq: state.moveSeq, by: key, dice, from, landed, to: pos, event: ev ? (ev.end > ev.start ? 'ladder' : 'snake') : null };
  return { from, landed, to: pos, event: ev, bumped, ranked, extra };
}

// ---------------------- Init & sinkronisasi ----------------------
function initSnake() {
  if (!roomRef) return;
  document.getElementById('snakeRoleTag').textContent = myRole.toUpperCase();
  setupPresence('snakeStatus', roomIdGlobal);

  // bersihkan sisa permainan sebelumnya (penyebab tombol macet / pion nyasar)
  isAnimatingLocal = false; snakeRemoteBusy = false; snakeLastSeenSeq = null;
  currentGameState = null; localVisualPositions = {};
  fx.pawns = {}; fx.parts = []; fx.rings = [];
  const resEl = document.getElementById('snakeResult'); if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }

  drawStaticBoard();
  snakeKick();

  snakeRefGlobal = roomRef.child('snake');

  if (myRole === 'p1') {
    const maxP = window.snakeSelectedMaxPlayers || 2;
    const initPlayers = {};
    for (let i = 1; i <= maxP; i++) initPlayers['p' + i] = { pos: 1, rank: 0 };
    // transaction (bukan get()) supaya tidak error "Client is offline" & tidak menimpa data yang sudah ada
    snakeRefGlobal.transaction(cur => cur || {
      maxPlayers: maxP, turnIndex: 0, isRolling: false, lastDice: 1, status: 'playing', players: initPlayers, moveSeq: 0, lastMove: null
    });
  }

  if (snakeUnsub) {
    snakeRefGlobal.off('value', snakeUnsub);
    snakeUnsub = null;
  }

  snakeUnsub = snakeRefGlobal.on('value', snap => {
    const data = snap.val();
    if (!data || !data.players) return;

    const prevState = currentGameState;
    currentGameState = data;
    const lm = data.lastMove || null;
    const seq = lm ? lm.seq : 0;

    if (snakeLastSeenSeq === null) {                 // snapshot pertama: langsung tampil, tanpa animasi
      snakeLastSeenSeq = seq;
      snakeSyncFromState();
      return;
    }

    if (isAnimatingLocal || snakeRemoteBusy) return; // sedang animasi; hasil akhir disinkron setelah selesai

    if (lm && seq !== snakeLastSeenSeq) {
      snakeLastSeenSeq = seq;
      if (lm.by !== myRole && prevState && prevState.players && prevState.players[lm.by]) {
        // animasikan gerakan pemain lain; kenaikan data (mis. korban terinjak) disinkron di akhir
        snakeAnimateRemote(lm);
        updateSnakeControls(data);
        return;
      }
    }
    snakeSyncFromState();
  });
}

function updateSnakeControls(data) {
  const playerKeys = Object.keys(data.players || {});
  const currentTurnKey = playerKeys[data.turnIndex];
  const btnRoll = document.getElementById('snakeBtnRoll');
  const diceBox = document.getElementById('snakeDiceBox');
  if (!btnRoll || !diceBox) return;

  diceBox.classList.remove('rolling');
  diceBox.textContent = data.lastDice || 1;

  const listWrap = document.getElementById('snakePlayersList');
  if (listWrap) {
    listWrap.innerHTML = '';
    playerKeys.forEach((pKey, i) => {
      const pData = data.players[pKey];
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const isTurn = pKey === currentTurnKey && data.status !== 'ended';
      const chip = document.createElement('div');
      chip.style.cssText = 'background: var(--panel-2); border: 1px solid ' + (isTurn ? '#facc15' : 'var(--line)') + ';' +
        'padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px;' +
        (isTurn ? 'box-shadow: 0 0 10px rgba(250,204,21,.5);' : '');
      const rankText = pData.rank ? ' 🏆 Juara ' + pData.rank : '';
      const me = pKey === myRole ? ' (Kamu)' : '';
      chip.innerHTML = '<span style="width:12px; height:12px; border-radius:50%; background:' + color.main + '; border:1.5px solid #fff;"></span> ' +
        pKey.toUpperCase() + me + ' (Kotak ' + (pData.pos || 1) + ')' + rankText + (isTurn ? ' 🎲' : '');
      listWrap.appendChild(chip);
    });
  }

  const resultEl = document.getElementById('snakeResult');
  if (data.status === 'ended') {
    btnRoll.disabled = true;
    if (resultEl) {
      const ranked = playerKeys.filter(k => data.players[k].rank > 0).sort((a, b) => data.players[a].rank - data.players[b].rank);
      const last = playerKeys.filter(k => !(data.players[k].rank > 0));
      const medals = ['🥇', '🥈', '🥉'];
      let html = '🎉 Pertandingan Selesai!';
      ranked.forEach((k, i) => { html += '<br>' + (medals[i] || '🏅') + ' Juara ' + (i + 1) + ': ' + k.toUpperCase() + (k === myRole ? ' (Kamu)' : ''); });
      last.forEach(k => { html += '<br>💀 Terakhir: ' + k.toUpperCase() + (k === myRole ? ' (Kamu)' : ''); });
      resultEl.style.display = 'block'; resultEl.innerHTML = html;
    }
    return;
  }
  if (resultEl) resultEl.style.display = 'none';

  btnRoll.disabled = !(myRole === currentTurnKey && !isAnimatingLocal && !snakeRemoteBusy);
  btnRoll.classList.add('snake-pulse');
}

// ---------------------- Lempar dadu ----------------------
document.getElementById('snakeBtnRoll').onclick = async () => {
  if (!snakeRefGlobal || isAnimatingLocal || snakeRemoteBusy) return;
  const data = currentGameState;
  if (!data || !data.players || data.status === 'ended') return;

  const playerKeys = Object.keys(data.players);
  if (playerKeys[data.turnIndex] !== myRole || !data.players[myRole]) return;

  getSnakeAudioContext();
  isAnimatingLocal = true;
  const btnRoll = document.getElementById('snakeBtnRoll');
  btnRoll.disabled = true;

  try {
    const dice = Math.floor(Math.random() * 6) + 1;
    await snakeDiceTumble(dice, 900);
    await snakeSleep(300);

    // hitung hasil di salinan untuk animasi
    const preview = JSON.parse(JSON.stringify(data));
    const r = snakeComputeRoll(preview, myRole, dice);
    await snakeAnimatePath(myRole, r.from, r.landed, r.to, r.event);

    // tulis hasil secara atomik terhadap data TERBARU
    let committed = null;
    await snakeRefGlobal.transaction(cur => {
      if (!cur || !cur.players || cur.status === 'ended') return cur;
      const keys = Object.keys(cur.players);
      if (keys[cur.turnIndex] !== myRole) return cur;           // giliran sudah berubah -> batal
      const state = JSON.parse(JSON.stringify(cur));
      committed = snakeComputeRoll(state, myRole, dice);
      return state;
    });

    if (committed) {
      snakeLastSeenSeq = (currentGameState && currentGameState.lastMove) ? currentGameState.lastMove.seq : snakeLastSeenSeq;
      if (committed.ranked) snakeToast('🏆 ' + myRole.toUpperCase() + ' finis sebagai Juara ' + committed.ranked + '!');
      else if (committed.extra) snakeToast('🎲 HOKI! Dadu 6, lempar lagi!');
    }
  } catch (e) {
    console.error('Snake roll error:', e);
  } finally {
    isAnimatingLocal = false;
    snakeSyncFromState();
  }
};

// ---------------------- Keluar ----------------------
document.getElementById('btnSnakeBack').onclick = () => {
  if (snakeRefGlobal && snakeUnsub) {
    snakeRefGlobal.off('value', snakeUnsub);
    snakeUnsub = null;
  }
  isAnimatingLocal = false; snakeRemoteBusy = false; snakeLastSeenSeq = null;
  currentGameState = null; localVisualPositions = {};
  fx.pawns = {}; fx.parts = []; fx.rings = [];

  if (typeof cleanupBotListeners === 'function') cleanupBotListeners();

  if (activePresenceRef) {
    activePresenceRef.remove();
    activePresenceRef = null;
  }

  if (roomRef && myRole === 'p1') {
    roomRef.child('snake').remove().catch(() => {});
    if (roomIdGlobal) {
      dbRoot.ref('publicRooms/' + roomIdGlobal).remove().catch(() => {});
    }
  }

  clearSession();
  hideRoomBadge();
  currentGame = null;
  myRole = null;
  roomIdGlobal = null;
  roomRef = null;

  showScreen('startScreen');
};
