// ======================================================
// snake.js — Hybrid Board (Image Background + Canvas Pawn)
// ======================================================

const SNAKES_AND_LADDERS = [
  { start: 29, end: 7 },   { start: 24, end: 12 }, { start: 15, end: 37 },
  { start: 23, end: 41 },  { start: 72, end: 36 }, { start: 49, end: 86 },
  { start: 90, end: 56 },  { start: 75, end: 64 }, { start: 74, end: 95 },
  { start: 91, end: 72 },  { start: 97, end: 78 }
];

// Warna Pion Vektor 3D
const PLAYER_COLORS = [
  { main: '#ef4444', dark: '#991b1b', light: '#fca5a5' }, // Merah
  { main: '#3b82f6', dark: '#1e40af', light: '#93c5fd' }, // Biru
  { main: '#eab308', dark: '#854d0e', light: '#fef08a' }, // Kuning
  { main: '#10b981', dark: '#065f46', light: '#6ee7b7' }, // Hijau
  { main: '#a855f7', dark: '#6b21a8', light: '#d8b4fe' }, // Ungu
  { main: '#f97316', dark: '#9a3412', light: '#fdba74' }, // Orange
  { main: '#ec4899', dark: '#9d174d', light: '#fbcfe8' }  // Pink
];

let snakeUnsub = null;
let isAnimatingLocal = false;
let currentGameState = null;
let localVisualPositions = {};

function getCanvasContext() {
  const canvas = document.getElementById('snakeCanvas');
  return canvas ? canvas.getContext('2d') : null;
}

// Menghitung Posisi Koordinat Pixel Pion pada Canvas (800x800)
function getBoardCoordinates(pos, playerIndex) {
  const row = Math.floor((pos - 1) / 10);
  const col = (pos - 1) % 10;
  
  // Posisi Papan Zig-Zag
  const actualCol = (row % 2 === 0) ? col : (9 - col);
  const actualRow = 9 - row;

  const tileSize = 80;
  const baseX = actualCol * tileSize + tileSize / 2;
  const baseY = actualRow * tileSize + tileSize / 2;

  // Offset mikro jika bertumpuk di kotak yang sama
  const offsets = [
    { x: -12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: 12 },
    { x: 12, y: -12 }, { x: 0, y: -16 }, { x: 0, y: 16 }, { x: 0, y: 0 }
  ];
  const offset = offsets[playerIndex % offsets.length];

  return { x: baseX + offset.x, y: baseY + offset.y };
}

// Render Pion Menggunakan Vektor Canvas di atas gambar papan
function drawCanvasState() {
  const ctx = getCanvasContext();
  if (!ctx) return;

  // Clear layar transparan canvas
  ctx.clearRect(0, 0, 800, 800);

  if (!currentGameState || !currentGameState.players) return;

  const playerKeys = Object.keys(currentGameState.players);

  playerKeys.forEach((pKey, index) => {
    const pos = localVisualPositions[pKey] || currentGameState.players[pKey].pos || 1;
    const coords = getBoardCoordinates(pos, index);
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

    ctx.save();

    // Bayangan Pion
    ctx.beginPath();
    ctx.ellipse(coords.x, coords.y + 14, 18, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    // Gradien Bola 3D Glossy
    const gradient = ctx.createRadialGradient(
      coords.x - 6, coords.y - 8, 2,
      coords.x, coords.y, 22
    );
    gradient.addColorStop(0, color.light);
    gradient.addColorStop(0.4, color.main);
    gradient.addColorStop(1, color.dark);

    // Bodi Pion Token
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Teks ID Pemain (P1, P2)
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(pKey.toUpperCase(), coords.x, coords.y + 1);

    ctx.restore();
  });
}

function initSnake() {
  if(!roomRef) return;
  document.getElementById('snakeRoleTag').textContent = myRole.toUpperCase();
  setupPresence('snakeStatus', roomIdGlobal);

  const snakeRef = roomRef.child('snake');

  if(myRole === 'p1') {
    snakeRef.get().then(snap => {
      if(!snap.exists()) {
        const maxP = window.snakeSelectedMaxPlayers || 2;
        const initPlayers = {};
        for(let i = 1; i <= maxP; i++) {
          initPlayers[`p${i}`] = { pos: 1, rank: 0 };
        }
        snakeRef.set({
          maxPlayers: maxP,
          turnIndex: 0,
          isRolling: false,
          lastDice: 1,
          status: 'playing',
          players: initPlayers
        });
      }
    });
  }

  if(snakeUnsub) snakeUnsub();
  snakeUnsub = snakeRef.on('value', snap => {
    const data = snap.val();
    if(!data) return;

    currentGameState = data;

    if (!isAnimatingLocal) {
      Object.keys(data.players || {}).forEach(pKey => {
        localVisualPositions[pKey] = data.players[pKey].pos || 1;
      });
      drawCanvasState();
      updateSnakeControls(data);
    }
  });
}

function updateSnakeControls(data) {
  const playerKeys = Object.keys(data.players || {});
  const currentTurnKey = playerKeys[data.turnIndex];
  const btnRoll = document.getElementById('snakeBtnRoll');
  const diceBox = document.getElementById('snakeDiceBox');

  if (data.isRolling) {
    diceBox.classList.add('rolling');
    diceBox.textContent = '🎲';
  } else {
    diceBox.classList.remove('rolling');
    diceBox.textContent = data.lastDice || 1;
  }

  if (data.status === 'ended') {
    btnRoll.disabled = true;
    document.getElementById('snakeResult').style.display = 'block';
    document.getElementById('snakeResult').innerHTML = `🎉 Pertandingan Selesai! Selamat untuk Pemenang!`;
    return;
  }

  btnRoll.disabled = !(myRole === currentTurnKey && !data.isRolling && !isAnimatingLocal);

  // List Pemain
  const listWrap = document.getElementById('snakePlayersList');
  listWrap.innerHTML = '';
  playerKeys.forEach((pKey, i) => {
    const pData = data.players[pKey];
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const chip = document.createElement('div');
    chip.style.cssText = `
      background: var(--panel-2); border: 1px solid var(--line);
      padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
      color: var(--ink); display: flex; align-items: center; gap: 8px;
    `;
    chip.innerHTML = `<span style="width:12px; height:12px; border-radius:50%; background:${color.main}; border:1.5px solid #fff;"></span> ${pKey.toUpperCase()} (Kotak ${pData.pos})`;
    listWrap.appendChild(chip);
  });
}

// Animasi Langkah demi Langkah Pion
async function animatePionMovement(pKey, startPos, diceVal) {
  let currentPos = startPos;
  
  for(let i = 0; i < diceVal; i++) {
    currentPos++;
    if(currentPos > 100) { currentPos = 100; break; }
    
    localVisualPositions[pKey] = currentPos;
    drawCanvasState();
    
    await new Promise(r => setTimeout(r, 260));
  }

  // Cek Tangga / Ular
  const eventPoint = SNAKES_AND_LADDERS.find(s => s.start === currentPos);
  if(eventPoint) {
    await new Promise(r => setTimeout(r, 250));
    
    const isLadder = eventPoint.end > eventPoint.start;
    if(isLadder) {
      showCustomAlert(`🚀 NAIK TANGGA! Meluncur ke Kotak ${eventPoint.end}`);
    } else {
      showCustomAlert(`😱 TERMAKAN ULAR! Jatuh ke Kotak ${eventPoint.end}`);
    }

    localVisualPositions[pKey] = eventPoint.end;
    drawCanvasState();
    await new Promise(r => setTimeout(r, 600));
    currentPos = eventPoint.end;
  }

  return currentPos;
}

document.getElementById('snakeBtnRoll').onclick = () => {
  if(!roomRef || isAnimatingLocal) return;
  const snakeRef = roomRef.child('snake');

  snakeRef.get().then(async snap => {
    const data = snap.val();
    if(!data) return;

    const playerKeys = Object.keys(data.players);
    const currentTurnKey = playerKeys[data.turnIndex];

    if(myRole !== currentTurnKey || data.isRolling) return;

    isAnimatingLocal = true;
    document.getElementById('snakeBtnRoll').disabled = true;

    // 1. Animasi Kocok Dadu
    const diceBox = document.getElementById('snakeDiceBox');
    diceBox.classList.add('rolling');
    
    let rollInterval = setInterval(() => {
      diceBox.textContent = Math.floor(Math.random() * 6) + 1;
    }, 70);

    await new Promise(r => setTimeout(r, 1000));
    clearInterval(rollInterval);
    diceBox.classList.remove('rolling');

    // 2. Angka Dadu Final
    const dice = Math.floor(Math.random() * 6) + 1;
    diceBox.textContent = dice;

    await new Promise(r => setTimeout(r, 350));

    // 3. Jalankan Pergerakan Pion
    let oldPos = data.players[myRole].pos || 1;
    let finalPos = await animatePionMovement(myRole, oldPos, dice);

    // Tabrakan Pion (Hanya menginjak pion pemain yang BELUM menang)
    playerKeys.forEach(otherKey => {
      if(
        otherKey !== myRole && 
        data.players[otherKey].pos === finalPos && 
        finalPos < 100 && 
        !data.players[otherKey].rank
      ) {
        data.players[otherKey].pos = 1;
        localVisualPositions[otherKey] = 1;
        showCustomAlert(`💥 Pion ${myRole.toUpperCase()} menginjak ${otherKey.toUpperCase()}! Target kembali ke START.`);
      }
    });

    data.players[myRole].pos = finalPos;

    // Hitung berapa pemain yang sudah selesai/menang
    const finishedPlayers = playerKeys.filter(k => data.players[k].rank > 0);

    // Jika player baru saja sampai di FINISH (kotak >= 100)
    if (finalPos >= 100 && !data.players[myRole].rank) {
      const nextRank = finishedPlayers.length + 1;
      data.players[myRole].rank = nextRank;
      showCustomAlert(`🏆 Selamat! ${myRole.toUpperCase()} berhasil Finis sebagai Juara ${nextRank}!`);
    }

    // Cari pemain berikutnya yang BELUM menang
    let nextTurnIndex = data.turnIndex;
    const totalPlayers = playerKeys.length;
    const currentFinishedCount = playerKeys.filter(k => data.players[k].rank > 0).length;

    // Game benar-benar selesai jika tersisa 1 orang saja yang belum finis
    if (currentFinishedCount >= totalPlayers - 1) {
      data.status = 'ended';
    } else {
      // Jika dapet angka 6 dan BELUM menang, dapat giliran lagi. Jika tidak, oper ke pemain aktif berikutnya
      if (dice !== 6 || finalPos >= 100) {
        do {
          nextTurnIndex = (nextTurnIndex + 1) % totalPlayers;
        } while (data.players[playerKeys[nextTurnIndex]].rank > 0); // Skip pemain yang sudah finis
      }
    }

    // 4. Update Database Realtime
    await snakeRef.update({
      players: data.players,
      lastDice: dice,
      isRolling: false,
      turnIndex: nextTurnIndex,
      status: data.status || 'playing'
    });

    isAnimatingLocal = false;
    drawCanvasState();
  });
};
;

// HANDLER TOMBOL KEMBALI KEMBALI DIBETULKAN
document.getElementById('btnSnakeBack').onclick = () => {
  if(snakeUnsub) {
    snakeUnsub();
    snakeUnsub = null;
  }
  showScreen('startScreen');
};
