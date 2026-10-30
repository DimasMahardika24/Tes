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

function cleanupBotListeners() {
  try {
    if (chessBotHandler && roomRef) roomRef.child('state').off('value', chessBotHandler);
    if (tttBotHandler && roomRef) roomRef.child('state').off('value', tttBotHandler);
    if (snakeBotHandler && roomRef) roomRef.child('snake').off('value', snakeBotHandler);
    if (unoBotHandler && roomRef) roomRef.child('uno').off('value', unoBotHandler);
    if (pokerBotHandler && roomRef) roomRef.child('poker').off('value', pokerBotHandler);
  } catch(e) {}
  
  chessBotHandler = null; tttBotHandler = null; snakeBotHandler = null; unoBotHandler = null; pokerBotHandler = null;

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
  const stateRef = roomRef.child('state');
  if (chessBotHandler) stateRef.off('value', chessBotHandler);

  chessBotHandler = (snap) => {
    const data = snap.val();
    if (!data || data.turn !== 'b') { if (botTimers.chess) { clearTimeout(botTimers.chess); botTimers.chess = null; } return; }
    if (botTimers.chess) return;
    botTimers.chess = setTimeout(() => { botTimers.chess = null; makeChessBotMove(data); }, 700 + Math.random() * 500);
  };
  stateRef.on('value', chessBotHandler);
}

function makeChessBotMove(data) {
  const board = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;
  const state = { castling: data.castling || { wK:false, wQ:false, bK:false, bQ:false }, ep: data.ep || null, halfmove: data.halfmove || 0 };
  const moves = chessAllLegalMoves(board, state, 'b');
  if (moves.length === 0) return;

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
  const res = chessApplyMove(board, state, bestMove, bestMove.promotion ? 'q' : null);

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
}

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
    if (!cur || cur.status === 'ended' || cur.isRolling) return cur;
    const keys = Object.keys(cur.players);
    if (keys[cur.turnIndex] !== botKey) return cur;

    const state = JSON.parse(JSON.stringify(cur));
    const dice = Math.floor(Math.random() * 6) + 1;
    let pos = (state.players[botKey].pos || 1) + dice;
    if (pos > 100) pos = 100;

    const event = SNAKES_AND_LADDERS.find(s => s.start === pos);
    if (event) pos = event.end;

    keys.forEach(k => { if (k !== botKey && state.players[k].pos === pos && pos < 100 && !state.players[k].rank) state.players[k].pos = 1; });
    state.players[botKey].pos = pos;
    if (pos >= 100 && !state.players[botKey].rank) state.players[botKey].rank = keys.filter(k => state.players[k].rank > 0).length + 1;

    const finishedNow = keys.filter(k => state.players[k].rank > 0);
    if (finishedNow.length >= keys.length - 1) state.status = 'ended';
    else {
      let nextIdx = state.turnIndex;
      if (dice !== 6 || pos >= 100) {
        do { nextIdx = (nextIdx + 1) % keys.length; } while (state.players[keys[nextIdx]].rank > 0);
        state.turnIndex = nextIdx;
      }
    }
    state.lastDice = dice;
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
      if (elapsed < 2800 && !botTimers.unoShout) {
        botTimers.unoShout = setTimeout(() => {
          botTimers.unoShout = null;
          unoRef.transaction(cur => {
            if (!cur || !cur.unoChallenge || cur.unoChallenge.target !== botKey || cur.unoChallenge.shouted) return cur;
            const s = JSON.parse(JSON.stringify(cur));
            s.unoChallenge.shouted = true; s.lastActionText = `🎉 ${botKey.toUpperCase()} berhasil Teriak "UNO!"`;
            return s;
          });
        }, 2000 + Math.random() * 500);
      }
      return;
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

    let valid = hand.filter(c => {
      if (s.drawStack > 0) return c.value === curCard.value || c.value === 'draw4';
      return c.color === 'wild' || c.color === curCol || String(c.value) === String(curCard.value);
    });

    if (valid.length === 0) {
      if (s.drawStack > 0) {
        const drawn = drawUnoCards(s, s.drawStack);
        s.hands[botKey] = [...hand, ...drawn];
        s.drawStack = 0; s.hasDrawn = false; s.turn = nextUnoTurn(s, 1);
        s.lastActionText = `📥 ${botKey.toUpperCase()} terpaksa ambil penalti +${drawn.length} kartu.`;
        return s;
      }
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
    else if (chosen.value === 'reverse') { if (getUnoRoles(s.maxPlayers).length === 2) jump++; else s.direction *= -1; }
    else if (chosen.value === 'draw2') s.drawStack += 2;
    else if (chosen.value === 'draw4') s.drawStack += 4;

    const played = { ...chosen };
    if (chosen.color === 'wild') {
      const counts = {};
      hand.forEach(c => { if (c.color !== 'wild') counts[c.color] = (counts[c.color]||0)+1; });
      const keys = Object.keys(counts);
      played.chosenColor = keys.length ? keys.reduce((a,b) => counts[a] > counts[b] ? a : b) : 'merah';
    }
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

function pokerBotMove(pokerRef, botKey) {
  pokerRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== botKey) return cur;
    const s = JSON.parse(JSON.stringify(cur));
    
    let hand = s.hands[botKey] || [];
    if (!Array.isArray(hand)) hand = Object.values(hand); 

    if (s.isFirstPlay) {
      const threeD = hand.find(c => c.rank === '03' && c.suit === 'd');
      if (!threeD) {
        if (hand.length > 0) {
          const sorted = sortCards(hand);
          const chosenCard = sorted[0];
          const combo = detectCombo([chosenCard]);
          s.hands[botKey] = removeCards(hand, [chosenCard]);
          s.lastPlay = { by: botKey, cards: [chosenCard], combo };
          s.lastPlayer = botKey; s.passCount = 0; s.isFirstPlay = false;
          s.lastActionText = comboDisplayName(combo);
          s.turn = nextActiveRole(botKey, s.finished || []);
          return s;
        }
        return cur;
      }
      
      const combo = detectCombo([threeD]);
      s.hands[botKey] = removeCards(hand, [threeD]);
      s.lastPlay = { by: botKey, cards: [threeD], combo };
      s.lastPlayer = botKey; s.passCount = 0; s.isFirstPlay = false;
      s.lastActionText = comboDisplayName(combo);
      s.turn = nextActiveRole(botKey, s.finished || []);
      return s;
    }

    let targetCount = s.lastPlay ? s.lastPlay.combo.count : 1;
    let candidate = null;

    if (!s.lastPlay) {
      const sorted = sortCards(hand);
      if (sorted.length) {
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
      const finished = s.finished || [];
      const threshold = Math.max(4 - finished.length - 1, 1);
      if (s.passCount >= threshold) {
        s.lastPlay = null; s.passCount = 0;
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
    s.lastPlayer = botKey; s.passCount = 0;
    s.lastActionText = comboDisplayName(candidate.combo);

    const finished = s.finished || [];
    if (remain.length === 0 && !finished.includes(botKey)) {
      finished.push(botKey); s.finished = finished;
      if (finished.length >= 3) {
        s.phase = 'roundover'; s.loser = ROLES.find(r => !finished.includes(r)) || null; s.winner = finished[0];
        return s;
      }
    }
    s.turn = nextActiveRole(botKey, s.finished || []);
    return s;
  });
}