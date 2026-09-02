// ======================================================
// shared.js — Logic bersama semua game (Game Hub 2P Realtime)
// Berisi: koneksi Firebase, navigasi antar layar, buat/gabung/
// lanjutkan room, presence, dan helper lain yang dipakai
// Mario.js, Catur.js, maupun Tttc.js.
//
// PENTING soal urutan <script>: file ini TIDAK dibungkus IIFE
// (function(){...})() seperti aslinya, supaya variabel top-level
// (let/const) di sini bisa "kelihatan" dan dipakai bareng oleh
// Mario.js, Catur.js, Tttc.js — persis seperti saat semuanya masih
// jadi satu <script> besar. Ini valid karena script classic (bukan
// type=module) yang dimuat di HTML yang sama berbagi satu lingkup
// global yang sama. Makanya index.html WAJIB memuat file-file ini
// berurutan: shared.js -> Mario.js -> Catur.js -> Tttc.js.
// ======================================================

  const firebaseConfig = {
    databaseURL: "https://tester-b643b-default-rtdb.firebaseio.com/"
  };
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const dbRoot = firebase.database();

  // ID perangkat yang STABIL, disimpan di localStorage supaya sama terus
  // walau halaman di-reload / sesi di-resume. Sebelumnya myPlayerId Mario
  // dibikin acak (Math.random()) setiap initMario() dipanggil, jadi tiap
  // reload/resume bikin entry BARU di Firebase 'players/' sementara entry
  // LAMA belum tentu langsung kehapus (onDisconnect kadang telat, apalagi
  // di WebView WhatsApp/mobile). Entry lama numpuk -> counter 👥 salah
  // hitung, nambah terus padahal orangnya cuma reconnect, bukan orang baru.
  // Dengan ID stabil, reconnect dari device yang sama akan nimpa
  // (overwrite) node yang SAMA persis, bukan bikin node baru.
  function getDeviceId(){
    let id = null;
    try{ id = localStorage.getItem('ghub_device_id'); }catch(e){}
    if(!id){
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try{ localStorage.setItem('ghub_device_id', id); }catch(e){}
    }
    return id;
  }

  // ============ NAVIGASI ANTAR SCREEN ============
  function showScreen(id){
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  let currentGame = null;   // 'mario' | 'chess' | 'ttt'
  let myRole = null;        // 'p1' (host) | 'p2' (joiner)
  let roomRef = null;
  let roomIdGlobal = null;
  // Dipindah ke sini (dari Catur.js) karena sudah dipakai di alur BUAT ROOM
  // & GABUNG ROOM di bawah, sebelum Catur.js sempat dideklarasikan.
  let chessTimeControl = 0; // detik per pemain yang dipilih saat BUAT room (0 = tanpa batas waktu)

  // Badge ID room permanen (kiri atas), biar gampang dibagikan kapan saja tanpa hilang
  const roomBadge = document.getElementById('roomBadge');
  const roomBadgeText = document.getElementById('roomBadgeText');
  function showRoomBadge(id){
    roomBadgeText.textContent = 'Room: ' + id;
    roomBadge.classList.add('show');
  }
  function hideRoomBadge(){ roomBadge.classList.remove('show'); }
  function copyRoomId(onDone){
    if(!roomIdGlobal) return;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(roomIdGlobal).then(onDone).catch(onDone);
    } else { onDone(); }
  }
  document.getElementById('roomBadgeCopy').onclick = (e) => {
    e.stopPropagation();
    copyRoomId(() => {
      roomBadge.classList.add('copied');
      document.getElementById('roomBadgeCopy').textContent = '✓ disalin';
      setTimeout(() => {
        roomBadge.classList.remove('copied');
        document.getElementById('roomBadgeCopy').textContent = '⧉ salin';
      }, 1500);
    });
  };
  roomBadge.onclick = () => document.getElementById('roomBadgeCopy').click();
  document.getElementById('btnCopyCreated').onclick = () => {
    const btn = document.getElementById('btnCopyCreated');
    copyRoomId(() => {
      const original = btn.textContent;
      btn.textContent = '✓ Kode Disalin!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  };

  const gameMeta = {
    mario: { title: '🍄 Mario Coin Rush', screen: 'marioScreen' },
    chess: { title: '♟ Catur 2P Online', screen: 'chessScreen' },
    ttt:   { title: '⭕ Tic-Tac-Toe 2P', screen: 'tttScreen' },
    poker: { title: '🃏 Capsa Banting 4P', screen: 'pokerScreen' }
  };

  document.getElementById('btnGoCreate').onclick = () => showScreen('gamePickScreen');
  document.getElementById('btnGoJoin').onclick = () => showScreen('joinScreen');
  document.getElementById('btnGamePickBack').onclick = () => showScreen('startScreen');
  document.getElementById('btnJoinBack').onclick = () => showScreen('startScreen');
  document.getElementById('btnChessTimeBack').onclick = () => showScreen('gamePickScreen');
  document.getElementById('btnCreatedBack').onclick = () => {
    if(roomRef && myRole === 'p1') roomRef.remove().catch(()=>{});
    clearSession();
    location.reload();
  };

  // PENTING: pakai transaction() buat klaim room ID, BUKAN langsung
  // .set() begitu aja. Kalau langsung set(), room ID lama yang kebetulan
  // masih dipakai (walau peluangnya kecil dari 900.000 kombinasi) akan
  // tertimpa diam-diam. transaction() cuma berhasil nulis kalau node-nya
  // masih null (belum ada isinya); kalau sudah kepakai, committed=false
  // dan kita coba lagi dengan ID baru (max beberapa kali percobaan).
  function proceedCreateRoom(){
    function tryCreateRoom(attemptsLeft){
      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      const candidateRef = dbRoot.ref('rooms/' + roomId);
      candidateRef.transaction(
        (current) => (current === null
          ? { created: Date.now(), game: currentGame, mapSeed: Math.floor(Math.random() * 1e9), timeControl: chessTimeControl }
          : undefined),
        (err, committed) => {
          if(err || !committed){
            if(attemptsLeft > 0){ tryCreateRoom(attemptsLeft - 1); return; }
            alert('Gagal membuat room, coba lagi.');
            return;
          }
          roomIdGlobal = roomId;
          roomRef = candidateRef;
          showRoomBadge(roomId);

          document.getElementById('createdStatus').innerHTML =
            '<span class="game-name">' + gameMeta[currentGame].title + '</span><span class="code-big">' + roomId + '</span>Bagikan kode ini ke teman kamu';
          showScreen('createdScreen');

          safeDelay(() => enterGame(), 900);
        }
      );
    }
    tryCreateRoom(5);
  }

  // ROOM ID baru dibuat SETELAH game dipilih (bukan sebelumnya). Khusus Catur,
  // ada langkah tambahan: pilih waktu jalan dulu sebelum room benar-benar dibuat.
  document.querySelectorAll('#gamePickScreen .btn-menu[data-game]').forEach(btn => {
    btn.onclick = () => {
      currentGame = btn.dataset.game;
      myRole = 'p1';
      if(currentGame === 'chess'){
        showScreen('chessTimeScreen');
      } else {
        chessTimeControl = 0;
        proceedCreateRoom();
      }
    };
  });

  document.querySelectorAll('#chessTimeScreen .btn-menu[data-time]').forEach(btn => {
    btn.onclick = () => {
      chessTimeControl = parseInt(btn.dataset.time, 10) || 0;
      proceedCreateRoom();
    };
  });

  // setTimeout/rAF dibekukan browser saat tab disembunyikan (misal host pindah
  // app buat share kode room ke WhatsApp). Kalau host balik lagi, timer yang
  // ketunda itu suka numpuk terus jalan sekaligus -> kelihatan kayak delay/nge-jump.
  // safeDelay ngukur waktu asli pakai Date.now(), bukan cuma ngandelin timer,
  // supaya begitu tab aktif lagi transisinya langsung pas, gak keteteran.
  function safeDelay(fn, ms){
    const target = Date.now() + ms;
    let done = false;
    function tick(){
      if(done) return;
      if(document.hidden){ setTimeout(tick, 200); return; }
      if(Date.now() >= target){ done = true; fn(); return; }
      setTimeout(tick, Math.min(150, target - Date.now()));
    }
    tick();
  }

  // JOIN: cukup masukin ID, game-nya otomatis kedeteksi dari data room
  document.getElementById('btnLobbyConnect').onclick = () => {
    const targetId = document.getElementById('roomIdInputLobby').value.trim();
    if(!targetId) return alert('Masukkan ID Room!');

    const btnConnect = document.getElementById('btnLobbyConnect');
    btnConnect.disabled = true;
    btnConnect.textContent = 'MENGECEK ROOM...';

    dbRoot.ref('rooms/' + targetId).get().then(snap => {
      btnConnect.disabled = false;
      btnConnect.textContent = 'MASUK GAME';
      if(!snap.exists()){
        alert('Room ID tidak ditemukan! Cek lagi kodenya.');
        return;
      }
      const data = snap.val();
      if(!data.game || !gameMeta[data.game]){
        alert('Data room rusak / game tidak dikenali.');
        return;
      }
      currentGame = data.game;
      chessTimeControl = data.timeControl || 0;
      roomIdGlobal = targetId;
      roomRef = dbRoot.ref('rooms/' + targetId);

      if(currentGame === 'mario'){
        // Mario mendukung banyak pemain sekaligus, jadi tidak perlu slot p1/p2.
        myRole = 'joiner';
        showRoomBadge(targetId);
        enterGame();
      } else if(currentGame === 'poker'){
        // Capsa Banting: 4 pemain (p1 host, p2/p3/p4 joiner). Coba klaim slot
        // kosong berurutan pakai transaction() per node, sama prinsipnya
        // dengan klaim p2 di Catur/TTT di bawah - biar gak ada 2 device yang
        // kebetulan dapat slot yang sama.
        const trySeat = (seats, i) => {
          if(i >= seats.length){
            btnConnect.disabled = false;
            btnConnect.textContent = 'MASUK GAME';
            alert('Room Capsa Banting ini sudah penuh (4 pemain).');
            return;
          }
          roomRef.child('presence/' + seats[i]).transaction(
            (current) => (current === null ? true : undefined),
            (err, committed) => {
              if(err || !committed){ trySeat(seats, i + 1); return; }
              myRole = seats[i];
              showRoomBadge(targetId);
              enterGame();
            }
          );
        };
        trySeat(['p2', 'p3', 'p4'], 0);
      } else {
        // Catur & Tic-Tac-Toe tetap murni 2 pemain (p1 host, p2 joiner).
        // PENTING: klaim slot p2 pakai transaction(), BUKAN check-then-set
        // (once('value') lalu baru set belakangan di attachPresence). Kalau
        // dua device klik "MASUK GAME" nyaris bersamaan, keduanya bisa lolos
        // cek "slot kosong" dan sama-sama jadi p2. transaction() menjamin
        // hanya SATU device yang berhasil menulis true ke node yang masih
        // null; device kedua otomatis dapat committed=false dan ditolak.
        roomRef.child('presence/p2').transaction(
          (current) => (current === null ? true : undefined),
          (err, committed) => {
            if(err || !committed){
              alert('Room ini sudah penuh (2 pemain).');
              return;
            }
            myRole = 'p2';
            showRoomBadge(targetId);
            enterGame();
          }
        );
      }
    }).catch(() => {
      btnConnect.disabled = false;
      btnConnect.textContent = 'MASUK GAME';
      alert('Gagal cek room, coba lagi.');
    });
  };

  function enterGame(){
    showScreen(gameMeta[currentGame].screen);
    saveSession();
    if(currentGame === 'mario') initMario();
    if(currentGame === 'chess') initChess();
    if(currentGame === 'ttt') initTTT();
    if(currentGame === 'poker') initPoker();
  }

  // ============ RESUME SESI (ga sengaja balik ke menu / ke-back) ============
  // Room & state game (papan, skor) udah otomatis kesimpan di Firebase. Yang
  // KURANG selama ini cuma "ingatan lokal" di HP kita sendiri: begitu balik ke
  // menu utama (sengaja ataupun ke-pencet gak sengaja), roomId/role di JS ilang
  // dan kita harus ngetik ulang kode room manual. Simpan info sesi ke
  // localStorage supaya begitu app dibuka lagi, kita bisa nawarin "Lanjutkan?"
  // dan otomatis re-attach ke role (p1/p2) yang SAMA seperti sebelumnya -
  // jadi gak perlu lewat pengecekan "slot penuh" lagi (itu cuma buat pemain baru).
  const SESSION_KEY = 'ghub_session_v1';
  let pendingResumeCoin = 0;
  function saveSession(){
    try{
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        roomId: roomIdGlobal, game: currentGame, role: myRole, coin: myCoinCount || 0
      }));
    }catch(e){}
  }
  function clearSession(){
    try{ localStorage.removeItem(SESSION_KEY); }catch(e){}
  }
  function loadSession(){
    try{
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  const pendingSession = loadSession();
  if(pendingSession && pendingSession.roomId && gameMeta[pendingSession.game]){
    document.getElementById('resumeGameName').textContent = gameMeta[pendingSession.game].title;
    document.getElementById('resumeRoomCode').textContent = pendingSession.roomId;
    showScreen('resumeScreen');
  }

  document.getElementById('btnResumeNew').onclick = () => {
    clearSession();
    location.reload();
  };

  document.getElementById('btnResumeContinue').onclick = () => {
    if(!pendingSession) return location.reload();
    const btn = document.getElementById('btnResumeContinue');
    btn.disabled = true;
    btn.textContent = 'MENYAMBUNGKAN...';
    dbRoot.ref('rooms/' + pendingSession.roomId).get().then(snap => {
      if(!snap.exists()){
        alert('Room sudah tidak ada / sudah berakhir.');
        clearSession();
        location.reload();
        return;
      }
      const data = snap.val();
      if(data.game !== pendingSession.game){
        alert('Data room udah berubah, gak bisa disambung otomatis.');
        clearSession();
        location.reload();
        return;
      }
      // Langsung pasang balik role lama (p1/p2/joiner) TANPA lewat cek "slot
      // penuh" - karena slot itu memang milik kita sendiri dari sesi sebelumnya.
      currentGame = pendingSession.game;
      myRole = pendingSession.role;
      roomIdGlobal = pendingSession.roomId;
      roomRef = dbRoot.ref('rooms/' + pendingSession.roomId);
      pendingResumeCoin = pendingSession.coin || 0;
      showRoomBadge(pendingSession.roomId);
      enterGame();
    }).catch(() => {
      btn.disabled = false;
      btn.textContent = '▶ Lanjutkan';
      alert('Gagal cek room, coba lagi.');
    });
  };

  // Tombol back HP / gesture back browser jangan langsung kabur ninggalin
  // halaman gitu aja pas lagi di tengah game - kasih konfirmasi dulu. Kalau
  // dibatalkan, sesi TETAP kesimpan jadi bisa di-resume kapan aja lewat layar
  // "Lanjutkan Room?" di atas.
  history.pushState({ghub:true}, '', location.href);
  window.addEventListener('popstate', () => {
    if(!currentGame) return; // bukan lagi di tengah game -> biarkan back jalan normal
    const keluar = confirm('Keluar dari game? Kamu bisa lanjut lagi nanti lewat "Lanjutkan Room".');
    if(keluar){
      location.reload();
    } else {
      history.pushState({ghub:true}, '', location.href);
    }
  });

  // Presence generik: dipakai semua game biar tau lawan connect/putus.
  // PENTING: kita TIDAK PERNAH menghapus seluruh room di sini. Room cuma boleh
  // hilang lewat aksi eksplisit user (tombol back/menu utama). Sebelumnya kode
  // lama menghapus SELURUH room begitu host kehilangan koneksi walau sebentar
  // (misal pindah app buat share kode room / layar kekunci), yang bikin game
  // ke-reset total buat kedua pemain. Sekarang yang di-onDisconnect cuma
  // status "presence" pribadi masing-masing, dan itu otomatis dipasang ulang
  // oleh Firebase SDK setiap kali koneksi tersambung lagi.
  // Referensi presence node yang lagi aktif (dipasang ulang tiap attachPresence
  // dipanggil per game). Dipakai supaya tombol "Kembali" di SEMUA game (bukan
  // cuma Mario) bisa menghapus node presence-nya sendiri secara eksplisit -
  // konsisten dengan Mario yang sudah begitu dari awal.
  let activePresenceRef = null;

  function attachPresence(statusElId, roomLabel, onOpponentChange){
    const presenceRef = roomRef.child('presence/' + myRole);
    activePresenceRef = presenceRef;

    dbRoot.ref('.info/connected').on('value', (snap) => {
      if(snap.val() === true){
        presenceRef.onDisconnect().remove();
        presenceRef.set(true);
      }
    });

    if(!attachPresence._pagehideBound){
      attachPresence._pagehideBound = true;
      // Jaring pengaman: onDisconnect() butuh socket beneran putus, dan itu
      // suka telat kedeteksi di WebView WhatsApp/mobile (tab dipindah, app
      // di-minimize). Dulu cuma Mario yang punya pagehide ini; sekarang
      // dipasang generik lewat activePresenceRef, jadi Catur & TTT juga
      // langsung hapus node presence begitu halaman ditinggalkan - lawan
      // tidak lagi lihat status "masih online" nyangkut.
      window.addEventListener('pagehide', () => {
        if(activePresenceRef) activePresenceRef.remove();
      });
    }

    const oppKey = myRole === 'p1' ? 'p2' : 'p1';
    roomRef.child('presence/' + oppKey).on('value', (snap) => {
      const online = !!snap.val();
      const statusEl = document.getElementById(statusElId);
      if(online){
        statusEl.textContent = '🟢 Lawan terhubung! Main jalan...';
      } else {
        statusEl.textContent = myRole === 'p1'
          ? '🟡 Room: ' + roomLabel + ' (Menunggu lawan...)'
          : '🔴 Lawan terputus, menunggu balik lagi...';
      }
      if(onOpponentChange) onOpponentChange(online);
    });
  }

