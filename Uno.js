// ======================================================
// Uno.js — Uno Battle Arena (2-6 Pemain Realtime)
// Bagian dari Game Hub, terintegrasi dengan shared.js
// ======================================================

let unoRef = null;
let latestUnoData = null;
let unoPresence = {};
let selectedUnoKeys = new Set();
let unoNames = {};
let unoTimerCheck = null;

// Pemicu animasi bagi kartu
let unoLastAnimatedHand = null;
let unoHasRenderedOnce = false;

const UNO_BASE_URL = "https://unocardinfo.victorhomedia.com/graphics/uno_card-";
const UNO_CARD_URLS = {
  // MERAH
  "merah_0": UNO_BASE_URL + "red0.png", "merah_1": UNO_BASE_URL + "red1.png", "merah_2": UNO_BASE_URL + "red2.png",
  "merah_3": UNO_BASE_URL + "red3.png", "merah_4": UNO_BASE_URL + "red4.png", "merah_5": UNO_BASE_URL + "red5.png",
  "merah_6": UNO_BASE_URL + "red6.png", "merah_7": UNO_BASE_URL + "red7.png", "merah_8": UNO_BASE_URL + "red8.png",
  "merah_9": UNO_BASE_URL + "red9.png", "merah_draw2": UNO_BASE_URL + "reddraw2.png",
  "merah_reverse": UNO_BASE_URL + "redreverse.png", "merah_skip": UNO_BASE_URL + "redskip.png",
  // KUNING
  "kuning_0": UNO_BASE_URL + "yellow0.png", "kuning_1": UNO_BASE_URL + "yellow1.png", "kuning_2": UNO_BASE_URL + "yellow2.png",
  "kuning_3": UNO_BASE_URL + "yellow3.png", "kuning_4": UNO_BASE_URL + "yellow4.png", "kuning_5": UNO_BASE_URL + "yellow5.png",
  "kuning_6": UNO_BASE_URL + "yellow6.png", "kuning_7": UNO_BASE_URL + "yellow7.png", "kuning_8": UNO_BASE_URL + "yellow8.png",
  "kuning_9": UNO_BASE_URL + "yellow9.png", "kuning_draw2": UNO_BASE_URL + "yellowdraw2.png",
  "kuning_reverse": UNO_BASE_URL + "yellowreverse.png", "kuning_skip": UNO_BASE_URL + "yellowskip.png",
  // HIJAU
  "hijau_0": UNO_BASE_URL + "green0.png", "hijau_1": UNO_BASE_URL + "green1.png", "hijau_2": UNO_BASE_URL + "green2.png",
  "hijau_3": UNO_BASE_URL + "green3.png", "hijau_4": UNO_BASE_URL + "green4.png", "hijau_5": UNO_BASE_URL + "green5.png",
  "hijau_6": UNO_BASE_URL + "green6.png", "hijau_7": UNO_BASE_URL + "green7.png", "hijau_8": UNO_BASE_URL + "green8.png",
  "hijau_9": UNO_BASE_URL + "green9.png", "hijau_draw2": UNO_BASE_URL + "greendraw2.png",
  "hijau_reverse": UNO_BASE_URL + "greenreverse.png", "hijau_skip": UNO_BASE_URL + "greenskip.png",
  // BIRU
  "biru_0": UNO_BASE_URL + "blue0.png", "biru_1": UNO_BASE_URL + "blue1.png", "biru_2": UNO_BASE_URL + "blue2.png",
  "biru_3": UNO_BASE_URL + "blue3.png", "biru_4": UNO_BASE_URL + "blue4.png", "biru_5": UNO_BASE_URL + "blue5.png",
  "biru_6": UNO_BASE_URL + "blue6.png", "biru_7": UNO_BASE_URL + "blue7.png", "biru_8": UNO_BASE_URL + "blue8.png",
  "biru_9": UNO_BASE_URL + "blue9.png", "biru_draw2": UNO_BASE_URL + "bluedraw2.png",
  "biru_reverse": UNO_BASE_URL + "bluereverse.png", "biru_skip": UNO_BASE_URL + "blueskip.png",
  // WILD
  "wild_wild": UNO_BASE_URL + "wildchange.png", "wild_draw4": UNO_BASE_URL + "wilddraw4.png",
  "back": UNO_BASE_URL + "back.png"
};

function getUnoCardImgUrl(card) {
  if (!card) return UNO_CARD_URLS.back;
  const key = card.color === 'wild' ? `wild_${card.value}` : `${card.color}_${card.value}`;
  return UNO_CARD_URLS[key] || UNO_CARD_URLS.back;
}

function createUnoDeck() {
  const colors = ["merah", "kuning", "hijau", "biru"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"];
  let deck = [];
  let idCounter = 1;
  colors.forEach(color => {
    values.forEach(value => {
      deck.push({ id: idCounter++, color, value });
      if (value !== "0") deck.push({ id: idCounter++, color, value });
    });
  });
  for (let i = 0; i < 4; i++) {
    deck.push({ id: idCounter++, color: "wild", value: "wild" });
    deck.push({ id: idCounter++, color: "wild", value: "draw4" });
  }
  return deck.sort(() => Math.random() - 0.5);
}

function drawUnoCards(game, count) {
  let drawn = [];
  for (let i = 0; i < count; i++) {
    if (game.deck.length === 0) game.deck = createUnoDeck();
    drawn.push(game.deck.pop());
  }
  return drawn;
}

function getUnoRoles(maxPlayers) {
  const roles = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  return roles.slice(0, maxPlayers);
}

function nextUnoTurn(game, jump = 1) {
  const activeRoles = getUnoRoles(game.maxPlayers);
  const total = activeRoles.length;
  let curIdx = activeRoles.indexOf(game.turn);
  let nextIdx = (curIdx + (game.direction * jump) % total + total) % total;
  
  let loopCount = 0;
  while (game.finished && game.finished.includes(activeRoles[nextIdx]) && loopCount < total) {
    nextIdx = (nextIdx + (game.direction * 1) % total + total) % total;
    loopCount++;
  }
  return activeRoles[nextIdx];
}

function buildNewUnoGame(maxPlayers, prev) {
  const activeRoles = getUnoRoles(maxPlayers);
  let deck = createUnoDeck();
  let hands = {};
  activeRoles.forEach(r => {
    hands[r] = deck.splice(0, 7);
  });

  let firstCard = deck.pop();
  while (firstCard.color === 'wild') {
    deck.unshift(firstCard);
    firstCard = deck.pop();
  }

  return {
    phase: 'playing',
    maxPlayers: maxPlayers,
    deck: deck,
    hands: hands,
    turn: 'p1',
    direction: 1,
    currentCard: firstCard,
    drawStack: 0,
    hasDrawn: false,
    unoChallenge: null,
    finished: [],
    lastActionText: 'Game Dimulai!',
    handNumber: ((prev && prev.handNumber) || 0) + 1,
    names: (prev && prev.names) || {}
  };
}

// ---------- Aksi Pemain ----------
function unoDoPlay(chosenColor = null) {
  const data = latestUnoData;
  if (!data || data.phase !== 'playing' || data.turn !== myRole) return;
  const hand = data.hands[myRole] || [];
  const selected = hand.filter(c => selectedUnoKeys.has(c.id));

  if (selected.length === 0) return alert('Pilih kartu yang ingin dibuang!');

  if (selected.length > 1 && !selected.every(c => c.value === selected[0].value)) {
    return alert('Multi-run harus kartu dengan nilai/fitur yang sama!');
  }

  const first = selected[0];
  const curCol = data.currentCard.chosenColor || data.currentCard.color;

  if (data.drawStack > 0 && first.value !== data.currentCard.value && first.value !== 'draw4') {
    return alert(`Sedang ada Stacking +${data.drawStack}! Kamu harus membalas kartu penalti atau ambil kartu.`);
  }

  if (first.color !== 'wild' && first.color !== curCol && String(first.value) !== String(data.currentCard.value)) {
    return alert('Kartu tidak cocok dengan kartu meja!');
  }

  if (first.color === 'wild' && !chosenColor) {
    document.getElementById('unoColorPickerOverlay').style.display = 'flex';
    return;
  }

  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    let curHand = state.hands[myRole] || [];

    selected.forEach(card => {
      const idx = curHand.findIndex(c => c.id === card.id);
      if (idx !== -1) curHand.splice(idx, 1);
    });

    let jump = 1;
    selected.forEach(card => {
      if (card.value === 'skip') jump++;
      else if (card.value === 'reverse') {
        if (getUnoRoles(state.maxPlayers).length === 2) jump++;
        else state.direction *= -1;
      } else if (card.value === 'draw2') state.drawStack += 2;
      else if (card.value === 'draw4') state.drawStack += 4;
    });

    let lastCardPlayed = { ...selected[selected.length - 1] };
    if (lastCardPlayed.color === 'wild' && chosenColor) {
      lastCardPlayed.chosenColor = chosenColor;
    }

    state.currentCard = lastCardPlayed;
    state.hands[myRole] = curHand;
    state.hasDrawn = false;

    if (curHand.length === 1) {
      state.unoChallenge = {
        target: myRole,
        startTime: Date.now(),
        shouted: false
      };
      state.lastActionText = `📢 ${unoNames[myRole] || myRole.toUpperCase()} sisa 1 kartu! Pemicu UNO aktif!`;
    } else {
      state.unoChallenge = null;
    }

    const finished = state.finished || [];
    if (curHand.length === 0 && !finished.includes(myRole)) {
      finished.push(myRole);
      state.finished = finished;
      state.unoChallenge = null;
      if (finished.length >= getUnoRoles(state.maxPlayers).length - 1) {
        state.phase = 'roundover';
        return state;
      }
    }

    state.turn = nextUnoTurn(state, state.drawStack > 0 ? 1 : jump);
    return state;
  }, () => {
    selectedUnoKeys.clear();
    document.getElementById('unoColorPickerOverlay').style.display = 'none';
  });
}

function unoDoDraw() {
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));

    if (state.drawStack > 0) {
      const drawn = drawUnoCards(state, state.drawStack);
      state.hands[myRole] = [...(state.hands[myRole] || []), ...drawn];
      state.drawStack = 0;
      state.hasDrawn = false;
      state.turn = nextUnoTurn(state, 1);
      state.lastActionText = `📥 ${unoNames[myRole] || myRole.toUpperCase()} mengambil penalti +${drawn.length} kartu.`;
      return state;
    }

    if (!state.hasDrawn) {
      const drawn = drawUnoCards(state, 1);
      state.hands[myRole] = [...(state.hands[myRole] || []), ...drawn];
      state.hasDrawn = true;
      state.lastActionText = `📥 ${unoNames[myRole] || myRole.toUpperCase()} mengambil 1 kartu. Boleh pasang kartu atau Pass.`;
    }
    return state;
  });
}

function unoDoPass() {
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== myRole || !cur.hasDrawn) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    state.hasDrawn = false;
    state.turn = nextUnoTurn(state, 1);
    state.lastActionText = `⏭️ ${unoNames[myRole] || myRole.toUpperCase()} memilih Pass.`;
    return state;
  }, () => {
    selectedUnoKeys.clear();
  });
}

function unoShout() {
  unoRef.transaction(cur => {
    if (!cur || !cur.unoChallenge || cur.unoChallenge.target !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    state.unoChallenge.shouted = true;
    state.lastActionText = `🎉 Broadcast: ${unoNames[myRole] || myRole.toUpperCase()} berhasil Teriak "UNO!"`;
    return state;
  });
}

function unoCatch() {
  unoRef.transaction(cur => {
    if (!cur || !cur.unoChallenge || cur.unoChallenge.target === myRole || cur.unoChallenge.shouted) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const target = state.unoChallenge.target;
    
    const drawn = drawUnoCards(state, 2);
    state.hands[target] = [...(state.hands[target] || []), ...drawn];
    
    const catcherName = unoNames[myRole] || myRole.toUpperCase();
    const targetName = unoNames[target] || target.toUpperCase();
    state.lastActionText = `💥 Broadcast: ${catcherName} teriak "DOR!" Teriak UNO ${targetName} DIBATALKAN! (Kena penalti +2 kartu)`;
    state.unoChallenge = null;
    return state;
  });
}

// ---------- Animasi Pembagian Kartu ----------
// Animasi bagi kartu Uno: Per orang sampai selesai baru pindah, delay 0.3 detik (300ms)
function unoAnimateDeal(done) {
  const table = document.querySelector('#unoScreen .capsa-table');
  if (!table) { done(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'capsa-deal-overlay';
  table.appendChild(overlay);

  const dealOrder = ['bottom', 'right', 'top', 'left'];
  const cardsPerPlayer = 7; // Uno 7 kartu di awal
  const perCardDelay = 300; // 0.3 detik (300ms) per kartu
  const animDuration = 550;

  let cardIndex = 0;

  // LOOP LUAR: Pindah ke Pemain Berikutnya
  dealOrder.forEach(dir => {
    // LOOP DALAM: Kasih 7 kartu berturut-turut ke pemain aktif
    for (let c = 0; c < cardsPerPlayer; c++) {
      const img = document.createElement('img');
      img.src = UNO_CARD_URLS.back;
      img.className = 'capsa-deal-card deal-' + dir;
      img.style.animationDelay = (cardIndex * perCardDelay) + 'ms';
      overlay.appendChild(img);
      cardIndex++;
    }
  });

  const totalDuration = (cardIndex - 1) * perCardDelay + animDuration + 150;
  setTimeout(() => {
    overlay.remove();
    done();
  }, totalDuration);
}

// ---------- Render Core ----------
function renderUnoUICore(data) {
  latestUnoData = data;
  if (data.turn !== myRole || data.phase !== 'playing') selectedUnoKeys.clear();

  const statusEl = document.getElementById('unoStatus');
  const activeRoles = getUnoRoles(data.maxPlayers);

  if (data.phase === 'waiting') {
    const onlineCount = activeRoles.filter(r => unoPresence[r]).length;
    statusEl.textContent = `🟡 Menunggu pemain bergabung (${onlineCount}/${data.maxPlayers})...`;
  } else if (data.phase === 'playing') {
    const curColor = data.currentCard.chosenColor || data.currentCard.color;
    const colorEmoji = { merah: '🟥', kuning: '🟨', hijau: '🟩', biru: '🟦', wild: '🌈' }[curColor] || '⚪';
    let broadcastMsg = data.lastActionText ? `\n[${data.lastActionText}]` : '';
    
    if (data.turn === myRole) {
      statusEl.textContent = `🟢 Giliranmu! (Warna: ${colorEmoji} ${curColor.toUpperCase()})${data.drawStack > 0 ? ` ⚠️ STACKING +${data.drawStack}` : ''} ${broadcastMsg}`;
    } else {
      const pName = (unoNames && unoNames[data.turn]) || data.turn.toUpperCase();
      statusEl.textContent = `🟡 Giliran ${pName}... (Warna: ${colorEmoji} ${curColor.toUpperCase()}) ${broadcastMsg}`;
    }
  } else if (data.phase === 'roundover') {
    statusEl.textContent = '🏁 Permainan Selesai!';
  }

  // Render Kartu Meja & Hand
  document.getElementById('unoTopCardImg').src = getUnoCardImgUrl(data.currentCard);
  const myHandContainer = document.getElementById('unoHandMe');
  myHandContainer.innerHTML = '';
  const myHand = data.hands ? (data.hands[myRole] || []) : [];
  const canPlay = data.phase === 'playing' && data.turn === myRole;

  myHand.forEach(card => {
    const img = document.createElement('img');
    img.className = 'capsa-card-img' + (selectedUnoKeys.has(card.id) ? ' selected' : '');
    img.src = getUnoCardImgUrl(card);
    if (canPlay) {
      img.onclick = () => {
        if (selectedUnoKeys.has(card.id)) selectedUnoKeys.delete(card.id);
        else selectedUnoKeys.add(card.id);
        renderUnoUICore(latestUnoData);
      };
    }
    myHandContainer.appendChild(img);
  });

  // Render Opponents
  const opponentsContainer = document.getElementById('unoOpponentsWrap');
  opponentsContainer.innerHTML = '';
  activeRoles.forEach(role => {
    if (role === myRole) return;
    const cardCount = data.hands && data.hands[role] ? data.hands[role].length : 0;
    const pName = (unoNames && unoNames[role]) || role.toUpperCase();
    const isTurn = data.turn === role && data.phase === 'playing';

    const div = document.createElement('div');
    div.className = `capsa-seat ${isTurn ? 'active-turn' : ''}`;
    div.innerHTML = `
      <div class="capsa-seat-info">${pName} ${unoPresence[role] ? '🟢' : '🔴'}</div>
      <div class="capsa-card-back-wrap">
        <img class="capsa-card-back" src="${UNO_CARD_URLS.back}">
        <span class="capsa-card-back-count">${cardCount}</span>
      </div>
    `;
    opponentsContainer.appendChild(div);
  });

  // Tombol Aksi (Play / Draw / Pass)
  const actBox = document.getElementById('unoActions');
  actBox.style.display = canPlay ? 'grid' : 'none';
  if (canPlay) {
    const drawBtn = document.getElementById('unoBtnDraw');
    const playBtn = document.getElementById('unoBtnPlay');

    if (data.drawStack > 0) {
      drawBtn.textContent = `📥 Ambil (+${data.drawStack})`;
      drawBtn.onclick = () => unoDoDraw();
    } else if (data.hasDrawn) {
      drawBtn.textContent = `⏭️ Pass`;
      drawBtn.onclick = () => unoDoPass();
    } else {
      drawBtn.textContent = `📥 Ambil Kartu`;
      drawBtn.onclick = () => unoDoDraw();
    }
    playBtn.onclick = () => unoDoPlay();
  }

  handleUnoDorButtons(data);

  // Result Overlay
  const resultEl = document.getElementById('unoResult');
  const nextBtn = document.getElementById('unoBtnNext');
  if (data.phase === 'roundover') {
    const finished = data.finished || [];
    let html = finished.map((r, i) => `🥇 Juara ${i + 1}: ${(unoNames && unoNames[r]) || r.toUpperCase()}`).join('<br>');
    resultEl.innerHTML = html;
    resultEl.style.display = 'block';
    nextBtn.style.display = 'block';
  } else {
    resultEl.style.display = 'none';
    nextBtn.style.display = 'none';
  }
}

// Handler Pembungkus Render + Animasi
function renderUnoUI(data) {
  const freshHand = data.phase === 'playing' && !!data.handNumber && data.handNumber !== unoLastAnimatedHand;
  const shouldAnimate = freshHand && unoHasRenderedOnce;
  if (freshHand) unoLastAnimatedHand = data.handNumber;
  unoHasRenderedOnce = true;

  if (shouldAnimate) {
    unoAnimateDeal(() => renderUnoUICore(data));
  } else {
    renderUnoUICore(data);
  }
}

// Mekanisme Waktu & Pemunculan Tombol UNO / DOR
function handleUnoDorButtons(data) {
  let unoContainer = document.getElementById('unoChallengeBox');
  if (!unoContainer) {
    unoContainer = document.createElement('div');
    unoContainer.id = 'unoChallengeBox';
    unoContainer.style.cssText = "margin-top:10px; display:flex; justify-content:center; gap:10px;";
    document.getElementById('unoActions').parentNode.insertBefore(unoContainer, document.getElementById('unoActions'));
  }
  unoContainer.innerHTML = '';

  if (!data.unoChallenge) return;

  const elapsed = (Date.now() - data.unoChallenge.startTime) / 1000;

  if (elapsed > 5) {
    if (myRole === 'p1') unoRef.child('unoChallenge').remove();
    return;
  }

  if (data.unoChallenge.target === myRole && !data.unoChallenge.shouted) {
    const btnShout = document.createElement('button');
    btnShout.className = 'capsa-act play';
    btnShout.style.background = '#e4574f';
    btnShout.style.color = '#fff';
    btnShout.textContent = `🔥 TERIAK UNO! (${Math.ceil(5 - elapsed)}s)`;
    btnShout.onclick = () => unoShout();
    unoContainer.appendChild(btnShout);
  }

  if (data.unoChallenge.target !== myRole && !data.unoChallenge.shouted && elapsed >= 3) {
    const btnCatch = document.createElement('button');
    btnCatch.className = 'capsa-act play';
    btnCatch.style.background = '#e8ac1f';
    btnCatch.style.color = '#000';
    btnCatch.textContent = `💥 DOR! (Batalkan UNO)`;
    btnCatch.onclick = () => unoCatch();
    unoContainer.appendChild(btnCatch);
  }
}

// Loop Timer
if (unoTimerCheck) clearInterval(unoTimerCheck);
unoTimerCheck = setInterval(() => {
  if (latestUnoData && latestUnoData.unoChallenge) {
    renderUnoUICore(latestUnoData);
  }
}, 500);

// ---------- Init ----------
function initUno() {
  unoRef = roomRef.child('uno');
  document.getElementById('unoRoleTag').textContent = myRole.toUpperCase();

  document.getElementById('btnUnoBack').onclick = () => {
    if (activePresenceRef) activePresenceRef.remove();
    clearSession();
    location.reload();
  };

  roomRef.child('presence/' + myRole).transaction(cur => cur === null ? true : cur);

  if (myRole === 'p1') {
    unoRef.transaction(cur => cur || {
      phase: 'waiting',
      maxPlayers: window.unoSelectedMaxPlayers || 4,
      deck: [],
      hands: {},
      turn: 'p1',
      direction: 1,
      currentCard: null,
      drawStack: 0,
      finished: [],
      handNumber: 0
    });
  }

  dbRoot.ref('.info/connected').on('value', snap => {
    if (snap.val() === true) {
      const pRef = roomRef.child('presence/' + myRole);
      pRef.onDisconnect().remove();
      pRef.set(true);
    }
  });

  roomRef.child('presence').on('value', snap => {
    unoPresence = snap.val() || {};
    if (latestUnoData) renderUnoUICore(latestUnoData);

    if (myRole === 'p1' && latestUnoData && latestUnoData.phase === 'waiting') {
      const activeRoles = getUnoRoles(latestUnoData.maxPlayers);
      const allIn = activeRoles.every(s => unoPresence[s]);
      if (allIn) {
        unoRef.transaction(cur => (cur && cur.phase === 'waiting') ? buildNewUnoGame(cur.maxPlayers, cur) : cur);
      }
    }
  });

  unoRef.child('names').on('value', snap => {
    unoNames = snap.val() || {};
    if (latestUnoData) renderUnoUICore(latestUnoData);
  });

  unoRef.on('value', snap => {
    const data = snap.val();
    if (data) renderUnoUI(data);
  });

  document.querySelectorAll('.uno-color-btn').forEach(btn => {
    btn.onclick = () => {
      const color = btn.dataset.color;
      unoDoPlay(color);
    };
  });
}
