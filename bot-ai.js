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


  // ---------------------------------------------------
  // UNO  (memakai: nextUnoTurn, getUnoRoles, drawUnoCards, unoNames dari Uno.js)
  // ---------------------------------------------------
  const U_COLORS = ['merah', 'kuning', 'hijau', 'biru'];

  function unoNameOf(role){
    return (typeof unoNames !== 'undefined' && unoNames && unoNames[role]) || role.toUpperCase();
  }

  // aturan yang sama persis dengan unoDoPlay milik pemain
  function unoPlayable(card, top, stack){
    const curCol = top.chosenColor || top.color;
    if(stack > 0 && card.value !== top.value && card.value !== 'draw4') return false;
    if(card.color !== 'wild' && card.color !== curCol && String(card.value) !== String(top.value)) return false;
    return true;
  }

  function unoColorCounts(cards){
    const c = { merah: 0, kuning: 0, hijau: 0, biru: 0 };
    cards.forEach(x => { if(x.color !== 'wild') c[x.color]++; });
    return c;
  }

  function unoBestColor(cards){
    const c = unoColorCounts(cards);
    let best = [], m = -1;
    U_COLORS.forEach(k => {
      if(c[k] > m){ m = c[k]; best = [k]; }
      else if(c[k] === m) best.push(k);
    });
    return pick(best);
  }

  // Mengembalikan { cards:[...], color } atau null (artinya: harus ambil kartu / pass)
  function unoChoose(hand, top, stack, level, info){
    const playable = hand.filter(c => unoPlayable(c, top, stack));
    if(!playable.length) return null;
    const nextSize = (info && info.nextHandSize) || 7;

    if(level !== 'hard'){
      // NORMAL: asal pilih yang cocok, kadang buang wild terlalu cepat
      const nonWild = playable.filter(c => c.color !== 'wild');
      const pool = (nonWild.length && Math.random() < 0.8) ? nonWild : playable;
      const card = pick(pool);
      let color = null;
      if(card.color === 'wild'){
        const rest = hand.filter(c => c.id !== card.id);
        color = (rest.some(c => c.color !== 'wild') && Math.random() < 0.5) ? unoBestColor(rest) : pick(U_COLORS);
      }
      return { cards: [card], color };
    }

    // HARD: simpan wild, serang saat lawan hampir habis, buang kartu sewarna terbanyak
    const counts = unoColorCounts(hand);
    const danger = nextSize <= 2;
    const score = (c) => {
      if(c.color === 'wild'){
        let s = -50;
        if(hand.length <= 3) s += 45;
        if(danger && c.value === 'draw4') s += 70;
        return s;
      }
      let s = counts[c.color] * 3;
      if(c.value === 'draw2') s += danger ? 60 : 8;
      else if(c.value === 'skip') s += danger ? 50 : 6;
      else if(c.value === 'reverse') s += danger ? 30 : 4;
      else s += Number(c.value) / 10;
      return s;
    };
    let bestS = -Infinity, bests = [];
    playable.forEach(c => {
      const sc = score(c);
      if(sc > bestS){ bestS = sc; bests = [c]; }
      else if(sc === bestS) bests.push(c);
    });
    const best = pick(bests);

    if(best.color === 'wild'){
      const rest = hand.filter(c => c.id !== best.id);
      return { cards: [best], color: unoBestColor(rest) };
    }
    // buang semua kartu bernilai sama sekaligus; kartu terakhir menentukan warna meja
    const others = hand.filter(c => c.id !== best.id && c.value === best.value && c.color !== 'wild')
                       .sort((a, b) => counts[a.color] - counts[b.color]);
    return { cards: [best].concat(others), color: null };
  }

  // ----- transisi state Uno (murni; dipakai di dalam transaction Firebase) -----
  function unoApplyPlay(cur, role, selected, chosenColor){
    if(!cur || cur.phase !== 'playing' || cur.turn !== role) return null;
    const state = JSON.parse(JSON.stringify(cur));
    const curHand = state.hands[role] || [];

    selected.forEach(card => {
      const idx = curHand.findIndex(c => c.id === card.id);
      if(idx !== -1) curHand.splice(idx, 1);
    });

    let jump = 1;
    selected.forEach(card => {
      if(card.value === 'skip') jump++;
      else if(card.value === 'reverse'){
        if(getUnoRoles(state.maxPlayers).length === 2) jump++;
        else state.direction *= -1;
      } else if(card.value === 'draw2') state.drawStack = (state.drawStack || 0) + 2;
      else if(card.value === 'draw4') state.drawStack = (state.drawStack || 0) + 4;
    });

    const last = Object.assign({}, selected[selected.length - 1]);
    if(last.color === 'wild' && chosenColor) last.chosenColor = chosenColor;

    state.currentCard = last;
    state.hands[role] = curHand;
    state.hasDrawn = false;

    if(curHand.length === 1 || curHand.length === 0){
      const mode = curHand.length === 1 ? 'UNO' : 'UNO GAME';
      state.unoChallenge = { target: role, type: mode, startTime: Date.now(), shouted: false };
      state.lastActionText = '📢 ' + unoNameOf(role) + ' sisa ' + curHand.length + ' kartu! Pemicu TERIAK ' + mode + ' aktif!';
    } else {
      state.unoChallenge = null;
    }

    const finished = state.finished || [];
    if(curHand.length === 0 && !finished.includes(role)){
      finished.push(role);
      state.finished = finished;
      if(finished.length >= getUnoRoles(state.maxPlayers).length - 1){
        state.phase = 'roundover';
        return state;
      }
    }
    state.turn = nextUnoTurn(state, (state.drawStack || 0) > 0 ? 1 : jump);
    return state;
  }

  function unoApplyDraw(cur, role){
    if(!cur || cur.phase !== 'playing' || cur.turn !== role) return null;
    const state = JSON.parse(JSON.stringify(cur));
    if((state.drawStack || 0) > 0){
      const drawn = drawUnoCards(state, state.drawStack);
      state.hands[role] = (state.hands[role] || []).concat(drawn);
      state.drawStack = 0;
      state.hasDrawn = false;
      state.turn = nextUnoTurn(state, 1);
      state.lastActionText = '📥 ' + unoNameOf(role) + ' mengambil penalti +' + drawn.length + ' kartu.';
      return state;
    }
    if(!state.hasDrawn){
      const drawn = drawUnoCards(state, 1);
      state.hands[role] = (state.hands[role] || []).concat(drawn);
      state.hasDrawn = true;
      state.lastActionText = '📥 ' + unoNameOf(role) + ' mengambil 1 kartu.';
      return state;
    }
    return null;
  }

  function unoApplyPass(cur, role){
    if(!cur || cur.phase !== 'playing' || cur.turn !== role || !cur.hasDrawn) return null;
    const state = JSON.parse(JSON.stringify(cur));
    state.hasDrawn = false;
    state.turn = nextUnoTurn(state, 1);
    state.lastActionText = '⏭️ ' + unoNameOf(role) + ' memilih Pass.';
    return state;
  }

  function unoApplyShout(cur, role, startTime){
    if(!cur || !cur.unoChallenge || cur.unoChallenge.target !== role || cur.unoChallenge.shouted) return null;
    if(startTime && cur.unoChallenge.startTime !== startTime) return null;
    const state = JSON.parse(JSON.stringify(cur));
    state.unoChallenge.shouted = true;
    const txt = state.unoChallenge.type === 'UNO GAME' ? 'UNO GAME!' : 'UNO!';
    state.lastActionText = '🎉 ' + unoNameOf(role) + ' berhasil Teriak "' + txt + '"';
    return state;
  }

  function unoApplyCatch(cur, role, startTime){
    if(!cur || !cur.unoChallenge || cur.unoChallenge.target === role || cur.unoChallenge.shouted) return null;
    if(startTime && cur.unoChallenge.startTime !== startTime) return null;
    const state = JSON.parse(JSON.stringify(cur));
    const target = state.unoChallenge.target;
    const drawn = drawUnoCards(state, 2);
    state.hands[target] = (state.hands[target] || []).concat(drawn);
    if(state.finished && state.finished.includes(target)){
      state.finished = state.finished.filter(r => r !== target);
      if(state.phase === 'roundover') state.phase = 'playing';
    }
    state.lastActionText = '💥 ' + unoNameOf(role) + ' teriak "DOR!" ' + unoNameOf(target) +
      ' Lupa Teriak ' + (state.unoChallenge.type || 'UNO') + '! (Kena penalti +2 kartu)';
    state.unoChallenge = null;
    return state;
  }

  // ---------------------------------------------------
  // CAPSA BANTING  (memakai: detectCombo, compareCombo, isBlockedBeat, removeCards,
  //                 nextActiveRole, ROLES, comboDisplayName dari Poker.js)
  // ---------------------------------------------------
  function capsaCombos(hand){
    const res = [], n = hand.length;
    for(let k = 1; k <= 5; k++){
      const idx = [];
      (function rec(start){
        if(idx.length === k){
          const cards = idx.map(i => hand[i]);
          const combo = detectCombo(cards);
          if(combo.valid) res.push({ cards, combo });
          return;
        }
        for(let i = start; i < n; i++){ idx.push(i); rec(i + 1); idx.pop(); }
      })(0);
    }
    return res;
  }

  function capsaStrength(c){
    const t = c.combo, tb = t.tiebreak[0] || 0;
    const base = (t.type === 'single' || t.type === 'pair' || t.type === 'triple') ? tb / 4 : tb;
    return t.level * 6 + base;
  }

  // penalti kalau kombinasi ini memecah pair/triple/four yang sebenarnya bagus disimpan
  function capsaBreakPenalty(c, rankCount){
    const used = {};
    c.cards.forEach(x => { used[x.rank] = (used[x.rank] || 0) + 1; });
    let pen = 0;
    Object.keys(used).forEach(r => { if(used[r] < rankCount[r]) pen += (c.combo.count <= 3 ? 8 : 3); });
    return pen;
  }

  // hand: kartu bot (sudah diurutkan). data: state poker. info: { minOpp }
  // Mengembalikan array kartu yang dimainkan, atau null untuk PASS (hanya jika ada kartu di meja).
  function capsaChoose(hand, data, level, info){
    const lp = data.lastPlay;
    const all = capsaCombos(hand);
    const is3d = c => c.rank === '03' && c.suit === 'd';
    let cands, leading = false;

    if(data.isFirstPlay){ cands = all.filter(x => x.cards.some(is3d)); leading = true; }
    else if(lp){
      cands = all.filter(x => x.combo.count === lp.combo.count &&
        !isBlockedBeat(lp, x.combo, x.cards) && compareCombo(x.combo, lp.combo) > 0);
    } else { cands = all; leading = true; }

    if(!cands.length) return null;
    const finishing = cands.find(x => x.cards.length === hand.length);
    if(finishing) return finishing.cards;

    const rankCount = {};
    hand.forEach(c => { rankCount[c.rank] = (rankCount[c.rank] || 0) + 1; });
    const has2 = x => x.cards.some(c => c.rank === '02');
    const minOpp = (info && info.minOpp) || 13;

    if(leading){
      if(level !== 'hard'){
        let pool = cands;
        if(hand.length > 4 && Math.random() < 0.7){
          const nb = cands.filter(x => !x.cards.some(c => c.rank === '02' || c.rank === 'A'));
          if(nb.length) pool = nb;
        }
        const sizes = Array.from(new Set(pool.map(x => x.cards.length)));
        const k = pick(sizes);
        const same = pool.filter(x => x.cards.length === k).sort((a, b) => capsaStrength(a) - capsaStrength(b));
        return same[0].cards;
      }
      // HARD: buang sebanyak mungkin kartu rendah, jangan boros 2 / pecah pair
      let bestS = -Infinity, bests = [];
      cands.forEach(x => {
        const sc = x.cards.length * 12 - capsaStrength(x) * 1.2 - (has2(x) && hand.length > 5 ? 25 : 0) - capsaBreakPenalty(x, rankCount);
        if(sc > bestS){ bestS = sc; bests = [x]; }
        else if(sc === bestS) bests.push(x);
      });
      return pick(bests).cards;
    }

    // MENGIKUTI kartu di meja
    if(level !== 'hard'){
      const sorted = cands.slice().sort((a, b) => compareCombo(a.combo, b.combo));
      if(Math.random() < 0.2) return null;                 // kadang pass walau bisa
      if(sorted.length > 1 && Math.random() < 0.15) return sorted[1].cards;
      return sorted[0].cards;
    }

    // HARD
    const byCost = cands.slice().sort((a, b) =>
      (capsaStrength(a) + capsaBreakPenalty(a, rankCount)) - (capsaStrength(b) + capsaBreakPenalty(b, rankCount)));
    if(minOpp <= 2 && lp.combo.count <= 2){
      // lawan hampir habis: blokir pakai kartu tertinggi
      return cands.slice().sort((a, b) => capsaStrength(b) - capsaStrength(a))[0].cards;
    }
    const cheapest = byCost[0];
    const lpStrength = capsaStrength({ combo: lp.combo });
    if(has2(cheapest) && hand.length > 6 && minOpp > 3 && lp.combo.count <= 2 && lpStrength <= 8) return null;
    return cheapest.cards;
  }

  // ----- transisi state Capsa (murni; dipakai di dalam transaction Firebase) -----
  function capsaApplyPlay(cur, role, selected){
    if(!cur || cur.phase !== 'playing' || cur.turn !== role) return null;
    const state = JSON.parse(JSON.stringify(cur));
    const curHand = state.hands[role] || [];
    const remain = removeCards(curHand, selected);
    if(remain.length !== curHand.length - selected.length) return null;

    const c2 = detectCombo(selected);
    if(!c2.valid) return null;
    if(state.isFirstPlay){
      if(!selected.some(c => c.rank === '03' && c.suit === 'd')) return null;
    } else if(state.lastPlay){
      if(c2.count !== state.lastPlay.combo.count) return null;
      if(isBlockedBeat(state.lastPlay, c2, selected)) return null;
      if(compareCombo(c2, state.lastPlay.combo) <= 0) return null;
    }

    state.hands[role] = remain;
    state.lastPlay = { by: role, cards: selected, combo: c2 };
    state.lastPlayer = role;
    state.passCount = 0;
    state.isFirstPlay = false;
    state.lastActionText = comboDisplayName(c2);

    const finished = state.finished || [];
    if(remain.length === 0 && !finished.includes(role)){
      finished.push(role);
      state.finished = finished;
      if(finished.length >= 3){
        state.phase = 'roundover';
        state.loser = ROLES.find(r => !finished.includes(r)) || null;
        state.winner = finished[0];
        return state;
      }
    }
    state.turn = nextActiveRole(role, state.finished || []);
    return state;
  }

  function capsaApplyPass(cur, role){
    if(!cur || cur.phase !== 'playing' || cur.turn !== role || !cur.lastPlay) return null;
    const state = JSON.parse(JSON.stringify(cur));
    const finished = state.finished || [];
    state.passCount = (state.passCount || 0) + 1;
    state.lastActionText = 'pass';

    const activeCount = 4 - finished.length;
    const threshold = Math.max(activeCount - 1, 1);
    if(state.passCount >= threshold){
      state.lastPlay = null;
      state.passCount = 0;
      let returnee = state.lastPlayer || nextActiveRole(role, finished);
      if(finished.includes(returnee)) returnee = nextActiveRole(returnee, finished);
      state.turn = returnee;
    } else {
      state.turn = nextActiveRole(role, finished);
    }
    return state;
  }

  return {
    tttMove, chessMove,
    unoChoose, unoApplyPlay, unoApplyDraw, unoApplyPass, unoApplyShout, unoApplyCatch,
    capsaChoose, capsaApplyPlay, capsaApplyPass
  };
})();
