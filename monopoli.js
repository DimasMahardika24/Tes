// ======================================================
// monopoli.js — Full Visual Animation & Board CDN Integrated
// ======================================================

let mpRef = null;
let latestMpData = null;
let mpPresence = {};
let mpAutoPassInterval = null;

// Pre-load Gambar Board dari CDN URL
const boardImage = new Image();
boardImage.crossOrigin = "anonymous";
boardImage.src = 'https://cdn.jsdelivr.net/gh/dikzzgans424-star/CDN-Miwa-botz@main/uploads/1788437852494.jpg';

// Web Audio API untuk Efek Suara Step Pion Melangkah
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playStepSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

// State Animasi Lokal
let animState = {
  isRolling: false,
  rollFrames: 0,
  tempDice: [1, 1],
  movingRole: null,
  pawnAnimPos: {},
  stepCounterText: "",
  stepCounterAlpha: 0
};

function initMonopoli() {
  mpRef = roomRef.child('monopoli');
  document.getElementById('mpRoleTag').textContent = myRole.toUpperCase();

  document.getElementById('btnMpBack').onclick = () => {
    if (activePresenceRef) activePresenceRef.remove();
    clearSession();
    
    if (roomRef && myRole === 'p1') {
      mpRef.remove().catch(()=>{});
      if (roomIdGlobal) dbRoot.ref('publicRooms/' + roomIdGlobal).remove().catch(()=>{});
    }
    location.reload();
  };

  roomRef.child('presence/' + myRole).transaction(cur => cur === null ? true : cur);

  if (myRole === 'p1') {
    mpRef.transaction(cur => cur || {
      phase: 'waiting',
      maxPlayers: window.mpSelectedMaxPlayers || 3
    });
  }

  setupPresence('mpStatus', roomIdGlobal, (presenceData) => {
    mpPresence = presenceData || {};
    if (latestMpData) renderMpUI(latestMpData);
  });

  roomRef.child('presence').on('value', snap => {
    mpPresence = snap.val() || {};
    if (myRole === 'p1' && latestMpData && latestMpData.phase === 'waiting') {
      const activeRoles = getMpRoles(latestMpData.maxPlayers);
      const allIn = activeRoles.every(s => mpPresence[s]);
      if (allIn) {
        mpRef.transaction(cur => (cur && cur.phase === 'waiting') ? buildNewMpGame(cur.maxPlayers) : cur);
      }
    }
  });

  mpRef.on('value', snap => {
    const data = snap.val();
    if (data) {
      // Deteksi Pergerakan Pion untuk Animasi Melangkah
      if (latestMpData && data.pos) {
        Object.keys(data.pos).forEach(r => {
          const oldP = latestMpData.pos[r] || 0;
          const newP = data.pos[r] || 0;
          if (oldP !== newP && !(data.inJail && data.inJail[r] > 0 && newP === 10)) {
            triggerPawnMovementAnim(r, oldP, newP);
          }
        });
      }

      // Sync Posisi Awal
      if (!latestMpData && data.pos) {
        Object.keys(data.pos).forEach(r => {
          animState.pawnAnimPos[r] = data.pos[r];
        });
      }

      latestMpData = data;
      renderMpUI(data);
    }
  });

  document.getElementById('mpBtnRoll').onclick = mpDoRollWithAnim;
  document.getElementById('mpBtnBuy').onclick = mpDoBuy;
  document.getElementById('mpBtnHouse').onclick = mpDoBuyHouse;
  document.getElementById('mpBtnPayJail').onclick = mpDoPayJail;
  document.getElementById('mpBtnEndTurn').onclick = mpDoEndTurn;

  if (mpAutoPassInterval) clearInterval(mpAutoPassInterval);
  mpAutoPassInterval = setInterval(() => {
    if (myRole === 'p1' && latestMpData && latestMpData.phase === 'playing') {
      const elapsed = (Date.now() - (latestMpData.lastTurnTime || Date.now())) / 1000;
      if (elapsed > 35) {
        mpDoAutoPass();
      }
    }
  }, 3000);
}

// Trigger Lempar Dadu Visual Berputar
function mpDoRollWithAnim() {
  if (!latestMpData || latestMpData.turn !== myRole || latestMpData.hasRolled || animState.isRolling) return;

  animState.isRolling = true;
  animState.rollFrames = 0;

  const rollInterval = setInterval(() => {
    animState.tempDice = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];
    animState.rollFrames++;
    drawMpCanvas(latestMpData);

    if (animState.rollFrames > 12) {
      clearInterval(rollInterval);
      animState.isRolling = false;
      mpDoRoll(); // Eksekusi Transaksi Firebase
    }
  }, 60);
}

// Trigger Animasi Melangkah Step-by-Step
function triggerPawnMovementAnim(role, startPos, endPos) {
  let stepsTotal = (endPos >= startPos) ? (endPos - startPos) : (40 - startPos + endPos);
  let currentStep = 0;
  animState.movingRole = role;

  const moveInterval = setInterval(() => {
    currentStep++;
    const curTilePos = (startPos + currentStep) % 40;
    animState.pawnAnimPos[role] = curTilePos;

    animState.stepCounterText = `+ ${currentStep} Langkah`;
    animState.stepCounterAlpha = 1.0;

    playStepSound();
    drawMpCanvas(latestMpData);

    if (currentStep >= stepsTotal) {
      clearInterval(moveInterval);
      animState.movingRole = null;
      setTimeout(() => { animState.stepCounterAlpha = 0; drawMpCanvas(latestMpData); }, 600);
    }
  }, 180);
}

function mpDoAutoPass() {
  mpRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing') return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const oldTurn = state.turn;
    state.hasRolled = false;
    state.doubleStreak = 0;
    state.turn = nextMpTurn(state);
    state.lastTurnTime = Date.now();
    state.lastActionText = `⏰ Waktu ${oldTurn.toUpperCase()} Habis! Giliran dipindah ke ${state.turn.toUpperCase()}`;
    return state;
  });
}

function mpDoPayJail() {
  if (!latestMpData || latestMpData.turn !== myRole || latestMpData.hasRolled) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    
    if (state.jailCards && state.jailCards[myRole] > 0) {
      state.jailCards[myRole] -= 1;
      state.inJail[myRole] = 0;
      state.hasRolled = false;
      state.lastActionText = `🎟️ ${myRole.toUpperCase()} Memakai Kartu Bebas Penjara! Silakan Lempar Dadu.`;
      return state;
    }

    if (state.money[myRole] < 50) return cur;

    state.money[myRole] -= 50;
    state.inJail[myRole] = 0;
    state.hasRolled = false;
    state.lastActionText = `💵 ${myRole.toUpperCase()} Membayar $50 & Bebas Dari Penjara! Silakan Lempar Dadu.`;
    return state;
  });
}

function mpDoRoll() {
  if (!latestMpData || latestMpData.turn !== myRole || latestMpData.hasRolled) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole || cur.hasRolled) return cur;
    const state = JSON.parse(JSON.stringify(cur));

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const total = d1 + d2;
    const isDouble = (d1 === d2);

    state.dice = [d1, d2];
    let actionLog = `🎲 ${myRole.toUpperCase()} lempar dadu (${d1}+${d2}=${total}).`;
    let shouldMovePawn = true;

    if (state.inJail && state.inJail[myRole] > 0) {
      if (isDouble) {
        state.inJail[myRole] = 0;
        actionLog += ` 🎉 DADU DOBEL! Bebas dari Penjara & Langsung Jalan!`;
      } else {
        state.inJail[myRole] -= 1;
        if (state.inJail[myRole] === 0) {
          state.money[myRole] -= 50;
          actionLog += ` ❌ Gagal Dobel 3x. Dipaksa Bayar $50 & Jalan!`;
          if (state.money[myRole] < 0) handleBankruptcy(state, myRole);
        } else {
          shouldMovePawn = false;
          state.hasRolled = true;
          actionLog += ` ❌ Tidak dobel. Masih dipenjara (${state.inJail[myRole]} turn).`;
          state.lastActionText = actionLog;
          return state;
        }
      }
    }

    if (isDouble && (!state.inJail || state.inJail[myRole] === 0)) {
      state.doubleStreak = (state.doubleStreak || 0) + 1;
      if (state.doubleStreak >= 3) {
        state.pos[myRole] = 10;
        state.inJail[myRole] = 3;
        state.doubleStreak = 0;
        state.hasRolled = true;
        state.lastActionText = `🚨 ${myRole.toUpperCase()} Dobel 3x Berturut-turut! Otomatis Masuk Penjara!`;
        return state;
      }
      state.hasRolled = false;
      actionLog += ` 🔥 DOBEL! Boleh Lempar Dadu Lagi!`;
    } else {
      state.doubleStreak = 0;
      state.hasRolled = true;
    }

    if (shouldMovePawn) {
      let curPos = state.pos[myRole] || 0;
      let newPos = (curPos + total) % 40;

      if (newPos < curPos) {
        state.money[myRole] += 200;
        actionLog += ` 🟢 Lewat START +$200.`;
      }
      state.pos[myRole] = newPos;

      const tile = MP_BOARD_DATA[newPos];
      actionLog += ` Mampir di ${tile.name}.`;

      if (tile.type === 'goto_jail') {
        state.pos[myRole] = 10;
        state.inJail[myRole] = 3;
        state.doubleStreak = 0;
        state.hasRolled = true;
        actionLog += ` 🚨 Masuk Penjara!`;
      } else if (tile.type === 'tax') {
        state.money[myRole] -= tile.price;
        actionLog += ` 💸 Bayar pajak $${tile.price}.`;
        if (state.money[myRole] < 0) handleBankruptcy(state, myRole);
      } else if (tile.type === 'chance' || tile.type === 'chest') {
        const cards = tile.type === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
        const card = cards[Math.floor(Math.random() * cards.length)];
        actionLog += ` 🎴 Kartu: ${card.text}`;

        if (card.amount) {
          state.money[myRole] += card.amount;
          if (state.money[myRole] < 0) handleBankruptcy(state, myRole);
        }
        if (card.getOutJail) {
          state.jailCards = state.jailCards || {};
          state.jailCards[myRole] = (state.jailCards[myRole] || 0) + 1;
        }
        if (card.gotoJail) {
          state.pos[myRole] = 10;
          state.inJail[myRole] = 3;
          state.doubleStreak = 0;
          state.hasRolled = true;
        } else if (card.goto !== undefined) {
          state.pos[myRole] = card.goto;
          if (card.collectStart) state.money[myRole] += 200;
        }
      } else if ((tile.type === 'property' || tile.type === 'station' || tile.type === 'utility') && state.ownership[tile.id]) {
        const owner = state.ownership[tile.id];
        if (owner !== myRole && !(state.bankrupt || []).includes(owner)) {
          const rent = calculateRent(state, tile, owner, total);
          if (rent > 0) {
            state.money[myRole] -= rent;
            state.money[owner] += rent;
            actionLog += ` 🏠 Bayar sewa $${rent} ke ${owner.toUpperCase()}.`;
            if (state.money[myRole] < 0) handleBankruptcy(state, myRole, owner);
          } else {
            actionLog += ` 🏦 Tanah sedang digadaikan, sewa gratis!`;
          }
        }
      }
    }

    state.lastActionText = actionLog;
    return state;
  });
}

function mpDoBuy() {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const pPos = state.pos[myRole];
    const tile = MP_BOARD_DATA[pPos];

    if (state.ownership[tile.id] || (tile.type !== 'property' && tile.type !== 'station' && tile.type !== 'utility')) return cur;
    if (state.money[myRole] < tile.price) return cur;

    state.money[myRole] -= tile.price;
    state.ownership[tile.id] = myRole;
    state.lastActionText = `🏠 ${myRole.toUpperCase()} membeli ${tile.name} seharga $${tile.price}!`;
    return state;
  });
}

function mpDoBuyHouse() {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const pPos = state.pos[myRole];
    const tile = MP_BOARD_DATA[pPos];

    if (tile.type !== 'property' || state.ownership[tile.id] !== myRole) return cur;

    if (!ownsFullGroup(state, myRole, tile.group)) {
      state.lastActionText = `⚠️ Harus menguasai seluruh warna ${tile.group.toUpperCase()} sebelum membangun rumah!`;
      return state;
    }

    state.houses = state.houses || {};
    const curHouse = state.houses[tile.id] || 0;
    if (curHouse >= 5) return cur;

    const cost = tile.housePrice || 100;
    if (state.money[myRole] < cost) return cur;

    state.money[myRole] -= cost;
    state.houses[tile.id] = curHouse + 1;

    const label = state.houses[tile.id] === 5 ? 'HOTEL ★' : `Rumah Ke-${state.houses[tile.id]}`;
    state.lastActionText = `🏠+ ${myRole.toUpperCase()} Membangun ${label} di ${tile.name} ($${cost})!`;
    return state;
  });
}

function mpDoEndTurn() {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));

    state.hasRolled = false;
    state.doubleStreak = 0;
    state.turn = nextMpTurn(state);
    state.lastTurnTime = Date.now();
    state.lastActionText = `⏭️ Giliran berpindah ke ${state.turn.toUpperCase()}`;
    return state;
  });
}

function renderMpUI(data) {
  const statusEl = document.getElementById('mpStatus');
  const actBox = document.getElementById('mpActions');
  const resultEl = document.getElementById('mpResult');

  if (data.phase === 'waiting') {
    statusEl.textContent = `🟡 Menunggu pemain bergabung...`;
    actBox.style.display = 'none';
    return;
  }

  if (data.phase === 'gameover') {
    statusEl.textContent = `🏆 PERMAINAN SELESAI!`;
    actBox.style.display = 'none';
    resultEl.style.display = 'block';
    resultEl.innerHTML = `🥇 PEMENANG: ${(data.winner || 'P1').toUpperCase()}!`;
    return;
  }

  statusEl.textContent = `${data.turn === myRole ? '🟢 GILIRANMU!' : '🟡 Giliran ' + data.turn.toUpperCase()} | [${data.lastActionText}]`;

  const listWrap = document.getElementById('mpPlayerListWrap');
  listWrap.innerHTML = '';
  getMpRoles(data.maxPlayers).forEach(r => {
    const isTurn = data.turn === r;
    const isBankrupt = (data.bankrupt || []).includes(r);
    const inJailCount = (data.inJail && data.inJail[r]) || 0;
    const jailCardCount = (data.jailCards && data.jailCards[r]) || 0;

    const div = document.createElement('div');
    div.style.cssText = `background:var(--panel-2); padding:8px 10px; border-radius:8px; border:1px solid ${isTurn ? 'var(--gold)' : 'var(--line)'}; font-size:12px; opacity:${isBankrupt ? '0.4' : '1'};`;
    div.innerHTML = `
      <div style="font-weight:bold; color:${MP_PLAYER_COLORS[r]}">
        ${r.toUpperCase()} ${mpPresence[r] ? '🟢' : '🔴'} ${isTurn ? '⭐' : ''} ${inJailCount > 0 ? '🚨' : ''} ${jailCardCount > 0 ? '🎟️' : ''}
      </div>
      <div style="color:var(--ink); font-weight:700;">
        ${isBankrupt ? '💀 BANGKRUT' : '💰 $' + (data.money[r] || 0)}
      </div>
    `;
    listWrap.appendChild(div);
  });

  const canAct = data.phase === 'playing' && data.turn === myRole && !(data.bankrupt || []).includes(myRole);
  actBox.style.display = canAct ? 'grid' : 'none';

  if (canAct) {
    const btnRoll = document.getElementById('mpBtnRoll');
    const btnBuy = document.getElementById('mpBtnBuy');
    const btnHouse = document.getElementById('mpBtnHouse');
    const btnPayJail = document.getElementById('mpBtnPayJail');
    const btnEnd = document.getElementById('mpBtnEndTurn');

    const inJail = (data.inJail && data.inJail[myRole] > 0);
    const hasJailCard = (data.jailCards && data.jailCards[myRole] > 0);

    if (inJail && !data.hasRolled) {
      btnPayJail.style.display = 'block';
      btnPayJail.textContent = hasJailCard ? "🎟️ Pakai Kartu Bebas Penjara" : "💵 Bayar Denda Penjara ($50)";
    } else {
      btnPayJail.style.display = 'none';
    }

    if (!data.hasRolled) {
      btnRoll.style.display = 'block';
      btnBuy.style.display = 'none';
      btnHouse.style.display = 'none';
      btnEnd.style.display = 'none';
    } else {
      btnRoll.style.display = 'none';
      btnEnd.style.display = 'block';

      const tile = MP_BOARD_DATA[data.pos[myRole]];
      
      if ((tile.type === 'property' || tile.type === 'station' || tile.type === 'utility') && !data.ownership[tile.id] && data.money[myRole] >= tile.price) {
        btnBuy.style.display = 'block';
        btnBuy.textContent = `🏠 Beli ${tile.name} ($${tile.price})`;
      } else {
        btnBuy.style.display = 'none';
      }

      if (tile.type === 'property' && data.ownership[tile.id] === myRole) {
        const curHouse = (data.houses && data.houses[tile.id]) || 0;
        const houseCost = tile.housePrice || 100;
        if (curHouse < 5 && data.money[myRole] >= houseCost) {
          btnHouse.style.display = 'block';
          btnHouse.textContent = curHouse === 4 ? `★ Beli Hotel ($${houseCost})` : `🏠+ Beli Rumah (${curHouse + 1}/4) ($${houseCost})`;
        } else {
          btnHouse.style.display = 'none';
        }
      } else {
        btnHouse.style.display = 'none';
      }
    }
  }

  drawMpCanvas(data);
}

// RENDER CANVAS UTAMA BERBANTUAN GAMBAR BOARD CDN & ANIMASI
function drawMpCanvas(data) {
  const canvas = document.getElementById('mpBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = 480;
  canvas.height = 480;

  // 1. Gambar Background Board CDN
  if (boardImage.complete && boardImage.naturalWidth !== 0) {
    ctx.drawImage(boardImage, 0, 0, 480, 480);
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 480, 480);
  }

  // 2. Render Dadu Berputar / Static
  const dVals = animState.isRolling ? animState.tempDice : (data.dice || [1, 1]);
  draw3DDice(ctx, 220, 240, dVals[0], animState.isRolling);
  draw3DDice(ctx, 260, 240, dVals[1], animState.isRolling);

  // 3. Render Floating Counter (+X Langkah)
  if (animState.stepCounterAlpha > 0 && animState.stepCounterText) {
    ctx.fillStyle = `rgba(234, 179, 8, ${animState.stepCounterAlpha})`;
    ctx.font = 'bold 16px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(animState.stepCounterText, 240, 205);
  }

  // 4. Render Overlay Pemilik, Rumah, & Pion Pemain
  for (let i = 0; i < 40; i++) {
    let x = 0, y = 0;
    if (i <= 10) { x = 420 - i * 36; y = 420; }
    else if (i <= 20) { x = 60; y = 420 - (i - 10) * 36; }
    else if (i <= 30) { x = 60 + (i - 20) * 36; y = 60; }
    else { x = 420; y = 60 + (i - 30) * 36; }

    const tile = MP_BOARD_DATA[i];
    const owner = data.ownership && data.ownership[tile.id];
    const isMortgaged = data.mortgaged && data.mortgaged[tile.id];
    const houseCount = (data.houses && data.houses[tile.id]) || 0;

    // Overlay Status Gadai
    if (isMortgaged) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x + 1, y + 1, 34, 34);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GADAI', x + 18, y + 20);
    }

    // Indikator Warna Pemilik Properti
    if (owner && !isMortgaged) {
      ctx.fillStyle = MP_PLAYER_COLORS[owner];
      ctx.fillRect(x + 2, y + 30, 32, 4);
    }

    // Render Rumah / Hotel
    if (houseCount > 0 && !isMortgaged) {
      if (houseCount === 5) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x + 13, y + 3, 10, 6);
      } else {
        ctx.fillStyle = '#22c55e';
        for (let h = 0; h < houseCount; h++) {
          ctx.fillRect(x + 4 + (h * 7), y + 3, 5, 5);
        }
      }
    }

    // Render Pion Pemain dengan Animasi Smooth
    getMpRoles(data.maxPlayers).forEach((r, idx) => {
      if (!(data.bankrupt || []).includes(r)) {
        const renderTileIndex = animState.pawnAnimPos[r] !== undefined ? animState.pawnAnimPos[r] : (data.pos ? data.pos[r] : 0);
        
        if (Math.floor(renderTileIndex) === i) {
          const px = x + 10 + (idx % 3) * 9;
          const py = y + 16 + Math.floor(idx / 3) * 10;

          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fillStyle = MP_PLAYER_COLORS[r];
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    });
  }
}

// Helper Dadu 3D Berputar
function draw3DDice(ctx, x, y, val, isSpinning) {
  ctx.save();
  ctx.translate(x, y);

  if (isSpinning) {
    const rot = (Date.now() / 30) % (Math.PI * 2);
    ctx.rotate(rot);
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-12, -12, 24, 24);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.strokeRect(-12, -12, 24, 24);

  if (!isSpinning) {
    ctx.fillStyle = '#0f172a';
    const dots = {
      1: [[0,0]],
      2: [[-5,-5], [5,5]],
      3: [[-5,-5], [0,0], [5,5]],
      4: [[-5,-5], [5,-5], [-5,5], [5,5]],
      5: [[-5,-5], [5,-5], [0,0], [-5,5], [5,5]],
      6: [[-5,-6], [5,-6], [-5,0], [5,0], [-5,6], [5,6]]
    }[val] || [];

    dots.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.restore();
}

boardImage.onload = () => {
  if (latestMpData) drawMpCanvas(latestMpData);
};
