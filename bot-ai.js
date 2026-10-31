// ======================================================
// bot-ai.js — Otak bot (murni logika, tanpa UI / Firebase)
// Dimuat SETELAH Catur.js & Tttc.js (memakai fungsi catur & LINES dari sana)
// Level: 'normal' (bisa kalah) dan 'hard' (sangat sulit dikalahkan)
// ======================================================

const BotAI = (function(){

  // ---------------------------------------------------
  // TIC-TAC-TOE
  // ---------------------------------------------------
  const T_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function tttWinner(b){
    for(const l of T_LINES){
      if(b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
    }
    return b.every(c => c) ? 'draw' : null;
  }

  // skor dari sudut pandang `me`; makin cepat menang makin bagus
  function tttMinimax(b, turn, me, depth){
    const w = tttWinner(b);
    if(w === me) return 10 - depth;
    if(w === 'draw') return 0;
    if(w) return depth - 10;
    const other = turn === 'X' ? 'O' : 'X';
    let best = turn === me ? -Infinity : Infinity;
    for(let i = 0; i < 9; i++){
      if(b[i]) continue;
      b[i] = turn;
      const s = tttMinimax(b, other, me, depth + 1);
      b[i] = '';
      best = turn === me ? Math.max(best, s) : Math.min(best, s);
    }
    return best;
  }

  function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  // board: array 9 isi 'X' | 'O' | ''. Mengembalikan index sel yang dipilih bot.
  function tttMove(board, mySymbol, level){
    const b = board.slice();
    const empty = [];
    for(let i = 0; i < 9; i++) if(!b[i]) empty.push(i);
    if(!empty.length) return -1;

    // NORMAL: 35% asal jalan -> manusia punya peluang menang
    if(level !== 'hard' && Math.random() < 0.35) return pick(empty);

    // papan kosong: semua sudut & tengah sama-sama optimal -> tak perlu hitung
    if(empty.length === 9) return pick([0, 2, 4, 6, 8]);

    const other = mySymbol === 'X' ? 'O' : 'X';
    let bestScore = -Infinity, bestMoves = [];
    for(const i of empty){
      b[i] = mySymbol;
      const s = tttMinimax(b, other, mySymbol, 1);
      b[i] = '';
      if(s > bestScore){ bestScore = s; bestMoves = [i]; }
      else if(s === bestScore) bestMoves.push(i);
    }
    return pick(bestMoves);
  }

  // ---------------------------------------------------
  // CATUR
  // Memakai: chessAllLegalMoves, chessApplyMove, chessIsInCheck, chessColorOf (Catur.js)
  // ---------------------------------------------------
  const MATE = 100000;
  const VAL = { p:100, n:320, b:330, r:500, q:900, k:0 };
  const PST = {
    p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],
        [0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
    n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],
        [-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
    b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],
        [-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
    r: [[0,0,0,0,0,0,0,0],[5,10,10,10,10,10,10,5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
    q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[-5,0,5,5,5,5,0,-5],
        [0,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
    k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],
        [20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
  };

  // skor posisi dari sudut pandang `color` (positif = bagus untuk color)
  function evaluate(board, color){
    let s = 0;
    for(let y = 0; y < 8; y++){
      for(let x = 0; x < 8; x++){
        const p = board[y][x];
        if(!p) continue;
        const t = p.toLowerCase();
        const white = p === p.toUpperCase();
        const row = white ? y : 7 - y;
        const v = VAL[t] + PST[t][row][x];
        s += white ? v : -v;
      }
    }
    return color === 'w' ? s : -s;
  }

  let deadline = 0, nodes = 0, timeUp = false;

  function isCapture(board, m){
    return !!board[m.y2][m.x2] || m.flag === 'enpassant';
  }

  // urutkan: tangkapan paling bernilai dulu (MVV-LVA), lalu promosi
  function orderMoves(board, moves){
    const sc = m => {
      let s = 0;
      const tgt = board[m.y2][m.x2];
      if(tgt) s += 10 * VAL[tgt.toLowerCase()] - VAL[board[m.y1][m.x1].toLowerCase()] / 10 + 1000;
      else if(m.flag === 'enpassant') s += 1000;
      if(m.promotion) s += 800;
      return s;
    };
    return moves.map(m => ({ m, s: sc(m) })).sort((a, b) => b.s - a.s).map(o => o.m);
  }

  function nextState(board, state, m){
    const r = chessApplyMove(board, state, m, 'q');
    return { board: r.board, state: { castling: r.castling, ep: r.ep, halfmove: r.halfmove } };
  }

  function quiesce(board, state, color, alpha, beta, qd){
    const stand = evaluate(board, color);
    if(qd <= 0) return stand;
    if(stand >= beta) return beta;
    if(stand > alpha) alpha = stand;
    const opp = color === 'w' ? 'b' : 'w';
    const caps = orderMoves(board, chessAllLegalMoves(board, state, color).filter(m => isCapture(board, m) || m.promotion));
    for(const m of caps){
      const n = nextState(board, state, m);
      const s = -quiesce(n.board, n.state, opp, -beta, -alpha, qd - 1);
      if(timeUp) return 0;
      if(s >= beta) return beta;
      if(s > alpha) alpha = s;
    }
    return alpha;
  }

  function negamax(board, state, color, depth, alpha, beta, ply, useQ){
    if((++nodes & 127) === 0 && Date.now() > deadline) timeUp = true;
    if(timeUp) return 0;
    const moves = chessAllLegalMoves(board, state, color);
    if(moves.length === 0) return chessIsInCheck(board, color) ? -MATE + ply : 0;
    if((state.halfmove || 0) >= 100) return 0;
    if(depth <= 0) return useQ ? quiesce(board, state, color, alpha, beta, 3) : evaluate(board, color);
    const opp = color === 'w' ? 'b' : 'w';
    for(const m of orderMoves(board, moves)){
      const n = nextState(board, state, m);
      const s = -negamax(n.board, n.state, opp, depth - 1, -beta, -alpha, ply + 1, useQ);
      if(timeUp) return 0;
      if(s >= beta) return beta;
      if(s > alpha) alpha = s;
    }
    return alpha;
  }

  // Hitung skor tiap langkah root pada kedalaman tertentu.
  // exact=true  : semua skor akurat (dipakai Normal untuk memilih secara acak)
  // exact=false : alpha-beta penuh di root (jauh lebih cepat; hanya langkah terbaik yang akurat)
  function scoreRoot(board, state, color, moves, depth, useQ, exact){
    const opp = color === 'w' ? 'b' : 'w';
    const out = [];
    let alpha = -Infinity;
    for(const m of moves){
      const n = nextState(board, state, m);
      const s = -negamax(n.board, n.state, opp, depth - 1, -Infinity, exact ? Infinity : -alpha, 1, useQ);
      if(timeUp) return null;
      out.push({ m, s });
      if(s > alpha) alpha = s;
    }
    return out;
  }

  // board: array 8x8 (huruf besar = putih). state: {castling, ep, halfmove}.
  // Mengembalikan objek move (format sama dgn chessAllLegalMoves) atau null bila tidak ada langkah.
  function chessMove(board, state, color, level){
    const legal = chessAllLegalMoves(board, state, color);
    if(!legal.length) return null;
    if(legal.length === 1) return legal[0];

    nodes = 0; timeUp = false;

    if(level === 'hard'){
      // Iterative deepening sampai depth 4 (+quiescence), maks ~2.2 detik
      deadline = Date.now() + 2000;
      let ordered = orderMoves(board, legal);
      let best = null;
      for(let d = 1; d <= 4; d++){
        const res = scoreRoot(board, state, color, ordered, d, true, false);
        if(!res) break;                       // waktu habis -> pakai iterasi sebelumnya
        res.sort((a, b) => b.s - a.s);
        best = res;
        ordered = res.map(r => r.m);          // iterasi berikut mulai dari yg terbaik
        if(res[0].s > MATE / 2) break;        // sudah ketemu skakmat paksa
      }
      if(!best) return ordered[0];
      return best[0].m;
    }

    // NORMAL: lihat 2  langkah ke depan, lalu pilih agak "ceroboh"
    deadline = Date.now() + 1500;
    const res = scoreRoot(board, state, color, orderMoves(board, legal), 2, false, true) || legal.map(m => ({ m, s: 0 }));
    res.sort((a, b) => b.s - a.s);
    if(res[0].s > MATE / 2) return res[0].m;              // skakmat 1 langkah: selalu diambil
    const r = Math.random();
    if(r < 0.20){                                          // 20%: salah satu dari 4 langkah teratas
      return pick(res.slice(0, Math.min(4, res.length))).m;
    }
    const margin = 90;                                     // sisanya: acak di antara langkah "cukup bagus"
    return pick(res.filter(x => x.s >= res[0].s - margin)).m;
  }

  return { tttMove, chessMove };
})();
