// ======================================================
// Domino.js — Domino Gaple 2-4 pemain (jumlah dipilih host di awal, mulai otomatis kalau penuh) (Game Hub Realtime)
// Aturan: 28 kartu, tiap pemain 7 kartu (sisa tidak dipakai), tidak ada ambil kartu.
// Pemain dengan balak (double) tertinggi jalan duluan dengan kartu itu.
// Tidak bisa jalan -> pass. Habis kartu = menang ronde; kalau semua pass (blok),
// pemenang = jumlah titik sisa paling sedikit. Poin = total titik sisa lawan.
// Membutuhkan shared.js (+ ensureArray dari Poker.js/Uno.js).
// ======================================================

const DM_ROLES = ['p1', 'p2', 'p3', 'p4'];
const DM_TILES = (() => { const t = []; let id = 0; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) t.push({ id: id++, a, b }); return t; })();
const DM_PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

let dominoRef = null;
let latestDomino = null;
let dominoPresence = {};
let dominoSelected = null;
let dominoAudio = null;
let dominoPrevSig = null;

// ======================================================
// LOGIKA MURNI (dipakai pemain & bot)
// ======================================================
function dmArr(v) { return typeof ensureArray === 'function' ? ensureArray(v) : (!v ? [] : Array.isArray(v) ? v : Object.values(v)); }
function dominoPips(t) { return t.a + t.b; }
function dominoShuffle(a) { const d = a.slice(); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }

function dominoEnds(board) {
  board = dmArr(board);
  if (!board.length) return null;
  return { l: board[0].l, r: board[board.length - 1].r };
}

// Semua langkah legal: [{ tile, side: 'first' | 'l' | 'r' }]
function dominoMoves(hand, board, state) {
  hand = dmArr(hand);
  const ends = dominoEnds(board), out = [];
  hand.forEach(t => {
    if (!ends) { if (!state || state.starterTile === undefined || state.starterTile === t.id) out.push({ tile: t, side: 'first' }); return; }
    if (ends.l !== ends.r && (t.a === ends.l || t.b === ends.l)) out.push({ tile: t, side: 'l' });
    if (t.a === ends.r || t.b === ends.r) out.push({ tile: t, side: 'r' });
  });
  return out;
}

function dominoNextRole(state, from) {
  const pl = dmArr(state.players);
  const i = pl.indexOf(from);
  return pl[(i + 1) % pl.length];
}

function dominoSum(hand) { return dmArr(hand).reduce((s, t) => s + dominoPips(t), 0); }

function dominoFinish(state, winner, reason) {
  const pl = dmArr(state.players);
  const scores = state.scores || {};
  state.phase = 'roundover'; state.reason = reason; state.winner = winner || null; state.points = 0;
  if (winner) {
    const pts = pl.filter(r => r !== winner).reduce((s, r) => s + dominoSum(state.hands[r]), 0);
    state.points = pts;
    scores[winner] = (scores[winner] || 0) + pts;
  }
  state.scores = scores;
  return state;
}

// Mainkan kartu. Mengubah `state`, return true bila sah.
function dominoApplyPlay(state, role, tileId, side) {
  if (!state || state.phase !== 'playing' || state.turn !== role) return false;
  const hand = dmArr(state.hands && state.hands[role]);
  const tile = hand.find(t => t.id === tileId);
  if (!tile) return false;
  const board = dmArr(state.board);
  if (!board.length) {
    if (state.starterTile !== undefined && tileId !== state.starterTile) return false;
    board.push({ id: tile.id, l: tile.a, r: tile.b });
  } else {
    const e = dominoEnds(board);
    if (side === 'l') {
      if (tile.a !== e.l && tile.b !== e.l) return false;
      board.unshift({ id: tile.id, l: tile.a === e.l ? tile.b : tile.a, r: e.l });
    } else if (side === 'r') {
      if (tile.a !== e.r && tile.b !== e.r) return false;
      board.push({ id: tile.id, l: e.r, r: tile.a === e.r ? tile.b : tile.a });
    } else return false;
  }
  state.board = board;
  state.hands[role] = hand.filter(t => t.id !== tileId);
  state.passCount = 0;
  state.lastMove = { by: role, id: tileId };
  state.lastActionText = 'main';
  if (state.hands[role].length === 0) { dominoFinish(state, role, 'domino'); return true; }
  state.turn = dominoNextRole(state, role);
  return true;
}

// Pass hanya sah kalau memang tidak ada kartu yang bisa jalan.
function dominoApplyPass(state, role) {
  if (!state || state.phase !== 'playing' || state.turn !== role) return false;
  const board = dmArr(state.board);
  if (!board.length) return false;
  if (dominoMoves(state.hands[role], board, state).length > 0) return false;
  state.passCount = (state.passCount || 0) + 1;
  state.lastActionText = 'pass';
  state.lastMove = { by: role, id: null };
  const pl = dmArr(state.players);
  if (state.passCount >= pl.length) {
    // blok: pemenang = sisa titik paling sedikit
    const sums = pl.map(r => ({ r, s: dominoSum(state.hands[r]) }));
    const min = Math.min(...sums.map(x => x.s));
    const best = sums.filter(x => x.s === min);
    dominoFinish(state, best.length === 1 ? best[0].r : null, best.length === 1 ? 'blocked' : 'blocked-draw');
    return true;
  }
  state.turn = dominoNextRole(state, role);
  return true;
}

function dominoBuildNewGame(prev, presence) {
  const maxP = Math.min(4, Math.max(2, (prev && prev.maxPlayers) || window.dominoSelectedMaxPlayers || 4));
  const players = DM_ROLES.slice(0, maxP);
  const deck = dominoShuffle(DM_TILES);
  const hands = {};
  players.forEach((r, i) => { hands[r] = deck.slice(i * 7, i * 7 + 7).sort((x, y) => x.id - y.id); });

  // starter: balak tertinggi; kalau tidak ada, kartu dengan titik terbanyak
  let best = null;
  players.forEach(r => hands[r].forEach(t => {
    const key = (t.a === t.b ? 100 : 0) + dominoPips(t) * 10 + Math.max(t.a, t.b);
    if (!best || key > best.key) best = { key, r, id: t.id };
  }));
  return {
    phase: 'playing', players, hands, board: [], turn: best.r, starter: best.r, starterTile: best.id,
    maxPlayers: maxP, passCount: 0, lastMove: null, lastActionText: null, winner: null, reason: null, points: 0,
    scores: (prev && prev.scores) || {}, handNumber: ((prev && prev.handNumber) || 0) + 1
  };
}

// ======================================================
// CSS
// ======================================================
const dominoStyleEl = document.createElement('style');
dominoStyleEl.innerHTML = `
  #dominoScreen { --s: 22px; }
  #dominoScreen .dm-players { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
  #dominoScreen .dm-chip { background: var(--panel-2); border:1px solid var(--line); border-radius:20px; padding:6px 12px; font-size:12px; font-weight:700; color:var(--ink); }
  #dominoScreen .dm-chip.turn { box-shadow: 0 0 0 2px var(--gold) inset, 0 0 14px rgba(232,172,31,.35); }
  #dominoScreen .dm-chip.off { opacity:.45; }
  #dominoScreen .dm-board { min-height:150px; max-height:300px; overflow:auto; background: radial-gradient(circle at 50% 40%, #17603f, #0d3d29); border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:12px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; align-content:center; justify-content:center; box-shadow: inset 0 4px 18px rgba(0,0,0,.45); }
  #dominoScreen .dm-empty { color: rgba(255,255,255,.55); font-size:13px; align-self:center; }
  #dominoScreen .dm-tile { display:inline-flex; background:#f6f1e3; border-radius:6px; border:1px solid #b9ae93; box-shadow: 0 2px 0 rgba(0,0,0,.3), 0 4px 8px rgba(0,0,0,.25); flex-shrink:0; }
  #dominoScreen .dm-tile.h { flex-direction:row; }
  #dominoScreen .dm-tile.v { flex-direction:column; }
  #dominoScreen .dm-half { width:var(--s); height:var(--s); display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); padding:3px; box-sizing:content-box; }
  #dominoScreen .dm-sep { background:#9a8f74; }
  #dominoScreen .dm-tile.h .dm-sep { width:2px; margin:3px 0; }
  #dominoScreen .dm-tile.v .dm-sep { height:2px; margin:0 3px; }
  #dominoScreen .dm-dot { width:70%; height:70%; margin:auto; border-radius:50%; background:#1a1a1a; }
  #dominoScreen .dm-tile.last { box-shadow: 0 0 0 2px var(--gold), 0 2px 0 rgba(0,0,0,.3); }
  #dominoScreen .dm-hand { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:12px 0 6px; --s:28px; }
  #dominoScreen .dm-hand .dm-tile { cursor:pointer; transition: transform .15s ease, opacity .2s ease; }
  #dominoScreen .dm-hand .dm-tile.ok { box-shadow: 0 0 0 2px rgba(43,182,115,.85), 0 3px 0 rgba(0,0,0,.3); }
  #dominoScreen .dm-hand .dm-tile.ok:hover { transform: translateY(-4px); }
  #dominoScreen .dm-hand .dm-tile.dim { opacity:.45; }
  #dominoScreen .dm-hand .dm-tile.sel { transform: translateY(-10px); box-shadow: 0 0 0 3px var(--gold), 0 8px 14px rgba(0,0,0,.5); }
  #dominoScreen .dm-hint { text-align:center; font-size:12px; color: var(--ink-dim); min-height:16px; margin-top:8px; }
  #dominoScreen .dm-actions { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-top:6px; }
  #dominoScreen .dm-act { border:none; border-radius:10px; padding:10px 16px; font-weight:700; font-family:'Space Grotesk',sans-serif; cursor:pointer; color:#fff; background: var(--blue); }
  #dominoScreen .dm-act.pass { background:#475569; }
  #dominoScreen .dm-act.pulse { animation: dmPulse 1.2s ease-in-out infinite; }
  @keyframes dmPulse { 0%,100%{ box-shadow:0 0 0 0 rgba(232,172,31,.0);} 50%{ box-shadow:0 0 0 4px rgba(232,172,31,.6);} }
  #dominoScreen .dm-result { background: var(--panel-2); border:1px solid var(--line); border-radius:12px; padding:12px; margin-top:10px; font-size:14px; line-height:1.6; text-align:center; }
  @media (prefers-reduced-motion: reduce) { #dominoScreen * { animation-duration:.01ms !important; } }
`;
document.head.appendChild(dominoStyleEl);

// ======================================================
// SUARA
// ======================================================
function dominoSfx(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!dominoAudio) dominoAudio = new AC();
    if (dominoAudio.state === 'suspended') dominoAudio.resume();
    const t = dominoAudio.currentTime;
    const tone = (f, at, dur, type, vol) => {
      const o = dominoAudio.createOscillator(), g = dominoAudio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g); g.connect(dominoAudio.destination); o.start(t + at); o.stop(t + at + dur + .02);
    };
    if (kind === 'play') { tone(220, 0, .07, 'square', .08); tone(150, .02, .09, 'triangle', .18); }
    else if (kind === 'pass') tone(200, 0, .12, 'sine', .1);
    else if (kind === 'turn') tone(660, 0, .1, 'sine', .12);
    else if (kind === 'bad') tone(140, 0, .15, 'sawtooth', .1);
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .18, 'sine', .15));
    else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * .12, .22, 'triangle', .14));
  } catch (e) {}
}

// ======================================================
// RENDER
// ======================================================
function dominoTileEl(a, b, vertical, extra) {
  const el = document.createElement('div');
  el.className = 'dm-tile ' + (vertical ? 'v' : 'h') + (extra ? ' ' + extra : '');
  const half = n => {
    const h = document.createElement('div'); h.className = 'dm-half';
    const on = new Set(DM_PIPS[n] || []);
    for (let i = 0; i < 9; i++) { const c = document.createElement('div'); if (on.has(i)) c.className = 'dm-dot'; h.appendChild(c); }
    return h;
  };
  const sep = document.createElement('div'); sep.className = 'dm-sep';
  el.appendChild(half(a)); el.appendChild(sep); el.appendChild(half(b));
  return el;
}

function dominoName(role) { return role === myRole ? 'Kamu' : role.toUpperCase(); }

function dominoRender(data) {
  latestDomino = data;
  const players = data.phase === 'waiting' ? DM_ROLES.slice(0, data.maxPlayers || 4).filter(r => dominoPresence[r]) : dmArr(data.players);
  const myHand = dmArr(data.hands && data.hands[myRole]).slice().sort((x, y) => x.id - y.id);
  const iPlay = dmArr(data.players).includes(myRole);
  const myTurn = data.phase === 'playing' && data.turn === myRole;
  const board = dmArr(data.board);
  const moves = myTurn ? dominoMoves(myHand, board, data) : [];
  if (!myTurn) dominoSelected = null;
  if (dominoSelected !== null && !myHand.some(t => t.id === dominoSelected)) dominoSelected = null;

  // ---- status ----
  const st = document.getElementById('dominoStatus');
  if (data.phase === 'waiting') {
    const mx = data.maxPlayers || 4, n = DM_ROLES.slice(0, mx).filter(r => dominoPresence[r]).length;
    st.textContent = '🟡 Menunggu pemain bergabung (' + n + '/' + mx + ')...';
    st.style.color = '';
  } else if (data.phase === 'playing') {
    if (!iPlay) st.textContent = '👀 Ronde berjalan — kamu ikut di ronde berikutnya.';
    else if (myTurn) st.textContent = !board.length ? '🟢 Giliranmu! Jalan dengan kartu yang menyala.' : (moves.length ? '🟢 Giliranmu!' : '🟡 Tidak ada kartu cocok — tekan Pass.');
    else st.textContent = '⏳ Giliran ' + dominoName(data.turn) + '...';
    st.style.color = myTurn ? 'var(--green)' : '';
  } else {
    st.textContent = '🏁 Ronde selesai.'; st.style.color = '';
  }

  // ---- pemain ----
  const pl = document.getElementById('dominoPlayers'); pl.innerHTML = '';
  players.forEach(r => {
    const chip = document.createElement('div');
    const n = data.phase === 'waiting' ? '' : dmArr(data.hands && data.hands[r]).length;
    const sc = (data.scores && data.scores[r]) || 0;
    chip.className = 'dm-chip' + (data.phase === 'playing' && data.turn === r ? ' turn' : '') + (dominoPresence[r] ? '' : ' off');
    chip.textContent = dominoName(r) + (dominoPresence[r] ? ' 🟢' : ' 🔴') + (n !== '' ? ' · 🁣 ' + n : '') + ' · skor ' + sc;
    pl.appendChild(chip);
  });

  // ---- papan ----
  const bd = document.getElementById('dominoBoard'); bd.innerHTML = '';
  if (!board.length) {
    const e = document.createElement('div'); e.className = 'dm-empty';
    e.textContent = data.phase === 'playing' ? ('Menunggu ' + dominoName(data.starter) + ' membuka dengan kartu tertinggi') : 'Papan kosong';
    bd.appendChild(e);
  } else {
    board.forEach(t => {
      const isLast = data.lastMove && data.lastMove.id === t.id;
      bd.appendChild(dominoTileEl(t.l, t.r, t.l === t.r, isLast ? 'last' : ''));
    });
  }

  // ---- tangan ----
  const hd = document.getElementById('dominoHand'); hd.innerHTML = '';
  const playableIds = new Set(moves.map(m => m.tile.id));
  myHand.forEach(t => {
    const cls = (myTurn ? (playableIds.has(t.id) ? 'ok' : 'dim') : '') + (dominoSelected === t.id ? ' sel' : '');
    const el = dominoTileEl(t.a, t.b, true, cls.trim());
    el.dataset.id = t.id;
    el.onclick = () => dominoTapTile(t.id);
    hd.appendChild(el);
  });

  // ---- aksi ----
  const act = document.getElementById('dominoActions'); act.innerHTML = '';
  const hint = document.getElementById('dominoHint'); hint.textContent = '';
  if (myTurn) {
    const e = dominoEnds(board);
    if (dominoSelected !== null) {
      const sel = moves.filter(m => m.tile.id === dominoSelected);
      hint.textContent = 'Pilih sisi untuk meletakkan kartu';
      sel.forEach(m => {
        const b = document.createElement('button'); b.className = 'dm-act';
        b.textContent = m.side === 'l' ? '◀ Kiri (' + e.l + ')' : 'Kanan (' + e.r + ') ▶';
        b.onclick = () => dominoPlay(dominoSelected, m.side);
        act.appendChild(b);
      });
    } else if (moves.length === 0 && board.length) {
      const b = document.createElement('button'); b.className = 'dm-act pass pulse'; b.textContent = '⏭️ Pass';
      b.onclick = () => dominoDoPass(); act.appendChild(b);
    } else if (!board.length) {
      hint.textContent = 'Kamu pembuka — mainkan kartu yang menyala hijau';
    } else {
      hint.textContent = 'Ujung papan: ' + e.l + ' | ' + e.r;
    }
  }

  // ---- hasil & tombol berikut ----
  const res = document.getElementById('dominoResult'), nx = document.getElementById('dominoBtnNext');
  if (data.phase === 'roundover') {
    let html;
    if (data.reason === 'blocked-draw') html = '🤝 Permainan terblokir — seri (sisa titik sama)';
    else if (data.reason === 'blocked') html = '🧱 Terblokir! ' + dominoName(data.winner) + ' menang (sisa titik paling sedikit)';
    else html = (data.winner === myRole ? '🏆 Kamu ' : '🎉 ' + dominoName(data.winner) + ' ') + 'menang — kartu habis!';
    if (data.winner) html += '<br>+' + (data.points || 0) + ' poin untuk ' + dominoName(data.winner);
    html += '<br>' + dmArr(data.players).map(r => dominoName(r) + ': sisa ' + dominoSum(data.hands && data.hands[r]) + ' titik').join(' · ');
    res.innerHTML = html; res.style.display = 'block';
    nx.style.display = 'block'; nx.textContent = myRole === 'p1' ? '▶ Main Lagi' : '⏳ Menunggu host mulai lagi'; nx.disabled = myRole !== 'p1';
  } else if (data.phase === 'waiting') {
    res.style.display = 'none'; nx.style.display = 'none';
  } else { res.style.display = 'none'; nx.style.display = 'none'; }

  // ---- suara / efek ----
  const sig = data.handNumber + '|' + (data.board ? dmArr(data.board).length : 0) + '|' + data.turn + '|' + (data.passCount || 0) + '|' + data.phase;
  if (dominoPrevSig !== null && sig !== dominoPrevSig) {
    const prev = dominoPrevSig.split('|');
    if (data.phase === 'roundover' && prev[4] !== 'roundover') dominoSfx(data.winner === myRole ? 'win' : 'lose');
    else if (data.lastActionText === 'pass' && String(data.passCount || 0) !== prev[3]) dominoSfx('pass');
    else if (String(dmArr(data.board).length) !== prev[1]) dominoSfx('play');
    if (myTurn && prev[2] !== data.turn) setTimeout(() => dominoSfx('turn'), 200);
  }
  dominoPrevSig = sig;
}

// ======================================================
// AKSI PEMAIN
// ======================================================
function dominoTapTile(id) {
  dominoSfx('');
  const d = latestDomino;
  if (!d || d.phase !== 'playing' || d.turn !== myRole) return;
  const hand = dmArr(d.hands && d.hands[myRole]);
  const moves = dominoMoves(hand, d.board, d).filter(m => m.tile.id === id);
  if (!moves.length) { dominoSfx('bad'); return; }
  if (moves.length === 1) { dominoPlay(id, moves[0].side); return; }
  dominoSelected = (dominoSelected === id) ? null : id;
  dominoRender(d);
}

function dominoPlay(id, side) {
  dominoSelected = null;
  dominoRef.transaction(cur => {
    if (!cur) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    return dominoApplyPlay(s, myRole, id, side) ? s : cur;
  });
}

function dominoDoPass() {
  dominoRef.transaction(cur => {
    if (!cur) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    return dominoApplyPass(s, myRole) ? s : cur;
  });
}

// ======================================================
// INIT
// ======================================================
function initDomino() {
  dominoRef = roomRef.child('domino');
  latestDomino = null; dominoSelected = null; dominoPrevSig = null;
  document.getElementById('dominoRoleTag').textContent = myRole.toUpperCase();

  document.getElementById('btnDominoBack').onclick = () => { if (activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };
  document.getElementById('dominoBtnNext').onclick = () => {
    if (myRole !== 'p1') return;
    dominoRef.transaction(cur => (cur && cur.phase === 'roundover') ? dominoBuildNewGame(cur, dominoPresence) : cur);
  };

  if (myRole === 'p1') {
    dominoRef.transaction(cur => cur || { phase: 'waiting', maxPlayers: window.dominoSelectedMaxPlayers || 4, players: [], hands: {}, board: [], scores: {}, handNumber: 0 });
  }

  setupPresence('dominoConn', roomIdGlobal, (presence) => {
    dominoPresence = presence || {};
    if (latestDomino) dominoRender(latestDomino);
    if (myRole === 'p1' && latestDomino && latestDomino.phase === 'waiting' && DM_ROLES.slice(0, latestDomino.maxPlayers || 4).every(r => dominoPresence[r])) {
      dominoRef.transaction(cur => (cur && cur.phase === 'waiting') ? dominoBuildNewGame(cur, dominoPresence) : cur);
    }
  });

  dominoRef.on('value', snap => { const d = snap.val(); if (d) dominoRender(d); });
}
