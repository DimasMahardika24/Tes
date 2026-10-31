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
  const GAME_LABEL  = { chess: '♟ Catur', ttt: '⭕ Tic-Tac-Toe' };
  const $ = (id) => document.getElementById(id);

  let botPendingGame = null;
  let botAgentStarted = false;
  let botCreating = false;

  // ---------------- UI FLOW ----------------
  $('btnGoBot').onclick = () => showScreen('botGameScreen');
  $('btnBotGameBack').onclick = () => showScreen('startScreen');

  document.querySelectorAll('#botGameScreen .btn-menu[data-bot-game]').forEach(btn => {
    btn.onclick = () => {
      botPendingGame = btn.dataset.botGame;
      $('botLevelGameName').textContent = GAME_LABEL[botPendingGame] || '';
      showScreen('botLevelScreen');
    };
  });

  $('btnBotLevelBack').onclick = () => showScreen('botGameScreen');

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

    function tryCreate(attemptsLeft){
      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      const candidateRef = dbRoot.ref('rooms/' + roomId);

      candidateRef.transaction(
        (cur) => (cur === null ? {
          created: Date.now(),
          game: currentGame,
          mapSeed: Math.floor(Math.random() * 1e9),
          timeControl: 0,
          maxPlayers: 2,
          bot: { role: BOT_ROLE, level: level }
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

      keepBotPresence();
      labelBotUI(gameAtStart, level);

      if(gameAtStart === 'ttt')   startTTTBot(level);
      if(gameAtStart === 'chess') startChessBot(level);
    }).catch(err => console.warn('[bot] gagal membaca konfigurasi bot:', err));
  }

  // Bot "online" selama host online (otomatis hilang kalau host putus)
  function keepBotPresence(){
    const pr = roomRef.child('presence/' + BOT_ROLE);
    dbRoot.ref('.info/connected').on('value', (snap) => {
      if(snap.val() === true){
        pr.onDisconnect().remove();
        pr.set(true);
      }
    });
  }

  function labelBotUI(game, level){
    const tagId = game === 'chess' ? 'chessRoleTag' : 'tttRoleTag';
    const tag = $(tagId);
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
})();
