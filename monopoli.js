// ======================================================
// monopoli.js — UI & Frontend Rules (Auction, Mortgage & Trade)
// ======================================================

let mpRef = null;
let latestMpData = null;
let mpPresence = {};
let mpAutoPassInterval = null;

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
      latestMpData = data;
      renderMpUI(data);
    }
  });

  document.getElementById('mpBtnRoll').onclick = mpDoRoll;
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
    
    // Opsi Pake Kartu Bebas Penjara jika Punya
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

// SISTEM LELANG PROPERTI (AUCTION)
function mpStartAuction() {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const tile = MP_BOARD_DATA[state.pos[myRole]];

    if (state.ownership[tile.id]) return cur;

    state.auction = {
      tileId: tile.id,
      currentBid: 10,
      highestBidder: null,
      passedRoles: []
    };
    state.lastActionText = `📢 Lelang Dimulai untuk ${tile.name}! Bid awal $10.`;
    return state;
  });
}

function mpBidAuction(amountAdd) {
  mpRef.transaction(cur => {
    if (!cur || !cur.auction) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const newBid = state.auction.currentBid + amountAdd;

    if (state.money[myRole] < newBid) return cur;

    state.auction.currentBid = newBid;
    state.auction.highestBidder = myRole;
    state.lastActionText = `🏷️ ${myRole.toUpperCase()} menawar $${newBid} untuk ${MP_BOARD_DATA[state.auction.tileId].name}!`;
    return state;
  });
}

function mpPassAuction() {
  mpRef.transaction(cur => {
    if (!cur || !cur.auction) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    state.auction.passedRoles = state.auction.passedRoles || [];

    if (!state.auction.passedRoles.includes(myRole)) {
      state.auction.passedRoles.push(myRole);
    }

    const activeRoles = getMpRoles(state.maxPlayers).filter(r => !(state.bankrupt || []).includes(r));
    if (state.auction.passedRoles.length >= activeRoles.length - (state.auction.highestBidder ? 1 : 0)) {
      if (state.auction.highestBidder) {
        const winner = state.auction.highestBidder;
        const cost = state.auction.currentBid;
        const tId = state.auction.tileId;

        state.money[winner] -= cost;
        state.ownership[tId] = winner;
        state.lastActionText = `🎉 ${winner.toUpperCase()} Memenangkan Lelang ${MP_BOARD_DATA[tId].name} seharga $${cost}!`;
      } else {
        state.lastActionText = `📢 Lelang dibatalkan, tidak ada tawaran.`;
      }
      delete state.auction;
    }
    return state;
  });
}

// MEMBANGUN RUMAH DENGAN SYARAT MONOPOLI KOMPLEKS
function mpDoBuyHouse() {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const pPos = state.pos[myRole];
    const tile = MP_BOARD_DATA[pPos];

    if (tile.type !== 'property' || state.ownership[tile.id] !== myRole) return cur;
    
    // Syarat Wajib: Harus Menguasai Seluruh Warna Group!
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

// SISTEM HIPOTIK / GADAI PROPERTI
function mpToggleMortgage(tileId) {
  if (!latestMpData || latestMpData.turn !== myRole) return;

  mpRef.transaction(cur => {
    if (!cur || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const tile = MP_BOARD_DATA[tileId];

    if (state.ownership[tile.id] !== myRole) return cur;

    state.mortgaged = state.mortgaged || {};
    const isMortgaged = !!state.mortgaged[tile.id];
    const value = Math.floor(tile.price / 2);

    if (!isMortgaged) {
      // Gadai Properti -> Dapatkan 50% Uang Tunai
      state.mortgaged[tile.id] = true;
      state.money[myRole] += value;
      state.lastActionText = `🏦 ${myRole.toUpperCase()} Menggadaikan ${tile.name} (+$${value})!`;
    } else {
      // Tebus Gadai -> Bayar 50% + 10% Bunga
      const redeemCost = Math.floor(value * 1.1);
      if (state.money[myRole] < redeemCost) return cur;

      delete state.mortgaged[tile.id];
      state.money[myRole] -= redeemCost;
      state.lastActionText = `🏦 ${myRole.toUpperCase()} Menebus Gadai ${tile.name} (-$${redeemCost})!`;
    }
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

function drawMpCanvas(data) {
  const canvas = document.getElementById('mpBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = 400;
  canvas.height = 400;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 400, 400);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(50, 50, 300, 300);

  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MONOPOLI', 200, 190);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Dadu: [ ${data.dice ? data.dice.join(' ] [ ') : '1 ] [ 1'} ]`, 200, 215);

  for (let i = 0; i < 40; i++) {
    let x = 0, y = 0;
    if (i <= 10) { x = 350 - i * 30; y = 350; }
    else if (i <= 20) { x = 50; y = 350 - (i - 10) * 30; }
    else if (i <= 30) { x = 50 + (i - 20) * 30; y = 50; }
    else { x = 350; y = 50 + (i - 30) * 30; }

    const tile = MP_BOARD_DATA[i];
    const owner = data.ownership && data.ownership[tile.id];
    const isMortgaged = data.mortgaged && data.mortgaged[tile.id];
    const houseCount = (data.houses && data.houses[tile.id]) || 0;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, 30, 30);

    if (tile.group && MP_GROUP_COLORS[tile.group]) {
      ctx.fillStyle = MP_GROUP_COLORS[tile.group];
      ctx.fillRect(x + 1, y + 1, 28, 5);
    }

    ctx.fillStyle = isMortgaged ? '#94a3b8' : '#64748b';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isMortgaged ? 'MORT' : (tile.short || i), x + 15, y + (tile.group ? 13 : 10));

    if (owner) {
      ctx.fillStyle = MP_PLAYER_COLORS[owner];
      ctx.fillRect(x + 2, y + 15, 26, 3);
    }

    if (houseCount > 0) {
      ctx.fillStyle = houseCount === 5 ? '#ef4444' : '#22c55e';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(houseCount === 5 ? '★' : `${houseCount}h`, x + 15, y + 26);
    }

    getMpRoles(data.maxPlayers).forEach((r, idx) => {
      if (!(data.bankrupt || []).includes(r) && data.pos && data.pos[r] === i) {
        ctx.beginPath();
        ctx.arc(x + 7 + (idx % 3) * 8, y + 12 + Math.floor(idx / 3) * 9, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = MP_PLAYER_COLORS[r];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }
}
