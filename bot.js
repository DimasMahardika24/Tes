// ======================================================
// bot.js — Single-player mode (Uno & Snake tanpa Difficulty)
// ======================================================

let botActiveRoles = [];
const botTimers = {};
const botPresenceRefs = {};

let chessBotHandler = null;
let tttBotHandler = null;
let snakeBotHandler = null;
let unoBotHandler = null;
let pokerBotHandler = null;
let dominoBotHandler = null;

function cleanupBotListeners() {
  try {
    if (chessBotHandler && roomRef) roomRef.child('state').off('value', chessBotHandler);
    if (tttBotHandler && roomRef) roomRef.child('state').off('value', tttBotHandler);
    if (snakeBotHandler && roomRef) roomRef.child('snake').off('value', snakeBotHandler);
    if (unoBotHandler && roomRef) roomRef.child('uno').off('value', unoBotHandler);
    if (pokerBotHandler && roomRef) roomRef.child('poker').off('value', pokerBotHandler);
    if (dominoBotHandler && roomRef) roomRef.child('domino').off('value', dominoBotHandler);
  } catch(e) {}
  
  chessEngineReq++; chessBotThinking = false;
  chessBotHandler = null; tttBotHandler = null; snakeBotHandler = null; unoBotHandler = null; pokerBotHandler = null; dominoBotHandler = null;

  Object.keys(botTimers).forEach(k => {
    if (botTimers[k]) { clearTimeout(botTimers[k]); botTimers[k] = null; }
  });
}

function startBotForCurrentGame() {
  if (!window.isBotMode || !roomRef) return;
  const game = currentGame;
  let botRoles = [];

  if (game === 'chess' || game === 'ttt') botRoles = ['p2'];
  else if (game === 'poker') botRoles = ['p2', 'p3', 'p4'];
  else if (game === 'domino') botRoles = ['p2', 'p3', 'p4'].slice(0, (window.dominoSelectedMaxPlayers || 4) - 1);
  else if (game === 'uno') {
    const maxP = window.unoSelectedMaxPlayers || 4;
    botRoles = ['p2','p3','p4','p5','p6'].slice(0, maxP - 1);
  } else if (game === 'snake') {
    const maxP = window.snakeSelectedMaxPlayers || 2;
    botRoles = ['p2','p3','p4','p5','p6','p7'].slice(0, maxP - 1);
  } else return;

  botActiveRoles = botRoles;
  cleanupBotListeners();

  botRoles.forEach(r => {
    const ref = roomRef.child('presence/' + r);
    ref.set(true);
    ref.onDisconnect().remove();
    botPresenceRefs[r] = ref;
  });

  setTimeout(() => {
    if (game === 'chess') startChessBot();
    if (game === 'ttt')   startTTTBot();
    if (game === 'snake') startSnakeBot();
    if (game === 'uno')   startUnoBot();
    if (game === 'poker') startPokerBot();
    if (game === 'domino') startDominoBot();
  }, 500);
}

// ============================================================
// ♟ CATUR BOT
// ============================================================
function chessBotEval(board) {
  let score = 0;
  const vals = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const pst = {
    p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]]
  };

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = board[y][x];
      if (!p) continue;
      const type = p.toLowerCase();
      const isWhite = p === p.toUpperCase();
      let val = vals[type] || 0;
      if (pst[type]) {
        const py = isWhite ? y : 7 - y;
        val += pst[type][py][x];
      }
      score += isWhite ? val : -val;
    }
  }
  return score;
}

function chessBotMinimax(board, state, depth, side, alpha, beta) {
  const moves = chessAllLegalMoves(board, state, side);
  if (moves.length === 0) {
    if (chessIsInCheck(board, side)) return side === 'w' ? -99999 : 99999;
    return 0;
  }
  if (depth === 0) return chessBotEval(board);

  const isWhite = (side === 'w');
  let best = isWhite ? -Infinity : Infinity;
  moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));

  for (const m of moves) {
    const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
    const nextSide = side === 'w' ? 'b' : 'w';
    const score = chessBotMinimax(res.board, { castling: res.castling, ep: res.ep, halfmove: res.halfmove }, depth - 1, nextSide, alpha, beta);
    
    if (isWhite) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

function startChessBot() {
  chessBotHistory = []; chessBotThinking = false;
  const stateRef = roomRef.child('state');
  if (chessBotHandler) stateRef.off('value', chessBotHandler);

  chessBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.turn !== 'b') { if (botTimers.chess) { clearTimeout(botTimers.chess); botTimers.chess = null; } return; }
    if (botTimers.chess) return;
    botTimers.chess = setTimeout(() => { botTimers.chess = null; makeChessBotMove(data); }, window.botDifficulty === 'impossible' ? 250 : 700 + Math.random() * 500);
  };
  stateRef.on('value', chessBotHandler);
}

let chessBotHistory = [];           // posisi-posisi sebelumnya (untuk deteksi pengulangan oleh mesin)
let chessBotThinking = false;

function chessBotSnapshot(board, turn, st) {
  return { board: board.map(r => r.slice()), turn, castling: Object.assign({}, st.castling), ep: st.ep || null, halfmove: st.halfmove || 0 };
}

function makeChessBotMove(data) {
  const board = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;
  const state = { castling: data.castling || { wK:false, wQ:false, bK:false, bQ:false }, ep: data.ep || null, halfmove: data.halfmove || 0 };
  const moves = chessAllLegalMoves(board, state, 'b');
  if (moves.length === 0) return;

  // 💀 IMPOSSIBLE: mesin alpha-beta penuh (Web Worker)
  if (window.botDifficulty === 'impossible') { chessBotImpossibleMove(data, board, state, moves); return; }

  let depth = 1; 
  let blunderChance = 0;

  if (window.botDifficulty === 'normal') {
    depth = 1;
    blunderChance = 0.5; 
  } else if (window.botDifficulty === 'medium') {
    depth = 2;
    blunderChance = 0.1; 
  } else if (window.botDifficulty === 'hard') {
    depth = 3;
    blunderChance = 0;
  }

  let bestScore = Infinity;
  let bestMove = null;

  if (Math.random() < blunderChance) {
    bestMove = moves[Math.floor(Math.random() * moves.length)];
  } else {
    moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));
    for (const m of moves) {
      const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
      const score = chessBotMinimax(res.board, { castling: res.castling, ep: res.ep, halfmove: res.halfmove }, depth - 1, 'w', -Infinity, Infinity);
      if (score < bestScore) { bestScore = score; bestMove = m; }
    }
  }

  if (!bestMove) bestMove = moves[0];
  chessBotCommit(board, state, bestMove, 'q');
}

function chessBotCommit(board, state, move, promoteTo) {
  const res = chessApplyMove(board, state, move, move.promotion ? (promoteTo || 'q') : null);
  chessBotHistory.push(chessBotSnapshot(board, 'b', state));
  chessBotHistory.push(chessBotSnapshot(res.board, 'w', res));
  roomRef.child('state').set({
    board: JSON.stringify(res.board), turn: 'w', castling: res.castling, ep: res.ep, halfmove: res.halfmove, clocks: null, turnStartAt: null
  });
  chessBotPostMoveCheck(res.board, res);
}

function chessBotPostMoveCheck(board, res) {
  const legalWhite = chessAllLegalMoves(board, { castling: res.castling, ep: res.ep }, 'w');
  if (legalWhite.length === 0) {
    if (chessIsInCheck(board, 'w')) roomRef.child('result').transaction(cur => cur || { winner: 'p2', reason: 'checkmate' });
    else roomRef.child('result').transaction(cur => cur || { winner: 'draw', reason: 'stalemate' });
    return;
  }
  if ((res.halfmove || 0) >= 100) roomRef.child('result').transaction(cur => cur || { winner: 'draw', reason: 'fifty' });
  else if (chessIsInsufficientMaterial(board)) roomRef.child('result').transaction(cur => cur || { winner: 'draw', reason: 'insufficient' });
}

// ------------------------------------------------------------
// 💀 Mode IMPOSSIBLE — jalankan mesin di Web Worker (fallback: thread utama)
// ------------------------------------------------------------
let chessEngineWorker = null, chessEngineMain = null, chessEngineReq = 0;
const chessEngineCbs = {};

function chessEngineRun(payload, cb) {
  const id = ++chessEngineReq;
  chessEngineCbs[id] = cb;
  const runMain = () => {
    if (!chessEngineMain) chessEngineMain = chessEngineBuild();
    const p = Object.assign({}, payload, { movetime: Math.min(payload.movetime || 2000, 1800) });
    setTimeout(() => {
      let r = null;
      try { r = chessEngineMain.run(p); } catch (e) { r = null; }
      const f = chessEngineCbs[id]; delete chessEngineCbs[id]; if (f) f(r);
    }, 60);
  };
  try {
    if (chessEngineWorker === null && !window.__chessNoWorker) {
      const src = 'var E=(' + chessEngineBuild.toString() + ')();' +
        'onmessage=function(e){var r=null;try{r=E.run(e.data.payload);}catch(err){r=null;}postMessage({id:e.data.id,result:r});};';
      chessEngineWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
      chessEngineWorker.onmessage = (e) => {
        const f = chessEngineCbs[e.data.id]; delete chessEngineCbs[e.data.id];
        if (f) f(e.data.result);
      };
      chessEngineWorker.onerror = () => {
        window.__chessNoWorker = true;
        try { chessEngineWorker.terminate(); } catch (err) {}
        chessEngineWorker = null;
        const pending = Object.keys(chessEngineCbs);
        if (pending.length) { const last = pending[pending.length - 1]; const f = chessEngineCbs[last]; delete chessEngineCbs[last]; chessEngineRun(payload, f); }
      };
    }
    if (chessEngineWorker) chessEngineWorker.postMessage({ id, payload });
    else runMain();
  } catch (e) {
    window.__chessNoWorker = true; chessEngineWorker = null; runMain();
  }
}

function chessBotImpossibleMove(data, board, state, moves) {
  if (chessBotThinking) return;
  chessBotThinking = true;
  const stEl = document.getElementById('chessStatus');
  if (stEl) stEl.textContent = '🤖 Bot sedang menghitung...';

  const payload = {
    board, turn: 'b', castling: state.castling, ep: state.ep, halfmove: state.halfmove,
    history: chessBotHistory.slice(-150), movetime: 2800
  };
  const sig = typeof data.board === 'string' ? data.board : JSON.stringify(data.board);

  chessEngineRun(payload, (r) => {
    chessBotThinking = false;
    if (!roomRef || chessGameOver) return;
    // pastikan posisi belum berubah selagi bot berpikir
    roomRef.child('state').once('value').then(snap => {
      const cur = snap.val();
      if (!cur || cur.turn !== 'b') return;
      const curSig = typeof cur.board === 'string' ? cur.board : JSON.stringify(cur.board);
      if (curSig !== sig) return;

      let mv = null;
      if (r) mv = moves.find(m => m.x1 === r.x1 && m.y1 === r.y1 && m.x2 === r.x2 && m.y2 === r.y2);
      if (!mv) {   // cadangan: minimax dalam
        let bs = Infinity;
        moves.forEach(m => {
          const rs = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
          const sc = chessBotMinimax(rs.board, { castling: rs.castling, ep: rs.ep, halfmove: rs.halfmove }, 2, 'w', -Infinity, Infinity);
          if (sc < bs) { bs = sc; mv = m; }
        });
      }
      chessBotCommit(board, state, mv || moves[0], (r && r.promo) || 'q');
    });
  });
}

// ============================================================
// 💀 MESIN CATUR "IMPOSSIBLE" (berjalan di Web Worker)
// Alpha-beta + PVS, iterative deepening, transposition table, quiescence,
// null-move, LMR, killer/history, deteksi pengulangan. Mandiri (tanpa dependensi).
// ============================================================
function chessEngineBuild() {
  'use strict';
  var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  var MATE = 30000, INF = 32000, MAXPLY = 100;
  var board = new Int8Array(64);
  var side = 1, castle = 0, ep = -1, half = 0;
  var hLo = 0, hHi = 0;
  var kSq = new Int8Array(2);
  var nodes = 0, stopFlag = false, tStart = 0, tLimit = 0, rootBest = 0;
  var VAL = [0, 100, 320, 330, 500, 900, 0];
  var VV = [0, 100, 320, 330, 500, 900, 20000];

  // ---------- Zobrist ----------
  var seed = 0x2545F491;
  function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  var zLo = new Int32Array(13 * 64), zHi = new Int32Array(13 * 64), i, j;
  for (i = 0; i < 13 * 64; i++) { zLo[i] = rnd(); zHi[i] = rnd(); }
  var zSLo = rnd(), zSHi = rnd();
  var zCLo = new Int32Array(16), zCHi = new Int32Array(16);
  for (i = 0; i < 16; i++) { zCLo[i] = rnd(); zCHi[i] = rnd(); }

  // ---------- Geometri ----------
  var KN = [], KG = [], PAW = [], PAB = [], RB = [], RR = [];
  var knD = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  var bD = [[1,1],[1,-1],[-1,1],[-1,-1]], rD = [[1,0],[-1,0],[0,1],[0,-1]];
  (function () {
    for (var sq = 0; sq < 64; sq++) {
      var y = sq >> 3, x = sq & 7, kn = [], kg = [], paw = [], pab = [];
      knD.forEach(function (d) { var nx = x + d[0], ny = y + d[1]; if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) kn.push(ny * 8 + nx); });
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy; if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) kg.push(ny * 8 + nx);
      }
      [-1, 1].forEach(function (d) {
        var nx = x + d; if (nx < 0 || nx > 7) return;
        if (y - 1 >= 0) paw.push((y - 1) * 8 + nx);
        if (y + 1 < 8) pab.push((y + 1) * 8 + nx);
      });
      var mk = function (ds) {
        return ds.map(function (d) {
          var r = [], cx = x + d[0], cy = y + d[1];
          while (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) { r.push(cy * 8 + cx); cx += d[0]; cy += d[1]; }
          return r;
        });
      };
      KN[sq] = kn; KG[sq] = kg; PAW[sq] = paw; PAB[sq] = pab; RB[sq] = mk(bD); RR[sq] = mk(rD);
    }
  })();
  var CM = new Int8Array(64); for (i = 0; i < 64; i++) CM[i] = 15;
  CM[60] = 12; CM[63] = 14; CM[56] = 13; CM[4] = 3; CM[7] = 11; CM[0] = 7;

  // ---------- Tabel nilai posisi (sudut pandang putih, baris 0 = rank 8) ----------
  var PST = [null,
    [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]
  ];
  var KM = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
  var KE = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
  var PASSED = [0, 5, 10, 20, 35, 60, 100, 0];

  // ---------- Buffer ----------
  var MV = new Int32Array((MAXPLY + 4) * 256), SC = new Int32Array((MAXPLY + 4) * 256);
  var sUC = new Int8Array(1024), sCa = new Int8Array(1024), sEp = new Int16Array(1024), sHf = new Int16Array(1024);
  var sLo = new Int32Array(1024), sHi = new Int32Array(1024), sP = new Int8Array(1024), sp = 0;
  var hsLo = new Int32Array(4096), hsHi = new Int32Array(4096), histN = 0;
  var K1 = new Int32Array(MAXPLY + 4), K2 = new Int32Array(MAXPLY + 4), HIST = new Int32Array(8192);
  var TTBITS = 20, TTSIZE = 1 << TTBITS, TTMASK = TTSIZE - 1;
  var ttK = new Int32Array(TTSIZE), ttD = new Int8Array(TTSIZE), ttF = new Int8Array(TTSIZE), ttS = new Int16Array(TTSIZE), ttM = new Int32Array(TTSIZE);
  ttD.fill(-1);

  function attacked(sq, by) {
    var a = by > 0 ? PAB[sq] : PAW[sq], k, l, p, r;
    for (k = 0; k < a.length; k++) if (board[a[k]] === by * P) return true;
    a = KN[sq]; for (k = 0; k < a.length; k++) if (board[a[k]] === by * N) return true;
    a = KG[sq]; for (k = 0; k < a.length; k++) if (board[a[k]] === by * K) return true;
    r = RB[sq];
    for (k = 0; k < 4; k++) { a = r[k]; for (l = 0; l < a.length; l++) { p = board[a[l]]; if (p !== 0) { if (p === by * B || p === by * Q) return true; break; } } }
    r = RR[sq];
    for (k = 0; k < 4; k++) { a = r[k]; for (l = 0; l < a.length; l++) { p = board[a[l]]; if (p !== 0) { if (p === by * R || p === by * Q) return true; break; } } }
    return false;
  }

  function gen(ply, caps) {
    var off = ply * 256, n = off, us = side, sq, p, a, k, l, t, c, r, y, x;
    for (sq = 0; sq < 64; sq++) {
      p = board[sq] * us;
      if (p <= 0) continue;
      if (p === P) {
        y = sq >> 3;
        var dir = us > 0 ? -8 : 8, promoRow = us > 0 ? 0 : 7, startRow = us > 0 ? 6 : 1;
        var to = sq + dir, ty = y + (us > 0 ? -1 : 1);
        if (board[to] === 0) {
          if (ty === promoRow) { MV[n++] = sq | (to << 6) | (Q << 12); if (!caps) MV[n++] = sq | (to << 6) | (N << 12); }
          else if (!caps) {
            MV[n++] = sq | (to << 6);
            if (y === startRow && board[to + dir] === 0) MV[n++] = sq | ((to + dir) << 6) | (4 << 15);
          }
        }
        a = us > 0 ? PAW[sq] : PAB[sq];
        for (k = 0; k < a.length; k++) {
          t = a[k]; c = board[t] * us;
          if (c < 0) {
            if (ty === promoRow) { MV[n++] = sq | (t << 6) | (Q << 12); if (!caps) MV[n++] = sq | (t << 6) | (N << 12); }
            else MV[n++] = sq | (t << 6);
          } else if (c === 0 && t === ep) MV[n++] = sq | (t << 6) | (1 << 15);
        }
      } else if (p === N) {
        a = KN[sq];
        for (k = 0; k < a.length; k++) { t = a[k]; c = board[t] * us; if (c < 0 || (c === 0 && !caps)) MV[n++] = sq | (t << 6); }
      } else if (p === K) {
        a = KG[sq];
        for (k = 0; k < a.length; k++) { t = a[k]; c = board[t] * us; if (c < 0 || (c === 0 && !caps)) MV[n++] = sq | (t << 6); }
        if (!caps) {
          if (us > 0 && sq === 60) {
            if ((castle & 1) && board[61] === 0 && board[62] === 0 && board[63] === R && !attacked(60, -1) && !attacked(61, -1) && !attacked(62, -1)) MV[n++] = 60 | (62 << 6) | (2 << 15);
            if ((castle & 2) && board[59] === 0 && board[58] === 0 && board[57] === 0 && board[56] === R && !attacked(60, -1) && !attacked(59, -1) && !attacked(58, -1)) MV[n++] = 60 | (58 << 6) | (3 << 15);
          } else if (us < 0 && sq === 4) {
            if ((castle & 4) && board[5] === 0 && board[6] === 0 && board[7] === -R && !attacked(4, 1) && !attacked(5, 1) && !attacked(6, 1)) MV[n++] = 4 | (6 << 6) | (2 << 15);
            if ((castle & 8) && board[3] === 0 && board[2] === 0 && board[1] === 0 && board[0] === -R && !attacked(4, 1) && !attacked(3, 1) && !attacked(2, 1)) MV[n++] = 4 | (2 << 6) | (3 << 15);
          }
        }
      } else {
        for (r = 0; r < 2; r++) {
          if (r === 0 && p === R) continue;        // rook: hanya lurus
          if (r === 1 && p === B) continue;        // bishop: hanya diagonal
          var rays = r === 0 ? RB[sq] : RR[sq];
          for (k = 0; k < 4; k++) {
            a = rays[k];
            for (l = 0; l < a.length; l++) {
              t = a[l]; c = board[t] * us;
              if (c === 0) { if (!caps) MV[n++] = sq | (t << 6); }
              else { if (c < 0) MV[n++] = sq | (t << 6); break; }
            }
          }
        }
      }
    }
    return n;
  }

  function make(m) {
    var from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7, fl = (m >> 15) & 7;
    var p = board[from], cap = board[to], us = p > 0 ? 1 : -1, placed = p, ci;
    sUC[sp] = cap; sCa[sp] = castle; sEp[sp] = ep; sHf[sp] = half; sLo[sp] = hLo; sHi[sp] = hHi; sP[sp] = p; sp++;
    hsLo[histN] = hLo; hsHi[histN] = hHi; histN++;
    ci = (p + 6) * 64 + from; hLo ^= zLo[ci]; hHi ^= zHi[ci];
    if (cap !== 0) { ci = (cap + 6) * 64 + to; hLo ^= zLo[ci]; hHi ^= zHi[ci]; }
    if (pr) placed = us * pr;
    board[from] = 0; board[to] = placed;
    ci = (placed + 6) * 64 + to; hLo ^= zLo[ci]; hHi ^= zHi[ci];
    if (fl === 1) {
      var cs = (from & 56) | (to & 7), cp = -us * P;
      board[cs] = 0; ci = (cp + 6) * 64 + cs; hLo ^= zLo[ci]; hHi ^= zHi[ci];
    } else if (fl === 2 || fl === 3) {
      var rf = fl === 2 ? from + 3 : from - 4, rt = fl === 2 ? from + 1 : from - 1, rk = us * R;
      board[rf] = 0; board[rt] = rk;
      ci = (rk + 6) * 64 + rf; hLo ^= zLo[ci]; hHi ^= zHi[ci];
      ci = (rk + 6) * 64 + rt; hLo ^= zLo[ci]; hHi ^= zHi[ci];
    }
    if (p === K || p === -K) kSq[us > 0 ? 0 : 1] = to;
    var nc = castle & CM[from] & CM[to];
    if (nc !== castle) { hLo ^= zCLo[castle] ^ zCLo[nc]; hHi ^= zCHi[castle] ^ zCHi[nc]; castle = nc; }
    ep = fl === 4 ? (from + to) >> 1 : -1;
    side = -side; hLo ^= zSLo; hHi ^= zSHi;
    half = (p === P || p === -P || cap !== 0 || fl === 1) ? 0 : half + 1;
  }

  function unmake(m) {
    var from = m & 63, to = (m >> 6) & 63, fl = (m >> 15) & 7;
    sp--; histN--;
    var p = sP[sp], cap = sUC[sp], us = p > 0 ? 1 : -1;
    board[from] = p; board[to] = cap;
    if (fl === 1) { board[to] = 0; board[(from & 56) | (to & 7)] = -us * P; }
    else if (fl === 2) { board[from + 3] = us * R; board[from + 1] = 0; }
    else if (fl === 3) { board[from - 4] = us * R; board[from - 1] = 0; }
    if (p === K || p === -K) kSq[us > 0 ? 0 : 1] = from;
    castle = sCa[sp]; ep = sEp[sp]; half = sHf[sp]; hLo = sLo[sp]; hHi = sHi[sp]; side = -side;
  }

  function makeNull() {
    sEp[sp] = ep; sHf[sp] = half; sLo[sp] = hLo; sHi[sp] = hHi; sp++;
    hsLo[histN] = hLo; hsHi[histN] = hHi; histN++;
    ep = -1; half++; side = -side; hLo ^= zSLo; hHi ^= zSHi;
  }
  function unmakeNull() {
    sp--; histN--; ep = sEp[sp]; half = sHf[sp]; hLo = sLo[sp]; hHi = sHi[sp]; side = -side;
  }

  // ---------- Evaluasi (sudut pandang pihak yang jalan) ----------
  var cntW = new Int8Array(8), cntB = new Int8Array(8), bMinY = new Int8Array(8), wMaxY = new Int8Array(8);
  var pw = new Int8Array(16), pb = new Int8Array(16), rw = new Int8Array(4), rb = new Int8Array(4);
  function evaluate() {
    var s = 0, np = 0, nW = 0, nB = 0, wBi = 0, bBi = 0, nrw = 0, nrb = 0, sq, p, a;
    for (sq = 0; sq < 8; sq++) { cntW[sq] = 0; cntB[sq] = 0; bMinY[sq] = 8; wMaxY[sq] = -1; }
    for (sq = 0; sq < 64; sq++) {
      p = board[sq]; if (!p) continue;
      if (p > 0) {
        if (p === K) continue;
        s += VAL[p] + PST[p][sq];
        if (p === P) { var x = sq & 7, y = sq >> 3; cntW[x]++; if (y > wMaxY[x]) wMaxY[x] = y; if (nW < 16) pw[nW++] = sq; }
        else { np += VAL[p]; if (p === B) wBi++; else if (p === R && nrw < 4) rw[nrw++] = sq; }
      } else {
        a = -p; if (a === K) continue;
        s -= VAL[a] + PST[a][sq ^ 56];
        if (a === P) { var x2 = sq & 7, y2 = sq >> 3; cntB[x2]++; if (y2 < bMinY[x2]) bMinY[x2] = y2; if (nB < 16) pb[nB++] = sq; }
        else { np += VAL[a]; if (a === B) bBi++; else if (a === R && nrb < 4) rb[nrb++] = sq; }
      }
    }
    if (nW === 0 && nB === 0 && np <= 330) return 0;              // materi tidak cukup
    var i2, f;
    if (wBi >= 2) s += 30; if (bBi >= 2) s -= 30;
    for (i2 = 0; i2 < nW; i2++) {
      sq = pw[i2]; var fx = sq & 7, fy = sq >> 3, passed = true;
      for (f = (fx > 0 ? fx - 1 : 0); f <= (fx < 7 ? fx + 1 : 7); f++) if (bMinY[f] < fy) { passed = false; break; }
      if (passed) s += PASSED[6 - fy];
      if (cntW[fx] > 1) s -= 8;
      if ((fx === 0 || cntW[fx - 1] === 0) && (fx === 7 || cntW[fx + 1] === 0)) s -= 12;
    }
    for (i2 = 0; i2 < nB; i2++) {
      sq = pb[i2]; var gx = sq & 7, gy = sq >> 3, passedB = true;
      for (f = (gx > 0 ? gx - 1 : 0); f <= (gx < 7 ? gx + 1 : 7); f++) if (wMaxY[f] > gy) { passedB = false; break; }
      if (passedB) s -= PASSED[gy - 1];
      if (cntB[gx] > 1) s += 8;
      if ((gx === 0 || cntB[gx - 1] === 0) && (gx === 7 || cntB[gx + 1] === 0)) s += 12;
    }
    for (i2 = 0; i2 < nrw; i2++) { f = rw[i2] & 7; if (cntW[f] === 0) s += (cntB[f] === 0 ? 20 : 10); }
    for (i2 = 0; i2 < nrb; i2++) { f = rb[i2] & 7; if (cntB[f] === 0) s -= (cntW[f] === 0 ? 20 : 10); }
    var ph = np >= 6400 ? 1 : np / 6400;
    var wk = kSq[0], bk = kSq[1];
    s += Math.round(KM[wk] * ph + KE[wk] * (1 - ph)) - Math.round(KM[bk ^ 56] * ph + KE[bk ^ 56] * (1 - ph));
    if (ph > 0.3) {                                                  // perisai pion di depan raja
      var sh = 0, kx = wk & 7, ky = wk >> 3, z;
      if (ky >= 6) for (z = (kx > 0 ? kx - 1 : 0); z <= (kx < 7 ? kx + 1 : 7); z++) { if (board[(ky - 1) * 8 + z] === P) sh += 10; else if (ky >= 2 && board[(ky - 2) * 8 + z] === P) sh += 5; }
      var sb = 0; kx = bk & 7; ky = bk >> 3;
      if (ky <= 1) for (z = (kx > 0 ? kx - 1 : 0); z <= (kx < 7 ? kx + 1 : 7); z++) { if (board[(ky + 1) * 8 + z] === -P) sb += 10; else if (ky <= 5 && board[(ky + 2) * 8 + z] === -P) sb += 5; }
      s += Math.round((sh - sb) * ph);
    }
    return (side > 0 ? s : -s) + 10;
  }

  function hasPieces(us) {
    for (var sq = 0; sq < 64; sq++) { var p = board[sq] * us; if (p >= N && p <= Q) return true; }
    return false;
  }

  function qsearch(alpha, beta, ply) {
    if ((++nodes & 2047) === 0 && Date.now() - tStart > tLimit) stopFlag = true;
    if (stopFlag) return 0;
    if (ply >= MAXPLY - 2) return evaluate();
    var se = evaluate();
    if (se >= beta) return se;
    if (se > alpha) alpha = se;
    var off = ply * 256, n = gen(ply, true), k, m, j2, to, cap, v;
    for (k = off; k < n; k++) {
      m = MV[k]; to = (m >> 6) & 63; cap = board[to]; v = cap ? (cap > 0 ? cap : -cap) : P;
      SC[k] = VV[v] * 16 - ((board[m & 63] > 0 ? board[m & 63] : -board[m & 63])) + (((m >> 12) & 7) ? 5000 : 0);
    }
    for (k = off; k < n; k++) {
      var bi = k, bs = SC[k];
      for (j2 = k + 1; j2 < n; j2++) if (SC[j2] > bs) { bs = SC[j2]; bi = j2; }
      if (bi !== k) { var tm = MV[k]; MV[k] = MV[bi]; MV[bi] = tm; var ts = SC[k]; SC[k] = SC[bi]; SC[bi] = ts; }
      m = MV[k]; to = (m >> 6) & 63; cap = board[to];
      if (!((m >> 12) & 7) && se + (cap ? VV[cap > 0 ? cap : -cap] : 100) + 200 < alpha) continue;   // delta pruning
      make(m);
      if (attacked(kSq[side > 0 ? 1 : 0], side)) { unmake(m); continue; }
      var score = -qsearch(-beta, -alpha, ply + 1);
      unmake(m);
      if (stopFlag) return 0;
      if (score > alpha) { alpha = score; if (alpha >= beta) return alpha; }
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply, doNull) {
    if ((++nodes & 2047) === 0 && Date.now() - tStart > tLimit) stopFlag = true;
    if (stopFlag) return 0;
    var pv = (beta - alpha) > 1, k, j2, m;
    if (ply > 0) {
      if (half >= 100) return 0;
      var lim = histN - half; if (lim < 0) lim = 0;
      for (var r = histN - 2; r >= lim; r -= 2) if (hsLo[r] === hLo && hsHi[r] === hHi) return 0;
      if (alpha < -MATE + ply) alpha = -MATE + ply;
      if (beta > MATE - ply - 1) beta = MATE - ply - 1;
      if (alpha >= beta) return alpha;
    }
    if (ply >= MAXPLY - 2) return evaluate();
    var us = side, inCheck = attacked(kSq[us > 0 ? 0 : 1], -us);
    if (inCheck) depth++;
    if (depth <= 0) return qsearch(alpha, beta, ply);

    var ti = hLo & TTMASK, ttm = 0;
    if (ttK[ti] === hHi && ttD[ti] >= 0) {
      ttm = ttM[ti];
      if (!pv && ply > 0 && ttD[ti] >= depth) {
        var tsc = ttS[ti]; if (tsc > MATE - 200) tsc -= ply; else if (tsc < -MATE + 200) tsc += ply;
        var tf = ttF[ti];
        if (tf === 0) return tsc;
        if (tf === 1 && tsc >= beta) return tsc;
        if (tf === 2 && tsc <= alpha) return tsc;
      }
    }

    var se = 0;
    if (!pv && !inCheck) {
      se = evaluate();
      if (depth <= 3 && se - 110 * depth >= beta && beta > -MATE + 200 && beta < MATE - 200) return se - 110 * depth;
      if (doNull && depth >= 3 && se >= beta && hasPieces(us)) {
        makeNull();
        var ns = -search(depth - 1 - (depth > 6 ? 3 : 2), -beta, -beta + 1, ply + 1, false);
        unmakeNull();
        if (stopFlag) return 0;
        if (ns >= beta) return ns > MATE - 200 ? beta : ns;
      }
    }

    var off = ply * 256, n = gen(ply, false), hi = us > 0 ? 0 : 4096;
    for (k = off; k < n; k++) {
      m = MV[k];
      if (m === ttm) { SC[k] = 2000000; continue; }
      var to = (m >> 6) & 63, cp = board[to], fl = (m >> 15) & 7;
      if (cp !== 0 || fl === 1) {
        var vv = cp ? (cp > 0 ? cp : -cp) : P, mover = board[m & 63]; if (mover < 0) mover = -mover;
        SC[k] = 1000000 + VV[vv] * 16 - mover;
      } else if ((m >> 12) & 7) SC[k] = 950000;
      else if (m === K1[ply]) SC[k] = 900000;
      else if (m === K2[ply]) SC[k] = 890000;
      else SC[k] = HIST[hi + (m & 4095)];
    }

    var best = -INF, bestM = 0, legal = 0, origAlpha = alpha;
    for (k = off; k < n; k++) {
      var bi = k, bs = SC[k];
      for (j2 = k + 1; j2 < n; j2++) if (SC[j2] > bs) { bs = SC[j2]; bi = j2; }
      if (bi !== k) { var t1 = MV[k]; MV[k] = MV[bi]; MV[bi] = t1; var t2 = SC[k]; SC[k] = SC[bi]; SC[bi] = t2; }
      m = MV[k];
      var mto = (m >> 6) & 63, isCap = board[mto] !== 0 || ((m >> 15) & 7) === 1, isPromo = ((m >> 12) & 7) !== 0;
      make(m);
      if (attacked(kSq[side > 0 ? 1 : 0], side)) { unmake(m); continue; }
      legal++;
      var score;
      if (legal === 1) score = -search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        var red = 0;
        if (depth >= 3 && legal >= 4 && !inCheck && !isCap && !isPromo) {
          red = 1 + (legal >= 10 ? 1 : 0) + (depth >= 8 ? 1 : 0);
          if (red > depth - 2) red = depth - 2;
          if (red < 0) red = 0;
        }
        score = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && red > 0) score = -search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) score = -search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake(m);
      if (stopFlag) return 0;
      if (score > best) {
        best = score; bestM = m;
        if (score > alpha) {
          alpha = score;
          if (ply === 0) rootBest = m;
          if (alpha >= beta) {
            if (!isCap && !isPromo) {
              if (K1[ply] !== m) { K2[ply] = K1[ply]; K1[ply] = m; }
              var hv = HIST[hi + (m & 4095)] + depth * depth; HIST[hi + (m & 4095)] = hv > 800000 ? 800000 : hv;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    var flag = best <= origAlpha ? 2 : (best >= beta ? 1 : 0);
    var ss = best; if (ss > MATE - 200) ss += ply; else if (ss < -MATE + 200) ss -= ply;
    if (ttK[ti] !== hHi || ttD[ti] < 0 || ttD[ti] <= depth) {
      ttK[ti] = hHi; ttD[ti] = depth > 120 ? 120 : depth; ttF[ti] = flag; ttS[ti] = ss; ttM[ti] = bestM;
    }
    return best;
  }

  function computeHash() {
    hLo = 0; hHi = 0;
    for (var sq = 0; sq < 64; sq++) if (board[sq]) { var ci = (board[sq] + 6) * 64 + sq; hLo ^= zLo[ci]; hHi ^= zHi[ci]; }
    hLo ^= zCLo[castle]; hHi ^= zCHi[castle];
    if (side < 0) { hLo ^= zSLo; hHi ^= zSHi; }
  }

  function setPos(p) {
    board.fill(0);
    var map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 }, y, x, c;
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      c = p.board[y][x];
      if (c) {
        var t = map[c.toLowerCase()], white = c === c.toUpperCase();
        board[y * 8 + x] = white ? t : -t;
        if (t === 6) kSq[white ? 0 : 1] = y * 8 + x;
      }
    }
    side = p.turn === 'w' ? 1 : -1;
    castle = 0; var cr = p.castling || {};
    if (cr.wK) castle |= 1; if (cr.wQ) castle |= 2; if (cr.bK) castle |= 4; if (cr.bQ) castle |= 8;
    ep = p.ep ? p.ep.y * 8 + p.ep.x : -1;
    half = p.halfmove || 0;
    computeHash();
  }

  function fmt(m, score, depth) {
    var from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7;
    return { x1: from & 7, y1: from >> 3, x2: to & 7, y2: to >> 3, promo: pr ? (pr === Q ? 'q' : 'n') : null, score: score, depth: depth, nodes: nodes };
  }

  function think(opts) {
    tStart = Date.now(); tLimit = opts.movetime || 2000; stopFlag = false; nodes = 0; rootBest = 0;
    K1.fill(0); K2.fill(0); HIST.fill(0);
    var n = gen(0, false), legalList = [], k, m;
    for (k = 0; k < n; k++) {
      m = MV[k]; make(m);
      if (!attacked(kSq[side > 0 ? 1 : 0], side)) legalList.push(m);
      unmake(m);
    }
    if (!legalList.length) return null;
    if (legalList.length === 1) return fmt(legalList[0], 0, 0);
    var best = legalList[0], bestScore = 0, doneD = 0, maxD = opts.maxDepth || 40;
    for (var d = 1; d <= maxD; d++) {
      rootBest = 0;
      var sc = search(d, -INF, INF, 0, true);
      if (stopFlag) { if (rootBest) best = rootBest; break; }
      if (rootBest) best = rootBest;
      bestScore = sc; doneD = d;
      if (sc > MATE - 100) break;
      if (Date.now() - tStart > tLimit * 0.55) break;
    }
    return fmt(best, bestScore, doneD);
  }

  function run(opts) {
    sp = 0; histN = 0;
    var hist = opts.history || [];
    for (var i3 = 0; i3 < hist.length; i3++) { setPos(hist[i3]); hsLo[histN] = hLo; hsHi[histN] = hHi; histN++; }
    setPos(opts);
    return think(opts);
  }

  function perft(d, ply) {
    if (d === 0) return 1;
    var n = gen(ply, false), c = 0;
    for (var k = ply * 256; k < n; k++) {
      var m = MV[k]; make(m);
      if (!attacked(kSq[side > 0 ? 1 : 0], side)) c += perft(d - 1, ply + 1);
      unmake(m);
    }
    return c;
  }
  function perftRun(pos, d) { sp = 0; histN = 0; setPos(pos); return perft(d, 0); }

  return { run: run, perft: perftRun };
}
// ===END ENGINE===

// ============================================================
// ⭕ TTT BOT
// ============================================================
function tttBotMinimax(board, isMax) {
  const result = tttEval(board);
  if (result) {
    if (result.winner === 'O') return 10;
    if (result.winner === 'X') return -10;
    return 0;
  }
  const player = isMax ? 'O' : 'X';
  let best = isMax ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    const nb = board.slice(); nb[i] = player;
    const score = tttBotMinimax(nb, !isMax);
    best = isMax ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function startTTTBot() {
  const stateRef = roomRef.child('state');
  if (tttBotHandler) stateRef.off('value', tttBotHandler);

  tttBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.turn !== 'O') { if (botTimers.ttt) { clearTimeout(botTimers.ttt); botTimers.ttt = null; } return; }
    if (tttEval(data.board)) return;
    if (botTimers.ttt) return;
    botTimers.ttt = setTimeout(() => {
      botTimers.ttt = null;
      roomRef.child('state').transaction(cur => {
        if (!cur || cur.turn !== 'O') return cur;
        if (tttEval(cur.board)) return cur;

        let isRandom = false;
        if(window.botDifficulty === 'normal' && Math.random() < 0.4) isRandom = true;
        if(window.botDifficulty === 'medium' && Math.random() < 0.15) isRandom = true;
        
        let bestMove = null;
        if(isRandom) {
            const empty = cur.board.map((v, i) => v === '' ? i : null).filter(v => v !== null);
            bestMove = empty[Math.floor(Math.random() * empty.length)];
        } else {
            let bestScore = -Infinity;
            for (let i = 0; i < 9; i++) {
              if (cur.board[i]) continue;
              const nb = cur.board.slice(); nb[i] = 'O';
              const score = tttBotMinimax(nb, false);
              if (score > bestScore) { bestScore = score; bestMove = i; }
            }
        }

        if (bestMove === null) return cur;
        const newBoard = cur.board.slice(); newBoard[bestMove] = 'O';
        return { board: newBoard, turn: 'X', round: cur.round || 0 };
      });
    }, 500 + Math.random() * 400);
  };
  stateRef.on('value', tttBotHandler);
}

// ============================================================
// 🐍 SNAKE BOT
// ============================================================
function startSnakeBot() {
  const snakeRef = roomRef.child('snake');
  if (snakeBotHandler) snakeRef.off('value', snakeBotHandler);

  snakeBotHandler = (snap) => {
    const data = snap.val();
    if (!data || !data.players || data.status === 'ended' || data.isRolling) return;
    const keys = Object.keys(data.players);
    const turnKey = keys[data.turnIndex];
    if (!botActiveRoles.includes(turnKey)) { if (botTimers.snake) { clearTimeout(botTimers.snake); botTimers.snake = null; } return; }
    if (botTimers.snake) return;
    botTimers.snake = setTimeout(() => { botTimers.snake = null; snakeBotRoll(snakeRef, turnKey); }, 1100 + Math.random() * 500);
  };
  snakeRef.on('value', snakeBotHandler);
}

function snakeBotRoll(snakeRef, botKey) {
  snakeRef.transaction(cur => {
    if (!cur || !cur.players || cur.status === 'ended' || cur.isRolling) return cur;
    const keys = Object.keys(cur.players);
    if (keys[cur.turnIndex] !== botKey) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    // aturan SAMA dengan pemain manusia (snake.js) -> tidak ada lagi selisih hasil
    snakeComputeRoll(state, botKey, Math.floor(Math.random() * 6) + 1);
    return state;
  });
}

// ============================================================
// 🎴 UNO BOT (Tanpa logika Blunder/Difficulty)
// ============================================================
function startUnoBot() {
  const unoRef = roomRef.child('uno');
  if (unoBotHandler) unoRef.off('value', unoBotHandler);

  unoBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.phase !== 'playing') return;
    const botKey = data.turn;

    if (data.unoChallenge && data.unoChallenge.target === botKey && !data.unoChallenge.shouted) {
      const elapsed = Date.now() - data.unoChallenge.startTime;
      if (elapsed < 2800) {
       if (!botTimers.unoShout) botTimers.unoShout = setTimeout(() => {
          botTimers.unoShout = null;
          unoRef.transaction(cur => {
            if (!cur || !cur.unoChallenge || cur.unoChallenge.target !== botKey || cur.unoChallenge.shouted) return cur;
            const s = JSON.parse(JSON.stringify(cur));
            s.unoChallenge.shouted = true; s.lastActionText = `🎉 ${botKey.toUpperCase()} berhasil Teriak "UNO!"`;
            return s;
          });
        }, 2000 + Math.random() * 500);
        return;
      }
      // jendela teriak sudah lewat -> lanjut jalan, jangan macet
    }

    if (!botActiveRoles.includes(botKey)) { if (botTimers.uno) { clearTimeout(botTimers.uno); botTimers.uno = null; } return; }
    if (botTimers.uno) return;
    botTimers.uno = setTimeout(() => { botTimers.uno = null; unoBotMove(unoRef, botKey); }, 800 + Math.random() * 500);
  };
  unoRef.on('value', unoBotHandler);
}

function unoBotMove(unoRef, botKey) {
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    
    let hand = s.hands[botKey] || [];
    if (!Array.isArray(hand)) hand = Object.values(hand); 
    
    if (hand.length === 0) return cur;

    const curCard = s.currentCard;
    const curCol = curCard.chosenColor || curCard.color;

    if (s.drawStack > 0) s.hasDrawn = false;

    let valid = hand.filter(c => {
      if (s.drawStack > 0) return String(c.value) === String(curCard.value) || c.value === 'draw4';
      return c.color === 'wild' || c.color === curCol || String(c.value) === String(curCard.value);
    });

    if (valid.length === 0) {
      // Ada penalti (+2/+4) dan tidak punya kartu balasan -> WAJIB ambil semua, TIDAK BOLEH pass
      if (s.drawStack > 0) {
        const n = s.drawStack;
        const drawn = drawUnoCards(s, n);
        s.hands[botKey] = [...hand, ...drawn];
        s.drawStack = 0; s.hasDrawn = false; s.turn = nextUnoTurn(s, 1);
        s.unoChallenge = null;
        s.lastActionText = `📥 ${botKey.toUpperCase()} tidak punya kartu balasan, ambil penalti +${n} kartu.`;
        return s;
      }
      // Tidak ada kartu cocok -> ambil 1 dulu; pass hanya boleh SETELAH ambil
      if (s.hasDrawn) {
        s.hasDrawn = false; s.turn = nextUnoTurn(s, 1); s.lastActionText = `⏭️ ${botKey.toUpperCase()} Pass.`;
      } else {
        const drawn = drawUnoCards(s, 1);
        s.hands[botKey] = [...hand, ...drawn];
        s.hasDrawn = true; s.lastActionText = `📥 ${botKey.toUpperCase()} ambil 1 kartu.`;
      }
      return s;
    }

    // Bot Uno selalu main optimal
    const prio = c => c.value === 'draw4' ? 5 : c.value === 'draw2' ? 4 : c.value === 'skip' ? 3 : c.value === 'reverse' ? 2 : c.color === 'wild' ? 0 : 1;
    valid.sort((a, b) => prio(b) - prio(a));

    const chosen = valid[0];
    const idx = hand.findIndex(c => c.id === chosen.id);
    if (idx < 0) return cur;
    hand.splice(idx, 1);

    let jump = 1;
    if (chosen.value === 'skip') jump++;
    else if (chosen.value === 'reverse') { if (unoReverseActsAsSkip(s, botKey)) jump++; else s.direction *= -1; }
    else if (chosen.value === 'draw2') s.drawStack += 2;
    else if (chosen.value === 'draw4') s.drawStack += 4;

    const played = { ...chosen };
    if (chosen.color === 'wild') {
      const counts = {};
      hand.forEach(c => { if (c.color !== 'wild') counts[c.color] = (counts[c.color]||0)+1; });
      const keys = Object.keys(counts);
      played.chosenColor = keys.length ? keys.reduce((a,b) => counts[a] > counts[b] ? a : b) : 'merah';
    }
    unoPushDiscard(s, s.currentCard);
    s.currentCard = played; s.hands[botKey] = hand; s.hasDrawn = false;

    if (hand.length === 1 || hand.length === 0) {
      s.unoChallenge = { target: botKey, type: hand.length === 1 ? 'UNO' : 'UNO GAME', startTime: Date.now(), shouted: false };
    } else s.unoChallenge = null;

    const finished = s.finished || [];
    if (hand.length === 0 && !finished.includes(botKey)) {
      finished.push(botKey); s.finished = finished;
      if (finished.length >= getUnoRoles(s.maxPlayers).length - 1) { s.phase = 'roundover'; return s; }
    }
    s.turn = nextUnoTurn(s, jump);
    return s;
  });
}

// ============================================================
// 🃏 POKER (CAPSA) BOT (Tetap pakai Difficulty)
// ============================================================
function pokerCombinations(arr, k) {
  const out = [];
  if (k > arr.length) return out;
  const n = arr.length;
  const idx = [];
  for (let i = 0; i < k; i++) idx.push(i);
  while (true) {
    out.push(idx.map(i => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

function startPokerBot() {
  const pokerRef = roomRef.child('poker');
  if (pokerBotHandler) pokerRef.off('value', pokerBotHandler);

  pokerBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.phase !== 'playing') return;
    const botKey = data.turn;
    if (!botActiveRoles.includes(botKey)) { if (botTimers.poker) { clearTimeout(botTimers.poker); botTimers.poker = null; } return; }
    if (botTimers.poker) return;
    botTimers.poker = setTimeout(() => { botTimers.poker = null; pokerBotMove(pokerRef, botKey); }, 900 + Math.random() * 500);
  };
  pokerRef.on('value', pokerBotHandler);
}

// Mode HARD: bot boleh MEMBUKA ronde dengan kombo (5/4/3/2 kartu), tidak harus menunggu player.
// Prioritas: kombo terbanyak kartu, lalu yang paling lemah (biar kartu kuat disimpan).
// mustHave3d = true saat langkah pertama ronde (wajib memuat 3♠).
function pokerBotPickLead(hand, mustHave3d) {
  const has3d = c => c.rank === '03' && c.suit === 's';
  for (const k of [5, 4, 3, 2]) {
    if (hand.length < k) continue;
    let best = null;
    for (const cards of pokerCombinations(hand, k)) {
      if (mustHave3d && !cards.some(has3d)) continue;
      const combo = detectCombo(cards);
      if (!combo.valid) continue;
      if (!best || compareCombo(combo, best.combo) < 0) best = { cards, combo };
    }
    if (best) return best;
  }
  // tidak ada kombo: single terkecil (atau 3♠ kalau wajib)
  const single = mustHave3d ? hand.find(has3d) : sortCards(hand)[0];
  return single ? { cards: [single], combo: detectCombo([single]) } : null;
}

function pokerBotMove(pokerRef, botKey) {
  pokerRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    
    let hand = s.hands[botKey] || [];
    if (!Array.isArray(hand)) hand = Object.values(hand); 

    if (s.isFirstPlay) {
      const threeD = hand.find(c => c.rank === '03' && c.suit === 's');
      if (!threeD) {
        if (hand.length > 0) {
          const sorted = sortCards(hand);
          const chosenCard = sorted[0];
          const combo = detectCombo([chosenCard]);
          s.hands[botKey] = removeCards(hand, [chosenCard]);
          s.lastPlay = { by: botKey, cards: [chosenCard], combo };
          s.lastPlayer = botKey; s.passCount = 0; s.isFirstPlay = false;
          s.lastActionText = comboDisplayName(combo);
          return pokerFinishPlay(s, botKey, combo);
        }
        return cur;
      }
      
      let firstCards = [threeD];
      if (window.botDifficulty === 'hard') {
        const pick = pokerBotPickLead(hand, true);
        if (pick) firstCards = pick.cards;
      }
      const combo = detectCombo(firstCards);
      s.hands[botKey] = removeCards(hand, firstCards);
      s.lastPlay = { by: botKey, cards: firstCards, combo };
      s.lastPlayer = botKey; s.passCount = 0; s.isFirstPlay = false;
      s.lastActionText = comboDisplayName(combo);
      return pokerFinishPlay(s, botKey, combo);
    }

    let targetCount = s.lastPlay ? s.lastPlay.combo.count : 1;
    let candidate = null;

    if (!s.lastPlay) {
      const sorted = sortCards(hand);
      if (window.botDifficulty === 'hard') {
        candidate = pokerBotPickLead(hand, false);
      } else if (sorted.length) {
        const combo = detectCombo([sorted[0]]);
        candidate = { cards: [sorted[0]], combo };
      }
    } else {
      const allCombos = pokerCombinations(hand, targetCount);
      
      let validMoves = [];
      for (const cards of allCombos) {
        const combo = detectCombo(cards);
        if (!combo.valid) continue;
        if (isBlockedBeat(s.lastPlay, combo, cards)) continue;
        if (compareCombo(combo, s.lastPlay.combo) <= 0) continue;
        validMoves.push({ cards, combo });
      }

      if (validMoves.length > 0) {
        let blunderChance = 0;
        if (window.botDifficulty === 'normal') blunderChance = 0.4;
        if (window.botDifficulty === 'medium') blunderChance = 0.1;

        if (Math.random() < blunderChance) {
           candidate = validMoves[Math.floor(Math.random() * validMoves.length)];
        } else {
           let bestScore = Infinity;
           for (const mv of validMoves) {
             const sc = mv.combo.level * 1000 + (mv.combo.tiebreak[0] || 0);
             if (sc < bestScore) { bestScore = sc; candidate = mv; }
           }
        }
      }
    }

    if (!candidate) {
      if (!s.lastPlay) return cur;
      s.passCount = (s.passCount || 0) + 1;
      s.lastActionText = 'pass';
      const finished = pokerOutList(s);
      const pl = pokerPlayers(s), threshold = pokerPassThreshold(s);
      if (s.passCount >= threshold) {
        s.lastPlay = null; s.passCount = 0;
        let ret = s.lastPlayer || nextActiveRole(botKey, finished, pl);
        if (finished.includes(ret)) ret = nextActiveRole(ret, finished, pl);
        s.turn = ret;
      } else {
        s.turn = nextActiveRole(botKey, finished, pl);
      }
      return s;
    }

    const remain = removeCards(hand, candidate.cards);
    s.hands[botKey] = remain;
    s.lastPlay = { by: botKey, cards: candidate.cards, combo: candidate.combo };
    s.lastPlayer = botKey; s.passCount = 0;
    s.lastActionText = comboDisplayName(candidate.combo);

    return pokerFinishPlay(s, botKey, candidate.combo);
  });
}

// ============================================================
// 🁣 DOMINO GAPLE BOT (tanpa pilihan Difficulty — selalu main pintar)
//  buang kartu berat/balak dulu + jaga agar ujung papan cocok dengan sisa kartu sendiri
// ============================================================
function startDominoBot() {
  const dRef = roomRef.child('domino');
  if (dominoBotHandler) dRef.off('value', dominoBotHandler);

  dominoBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.phase !== 'playing') return;
    const botKey = data.turn;
    if (!botActiveRoles.includes(botKey)) { if (botTimers.domino) { clearTimeout(botTimers.domino); botTimers.domino = null; } return; }
    if (botTimers.domino) return;
    botTimers.domino = setTimeout(() => { botTimers.domino = null; dominoBotMove(dRef, botKey); }, 900 + Math.random() * 600);
  };
  dRef.on('value', dominoBotHandler);
}

function dominoBotChoose(moves, hand, board) {
  const ends = dominoEnds(board);
  let best = null, bestScore = -Infinity;
  moves.forEach(m => {
    const t = m.tile;
    let score = dominoPips(t) + (t.a === t.b ? 3 : 0);          // buang kartu berat & balak dulu
    {
      // ujung papan setelah langkah ini
      let nl = ends ? ends.l : t.a, nr = ends ? ends.r : t.b;
      if (!ends) { nl = t.a; nr = t.b; }
      else if (m.side === 'l') nl = t.a === ends.l ? t.b : t.a;
      else nr = t.a === ends.r ? t.b : t.a;
      const rest = hand.filter(h => h.id !== t.id);
      const own = v => rest.filter(h => h.a === v || h.b === v).length;
      score += 2.5 * (own(nl) + (nr !== nl ? own(nr) : 0));    // ujung yang masih bisa kita lanjutkan
    }
    score += Math.random() * 0.5;
    if (score > bestScore) { bestScore = score; best = m; }
  });
  return best;
}

function dominoBotMove(dRef, botKey) {
  dRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    const hand = dmArr(s.hands[botKey]);
    const moves = dominoMoves(hand, s.board, s);
    if (moves.length === 0) return dominoApplyPass(s, botKey) ? s : cur;
    const m = dominoBotChoose(moves, hand, s.board) || moves[0];
    return dominoApplyPlay(s, botKey, m.tile.id, m.side) ? s : cur;
  });
}


// ============================================================
// 🤖 ISI KURSI KOSONG DENGAN BOT (room online, mis. 2 manusia + 2 bot)
// - Tombol hanya muncul untuk HOST (p1) dan hanya kalau masih ada kursi kosong
// - Bot yang mengisi SELALU mode Hard (window.botDifficulty = 'hard')
// - Bot dijalankan di perangkat host; kalau host keluar, bot ikut hilang
// - Catur & Tic-Tac-Toe hanya 2 pemain (tidak ada kursi kosong) -> tidak ada tombol,
//   untuk itu tetap pakai menu "MAIN VS BOT"
// ============================================================
const BOT_FILL_CFG = {
  poker:  { max: 4, back: 'btnPokerBack',  phasePath: 'poker/phase',  names: 'poker/names' },
  uno:    { max: 4, back: 'btnUnoBack',    phasePath: 'uno/phase',    names: 'uno/names' },
  domino: { max: 4, back: 'btnDominoBack', phasePath: 'domino/phase', names: null },
  snake:  { max: 2, back: 'btnSnakeBack',  phasePath: null,           names: null }
};
const BOT_ALL_ROLES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
let botFillBtn = null;
let botFillMax = 0;
let botFillEmpty = [];

function botStartHandlersFor(game) {
  if (game === 'snake')  startSnakeBot();
  if (game === 'uno')    startUnoBot();
  if (game === 'poker')  startPokerBot();
  if (game === 'domino') startDominoBot();
}

function botFillRefresh() {
  if (!botFillBtn || !roomRef) return;
  const cfg = BOT_FILL_CFG[currentGame];
  if (!cfg) return;
  Promise.all([
    roomRef.child('presence').once('value'),
    cfg.phasePath ? roomRef.child(cfg.phasePath).once('value') : Promise.resolve(null)
  ]).then(([ps, ph]) => {
    const pres = ps.val() || {};
    const phase = ph ? ph.val() : 'playing-snake';
    const empty = BOT_ALL_ROLES.slice(0, botFillMax).filter(r => !pres[r]);
    botFillEmpty = empty;
    // Ronde yang sedang jalan tidak boleh disisipi pemain baru (kecuali Ular Tangga yang kursinya sudah ada sejak awal)
    const phaseOk = cfg.phasePath ? (phase && phase !== 'playing') : true;
    const show = empty.length > 0 && phaseOk;
    botFillBtn.style.display = show ? 'flex' : 'none';
    if (show) botFillBtn.textContent = '🤖 Isi ' + empty.length + ' kursi kosong dengan Bot (Hard)';
  }).catch(() => {});
}

function botFillRun() {
  if (myRole !== 'p1' || !roomRef || !botFillBtn) return;
  const empty = botFillEmpty.slice();
  if (!empty.length) { botFillRefresh(); return; }
  botFillBtn.disabled = true;

  const claimed = [];
  const finish = () => {
    botFillBtn.disabled = false;
    if (!claimed.length) {
      showCustomAlert('Kursi barusan terisi pemain lain.', '🤖 Bot');
      botFillRefresh();
      return;
    }
    window.botDifficulty = 'hard';                       // bot pengisi selalu pintar
    botActiveRoles = Array.from(new Set(botActiveRoles.concat(claimed)));
    const cfg = BOT_FILL_CFG[currentGame];
    if (cfg && cfg.names) {
      claimed.forEach(r => { roomRef.child(cfg.names + '/' + r).set('🤖 Bot ' + r.slice(1)); });
    }
    cleanupBotListeners();
    botStartHandlersFor(currentGame);
    botFillRefresh();
    showCustomAlert(claimed.length + ' bot (Hard) bergabung: ' + claimed.map(r => r.toUpperCase()).join(', ') + '.', '🤖 Bot ditambahkan');
  };

  const claimNext = (i) => {
    if (i >= empty.length) { finish(); return; }
    const r = empty[i];
    const pRef = roomRef.child('presence/' + r);
    pRef.transaction(cur => (cur === null ? true : undefined), (err, committed) => {
      if (!err && committed) {
        pRef.onDisconnect().remove();                    // host keluar -> bot ikut keluar
        botPresenceRefs[r] = pRef;
        claimed.push(r);
      }
      claimNext(i + 1);
    });
  };
  claimNext(0);
}

function setupBotFillUI() {
  if (window.isBotMode || myRole !== 'p1' || !roomRef) return;
  const cfg = BOT_FILL_CFG[currentGame];
  if (!cfg || document.getElementById('btnFillBots')) return;
  const back = document.getElementById(cfg.back);
  if (!back || !back.parentNode) return;

  roomRef.child('maxPlayers').once('value').then(snap => {
    botFillMax = snap.val() || cfg.max;
    const btn = document.createElement('button');
    btn.id = 'btnFillBots';
    btn.type = 'button';
    btn.className = 'btn-menu';
    btn.style.cssText = 'margin-top:12px; justify-content:center; text-align:center; background:linear-gradient(135deg,#7c3aed,#a855f7); color:#fff; display:none;';
    btn.onclick = botFillRun;
    back.parentNode.insertBefore(btn, back);
    botFillBtn = btn;
    roomRef.child('presence').on('value', botFillRefresh);
    if (cfg.phasePath) roomRef.child(cfg.phasePath).on('value', botFillRefresh);
    botFillRefresh();
  }).catch(() => {});
}
