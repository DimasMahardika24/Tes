// ======================================================
// snake.js — Hybrid Board (Image Background + Canvas Pawn)
// Fixed: Back button error & unsubscription
// ======================================================

const SNAKES_AND_LADDERS = [
  { start: 29, end: 7 },   { start: 24, end: 12 }, { start: 15, end: 37 },
  { start: 23, end: 41 },  { start: 72, end: 36 }, { start: 49, end: 86 },
  { start: 90, end: 56 },  { start: 75, end: 64 }, { start: 74, end: 95 },
  { start: 91, end: 72 },  { start: 97, end: 78 }
];

const PLAYER_COLORS = [
  { main: '#ef4444', dark: '#991b1b', light: '#fca5a5' },
  { main: '#3b82f6', dark: '#1e40af', light: '#93c5fd' },
  { main: '#eab308', dark: '#854d0e', light: '#fef08a' },
  { main: '#10b981', dark: '#065f46', light: '#6ee7b7' },
  { main: '#a855f7', dark: '#6b21a8', light: '#d8b4fe' },
  { main: '#f97316', dark: '#9a3412', light: '#fdba74' },
  { main: '#ec4899', dark: '#9d174d', light: '#fbcfe8' }
];

let snakeUnsub = null;
let snakeRefGlobal = null;
let isAnimatingLocal = false;
let currentGameState = null;
let localVisualPositions = {};

let audioCtxSnake = null;
function getSnakeAudioContext() {
  if (!audioCtxSnake) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtxSnake = new AudioContextClass();
  }
  if (audioCtxSnake && audioCtxSnake.state === 'suspended') {
    audioCtxSnake.resume();
  }
  return audioCtxSnake;
}

function playSnakeStepSound() {
  try {
    const ctx = getSnakeAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

function getCanvasContext() {
  const canvas = document.getElementById('snakeCanvas');
  return canvas ? canvas.getContext('2d') : null;
}

function getBoardCoordinates(pos, playerIndex) {
  const row = Math.floor((pos - 1) / 10);
  const col = (pos - 1) % 10;
  const actualCol = (row % 2 === 0) ? col : (9 - col);
  const actualRow = 9 - row;

  const tileSize = 80;
  const baseX = actualCol * tileSize + tileSize / 2;
  const baseY = actualRow * tileSize + tileSize / 2;

  const offsets = [
    { x: -12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: 12 },
    { x: 12, y: -12 }, { x: 0, y: -16 }, { x: 0, y: 16 }, { x: 0, y: 0 }
  ];
  const offset = offsets[playerIndex % offsets.length];

  return { x: baseX + offset.x, y: baseY + offset.y };
}

function drawCanvasState() {
  const ctx = getCanvasContext();
  if (!ctx) return;

  ctx.clearRect(0, 0, 800, 800);
  if (!currentGameState || !currentGameState.players) return;

  const playerKeys = Object.keys(currentGameState.players);

  playerKeys.forEach((pKey, index) => {
    const pos = localVisualPositions[pKey] || currentGameState.players[pKey].pos || 1;
    const coords = getBoardCoordinates(pos, index);
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];

    ctx.save();

    ctx.beginPath();
    ctx.ellipse(coords.x, coords.y + 14, 18, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      coords.x - 6, coords.y - 8, 2,
      coords.x, coords.y, 22
    );
    gradient.addColorStop(0, color.light);
    gradient.addColorStop(0.4, color.main);
    gradient.addColorStop(1, color.dark);

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

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

  snakeRefGlobal = roomRef.child('snake');

  if(myRole === 'p1') {
    snakeRefGlobal.get().then(snap => {
      if(!snap.exists()) {
        const maxP = window.snakeSelectedMaxPlayers || 2;
        const initPlayers = {};
        for(let i = 1; i <= maxP; i++) {
          initPlayers[`p${i}`] = { pos: 1, rank: 0 };
        }
        snakeRefGlobal.set({
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

  if(snakeUnsub) {
    snakeRefGlobal.off('value', snakeUnsub);
    snakeUnsub = null;
  }

  snakeUnsub = snakeRefGlobal.on('value', snap => {
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
    
    let rankText = pData.rank ? ` 🏆 Juara ${pData.rank}` : '';
    chip.innerHTML = `<span style="width:12px; height:12px; border-radius:50%; background:${color.main}; border:1.5px solid #fff;"></span> ${pKey.toUpperCase()} (Kotak ${pData.pos})${rankText}`;
    listWrap.appendChild(chip);
  });
}

async function animatePionMovement(pKey, startPos, diceVal) {
  let currentPos = startPos;
  
  for(let i = 0; i < diceVal; i++) {
    currentPos++;
    if(currentPos > 100) { currentPos = 100; break; }
    
    localVisualPositions[pKey] = currentPos;
    drawCanvasState();
    playSnakeStepSound(); 
    
    await new Promise(r => setTimeout(r, 260));
  }

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
    playSnakeStepSound();
    await new Promise(r => setTimeout(r, 600));
    currentPos = eventPoint.end;
  }

  return currentPos;
}

document.getElementById('snakeBtnRoll').onclick = () => {
  if(!snakeRefGlobal || isAnimatingLocal) return;
  getSnakeAudioContext();

  snakeRefGlobal.get().then(async snap => {
    const data = snap.val();
    if(!data) return;

    const playerKeys = Object.keys(data.players);
    const currentTurnKey = playerKeys[data.turnIndex];

    if(myRole !== currentTurnKey || data.isRolling) return;

    isAnimatingLocal = true;
    document.getElementById('snakeBtnRoll').disabled = true;

    const diceBox = document.getElementById('snakeDiceBox');
    diceBox.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
    diceBox.style.transform = 'scale(1.4) rotate(15deg)';
    diceBox.style.boxShadow = '0 10px 25px rgba(232, 172, 31, 0.6)';

    let startTime = Date.now();
    let duration = 900;

    const rollInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const rot = Math.floor(Math.random() * 360);
      const randomDice = Math.floor(Math.random() * 6) + 1;
      
      diceBox.style.transform = `scale(${1.4 - progress * 0.4}) rotate(${rot}deg)`;
      diceBox.textContent = randomDice;

      if (elapsed >= duration) clearInterval(rollInterval);
    }, 60);

    await new Promise(r => setTimeout(r, duration));

    diceBox.style.transform = 'scale(1) rotate(0deg)';
    diceBox.style.boxShadow = '0 6px 14px rgba(0,0,0,0.4)';

    const dice = Math.floor(Math.random() * 6) + 1;
    diceBox.textContent = dice;

    await new Promise(r => setTimeout(r, 350));

    let oldPos = data.players[myRole].pos || 1;
    let finalPos = await animatePionMovement(myRole, oldPos, dice);

    playerKeys.forEach(otherKey => {
      if(otherKey !== myRole && data.players[otherKey].pos === finalPos && finalPos < 100 && !data.players[otherKey].rank) {
        data.players[otherKey].pos = 1;
        localVisualPositions[otherKey] = 1;
        showCustomAlert(`💥 Pion ${myRole.toUpperCase()} menginjak ${otherKey.toUpperCase()}! Target kembali ke START.`);
      }
    });

    data.players[myRole].pos = finalPos;

    const finishedPlayers = playerKeys.filter(k => data.players[k].rank > 0);

    if (finalPos >= 100 && !data.players[myRole].rank) {
      const nextRank = finishedPlayers.length + 1;
      data.players[myRole].rank = nextRank;
      showCustomAlert(`🏆 Selamat! ${myRole.toUpperCase()} berhasil Finis sebagai Juara ${nextRank}!`);
    }

    const currentFinishedCount = playerKeys.filter(k => data.players[k].rank > 0).length;
    let nextTurnIndex = data.turnIndex;

    if (currentFinishedCount >= playerKeys.length - 1) {
      data.status = 'ended';
    } else {
      if (dice === 6 && finalPos < 100) {
        nextTurnIndex = data.turnIndex;
        showCustomAlert(`🎲 HOKI! Dapat Dadu 6, ${myRole.toUpperCase()} Lempar Lagi!`);
      } else {
        do { nextTurnIndex = (nextTurnIndex + 1) % playerKeys.length; } 
        while (data.players[playerKeys[nextTurnIndex]].rank > 0);
      }
    }

    await snakeRefGlobal.update({
      players: data.players,
      lastDice: dice,
      isRolling: false,
      turnIndex: nextTurnIndex,
      status: data.status || 'playing'
    });

    isAnimatingLocal = false;
    drawCanvasState();
    updateSnakeControls(data);
  });
};

// 🛠️ FIX: Unsubscribe yang benar & hapus listener bot
document.getElementById('btnSnakeBack').onclick = () => {
  // 1. Matikan listener dengan benar
  if (snakeRefGlobal && snakeUnsub) {
    snakeRefGlobal.off('value', snakeUnsub);
    snakeUnsub = null;
  }

  // 2. Matikan listener Bot jika dalam mode bot
  if (typeof cleanupBotListeners === 'function') {
    cleanupBotListeners();
  }

  // 3. Hapus presence
  if (activePresenceRef) {
    activePresenceRef.remove();
    activePresenceRef = null;
  }

  // 4. Hapus room jika kita host (P1)
  if (roomRef && myRole === 'p1') {
    roomRef.child('snake').remove().catch(() => {});
    if (roomIdGlobal) {
      dbRoot.ref('publicRooms/' + roomIdGlobal).remove().catch(() => {});
    }
  }

  clearSession();
  hideRoomBadge();
  currentGame = null;
  myRole = null;
  roomIdGlobal = null;
  roomRef = null;

  showScreen('startScreen');
};