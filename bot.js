// ======================================================
// bot.js — Mode Lawan Bot (main sendiri tanpa teman)
// Dimuat paling akhir, setelah shared.js, semua file game, dan bot-ai.js
//
// Cara kerja: bot jadi "pemain virtual" (p2) di room Firebase biasa.
// Kode game yang sudah ada TIDAK diubah — bot cuma membaca state room
// lalu menulis langkahnya persis seperti pemain kedua.
// Room mode bot bersifat privat (tidak muncul di Online Rooms).
// ======================================================

(function(){
  const BOT_ROLE = 'p2';
  const LEVEL_LABEL = { normal: 'Normal', hard: 'Hard' };
  const GAME_LABEL  = { chess: '♟ Catur', ttt: '⭕ Tic-Tac-Toe', uno: '🎴 Uno', poker: '🃏 Poker Capsa' };
  const $ = (id) => document.getElementById(id);

  let botPendingGame = null;
  let botPendingCount = 1;      // jumlah bot (khusus Uno)
  let botAgentStarted = false;
  let botCreating = false;

  // ---------------- UI FLOW ----------------
  $('btnGoBot').onclick = () => showScreen('botGameScreen');
  $('btnBotGameBack').onclick = () => showScreen('startScreen');

  document.querySelectorAll('#botGameScreen .btn-menu[data-bot-game]').forEach(btn => {
    btn.onclick = () => {
      botPendingGame = btn.dataset.botGame;
      botPendingCount = botPendingGame === 'poker' ? 3 : 1;
      if(botPendingGame === 'uno'){ showScreen('botCountScreen'); return; }
      goBotLevel();
    };
  });

  function goBotLevel(){
    let label = GAME_LABEL[botPendingGame] || '';
    if(botPendingGame === 'poker') label += ' (kamu + 3 bot)';
    if(botPendingGame === 'uno') label += ' (kamu + ' + botPendingCount + ' bot)';
    $('botLevelGameName').textContent = label;
    showScreen('botLevelScreen');
  }

  $('btnBotCountBack').onclick = () => showScreen('botGameScreen');
  document.querySelectorAll('#botCountScreen .btn-menu[data-bot-count]').forEach(btn => {
    btn.onclick = () => {
      botPendingCount = parseInt(btn.dataset.botCount, 10) || 1;
      goBotLevel();
    };
  });

  $('btnBotLevelBack').onclick = () => showScreen(botPendingGame === 'uno' ? 'botCountScreen' : 'botGameScreen');

  document.querySelectorAll('#botLevelScreen .btn-menu[data-bot-level]').forEach(btn => {
    btn.onclick = () => startBotGame(btn.dataset.botLevel);
  });

  // ---------------- BUAT ROOM BOT ----------------
  function startBotGame(level){
    if(botCreating || !botPendingGame) return;
    botCreating = true;

    currentGame = botPendingGame;
    myRole = 'p1';
    chessTimeControl = 0;           // lawan bot: tanpa jam catur

    // peran yang dimainkan bot: p2 (1v1) / p2..p4 (Uno & Capsa banyak pemain)
    const botCount = currentGame === 'poker' ? 3 : (currentGame === 'uno' ? botPendingCount : 1);
    const botRoles = ['p2', 'p3', 'p4', 'p5', 'p6'].slice(0, botCount);
    const totalPlayers = botCount + 1;
    if(currentGame === 'uno') window.unoSelectedMaxPlayers = totalPlayers;

    function tryCreate(attemptsLeft){
      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      const candidateRef = dbRoot.ref('rooms/' + roomId);

      candidateRef.transaction(
        (cur) => (cur === null ? {
          created: Date.now(),
          game: currentGame,
          mapSeed: Math.floor(Math.random() * 1e9),
          timeControl: 0,
          maxPlayers: totalPlayers,
          bot: { role: botRoles[0], roles: botRoles, level: level }
        } : undefined),
        (err, committed) => {
          if(err || !committed){
            if(attemptsLeft > 0){ tryCreate(attemptsLeft - 1); return; }
            botCreating = false;
            showCustomAlert('Gagal membuat room bot. Cek koneksi internet lalu coba lagi.');
            return;
          }
          roomIdGlobal = roomId;
          roomRef = candidateRef;
          showRoomBadge(roomId);
          botCreating = false;
          enterGame();              // -> dibungkus di bawah, bot otomatis aktif
        }
      );
    }
    tryCreate(5);
  }

  // ---------------- AKTIFKAN BOT SAAT MASUK GAME ----------------
  // Dibungkus supaya jalan juga untuk "Lanjutkan Room" (resume).
  const originalEnterGame = enterGame;
  enterGame = function(){
    originalEnterGame();
    setTimeout(startBotAgentIfAny, 150);   // tunggu initChess/initTTT selesai (mereka jalan di +50ms)
  };

  function startBotAgentIfAny(){
    if(botAgentStarted || !roomRef || myRole !== 'p1') return;
    const gameAtStart = currentGame;
    roomRef.child('bot').once('value').then(snap => {
      const cfg = snap.val();
      if(!cfg || botAgentStarted || currentGame !== gameAtStart) return;
      botAgentStarted = true;
      const level = cfg.level === 'hard' ? 'hard' : 'normal';

      const roles = (cfg.roles && cfg.roles.length) ? cfg.roles : [cfg.role || BOT_ROLE];

      keepBotPresence(roles);
      labelBotUI(gameAtStart, level);

      if(gameAtStart === 'ttt')   startTTTBot(level);
      if(gameAtStart === 'chess') startChessBot(level);
      if(gameAtStart === 'uno')   startUnoBot(level, roles);
      if(gameAtStart === 'poker') startPokerBot(level, roles);
    }).catch(err => console.warn('[bot] gagal membaca konfigurasi bot:', err));
  }

  // Bot "online" selama host online (otomatis hilang kalau host putus)
  function keepBotPresence(roles){
    dbRoot.ref('.info/connected').on('value', (snap) => {
      if(snap.val() === true){
        roles.forEach(r => {
          const pr = roomRef.child('presence/' + r);
          pr.onDisconnect().remove();
          pr.set(true);
        });
      }
    });
  }

  function labelBotUI(game, level){
    const tagId = { chess: 'chessRoleTag', ttt: 'tttRoleTag', uno: 'unoRoleTag', poker: 'pokerRoleTag' }[game];
    const tag = tagId && $(tagId);
    if(tag) tag.textContent = tag.textContent + ' • vs 🤖 Bot ' + LEVEL_LABEL[level];

    if(game === 'chess'){
      // timpa teks "N Pemain terhubung" milik setupPresence
      roomRef.child('presence').on('value', () => {
        const el = $('chessStatus');
        if(el && !chessGameOver){
          el.textContent = '🤖 Lawan Bot (' + LEVEL_LABEL[level] + ')';
          el.style.color = 'var(--green)';
        }
      });
    }
  }

  // ---------------- BOT TIC-TAC-TOE ----------------
  // Bot memegang 'O' (p2). Host (p1) memegang 'X'.
  function startTTTBot(level){
    const SYM = 'O';
    let pending = false;

    const normBoard = (raw) => { const b = []; for(let i = 0; i < 9; i++) b.push((raw && raw[i]) || ''); return b; };

    function consider(d){
      if(pending || !d || d.turn !== SYM) return;
      if(tttEval(normBoard(d.board))) return;         // ronde sudah selesai
      pending = true;

      setTimeout(() => {
        roomRef.child('state').transaction((cur) => {
          if(!cur || cur.turn !== SYM) return;         // sudah bukan giliran bot -> batal
          const b = normBoard(cur.board);
          if(tttEval(b)) return;
          const idx = BotAI.tttMove(b, SYM, level);
          if(idx < 0 || b[idx]) return;
          b[idx] = SYM;
          return { board: b, turn: 'X', round: cur.round || 0 };
        }, () => { pending = false; }, false);
      }, 600 + Math.random() * 500);
    }

    roomRef.child('state').on('value', snap => consider(snap.val()));
  }

  // ---------------- BOT CATUR ----------------
  // Bot memegang Hitam (p2). Host (p1) memegang Putih dan jalan duluan.
  function startChessBot(level){
    const COLOR = 'b';
    let busy = false;

    const setStatus = (t) => { const el = $('chessStatus'); if(el) el.textContent = t; };

    function commitBotMove(move){
      const state = { castling: chessCastling, ep: chessEP, halfmove: chessHalfmove };
      const result = chessApplyMove(chessBoardState, state, move, 'q');   // promosi otomatis jadi Ratu
      const nextTurn = 'w';

      const write = roomRef.child('state').set({
        board: JSON.stringify(result.board), turn: nextTurn, castling: result.castling,
        ep: result.ep, halfmove: result.halfmove, clocks: null, turnStartAt: null
      });

      const key = chessPositionKey(result.board, nextTurn, result.castling, result.ep);
      roomRef.child('posCounts/' + key).transaction(c => (c || 0) + 1).then(res => {
        if(res.committed && res.snapshot.val() >= 3) chessDeclareResult('draw', 'threefold');
      }).catch(() => {});

      const legalNext = chessAllLegalMoves(result.board, { castling: result.castling, ep: result.ep }, nextTurn);
      if(legalNext.length === 0){
        if(chessIsInCheck(result.board, nextTurn)) chessDeclareResult(BOT_ROLE, 'checkmate');
        else chessDeclareResult('draw', 'stalemate');
      } else if(result.halfmove >= 100){
        chessDeclareResult('draw', 'fifty');
      } else if(chessIsInsufficientMaterial(result.board)){
        chessDeclareResult('draw', 'insufficient');
      }
      return write;
    }

    function consider(){
      if(busy || chessGameOver || chessTurn !== COLOR || !chessBoardState) return;
      busy = true;
      setStatus('🤖 Bot sedang berpikir...');

      // jeda singkat supaya teks "berpikir" sempat tampil sebelum perhitungan berat
      setTimeout(() => {
        let write = null;
        try{
          if(!chessGameOver && chessTurn === COLOR){
            const state = { castling: chessCastling, ep: chessEP, halfmove: chessHalfmove };
            const mv = BotAI.chessMove(chessBoardState, state, COLOR, level);
            if(mv) write = commitBotMove(mv);
          }
        }catch(e){
          console.error('[bot] error catur:', e);
        }
        Promise.resolve(write).catch(() => {}).then(() => { busy = false; });
      }, 450 + Math.random() * 400);
    }

    // listener milik initChess sudah terpasang lebih dulu -> variabel global sudah terbarui
    roomRef.child('state').on('value', consider);
    consider();
  }

  // ---------------- BOT UNO ----------------
  // Bot mengisi kursi p2..pN. Kamu (p1) selalu jalan duluan.
  function startUnoBot(level, roles){
    const uRef = roomRef.child('uno');
    const busy = {};
    const planned = new Set();
    let latest = null;

    roles.forEach((r, i) => uRef.child('names/' + r).transaction(cur => cur || ('🤖 Bot ' + (i + 1))));

    function shout(ch, role){
      uRef.transaction(cur => BotAI.unoApplyShout(cur, role, ch.startTime) || undefined);
    }
    function catchBy(role, ch){
      uRef.transaction(cur => BotAI.unoApplyCatch(cur, role, ch.startTime) || undefined);
    }

    function act(role){
      const d = latest;
      const done = () => { busy[role] = false; handle(latest); };
      if(!d || d.phase !== 'playing' || d.turn !== role){ done(); return; }

      const hand = d.hands[role] || [];
      const nextRole = nextUnoTurn(d, 1);
      const choice = BotAI.unoChoose(hand, d.currentCard, d.drawStack || 0, level,
        { nextHandSize: (d.hands[nextRole] || []).length });

      let fn;
      if(choice) fn = cur => BotAI.unoApplyPlay(cur, role, choice.cards, choice.color);
      else if((d.drawStack || 0) > 0 || !d.hasDrawn) fn = cur => BotAI.unoApplyDraw(cur, role);
      else fn = cur => BotAI.unoApplyPass(cur, role);

      uRef.transaction(cur => fn(cur) || undefined, done, false);
    }

    function handle(d){
      latest = d;
      if(!d) return;

      // Tantangan UNO: bot teriak sendiri (Normal kadang lupa) & bot bisa "DOR" pemain yang lupa
      const ch = d.unoChallenge;
      if(ch && !ch.shouted){
        const ck = 'ch' + ch.startTime;
        if(!planned.has(ck)){
          planned.add(ck);
          if(roles.includes(ch.target) && (level === 'hard' || Math.random() < 0.75)){
            setTimeout(() => shout(ch, ch.target), 600 + Math.random() * 900);
          }
          const catcher = roles.find(r => r !== ch.target);
          if(catcher && (level === 'hard' || Math.random() < 0.5)){
            const wait = Math.max(0, ch.startTime + 2100 + Math.random() * 300 - Date.now());
            setTimeout(() => catchBy(catcher, ch), wait);
          }
        }
      }

      if(d.phase === 'playing' && roles.includes(d.turn) && !busy[d.turn]){
        const role = d.turn;
        busy[role] = true;
        setTimeout(() => act(role), 900 + Math.random() * 800);
      }
    }

    uRef.on('value', snap => handle(snap.val()));
  }

  // ---------------- BOT POKER CAPSA ----------------
  // Bot mengisi p2, p3, p4. Kamu (p1) host.
  function startPokerBot(level, roles){
    const pRef = roomRef.child('poker');
    const busy = {};
    let latest = null;

    roles.forEach((r, i) => pRef.child('names/' + r).transaction(cur => cur || ('🤖 Bot ' + (i + 1))));

    function act(role){
      const d = latest;
      const done = () => { busy[role] = false; handle(latest); };
      if(!d || d.phase !== 'playing' || d.turn !== role){ done(); return; }

      const hand = sortCards((d.hands && d.hands[role]) || []);
      const finished = d.finished || [];
      const opp = ROLES.filter(r => r !== role && !finished.includes(r))
                       .map(r => ((d.hands && d.hands[r]) || []).length);
      const cards = BotAI.capsaChoose(hand, d, level, { minOpp: opp.length ? Math.min.apply(null, opp) : 13 });

      let fn;
      if(cards) fn = cur => BotAI.capsaApplyPlay(cur, role, cards);
      else      fn = cur => BotAI.capsaApplyPass(cur, role);

      pRef.transaction(cur => fn(cur) || undefined, done, false);
    }

    function handle(d){
      latest = d;
      if(!d || d.phase !== 'playing' || !roles.includes(d.turn) || busy[d.turn]) return;
      const role = d.turn;
      busy[role] = true;
      setTimeout(() => act(role), 1000 + Math.random() * 900);
    }

    pRef.on('value', snap => handle(snap.val()));
  }
})();
