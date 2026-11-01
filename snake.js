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

// ---------------------- Gambar papan (sekali) ----------------------
function snakeEnsureBoardCanvas() {
  const area = document.getElementById('snakeBoardArea');
  if (!area) return null;
  const img = document.getElementById('snakeBoardBg');
  if (img) img.style.display = 'none';                 // gambar luar dimatikan (sumber ketidakcocokan & error)
  let cv = document.getElementById('snakeBoardCanvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.id = 'snakeBoardCanvas'; cv.width = 800; cv.height = 800;
    cv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; display:block; z-index:1;';
    area.insertBefore(cv, area.firstChild);
  }
  return cv;
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

function snakeDrawSnake(ctx, head, tail, color, seed) {
  const dx = tail.x - head.x, dy = tail.y - head.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const waves = Math.max(1.2, len / 150), amp = 15;
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const taper = Math.sin(Math.min(1, t * 6) * Math.PI / 2);          // dekat kepala tidak melenceng
    const off = Math.sin(t * Math.PI * 2 * waves + seed) * amp * taper;
    pts.push({ x: head.x + dx * t + nx * off, y: head.y + dy * t + ny * off, t });
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (w, style, fromT) => {
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
    let started = false;
    pts.forEach(p => { if (p.t < (fromT || 0)) return; if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); });
    ctx.stroke();
  };
  stroke(20, 'rgba(0,0,0,0.30)');                      // bayangan
  stroke(18, '#111827');                               // garis tepi
  stroke(14, color);                                   // badan
  stroke(5, 'rgba(255,255,255,0.35)');                 // kilau
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
  ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5;                              // lidah
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(29, 0); ctx.lineTo(33, -4); ctx.moveTo(29, 0); ctx.lineTo(33, 4); ctx.stroke();
  [-6, 6].forEach(oy => {                                                         // mata
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, oy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(9.5, oy, 2.2, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

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
    ctx.fillStyle = pos === 100 ? '#facc15' : pos === 1 ? '#86efac' : (light ? '#fef3c7' : '#fde68a');
    ctx.fillRect(x, y, SNAKE_TILE, SNAKE_TILE);
    ctx.strokeStyle = 'rgba(120,53,15,0.35)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, SNAKE_TILE - 1.5, SNAKE_TILE - 1.5);
  }
  ctx.fillStyle = '#166534'; ctx.font = '800 13px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('START', getTileCenter(1).x, getTileCenter(1).y + SNAKE_TILE / 2 - 4);
  ctx.fillStyle = '#854d0e';
  ctx.fillText('FINISH', getTileCenter(100).x, getTileCenter(100).y + SNAKE_TILE / 2 - 4);

  // tangga dulu, ular di atasnya
  SNAKES_AND_LADDERS.filter(s => s.end > s.start).forEach(s => snakeDrawLadder(ctx, getTileCenter(s.start), getTileCenter(s.end)));
  SNAKES_AND_LADDERS.filter(s => s.end < s.start).forEach((s, i) => snakeDrawSnake(ctx, getTileCenter(s.start), getTileCenter(s.end), SNAKE_BODY_COLORS[i % SNAKE_BODY_COLORS.length], i * 1.7));

  // nomor kotak di lapisan paling atas (dengan halo) supaya selalu terbaca
  ctx.font = '700 15px "Space Grotesk", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  for (let pos = 1; pos <= 100; pos++) {
    const c = getTileCenter(pos), x = c.x - SNAKE_TILE / 2 + 5, y = c.y - SNAKE_TILE / 2 + 4;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,251,235,0.95)'; ctx.strokeText(String(pos), x, y);
    ctx.fillStyle = 'rgba(92,45,10,0.95)'; ctx.fillText(String(pos), x, y);
  }
}

// ---------------------- Gambar pion ----------------------
function getCanvasContext() {
  const canvas = document.getElementById('snakeCanvas');
  return canvas ? canvas.getContext('2d') : null;
}

function drawCanvasState() {
  const ctx = getCanvasContext();
  if (!ctx) return;

  ctx.clearRect(0, 0, 800, 800);
  if (!currentGameState || !currentGameState.players) return;

  const playerKeys = Object.keys(currentGameState.players);
  const turnKey = playerKeys[currentGameState.turnIndex];

  playerKeys.forEach((pKey, index) => {
    const pos = localVisualPositions[pKey] || currentGameState.players[pKey].pos || 1;
    const coords = getBoardCoordinates(pos, index);
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

    ctx.save();

    if (pKey === turnKey && currentGameState.status !== 'ended') {      // cincin giliran
      ctx.beginPath(); ctx.arc(coords.x, coords.y, 28, 0, Math.PI * 2);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 4; ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(coords.x, coords.y + 14, 18, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(coords.x - 6, coords.y - 8, 2, coords.x, coords.y, 22);
    gradient.addColorStop(0, color.light);
    gradient.addColorStop(0.4, color.main);
    gradient.addColorStop(1, color.dark);

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(pKey.toUpperCase(), coords.x, coords.y + 1);

    ctx.restore();
  });
}

// ---------------------- Toast di papan (tidak memblokir layar) ----------------------
function snakeToast(text) {
  const area = document.getElementById('snakeBoardArea');
  if (!area) return;
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText = 'position:absolute; left:50%; top:10px; transform:translateX(-50%); z-index:10; max-width:92%; text-align:center;' +
    'background:rgba(0,0,0,.82); color:#fff; font-weight:800; font-size:13px; padding:8px 14px; border-radius:20px; border:1px solid #facc15; pointer-events:none;';
  area.appendChild(t);
  setTimeout(() => t.remove(), 1900);
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

// ---------------------- Animasi (dipakai pemain sendiri & pemain lain) ----------------------
const snakeSleep = ms => new Promise(r => setTimeout(r, ms));

async function snakeAnimatePath(pKey, from, landed, to, event) {
  let cur = from;
  while (cur < landed) {
    cur++;
    localVisualPositions[pKey] = cur;
    drawCanvasState();
    playSnakeStepSound();
    await snakeSleep(240);
  }
  if (event) {
    await snakeSleep(220);
    const isLadder = event.end > event.start;
    snakeToast(isLadder ? ('🚀 NAIK TANGGA! ke kotak ' + event.end) : ('😱 TERMAKAN ULAR! jatuh ke kotak ' + event.end));
    playSnakeEventSound(isLadder);
    localVisualPositions[pKey] = to;
    drawCanvasState();
    await snakeSleep(650);
  }
  localVisualPositions[pKey] = to;
  drawCanvasState();
}

async function snakeAnimateRemote(move) {
  snakeRemoteBusy = true;
  try {
    const ev = move.event ? SNAKES_AND_LADDERS.find(s => s.start === move.landed) : null;
    localVisualPositions[move.by] = move.from;
    drawCanvasState();
    await snakeSleep(200);
    await snakeAnimatePath(move.by, move.from, move.landed, move.to, ev);
  } catch (e) {}
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

// ---------------------- Init & sinkronisasi ----------------------
function initSnake() {
  if (!roomRef) return;
  document.getElementById('snakeRoleTag').textContent = myRole.toUpperCase();
  setupPresence('snakeStatus', roomIdGlobal);

  // bersihkan sisa permainan sebelumnya (penyebab tombol macet / pion nyasar)
  isAnimatingLocal = false; snakeRemoteBusy = false; snakeLastSeenSeq = null;
  currentGameState = null; localVisualPositions = {};
  const resEl = document.getElementById('snakeResult'); if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }

  drawStaticBoard();
  drawCanvasState();

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
    const diceBox = document.getElementById('snakeDiceBox');
    diceBox.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
    diceBox.style.transform = 'scale(1.4) rotate(15deg)';
    diceBox.style.boxShadow = '0 10px 25px rgba(232, 172, 31, 0.6)';

    const startTime = Date.now(), duration = 900;
    const rollInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      diceBox.style.transform = 'scale(' + (1.4 - progress * 0.4) + ') rotate(' + Math.floor(Math.random() * 360) + 'deg)';
      diceBox.textContent = Math.floor(Math.random() * 6) + 1;
      if (elapsed >= duration) clearInterval(rollInterval);
    }, 60);
    await snakeSleep(duration);
    clearInterval(rollInterval);

    diceBox.style.transform = 'scale(1) rotate(0deg)';
    diceBox.style.boxShadow = '0 6px 14px rgba(0,0,0,0.4)';

    const dice = Math.floor(Math.random() * 6) + 1;
    diceBox.textContent = dice;
    await snakeSleep(350);

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
      if (committed.bumped.length) snakeToast('💥 ' + myRole.toUpperCase() + ' menginjak ' + committed.bumped.map(k => k.toUpperCase()).join(', ') + '! Kembali ke START');
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
