// ======================================================
// snake.js — Logic & Interactive Image Rendering Ular Tangga
// ======================================================

const SNAKES_AND_LADDERS = [
  { start: 29, end: 7 },   { start: 24, end: 12 }, { start: 15, end: 37 },
  { start: 23, end: 41 },  { start: 72, end: 36 }, { start: 49, end: 86 },
  { start: 90, end: 56 },  { start: 75, end: 64 }, { start: 74, end: 95 },
  { start: 91, end: 72 },  { start: 97, end: 78 }
];

// Aset Pion Gambar Persis Dari Bot WA
const PION_IMAGES = [
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780236206544.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/178023601621.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780236187804.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780236196281.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780237879139.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780237885067.jpg',
  'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1780237888413.jpg'
];

let snakeUnsub = null;

// Mengkalkulasi Koordinat Posisi Papan (1 - 100)
function calculateCoords(pos, index) {
  let x = ((pos - 1) % 10) * 10;
  let y = (9 - Math.floor((pos - 1) / 10)) * 10;
  
  // Offset mikro agar pion bertumpuk tidak saling menutupi
  let offsetX = (index % 3) * 1.8;
  let offsetY = Math.floor(index / 3) * 1.8;
  
  return { left: `${x + offsetX + 0.8}%`, top: `${y + offsetY + 0.8}%` };
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

    renderSnakeBoard(data);
    updateSnakeControls(data);
  });
}

function renderSnakeBoard(data) {
  const pionsWrap = document.getElementById('snakePionsWrap');
  pionsWrap.innerHTML = '';

  const playerKeys = Object.keys(data.players || {});
  
  playerKeys.forEach((pKey, i) => {
    const pData = data.players[pKey];
    
    // Element Pion Berupa Gambar Image CDN
    const pionImg = document.createElement('img');
    pionImg.className = `snake-pion`;
    pionImg.id = `pion-${pKey}`;
    pionImg.src = PION_IMAGES[i % PION_IMAGES.length];
    pionImg.style.objectFit = 'cover';
    
    const coords = calculateCoords(pData.pos || 1, i);
    pionImg.style.left = coords.left;
    pionImg.style.top = coords.top;
    
    pionsWrap.appendChild(pionImg);
  });

  // UI Daftar Pemain Terhubung
  const listWrap = document.getElementById('snakePlayersList');
  listWrap.innerHTML = '';
  
  playerKeys.forEach((pKey, i) => {
    const pData = data.players[pKey];
    const chip = document.createElement('div');
    chip.style.cssText = `
      background: var(--panel-2); border: 1px solid var(--line);
      padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700;
      color: var(--ink); display: flex; align-items: center; gap: 8px;
    `;
    chip.innerHTML = `<img src="${PION_IMAGES[i % PION_IMAGES.length]}" style="width:16px; height:16px; border-radius:50%; object-fit:cover;"> ${pKey.toUpperCase()} (Kotak ${pData.pos})`;
    listWrap.appendChild(chip);
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
    document.getElementById('snakeResult').innerHTML = `🎉 Pertandingan Selesai! Selamat untuk para Pemenang!`;
    return;
  }

  btnRoll.disabled = !(myRole === currentTurnKey && !data.isRolling);
}

// ANIMASI KELUARAN DADU & PERGERAKAN PION
async function animatePionMovement(pKey, pIndex, startPos, diceVal) {
  const pionEl = document.getElementById(`pion-${pKey}`);
  if(!pionEl) return Math.min(startPos + diceVal, 100);

  let currentPos = startPos;
  
  // 1. Bergerak Langkah Demi Langkah
  for(let i = 0; i < diceVal; i++) {
    currentPos++;
    if(currentPos > 100) { currentPos = 100; break; }
    
    const coords = calculateCoords(currentPos, pIndex);
    pionEl.style.left = coords.left;
    pionEl.style.top = coords.top;
    
    await new Promise(r => setTimeout(r, 220));
  }

  // 2. Cek Logika Ular Tangga
  const eventPoint = SNAKES_AND_LADDERS.find(s => s.start === currentPos);
  if(eventPoint) {
    await new Promise(r => setTimeout(r, 250));
    
    const isLadder = eventPoint.end > eventPoint.start;
    
    if(isLadder) {
      pionEl.style.transition = 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
      showCustomAlert(`🚀 WAH NAIK TANGGA! Meluncur dari Kotak ${eventPoint.start} ➔ ${eventPoint.end}`);
    } else {
      pionEl.style.animation = 'diceRoll 0.3s ease-in-out infinite';
      showCustomAlert(`😱 SSSTT... DIMAKAN ULAR! Jatuh dari Kotak ${eventPoint.start} ➔ ${eventPoint.end}`);
      await new Promise(r => setTimeout(r, 400));
      pionEl.style.animation = 'none';
      pionEl.style.transition = 'all 0.8s ease-in-out';
    }

    currentPos = eventPoint.end;
    const finalCoords = calculateCoords(currentPos, pIndex);
    pionEl.style.left = finalCoords.left;
    pionEl.style.top = finalCoords.top;

    await new Promise(r => setTimeout(r, 850));
    pionEl.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
  }

  return currentPos;
}

document.getElementById('snakeBtnRoll').onclick = () => {
  if(!roomRef) return;
  const snakeRef = roomRef.child('snake');

  snakeRef.get().then(async snap => {
    const data = snap.val();
    if(!data) return;

    const playerKeys = Object.keys(data.players);
    const currentTurnKey = playerKeys[data.turnIndex];

    if(myRole !== currentTurnKey || data.isRolling) return;

    snakeRef.update({ isRolling: true });

    await new Promise(r => setTimeout(r, 600));
    const dice = Math.floor(Math.random() * 6) + 1;
    let oldPos = data.players[myRole].pos || 1;
    const pIndex = playerKeys.indexOf(myRole);

    let finalPos = await animatePionMovement(myRole, pIndex, oldPos, dice);

    // Tabrakan Jalur Antar Pion
    playerKeys.forEach(otherKey => {
      if(otherKey !== myRole && data.players[otherKey].pos === finalPos && finalPos < 100) {
        data.players[otherKey].pos = 1;
        showCustomAlert(`💥 CRITICAL! Pion ${myRole.toUpperCase()} menginjak ${otherKey.toUpperCase()}! Target kembali ke START.`);
      }
    });

    data.players[myRole].pos = finalPos;

    let nextTurnIndex = data.turnIndex;
    if (finalPos >= 100) {
      data.status = 'ended';
    } else if (dice !== 6) {
      nextTurnIndex = (data.turnIndex + 1) % playerKeys.length;
    }

    snakeRef.update({
      players: data.players,
      lastDice: dice,
      isRolling: false,
      turnIndex: nextTurnIndex,
      status: data.status || 'playing'
    });
  });
};

document.getElementById('btnSnakeBack').onclick = () => {
  if(snakeUnsub) snakeUnsub();
  showScreen('startScreen');
};
