// ======================================================
// shared.js — Logic bersama semua game (Game Hub 2P Realtime)
// ======================================================

const firebaseConfig = {
  databaseURL: "https://tester-b643b-default-rtdb.firebaseio.com/"
};
if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const dbRoot = firebase.database();

// HELPER: POP-UP CUSTOM ALERT MODERN
function showCustomAlert(text, title = "⚠️ Pemberitahuan") {
  document.getElementById('customAlertTitle').textContent = title;
  document.getElementById('customAlertText').textContent = text;
  document.getElementById('customAlertOverlay').style.display = 'flex';
}
document.getElementById('btnCustomAlertOk').onclick = () => {
  document.getElementById('customAlertOverlay').style.display = 'none';
};

// HELPER: POP-UP CUSTOM CONFIRM MODERN
function showCustomConfirm(text, onConfirm, title = "❓ Konfirmasi") {
  document.getElementById('customConfirmTitle').textContent = title;
  document.getElementById('customConfirmText').textContent = text;
  const overlay = document.getElementById('customConfirmOverlay');
  overlay.style.display = 'flex';

  document.getElementById('btnCustomConfirmOk').onclick = () => {
    overlay.style.display = 'none';
    if(onConfirm) onConfirm();
  };
  document.getElementById('btnCustomConfirmCancel').onclick = () => {
    overlay.style.display = 'none';
  };
}

function getDeviceId(){
  let id = null;
  try{ id = localStorage.getItem('ghub_device_id'); }catch(e){}
  if(!id){
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try{ localStorage.setItem('ghub_device_id', id); }catch(e){}
  }
  return id;
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

let currentGame = null;   
let myRole = null;        
let roomRef = null;
let roomIdGlobal = null;
let chessTimeControl = 0; 

let pendingJoinRoomId = null;
let pendingRoomPass = null;
let roomPasswordTemp = "";

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
  poker: { title: '🃏 Poker Capsa', screen: 'pokerScreen' },
  uno:   { title: '🎴 Uno Battle Arena', screen: 'unoScreen' }
};

document.getElementById('btnGoCreate').onclick = () => showScreen('gamePickScreen');
document.getElementById('btnGoJoin').onclick = () => showScreen('joinScreen');
document.getElementById('btnGamePickBack').onclick = () => showScreen('startScreen');
document.getElementById('btnJoinBack').onclick = () => showScreen('startScreen');
document.getElementById('btnChessTimeBack').onclick = () => showScreen('gamePickScreen');
document.getElementById('btnCreatedBack').onclick = () => {
  if(roomRef && myRole === 'p1') {
    roomRef.remove().catch(()=>{});
    if(roomIdGlobal) dbRoot.ref('publicRooms/' + roomIdGlobal).remove().catch(()=>{});
  }
  clearSession();
  location.reload();
};

// ---------- ALUR BUAT ROOM DENGAN MODAL CUSTOM PASSWORD ----------
function proceedCreateRoom(){
  document.getElementById('createPassInput').value = '';
  document.getElementById('createPassOverlay').style.display = 'flex';
}

document.getElementById('btnCreatePassSubmit').onclick = () => {
  roomPasswordTemp = document.getElementById('createPassInput').value.trim();
  document.getElementById('createPassOverlay').style.display = 'none';
  executeCreateRoom();
};

document.getElementById('btnCreatePassCancel').onclick = () => {
  document.getElementById('createPassOverlay').style.display = 'none';
};

function executeCreateRoom(){
  function tryCreateRoom(attemptsLeft){
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    const candidateRef = dbRoot.ref('rooms/' + roomId);
    
    let maxP = 2;
    if(currentGame === 'poker') maxP = 4;
    if(currentGame === 'uno') maxP = window.unoSelectedMaxPlayers || 4;
    if(currentGame === 'mario') maxP = 8;

    candidateRef.transaction(
      (current) => (current === null
        ? { 
            created: Date.now(), 
            game: currentGame, 
            mapSeed: Math.floor(Math.random() * 1e9), 
            timeControl: chessTimeControl,
            maxPlayers: maxP
          }
        : undefined),
      (err, committed) => {
        if(err || !committed){
          if(attemptsLeft > 0){ tryCreateRoom(attemptsLeft - 1); return; }
          showCustomAlert('Gagal membuat room, coba lagi.');
          return;
        }
        roomIdGlobal = roomId;
        roomRef = candidateRef;
        showRoomBadge(roomId);

        const pubRef = dbRoot.ref('publicRooms/' + roomId);
        pubRef.set({
          game: currentGame,
          hasPass: roomPasswordTemp !== "",
          password: roomPasswordTemp,
          maxPlayers: maxP,
          createdAt: Date.now()
        });
        pubRef.onDisconnect().remove();

        document.getElementById('createdStatus').innerHTML =
          '<span class="game-name">' + gameMeta[currentGame].title + '</span><span class="code-big">' + roomId + '</span>Bagikan kode ini atau main via Online Rooms';
        showScreen('createdScreen');

        safeDelay(() => enterGame(), 900);
      }
    );
  }
  tryCreateRoom(5);
}

document.querySelectorAll('#gamePickScreen .btn-menu[data-game]').forEach(btn => {
  btn.onclick = () => {
    currentGame = btn.dataset.game;
    myRole = 'p1';
    if(currentGame === 'chess'){
      showScreen('chessTimeScreen');
    } else if(currentGame === 'uno'){
      showScreen('unoPlayerCountScreen');
    } else {
      chessTimeControl = 0;
      proceedCreateRoom();
    }
  };
});

document.querySelectorAll('#unoPlayerCountScreen .btn-menu[data-uno-players]').forEach(btn => {
  btn.onclick = () => {
    window.unoSelectedMaxPlayers = parseInt(btn.dataset.unoPlayers, 10) || 4;
    proceedCreateRoom();
  };
});
document.getElementById('btnUnoCountBack').onclick = () => showScreen('gamePickScreen');

document.querySelectorAll('#chessTimeScreen .btn-menu[data-time]').forEach(btn => {
  btn.onclick = () => {
    chessTimeControl = parseInt(btn.dataset.time, 10) || 0;
    proceedCreateRoom();
  };
});

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

function fetchOnlineRooms() {
  const listContainer = document.getElementById('onlineRoomList');
  listContainer.innerHTML = '<div style="text-align:center; color:var(--ink-dim); font-size:13px; padding:20px;">Memuat daftar room...</div>';

  dbRoot.ref('publicRooms').once('value', snap => {
    const rooms = snap.val();
    listContainer.innerHTML = '';

    if (!rooms) {
      listContainer.innerHTML = '<div style="text-align:center; color:var(--ink-dim); font-size:13px; padding:20px;">Belum ada room publik aktif.</div>';
      return;
    }

    Object.keys(rooms).forEach(roomId => {
      const info = rooms[roomId];
      
      dbRoot.ref(`rooms/${roomId}/presence`).once('value', presSnap => {
        const presence = presSnap.val() || {};
        const onlineCount = Object.keys(presence).length;

        const card = document.createElement('div');
        card.className = 'room-item-card';
        card.onclick = () => tryConnectToOnlineRoom(roomId, info);

        const lockIcon = info.hasPass ? '🔒' : '🌐';
        const gameTitle = (gameMeta[info.game] && gameMeta[info.game].title) || info.game.toUpperCase();

        card.innerHTML = `
          <div class="room-item-info">
            <div class="room-item-title">${lockIcon} ${gameTitle} <span style="font-size:11px; opacity:.6;">(#${roomId})</span></div>
            <div class="room-item-sub">${info.hasPass ? 'Terkunci Password' : 'Public (Bebas Masuk)'}</div>
          </div>
          <div class="room-item-badge">👥 ${onlineCount}/${info.maxPlayers || 2}</div>
        `;
        listContainer.appendChild(card);
      });
    });
  });
}

function tryConnectToOnlineRoom(roomId, info) {
  if (info.hasPass) {
    pendingJoinRoomId = roomId;
    pendingRoomPass = info.password;
    document.getElementById('roomPassInput').value = '';
    document.getElementById('roomPassOverlay').style.display = 'flex';
  } else {
    connectToRoomGlobal(roomId);
  }
}

document.getElementById('btnPassSubmit').onclick = () => {
  const input = document.getElementById('roomPassInput').value.trim();
  if (input === pendingRoomPass) {
    document.getElementById('roomPassOverlay').style.display = 'none';
    connectToRoomGlobal(pendingJoinRoomId);
  } else {
    showCustomAlert("Password yang kamu masukkan salah!", "❌ Password Salah");
  }
};

document.getElementById('btnPassCancel').onclick = () => {
  document.getElementById('roomPassOverlay').style.display = 'none';
};

document.getElementById('btnGoOnlineRooms').onclick = () => {
  showScreen('onlineRoomScreen');
  fetchOnlineRooms();
};
document.getElementById('btnOnlineRoomBack').onclick = () => {
  showScreen('startScreen');
};

function connectToRoomGlobal(targetId) {
  const btnConnect = document.getElementById('btnLobbyConnect');
  if(btnConnect) {
    btnConnect.disabled = true;
    btnConnect.textContent = 'MENGECEK ROOM...';
  }

  dbRoot.ref('rooms/' + targetId).get().then(snap => {
    if(btnConnect) {
      btnConnect.disabled = false;
      btnConnect.textContent = 'MASUK GAME';
    }
    if(!snap.exists()){
      showCustomAlert('Room ID tidak ditemukan! Cek lagi kodenya.');
      return;
    }
    const data = snap.val();
    if(!data.game || !gameMeta[data.game]){
      showCustomAlert('Data room rusak / game tidak dikenali.');
      return;
    }
    currentGame = data.game;
    chessTimeControl = data.timeControl || 0;
    roomIdGlobal = targetId;
    roomRef = dbRoot.ref('rooms/' + targetId);

    if(currentGame === 'mario'){
      myRole = 'joiner';
      showRoomBadge(targetId);
      enterGame();
    } else if(currentGame === 'poker'){
      const trySeat = (seats, i) => {
        if(i >= seats.length){
          showCustomAlert('Room Capsa Banting ini sudah penuh (4 pemain).');
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
    } else if(currentGame === 'uno'){
      dbRoot.ref('rooms/' + targetId + '/uno').get().then(unoSnap => {
        const unoData = unoSnap.val() || {};
        const maxP = unoData.maxPlayers || 4;
        const seats = ['p2', 'p3', 'p4', 'p5', 'p6'].slice(0, maxP - 1);

        const tryUnoSeat = (seatList, i) => {
          if(i >= seatList.length){
            showCustomAlert('Room Uno ini sudah penuh.');
            return;
          }
          roomRef.child('presence/' + seatList[i]).transaction(
            (current) => (current === null ? true : undefined),
            (err, committed) => {
              if(err || !committed){ tryUnoSeat(seatList, i + 1); return; }
              myRole = seatList[i];
              showRoomBadge(targetId);
              enterGame();
            }
          );
        };
        tryUnoSeat(seats, 0);
      });
    } else {
      roomRef.child('presence/p2').transaction(
        (current) => (current === null ? true : undefined),
        (err, committed) => {
          if(err || !committed){
            showCustomAlert('Room ini sudah penuh (2 pemain).');
            return;
          }
          myRole = 'p2';
          showRoomBadge(targetId);
          enterGame();
        }
      );
    }
  }).catch(() => {
    if(btnConnect) {
      btnConnect.disabled = false;
      btnConnect.textContent = 'MASUK GAME';
    }
    showCustomAlert('Gagal mengecek room, coba lagi.');
  });
}

document.getElementById('btnLobbyConnect').onclick = () => {
  const targetId = document.getElementById('roomIdInputLobby').value.trim();
  if(!targetId) return showCustomAlert('Masukkan ID Room!');
  connectToRoomGlobal(targetId);
};

function enterGame(){
  showScreen(gameMeta[currentGame].screen);
  saveSession();
  if(currentGame === 'mario') initMario();
  if(currentGame === 'chess') initChess();
  if(currentGame === 'ttt') initTTT();
  if(currentGame === 'poker') initPoker();
  if(currentGame === 'uno') initUno();
}

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
      showCustomAlert('Room sudah tidak ada / sudah berakhir.');
      clearSession();
      location.reload();
      return;
    }
    const data = snap.val();
    if(data.game !== pendingSession.game){
      showCustomAlert('Data room udah berubah, gak bisa disambung otomatis.');
      clearSession();
      location.reload();
      return;
    }
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
    showCustomAlert('Gagal mengecek room, coba lagi.');
  });
};

history.pushState({ghub:true}, '', location.href);
window.addEventListener('popstate', () => {
  if(!currentGame) return; 
  showCustomConfirm(
    'Keluar dari game? Kamu bisa lanjut lagi nanti lewat "Lanjutkan Room".',
    () => { location.reload(); },
    '🚪 Keluar Game'
  );
  history.pushState({ghub:true}, '', location.href);
});

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
