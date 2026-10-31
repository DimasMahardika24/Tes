// ======================================================
// Catur.js — Smooth Diffing Engine + Pro FX (Fixed)
// Perbaikan: animasi/efek makan bidak sekarang tepat di kotak tujuan
// ======================================================

const pieceUnicode = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let chessBoardState, chessTurn, chessSelected = null, chessFlipped = false, myChessColor, chessGameOver = false;
let chessCastling, chessEP, chessHalfmove = 0;
let chessClocks = null;
let chessTurnStartAt = null;
let chessClockInterval = null;
let chessPendingPromotion = null;

let prevChessBoard = null;
let chessLastMove = null;
let chessAudioCtx = null;
let chessHistory = [];
let chessHistOpen = false;

// ======================================================
// CSS ANIMASI & EFEK (diinjeksi, menimpa rule lama di index.html)
// ======================================================
const styleEl = document.createElement('style');
styleEl.innerHTML = `
  /* ---------- Bidak ---------- */
  .piece-wrapper { transition: transform 0.36s cubic-bezier(0.3, 0.75, 0.25, 1); z-index: 10; }
  #chessPiecesLayer.no-anim .piece-wrapper { transition: none !important; }
  .piece-wrapper.moving { z-index: 40; }
  .piece-wrapper.moving .piece { animation: pieceHop 0.42s ease-out; }
  .piece-wrapper.striking .piece { animation: pieceStrike 0.42s ease-out; }
  .piece-wrapper.selected { z-index: 50; }
  .piece-wrapper.selected .piece {
    transform: scale(1.15) translateY(-8px);
    filter: drop-shadow(0 10px 12px rgba(0,0,0,0.65));
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.2s ease;
  }
  .piece-wrapper.in-check .piece { animation: kingAlert 0.9s ease-in-out infinite alternate; }
  .piece-wrapper.promoted .piece { animation: piecePromote 0.6s cubic-bezier(0.2, 1.4, 0.4, 1); }
  .piece-wrapper.defeated .piece {
    animation: none;
    transform: rotate(82deg) translateY(12%) scale(0.92);
    opacity: 0.75;
    filter: drop-shadow(0 0 8px rgba(228,87,79,0.8));
    transition: transform 0.8s cubic-bezier(0.5, 0, 0.7, 1), opacity 0.8s ease, filter 0.8s ease;
  }

  /* FIX UTAMA: rule lama di index.html (animation: pieceDestroy) menimpa transform wrapper
     sehingga bidak yang dimakan loncat ke pojok kiri atas. Dimatikan di sini. */
  .piece-wrapper.capturing { animation: none !important; z-index: 5; pointer-events: none; }
  .piece-wrapper.capturing .piece { animation: pieceShatter 0.5s 0.17s cubic-bezier(0.5, 0, 0.8, 0.3) both; }

  @keyframes pieceHop {
    0%   { transform: scale(1) translateY(0); }
    35%  { transform: scale(1.18) translateY(-9px); filter: drop-shadow(0 12px 10px rgba(0,0,0,0.5)); }
    70%  { transform: scale(0.96) translateY(0); }
    100% { transform: scale(1) translateY(0); }
  }
  @keyframes pieceStrike {
    0%   { transform: scale(1) rotate(0deg); }
    30%  { transform: scale(1.28) translateY(-10px) rotate(-5deg); filter: drop-shadow(0 14px 12px rgba(0,0,0,0.55)); }
    62%  { transform: scale(0.86) translateY(2px) rotate(3deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
  @keyframes pieceShatter {
    0%   { transform: scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
    25%  { transform: scale(1.25) rotate(-12deg); opacity: 1; filter: brightness(2.4); }
    100% { transform: scale(0) rotate(140deg); opacity: 0; filter: brightness(1); }
  }
  @keyframes kingAlert {
    from { filter: drop-shadow(0 0 0 rgba(255,59,48,0)); transform: scale(1); }
    to   { filter: drop-shadow(0 0 12px #ff3b30) brightness(1.15); transform: scale(1.07); }
  }
  @keyframes piecePromote {
    0%   { transform: scale(0.2) rotate(-180deg); filter: brightness(3); opacity: 0.4; }
    60%  { transform: scale(1.35) rotate(10deg); filter: brightness(1.6); opacity: 1; }
    100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
  }

  /* ---------- Kotak (FIX: lingkaran capture ikut offset ke kiri atas) ---------- */
  #chessScreen .cell.capture::after {
    inset: 6%; top: auto; left: auto; width: auto; height: auto;
    transform: none; animation: capturePulse 1.4s ease-in-out infinite;
  }
  @keyframes capturePulse {
    0%, 100% { transform: scale(0.94); opacity: 0.75; }
    50%      { transform: scale(1.04); opacity: 1; }
  }
  #chessScreen .cell.selected {
    background-color: rgba(232,172,31,0.55) !important;
    box-shadow: inset 0 0 0 3px rgba(232,172,31,0.95);
  }

  /* ---------- Layer efek (selalu tepat di kotak tujuan) ---------- */
  #chessFxLayer { position: absolute; inset: 0; pointer-events: none; z-index: 30; overflow: hidden; }
  .fx-cell { position: absolute; width: 12.5%; height: 12.5%; pointer-events: none; }

  .fx-flash {
    position: absolute; inset: -20%; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,236,160,0.95) 0%, rgba(228,87,79,0.55) 42%, transparent 70%);
    animation: fxFlash 0.45s ease-out forwards;
  }
  @keyframes fxFlash { 0% { opacity: 0; transform: scale(0.3); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(1.7); } }

  .fx-ring {
    position: absolute; inset: 0; border-radius: 50%; box-sizing: border-box;
    border: 4px solid #ffd36b; opacity: 0;
    animation: fxRing 0.55s ease-out forwards;
  }
  .fx-ring.second { animation-delay: 0.09s; border-color: #e4574f; }
  @keyframes fxRing {
    0%   { transform: scale(0.3); opacity: 1; border-width: 6px; }
    100% { transform: scale(2.4); opacity: 0; border-width: 1px; }
  }

  .fx-spark {
    position: absolute; left: 50%; top: 50%;
    animation: fxSpark 0.65s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
  }
  @keyframes fxSpark {
    0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)) scale(0); opacity: 0; }
  }

  .fx-dust {
    position: absolute; inset: 18%; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.6);
    animation: fxDust 0.5s ease-out forwards;
  }
  @keyframes fxDust {
    0%   { transform: scale(0.4); opacity: 0.9; }
    100% { transform: scale(1.5); opacity: 0; }
  }

  /* ---------- Riwayat langkah ---------- */
  #chessScreen .chess-hist-btn.on { background: var(--gold); color: #1a1a1a; }
  #chessScreen .chess-hist-panel {
    position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px; z-index: 45; display: none; overflow-y: auto;
    background: rgba(20,14,12,.97); border: 1px solid rgba(232,172,31,.6); border-radius: 12px; padding: 8px 10px;
    box-shadow: 0 10px 26px rgba(0,0,0,.6); -webkit-overflow-scrolling: touch;
  }
  #chessScreen .ch-title { font-size: 12px; font-weight: 800; color: var(--gold); margin-bottom: 6px; display: flex; justify-content: space-between; }
  #chessScreen .ch-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.07); }
  #chessScreen .ch-no { flex: 0 0 26px; font-size: 11px; color: var(--ink-dim); text-align: right; }
  #chessScreen .ch-who { flex: 0 0 48px; font-size: 12px; font-weight: 800; color: var(--ink-dim); }
  #chessScreen .ch-row.me .ch-who { color: var(--gold); }
  #chessScreen .ch-piece { flex: 0 0 26px; font-size: 22px; line-height: 1; text-align: center; }
  #chessScreen .ch-piece.white { color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
  #chessScreen .ch-piece.black { color: #222; text-shadow: 0 0 2px rgba(255,255,255,.55); }
  #chessScreen .ch-mv { flex: 1; font-size: 13px; font-weight: 700; color: #fff; }
  #chessScreen .ch-tag { font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
  #chessScreen .ch-tag.cap { background: #e4574f; color: #fff; }
  #chessScreen .ch-tag.chk { background: #ffb02e; color: #1a1a1a; }
  #chessScreen .ch-tag.mate { background: #ff3b30; color: #fff; }
  #chessScreen .ch-tag.sp { background: #3d6bf0; color: #fff; }
  #chessScreen .ch-empty { font-size: 12px; color: var(--ink-dim); padding: 6px 0; }

  #chessWrapper.shake { animation: boardShake 0.3s ease-in-out; }
  @keyframes boardShake {
    0%, 100% { transform: translate(0, 0); }
    20% { transform: translate(-3px, 2px); }
    40% { transform: translate(3px, -2px); }
    60% { transform: translate(-2px, -1px); }
    80% { transform: translate(2px, 1px); }
  }
`;
document.head.appendChild(styleEl);

const CHESS_REASON_TEXT = {
  checkmate: 'Skakmat', stalemate: 'Remis — Stalemate (buntu, tak ada langkah legal)',
  insufficient: 'Remis — Materi tidak cukup untuk skakmat', threefold: 'Remis — Posisi berulang 3 kali',
  fifty: 'Remis — Aturan 50 langkah', timeout: 'Waktu habis'
};

// ======================================================
// SOUND ENGINE
// ======================================================
function getChessAudioContext() {
  if (!chessAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) chessAudioCtx = new AudioContextClass();
  }
  if (chessAudioCtx && chessAudioCtx.state === 'suspended') chessAudioCtx.resume();
  return chessAudioCtx;
}

function chessTone(ctx, o) {
  const t0 = ctx.currentTime + (o.delay || 0);
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f1, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
  gain.gain.setValueAtTime(o.vol || 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + o.dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + o.dur + 0.02);
}

function playChessSound(type) {
  try {
    const ctx = getChessAudioContext();
    if (!ctx) return;
    if (type === 'move') {
      chessTone(ctx, { type: 'sine', f1: 320, f2: 170, dur: 0.1, vol: 0.22 });
    } else if (type === 'capture') {
      chessTone(ctx, { type: 'triangle', f1: 170, f2: 40, dur: 0.24, vol: 0.34 });
      chessTone(ctx, { type: 'square', f1: 900, f2: 200, dur: 0.06, vol: 0.07 });
    } else if (type === 'check') {
      chessTone(ctx, { type: 'sawtooth', f1: 620, f2: 820, dur: 0.12, vol: 0.09, delay: 0.1 });
      chessTone(ctx, { type: 'sawtooth', f1: 820, f2: 620, dur: 0.14, vol: 0.09, delay: 0.22 });
    } else if (type === 'promote') {
      [523, 659, 784, 1047].forEach((f, i) => chessTone(ctx, { type: 'sine', f1: f, dur: 0.16, vol: 0.16, delay: 0.1 + i * 0.07 }));
    } else if (type === 'gameover') {
      chessTone(ctx, { type: 'triangle', f1: 330, f2: 90, dur: 0.6, vol: 0.3 });
    }
  } catch (e) {}
}

// ======================================================
// CORE LOGIC CATUR
// ======================================================
function chessColorOf(p){ if(!p) return null; return p === p.toUpperCase() ? 'w' : 'b'; }

function chessStartingState(){
  return {
    board: [
      ['r','n','b','q','k','b','n','r'], ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''], ['','','','','','','',''],
      ['','','','','','','',''], ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'], ['R','N','B','Q','K','B','N','R']
    ],
    turn: 'w', castling: { wK:true, wQ:true, bK:true, bQ:true }, ep: null, halfmove: 0,
    clocks: chessTimeControl > 0 ? { w: chessTimeControl*1000, b: chessTimeControl*1000 } : null,
    turnStartAt: chessTimeControl > 0 ? Date.now() : null
  };
}

function chessStateToFirebase(st){
  return { board: JSON.stringify(st.board), turn: st.turn, castling: st.castling, ep: st.ep, halfmove: st.halfmove, clocks: st.clocks, turnStartAt: st.turnStartAt };
}

function initChess(){
  myChessColor = myRole === 'p1' ? 'w' : 'b';
  const roleTag = document.getElementById('chessRoleTag');
  if(roleTag) roleTag.textContent = myRole === 'p1' ? 'HOST (Putih)' : 'JOINER (Hitam)';

  chessFlipped = myChessColor === 'b';
  chessSelected = null; chessGameOver = false; chessPendingPromotion = null;
  prevChessBoard = null; chessLastMove = null;
  chessHistory = []; chessHistOpen = false;

  document.getElementById('chessWinOverlay').style.display = 'none';
  hideChessPromoModal();

  const starting = chessStartingState();
  chessBoardState = starting.board; chessTurn = starting.turn; chessCastling = starting.castling;
  chessEP = starting.ep; chessHalfmove = starting.halfmove; chessClocks = starting.clocks;

  buildChessDOM();
  chessDraw();

  if(typeof setupPresence === 'function') setupPresence('chessStatus', roomIdGlobal);

  roomRef.child('state').on('value', (snap) => {
    const data = snap.val();
    if(!data) return;
    const newBoard = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;

    // Update dari Firebase sama persis dengan layar (sisa optimistic update) -> abaikan
    if (prevChessBoard && JSON.stringify(prevChessBoard) === JSON.stringify(newBoard)) {
       chessTurn = data.turn; chessClocks = data.clocks || null; chessTurnStartAt = data.turnStartAt || null;
       return;
    }

    chessBoardState = newBoard;
    chessTurn = data.turn; chessCastling = data.castling || { wK:false, wQ:false, bK:false, bQ:false };
    chessEP = data.ep || null; chessHalfmove = data.halfmove || 0; chessClocks = data.clocks || null; chessTurnStartAt = data.turnStartAt || null;
    chessSelected = null;
    chessDraw();
    chessUpdateClockUI();
  });

  roomRef.child('result').on('value', (snap) => {
    const r = snap.val();
    if(r && !chessGameOver){
      chessGameOver = true;
      if(chessClockInterval){ clearInterval(chessClockInterval); chessClockInterval = null; }
      showChessResult(r);
    }
  });

  if(myRole === 'p1'){
    roomRef.child('state').once('value').then(snap => {
      if(!snap.exists()) roomRef.child('state').set(chessStateToFirebase(chessStartingState()));
    });
    roomRef.child('result').remove(); roomRef.child('posCounts').remove();
  }

  if(chessClockInterval) clearInterval(chessClockInterval);
  chessClockInterval = setInterval(chessUpdateClockUI, 250);
}

function buildChessDOM() {
  const sqLayer = document.getElementById('chessSquares');
  sqLayer.innerHTML = '';
  for(let dy=0; dy<8; dy++){
    for(let dx=0; dx<8; dx++){
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((dx + dy) % 2 ? 'dark' : 'light');
      cell.id = `sq-${dx}-${dy}`;
      cell.onpointerdown = (e) => {
        e.preventDefault();
        const bx = chessFlipped ? 7 - dx : dx;
        const by = chessFlipped ? 7 - dy : dy;
        chessHandleClick(bx, by);
      };
      sqLayer.appendChild(cell);
    }
  }
  getChessFxLayer();
  chessHistEnsureUI();
  chessHistRender();
}

// ======================================================
// RIWAYAT LANGKAH (dicatat di sisi klien dari perubahan papan; tidak mengubah data game)
// ======================================================
function chessSqName(x, y){ return 'abcdefgh'[x] + (8 - y); }

function chessHistEnsureUI(){
  const wrapper = document.getElementById('chessWrapper');
  const controls = document.querySelector('#chessScreen .chess-controls');
  if(!wrapper || !controls) return null;
  let btn = document.getElementById('btnChessHist');
  if(!btn){
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'btnChessHist';
    btn.className = 'btn-flip chess-hist-btn'; btn.textContent = '\uD83D\uDCDC Riwayat';
    controls.insertBefore(btn, document.getElementById('btnChessBack'));
    btn.addEventListener('click', e => { e.stopPropagation(); chessHistOpen = !chessHistOpen; chessHistRender(); });
  }
  let panel = document.getElementById('chessHistPanel');
  if(!panel){
    panel = document.createElement('div'); panel.id = 'chessHistPanel'; panel.className = 'chess-hist-panel';
    wrapper.appendChild(panel);
    panel.addEventListener('click', () => { chessHistOpen = false; chessHistRender(); });
  }
  return { btn, panel };
}

function chessHistRender(){
  const ui = chessHistEnsureUI(); if(!ui) return;
  ui.btn.classList.toggle('on', chessHistOpen);
  ui.panel.style.display = chessHistOpen ? 'block' : 'none';
  if(!chessHistOpen) return;

  const oppName = (typeof window !== 'undefined' && window.isBotMode) ? 'Bot' : 'Lawan';
  let html = '<div class="ch-title"><span>\uD83D\uDCDC Riwayat langkah</span><span>ketuk untuk tutup</span></div>';
  if(!chessHistory.length) html += '<div class="ch-empty">Belum ada langkah.</div>';
  chessHistory.slice(-80).reverse().forEach(h => {
    const mine = h.by === myChessColor;
    let mvTxt;
    if(h.castle) mvTxt = h.castle === 'K' ? 'O-O (Rokade pendek)' : 'O-O-O (Rokade panjang)';
    else mvTxt = h.from + ' \u2192 ' + h.to;
    let tags = '';
    if(h.capture) tags += '<span class="ch-tag cap">MAKAN</span>';
    if(h.promo) tags += '<span class="ch-tag sp">PROMOSI ' + pieceUnicode[h.promo] + '</span>';
    if(h.mate) tags += '<span class="ch-tag mate">SKAKMAT</span>';
    else if(h.check) tags += '<span class="ch-tag chk">SKAK</span>';
    html += '<div class="ch-row' + (mine ? ' me' : '') + '"><span class="ch-no">' + h.no + '.</span>' +
      '<span class="ch-who">' + (mine ? 'Kamu' : oppName) + '</span>' +
      '<span class="ch-piece ' + (h.by === 'w' ? 'white' : 'black') + '">' + pieceUnicode[h.piece] + '</span>' +
      '<span class="ch-mv">' + mvTxt + tags + '</span></div>';
  });
  ui.panel.innerHTML = html;
}

// Menyimpulkan langkah dari selisih papan sebelum & sesudah (dipanggil dari chessDraw saat ada 1 langkah)
function chessHistRecord(prev, board){
  try {
    const mover = chessTurn === 'w' ? 'b' : 'w';          // chessTurn sudah giliran berikutnya
    const diffs = [];
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(prev[y][x] !== board[y][x]) diffs.push({x,y,a:prev[y][x],b:board[y][x]});
    const from = diffs.filter(d => d.a && chessColorOf(d.a) === mover);
    const to = diffs.filter(d => d.b && chessColorOf(d.b) === mover);
    if(!from.length || !to.length) return;

    let f, t, castle = null;
    const kf = from.find(d => d.a.toLowerCase() === 'k'), kt = to.find(d => d.b.toLowerCase() === 'k');
    if(kf && kt && Math.abs(kt.x - kf.x) === 2){ f = kf; t = kt; castle = kt.x > kf.x ? 'K' : 'Q'; }
    else {
      t = to[0];
      f = from.find(d => d.a === t.b) || from.find(d => d.a.toLowerCase() === 'p') || from[0];
    }
    const opp = mover === 'w' ? 'b' : 'w';
    const count = (b, col) => b.reduce((n, r) => n + r.filter(p => p && chessColorOf(p) === col).length, 0);
    const capture = count(board, opp) < count(prev, opp);
    const promo = f.a.toLowerCase() === 'p' && t.b !== f.a ? t.b : null;

    const check = chessIsInCheck(board, chessTurn);
    const mate = check && chessAllLegalMoves(board, { castling: chessCastling, ep: chessEP }, chessTurn).length === 0;

    chessHistory.push({
      no: chessHistory.length + 1, by: mover, piece: f.a, from: chessSqName(f.x, f.y), to: chessSqName(t.x, t.y),
      capture, castle, promo, check, mate
    });
    if(chessHistory.length > 200) chessHistory.splice(0, chessHistory.length - 200);
    chessHistRender();
  } catch(e) {}
}

// ======================================================
// LAYER EFEK — posisi dihitung dari koordinat kotak (tidak mungkin nyasar)
// ======================================================
function getChessFxLayer() {
  let l = document.getElementById('chessFxLayer');
  if (!l) {
    const board = document.getElementById('chessBoard');
    if (!board) return null;
    l = document.createElement('div');
    l.id = 'chessFxLayer';
    board.appendChild(l);
  }
  return l;
}

function chessCellFx(bx, by) {
  const fx = getChessFxLayer();
  if (!fx) return null;
  const col = chessFlipped ? 7 - bx : bx;
  const row = chessFlipped ? 7 - by : by;
  const cell = document.createElement('div');
  cell.className = 'fx-cell';
  cell.style.left = (col * 12.5) + '%';
  cell.style.top = (row * 12.5) + '%';
  fx.appendChild(cell);
  return cell;
}

function chessBurst(bx, by, o) {
  o = o || {};
  const cell = chessCellFx(bx, by);
  if (!cell) return;

  const flash = document.createElement('div'); flash.className = 'fx-flash'; cell.appendChild(flash);
  const ring = document.createElement('div'); ring.className = 'fx-ring';
  if (o.ringColor) ring.style.borderColor = o.ringColor;
  cell.appendChild(ring);
  const ring2 = document.createElement('div'); ring2.className = 'fx-ring second'; cell.appendChild(ring2);

  const n = o.count || 14;
  const colors = o.colors || ['#ffd36b', '#e4574f', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'fx-spark';
    const size = 4 + Math.random() * 5;
    const color = colors[i % colors.length];
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = (o.spread || 34) + Math.random() * 30;
    s.style.width = s.style.height = size + 'px';
    s.style.background = color;
    s.style.boxShadow = '0 0 6px ' + color;
    s.style.borderRadius = (i % 3 === 0) ? '2px' : '50%';
    s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    s.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
    s.style.animationDuration = (0.5 + Math.random() * 0.35) + 's';
    cell.appendChild(s);
  }
  setTimeout(() => cell.remove(), 1100);
}

function chessDust(bx, by) {
  const cell = chessCellFx(bx, by);
  if (!cell) return;
  const d = document.createElement('div'); d.className = 'fx-dust'; cell.appendChild(d);
  setTimeout(() => cell.remove(), 600);
}

function chessShake() {
  const w = document.getElementById('chessWrapper');
  if (!w) return;
  w.classList.remove('shake');
  void w.offsetWidth;
  w.classList.add('shake');
  setTimeout(() => w.classList.remove('shake'), 320);
}

// ======================================================
// MESIN RENDER (SMOOTH DIFFING)
// ======================================================
function chessHardRebuild(layer, board) {
  layer.innerHTML = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (board[y][x]) layer.appendChild(createPieceElement(board[y][x], x, y));
  }
}

function chessAnimateDiff(layer, prev, board) {
  // Ambil elemen bidak yang masih hidup, indeks per kotak
  const els = new Map();
  layer.querySelectorAll('.piece-wrapper:not(.capturing)').forEach(el => {
    els.set(el.dataset.x + '-' + el.dataset.y, el);
  });

  // Kotak yang berubah -> asal (source) & tujuan (target)
  const sources = [], targets = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (prev[y][x] === board[y][x]) continue;
    if (prev[y][x]) sources.push({ x, y, p: prev[y][x], used: false });
    if (board[y][x]) targets.push({ x, y, p: board[y][x], src: null, promo: false });
  }

  // Cocokkan tujuan dengan asal: bidak sama dulu, lalu promosi (pion -> bidak lain)
  targets.forEach(t => {
    const s = sources.find(s => !s.used && s.p === t.p);
    if (s) { s.used = true; t.src = s; }
  });
  targets.forEach(t => {
    if (t.src) return;
    const pawn = chessColorOf(t.p) === 'w' ? 'P' : 'p';
    const s = sources.find(s => !s.used && s.p === pawn);
    if (s) { s.used = true; t.src = s; t.promo = true; }
  });

  const capturedList = sources.filter(s => !s.used);
  const isCapture = capturedList.length > 0;
  let movedCount = 0, promoted = false;
  let kingMove = null, firstMove = null;

  // --- Bidak yang bergerak ---
  targets.forEach(t => {
    if (!t.src) { layer.appendChild(createPieceElement(t.p, t.x, t.y)); return; }
    const el = els.get(t.src.x + '-' + t.src.y);
    if (!el) { layer.appendChild(createPieceElement(t.p, t.x, t.y)); return; }
    els.delete(t.src.x + '-' + t.src.y);

    el.dataset.x = t.x;
    el.dataset.y = t.y;
    el.dataset.piece = t.p;
    el.style.transform = getTransformString(t.x, t.y);

    el.classList.remove('moving', 'striking');
    void el.offsetWidth;
    el.classList.add(isCapture ? 'striking' : 'moving', 'moving');
    setTimeout(() => el.classList.remove('moving', 'striking'), 520);

    movedCount++;
    const mv = { x1: t.src.x, y1: t.src.y, x2: t.x, y2: t.y };
    if (!firstMove) firstMove = mv;
    if (t.p.toLowerCase() === 'k') kingMove = mv;

    if (t.promo) {
      promoted = true;
      setTimeout(() => {
        el.innerHTML = `<span class="piece ${chessColorOf(t.p) === 'w' ? 'white' : 'black'}">${pieceUnicode[t.p]}</span>`;
        el.classList.add('promoted');
        setTimeout(() => el.classList.remove('promoted'), 650);
        chessBurst(t.x, t.y, { colors: ['#ffd36b', '#fff3b0', '#ffffff'], ringColor: '#ffd36b', count: 16 });
      }, 300);
    } else if (!isCapture) {
      setTimeout(() => chessDust(t.x, t.y), 260);
    }
  });

  // --- Bidak yang dimakan: efek tepat di kotaknya ---
  capturedList.forEach(cs => {
    const el = els.get(cs.x + '-' + cs.y);
    const isWhite = chessColorOf(cs.p) === 'w';
    const colors = isWhite
      ? ['#ffffff', '#f3e6c8', '#ffd36b', '#e4574f']
      : ['#2a2a2a', '#6b6b6b', '#e4574f', '#ffd36b'];
    if (el) {
      els.delete(cs.x + '-' + cs.y);
      el.classList.remove('selected', 'in-check');
      el.classList.add('capturing');
      setTimeout(() => el.remove(), 750);
    }
    setTimeout(() => {
      chessBurst(cs.x, cs.y, { colors, count: 16, spread: 36 });
      chessShake();
    }, 170);
  });

  chessLastMove = kingMove || firstMove || null;

  // --- Suara ---
  if (isCapture) playChessSound('capture');
  else if (promoted) playChessSound('promote');
  else if (movedCount >= 2) { playChessSound('move'); setTimeout(() => playChessSound('move'), 120); }
  else if (movedCount === 1) playChessSound('move');

  return true;
}

function chessDraw(){
  if(!chessBoardState) return;
  const layer = document.getElementById('chessPiecesLayer');
  const board = chessBoardState;

  const isCheck = chessIsInCheck(board, chessTurn);
  const wrapper = document.getElementById('chessWrapper');
  wrapper.classList.toggle('in-check', isCheck);
  const kingPos = isCheck ? chessFindKing(board, chessTurn) : null;

  // ---------- 1. Diff bidak ----------
  let boardChanged = false;
  if (!prevChessBoard) {
    chessHardRebuild(layer, board);
    chessLastMove = null;
  } else {
    let changedCount = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (prevChessBoard[y][x] !== board[y][x]) changedCount++;
    if (changedCount > 0) {
      boardChanged = true;
      if (changedCount > 4) {            // bukan 1 langkah biasa (sinkronisasi/reconnect) -> gambar ulang tanpa animasi
        chessHardRebuild(layer, board);
        chessLastMove = null;
        boardChanged = false;
      } else {
        chessHistRecord(prevChessBoard, board);
        chessAnimateDiff(layer, prevChessBoard, board);
      }
    }
  }
  prevChessBoard = board.map(r => r.slice());

  if (boardChanged && isCheck) playChessSound('check');

  // ---------- 2. Highlight kotak ----------
  let validMoves = [];
  if(chessSelected) {
    validMoves = chessLegalMovesForSquare(board, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
  }
  for(let y=0; y<8; y++){
    for(let x=0; x<8; x++){
      const bx = chessFlipped ? 7 - x : x;
      const by = chessFlipped ? 7 - y : y;
      const cell = document.getElementById(`sq-${x}-${y}`);
      if(!cell) continue;

      cell.className = 'cell ' + ((x + y) % 2 ? 'dark' : 'light');
      if(chessLastMove && ((chessLastMove.x1 === bx && chessLastMove.y1 === by) || (chessLastMove.x2 === bx && chessLastMove.y2 === by))) cell.classList.add('trail');
      if(chessSelected && chessSelected.x === bx && chessSelected.y === by) cell.classList.add('selected');
      if(kingPos && kingPos.x === bx && kingPos.y === by) cell.classList.add('king-check');

      const mv = validMoves.find(m => m.x2 === bx && m.y2 === by);
      if(mv) cell.classList.add(mv.capture ? 'capture' : 'valid');
    }
  }

  updatePieceClasses(kingPos);

  // ---------- 3. Status UI ----------
  const myTurn = chessTurn === myChessColor && !chessGameOver;
  let statusTxt = chessGameOver ? 'Game selesai' : (myTurn ? '🟢 Giliranmu' : '⏳ Giliran lawan...');
  if(isCheck) statusTxt += (myTurn ? ' — Rajamu SKAK!' : ' — Raja lawan skak');
  const statusEl = document.getElementById('chessStatus');
  if(statusEl) statusEl.textContent = statusTxt;
}

function updatePieceClasses(kingPos) {
  document.querySelectorAll('#chessPiecesLayer .piece-wrapper').forEach(el => {
    if (el.classList.contains('capturing')) return;
    const px = parseInt(el.dataset.x);
    const py = parseInt(el.dataset.y);
    el.classList.toggle('selected', !!(chessSelected && chessSelected.x === px && chessSelected.y === py));
    el.classList.toggle('in-check', !!(kingPos && kingPos.x === px && kingPos.y === py));
  });
}

function createPieceElement(p, bx, by) {
  const el = document.createElement('div');
  el.className = 'piece-wrapper';
  el.dataset.x = bx;
  el.dataset.y = by;
  el.dataset.piece = p;
  el.style.transform = getTransformString(bx, by);
  el.innerHTML = `<span class="piece ${chessColorOf(p)==='w'?'white':'black'}">${pieceUnicode[p]}</span>`;
  return el;
}

function getTransformString(bx, by) {
  const dx = chessFlipped ? 7 - bx : bx;
  const dy = chessFlipped ? 7 - by : by;
  return `translate(${dx * 100}%, ${dy * 100}%)`;
}

// ======================================================
// LOGIKA CATUR
// ======================================================
function chessFindKing(board, color){
  const K = color === 'w' ? 'K' : 'k';
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(board[y][x] === K) return {x,y};
  return null;
}
function chessSlideAttack(board, x, y, byColor, dirs, chars){
  for(const [dx,dy] of dirs){
    let cx = x+dx, cy = y+dy;
    while(cx>=0 && cx<8 && cy>=0 && cy<8){
      const p = board[cy][cx];
      if(p){ if(chessColorOf(p) === byColor && chars.indexOf(p.toLowerCase()) !== -1) return true; break; }
      cx += dx; cy += dy;
    }
  }
  return false;
}
function chessSquareAttacked(board, x, y, byColor){
  if(byColor === 'w'){
    if(y+1 < 8){ if(x-1 >= 0 && board[y+1][x-1] === 'P') return true; if(x+1 < 8 && board[y+1][x+1] === 'P') return true; }
  } else {
    if(y-1 >= 0){ if(x-1 >= 0 && board[y-1][x-1] === 'p') return true; if(x+1 < 8 && board[y-1][x+1] === 'p') return true; }
  }
  const N = byColor === 'w' ? 'N' : 'n';
  for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
    const nx=x+dx, ny=y+dy; if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === N) return true;
  }
  const K = byColor === 'w' ? 'K' : 'k';
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    if(!dx && !dy) continue; const nx=x+dx, ny=y+dy; if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === K) return true;
  }
  if(chessSlideAttack(board,x,y,byColor,[[1,0],[-1,0],[0,1],[0,-1]],['r','q'])) return true;
  if(chessSlideAttack(board,x,y,byColor,[[1,1],[1,-1],[-1,1],[-1,-1]],['b','q'])) return true;
  return false;
}
function chessIsInCheck(board, color){
  const k = chessFindKing(board, color);
  if(!k) return false;
  return chessSquareAttacked(board, k.x, k.y, color === 'w' ? 'b' : 'w');
}
function chessPieceMoves(board, state, x, y){
  const p = board[y][x]; if(!p) return [];
  const color = chessColorOf(p), type = p.toLowerCase(), moves = [];
  const addIfOk = (x2,y2,extra) => {
    if(x2<0 || x2>7 || y2<0 || y2>7) return;
    const t = board[y2][x2]; if(t && chessColorOf(t) === color) return;
    moves.push(Object.assign({x1:x,y1:y,x2,y2,capture:!!t,flag:null,promotion:false}, extra||{}));
  };
  if(type === 'p'){
    const dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1, lastRow = color === 'w' ? 0 : 7;
    if(y+dir>=0 && y+dir<8 && !board[y+dir][x]){
      moves.push({x1:x,y1:y,x2:x,y2:y+dir,capture:false,flag:null,promotion:(y+dir===lastRow)});
      if(y===startRow && !board[y+2*dir][x]) moves.push({x1:x,y1:y,x2:x,y2:y+2*dir,capture:false,flag:'double',promotion:false});
    }
    for(const dx of [-1,1]){
      const nx=x+dx, ny=y+dir; if(nx<0 || nx>7 || ny<0 || ny>7) continue;
      const t = board[ny][nx];
      if(t && chessColorOf(t) !== color) moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:null,promotion:(ny===lastRow)});
      else if(!t && state.ep && state.ep.x===nx && state.ep.y===ny) moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:'enpassant',promotion:false,epCapture:{x:nx,y:y}});
    }
  } else if(type === 'n'){ [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dx,dy]) => addIfOk(x+dx,y+dy)); }
  else if(type === 'k'){
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(dx||dy) addIfOk(x+dx,y+dy); }
    const rights = state.castling || {}, homeRow = color === 'w' ? 7 : 0, oppColor = color === 'w' ? 'b' : 'w';
    if(y===homeRow && x===4 && !chessSquareAttacked(board,x,y,oppColor)){
      if((color==='w'?rights.wK:rights.bK) && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7]===(color==='w'?'R':'r')){
        if(!chessSquareAttacked(board,5,homeRow,oppColor) && !chessSquareAttacked(board,6,homeRow,oppColor)) moves.push({x1:x,y1:y,x2:6,y2:homeRow,capture:false,flag:'castleK',promotion:false});
      }
      if((color==='w'?rights.wQ:rights.bQ) && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] && board[homeRow][0]===(color==='w'?'R':'r')){
        if(!chessSquareAttacked(board,3,homeRow,oppColor) && !chessSquareAttacked(board,2,homeRow,oppColor)) moves.push({x1:x,y1:y,x2:2,y2:homeRow,capture:false,flag:'castleQ',promotion:false});
      }
    }
  } else {
    const dirs = type==='r' ? [[1,0],[-1,0],[0,1],[0,-1]] : type==='b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dx,dy] of dirs){
      let cx=x+dx, cy=y+dy;
      while(cx>=0 && cx<8 && cy>=0 && cy<8){
        const t = board[cy][cx];
        if(t){ if(chessColorOf(t)!==color) addIfOk(cx,cy); break; }
        addIfOk(cx,cy); cx+=dx; cy+=dy;
      }
    }
  }
  return moves;
}
function chessApplyMove(board, state, move, promoteTo){
  const nb = board.map(r => r.slice()), nc = Object.assign({}, state.castling);
  const piece = nb[move.y1][move.x1], color = chessColorOf(piece);
  let capturedPiece = nb[move.y2][move.x2];
  nb[move.y1][move.x1] = '';
  let placed = piece;
  if(move.promotion){ placed = color==='w' ? (promoteTo||'q').toUpperCase() : (promoteTo||'q'); }
  nb[move.y2][move.x2] = placed;
  if(move.flag === 'enpassant'){ nb[move.epCapture.y][move.epCapture.x] = ''; capturedPiece = color==='w' ? 'p' : 'P'; }
  if(move.flag === 'castleK'){ nb[move.y1][5] = nb[move.y1][7]; nb[move.y1][7] = ''; }
  if(move.flag === 'castleQ'){ nb[move.y1][3] = nb[move.y1][0]; nb[move.y1][0] = ''; }
  if(piece==='K'){ nc.wK=false; nc.wQ=false; } if(piece==='k'){ nc.bK=false; nc.bQ=false; }
  if(move.x1===0 && move.y1===7) nc.wQ=false; if(move.x1===7 && move.y1===7) nc.wK=false;
  if(move.x1===0 && move.y1===0) nc.bQ=false; if(move.x1===7 && move.y1===0) nc.bK=false;
  if(move.x2===0 && move.y2===7) nc.wQ=false; if(move.x2===7 && move.y2===7) nc.wK=false;
  if(move.x2===0 && move.y2===0) nc.bQ=false; if(move.x2===7 && move.y2===0) nc.bK=false;
  const newEp = move.flag==='double' ? {x:move.x1, y:(move.y1+move.y2)/2} : null;
  const newHalfmove = (piece.toLowerCase()==='p' || capturedPiece) ? 0 : (state.halfmove||0)+1;
  return { board: nb, castling: nc, ep: newEp, halfmove: newHalfmove, capturedPiece };
}
function chessLegalMovesForSquare(board, state, x, y){
  const p = board[y][x]; if(!p) return [];
  const color = chessColorOf(p), legal = [];
  for(const m of chessPieceMoves(board, state, x, y)){
    const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
    if(!chessIsInCheck(res.board, color)) legal.push(m);
  }
  return legal;
}
function chessAllLegalMoves(board, state, color){
  let all = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const p = board[y][x]; if(p && chessColorOf(p)===color) all = all.concat(chessLegalMovesForSquare(board,state,x,y)); }
  return all;
}
function chessIsInsufficientMaterial(board){
  const pieces = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const p = board[y][x]; if(p && p.toLowerCase() !== 'k') pieces.push({p,x,y}); }
  if(pieces.length === 0) return true;
  if(pieces.length === 1) return ['n','b'].includes(pieces[0].p.toLowerCase());
  if(pieces.length === 2){ const [a,b] = pieces; if(a.p.toLowerCase()==='b' && b.p.toLowerCase()==='b' && chessColorOf(a.p)!==chessColorOf(b.p)) return (a.x+a.y)%2 === (b.x+b.y)%2; }
  return false;
}
function chessPositionKey(board, turn, castling, ep){
  let s = ''; for(let y=0;y<8;y++) for(let x=0;x<8;x++) s += (board[y][x] || '0');
  s += '_' + turn + '_' + (castling.wK?1:0)+(castling.wQ?1:0)+(castling.bK?1:0)+(castling.bQ?1:0) + '_' + (ep ? (ep.x+'-'+ep.y) : 'n');
  return 'k' + s;
}

function chessHandleClick(x, y){
  getChessAudioContext();
  if(chessGameOver || chessPendingPromotion || chessTurn !== myChessColor) return;

  const board = chessBoardState || chessStartingState().board;
  const p = board[y][x];

  // Klik bidak yang sama -> batalkan pilihan
  if(chessSelected && chessSelected.x === x && chessSelected.y === y) {
    chessSelected = null;
    chessDraw();
    return;
  }

  if(chessSelected){
    const legalMoves = chessLegalMovesForSquare(board, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
    const mv = legalMoves.find(m => m.x2 === x && m.y2 === y);
    if(mv){
      chessSelected = null;
      if(mv.promotion){
        chessPendingPromotion = mv;
        showChessPromoModal(myChessColor);
        chessDraw();
      } else {
        chessCommitMove(mv, null);
      }
      return;
    } else if(p && chessColorOf(p) === myChessColor){
      chessSelected = {x, y};
    } else {
      chessSelected = null;
    }
  } else if(p && chessColorOf(p) === myChessColor){
    chessSelected = {x, y};
  }
  chessDraw();
}

function chessCommitMove(move, promoteTo){
  const state = { castling: chessCastling, ep: chessEP, halfmove: chessHalfmove };
  const result = chessApplyMove(chessBoardState, state, move, promoteTo);
  const nextTurn = chessTurn === 'w' ? 'b' : 'w';
  let newClocks = chessClocks, newTurnStartAt = chessTurnStartAt;

  if(chessClocks){
    const elapsed = Date.now() - (chessTurnStartAt || Date.now());
    const moverColor = chessTurn;
    newClocks = Object.assign({}, chessClocks, { [moverColor]: Math.max(0, (chessClocks[moverColor]||0) - elapsed) });
    newTurnStartAt = Date.now();
  }

  // Optimistic update: langsung gambar di layar sendiri tanpa menunggu Firebase
  chessBoardState = result.board;
  chessTurn = nextTurn;
  chessCastling = result.castling;
  chessEP = result.ep;
  chessHalfmove = result.halfmove;
  chessSelected = null;
  chessDraw();

  roomRef.child('state').set({
    board: JSON.stringify(result.board), turn: nextTurn, castling: result.castling, ep: result.ep, halfmove: result.halfmove, clocks: newClocks, turnStartAt: newTurnStartAt
  });

  const key = chessPositionKey(result.board, nextTurn, result.castling, result.ep);
  roomRef.child('posCounts/' + key).transaction(c => (c||0) + 1).then(res => { if(res.committed && res.snapshot.val() >= 3) chessDeclareResult('draw', 'threefold'); }).catch(()=>{});

  const legalNext = chessAllLegalMoves(result.board, {castling: result.castling, ep: result.ep}, nextTurn);
  if(legalNext.length === 0){
    if(chessIsInCheck(result.board, nextTurn)) chessDeclareResult(myRole, 'checkmate');
    else chessDeclareResult('draw', 'stalemate');
  }
  else if(result.halfmove >= 100) chessDeclareResult('draw', 'fifty');
  else if(chessIsInsufficientMaterial(result.board)) chessDeclareResult('draw', 'insufficient');
}

function chessDeclareResult(winner, reason){ roomRef.child('result').transaction(cur => cur || { winner, reason }); }
function chessFormatClock(ms){
  if(ms < 0) ms = 0; const total = Math.ceil(ms/1000), m = Math.floor(total/60), s = total%60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function chessUpdateClockUI(){
  const wrap = document.getElementById('chessClockWrap'); if(!wrap) return;
  if(!chessClocks){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  let liveW = chessClocks.w, liveB = chessClocks.b;
  if(!chessGameOver && chessTurnStartAt){
    const elapsed = Date.now() - chessTurnStartAt;
    if(chessTurn === 'w') liveW = Math.max(0, chessClocks.w - elapsed); else liveB = Math.max(0, chessClocks.b - elapsed);
  }
  const myLive = myChessColor === 'w' ? liveW : liveB, oppLive = myChessColor === 'w' ? liveB : liveW;
  const meEl = document.getElementById('chessClockMe'), oppEl = document.getElementById('chessClockOpp');
  if(meEl) { meEl.textContent = chessFormatClock(myLive); meEl.classList.toggle('low', myLive < 30000); }
  if(oppEl) { oppEl.textContent = chessFormatClock(oppLive); oppEl.classList.toggle('low', oppLive < 30000); }
  if(!chessGameOver){ if(liveW <= 0) chessDeclareResult('p2', 'timeout'); else if(liveB <= 0) chessDeclareResult('p1', 'timeout'); }
}

function showChessResult(r){
  const overlay = document.getElementById('chessWinOverlay'), textEl = document.getElementById('chessWinText');
  if(!overlay || !textEl) return;
  const reasonTxt = CHESS_REASON_TEXT[r.reason] || '';
  if(r.winner === 'draw') textEl.innerHTML = '🤝 REMIS<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';
  else textEl.innerHTML = (r.winner === myRole ? '🏆 KAMU MENANG!' : '😢 LAWAN MENANG!') + '<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';

  let delay = 0;
  if(r.reason === 'checkmate'){
    // Raja yang kalah roboh + ledakan sebelum overlay muncul
    const loserKing = r.winner === 'p1' ? 'k' : 'K';
    const kingEl = document.querySelector('#chessPiecesLayer .piece-wrapper[data-piece="' + loserKing + '"]');
    if(kingEl){
      kingEl.classList.remove('in-check');
      kingEl.classList.add('defeated');
      chessBurst(parseInt(kingEl.dataset.x), parseInt(kingEl.dataset.y), { colors: ['#e4574f', '#ffd36b', '#ffffff'], ringColor: '#e4574f', count: 20, spread: 44 });
      chessShake();
    }
    playChessSound('gameover');
    delay = 1100;
  }
  setTimeout(() => { overlay.style.display = 'flex'; }, delay);
}

function showChessPromoModal(color){
  const wrap = document.getElementById('chessPromoChoices'); if(!wrap) return;
  wrap.innerHTML = '';
  ['q','r','b','n'].forEach(t => {
    const btn = document.createElement('button'); btn.className = 'promo-btn';
    btn.innerHTML = '<span class="piece ' + (color==='w'?'white':'black') + '">' + pieceUnicode[color==='w'?t.toUpperCase():t] + '</span>';
    btn.onclick = () => chessResolvePromotion(t); wrap.appendChild(btn);
  });
  document.getElementById('chessPromoOverlay').style.display = 'flex';
}
function hideChessPromoModal(){ const el = document.getElementById('chessPromoOverlay'); if(el) el.style.display = 'none'; }
function chessResolvePromotion(choice){
  const mv = chessPendingPromotion; chessPendingPromotion = null; hideChessPromoModal();
  if(mv) chessCommitMove(mv, choice);
}

// ======================================================
// Event Listener Tombol
// ======================================================
document.getElementById('btnChessFlip').onclick = () => {
  chessFlipped = !chessFlipped;
  const layer = document.getElementById('chessPiecesLayer');
  layer.classList.add('no-anim');                       // flip instan, bidak tidak "meluncur" menyeberang papan
  layer.querySelectorAll('.piece-wrapper').forEach(p => {
    p.style.transform = getTransformString(parseInt(p.dataset.x), parseInt(p.dataset.y));
  });
  chessDraw();
  setTimeout(() => layer.classList.remove('no-anim'), 80);
};
document.getElementById('btnChessBack').onclick = () => { if(chessClockInterval) clearInterval(chessClockInterval); if(activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };
document.getElementById('btnChessMenu').onclick = () => { if(chessClockInterval) clearInterval(chessClockInterval); if(activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };
