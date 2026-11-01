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

  /* Tangan: kipas melengkung, posisi kartu dihitung JS supaya selalu di dalam kotak kuning.
     Tinggi total (136px) = sama dengan tinggi lama, jadi ukuran kotak kuning tidak berubah. */
  #pokerScreen .capsa-hand-me {
    display: block; position: relative; box-sizing: border-box;
    width: 100%; max-width: 100%; min-width: 0; align-self: stretch;
    height: 136px; min-height: 0; padding: 0; overflow: hidden; touch-action: manipulation;
  }
  #pokerScreen .capsa-hand-me .capsa-card-img {
    position: absolute; left: 0; top: 0; margin: 0; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent; -webkit-user-drag: none; user-select: none;
    transform-origin: 50% 100%;
    transform: translateY(var(--dy, 0px)) rotate(var(--rot, 0deg));
    animation: none;
    transition: transform .16s cubic-bezier(.34,1.56,.64,1), box-shadow .16s ease, left .22s ease;
  }
  #pokerScreen .capsa-hand-me .capsa-card-img.enter { animation: pokerCardIn .42s cubic-bezier(.2,.9,.3,1.2) backwards; }
  @keyframes pokerCardIn {
    from { transform: translateY(-60px) scale(.5) rotate(-12deg); opacity: 0; }
    to   { transform: translateY(var(--dy, 0px)) rotate(var(--rot, 0deg)); opacity: 1; }
  }
  #pokerScreen .capsa-hand-me .capsa-card-img.myturn { cursor: pointer; }
  #pokerScreen .capsa-hand-me .capsa-card-img.selected {
    transform: translateY(calc(var(--dy, 0px) - 18px)) rotate(var(--rot, 0deg)) scale(1.05); z-index: 60 !important;
    box-shadow: 0 0 0 3px var(--gold), 0 12px 22px rgba(0,0,0,.7);
  }
  #pokerScreen .capsa-hand-me .capsa-card-img.shake { animation: pokerShake .3s ease; }
  @keyframes pokerShake { 0%,100% { translate: 0 0; } 25% { translate: -5px 0; } 75% { translate: 5px 0; } }
  @media (hover: hover) {
    #pokerScreen .capsa-hand-me .capsa-card-img.myturn:not(.selected):hover { transform: translateY(calc(var(--dy, 0px) - 8px)) rotate(var(--rot, 0deg)); z-index: 59 !important; }
  }
  /* Tombol kecil: perbesar / kecilkan tangan */
  #pokerScreen .poker-hand-btn {
    position: absolute; top: 4px; left: 4px; z-index: 80; width: 30px; height: 30px; padding: 0; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 15px; line-height: 1; cursor: pointer;
    background: rgba(0,0,0,.5); color: var(--gold); border: 1px solid rgba(232,172,31,.7);
    -webkit-tap-highlight-color: transparent;
  }
  #pokerScreen .poker-hand-btn:active { transform: scale(.9); }
  #pokerScreen .poker-hand-btn.on { background: var(--gold); color: #1a1a1a; }

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

  /* Riwayat putaran */
  #pokerScreen .poker-hist-btn {
    position: absolute; top: 8px; right: 8px; z-index: 30; width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 17px; cursor: pointer; padding: 0;
    background: rgba(0,0,0,.5); color: var(--gold); border: 1px solid rgba(232,172,31,.7);
    -webkit-tap-highlight-color: transparent;
  }
  #pokerScreen .poker-hist-btn.on { background: var(--gold); color: #1a1a1a; }
  #pokerScreen .poker-hist-panel {
    position: absolute; top: 52px; left: 10px; right: 10px; max-height: 62%; overflow-y: auto; z-index: 50; display: none;
    background: rgba(6,20,13,.97); border: 1px solid rgba(232,172,31,.6); border-radius: 12px; padding: 8px 10px;
    box-shadow: 0 10px 26px rgba(0,0,0,.6); -webkit-overflow-scrolling: touch;
  }
  #pokerScreen .poker-hist-title { font-size: 12px; font-weight: 800; color: var(--gold); margin-bottom: 6px; display: flex; justify-content: space-between; }
  #pokerScreen .ph-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.07); }
  #pokerScreen .ph-who { flex: 0 0 44px; font-size: 12px; font-weight: 800; color: var(--ink-dim); }
  #pokerScreen .ph-row.me .ph-who { color: var(--gold); }
  #pokerScreen .ph-cards { display: flex; flex: 1; min-width: 0; }
  #pokerScreen .ph-cards img { width: 26px; height: 37px; margin-left: -9px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,.6); background: #fff; }
  #pokerScreen .ph-cards img:first-child { margin-left: 0; }
  #pokerScreen .ph-name { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: #fff; opacity: .85; }
  #pokerScreen .ph-pass { flex: 1; font-size: 12px; font-weight: 800; color: #7fa2ff; }
  #pokerScreen .ph-sep { text-align: center; font-size: 10px; letter-spacing: .5px; color: var(--ink-dim); padding: 6px 0 2px; opacity: .8; }
  #pokerScreen .ph-empty { font-size: 12px; color: var(--ink-dim); padding: 6px 0; }
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
    else if (kind === 'dealall') {   // satu efek "wuuush" + kocokan kartu cepat
      pokerTone(260, 0, .34, 'sawtooth', .07, 1400);
      pokerTone(180, 0, .30, 'triangle', .10, 700);
      for (let i = 0; i < 14; i++) pokerTone(760 - (i % 3) * 90, .03 + i * .022, .035, 'square', .05, 480);
      pokerTone(520, .38, .08, 'sine', .12, 300);
    }
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

// Daftar pemain yang ikut ronde ini (2-4). Data lama tanpa `players` dianggap 4 pemain.
function pokerPlayers(data){
  const list = ensureArray(data && data.players).filter(r => ROLES.includes(r));
  return list.length ? list : ROLES.slice();
}

function nextActiveRole(current, finished, players){
  finished = ensureArray(finished);
  players = (players && players.length) ? ensureArray(players) : ROLES;
  let idx = ROLES.indexOf(current);
  for(let i = 0; i < 4; i++){
    idx = (idx + 1) % 4;
    const r = ROLES[idx];
    if(players.includes(r) && !finished.includes(r)) return r;
  }
  return current;
}

// Berapa kali PASS beruntun supaya meja bersih.
// Kalau pemain yang terakhir main sudah habis kartu, SEMUA pemain aktif harus pass
// (sebelumnya kurang 1, jadi pemain terakhir tidak sempat membalas).
// Pemain yang sudah tidak ikut giliran: sudah habis kartu (finished) + yang "mati" kena Seri 5 (dead)
function pokerOutList(state){ return ensureArray(state && state.finished).concat(ensureArray(state && state.dead)); }

// Dipanggil SETELAH kartu dibuang (tangan sudah dikurangi, lastPlay sudah diisi).
// Mengurus: habis kartu, efek Seri 4 / Poker (lawan berikutnya skip 1x), Seri 5 (lawan berikutnya MATI = juara terakhir), pindah giliran, akhir ronde.
function pokerFinishPlay(state, actor, combo){
  const pl = pokerPlayers(state);
  const finished = ensureArray(state.finished), dead = ensureArray(state.dead);
  state.finished = finished; state.dead = dead;
  if(ensureArray(state.hands[actor]).length === 0 && !finished.includes(actor)) finished.push(actor);

  const nextOf = from => nextActiveRole(from, finished.concat(dead), pl);
  const isKill = combo.type === 'straight' || combo.type === 'straightflush';   // Seri 5 urut
  const isSkip = combo.type === 'run4' || combo.type === 'four';                // Seri 4 / Poker
  let target = null;
  if(isKill || isSkip){
    const nx = nextOf(actor);
    if(nx && nx !== actor && !finished.includes(nx) && !dead.includes(nx)) target = nx;
  }
  state.bomb = null;
  if(target && isKill){
    dead.push(target);
    state.bomb = { seq: ((state.bombSeq || 0) + 1), type: 'dead', by: actor, target };
    state.bombSeq = state.bomb.seq;
  } else if(target && isSkip){
    state.bomb = { seq: ((state.bombSeq || 0) + 1), type: 'skip', by: actor, target };
    state.bombSeq = state.bomb.seq;
  }

  // Akhir ronde kalau pemain aktif tinggal <= 1
  const active = pl.filter(r => !finished.includes(r) && !dead.includes(r));
  if(active.length <= 1){
    if(dead.length > 0){
      if(active.length === 1) finished.push(active[0]);   // yang selamat
      state.loser = dead[0];                              // yang mati duluan = juara terakhir
    } else {
      state.loser = active[0] || null;
    }
    state.phase = 'roundover'; state.winner = finished[0] || null;
    return state;
  }

  if(target && isSkip && state.bomb && state.bomb.type === 'skip'){
    state.passCount = 1;                                  // yang kena skip dihitung pass
    if(state.passCount >= pokerPassThreshold(state)){
      state.lastPlay = null; state.passCount = 0;
      let ret = state.lastPlayer || nextOf(actor);
      if(finished.includes(ret) || dead.includes(ret)) ret = nextOf(ret);
      state.turn = ret;
    } else {
      state.turn = nextOf(target);
    }
    return state;
  }
  state.turn = nextOf(actor);
  return state;
}

function pokerPassThreshold(state){
  const players = pokerPlayers(state), finished = pokerOutList(state);
  const active = players.filter(r => !finished.includes(r));
  const lastStillIn = !!state.lastPlayer && active.includes(state.lastPlayer);
  return Math.max(lastStillIn ? active.length - 1 : active.length, 1);
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

  // 3 Kartu (Triss atau Seri 3)
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
  const map = { single: 'Single', pair: 'Pair', triple: 'Triss', run3: 'Seri (3 Kartu)', run4: 'Bom Seri (4 Kartu)', four_pure: 'Bom 4 Angka Sama', straight: 'Seri 5 Kartu (Straight)', seripolo: 'Polo Seri (Seri + Pair)', fullhouse: 'Polo (Full House)', four: 'Poker (Four of a Kind + Kicker)' };
  if (combo.type === 'straightflush') return combo.tiebreak[0] === RANK_ORDER['02'] ? 'Royal Flush' : 'Straight Flush';
  return map[combo.type] || '-';
}

// Fungsi ini udah gak terlalu kepake karena compareCombo udah otomatis nolak
// Tapi dibiarin aja buat jaga-jaga
function isPureAceCombo(cards){ return cards.length > 0 && cards.every(c => c.rank === 'A'); }
function isBlockedBeat(lastPlay, newCombo, newCards){
  if(!lastPlay) return false;
  if(lastPlay.combo.type === 'four' && newCombo.type === 'four') return 'poker';
  return false;
}
function blockedBeatMessage(reason){
  if(reason === 'poker') return 'Poker (4 Angka Sama + 1) gak bisa dibantai sesama Poker!';
  return 'Kombinasi tidak diperbolehkan.';
}

function pokerBuildNewGame(prev, presence){
  presence = presence || pokerPresence || {};
  let players = ROLES.filter(r => presence[r]);
  if(players.length < 2) players = ROLES.slice(0, 2);
  const deck = shuffleDeck(makeDeck());

  // ATURAN JALAN PERTAMA
  //  - Ronde 1 (room baru): pemegang 3♣ (3 Keriting, 3 terendah) jalan duluan dan WAJIB memulai dengan 3♣.
  //  - Ronde 2 dst (Main Lagi di room yang sama): Juara 1 ronde sebelumnya jalan duluan, bebas (tanpa wajib 3).
  //  - Kalau Juara 1 sebelumnya sudah tidak ada di room: kembali ke aturan 3♣.
  const prevWinner = prev && prev.winner;
  const useWinner = !!(prev && prev.handNumber >= 1 && prevWinner && players.includes(prevWinner));

  // Kalau aturan 3♣ dipakai dan pemain < 4, pastikan 3♣ ikut terbagi (bukan di sisa dek)
  const dealCount = players.length * 13;
  if(!useWinner){
    const idx3 = deck.findIndex(c => c.rank === '03' && c.suit === 'c');
    if(idx3 >= dealCount){
      const j = Math.floor(Math.random() * dealCount);
      [deck[idx3], deck[j]] = [deck[j], deck[idx3]];
    }
  }

  const hands = {};
  players.forEach((r, i) => { hands[r] = deck.slice(i * 13, i * 13 + 13); });
  let starter = players[0];
  if(useWinner) starter = prevWinner;
  else players.forEach(r => { if(hands[r].some(c => c.rank === '03' && c.suit === 'c')) starter = r; });
  return {
    phase: 'playing', players, hands, turn: starter, starter, isFirstPlay: !useWinner, lastPlay: null, lastPlayer: null, passCount: 0,
    finished: [], dead: [], bomb: null, bombSeq: 0, loser: null, winner: null, lastActionText: null, handNumber: ((prev && prev.handNumber) || 0) + 1, names: (prev && prev.names) || {}
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
  if(data.isFirstPlay && !selected.some(c => c.rank === '03' && c.suit === 'c')){ pokerSfx('bad'); showCustomAlert('Wajib jalan dengan kartu 3♣ (3 Keriting) di kartu pertama!'); return; }

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
    if(state.isFirstPlay && !selected.some(c => c.rank === '03' && c.suit === 'c')) return cur;
    if(!state.isFirstPlay && state.lastPlay){
      if(c2.count !== state.lastPlay.combo.count || isBlockedBeat(state.lastPlay, c2, selected) || compareCombo(c2, state.lastPlay.combo) <= 0) return cur;
    }

    state.hands[myRole] = remain;
    state.lastPlay = { by: myRole, cards: selected, combo: c2 };
    state.lastPlayer = myRole; state.passCount = 0; state.isFirstPlay = false;
    state.lastActionText = comboDisplayName(c2);

    return pokerFinishPlay(state, myRole, c2);
  }, () => { selectedKeys.clear(); });
}

function pokerDoPass(){
  pokerRef.transaction(cur => {
    if(!cur || cur.phase !== 'playing' || cur.turn !== myRole || !cur.lastPlay) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const finished = pokerOutList(state);

    state.passCount = (state.passCount || 0) + 1;
    state.lastActionText = 'pass';
    const pl = pokerPlayers(state), threshold = pokerPassThreshold(state);

    if(state.passCount >= threshold){
      state.lastPlay = null; state.passCount = 0;
      let returnee = state.lastPlayer || nextActiveRole(myRole, finished, pl);
      if(finished.includes(returnee)) returnee = nextActiveRole(returnee, finished, pl);
      state.turn = returnee;
    } else {
      state.turn = nextActiveRole(myRole, finished, pl);
    }
    return state;
  }, () => { selectedKeys.clear(); });
}

function seatPosFor(role){
  const my = ROLES.indexOf(myRole), r = ROLES.indexOf(role);
  const pl = latestPokerData && latestPokerData.phase !== 'waiting' ? pokerPlayers(latestPokerData) : null;
  if(pl && pl.length === 2 && pl.includes(myRole) && pl.includes(role) && role !== myRole) return 'top'; // 2 pemain: berhadapan
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
// Mode perbesar: kartu lebih besar, disusun 1-2 baris (tanpa kipas) supaya mudah ditekan.
// Pilihan disimpan di perangkat. Default: besar.
let pokerZoom = true;
try { pokerZoom = localStorage.getItem('poker_hand_zoom') !== '0'; } catch(e){}

function pokerEnsureHandTools(container){
  if(container._pokerTools) return;
  container._pokerTools = true;

  const zb = document.createElement('button'); zb.type = 'button'; zb.className = 'poker-hand-btn zoom';
  zb.textContent = '\uD83D\uDD0D';
  container.appendChild(zb);
  zb.addEventListener('click', e => {
    e.stopPropagation();
    pokerZoom = !pokerZoom;
    try { localStorage.setItem('poker_hand_zoom', pokerZoom ? '1' : '0'); } catch(err){}
    pokerSfx('tick');
    pokerFanOverlap(container);
  });

  if(window.ResizeObserver){
    new ResizeObserver(() => pokerFanOverlap(container)).observe(container);
  }
}

// Menyusun kartu di tangan. Dua mode:
//  - besar (zoom): 1-2 baris, kartu besar, jarak tekan lebar
//  - kipas: melengkung, muat di kotak tinggi 136px
// Kedua mode memastikan kartu tidak keluar dari kotak.
function pokerFanOverlap(container){
  if(!container) return;
  pokerEnsureHandTools(container);
  const zb = container.querySelector('.poker-hand-btn.zoom');
  zb.classList.toggle('on', pokerZoom);
  zb.title = pokerZoom ? 'Kecilkan (mode kipas)' : 'Perbesar kartu';

  const ordered = Array.from(container.children).filter(el => el.classList.contains('capsa-card-img'));
  const n = ordered.length;
  const W = container.clientWidth;
  if(!W || !n) return;

  const BASE_W = 52, BASE_H = 74, LIFT = 18, PAD = 6;
  const rad = d => d * Math.PI / 180;

  if(pokerZoom){
    // cari ukuran kartu terbesar yang masih muat dalam maksimal 2 baris
    const sideGap = 6;
    let cw = 50, perRow = 1, rows = n;
    for(const tryW of [68, 64, 60, 56, 52, 48]){
      const pr = Math.max(1, Math.floor((W - 2 * sideGap - tryW) / (tryW * 0.55)) + 1);
      const r = Math.ceil(n / pr);
      cw = tryW; perRow = pr; rows = r;
      if(r <= 2) break;
    }
    const ch = cw * BASE_H / BASE_W;
    const rowStep = ch * 0.56;                       // baris bawah menutup sebagian baris atas
    const topPad = 48;                               // ruang tombol 🔍 + kartu terangkat
    const H = Math.round(topPad + ch + (rows - 1) * rowStep + 10);
    container.style.height = H + 'px';

    // bagi rata jumlah kartu per baris
    const base = Math.ceil(n / rows);
    let idx = 0;
    for(let r = 0; r < rows; r++){
      const cnt = Math.min(base, n - idx);
      const maxStep = cw * 0.78;
      let step = cnt > 1 ? (W - 2 * sideGap - cw) / (cnt - 1) : 0;
      step = Math.max(0, Math.min(maxStep, step));
      const total = (cnt - 1) * step + cw;
      const startX = (W - total) / 2;
      for(let c = 0; c < cnt; c++, idx++){
        const el = ordered[idx];
        el.style.width = cw.toFixed(1) + 'px';
        el.style.height = ch.toFixed(1) + 'px';
        el.style.left = (startX + c * step).toFixed(1) + 'px';
        el.style.top = (topPad + r * rowStep).toFixed(1) + 'px';
        el.style.zIndex = String(idx + 1);
        el.style.setProperty('--rot', '0deg');
        el.style.setProperty('--dy', '0px');
      }
    }
    return;
  }

  // ---- mode kipas (tinggi tetap 136px, sama seperti aslinya) ----
  container.style.height = '';
  const H = container.clientHeight;
  if(!H) return;

  const thetaMax = Math.min(22, Math.max(0, (n - 1) * 3.2));
  const dropMax  = Math.min(14, Math.max(0, (n - 1) * 2.2));
  const margin = s => (BASE_H * s) * Math.sin(rad(thetaMax)) + (BASE_W * s / 2) * Math.cos(rad(thetaMax)) + 3;
  const minStep = s => 0.36 * BASE_W * s;
  let s = 1;
  if(n > 1){
    const m1 = margin(1), k = (n - 1) * minStep(1);
    s = Math.max(0.6, Math.min(1, W / (2 * m1 + k)));
  }
  const cw = BASE_W * s, ch = BASE_H * s, m = margin(s);
  let step = n > 1 ? (W - 2 * m) / (n - 1) : 0;
  step = Math.max(0, Math.min(cw * 0.78, step));
  const total = (n - 1) * step;
  const startX = W / 2 - total / 2;

  const sideLow = (cw / 2) * Math.sin(rad(thetaMax));
  const yBase = H - PAD - dropMax - sideLow;
  const topY = yBase - ch;

  ordered.forEach((el, i) => {
    const x = startX + i * step;
    const t = total ? (x - W / 2) / (total / 2) : 0;
    el.style.width = cw.toFixed(1) + 'px';
    el.style.height = ch.toFixed(1) + 'px';
    el.style.left = (x - cw / 2).toFixed(1) + 'px';
    el.style.top = topY.toFixed(1) + 'px';
    el.style.zIndex = String(i + 1);
    el.style.setProperty('--rot', (t * thetaMax).toFixed(2) + 'deg');
    el.style.setProperty('--dy', (t * t * dropMax).toFixed(2) + 'px');
  });
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
  pokerEnsureHandTools(container);

  const existing = new Map();
  Array.from(container.children).forEach(el => { if(el.classList.contains('capsa-card-img')) existing.set(el.dataset.key, el); });
  const keep = new Set();
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
      container.appendChild(el);
    }
    el._card = c;
    idx++;
  });
  existing.forEach((el, k) => { if(!keep.has(k)) el.remove(); });

  // urutan DOM mengikuti urutan kartu (z-order & aksesibilitas); posisi visual diatur pokerFanOverlap
  hand.forEach(c => { const el = existing.get(cardKey(c)) || container.querySelector('[data-key="' + cardKey(c) + '"]'); if(el) container.appendChild(el); });
  const zbtn = container.querySelector('.poker-hand-btn.zoom'); if(zbtn) container.appendChild(zbtn);

  pokerFanOverlap(container);
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
    statusEl.textContent = '🟡 Pemain terhubung: ' + onlineCount + '/4' + (myRole === 'p1' ? (onlineCount >= 2 ? ' — tekan Mulai kapan saja' : ' — butuh minimal 2 pemain') : ' — menunggu host memulai...');
  } else if(data.phase === 'playing'){
    if(!pokerPlayers(data).includes(myRole)) statusEl.textContent = '👀 Ronde berjalan — kamu ikut di ronde berikutnya.';
    else if(data.turn === myRole) statusEl.textContent = data.isFirstPlay ? '🟢 Giliranmu! Wajib jalan dengan 3♣ (3 Keriting).' : '🟢 Giliranmu!';
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
    el.textContent = data.lastPlay ? ('Pilih ' + data.lastPlay.combo.count + ' kartu yang lebih tinggi, atau Pass') : (data.isFirstPlay ? 'Mulai dengan kombinasi yang berisi 3♣' : 'Meja kosong — bebas pilih kombinasi');
    return;
  }

  const combo = detectCombo(sel);
  if(!combo.valid){
    el.className = 'capsa-preview bad';
    el.textContent = '❌ Bukan kombinasi valid (' + sel.length + ' kartu)';
    return;
  }

  let ok = true, why = '';
  if(data.isFirstPlay && !sel.some(c => c.rank === '03' && c.suit === 'c')){ ok = false; why = 'wajib ada 3♣'; }
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
// ======================================================
// RIWAYAT PUTARAN (dicatat di sisi klien dari perubahan state; tidak mengubah data game)
// ======================================================
let pokerHistory = [];
let pokerHistHand = null;
let pokerHistOpen = false;

function pokerHistEnsureUI(){
  const table = document.querySelector('#pokerScreen .capsa-table'); if(!table) return null;
  let btn = table.querySelector('.poker-hist-btn');
  if(!btn){
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'poker-hist-btn';
    btn.textContent = '\uD83D\uDCDC'; btn.title = 'Riwayat putaran';
    const panel = document.createElement('div'); panel.className = 'poker-hist-panel';
    table.appendChild(btn); table.appendChild(panel);
    btn.addEventListener('click', e => { e.stopPropagation(); pokerHistOpen = !pokerHistOpen; pokerHistRender(); });
    panel.addEventListener('click', () => { pokerHistOpen = false; pokerHistRender(); });
  }
  return { btn, panel: table.querySelector('.poker-hist-panel') };
}

function pokerHistRender(){
  const ui = pokerHistEnsureUI(); if(!ui) return;
  ui.btn.classList.toggle('on', pokerHistOpen);
  ui.panel.style.display = pokerHistOpen ? 'block' : 'none';
  if(!pokerHistOpen) return;

  const who = r => r === myRole ? 'Kamu' : displayName(r);
  const list = pokerHistory.slice(-40).reverse();   // terbaru di atas
  let html = '<div class="poker-hist-title"><span>\uD83D\uDCDC Riwayat putaran</span><span>ketuk untuk tutup</span></div>';
  if(!list.length) html += '<div class="ph-empty">Belum ada kartu yang dimainkan.</div>';
  list.forEach(h => {
    if(h.type === 'sep') html += '<div class="ph-sep">\u2014 PUTARAN BARU \u2014</div>';
    else if(h.type === 'pass') html += '<div class="ph-row' + (h.by === myRole ? ' me' : '') + '"><span class="ph-who">' + who(h.by) + '</span><span class="ph-pass">PASS</span></div>';
    else html += '<div class="ph-row' + (h.by === myRole ? ' me' : '') + '"><span class="ph-who">' + who(h.by) + '</span><span class="ph-cards">' +
      h.cards.map(c => '<img src="' + cardImg(c) + '" alt="' + c.rank + c.suit + '">').join('') + '</span><span class="ph-name">' + h.name + '</span></div>';
  });
  ui.panel.innerHTML = html;
}

function pokerHistPush(entry){
  pokerHistory.push(entry);
  if(pokerHistory.length > 80) pokerHistory.splice(0, pokerHistory.length - 80);
}

function pokerHistUpdate(data, first, playSig, passSig){
  if(pokerHistHand !== data.handNumber){ pokerHistory = []; pokerHistHand = data.handNumber; }
  const lp = data.lastPlay;
  const sameHand = data.handNumber === pokerPrev.hand;

  // pass (dicatat sebelum penanda putaran baru)
  if(!first && sameHand && data.lastActionText === 'pass' && passSig !== pokerPrev.passSig && pokerPrev.turn && pokerPrev.turn !== data.turn){
    pokerHistPush({ type: 'pass', by: pokerPrev.turn });
  }
  // kartu baru di meja
  if(lp && playSig !== pokerPrev.playSig){
    pokerHistPush({ type: 'play', by: lp.by, cards: ensureArray(lp.cards), name: comboDisplayName(lp.combo) });
  }
  // meja dikosongkan setelah semua pass -> putaran baru
  if(!first && sameHand && !lp && pokerPrev.hadLP && data.phase === 'playing'){
    pokerHistPush({ type: 'sep' });
  }
  pokerPrev.hadLP = !!lp;
  pokerHistRender();
}

function pokerDetectEvents(data, first){
  const finished = ensureArray(data.finished);
  const lp = data.lastPlay;
  const playSig = lp ? (data.handNumber + '|' + lp.by + '|' + ensureArray(lp.cards).map(cardKey).join(',')) : '';
  const passSig = data.handNumber + '|' + data.turn + '|' + (data.passCount || 0) + '|' + (data.lastActionText || '');

  pokerHistUpdate(data, first, playSig, passSig);

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

    if(data.bomb && data.bomb.seq !== pokerPrev.bombSeq){
      const tn = data.bomb.target === myRole ? 'Kamu' : displayName(data.bomb.target);
      if(data.bomb.type === 'dead'){ pokerToast('💀 ' + tn + ' MATI!', true); pokerSfx('bomb'); pokerTableShake(); }
      else { pokerToast('⛔ ' + tn + ' kena skip!', true); pokerBubble(data.bomb.target, 'SKIP'); }
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
  pokerPrev.bombSeq = data.bomb ? data.bomb.seq : 0;
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
  const inPlay = data.phase === 'waiting' ? ROLES : pokerPlayers(data);
  ROLES.forEach(role => {
    const pos = seatPosFor(role), el = posEls[pos];
    if(!inPlay.includes(role) && role !== myRole){
      if(pos !== 'bottom'){
        const on = !!pokerPresence[role];
        el.seat.style.opacity = '0.45';
        el.name.textContent = on ? (displayName(role) + ' 🟢 · menonton') : 'Kosong';
        pokerRenderBackHand(el.hand, 0);
      }
      el.seat.classList.remove('active-turn', 'capsa-seat-done');
      return;
    }
    if(pos !== 'bottom') el.seat.style.opacity = '';
    const count = (data.hands && data.hands[role]) ? ensureArray(data.hands[role]).length : 0;
    const online = !!pokerPresence[role], isDead = ensureArray(data.dead).includes(role), isFinished = finished.includes(role) || isDead;
    el.seat.classList.toggle('active-turn', data.turn === role && data.phase === 'playing');
    el.seat.classList.toggle('capsa-seat-done', isFinished);
    if(pos !== 'bottom'){
      const rank = finished.indexOf(role);
      const rankTag = rank === 0 ? ' 🥇' : rank === 1 ? ' 🥈' : rank === 2 ? ' 🥉' : '';
      el.name.textContent = displayName(role) + (online ? ' 🟢' : ' 🔴') + rankTag + (isDead ? ' 💀' : '') + ' · ' + count + ' kartu';
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
    ensureArray(data.dead).slice().reverse().forEach(r => { html += '<br>💀 Mati kena Seri 5: ' + displayName(r) + (r === myRole ? ' (Kamu)' : ''); });
    if(data.loser) html += '<br>💀 Buncit: ' + displayName(data.loser) + (data.loser === myRole ? ' (Kamu)' : '');
    resultEl.innerHTML = html; resultEl.style.display = 'block';
    nextBtn.style.display = 'block'; nextBtn.textContent = myRole === 'p1' ? '▶ Main Lagi' : '⏳ Menunggu host mulai lagi';
    nextBtn.disabled = myRole !== 'p1';
  } else if(data.phase === 'waiting'){
    const n = ROLES.filter(r => pokerPresence[r]).length;
    resultEl.style.display = 'none';
    nextBtn.style.display = 'block';
    nextBtn.textContent = myRole === 'p1' ? ('▶ Mulai (' + n + ' pemain)') : '⏳ Menunggu host memulai';
    nextBtn.disabled = myRole !== 'p1' || n < 2;
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
  // Semua kartu keluar SEKALIGUS dari tengah meja ke keempat pemain (tanpa jeda satu-satu)
  const dealTargets = ['bottom', 'right', 'top', 'left'], cardsPerPlayer = 6;
  dealTargets.forEach(dir => {
    for(let c = 0; c < cardsPerPlayer; c++){
      const img = document.createElement('img');
      img.src = CARD_BACK_IMG; img.className = 'capsa-deal-card deal-' + dir;
      const spread = (c - (cardsPerPlayer - 1) / 2);
      img.style.setProperty('--ox', (spread * 14) + 'px');
      img.style.setProperty('--oy', (spread * 11) + 'px');
      img.style.setProperty('--rot', (spread * 6) + 'deg');
      overlay.appendChild(img);
    }
  });
  pokerSfx('dealall');
  setTimeout(() => { overlay.remove(); done(); }, 720);
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
      if(ROLES.every(s => pokerPresence[s])) pokerRef.transaction(cur => (cur && cur.phase === 'waiting') ? pokerBuildNewGame(cur, pokerPresence) : cur);
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
      passCount: 0, finished: [], dead: [], bomb: null, bombSeq: 0, loser: null, winner: null, lastActionText: null, handNumber: 0, names: {}
    });
  }

  pokerAttachPresence(); pokerAttachNames();

  pokerRef.on('value', snap => { const data = snap.val(); if(data) pokerRender(data); });

  document.getElementById('capsaBtnPass').onclick = () => { pokerGetAudio(); pokerDoPass(); };
  document.getElementById('capsaBtnPlay').onclick = () => { pokerGetAudio(); pokerDoPlay(); };
  document.getElementById('capsaBtnNext').onclick = () => {
    if(myRole !== 'p1') return;
    if(ROLES.filter(r => pokerPresence[r]).length < 2){ showCustomAlert('Butuh minimal 2 pemain untuk mulai.'); return; }
    pokerRef.transaction(cur => (cur && (cur.phase === 'roundover' || cur.phase === 'waiting')) ? pokerBuildNewGame(cur, pokerPresence) : cur);
  };

  const editBtn = document.getElementById('capsaBtnEditName'); if(editBtn) editBtn.onclick = () => pokerOpenNameEditor();
  const cancelBtn = document.getElementById('capsaNameCancel'); if(cancelBtn) cancelBtn.onclick = () => pokerCloseNameEditor();
  const saveBtn = document.getElementById('capsaNameSave'); if(saveBtn) saveBtn.onclick = () => pokerSaveName();
  const nameInput = document.getElementById('capsaNameInput'); if(nameInput) nameInput.addEventListener('keydown', e => { if(e.key === 'Enter') pokerSaveName(); });

  // hitung ulang kipas kartu kalau layar berubah ukuran / diputar
  window.addEventListener('resize', () => { if(latestPokerData) pokerFanOverlap(document.getElementById('capsaHandMe')); });
}
