// ======================================================
// bot.js — Single-player mode: bot menggantikan pemain lain
// Game yang didukung: Catur, TTT, Poker, Uno, Ular Tangga
// (Monopoli sedang maintenance, tidak termasuk)
// ======================================================

let botActiveRoles = [];
const botTimers = {};
const botPresenceRefs = {};

function startBotForCurrentGame() {
  if (!window.isBotMode || !roomRef) return;

  const game = currentGame;
  let botRoles = [];

  if (game === 'chess' || game === 'ttt') {
    botRoles = ['p2'];
  } else if (game === 'poker') {
    botRoles = ['p2', 'p3', 'p4'];
  } else if (game === 'uno') {
    const maxP = window.unoSelectedMaxPlayers || 4;
    botRoles = ['p2','p3','p4','p5','p6'].slice(0, maxP - 1);
  } else if (game === 'snake') {
    const maxP = window.snakeSelectedMaxPlayers || 2;
    botRoles = ['p2','p3','p4','p5','p6','p7'].slice(0, maxP - 1);
  } else {
    // Monopoli / game tak dikenal — skip
    console.warn('[bot] game tidak didukung mode bot:', game);
    return;
  }

  botActiveRoles = botRoles;

  // Daftarkan presence semua bot
  botRoles.forEach(r => {
    const ref = roomRef.child('presence/' + r);
    ref.set(true);
    ref.onDisconnect().remove();
    botPresenceRefs[r] = ref;
  });

  // Mulai AI sesuai game
  setTimeout(() => {
    if (game === 'chess') startChessBot();
    if (game === 'ttt')   startTTTBot();
    if (game === 'snake') startSnakeBot();
    if (game === 'uno')   startUnoBot();
    if (game === 'poker') startPokerBot();
  }, 500);
}

// ============================================================
// ♟ CATUR BOT — Minimax depth 3 + alpha-beta
// ============================================================
const CHESS_VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };

function chessBotEval(board) {
  let score = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const p = board[y][x];
    if (!p) continue;
    const v = CHESS_VAL[p.toLowerCase()] || 0;
    score += chessColorOf(p) === 'w' ? v : -v;
  }
  return score;
}

function chessBotMinimax(board, state, depth, side, botColor, alpha, beta) {
  const moves = chessAllLegalMoves(board, state, side);
  if (moves.length === 0) {
    if (chessIsInCheck(board, side)) return side === botColor ? -99999 : 99999;
    return 0;
  }
  if (depth === 0) return chessBotEval(board);

  const maximizing = (side === botColor);
  let best = maximizing ? -Infinity : Infinity;

  moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));

  for (const m of moves) {
    const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
    const nextSide = side === 'w' ? 'b' : 'w';
    const childState = { castling: res.castling, ep: res.ep, halfmove: res.halfmove };
    const score = chessBotMinimax(res.board, childState, depth - 1, nextSide, botColor, alpha, beta);

    if (maximizing) {
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
  const botColor = 'b';
  const stateRef = roomRef.child('state');

  stateRef.on('value', snap => {
    const data = snap.val();
    if (!data) return;
    if (data.turn !== botColor) {
      if (botTimers.chess) { clearTimeout(botTimers.chess); botTimers.chess = null; }
      return;
    }
    if (botTimers.chess) return;
    botTimers.chess = setTimeout(() => {
      botTimers.chess = null;
      makeChessBotMove(data);
    }, 700 + Math.random() * 800);
  });
}

function makeChessBotMove(data) {
  const board = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;
  const state = {
    castling: data.castling || { wK:false, wQ:false, bK:false, bQ:false },
    ep: data.ep || null,
    halfmove: data.halfmove || 0
  };

  const moves = chessAllLegalMoves(board, state, 'b');
  if (moves.length === 0) return; // mate / stalemate — game detect sendiri

  let bestScore = Infinity;
  let bestMove = null;
  moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0));

  for (const m of moves) {
    const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
    const score = chessBotMinimax(
      res.board,
      { castling: res.castling, ep: res.ep, halfmove: res.halfmove },
      2,
      'w',
      'b',
      -Infinity,
      Infinity
    );
    if (score < bestScore) { bestScore = score; bestMove = m; }
  }

  if (!bestMove) bestMove = moves[0];

  const res = chessApplyMove(board, state, bestMove, bestMove.promotion ? 'q' : null);

  roomRef.child('state').set({
    board: JSON.stringify(res.board),
    turn: 'w',
    castling: res.castling,
    ep: res.ep,
    halfmove: res.halfmove,
    clocks: null,
    turnStartAt: null
  });
}

// ============================================================
// ⭕ TTT BOT — Minimax sempurna
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
    const nb = board.slice();
    nb[i] = player;
    const score = tttBotMinimax(nb, !isMax);
    best = isMax ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function startTTTBot() {
  roomRef.child('state').on('value', snap => {
    const data = snap.val();
    if (!data || data.turn !== 'O') {
      if (botTimers.ttt) { clearTimeout(botTimers.ttt); botTimers.ttt = null; }
      return;
    }
    if (tttEval(data.board)) return;
    if (botTimers.ttt) return;
    botTimers.ttt = setTimeout(() => {
      botTimers.ttt = null;
      roomRef.child('state').transaction(cur => {
        if (!cur || cur.turn !== 'O') return cur;
        if (tttEval(cur.board)) return cur;
        let bestScore = -Infinity, bestMove = null;
        for (let i = 0; i < 9; i++) {
          if (cur.board[i]) continue;
          const nb = cur.board.slice();
          nb[i] = 'O';
          const score = tttBotMinimax(nb, false);
          if (score > bestScore) { bestScore = score; bestMove = i; }
        }
        if (bestMove === null) return cur;
        const newBoard = cur.board.slice();
        newBoard[bestMove] = 'O';
        return { board: newBoard, turn: 'X', round: cur.round || 0 };
      });
    }, 500 + Math.random() * 500);
  });
}

// ============================================================
// 🐍 SNAKE BOT — auto-roll
// ============================================================
function startSnakeBot() {
  const snakeRef = roomRef.child('snake');
  snakeRef.on('value', snap => {
    const data = snap.val();
    if (!data || !data.players || data.status === 'ended' || data.isRolling) return;
    const keys = Object.keys(data.players);
    const turnKey = keys[data.turnIndex];
    if (!botActiveRoles.includes(turnKey)) {
      if (botTimers.snake) { clearTimeout(botTimers.snake); botTimers.snake = null; }
      return;
    }
    if (botTimers.snake) return;
    botTimers.snake = setTimeout(() => {
      botTimers.snake = null;
      snakeBotRoll(snakeRef, turnKey);
    }, 1100 + Math.random() * 900);
  });
}

function snakeBotRoll(snakeRef, botKey) {
  snakeRef.transaction(cur => {
    if (!cur || cur.status === 'ended' || cur.isRolling) return cur;
    const keys = Object.keys(cur.players);
    const turnKey = keys[cur.turnIndex];
    if (turnKey !== botKey) return cur;

    const state = JSON.parse(JSON.stringify(cur));
    const dice = Math.floor(Math.random() * 6) + 1;
    let pos = (state.players[botKey].pos || 1) + dice;
    if (pos > 100) pos = 100;

    const event = SNAKES_AND_LADDERS.find(s => s.start === pos);
    if (event) pos = event.end;

    keys.forEach(k => {
      if (k !== botKey && state.players[k].pos === pos && pos < 100 && !state.players[k].rank) {
        state.players[k].pos = 1;
      }
    });

    state.players[botKey].pos = pos;
    if (pos >= 100 && !state.players[botKey].rank) {
      state.players[botKey].rank = keys.filter(k => state.players[k].rank > 0).length + 1;
    }

    const finishedNow = keys.filter(k => state.players[k].rank > 0);
    if (finishedNow.length >= keys.length - 1) {
      state.status = 'ended';
    } else {
      let nextIdx = state.turnIndex;
      if (dice === 6 && pos < 100) {
        // roll again — tetap
      } else {
        do { nextIdx = (nextIdx + 1) % keys.length; }
        while (state.players[keys[nextIdx]].rank > 0);
        state.turnIndex = nextIdx;
      }
    }

    state.lastDice = dice;
    return state;
  });
}

// ============================================================
// 🎴 UNO BOT — greedy dengan prioritas aksi + shout otomatis
// ============================================================
function startUnoBot() {
  const unoRef = roomRef.child('uno');
  unoRef.on('value', snap => {
    const data = snap.val();
    if (!data || data.phase !== 'playing') return;
    const botKey = data.turn;

    // Bot jadi target UNO challenge → buru-buru teriak
    if (data.unoChallenge && data.unoChallenge.target === botKey && !data.unoChallenge.shouted) {
      const elapsed = Date.now() - data.unoChallenge.startTime;
      if (elapsed < 2800 && !botTimers.unoShout) {
        botTimers.unoShout = setTimeout(() => {
          botTimers.unoShout = null;
          unoRef.transaction(cur => {
            if (!cur || !cur.unoChallenge || cur.unoChallenge.target !== botKey || cur.unoChallenge.shouted) return cur;
            const s = JSON.parse(JSON.stringify(cur));
            s.unoChallenge.shouted = true;
            s.lastActionText = `🎉 ${botKey.toUpperCase()} berhasil Teriak "UNO!"`;
            return s;
          });
        }, 2000 + Math.random() * 700);
      }
      return;
    }

    if (!botActiveRoles.includes(botKey)) {
      if (botTimers.uno) { clearTimeout(botTimers.uno); botTimers.uno = null; }
      return;
    }
    if (botTimers.uno) return;
    botTimers.uno = setTimeout(() => {
      botTimers.uno = null;
      unoBotMove(unoRef, botKey);
    }, 800 + Math.random() * 700);
  });
}

function unoBotMove(unoRef, botKey) {
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    const hand = s.hands[botKey] || [];
    if (hand.length === 0) return cur;

    const curCard = s.currentCard;
    const curCol = curCard.chosenColor || curCard.color;

    let valid = hand.filter(c => {
      if (s.drawStack > 0) return c.value === curCard.value || c.value === 'draw4';
      return c.color === 'wild' || c.color === curCol || String(c.value) === String(curCard.value);
    });

    if (valid.length === 0) {
      if (s.hasDrawn) {
        s.hasDrawn = false;
        s.turn = nextUnoTurn(s, 1);
        s.lastActionText = `⏭️ ${botKey.toUpperCase()} Pass.`;
      } else {
        const drawn = drawUnoCards(s, 1);
        s.hands[botKey] = [...hand, ...drawn];
        s.hasDrawn = true;
        s.lastActionText = `📥 ${botKey.toUpperCase()} ambil kartu.`;
      }
      return s;
    }

    const prio = c => c.value === 'draw4' ? 5 : c.value === 'draw2' ? 4
                   : c.value === 'skip' ? 3 : c.value === 'reverse' ? 2
                   : c.color === 'wild' ? 0 : 1;
    valid.sort((a, b) => prio(b) - prio(a));
    const chosen = valid[0];

    const idx = hand.findIndex(c => c.id === chosen.id);
    if (idx < 0) return cur;
    hand.splice(idx, 1);

    let jump = 1;
    if (chosen.value === 'skip') jump++;
    else if (chosen.value === 'reverse') {
      if (getUnoRoles(s.maxPlayers).length === 2) jump++;
      else s.direction *= -1;
    } else if (chosen.value === 'draw2') s.drawStack += 2;
    else if (chosen.value === 'draw4') s.drawStack += 4;

    const played = { ...chosen };
    if (chosen.color === 'wild') {
      const counts = {};
      hand.forEach(c => { if (c.color !== 'wild') counts[c.color] = (counts[c.color]||0)+1; });
      const keys = Object.keys(counts);
      played.chosenColor = keys.length ? keys.reduce((a,b) => counts[a] > counts[b] ? a : b) : 'merah';
    }
    s.currentCard = played;
    s.hands[botKey] = hand;
    s.hasDrawn = false;

    if (hand.length === 1 || hand.length === 0) {
      s.unoChallenge = {
        target: botKey,
        type: hand.length === 1 ? 'UNO' : 'UNO GAME',
        startTime: Date.now(),
        shouted: false
      };
    } else {
      s.unoChallenge = null;
    }

    const finished = s.finished || [];
    if (hand.length === 0 && !finished.includes(botKey)) {
      finished.push(botKey);
      s.finished = finished;
      if (finished.length >= getUnoRoles(s.maxPlayers).length - 1) {
        s.phase = 'roundover';
        return s;
      }
    }
    s.turn = nextUnoTurn(s, jump);
    return s;
  });
}

// ============================================================
// 🃏 POKER BOT — greedy: cari combo valid terkecil
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
  pokerRef.on('value', snap => {
    const data = snap.val();
    if (!data || data.phase !== 'playing') return;
    const botKey = data.turn;
    if (!botActiveRoles.includes(botKey)) {
      if (botTimers.poker) { clearTimeout(botTimers.poker); botTimers.poker = null; }
      return;
    }
    if (botTimers.poker) return;
    botTimers.poker = setTimeout(() => {
      botTimers.poker = null;
      pokerBotMove(pokerRef, botKey);
    }, 900 + Math.random() * 700);
  });
}

function pokerBotMove(pokerRef, botKey) {
  pokerRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    const hand = s.hands[botKey] || [];

    // First play: wajib 3♦
    if (s.isFirstPlay) {
      const threeD = hand.find(c => c.rank === '03' && c.suit === 'd');
      if (!threeD) return cur;
      const combo = detectCombo([threeD]);
      s.hands[botKey] = removeCards(hand, [threeD]);
      s.lastPlay = { by: botKey, cards: [threeD], combo };
      s.lastPlayer = botKey;
      s.passCount = 0;
      s.isFirstPlay = false;
      s.lastActionText = comboDisplayName(combo);
      s.turn = nextActiveRole(botKey, s.finished || []);
      return s;
    }

    // Cari play yang valid
    let targetCount;
    if (!s.lastPlay) targetCount = 1;
    else targetCount = s.lastPlay.combo.count;

    let candidate = null;
    if (!s.lastPlay) {
      const sorted = sortCards(hand);
      if (sorted.length) {
        const combo = detectCombo([sorted[0]]);
        candidate = { cards: [sorted[0]], combo };
      }
    } else {
      const allCombos = pokerCombinations(hand, targetCount);
      let bestScore = Infinity;
      for (const cards of allCombos) {
        const combo = detectCombo(cards);
        if (!combo.valid) continue;
        if (isBlockedBeat(s.lastPlay, combo, cards)) continue;
        if (compareCombo(combo, s.lastPlay.combo) <= 0) continue;
        const sc = combo.level * 1000 + (combo.tiebreak[0] || 0);
        if (sc < bestScore) { bestScore = sc; candidate = { cards, combo }; }
      }
    }

    if (!candidate) {
      if (!s.lastPlay) return cur;
      s.passCount = (s.passCount || 0) + 1;
      s.lastActionText = 'pass';
      const finished = s.finished || [];
      const threshold = Math.max(4 - finished.length - 1, 1);
      if (s.passCount >= threshold) {
        s.lastPlay = null;
        s.passCount = 0;
        let ret = s.lastPlayer || nextActiveRole(botKey, finished);
        if (finished.includes(ret)) ret = nextActiveRole(ret, finished);
        s.turn = ret;
      } else {
        s.turn = nextActiveRole(botKey, finished);
      }
      return s;
    }

    const remain = removeCards(hand, candidate.cards);
    s.hands[botKey] = remain;
    s.lastPlay = { by: botKey, cards: candidate.cards, combo: candidate.combo };
    s.lastPlayer = botKey;
    s.passCount = 0;
    s.lastActionText = comboDisplayName(candidate.combo);

    const finished = s.finished || [];
    if (remain.length === 0 && !finished.includes(botKey)) {
      finished.push(botKey);
      s.finished = finished;
      if (finished.length >= 3) {
        s.phase = 'roundover';
        s.loser = ROLES.find(r => !finished.includes(r)) || null;
        s.winner = finished[0];
        return s;
      }
    }
    s.turn = nextActiveRole(botKey, s.finished || []);
    return s;
  });
}