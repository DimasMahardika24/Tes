// ======================================================
// Poker.js — Capsa Banting 4 Pemain (Upgrade: Diff Render + FX + Sound)
// Membutuhkan shared.js sudah dimuat lebih dulu
// Logika kombinasi/urutan angka TIDAK diubah. Yang diupgrade: render tangan
// tanpa rebuild, kipas kartu, preview kombinasi, efek, suara, confetti.
// ======================================================

let pokerRef = null;
let latestPokerData = null;
let pokerPresence = {};
let selectedKeys = new Set();
let pokerNames = {};

let pokerLastAnimatedHand = null;
let pokerHasRenderedOnce = false;

let pokerPrev = { init: false, hand: null, playSig: null, passSig: null, turn: null, phase: null, finished: 0, centerSig: null };
let pokerAudio = null;

const ROLES = ['p1', 'p2', 'p3', 'p4'];

const CARD_IMG_BASE = 'https://deckofcardsapi.com/static/img/';
const CARD_BACK_IMG = CARD_IMG_BASE + 'back.png';

// Urutan murni dari terkecil (3) sampai terbesar (2)
const RANKS = ['03','04','05','06','07','08','09','10','J','Q','K','A','02'];
const SUITS = ['c','d','h','s'];
const RANK_TO_API = { '03':'3','04':'4','05':'5','06':'6','07':'7','08':'8','09':'9','10':'0','J':'J','Q':'Q','K':'K','A':'A','02':'2' };
const SUIT_TO_API = { c:'C', d:'D', h:'H', s:'S' };
const RANK_ORDER = { '03':0,'04':1,'05':2,'06':3,'07':4,'08':5,'09':6,'10':7,'J':8,'Q':9,'K':10,'A':11,'02':12 };
const SUIT_ORDER = { c:0, d:1, h:2, s:3 }; // Cuma buat sort di tangan biar rapi

// ======================================================
// CSS (diinjeksi, menimpa style lama di index.html)
// ======================================================
const pokerStyleEl = document.createElement('style');
pokerStyleEl.innerHTML = `
  #pokerScreen .capsa-table { position: relative; }
  #pokerScreen .capsa-seat { position: relative; }
  #pokerScreen .capsa-seat.active-turn { animation: pokerTurnGlow 1.4s ease-in-out infinite; }
  @keyframes pokerTurnGlow {
    0%, 100% { box-shadow: 0 0 0 2px var(--gold) inset, 0 0 8px rgba(232,172,31,.2); }
    50%      { box-shadow: 0 0 0 2px var(--gold) inset, 0 0 20px rgba(232,172,31,.6); }
  }
  #pokerScreen .capsa-card-back-count.bump { animation: pokerBump .5s cubic-bezier(.2,1.5,.4,1); }
  @keyframes pokerBump { 0% { transform: scale(1); } 40% { transform: scale(1.55); } 100% { transform: scale(1); } }

  /* Tangan: dikipas (overlap otomatis) supaya 13 kartu muat 1 baris */
  #pokerScreen .capsa-hand-me { flex-wrap: nowrap; gap: 0; padding-top: 20px; min-height: 108px; }
  #pokerScreen .capsa-hand-me .capsa-card-img {
    margin-left: var(--ov, -8px); position: relative; flex-shrink: 0; -webkit-tap-highlight-color: transparent; -webkit-user-drag: none;
    animation: none;
    transition: transform .16s cubic-bezier(.34,1.56,.64,1), box-shadow .16s ease;
  }
  #pokerScreen .capsa-hand-me .capsa-card-img:first-child { margin-left: 0; }
  #pokerScreen .capsa-hand-me .capsa-card-img.enter { animation: pokerCardIn .42s cubic-bezier(.2,.9,.3,1.2) backwards; }
  @keyframes pokerCardIn {
    from { transform: translateY(-60px) scale(.5) rotate(-12deg); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }
  #pokerScreen .capsa-hand-me .capsa-card-img.myturn { cursor: pointer; }
  #pokerScreen .capsa-hand-me .capsa-card-img.selected {
    transform: translateY(-18px) scale(1.05); z-index: 5;
    box-shadow: 0 0 0 3px var(--gold), 0 12px 22px rgba(0,0,0,.7);
  }
  #pokerScreen .capsa-hand-me .capsa-card-img.shake { animation: pokerShake .3s ease; }
  @keyframes pokerShake { 0%,100% { translate: 0 0; } 25% { translate: -5px 0; } 75% { translate: 5px 0; } }
  @media (hover: hover) {
    #pokerScreen .capsa-hand-me .capsa-card-img.myturn:not(.selected):hover { transform: translateY(-8px); z-index: 4; }
  }

  /* Kartu di tengah meja: terbang dari kursi pemain */
  #pokerScreen .capsa-lastplay .capsa-card-img.fly { animation: pokerFly .45s cubic-bezier(.2,.9,.3,1.1) backwards; }
  @keyframes pokerFly {
    from { transform: translate(var(--fx), var(--fy)) scale(.7) rotate(var(--rot, 0deg)); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }
  #pokerScreen .capsa-lastplay .capsa-card-img.small { box-shadow: 0 6px 14px rgba(0,0,0,.55); }

  /* Preview kombinasi */
  #pokerScreen .capsa-preview {
    text-align: center; font-size: 13px; font-weight: 700; margin-top: 10px; padding: 8px 12px; border-radius: 10px;
    background: var(--void); border: 1px solid var(--line); color: var(--ink-dim); transition: color .15s ease, border-color .15s ease;
  }
  #pokerScreen .capsa-preview.ok  { color: var(--green); border-color: rgba(43,182,115,.5); }
  #pokerScreen .capsa-preview.bad { color: var(--red);   border-color: rgba(228,87,79,.5); }

  /* Bubble PASS di kursi */
  .poker-bubble {
    position: absolute; left: 50%; top: -6px; z-index: 40; pointer-events: none; white-space: nowrap;
    font-size: 12px; font-weight: 800; color: #fff; background: var(--blue); padding: 4px 12px; border-radius: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,.5); animation: pokerBubble 1.1s ease-out forwards;
  }
  @keyframes pokerBubble {
    0%   { transform: translate(-50%, 8px) scale(.6); opacity: 0; }
    20%  { transform: translate(-50%, -4px) scale(1.08); opacity: 1; }
    75%  { transform: translate(-50%, -8px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -22px) scale(1); opacity: 0; }
  }

  /* Toast di tengah meja */
  .poker-toast {
    position: absolute; left: 50%; top: 46%; z-index: 40; pointer-events: none; white-space: nowrap;
    font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 800; color: #fff;
    text-shadow: 0 3px 12px rgba(0,0,0,.85), 0 0 18px rgba(0,0,0,.6);
    animation: pokerToast 1.15s ease-out forwards;
  }
  .poker-toast.big { font-size: 28px; color: #ffd36b; }
  @keyframes pokerToast {
    0%   { transform: translate(-50%, -30%) scale(.4); opacity: 0; }
    20%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
    70%  { transform: translate(-50%, -55%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -110%) scale(1); opacity: 0; }
  }
  #pokerScreen .capsa-table.shake { animation: pokerTableShake .35s ease-in-out; }
  @keyframes pokerTableShake {
    0%, 100% { transform: translate(0, 0); }
    20% { transform: translate(-4px, 2px); } 40% { transform: translate(4px, -2px); }
    60% { transform: translate(-3px, -1px); } 80% { transform: translate(3px, 1px); }
  }

  /* Confetti */
  .poker-confetti-box { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 35; border-radius: 18px; }
  .poker-confetti-box i { position: absolute; top: -14px; width: 8px; height: 13px; border-radius: 2px; animation: pokerConfetti linear forwards; }
  @keyframes pokerConfetti {
    0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--dx), 480px) rotate(var(--rot)); opacity: .9; }
  }

  @media (prefers-reduced-motion: reduce) {
    #pokerScreen *, #pokerScreen *::after, .poker-toast, .poker-bubble, .poker-confetti-box i { animation-duration: .01ms !important; animation-delay: 0s !important; }
  }
`;
document.head.appendChild(pokerStyleEl);

// ======================================================
// SOUND
// ======================================================
function pokerGetAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!pokerAudio) pokerAudio = new AC();
    if (pokerAudio.state === 'suspended') pokerAudio.resume();
    return pokerAudio;
  } catch (e) { return null; }
}
function pokerTone(f, at, dur, type, vol, f2) {
  const a = pokerGetAudio(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol || .15, t);
  g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + .02);
}
function pokerSfx(kind) {
  try {
    if (kind === 'tick') pokerTone(620, 0, .05, 'sine', .1);
    else if (kind === 'bad') pokerTone(180, 0, .14, 'square', .08, 110);
    else if (kind === 'play') { pokerTone(280, 0, .09, 'triangle', .22, 140); pokerTone(500, .04, .06, 'sine', .08); }
    else if (kind === 'combo') [392, 494, 587, 784].forEach((f, i) => pokerTone(f, i * .06, .12, 'triangle', .13));
    else if (kind === 'bomb') { pokerTone(160, 0, .3, 'sawtooth', .22, 40); pokerTone(900, 0, .08, 'square', .1, 200); [523, 659, 784, 1047].forEach((f, i) => pokerTone(f, .12 + i * .06, .14, 'sine', .12)); }
    else if (kind === 'pass') pokerTone(330, 0, .12, 'sine', .1, 220);
    else if (kind === 'turn') { pokerTone(660, 0, .1, 'sine', .12); pokerTone(880, .1, .12, 'sine', .12); }
    else if (kind === 'deal') pokerTone(700, 0, .04, 'square', .05, 500);
    else if (kind === 'finish') [523, 659, 784].forEach((f, i) => pokerTone(f, i * .08, .15, 'sine', .14));
    else if (kind === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => pokerTone(f, i * .09, .2, 'sine', .15));
    else if (kind === 'lose') [392, 330, 262].forEach((f, i) => pokerTone(f, i * .13, .24, 'triangle', .15));
  } catch (e) {}
}

// ======================================================
// Util
// ======================================================
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

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

function cardKey(c){ return c.rank + '|' + c.suit; }

// Sorting di tangan pakai Suit biar rapi,
// tapi kalkulasi menang/kalah HANYA pakai RANK_ORDER.
function sortCards(hand){
  hand = ensureArray(hand);
  return hand.slice().sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);
}

function nextActiveRole(current, finished){
  finished = ensureArray(finished);
  let idx = ROLES.indexOf(current);
  for(let i = 0; i < 4; i++){
    idx = (idx + 1) % 4;
    if(!finished.includes(ROLES[idx])) return ROLES[idx];
  }
  return current;
}

function removeCards(hand, selected){
  hand = ensureArray(hand);
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

// TIEBREAK CUMA PAKE ANGKA (TANPA SUIT)
function detectCombo(cards){
  const n = cards.length;

  // 1 Kartu (Single)
  if(n === 1) {
    return { valid: true, type: 'single', count: 1, level: 0, tiebreak: [RANK_ORDER[cards[0].rank]] };
  }

  // 2 Kartu (Pair)
  if(n === 2){
    if(cards[0].rank !== cards[1].rank) return { valid: false };
    return { valid: true, type: 'pair', count: 2, level: 0, tiebreak: [RANK_ORDER[cards[0].rank]] };
  }

  // 3 Kartu (Triss atau Bom Seri 3)
  if(n === 3){
    if(cards.every(c => c.rank === cards[0].rank)) {
      return { valid: true, type: 'triple', count: 3, level: 1, tiebreak: [RANK_ORDER[cards[0].rank]] };
    }
    const sorted = cards.slice().sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    const idxs = sorted.map(c => RANK_ORDER[c.rank]);
    const uniq = [...new Set(idxs)];
    if(uniq.length === 3 && (uniq[0] - uniq[2] === 2)) {
      return { valid: true, type: 'run3', count: 3, level: 0, tiebreak: [idxs[0]] };
    }
    return { valid: false };
  }

  // 4 Kartu (Bom 4 Angka Sama atau Bom Seri 4)
  if(n === 4){
    if(cards.every(c => c.rank === cards[0].rank)) {
      return { valid: true, type: 'four_pure', count: 4, level: 2, tiebreak: [RANK_ORDER[cards[0].rank]] };
    }
    const sorted = cards.slice().sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    const idxs = sorted.map(c => RANK_ORDER[c.rank]);
    const uniq = [...new Set(idxs)];
    if(uniq.length === 4 && (uniq[0] - uniq[3] === 3)) {
      return { valid: true, type: 'run4', count: 4, level: 1, tiebreak: [idxs[0]] };
    }
    return { valid: false };
  }

  // 5 Kartu
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
  const groups = Object.entries(counts).map(([i, c]) => ({ i: +i, c })).sort((a, b) => b.c - a.c || b.i - a.i);

  if(isStraight && isFlush) return { valid: true, type: 'straightflush', count: 5, level: 6, tiebreak: [idxs[0]] };
  if(groups[0].c === 4) return { valid: true, type: 'four', count: 5, level: 5, tiebreak: [groups[0].i] };
  if(isFlush) return { valid: true, type: 'flush', count: 5, level: 3, tiebreak: [...idxs] }; // Cuma urutan angka
  if(groups[0].c === 3 && groups[1] && groups[1].c === 2) return { valid: true, type: 'fullhouse', count: 5, level: 4, tiebreak: [groups[0].i] };
  if(groups.length === 4 && groups[0].c === 2 && groups.slice(1).every(g => g.c === 1)){
    const singleRanks = groups.slice(1).map(g => g.i).sort((a, b) => a - b);
    if(singleRanks[2] - singleRanks[0] === 2) return { valid: true, type: 'seripolo', count: 5, level: 2, tiebreak: [singleRanks[2], groups[0].i] };
  }
  if(isStraight) return { valid: true, type: 'straight', count: 5, level: 1, tiebreak: [idxs[0]] };
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
  return 0; // 0 Artinya SAMA KUAT (Gak bisa bantai)
}

function comboDisplayName(combo){
  const map = { single: 'Single', pair: 'Pair', triple: 'Triss', run3: 'Bom Seri (3 Kartu)', run4: 'Bom Seri (4 Kartu)', four_pure: 'Bom 4 Angka Sama', straight: 'Seri 5 Kartu (Straight)', flush: 'Flush', seripolo: 'Polo Seri (Seri + Pair)', fullhouse: 'Polo (Full House)', four: 'Poker (Four of a Kind + Kicker)' };
  if (combo.type === 'straightflush') return combo.tiebreak[0] === RANK_ORDER['02'] ? 'Royal Flush' : 'Straight Flush';
  return map[combo.type] || '-';
}

// Fungsi ini udah gak terlalu kepake karena compareCombo udah otomatis nolak
// Tapi dibiarin aja buat jaga-jaga
function isPureAceCombo(cards){ return cards.length > 0 && cards.every(c => c.rank === 'A'); }
function isBlockedBeat(lastPlay, newCombo, newCards){
  if(!lastPlay) return false;
  if((lastPlay.combo.type === 'four' || lastPlay.combo.type === 'four_pure') && (newCombo.type === 'four' || newCombo.type === 'four_pure')) return 'poker';
  return false;
}
function blockedBeatMessage(reason){
  if(reason === 'poker') return 'Bom 4 Angka Sama gak bisa dibantai sesama Bom 4 Angka Sama!';
  return 'Kombinasi tidak diperbolehkan.';
}

function pokerBuildNewGame(prev){
  const deck = shuffleDeck(makeDeck());
  const hands = { p1: deck.slice(0, 13), p2: deck.slice(13, 26), p3: deck.slice(26, 39), p4: deck.slice(39, 52) };
  let starter = 'p1';
  ROLES.forEach(r => { if(hands[r].some(c => c.rank === '03' && c.suit === 'd')) starter = r; });
  return {
    phase: 'playing', hands, turn: starter, starter, isFirstPlay: true, lastPlay: null, lastPlayer: null, passCount: 0,
    finished: [], loser: null, winner: null, lastActionText: null, handNumber: ((prev && prev.handNumber) || 0) + 1, names: (prev && prev.names) || {}
  };
}

// ======================================================
// AKSI PEMAIN
// ======================================================
function pokerDoPlay(){
  const data = latestPokerData;
  if(!data || data.phase !== 'playing' || data.turn !== myRole) return;

  const hand = sortCards(data.hands && data.hands[myRole]);
  const selected = hand.filter(c => selectedKeys.has(cardKey(c)));
  if(selected.length === 0){ pokerSfx('bad'); showCustomAlert('Pilih kartu dulu.'); return; }

  const combo = detectCombo(selected);
  if(!combo.valid){ pokerSfx('bad'); showCustomAlert('Kombinasi kartu tidak valid.'); return; }
  if(data.isFirstPlay && !selected.some(c => c.rank === '03' && c.suit === 'd')){ pokerSfx('bad'); showCustomAlert('Wajib jalan dengan kartu 3♦ (3 Wajik) di kartu pertama!'); return; }

  if(!data.isFirstPlay && data.lastPlay){
    if(combo.count !== data.lastPlay.combo.count){
      pokerSfx('bad');
      showCustomAlert('Jumlah kartu harus sama dengan yang di meja (' + data.lastPlay.combo.count + ' kartu).');
      return;
    }
    if(isBlockedBeat(data.lastPlay, combo, selected)){
      pokerSfx('bad');
      showCustomAlert(blockedBeatMessage(isBlockedBeat(data.lastPlay, combo, selected)));
      return;
    }
    // Harus LEBIH BESAR (> 0), kalau sama (0) ditolak
    if(compareCombo(combo, data.lastPlay.combo) <= 0){
      pokerSfx('bad');
      showCustomAlert('Kombinasi kamu harus LEBIH TINGGI dari kartu terakhir di meja.');
      return;
    }
  }

  pokerRef.transaction(cur => {
    if(!cur || cur.phase !== 'playing' || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));

    const curHand = ensureArray(state.hands[myRole]);
    const remain = removeCards(curHand, selected);
    if(remain.length !== curHand.length - selected.length) return cur;

    const c2 = detectCombo(selected);
    if(!c2.valid) return cur;
    if(state.isFirstPlay && !selected.some(c => c.rank === '03' && c.suit === 'd')) return cur;
    if(!state.isFirstPlay && state.lastPlay){
      if(c2.count !== state.lastPlay.combo.count || isBlockedBeat(state.lastPlay, c2, selected) || compareCombo(c2, state.lastPlay.combo) <= 0) return cur;
    }

    state.hands[myRole] = remain;
    state.lastPlay = { by: myRole, cards: selected, combo: c2 };
    state.lastPlayer = myRole; state.passCount = 0; state.isFirstPlay = false;
    state.lastActionText = comboDisplayName(c2);

    const finished = ensureArray(state.finished);
    if(remain.length === 0 && !finished.includes(myRole)){
      finished.push(myRole); state.finished = finished;
      if(finished.length >= 3){
        state.phase = 'roundover'; state.loser = ROLES.find(r => !finished.includes(r)) || null; state.winner = finished[0];
        return state;
      }
    }
    state.turn = nextActiveRole(myRole, state.finished || []);
    return state;
  }, () => { selectedKeys.clear(); });
}

function pokerDoPass(){
  pokerRef.transaction(cur => {
    if(!cur || cur.phase !== 'playing' || cur.turn !== myRole || !cur.lastPlay) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const finished = ensureArray(state.finished);

    state.passCount = (state.passCount || 0) + 1;
    state.lastActionText = 'pass';
    const activeCount = 4 - finished.length, threshold = Math.max(activeCount - 1, 1);

    if(state.passCount >= threshold){
      state.lastPlay = null; state.passCount = 0;
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
  const my = ROLES.indexOf(myRole), r = ROLES.indexOf(role);
  return ['bottom', 'right', 'top', 'left'][(r - my + 4) % 4];
}

// ======================================================
// EFEK VISUAL
// ======================================================
function pokerToast(text, big) {
  const table = document.querySelector('#pokerScreen .capsa-table'); if (!table) return;
  const t = document.createElement('div');
  t.className = 'poker-toast' + (big ? ' big' : ''); t.textContent = text;
  table.appendChild(t);
  setTimeout(() => t.remove(), 1250);
}

function pokerBubble(role, text) {
  const pos = seatPosFor(role);
  const seat = document.getElementById({ top: 'capsaSeatTop', left: 'capsaSeatLeft', right: 'capsaSeatRight', bottom: 'capsaSeatBottom' }[pos]);
  if (!seat) return;
  const b = document.createElement('div'); b.className = 'poker-bubble'; b.textContent = text;
  seat.appendChild(b);
  setTimeout(() => b.remove(), 1200);
}

function pokerTableShake() {
  const table = document.querySelector('#pokerScreen .capsa-table'); if (!table) return;
  table.classList.remove('shake'); void table.offsetWidth; table.classList.add('shake');
  setTimeout(() => table.classList.remove('shake'), 380);
}

function pokerConfetti() {
  const table = document.querySelector('#pokerScreen .capsa-table'); if (!table) return;
  const colors = ['#e8ac1f', '#3d6bf0', '#2bb673', '#e4574f', '#ffffff', '#a855f7'];
  const box = document.createElement('div'); box.className = 'poker-confetti-box';
  for (let i = 0; i < 52; i++) {
    const s = document.createElement('i');
    s.style.left = (Math.random() * 100) + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = (Math.random() * .5) + 's';
    s.style.animationDuration = (1.6 + Math.random() * 1.3) + 's';
    s.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    box.appendChild(s);
  }
  table.appendChild(box);
  setTimeout(() => box.remove(), 3600);
}

function pokerShakeCard(el) {
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

// ======================================================
// RENDER KARTU LAWAN (update di tempat)
// ======================================================
function pokerRenderBackHand(container, count){
  const wrap = container.querySelector('.capsa-card-back-wrap');
  if(count <= 0){ container.innerHTML = ''; return; }
  if(!wrap){
    container.innerHTML = '';
    const w = document.createElement('div');
    w.className = 'capsa-card-back-wrap';
    const img = document.createElement('img');
    img.className = 'capsa-card-back'; img.src = CARD_BACK_IMG; img.alt = 'kartu tertutup';
    const badge = document.createElement('span');
    badge.className = 'capsa-card-back-count'; badge.textContent = count;
    w.appendChild(img); w.appendChild(badge); container.appendChild(w);
    return;
  }
  const badge = wrap.querySelector('.capsa-card-back-count');
  if(badge.textContent !== String(count)){
    badge.textContent = count;
    if(pokerPrev.init){ badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
  }
}

// ======================================================
// RENDER TANGAN SAYA (diff + kipas)
// ======================================================
function pokerFanOverlap(container, n){
  const avail = container.clientWidth - 8;
  if(!avail || n < 2){ container.style.setProperty('--ov', '-8px'); return; }
  const cardW = 52;
  let ov = (avail - n * cardW) / (n - 1);
  ov = Math.max(-32, Math.min(6, ov));
  container.style.setProperty('--ov', ov + 'px');
}

function pokerPaintHand(data){
  const canSelect = !!data && data.phase === 'playing' && data.turn === myRole;
  document.querySelectorAll('#capsaHandMe .capsa-card-img').forEach(el => {
    el.classList.toggle('selected', selectedKeys.has(el.dataset.key));
    el.classList.toggle('myturn', canSelect);
  });
}

function pokerToggleCard(el){
  const d = latestPokerData;
  pokerGetAudio();
  if(!d || d.phase !== 'playing' || d.turn !== myRole){ pokerShakeCard(el); return; }
  const k = el.dataset.key;
  if(selectedKeys.has(k)) selectedKeys.delete(k); else selectedKeys.add(k);
  pokerSfx('tick');
  pokerPaintHand(d);
  pokerUpdatePreview(d);
}

function pokerSyncMyHand(data, animateNew){
  const container = document.getElementById('capsaHandMe');
  const hand = sortCards(data.hands && data.hands[myRole]);
  const existing = new Map();
  Array.from(container.children).forEach(el => existing.set(el.dataset.key, el));
  const keep = new Set();
  let ref = container.firstChild;
  let idx = 0;

  hand.forEach(c => {
    const k = cardKey(c); keep.add(k);
    let el = existing.get(k);
    if(!el){
      el = document.createElement('img');
      el.dataset.key = k; el.draggable = false; el.alt = c.rank + c.suit;
      el.src = cardImg(c);
      el.className = 'capsa-card-img';
      if(animateNew){
        el.classList.add('enter');
        el.style.animationDelay = (idx * 40) + 'ms';
        el.addEventListener('animationend', () => { el.classList.remove('enter'); el.style.animationDelay = ''; }, { once: true });
      }
      el.addEventListener('click', () => pokerToggleCard(el));
    }
    idx++;
    if(el === ref) ref = ref.nextSibling; else container.insertBefore(el, ref);
  });
  existing.forEach((el, k) => { if(!keep.has(k)) el.remove(); });
  pokerFanOverlap(container, hand.length);
  pokerPaintHand(data);
}

// ======================================================
// TENGAH MEJA
// ======================================================
function pokerRenderCenter(data, animate){
  const wrap = document.getElementById('capsaLastPlay');
  const byEl = document.getElementById('capsaLastBy');
  if(!data.lastPlay){
    if(pokerPrev.centerSig !== ''){ wrap.innerHTML = ''; pokerPrev.centerSig = ''; }
    byEl.textContent = data.phase === 'playing' ? 'Meja kosong — bebas jalan!' : '';
    return;
  }

  const cards = sortCards(data.lastPlay.cards);
  const sig = data.handNumber + '|' + data.lastPlay.by + '|' + cards.map(cardKey).join(',');
  if(sig !== pokerPrev.centerSig){
    wrap.innerHTML = '';
    const vec = { bottom: ['0px', '110px'], top: ['0px', '-110px'], left: ['-130px', '0px'], right: ['130px', '0px'] }[seatPosFor(data.lastPlay.by)];
    cards.forEach((c, i) => {
      const img = document.createElement('img');
      img.className = 'capsa-card-img small'; img.src = cardImg(c);
      if(animate){
        img.classList.add('fly');
        img.style.setProperty('--fx', vec[0]); img.style.setProperty('--fy', vec[1]);
        img.style.setProperty('--rot', ((i - (cards.length - 1) / 2) * 8) + 'deg');
        img.style.animationDelay = (i * 45) + 'ms';
      }
      wrap.appendChild(img);
    });
    pokerPrev.centerSig = sig;
  }
  const byLabel = data.lastPlay.by === myRole ? 'Kamu' : displayName(data.lastPlay.by);
  byEl.textContent = byLabel + ' · ' + comboDisplayName(data.lastPlay.combo);
}

function pokerRenderStatus(data){
  const statusEl = document.getElementById('pokerStatus');
  if(data.phase === 'waiting'){
    const onlineCount = ROLES.filter(r => pokerPresence[r]).length;
    statusEl.textContent = '🟡 Menunggu pemain bergabung (' + onlineCount + '/4)...';
  } else if(data.phase === 'playing'){
    if(data.turn === myRole) statusEl.textContent = data.isFirstPlay ? '🟢 Giliranmu! Wajib jalan dengan 3♦ (3 Wajik).' : '🟢 Giliranmu!';
    else statusEl.textContent = '🟡 Menunggu ' + displayName(data.turn) + '...';
  } else if(data.phase === 'roundover'){
    statusEl.textContent = '🏁 Ronde selesai.';
  }
  statusEl.style.color = (data.phase === 'playing' && data.turn === myRole) ? 'var(--green)' : '';
}

function pokerRenderRankBar(data){
  const el = document.getElementById('capsaRankBar');
  if(!el) return;
  const finished = ensureArray(data.finished);
  if(finished.length === 0 || data.phase === 'waiting'){ el.style.display = 'none'; el.innerHTML = ''; return; }

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

// ======================================================
// PREVIEW KOMBINASI (live saat memilih kartu)
// ======================================================
function pokerEnsurePreview(){
  let el = document.getElementById('capsaPreview');
  if(!el){
    el = document.createElement('div');
    el.id = 'capsaPreview'; el.className = 'capsa-preview'; el.style.display = 'none';
    const act = document.getElementById('capsaActions');
    act.parentNode.insertBefore(el, act);
  }
  return el;
}

function pokerUpdatePreview(data){
  const el = pokerEnsurePreview();
  const playBtn = document.getElementById('capsaBtnPlay');
  const canAct = !!data && data.phase === 'playing' && data.turn === myRole;
  if(!canAct){ el.style.display = 'none'; return; }
  el.style.display = 'block';

  const hand = sortCards(data.hands && data.hands[myRole]);
  const sel = hand.filter(c => selectedKeys.has(cardKey(c)));
  playBtn.disabled = sel.length === 0;

  if(sel.length === 0){
    el.className = 'capsa-preview';
    el.textContent = data.lastPlay ? ('Pilih ' + data.lastPlay.combo.count + ' kartu yang lebih tinggi, atau Pass') : (data.isFirstPlay ? 'Mulai dengan kombinasi yang berisi 3♦' : 'Meja kosong — bebas pilih kombinasi');
    return;
  }

  const combo = detectCombo(sel);
  if(!combo.valid){
    el.className = 'capsa-preview bad';
    el.textContent = '❌ Bukan kombinasi valid (' + sel.length + ' kartu)';
    return;
  }

  let ok = true, why = '';
  if(data.isFirstPlay && !sel.some(c => c.rank === '03' && c.suit === 'd')){ ok = false; why = 'wajib ada 3♦'; }
  else if(!data.isFirstPlay && data.lastPlay){
    if(combo.count !== data.lastPlay.combo.count){ ok = false; why = 'harus ' + data.lastPlay.combo.count + ' kartu'; }
    else if(isBlockedBeat(data.lastPlay, combo, sel)){ ok = false; why = 'tidak bisa dibantai'; }
    else if(compareCombo(combo, data.lastPlay.combo) <= 0){ ok = false; why = 'kalah dari meja'; }
  }
  el.className = 'capsa-preview ' + (ok ? 'ok' : 'bad');
  el.textContent = (ok ? '✅ ' : '❌ ') + comboDisplayName(combo) + (why ? (' — ' + why) : '');
}

// ======================================================
// EVENT (suara & efek)
// ======================================================
function pokerDetectEvents(data, first){
  const finished = ensureArray(data.finished);
  const lp = data.lastPlay;
  const playSig = lp ? (data.handNumber + '|' + lp.by + '|' + ensureArray(lp.cards).map(cardKey).join(',')) : '';
  const passSig = data.handNumber + '|' + data.turn + '|' + (data.passCount || 0) + '|' + (data.lastActionText || '');

  if(!first && data.handNumber === pokerPrev.hand){
    if(lp && playSig !== pokerPrev.playSig){
      const t = lp.combo.type;
      if(t === 'four_pure' || t === 'four' || t === 'straightflush'){
        pokerSfx('bomb'); pokerToast('💣 ' + comboDisplayName(lp.combo).toUpperCase() + '!', true); pokerTableShake();
      } else if(lp.combo.count >= 3){
        pokerSfx('combo'); pokerToast(comboDisplayName(lp.combo));
      } else pokerSfx('play');
    } else if(data.lastActionText === 'pass' && passSig !== pokerPrev.passSig && pokerPrev.turn && pokerPrev.turn !== data.turn){
      pokerSfx('pass'); pokerBubble(pokerPrev.turn, 'PASS');
    }

    if(finished.length > pokerPrev.finished){
      finished.slice(pokerPrev.finished).forEach(r => pokerToast('🏅 ' + (r === myRole ? 'Kamu' : displayName(r)) + ' habis!'));
      pokerSfx('finish');
    }

    if(data.phase === 'playing' && data.turn === myRole && pokerPrev.turn !== myRole){
      setTimeout(() => pokerSfx('turn'), 200);
      try { if(navigator.vibrate) navigator.vibrate(50); } catch(e) {}
    }

    if(data.phase === 'roundover' && pokerPrev.phase !== 'roundover'){
      if(finished[0] === myRole){ pokerSfx('win'); pokerConfetti(); }
      else if(finished.includes(myRole)) pokerSfx('finish');
      else pokerSfx('lose');
    }
  }

  pokerPrev.hand = data.handNumber;
  pokerPrev.playSig = playSig;
  pokerPrev.passSig = passSig;
  pokerPrev.turn = data.turn;
  pokerPrev.phase = data.phase;
  pokerPrev.finished = finished.length;
}

// ======================================================
// RENDER UTAMA
// ======================================================
function pokerRenderCore(data){
  latestPokerData = data;
  const first = !pokerPrev.init;
  const newDeal = pokerPrev.init && data.handNumber !== pokerPrev.hand;
  if(data.turn !== myRole || data.phase !== 'playing') selectedKeys.clear();

  const posEls = {
    top: { seat: document.getElementById('capsaSeatTop'), name: document.getElementById('capsaNameTop'), hand: document.getElementById('capsaHandTop') },
    left: { seat: document.getElementById('capsaSeatLeft'), name: document.getElementById('capsaNameLeft'), hand: document.getElementById('capsaHandLeft') },
    right: { seat: document.getElementById('capsaSeatRight'), name: document.getElementById('capsaNameRight'), hand: document.getElementById('capsaHandRight') },
    bottom: { seat: document.getElementById('capsaSeatBottom') }
  };

  // sinkron kartu saya: pruning pilihan yang sudah tidak ada
  const myKeys = new Set(sortCards(data.hands && data.hands[myRole]).map(cardKey));
  Array.from(selectedKeys).forEach(k => { if(!myKeys.has(k)) selectedKeys.delete(k); });

  const finished = ensureArray(data.finished);
  ROLES.forEach(role => {
    const pos = seatPosFor(role), el = posEls[pos];
    const count = (data.hands && data.hands[role]) ? ensureArray(data.hands[role]).length : 0;
    const online = !!pokerPresence[role], isFinished = finished.includes(role);
    el.seat.classList.toggle('active-turn', data.turn === role && data.phase === 'playing');
    el.seat.classList.toggle('capsa-seat-done', isFinished);
    if(pos !== 'bottom'){
      const rank = finished.indexOf(role);
      const rankTag = rank === 0 ? ' 🥇' : rank === 1 ? ' 🥈' : rank === 2 ? ' 🥉' : '';
      el.name.textContent = displayName(role) + (online ? ' 🟢' : ' 🔴') + rankTag + ' · ' + count + ' kartu';
      pokerRenderBackHand(el.hand, count);
    }
  });

  pokerSyncMyHand(data, !first);
  pokerRenderCenter(data, !first && !newDeal);
  pokerRenderStatus(data);
  pokerRenderRankBar(data);
  pokerRenderMyNameLabel();

  const canAct = data.phase === 'playing' && data.turn === myRole;
  document.getElementById('capsaActions').style.display = canAct ? 'grid' : 'none';
  if(canAct) document.getElementById('capsaBtnPass').disabled = !data.lastPlay;
  pokerUpdatePreview(data);

  const resultEl = document.getElementById('capsaResult'), nextBtn = document.getElementById('capsaBtnNext');
  if(data.phase === 'roundover'){
    const medals = ['🥇 Juara 1', '🥈 Juara 2', '🥉 Juara 3'];
    let html = finished.map((r, i) => (medals[i] || '🏅') + ': ' + displayName(r) + (r === myRole ? ' (Kamu)' : '')).join('<br>');
    if(data.loser) html += '<br>💀 Buncit: ' + displayName(data.loser) + (data.loser === myRole ? ' (Kamu)' : '');
    resultEl.innerHTML = html; resultEl.style.display = 'block';
    nextBtn.style.display = 'block'; nextBtn.textContent = myRole === 'p1' ? '▶ Main Lagi' : '⏳ Menunggu host mulai lagi';
    nextBtn.disabled = myRole !== 'p1';
  } else {
    resultEl.style.display = 'none'; nextBtn.style.display = 'none';
  }

  pokerDetectEvents(data, first);
  pokerPrev.init = true;
}

function pokerAnimateDeal(done){
  const table = document.querySelector('#pokerScreen .capsa-table');
  if(!table){ done(); return; }
  const overlay = document.createElement('div'); overlay.className = 'capsa-deal-overlay'; table.appendChild(overlay);
  const dealTargets = ['bottom', 'right', 'top', 'left'], cardsPerPlayer = 5, perCardDelay = 300, animDuration = 550;
  let cardIndex = 0;
  dealTargets.forEach(dir => {
    for(let c = 0; c < cardsPerPlayer; c++){
      const img = document.createElement('img');
      img.src = CARD_BACK_IMG; img.className = 'capsa-deal-card deal-' + dir; img.style.animationDelay = (cardIndex * perCardDelay) + 'ms';
      overlay.appendChild(img);
      setTimeout(() => pokerSfx('deal'), cardIndex * perCardDelay);
      cardIndex++;
    }
  });
  const totalDuration = (cardIndex - 1) * perCardDelay + animDuration + 150;
  setTimeout(() => { overlay.remove(); done(); }, totalDuration);
}

function pokerRender(data){
  const freshHand = data.phase === 'playing' && !!data.handNumber && data.handNumber !== pokerLastAnimatedHand;
  const shouldAnimate = freshHand && pokerHasRenderedOnce;
  if(freshHand) pokerLastAnimatedHand = data.handNumber;
  pokerHasRenderedOnce = true;

  if(shouldAnimate){ latestPokerData = data; pokerAnimateDeal(() => pokerRenderCore(latestPokerData || data)); }
  else pokerRenderCore(data);
}

// ======================================================
// PRESENCE & NAMA
// ======================================================
function pokerAttachPresence(){
  const presenceRef = roomRef.child('presence/' + myRole); activePresenceRef = presenceRef;
  dbRoot.ref('.info/connected').on('value', snap => {
    if(snap.val() === true){ presenceRef.onDisconnect().remove(); presenceRef.set(true); }
  });
  if(!window.__capsaPagehideBound){
    window.__capsaPagehideBound = true;
    window.addEventListener('pagehide', () => { if(activePresenceRef) activePresenceRef.remove(); });
  }
  roomRef.child('presence').on('value', snap => {
    pokerPresence = snap.val() || {};
    if(latestPokerData) pokerRenderCore(latestPokerData);
    if(myRole === 'p1' && latestPokerData && latestPokerData.phase === 'waiting'){
      if(ROLES.every(s => pokerPresence[s])) pokerRef.transaction(cur => (cur && cur.phase === 'waiting') ? pokerBuildNewGame(cur) : cur);
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
  const overlay = document.getElementById('capsaNameOverlay'), input = document.getElementById('capsaNameInput');
  if(!overlay || !input) return;
  input.value = (pokerNames && pokerNames[myRole]) ? pokerNames[myRole] : '';
  overlay.style.display = 'flex'; setTimeout(() => input.focus(), 50);
}
function pokerCloseNameEditor(){ const overlay = document.getElementById('capsaNameOverlay'); if(overlay) overlay.style.display = 'none'; }
function pokerSaveName(){
  const input = document.getElementById('capsaNameInput'); if(!input) return;
  pokerRef.child('names/' + myRole).set(input.value.trim().slice(0, 14) || null);
  pokerCloseNameEditor();
}

// ======================================================
// INIT
// ======================================================
function initPoker(){
  pokerRef = roomRef.child('poker');
  pokerPrev = { init: false, hand: null, playSig: null, passSig: null, turn: null, phase: null, finished: 0, centerSig: null };
  pokerHasRenderedOnce = false; pokerLastAnimatedHand = null;
  selectedKeys.clear();
  document.getElementById('pokerRoleTag').textContent = myRole.toUpperCase();
  document.documentElement.classList.add('force-landscape');
  pokerEnsurePreview();

  document.getElementById('btnPokerBack').onclick = () => {
    document.documentElement.classList.remove('force-landscape');
    if(activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload();
  };

  roomRef.child('presence/' + myRole).transaction(cur => cur === null ? true : cur);

  if(myRole === 'p1'){
    pokerRef.transaction(cur => cur || {
      phase: 'waiting', hands: null, turn: null, starter: null, isFirstPlay: true, lastPlay: null, lastPlayer: null,
      passCount: 0, finished: [], loser: null, winner: null, lastActionText: null, handNumber: 0, names: {}
    });
  }

  pokerAttachPresence(); pokerAttachNames();

  pokerRef.on('value', snap => { const data = snap.val(); if(data) pokerRender(data); });

  document.getElementById('capsaBtnPass').onclick = () => { pokerGetAudio(); pokerDoPass(); };
  document.getElementById('capsaBtnPlay').onclick = () => { pokerGetAudio(); pokerDoPlay(); };
  document.getElementById('capsaBtnNext').onclick = () => {
    if(myRole !== 'p1') return;
    pokerRef.transaction(cur => (cur && cur.phase === 'roundover') ? pokerBuildNewGame(cur) : cur);
  };

  const editBtn = document.getElementById('capsaBtnEditName'); if(editBtn) editBtn.onclick = () => pokerOpenNameEditor();
  const cancelBtn = document.getElementById('capsaNameCancel'); if(cancelBtn) cancelBtn.onclick = () => pokerCloseNameEditor();
  const saveBtn = document.getElementById('capsaNameSave'); if(saveBtn) saveBtn.onclick = () => pokerSaveName();
  const nameInput = document.getElementById('capsaNameInput'); if(nameInput) nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') pokerSaveName(); });

  // hitung ulang kipas kartu kalau layar berubah ukuran / diputar
  window.addEventListener('resize', () => { if(latestPokerData) pokerFanOverlap(document.getElementById('capsaHandMe'), document.querySelectorAll('#capsaHandMe .capsa-card-img').length); });
}
