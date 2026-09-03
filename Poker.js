// ======================================================
// Poker.js — Capsa Banting 4 Pemain Realtime (Bom Seri & Bom 4 Kartu)
// ======================================================

let pokerRef = null;
let latestPokerData = null;
let pokerPresence = {};
let selectedKeys = new Set();
let pokerNames = {};

let pokerLastAnimatedHand = null;
let pokerHasRenderedOnce = false;

const ROLES = ['p1', 'p2', 'p3', 'p4'];

const CARD_IMG_BASE = 'https://deckofcardsapi.com/static/img/';
const CARD_BACK_IMG = CARD_IMG_BASE + 'back.png';

const RANKS = ['03','04','05','06','07','08','09','10','J','Q','K','A','02'];
const SUITS = ['c','d','h','s'];
const RANK_TO_API = { '03':'3','04':'4','05':'5','06':'6','07':'7','08':'8','09':'9','10':'0','J':'J','Q':'Q','K':'K','A':'A','02':'2' };
const SUIT_TO_API = { c:'C', d:'D', h:'H', s:'S' };
const RANK_ORDER = { '03':0,'04':1,'05':2,'06':3,'07':4,'08':5,'09':6,'10':7,'J':8,'Q':9,'K':10,'A':11,'02':12 };
const SUIT_ORDER = { c:0, d:1, h:2, s:3 };

function makeDeck(){
  const deck = [];
  RANKS.forEach(rank => SUITS.forEach(suit => deck.push({ rank, suit })));
  return deck;
}
function shuffleDeck(deck){
  const d = deck.slice();
  for(let i = d.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function cardImg(c){ return CARD_IMG_BASE + RANK_TO_API[c.rank] + SUIT_TO_API[c.suit] + '.png'; }
function cardValue(c){ return RANK_ORDER[c.rank] * 4 + SUIT_ORDER[c.suit]; }
function cardKey(c){ return c.rank + '|' + c.suit; }
function sortCards(hand){
  return hand.slice().sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);
}

function nextActiveRole(current, finished){
  finished = finished || [];
  let idx = ROLES.indexOf(current);
  for(let i = 0; i < 4; i++){
    idx = (idx + 1) % 4;
    if(!finished.includes(ROLES[idx])) return ROLES[idx];
  }
  return current;
}

function removeCards(hand, selected){
  const remaining = selected.map(cardKey);
  return hand.filter(c => {
    const k = cardKey(c);
    const idx = remaining.indexOf(k);
    if(idx >= 0){ remaining.splice(idx, 1); return false; }
    return true;
  });
}

function displayName(role){
  const n = pokerNames && pokerNames[role];
  return (n && n.trim()) ? n.trim() : role.toUpperCase();
}

// ---------- DETEKSI KOMBO KARTU ----------
function detectCombo(cards){
  const n = cards.length;
  if(n === 1){
    return { valid: true, type: 'single', count: 1, level: 0, tiebreak: [cardValue(cards[0])] };
  }
  if(n === 2){
    if(cards[0].rank !== cards[1].rank) return { valid: false };
    return { valid: true, type: 'pair', count: 2, level: 0, tiebreak: [Math.max(cardValue(cards[0]), cardValue(cards[1]))] };
  }
  if(n === 3){
    if(cards.every(c => c.rank === cards[0].rank)){
      return { valid: true, type: 'triple', count: 3, level: 1, tiebreak: [Math.max(...cards.map(cardValue))] };
    }
    // Bom Seri 3 Kartu (berurutan)
    const sorted = cards.slice().sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    const idxs = sorted.map(c => RANK_ORDER[c.rank]);
    const uniq = [...new Set(idxs)];
    if(uniq.length === 3 && (uniq[0] - uniq[2] === 2)){
      return { valid: true, type: 'run3', count: 3, level: 0, tiebreak: [idxs[0], SUIT_ORDER[sorted[0].suit]] };
    }
    return { valid: false };
  }
  if(n === 4){
    // Bom 4 Kartu Angka Sama (Four of a Kind - 4 Kartu Saja)
    if(cards.every(c => c.rank === cards[0].rank)){
      return { valid: true, type: 'four_pure', count: 4, level: 2, tiebreak: [RANK_ORDER[cards[0].rank]] };
    }
    // Bom Seri 4 Kartu (berurutan)
    const sorted = cards.slice().sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    const idxs = sorted.map(c => RANK_ORDER[c.rank]);
    const uniq = [...new Set(idxs)];
    if(uniq.length === 4 && (uniq[0] - uniq[3] === 3)){
      return { valid: true, type: 'run4', count: 4, level: 1, tiebreak: [idxs[0], SUIT_ORDER[sorted[0].suit]] };
    }
    return { valid: false };
  }
  if(n === 5) return detectFiveCombo(cards);
  return { valid: false };
}

function detectFiveCombo(cards){
  const sorted = cards.slice().sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
  const idxs = sorted.map(c => RANK_ORDER[c.rank]);
  const isFlush = cards.every(c => c.suit === cards[0].suit);
  const uniqueIdx = [...new Set(idxs)];
  const isStraight = uniqueIdx.length === 5 && (uniqueIdx[0] - uniqueIdx[4] === 4);

  const counts = {};
  idxs.forEach(i => counts[i] = (counts[i] || 0) + 1);
  const groups = Object.entries(counts)
    .map(([i, c]) => ({ i: +i, c }))
    .sort((a, b) => b.c - a.c || b.i - a.i);

  if(isStraight && isFlush){
    return { valid: true, type: 'straightflush', count: 5, level: 6, tiebreak: [idxs[0], SUIT_ORDER[sorted[0].suit]] };
  }
  if(groups[0].c === 4){
    return { valid: true, type: 'four', count: 5, level: 5, tiebreak: [groups[0].i] };
  }
  if(isFlush){
    return { valid: true, type: 'flush', count: 5, level: 3, tiebreak: [...idxs, SUIT_ORDER[sorted[0].suit]] };
  }
  if(groups[0].c === 3 && groups[1] && groups[1].c === 2){
    return { valid: true, type: 'fullhouse', count: 5, level: 4, tiebreak: [groups[0].i] };
  }
  if(groups.length === 4 && groups[0].c === 2 && groups.slice(1).every(g => g.c === 1)){
    const singleRanks = groups.slice(1).map(g => g.i).sort((a, b) => a - b);
    if(singleRanks[2] - singleRanks[0] === 2){
      return { valid: true, type: 'seripolo', count: 5, level: 2, tiebreak: [singleRanks[2], groups[0].i] };
    }
  }
  if(isStraight){
    return { valid: true, type: 'straight', count: 5, level: 1, tiebreak: [idxs[0]] };
  }
  return { valid: false };
}

function compareCombo(a, b){
  if(a.count !== b.count) return a.count - b.count;
  if(a.level !== b.level) return a.level - b.level;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for(let i = 0; i < len; i++){
    const av = a.tiebreak[i] || 0, bv = b.tiebreak[i] || 0;
    if(av !== bv) return av - bv;
  }
  return 0;
}

function comboDisplayName(combo){
  switch(combo.type){
    case 'single': return 'Single';
    case 'pair': return 'Pair';
    case 'triple': return 'Triss';
    case 'run3': return 'Bom Seri (3 Kartu)';
    case 'run4': return 'Bom Seri (4 Kartu)';
    case 'four_pure': return 'Bom 4 Angka Sama';
    case 'straight': return 'Seri 5 Kartu (Straight)';
    case 'flush': return 'Flush';
    case 'seripolo': return 'Polo Seri (Seri + Pair)';
    case 'fullhouse': return 'Polo (Full House)';
    case 'four': return 'Poker (Four of a Kind + Kicker)';
    case 'straightflush': return combo.tiebreak[0] === RANK_ORDER['02'] ? 'Royal Flush' : 'Straight Flush';
    default: return '-';
  }
}

function isPureAceCombo(cards){
  return cards.length > 0 && cards.every(c => c.rank === 'A');
}
function isBlockedBeat(lastPlay, newCombo, newCards){
  if(!lastPlay) return false;
  if(lastPlay.combo.count <= 3 && newCombo.count === lastPlay.combo.count){
    if(isPureAceCombo(lastPlay.cards) && isPureAceCombo(newCards)) return 'ace';
  }
  if((lastPlay.combo.type === 'four' || lastPlay.combo.type === 'four_pure') && 
     (newCombo.type === 'four' || newCombo.type === 'four_pure')) return 'poker';
  return false;
}
function blockedBeatMessage(reason){
  if(reason === 'ace') return 'As gak bisa dibantai dengan As lagi! (Cuma kartu 2 yang bisa ngelewatin As)';
  if(reason === 'poker') return 'Bom 4 Angka Sama gak bisa dibantai sesama Bom 4 Angka Sama!';
  return 'Kombinasi tidak diperbolehkan.';
}

function pokerBuildNewGame(prev){
  const deck = shuffleDeck(makeDeck());
  const hands = {
    p1: deck.slice(0, 13),
    p2: deck.slice(13, 26),
    p3: deck.slice(26, 39),
    p4: deck.slice(39, 52)
  };
  let starter = 'p1';
  ROLES.forEach(r => { if(hands[r].some(c => c.rank === '03' && c.suit === 'd')) starter = r; });

  return {
    phase: 'playing',
    hands,
    turn: starter,
    starter,
    isFirstPlay: true,
    lastPlay: null,
    lastPlayer: null,
    passCount: 0,
    finished: [],
    loser: null,
    winner: null,
    lastActionText: null,
    handNumber: ((prev && prev.handNumber) || 0) + 1,
    names: (prev && prev.names) || {}
  };
}

function pokerDoPlay(){
  const data = latestPokerData;
  if(!data || data.phase !== 'playing' || data.turn !== myRole) return;
  const hand = sortCards((data.hands && data.hands[myRole]) || []);
  const selected = hand.filter(c => selectedKeys.has(cardKey(c)));
  if(selected.length === 0){ showCustomAlert('Pilih kartu dulu.'); return; }

  const combo = detectCombo(selected);
  if(!combo.valid){ showCustomAlert('Kombinasi kartu tidak valid.'); return; }
  if(data.isFirstPlay){
    if(!selected.some(c => c.rank === '03' && c.suit === 'd')){
      showCustomAlert('Wajib jalan dengan kartu 3♦ (3 Wajik) di kartu pertama!');
      return;
    }
  } else if(data.lastPlay){
    if(combo.count !== data.lastPlay.combo.count){
      showCustomAlert('Jumlah kartu harus sama dengan yang di meja (' + data.lastPlay.combo.count + ' kartu).');
      return;
    }
    const blocked = isBlockedBeat(data.lastPlay, combo, selected);
    if(blocked){ showCustomAlert(blockedBeatMessage(blocked)); return; }
    if(compareCombo(combo, data.lastPlay.combo) <= 0){
      showCustomAlert('Kombinasi kamu harus lebih tinggi dari kartu terakhir di meja.');
      return;
    }
  }

  pokerRef.transaction(cur => {
    if(!cur || cur.phase !== 'playing') return cur;
    if(cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const curHand = state.hands[myRole] || [];
    const remain = removeCards(curHand, selected);
    if(remain.length !== curHand.length - selected.length) return cur;

    const c2 = detectCombo(selected);
    if(!c2.valid) return cur;
    if(state.isFirstPlay){
      if(!selected.some(c => c.rank === '03' && c.suit === 'd')) return cur;
    } else if(state.lastPlay){
      if(c2.count !== state.lastPlay.combo.count) return cur;
      if(isBlockedBeat(state.lastPlay, c2, selected)) return cur;
      if(compareCombo(c2, state.lastPlay.combo) <= 0) return cur;
    }

    state.hands[myRole] = remain;
    state.lastPlay = { by: myRole, cards: selected, combo: c2 };
    state.lastPlayer = myRole;
    state.passCount = 0;
    state.isFirstPlay = false;
    state.lastActionText = comboDisplayName(c2);

    const finished = state.finished || [];
    if(remain.length === 0 && !finished.includes(myRole)){
      finished.push(myRole);
      state.finished = finished;
      if(finished.length >= 3){
        state.phase = 'roundover';
        state.loser = ROLES.find(r => !finished.includes(r)) || null;
        state.winner = finished[0];
        return state;
      }
    }
    state.turn = nextActiveRole(myRole, state.finished || []);
    return state;
  }, () => { selectedKeys.clear(); });
}

function pokerDoPass(){
  pokerRef.transaction(cur => {
    if(!cur || cur.phase !== 'playing') return cur;
    if(cur.turn !== myRole) return cur;
    if(!cur.lastPlay) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const finished = state.finished || [];
    state.passCount = (state.passCount || 0) + 1;
    state.lastActionText = 'pass';

    const activeCount = 4 - finished.length;
    const threshold = Math.max(activeCount - 1, 1);

    if(state.passCount >= threshold){
      state.lastPlay = null;
      state.passCount = 0;
      let returnee = state.lastPlayer || nextActiveRole(myRole, finished);
      if(finished.includes(returnee)) returnee = nextActiveRole(returnee, finished);
      state.turn = returnee;
    } else {
      state.turn = nextActiveRole(myRole, finished);
    }
    return state;
  }, () => { selectedKeys.clear(); });
}

function seatPosFor(role){
  const my = ROLES.indexOf(myRole);
  const r = ROLES.indexOf(role);
  const rel = (r - my + 4) % 4;
  return ['bottom', 'right', 'top', 'left'][rel];
}

function pokerRenderBackHand(container, count){
  container.innerHTML = '';
  if(count <= 0) return;
  const wrap = document.createElement('div');
  wrap.className = 'capsa-card-back-wrap';
  const img = document.createElement('img');
  img.className = 'capsa-card-back';
  img.src = CARD_BACK_IMG;
  img.alt = 'kartu tertutup';
  const badge = document.createElement('span');
  badge.className = 'capsa-card-back-count';
  badge.textContent = count;
  wrap.appendChild(img);
  wrap.appendChild(badge);
  container.appendChild(wrap);
}

function pokerRenderMyHand(data){
  const container = document.getElementById('capsaHandMe');
  container.innerHTML = '';
  const hand = sortCards((data.hands && data.hands[myRole]) || []);
  const canSelect = data.phase === 'playing' && data.turn === myRole;
  hand.forEach(c => {
    const img = document.createElement('img');
    img.className = 'capsa-card-img' + (selectedKeys.has(cardKey(c)) ? ' selected' : '');
    img.src = cardImg(c);
    img.alt = c.rank + c.suit;
    if(canSelect){
      img.onclick = () => {
        const k = cardKey(c);
        if(selectedKeys.has(k)) selectedKeys.delete(k); else selectedKeys.add(k);
        pokerRenderMyHand(latestPokerData);
      };
    }
    container.appendChild(img);
  });
}

function pokerRenderCenter(data){
  const wrap = document.getElementById('capsaLastPlay');
  const byEl = document.getElementById('capsaLastBy');
  wrap.innerHTML = '';
  if(!data.lastPlay){
    byEl.textContent = data.phase === 'playing' ? 'Meja kosong — bebas jalan!' : '';
    return;
  }
  sortCards(data.lastPlay.cards).forEach(c => {
    const img = document.createElement('img');
    img.className = 'capsa-card-img small';
    img.src = cardImg(c);
    wrap.appendChild(img);
  });
  const byLabel = data.lastPlay.by === myRole ? 'Kamu' : displayName(data.lastPlay.by);
  byEl.textContent = byLabel + ' · ' + comboDisplayName(data.lastPlay.combo);
}

function pokerRenderStatus(data){
  const statusEl = document.getElementById('pokerStatus');
  if(data.phase === 'waiting'){
    const onlineCount = ROLES.filter(r => pokerPresence[r]).length;
    statusEl.textContent = '🟡 Menunggu pemain bergabung (' + onlineCount + '/4)...';
  } else if(data.phase === 'playing'){
    if(data.turn === myRole){
      statusEl.textContent = data.isFirstPlay ? '🟢 Giliranmu! Wajib jalan dengan 3♦ (3 Wajik).' : '🟢 Giliranmu!';
    } else {
      statusEl.textContent = '🟡 Menunggu ' + displayName(data.turn) + '...';
    }
  } else if(data.phase === 'roundover'){
    statusEl.textContent = '🏁 Ronde selesai.';
  }
}

function pokerRenderRankBar(data){
  const el = document.getElementById('capsaRankBar');
  if(!el) return;
  const finished = data.finished || [];
  if(finished.length === 0 || data.phase === 'waiting'){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const medals = ['🥇', '🥈', '🥉'];
  el.style.display = 'flex';
  el.innerHTML = finished.map((r, i) => {
    const label = (r === myRole) ? (displayName(r) + ' (Kamu)') : displayName(r);
    return '<span class="capsa-rank-chip">' + (medals[i] || '🏅') + ' ' + label + '</span>';
  }).join('');
}

function pokerRenderMyNameLabel(){
  const el = document.getElementById('capsaMyNameLabel');
  if(!el) return;
  const n = pokerNames && pokerNames[myRole];
  el.textContent = (n && n.trim()) ? (n.trim() + ' (Kamu)') : 'Kamu';
}

function pokerRenderCore(data){
  latestPokerData = data;
  if(data.turn !== myRole || data.phase !== 'playing') selectedKeys.clear();

  const posEls = {
    top: { seat: document.getElementById('capsaSeatTop'), name: document.getElementById('capsaNameTop'), hand: document.getElementById('capsaHandTop') },
    left: { seat: document.getElementById('capsaSeatLeft'), name: document.getElementById('capsaNameLeft'), hand: document.getElementById('capsaHandLeft') },
    right: { seat: document.getElementById('capsaSeatRight'), name: document.getElementById('capsaNameRight'), hand: document.getElementById('capsaHandRight') },
    bottom: { seat: document.getElementById('capsaSeatBottom') }
  };

  const finished = data.finished || [];
  ROLES.forEach(role => {
    const pos = seatPosFor(role);
    const el = posEls[pos];
    const count = (data.hands && data.hands[role]) ? data.hands[role].length : 0;
    const online = !!pokerPresence[role];
    const isFinished = finished.includes(role);
    el.seat.classList.toggle('active-turn', data.turn === role && data.phase === 'playing');
    el.seat.classList.toggle('capsa-seat-done', isFinished);
    if(pos !== 'bottom'){
      const rank = finished.indexOf(role);
      const rankTag = rank === 0 ? ' 🥇' : rank === 1 ? ' 🥈' : rank === 2 ? ' 🥉' : '';
      el.name.textContent = displayName(role) + (online ? ' 🟢' : ' 🔴') + rankTag + ' · ' + count + ' kartu';
      pokerRenderBackHand(el.hand, count);
    }
  });

  pokerRenderMyHand(data);
  pokerRenderCenter(data);
  pokerRenderStatus(data);
  pokerRenderRankBar(data);
  pokerRenderMyNameLabel();

  const canAct = data.phase === 'playing' && data.turn === myRole;
  document.getElementById('capsaActions').style.display = canAct ? 'grid' : 'none';
  if(canAct){
    document.getElementById('capsaBtnPass').disabled = !data.lastPlay;
  }

  const resultEl = document.getElementById('capsaResult');
  const nextBtn = document.getElementById('capsaBtnNext');
  if(data.phase === 'roundover'){
    const medals = ['🥇 Juara 1', '🥈 Juara 2', '🥉 Juara 3'];
    let html = finished.map((r, i) => {
      const label = (medals[i] || '🏅') + ': ' + displayName(r) + (r === myRole ? ' (Kamu)' : '');
      return label;
    }).join('<br>');
    if(data.loser){
      html += '<br>💀 Buncit: ' + displayName(data.loser) + (data.loser === myRole ? ' (Kamu)' : '');
    }
    resultEl.innerHTML = html;
    resultEl.style.display = 'block';
    nextBtn.style.display = 'block';
    nextBtn.textContent = myRole === 'p1' ? '▶ Main Lagi' : '⏳ Menunggu host mulai lagi';
    nextBtn.disabled = myRole !== 'p1';
  } else {
    resultEl.style.display = 'none';
    nextBtn.style.display = 'none';
  }
}

function pokerAnimateDeal(done){
  const table = document.querySelector('#pokerScreen .capsa-table');
  if(!table){ done(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'capsa-deal-overlay';
  table.appendChild(overlay);

  const dealTargets = ['bottom', 'right', 'top', 'left']; 
  const cardsPerPlayer = 5; 
  const perCardDelay = 300; 
  const animDuration = 550;

  let cardIndex = 0;

  dealTargets.forEach(dir => {
    for(let c = 0; c < cardsPerPlayer; c++){
      const img = document.createElement('img');
      img.src = CARD_BACK_IMG;
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

function pokerRender(data){
  const freshHand = data.phase === 'playing' && !!data.handNumber && data.handNumber !== pokerLastAnimatedHand;
  const shouldAnimate = freshHand && pokerHasRenderedOnce;
  if(freshHand) pokerLastAnimatedHand = data.handNumber;
  pokerHasRenderedOnce = true;

  if(shouldAnimate){
    pokerAnimateDeal(() => pokerRenderCore(data));
  } else {
    pokerRenderCore(data);
  }
}

function pokerAttachPresence(){
  const presenceRef = roomRef.child('presence/' + myRole);
  activePresenceRef = presenceRef;

  dbRoot.ref('.info/connected').on('value', snap => {
    if(snap.val() === true){
      presenceRef.onDisconnect().remove();
      presenceRef.set(true);
    }
  });

  if(!window.__capsaPagehideBound){
    window.__capsaPagehideBound = true;
    window.addEventListener('pagehide', () => { if(activePresenceRef) activePresenceRef.remove(); });
  }

  roomRef.child('presence').on('value', snap => {
    pokerPresence = snap.val() || {};
    if(latestPokerData) pokerRenderCore(latestPokerData);

    if(myRole === 'p1' && latestPokerData && latestPokerData.phase === 'waiting'){
      const allIn = ROLES.every(s => pokerPresence[s]);
      if(allIn){
        pokerRef.transaction(cur => (cur && cur.phase === 'waiting') ? pokerBuildNewGame(cur) : cur);
      }
    }
  });
}

function pokerAttachNames(){
  pokerRef.child('names').on('value', snap => {
    pokerNames = snap.val() || {};
    if(latestPokerData) pokerRenderCore(latestPokerData);
  });
}

function pokerOpenNameEditor(){
  const overlay = document.getElementById('capsaNameOverlay');
  const input = document.getElementById('capsaNameInput');
  if(!overlay || !input) return;
  input.value = (pokerNames && pokerNames[myRole]) ? pokerNames[myRole] : '';
  overlay.style.display = 'flex';
  setTimeout(() => input.focus(), 50);
}
function pokerCloseNameEditor(){
  const overlay = document.getElementById('capsaNameOverlay');
  if(overlay) overlay.style.display = 'none';
}
function pokerSaveName(){
  const input = document.getElementById('capsaNameInput');
  if(!input) return;
  const val = input.value.trim().slice(0, 14);
  pokerRef.child('names/' + myRole).set(val || null);
  pokerCloseNameEditor();
}

function initPoker(){
  pokerRef = roomRef.child('poker');
  document.getElementById('pokerRoleTag').textContent = myRole.toUpperCase();

  document.documentElement.classList.add('force-landscape');

  document.getElementById('btnPokerBack').onclick = () => {
    document.documentElement.classList.remove('force-landscape');
    if(activePresenceRef) activePresenceRef.remove();
    clearSession();
    location.reload();
  };

  roomRef.child('presence/' + myRole).transaction(cur => cur === null ? true : cur);

  if(myRole === 'p1'){
    pokerRef.transaction(cur => cur || {
      phase: 'waiting', hands: null, turn: null, starter: null,
      isFirstPlay: true, lastPlay: null, lastPlayer: null,
      passCount: 0, finished: [], loser: null, winner: null,
      lastActionText: null, handNumber: 0, names: {}
    });
  }

  pokerAttachPresence();
  pokerAttachNames();

  pokerRef.on('value', snap => {
    const data = snap.val();
    if(!data) return;
    pokerRender(data);
  });

  document.getElementById('capsaBtnPass').onclick = () => pokerDoPass();
  document.getElementById('capsaBtnPlay').onclick = () => pokerDoPlay();
  document.getElementById('capsaBtnNext').onclick = () => {
    if(myRole !== 'p1') return;
    pokerRef.transaction(cur => (cur && cur.phase === 'roundover') ? pokerBuildNewGame(cur) : cur);
  };

  const editBtn = document.getElementById('capsaBtnEditName');
  if(editBtn) editBtn.onclick = () => pokerOpenNameEditor();
  const cancelBtn = document.getElementById('capsaNameCancel');
  if(cancelBtn) cancelBtn.onclick = () => pokerCloseNameEditor();
  const saveBtn = document.getElementById('capsaNameSave');
  if(saveBtn) saveBtn.onclick = () => pokerSaveName();
  const nameInput = document.getElementById('capsaNameInput');
  if(nameInput) nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') pokerSaveName(); });
}
