// ======================================================
// Uno.js — Uno Battle Arena (Upgrade: Diff Render + FX + Sound)
// Membutuhkan shared.js sudah dimuat lebih dulu
// Perbaikan: kartu tidak dirender ulang tiap update, tombol UNO/DOR
// tidak kedip lagi, ada efek, suara, dan highlight kartu yang bisa dibuang
// ======================================================

let unoRef = null;
let latestUnoData = null;
let unoPresence = {};
let selectedUnoKeys = new Set();
let unoNames = {};
let unoTimerCheck = null;

let unoLastAnimatedHand = null;
let unoHasRenderedOnce = false;

let unoPrev = { init: false, topKey: null, counts: {}, turn: null, phase: null, challengeStart: null, text: null, finished: 0, handNumber: null, drawStack: 0 };
let unoAudio = null;
let unoClearing = false;
let unoOppEls = {};
let unoOppKey = '';

const UNO_BASE_URL = "https://unocardinfo.victorhomedia.com/graphics/uno_card-";
const UNO_COLOR_EN = { merah: 'red', kuning: 'yellow', hijau: 'green', biru: 'blue' };
const UNO_COLOR_HEX = { merah: '#e4574f', kuning: '#e8ac1f', hijau: '#2bb673', biru: '#3d6bf0', wild: '#a855f7' };
const UNO_COLOR_EMOJI = { merah: '🟥', kuning: '🟨', hijau: '🟩', biru: '🟦', wild: '🌈' };
const UNO_CARD_URLS = {};
Object.keys(UNO_COLOR_EN).forEach(c => {
  ['0','1','2','3','4','5','6','7','8','9','draw2','reverse','skip'].forEach(v => {
    UNO_CARD_URLS[c + '_' + v] = UNO_BASE_URL + UNO_COLOR_EN[c] + v + '.png';
  });
});
UNO_CARD_URLS.wild_wild = UNO_BASE_URL + 'wildchange.png';
UNO_CARD_URLS.wild_draw4 = UNO_BASE_URL + 'wilddraw4.png';
UNO_CARD_URLS.back = UNO_BASE_URL + 'back.png';

// ======================================================
// CSS (diinjeksi, menimpa style lama di index.html)
// ======================================================
const unoStyleEl = document.createElement('style');
unoStyleEl.innerHTML = `
  #unoScreen .g-status { white-space: pre-line; line-height: 1.45; }
  #unoScreen .capsa-table { position: relative; }
  #unoScreen .capsa-seat { position: relative; }
  #unoScreen .capsa-seat.active-turn { animation: unoTurnGlow 1.4s ease-in-out infinite; }
  #unoScreen .capsa-seat.seat-done { opacity: .55; }
  @keyframes unoTurnGlow {
    0%, 100% { box-shadow: 0 0 0 2px var(--gold) inset, 0 0 8px rgba(232,172,31,.2); }
    50%      { box-shadow: 0 0 0 2px var(--gold) inset, 0 0 20px rgba(232,172,31,.6); }
  }
  #unoScreen .capsa-card-back-count.bump { animation: unoBump .5s cubic-bezier(.2,1.5,.4,1); }
  @keyframes unoBump { 0% { transform: scale(1); } 40% { transform: scale(1.55); } 100% { transform: scale(1); } }

  /* Kartu meja */
  #unoTopCardImg {
    border-radius: 10px;
    box-shadow: 0 0 0 3px var(--uc, transparent), 0 0 22px var(--uc, transparent), 0 8px 18px rgba(0,0,0,.55);
    transition: box-shadow .35s ease;
  }
  #unoTopCardImg.pop { animation: unoTopPop .45s cubic-bezier(.2,1.4,.4,1); }
  @keyframes unoTopPop {
    0%   { transform: translateY(-70px) scale(1.55) rotate(-18deg); opacity: .15; }
    60%  { transform: translateY(0) scale(.95) rotate(3deg); opacity: 1; }
    100% { transform: none; }
  }

  /* Meta bar (arah, warna, stacking) */
  #unoScreen .uno-meta { display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  #unoScreen .uno-pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--panel-3); border: 1px solid var(--line); color: var(--ink); white-space: nowrap; }
  #unoScreen .uno-pill.stack { background: var(--red); border-color: transparent; color: #fff; animation: unoPulse .9s ease-in-out infinite alternate; }
  @keyframes unoPulse { from { transform: scale(1); } to { transform: scale(1.12); } }
  #unoDir { display: inline-block; }

  /* Kartu di tangan */
  #unoHandMe { gap: 6px; }
  #unoHandMe .capsa-card-img {
    position: relative; -webkit-tap-highlight-color: transparent; -webkit-user-drag: none;
    transition: transform .16s cubic-bezier(.34,1.56,.64,1), box-shadow .16s ease, opacity .2s ease, filter .2s ease;
  }
  #unoHandMe[data-dense="1"] .capsa-card-img { width: 46px; height: 66px; }
  #unoHandMe .capsa-card-img.enter { animation: unoCardIn .4s cubic-bezier(.2,.9,.3,1.2) backwards; }
  @keyframes unoCardIn {
    from { transform: translateY(-46px) scale(.55) rotate(-10deg); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }
  #unoHandMe .capsa-card-img.myturn.playable { box-shadow: 0 0 0 2px rgba(43,182,115,.75), 0 4px 10px rgba(0,0,0,.5); cursor: pointer; }
  #unoHandMe .capsa-card-img.dim { opacity: .42; filter: saturate(.55) brightness(.8); }
  #unoHandMe .capsa-card-img.selected,
  #unoHandMe .capsa-card-img.myturn.playable.selected { transform: translateY(-16px) scale(1.05); box-shadow: 0 0 0 3px var(--gold), 0 12px 22px rgba(0,0,0,.7); }
  #unoHandMe .capsa-card-img.shake { animation: unoShake .3s ease; }
  @keyframes unoShake { 0%,100% { translate: 0 0; } 25% { translate: -5px 0; } 75% { translate: 5px 0; } }
  @media (hover: hover) {
    #unoHandMe .capsa-card-img.playable:not(.selected):hover { transform: translateY(-6px); }
  }

  /* Toast di tengah meja */
  .uno-toast {
    position: absolute; left: 50%; top: 46%; z-index: 40; pointer-events: none; white-space: nowrap;
    font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 800; color: #fff;
    text-shadow: 0 3px 12px rgba(0,0,0,.85), 0 0 18px rgba(0,0,0,.6);
    animation: unoToast 1.05s ease-out forwards;
  }
  @keyframes unoToast {
    0%   { transform: translate(-50%, -30%) scale(.4); opacity: 0; }
    20%  { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
    70%  { transform: translate(-50%, -55%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -110%) scale(1); opacity: 0; }
  }

  /* Bubble penalti / pass di kursi (seperti PASS di Poker) */
  .uno-bubble {
    position: absolute; left: 50%; top: -10px; z-index: 45; pointer-events: none; white-space: nowrap;
    font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 800; color: #fff;
    background: var(--red, #e4574f); padding: 4px 14px; border-radius: 20px;
    box-shadow: 0 4px 14px rgba(0,0,0,.55); animation: unoBubble 1.5s ease-out forwards;
  }
  .uno-bubble.take { background: var(--gold, #e8ac1f); color: #1a1a1a; }
  .uno-bubble.pass { background: var(--blue, #3d6bf0); font-size: 13px; }
  @keyframes unoBubble {
    0%   { transform: translate(-50%, 10px) scale(.5); opacity: 0; }
    18%  { transform: translate(-50%, -4px) scale(1.18); opacity: 1; }
    70%  { transform: translate(-50%, -10px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -26px) scale(1); opacity: 0; }
  }

  /* Preview gabungan kartu */
  .uno-preview {
    margin-top: 10px; padding: 9px 12px; border-radius: 12px; text-align: center; font-size: 13px; font-weight: 700; line-height: 1.4;
    background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.12); color: var(--ink-dim, #aab);
  }
  .uno-preview.ok  { color: var(--green, #2bb673); border-color: rgba(43,182,115,.5); }
  .uno-preview.bad { color: var(--red, #e4574f);   border-color: rgba(228,87,79,.5); }
  .uno-preview .up-sub { display: block; font-size: 11px; font-weight: 600; opacity: .85; }

  /* Confetti */
  .uno-confetti-box { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 35; border-radius: 18px; }
  .uno-confetti-box i { position: absolute; top: -14px; width: 8px; height: 13px; border-radius: 2px; animation: unoConfetti linear forwards; }
  @keyframes unoConfetti {
    0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--dx), 440px) rotate(var(--rot)); opacity: .9; }
  }

  /* Tombol UNO / DOR */
  #unoChallengeBox .uno-chal-btn { animation: unoPulse .55s ease-in-out infinite alternate; }

  @media (prefers-reduced-motion: reduce) {
    #unoScreen *, #unoScreen *::after, .uno-toast, .uno-bubble, .uno-confetti-box i { animation-duration: .01ms !important; animation-delay: 0s !important; }
  }
`;
document.head.appendChild(unoStyleEl);

// ======================================================
// SOUND
// ======================================================
function unoGetAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!unoAudio) unoAudio = new AC();
    if (unoAudio.state === 'suspended') unoAudio.resume();
    return unoAudio;
  } catch (e) { return null; }
}
function unoTone(f, at, dur, type, vol, f2) {
  const a = unoGetAudio(); if (!a) return;
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
function unoSfx(kind) {
  try {
    if (kind === 'tick') unoTone(620, 0, .05, 'sine', .1);
    else if (kind === 'bad') unoTone(180, 0, .14, 'square', .08, 110);
    else if (kind === 'play') { unoTone(300, 0, .09, 'triangle', .2, 150); unoTone(520, .04, .06, 'sine', .08); }
    else if (kind === 'special') [330, 440, 587].forEach((f, i) => unoTone(f, i * .07, .12, 'sawtooth', .09));
    else if (kind === 'draw') { unoTone(240, 0, .08, 'triangle', .14, 400); unoTone(260, .09, .08, 'triangle', .14, 420); }
    else if (kind === 'turn') { unoTone(660, 0, .1, 'sine', .12); unoTone(880, .1, .12, 'sine', .12); }
    else if (kind === 'uno') [784, 988, 1175].forEach((f, i) => unoTone(f, i * .08, .14, 'square', .08));
    else if (kind === 'dor') { unoTone(900, 0, .08, 'square', .12, 200); unoTone(120, .06, .25, 'triangle', .25, 40); }
    else if (kind === 'finish') [523, 659, 784].forEach((f, i) => unoTone(f, i * .08, .15, 'sine', .14));
    else if (kind === 'win') [523, 659, 784, 1047, 1319].forEach((f, i) => unoTone(f, i * .09, .2, 'sine', .15));
    else if (kind === 'lose') [392, 330, 262].forEach((f, i) => unoTone(f, i * .13, .24, 'triangle', .15));
  } catch (e) {}
}

// ======================================================
// Util
// ======================================================
// Konversi Firebase Object jadi Array biar ga nge-stuck
function ensureArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

function getUnoCardImgUrl(card) {
  if (!card) return UNO_CARD_URLS.back;
  const key = card.color === 'wild' ? `wild_${card.value}` : `${card.color}_${card.value}`;
  return UNO_CARD_URLS[key] || UNO_CARD_URLS.back;
}

function unoName(role) { return (unoNames && unoNames[role]) || role.toUpperCase(); }

function createUnoDeck(startId = 1) {
  const colors = ["merah", "kuning", "hijau", "biru"];
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"];
  let deck = [], idCounter = startId;
  colors.forEach(color => values.forEach(value => {
    deck.push({ id: idCounter++, color, value });
    if (value !== "0") deck.push({ id: idCounter++, color, value });
  }));
  for (let i = 0; i < 4; i++) {
    deck.push({ id: idCounter++, color: "wild", value: "wild" });
    deck.push({ id: idCounter++, color: "wild", value: "draw4" });
  }
  // Fisher-Yates (lebih adil daripada sort random)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function unoShuffle(arr) {
  const d = arr.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// Id kosong berikutnya (dipakai kalau semua kartu ada di tangan & tumpukan buangan kosong)
function unoNextFreeId(game) {
  let max = 0;
  const seen = c => { if (c && typeof c.id === 'number' && c.id > max) max = c.id; };
  ensureArray(game.deck).forEach(seen);
  ensureArray(game.discard).forEach(seen);
  seen(game.currentCard);
  Object.values(game.hands || {}).forEach(h => ensureArray(h).forEach(seen));
  return max + 1;
}

// Kartu yang sudah dimainkan masuk tumpukan buangan (warna pilihan Wild dibuang)
function unoPushDiscard(game, cards) {
  const list = ensureArray(game.discard);
  (Array.isArray(cards) ? cards : [cards]).forEach(c => {
    if (!c) return;
    const clean = { id: c.id, color: c.color, value: c.value };
    list.push(clean);
  });
  game.discard = list;
}

function drawUnoCards(game, count) {
  let drawn = [];
  game.deck = ensureArray(game.deck);
  game.discard = ensureArray(game.discard);
  for (let i = 0; i < count; i++) {
    if (game.deck.length === 0) {
      if (game.discard.length > 0) {
        // kocok ulang tumpukan buangan (kartu meja teratas tetap di meja)
        game.deck = unoShuffle(game.discard);
        game.discard = [];
      } else {
        // semua kartu ada di tangan pemain: tambah dek baru dengan id yang belum dipakai
        game.deck = createUnoDeck(unoNextFreeId(game));
      }
    }
    drawn.push(game.deck.pop());
  }
  return drawn;
}

function getUnoRoles(maxPlayers) { return ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].slice(0, maxPlayers); }

// Maju `jump` langkah, hanya menghitung pemain yang BELUM selesai
// (jadi Skip benar-benar melewati pemain aktif berikutnya).
function nextUnoTurn(game, jump = 1) {
  const roles = getUnoRoles(game.maxPlayers), total = roles.length;
  const finished = ensureArray(game.finished);
  const dir = game.direction === -1 ? -1 : 1;
  let idx = roles.indexOf(game.turn);
  for (let s = 0; s < Math.max(1, jump); s++) {
    let guard = 0;
    do { idx = (idx + dir + total) % total; guard++; }
    while (finished.includes(roles[idx]) && guard <= total);
  }
  return roles[idx];
}

// Reverse berlaku seperti Skip kalau pemain yang masih main tinggal 2 (termasuk si pemain)
function unoReverseActsAsSkip(game, who) {
  const alive = getUnoRoles(game.maxPlayers).filter(r => !ensureArray(game.finished).includes(r));
  return alive.length === 2 && alive.includes(who);
}

function buildNewUnoGame(maxPlayers, prev) {
  const activeRoles = getUnoRoles(maxPlayers);
  let deck = createUnoDeck(), hands = {};
  activeRoles.forEach(r => { hands[r] = deck.splice(0, 7); });
  let firstCard = deck.pop();
  while (firstCard.color === 'wild') { deck.unshift(firstCard); firstCard = deck.pop(); }

  return {
    phase: 'playing', maxPlayers, deck, hands, turn: 'p1', direction: 1, currentCard: firstCard,
    drawStack: 0, hasDrawn: false, unoChallenge: null, finished: [], discard: [], lastActionText: 'Ronde Baru Dimulai!',
    handNumber: ((prev && prev.handNumber) || 0) + 1, names: (prev && prev.names) || {}
  };
}

function unoIsPlayable(card, data) {
  const cur = data && data.currentCard;
  if (!cur) return false;
  const curCol = cur.chosenColor || cur.color;
  if (data.drawStack > 0) return card.value === cur.value || card.value === 'draw4';
  return card.color === 'wild' || card.color === curCol || String(card.value) === String(cur.value);
}

// Kartu boleh dipilih kalau cocok sendiri, ATAU ada kartu lain dengan angka/fitur
// yang sama di tangan yang cocok (supaya bisa digabung: 3 merah + 3 kuning di atas merah)
function unoIsComboPlayable(card, data, hand) {
  if (unoIsPlayable(card, data)) return true;
  return ensureArray(hand).some(c => c.id !== card.id && String(c.value) === String(card.value) && unoIsPlayable(c, data));
}

function unoSortHand(hand) {
  const co = { merah: 0, kuning: 1, hijau: 2, biru: 3, wild: 4 };
  const sp = { skip: 10, reverse: 11, draw2: 12, wild: 13, draw4: 14 };
  const vo = v => /^\d+$/.test(String(v)) ? +v : (sp[v] || 15);
  return hand.slice().sort((a, b) => ((co[a.color] || 0) - (co[b.color] || 0)) || (vo(a.value) - vo(b.value)) || (a.id - b.id));
}

// ======================================================
// AKSI PEMAIN
// ======================================================
function unoDoPlay(chosenColor = null) {
  const data = latestUnoData;
  if (!data || data.phase !== 'playing' || data.turn !== myRole) return;

  const hand = ensureArray(data.hands && data.hands[myRole]);
  // urutan = urutan ketukan pemain; kartu terakhir yang diketuk jadi kartu meja
  const selected = Array.from(selectedUnoKeys).map(id => hand.find(c => c.id === id)).filter(Boolean);

  if (selected.length === 0) { unoSfx('bad'); return showCustomAlert('Pilih kartu yang ingin dibuang!'); }
  if (selected.length > 1 && !selected.every(c => String(c.value) === String(selected[0].value))) { unoSfx('bad'); return showCustomAlert('Multi-run harus kartu dengan nilai/fitur yang sama!'); }

  // Cukup SATU kartu yang cocok dengan meja; sisanya ikut karena angkanya sama
  if (!selected.some(c => unoIsPlayable(c, data))) {
    unoSfx('bad');
    if (data.drawStack > 0) return showCustomAlert(`Sedang ada Stacking +${data.drawStack}! Kamu harus membalas kartu penalti atau ambil kartu.`);
    return showCustomAlert('Kartu tidak cocok dengan kartu meja!');
  }
  const lastSel = selected[selected.length - 1];
  if (lastSel.color === 'wild' && !chosenColor) { document.getElementById('unoColorPickerOverlay').style.display = 'flex'; return; }

  const pickedIds = selected.map(c => c.id);
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    let curHand = ensureArray(state.hands[myRole]);

    // ---- Validasi di sisi data (jangan percaya client) ----
    if (new Set(pickedIds).size !== pickedIds.length) return cur;
    const picked = [];
    for (const id of pickedIds) {
      const found = curHand.find(c => c.id === id);
      if (!found) return cur;                       // kartu tidak ada di tangan
      picked.push(found);                           // pakai data kartu asli dari server
    }
    if (picked.length === 0) return cur;
    if (!picked.every(c => String(c.value) === String(picked[0].value))) return cur;
    if (!picked.some(c => unoIsPlayable(c, state))) return cur;   // minimal satu cocok dengan meja
    const topPicked = picked[picked.length - 1];
    if (topPicked.color === 'wild' && !Object.keys(UNO_COLOR_EN).includes(chosenColor)) return cur;

    curHand = curHand.filter(c => !pickedIds.includes(c.id));

    let jump = 1;
    picked.forEach(card => {
      if (card.value === 'skip') jump++;
      else if (card.value === 'reverse') { if (unoReverseActsAsSkip(state, myRole)) jump++; else state.direction *= -1; }
      else if (card.value === 'draw2') state.drawStack += 2;
      else if (card.value === 'draw4') state.drawStack += 4;
    });

    // kartu meja lama + kartu gabungan (selain yang teratas) masuk tumpukan buangan
    unoPushDiscard(state, [state.currentCard, ...picked.slice(0, -1)]);

    let lastCardPlayed = { ...topPicked };
    if (lastCardPlayed.color === 'wild') lastCardPlayed.chosenColor = chosenColor;

    state.currentCard = lastCardPlayed; state.hands[myRole] = curHand; state.hasDrawn = false;

    if (curHand.length === 1 || curHand.length === 0) {
      const mode = curHand.length === 1 ? 'UNO' : 'UNO GAME';
      state.unoChallenge = { target: myRole, type: mode, startTime: Date.now(), shouted: false };
      state.lastActionText = `📢 ${unoName(myRole)} sisa ${curHand.length} kartu! Pemicu TERIAK ${mode} aktif!`;
    } else {
      state.unoChallenge = null;
    }

    const finished = ensureArray(state.finished);
    if (curHand.length === 0 && !finished.includes(myRole)) {
      finished.push(myRole); state.finished = finished;
      if (finished.length >= getUnoRoles(state.maxPlayers).length - 1) { state.phase = 'roundover'; return state; }
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
      state.hands[myRole] = [...ensureArray(state.hands[myRole]), ...drawn];
      state.drawStack = 0; state.hasDrawn = false; state.turn = nextUnoTurn(state, 1);
      state.lastActionText = `📥 ${unoName(myRole)} mengambil penalti +${drawn.length} kartu.`;
      return state;
    }

    if (!state.hasDrawn) {
      const drawn = drawUnoCards(state, 1);
      state.hands[myRole] = [...ensureArray(state.hands[myRole]), ...drawn];
      state.hasDrawn = true; state.lastActionText = `📥 ${unoName(myRole)} mengambil 1 kartu.`;
    }
    return state;
  });
}

function unoDoPass() {
  unoRef.transaction(cur => {
    if (!cur || cur.phase !== 'playing' || cur.turn !== myRole || !cur.hasDrawn) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    state.hasDrawn = false; state.turn = nextUnoTurn(state, 1);
    state.lastActionText = `⏭️ ${unoName(myRole)} memilih Pass.`;
    return state;
  }, () => { selectedUnoKeys.clear(); });
}

function unoShout() {
  unoRef.transaction(cur => {
    if (!cur || !cur.unoChallenge || cur.unoChallenge.target !== myRole) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    state.unoChallenge.shouted = true;
    state.lastActionText = `🎉 ${unoName(myRole)} berhasil Teriak "${state.unoChallenge.type === 'UNO GAME' ? 'UNO GAME!' : 'UNO!'}"`;
    return state;
  });
}

function unoCatch() {
  unoRef.transaction(cur => {
    if (!cur || !cur.unoChallenge || cur.unoChallenge.target === myRole || cur.unoChallenge.shouted) return cur;
    const state = JSON.parse(JSON.stringify(cur));
    const target = state.unoChallenge.target;
    const drawn = drawUnoCards(state, 2);
    state.hands[target] = [...ensureArray(state.hands[target]), ...drawn];

    let finished = ensureArray(state.finished);
    if (finished.includes(target)) {
      finished = finished.filter(r => r !== target);
      state.finished = finished;
      if (state.phase === 'roundover') state.phase = 'playing';
    }

    state.lastActionText = `💥 ${unoName(myRole)} teriak "DOR!" ${unoName(target)} Lupa Teriak ${state.unoChallenge.type || 'UNO'}! (Penalti +2 kartu)`;
    state.unoChallenge = null;
    return state;
  });
}

// ======================================================
// EFEK VISUAL
// ======================================================
function unoToast(text, color) {
  const table = document.querySelector('#unoScreen .capsa-table'); if (!table) return;
  const t = document.createElement('div');
  t.className = 'uno-toast'; t.textContent = text;
  if (color) t.style.color = color;
  table.appendChild(t);
  setTimeout(() => t.remove(), 1150);
}

// Bubble di atas kursi pemain (kursiku = kotak bawah). kind: '' (penalti) | 'take' | 'pass'
function unoBubble(role, text, kind) {
  const seat = role === myRole
    ? document.querySelector('#unoScreen .capsa-bottom')
    : (unoOppEls[role] && unoOppEls[role].seat);
  if (!seat) return;
  const b = document.createElement('div');
  b.className = 'uno-bubble' + (kind ? ' ' + kind : ''); b.textContent = text;
  seat.appendChild(b);
  setTimeout(() => b.remove(), 1500);
}

function unoConfetti() {
  const table = document.querySelector('#unoScreen .capsa-table'); if (!table) return;
  const colors = ['#e8ac1f', '#3d6bf0', '#2bb673', '#e4574f', '#ffffff', '#a855f7'];
  const box = document.createElement('div'); box.className = 'uno-confetti-box';
  for (let i = 0; i < 48; i++) {
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

function unoShake(el) {
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true });
}

// ======================================================
// RENDER TANGAN (diff — kartu yang sama tidak disentuh)
// ======================================================
function unoPaintHand(data) {
  const els = Array.from(document.querySelectorAll('#unoHandMe .capsa-card-img'));
  const hand = els.map(e => e._card);
  const canPlay = !!data && data.phase === 'playing' && data.turn === myRole;
  let selVal = null;
  els.forEach(el => { if (selVal === null && selectedUnoKeys.has(el._card.id)) selVal = el._card.value; });
  els.forEach(el => {
    const c = el._card;
    const ok = canPlay && (unoIsComboPlayable(c, data, hand) || (selVal !== null && c.value === selVal));
    el.classList.toggle('selected', selectedUnoKeys.has(c.id));
    el.classList.toggle('myturn', canPlay);
    el.classList.toggle('playable', ok);
    el.classList.toggle('dim', canPlay && !ok);
  });
  const playBtn = document.getElementById('unoBtnPlay');
  if (playBtn) playBtn.disabled = selectedUnoKeys.size === 0;
  unoUpdatePreview(data);
}

function unoEnsurePreview() {
  let el = document.getElementById('unoPreview');
  if (!el) {
    el = document.createElement('div');
    el.id = 'unoPreview'; el.className = 'uno-preview'; el.style.display = 'none';
    const act = document.getElementById('unoActions');
    if (act && act.parentNode) act.parentNode.insertBefore(el, act);
  }
  return el;
}

const UNO_VALUE_LABEL = { skip: '🚫 Skip', reverse: '🔄 Balik', draw2: '+2', draw4: '+4', wild: '🌈 Wild' };
function unoCardLabel(c) {
  const v = UNO_VALUE_LABEL[c.value] || String(c.value);
  return (c.color === 'wild' ? '' : (UNO_COLOR_EMOJI[c.color] || '')) + ' ' + v;
}

// Pratinjau hasil: kartu yang dipilih (urutan ketukan) -> kartu meja & efeknya
function unoUpdatePreview(data) {
  const el = unoEnsurePreview();
  const hand = ensureArray(data && data.hands && data.hands[myRole]);
  const sel = Array.from(selectedUnoKeys).map(id => hand.find(c => c.id === id)).filter(Boolean);
  const canPlay = !!data && data.phase === 'playing' && data.turn === myRole;
  if (!canPlay || sel.length === 0) { el.style.display = 'none'; return; }

  const sameValue = sel.every(c => String(c.value) === String(sel[0].value));
  const anyOk = sel.some(c => unoIsPlayable(c, data));
  el.style.display = 'block';

  if (!sameValue) { el.className = 'uno-preview bad'; el.textContent = '❌ Kartu gabungan harus angka/fitur yang sama'; return; }
  if (!anyOk) {
    el.className = 'uno-preview bad';
    el.textContent = data.drawStack > 0 ? `❌ Ada stacking +${data.drawStack}, balas dengan kartu penalti` : '❌ Tidak ada kartu yang cocok dengan meja';
    return;
  }

  const last = sel[sel.length - 1];
  let add = 0;
  sel.forEach(c => { if (c.value === 'draw2') add += 2; else if (c.value === 'draw4') add += 4; });
  const stack = (data.drawStack || 0) + add;
  const lastTxt = last.color === 'wild' ? `${unoCardLabel(last)} (pilih warna saat buang)` : unoCardLabel(last);

  let sub = '';
  if (stack > 0) sub = `Penalti jadi +${stack} untuk lawan`;
  else if (sel.some(c => c.value === 'skip')) sub = `Giliran lawan dilewati ×${sel.filter(c => c.value === 'skip').length}`;

  el.className = 'uno-preview ok';
  el.innerHTML = (sel.length > 1
    ? `✅ ${sel.length} kartu → kartu meja jadi ${lastTxt}<span class="up-sub">Kartu terakhir yang kamu ketuk jadi warna meja${sub ? ' · ' + sub : ''}</span>`
    : `✅ Kartu meja jadi ${lastTxt}${sub ? `<span class="up-sub">${sub}</span>` : ''}`);
}

function unoToggleCard(el) {
  const d = latestUnoData;
  if (!d || d.phase !== 'playing' || d.turn !== myRole) return;
  unoGetAudio();
  const card = el._card;
  if (selectedUnoKeys.has(card.id)) { selectedUnoKeys.delete(card.id); unoSfx('tick'); unoPaintHand(d); return; }
  if (!el.classList.contains('playable')) { unoShake(el); unoSfx('bad'); return; }
  const selCard = Array.from(document.querySelectorAll('#unoHandMe .capsa-card-img')).map(e => e._card).find(c => selectedUnoKeys.has(c.id));
  if (selCard && selCard.value !== card.value) selectedUnoKeys.clear();
  selectedUnoKeys.add(card.id);
  unoSfx('tick');
  unoPaintHand(d);
}

function unoSyncHand(container, hand, data, animateNew) {
  const sorted = unoSortHand(hand);
  const existing = new Map();
  Array.from(container.children).forEach(el => existing.set(el.dataset.id, el));
  const keep = new Set();
  let ref = container.firstChild;
  let newIdx = 0;

  sorted.forEach(card => {
    const id = String(card.id); keep.add(id);
    let el = existing.get(id);
    if (!el) {
      el = document.createElement('img');
      el.dataset.id = id; el.draggable = false; el.alt = card.color + ' ' + card.value;
      el.src = getUnoCardImgUrl(card);
      el.className = 'capsa-card-img';
      if (animateNew) {
        el.classList.add('enter');
        el.style.animationDelay = (newIdx * 35) + 'ms';
        el.addEventListener('animationend', () => { el.classList.remove('enter'); el.style.animationDelay = ''; }, { once: true });
      }
      newIdx++;
      el.addEventListener('click', () => unoToggleCard(el));
    }
    el._card = card;
    if (el === ref) ref = ref.nextSibling; else container.insertBefore(el, ref);
  });
  existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });
  container.dataset.dense = sorted.length > 10 ? '1' : '0';
  unoPaintHand(data);
}

// ======================================================
// RENDER LAWAN (dibangun sekali, setelah itu update di tempat)
// ======================================================
function unoRenderOpponents(data, activeRoles) {
  const wrap = document.getElementById('unoOpponentsWrap');
  const roles = activeRoles.filter(r => r !== myRole);
  const key = roles.join(',');
  if (key !== unoOppKey) {
    wrap.innerHTML = ''; unoOppEls = {}; unoOppKey = key;
    roles.forEach(role => {
      const div = document.createElement('div');
      div.className = 'capsa-seat';
      div.innerHTML = `
        <div class="capsa-seat-info"></div>
        <div class="capsa-card-back-wrap">
          <img class="capsa-card-back" src="${UNO_CARD_URLS.back}" alt="kartu lawan">
          <span class="capsa-card-back-count">0</span>
        </div>`;
      wrap.appendChild(div);
      unoOppEls[role] = { seat: div, info: div.querySelector('.capsa-seat-info'), count: div.querySelector('.capsa-card-back-count') };
    });
  }
  const finished = ensureArray(data.finished);
  const medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅'];
  roles.forEach(role => {
    const o = unoOppEls[role]; if (!o) return;
    const cnt = data.hands && data.hands[role] ? ensureArray(data.hands[role]).length : 0;
    const isTurn = data.turn === role && data.phase === 'playing';
    const fi = finished.indexOf(role);
    o.info.textContent = unoName(role) + ' ' + (unoPresence[role] ? '🟢' : '🔴') + (fi >= 0 ? ' ' + medals[fi] : '');
    o.seat.classList.toggle('active-turn', isTurn);
    o.seat.classList.toggle('seat-done', fi >= 0);
    if (o.count.textContent !== String(cnt)) {
      o.count.textContent = cnt;
      if (unoPrev.init) { o.count.classList.remove('bump'); void o.count.offsetWidth; o.count.classList.add('bump'); }
    }
  });
}

function unoEnsureMeta() {
  let meta = document.getElementById('unoMeta');
  if (!meta) {
    const topImg = document.getElementById('unoTopCardImg');
    meta = document.createElement('div');
    meta.id = 'unoMeta'; meta.className = 'uno-meta';
    meta.innerHTML = '<span class="uno-pill" id="unoDirPill"><span id="unoDir">⟳</span> <span id="unoDirTxt">Searah</span></span><span class="uno-pill" id="unoColorPill"></span><span class="uno-pill stack" id="unoStackPill" style="display:none"></span>';
    topImg.parentNode.appendChild(meta);
  }
  return meta;
}

function unoEnsureChallengeBox() {
  let box = document.getElementById('unoChallengeBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'unoChallengeBox';
    box.style.cssText = 'margin-top:10px; display:flex; justify-content:center; gap:10px;';
    const actEl = document.getElementById('unoActions');
    if (actEl && actEl.parentNode) actEl.parentNode.insertBefore(box, actEl);

    const shout = document.createElement('button');
    shout.id = 'unoShoutBtn'; shout.className = 'capsa-act play uno-chal-btn';
    shout.style.cssText = 'background:#e4574f; color:#fff; width:100%; display:none;';
    shout.onclick = () => unoShout();

    const catchB = document.createElement('button');
    catchB.id = 'unoCatchBtn'; catchB.className = 'capsa-act play uno-chal-btn';
    catchB.style.cssText = 'background:#e8ac1f; color:#000; width:100%; display:none;';
    catchB.onclick = () => unoCatch();

    box.appendChild(shout); box.appendChild(catchB);
  }
  return box;
}

// Update tombol DOR / TERIAK di tempat (tanpa bikin ulang elemen => tidak kedip)
function updateUnoChallengeUI(data) {
  unoEnsureChallengeBox();
  const shout = document.getElementById('unoShoutBtn'), catchB = document.getElementById('unoCatchBtn');
  const ch = data && data.unoChallenge;
  if (!ch) { shout.style.display = 'none'; catchB.style.display = 'none'; return; }

  const elapsed = (Date.now() - ch.startTime) / 1000;
  if (elapsed > 3) {
    shout.style.display = 'none'; catchB.style.display = 'none';
    if (!unoClearing && unoRef) {
      unoClearing = true;
      unoRef.child('unoChallenge').transaction(c => (c && c.startTime === ch.startTime) ? null : c, () => { unoClearing = false; });
    }
    return;
  }

  const label = ch.type === 'UNO GAME' ? 'UNO GAME' : 'UNO';
  if (ch.target === myRole && !ch.shouted) {
    shout.style.display = 'block';
    shout.textContent = `🔥 TERIAK ${label}! (${Math.max(0, 3 - elapsed).toFixed(1)}s)`;
  } else shout.style.display = 'none';

  if (ch.target !== myRole && !ch.shouted && elapsed >= 2.0) {
    catchB.style.display = 'block';
    catchB.textContent = `💥 DOR! (Lupa Teriak ${label})`;
  } else catchB.style.display = 'none';
}

if (unoTimerCheck) clearInterval(unoTimerCheck);
unoTimerCheck = setInterval(() => {
  if (latestUnoData && latestUnoData.unoChallenge) updateUnoChallengeUI(latestUnoData);
}, 100);

// ======================================================
// DEAL ANIMATION (tetap)
// ======================================================
function unoAnimateDeal(done) {
  const table = document.querySelector('#unoScreen .capsa-table');
  if (!table || !latestUnoData) { done(); return; }
  const overlay = document.createElement('div'); overlay.className = 'capsa-deal-overlay'; table.appendChild(overlay);

  const activeRoles = getUnoRoles(latestUnoData.maxPlayers || 4);
  let dealTargets = ['bottom'];
  activeRoles.forEach(role => {
    if (role === myRole) return;
    if (activeRoles.length === 2) dealTargets.push('top');
    else if (activeRoles.length === 3) dealTargets.push('right', 'left');
    else if (activeRoles.length === 4) dealTargets.push('right', 'top', 'left');
    else { const dirs = ['right', 'right', 'top', 'left', 'left']; dealTargets.push(dirs[dealTargets.length - 1] || 'top'); }
  });

  const cardsPerPlayer = 7, perCardDelay = 300, animDuration = 550;
  let cardIndex = 0;
  dealTargets.forEach(dir => {
    for (let c = 0; c < cardsPerPlayer; c++) {
      const img = document.createElement('img');
      img.src = UNO_CARD_URLS.back; img.className = 'capsa-deal-card deal-' + dir; img.style.animationDelay = (cardIndex * perCardDelay) + 'ms';
      overlay.appendChild(img); cardIndex++;
    }
  });
  const totalDuration = (cardIndex - 1) * perCardDelay + animDuration + 150;
  setTimeout(() => { overlay.remove(); done(); }, totalDuration);
}

// ======================================================
// RENDER UTAMA
// ======================================================
function renderUnoUICore(data) {
  latestUnoData = data;
  const first = !unoPrev.init;
  const activeRoles = getUnoRoles(data.maxPlayers);
  if (data.turn !== myRole || data.phase !== 'playing') selectedUnoKeys.clear();

  const top = data.currentCard || null;
  const topKey = top ? (top.id + '|' + (top.chosenColor || '')) : '';
  const curColor = top ? (top.chosenColor || top.color) : 'wild';
  const myHand = ensureArray(data.hands && data.hands[myRole]);
  const finished = ensureArray(data.finished);

  // buang pilihan yang kartunya sudah tidak ada
  const ids = new Set(myHand.map(c => c.id));
  Array.from(selectedUnoKeys).forEach(id => { if (!ids.has(id)) selectedUnoKeys.delete(id); });

  // ---------- Status ----------
  const statusEl = document.getElementById('unoStatus');
  if (data.phase === 'waiting') {
    statusEl.textContent = `🟡 Menunggu pemain bergabung (${activeRoles.filter(r => unoPresence[r]).length}/${data.maxPlayers})...`;
  } else if (data.phase === 'playing') {
    const colorEmoji = UNO_COLOR_EMOJI[curColor] || '⚪';
    const broadcastMsg = data.lastActionText ? `\n[${data.lastActionText}]` : '';
    if (data.turn === myRole) statusEl.textContent = `🟢 Giliranmu! (Warna: ${colorEmoji} ${curColor.toUpperCase()})${data.drawStack > 0 ? ` ⚠️ STACKING +${data.drawStack}` : ''}${broadcastMsg}`;
    else statusEl.textContent = `🟡 Giliran ${unoName(data.turn)}... (Warna: ${colorEmoji} ${curColor.toUpperCase()})${broadcastMsg}`;
  } else if (data.phase === 'roundover') {
    statusEl.textContent = '🏁 Permainan Selesai!';
  }
  statusEl.style.color = (data.phase === 'playing' && data.turn === myRole) ? 'var(--green)' : '';

  // ---------- Kartu meja + meta ----------
  const topImg = document.getElementById('unoTopCardImg');
  if (topKey !== unoPrev.topKey) {
    topImg.src = getUnoCardImgUrl(top);
    if (!first && top) { topImg.classList.remove('pop'); void topImg.offsetWidth; topImg.classList.add('pop'); }
  }
  topImg.style.setProperty('--uc', UNO_COLOR_HEX[curColor] || 'transparent');

  unoEnsureMeta();
  const dirEl = document.getElementById('unoDir');
  dirEl.textContent = data.direction === -1 ? '⟲' : '⟳';
  document.getElementById('unoDirTxt').textContent = data.direction === -1 ? 'Berlawanan' : 'Searah';
  document.getElementById('unoColorPill').textContent = (UNO_COLOR_EMOJI[curColor] || '') + ' ' + curColor.toUpperCase();
  const stackPill = document.getElementById('unoStackPill');
  stackPill.style.display = data.drawStack > 0 ? 'inline-block' : 'none';
  stackPill.textContent = '+' + (data.drawStack || 0);

  // ---------- Tangan & lawan ----------
  const handChanged = myHand.length !== (unoPrev.counts[myRole] === undefined ? myHand.length : unoPrev.counts[myRole]);
  unoSyncHand(document.getElementById('unoHandMe'), myHand, data, !first);
  unoRenderOpponents(data, activeRoles);

  // ---------- Tombol aksi ----------
  const canPlay = data.phase === 'playing' && data.turn === myRole;
  const actBox = document.getElementById('unoActions');
  actBox.style.display = canPlay ? 'grid' : 'none';
  if (canPlay) {
    const drawBtn = document.getElementById('unoBtnDraw');
    if (data.drawStack > 0) drawBtn.textContent = `📥 Ambil (+${data.drawStack})`;
    else if (data.hasDrawn) drawBtn.textContent = '⏭️ Pass';
    else drawBtn.textContent = '📥 Ambil Kartu';
  }

  updateUnoChallengeUI(data);

  // ---------- Hasil ----------
  const resultEl = document.getElementById('unoResult'), nextBtn = document.getElementById('unoBtnNext');
  if (data.phase === 'roundover') {
    const medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅'];
    resultEl.innerHTML = finished.map((r, i) => `${medals[i]} Juara ${i + 1}: ${unoName(r)}${r === myRole ? ' (Kamu)' : ''}`).join('<br>');
    resultEl.style.display = 'block';
    nextBtn.style.display = 'block';
    nextBtn.textContent = myRole === 'p1' ? '▶ Main Lagi' : '⏳ Menunggu host mulai lagi';
    nextBtn.disabled = myRole !== 'p1';
  } else {
    resultEl.style.display = 'none'; nextBtn.style.display = 'none';
  }

  // ---------- Suara & efek (hanya saat ada perubahan nyata) ----------
  if (!first) {
    const specialMap = { skip: '🚫 SKIP!', reverse: '🔄 BALIK!', draw2: '+2 !', draw4: '+4 !!' };
    let drewSomething = false;
    activeRoles.forEach(r => {
      const c = data.hands && data.hands[r] ? ensureArray(data.hands[r]).length : 0;
      const p = unoPrev.counts[r];
      if (p !== undefined && c > p) drewSomething = true;
    });

    if (top && topKey !== unoPrev.topKey && data.handNumber === unoPrev.handNumber) {
      if (specialMap[top.value]) { unoSfx('special'); unoToast(specialMap[top.value], top.color === 'wild' ? '#fff' : UNO_COLOR_HEX[top.color]); }
      else if (top.value === 'wild') { unoSfx('special'); unoToast('🌈 ' + curColor.toUpperCase(), UNO_COLOR_HEX[curColor]); }
      else unoSfx('play');
    } else if (drewSomething) unoSfx('draw');

    if (data.phase === 'playing' && data.turn === myRole && unoPrev.turn !== myRole) {
      setTimeout(() => unoSfx('turn'), 220);
      try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
    }

    const ch = data.unoChallenge;
    if (ch && ch.startTime !== unoPrev.challengeStart && !ch.shouted) { unoSfx('uno'); unoToast('📢 ' + (ch.type === 'UNO GAME' ? 'UNO GAME?' : 'UNO?'), '#e8ac1f'); }

    // ---- Bubble penalti: +2 / +4 / +8 (akumulasi) di kursi yang harus menerima ----
    if (data.handNumber === unoPrev.handNumber) {
      const prevStack = unoPrev.drawStack || 0, curStack = data.drawStack || 0;
      if (data.phase === 'playing' && curStack > prevStack) {
        unoBubble(data.turn, '+' + curStack);
        if (data.turn === myRole) { try { if (navigator.vibrate) navigator.vibrate([70, 40, 110]); } catch (e) {} }
      } else if (prevStack > 0 && curStack === 0 && unoPrev.turn) {
        // penalti diambil: tampilkan berapa kartu yang masuk ke tangan pemain itu
        const c = data.hands && data.hands[unoPrev.turn] ? ensureArray(data.hands[unoPrev.turn]).length : 0;
        const p = unoPrev.counts[unoPrev.turn];
        if (p !== undefined && c > p) unoBubble(unoPrev.turn, '📥 +' + (c - p), 'take');
      }
      // ---- Bubble PASS ----
      if (data.lastActionText !== unoPrev.text && data.lastActionText && data.lastActionText.indexOf('⏭️') === 0 && unoPrev.turn) {
        unoBubble(unoPrev.turn, 'PASS', 'pass');
      }
    }

    if (data.lastActionText !== unoPrev.text && data.lastActionText && data.lastActionText.indexOf('💥') === 0) { unoSfx('dor'); unoToast('💥 DOR!', '#e8ac1f'); }

    if (finished.length > unoPrev.finished && data.phase === 'playing') {
      finished.slice(unoPrev.finished).forEach(r => unoToast('🏅 ' + unoName(r) + ' habis!', '#2bb673'));
      unoSfx('finish');
    }

    if (data.phase === 'roundover' && unoPrev.phase !== 'roundover') {
      if (finished[0] === myRole) { unoSfx('win'); unoConfetti(); }
      else if (finished.includes(myRole)) unoSfx('finish');
      else unoSfx('lose');
    }
  }

  // ---------- Simpan state sebelumnya ----------
  unoPrev.init = true;
  unoPrev.topKey = topKey;
  unoPrev.turn = data.turn;
  unoPrev.phase = data.phase;
  unoPrev.challengeStart = data.unoChallenge ? data.unoChallenge.startTime : null;
  unoPrev.text = data.lastActionText || null;
  unoPrev.finished = finished.length;
  unoPrev.handNumber = data.handNumber;
  unoPrev.drawStack = data.drawStack || 0;
  unoPrev.counts = {};
  activeRoles.forEach(r => { unoPrev.counts[r] = data.hands && data.hands[r] ? ensureArray(data.hands[r]).length : 0; });
}

function renderUnoUI(data) {
  const freshHand = data.phase === 'playing' && !!data.handNumber && data.handNumber !== unoLastAnimatedHand;
  const shouldAnimate = freshHand && unoHasRenderedOnce;
  if (freshHand) unoLastAnimatedHand = data.handNumber;
  unoHasRenderedOnce = true;

  if (shouldAnimate) { latestUnoData = data; unoAnimateDeal(() => renderUnoUICore(latestUnoData || data)); }
  else renderUnoUICore(data);
}

// ======================================================
// INIT
// ======================================================
function initUno() {
  unoRef = roomRef.child('uno');
  unoPrev = { init: false, topKey: null, counts: {}, turn: null, phase: null, challengeStart: null, text: null, finished: 0, handNumber: null };
  unoHasRenderedOnce = false; unoLastAnimatedHand = null; unoOppKey = ''; unoOppEls = {};
  selectedUnoKeys.clear();
  document.getElementById('unoRoleTag').textContent = myRole.toUpperCase();

  const presenceRef = roomRef.child('presence/' + myRole);
  activePresenceRef = presenceRef;
  if (!window.__unoPagehideBound) {
    window.__unoPagehideBound = true;
    window.addEventListener('pagehide', () => { if (activePresenceRef) activePresenceRef.remove(); });
  }

  document.getElementById('btnUnoBack').onclick = () => { if (activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };
  document.getElementById('unoBtnNext').onclick = () => {
    if (!unoRef || myRole !== 'p1') return;
    unoRef.transaction(cur => cur ? buildNewUnoGame(cur.maxPlayers, cur) : cur, (error, committed) => {
      if (committed) {
        selectedUnoKeys.clear();
        document.getElementById('unoResult').style.display = 'none';
        document.getElementById('unoBtnNext').style.display = 'none';
      }
    });
  };

  // Tombol aksi: dipasang sekali, keputusan dibaca dari state terbaru
  document.getElementById('unoBtnDraw').onclick = () => {
    unoGetAudio();
    const d = latestUnoData; if (!d) return;
    if (d.drawStack > 0 || !d.hasDrawn) unoDoDraw(); else unoDoPass();
  };
  document.getElementById('unoBtnPlay').onclick = () => { unoGetAudio(); unoDoPlay(); };

  presenceRef.transaction(cur => cur === null ? true : cur);

  if (myRole === 'p1') {
    unoRef.transaction(cur => cur || {
      phase: 'waiting', maxPlayers: window.unoSelectedMaxPlayers || 4, deck: [], hands: {}, turn: 'p1',
      direction: 1, currentCard: null, drawStack: 0, finished: [], handNumber: 0
    });
  }

  dbRoot.ref('.info/connected').on('value', snap => {
    if (snap.val() === true) { presenceRef.onDisconnect().remove(); presenceRef.set(true); }
  });

  roomRef.child('presence').on('value', snap => {
    unoPresence = snap.val() || {};
    if (latestUnoData) renderUnoUICore(latestUnoData);
    if (myRole === 'p1' && latestUnoData && latestUnoData.phase === 'waiting') {
      if (getUnoRoles(latestUnoData.maxPlayers).every(s => unoPresence[s])) {
        unoRef.transaction(cur => (cur && cur.phase === 'waiting') ? buildNewUnoGame(cur.maxPlayers, cur) : cur);
      }
    }
  });

  unoRef.child('names').on('value', snap => {
    unoNames = snap.val() || {};
    if (latestUnoData) renderUnoUICore(latestUnoData);
  });

  unoRef.on('value', snap => { const data = snap.val(); if (data) renderUnoUI(data); });

  document.querySelectorAll('.uno-color-btn').forEach(btn => {
    btn.onclick = () => unoDoPlay(btn.dataset.color);
  });
  const colorOverlay = document.getElementById('unoColorPickerOverlay');
  colorOverlay.addEventListener('click', e => { if (e.target === colorOverlay) colorOverlay.style.display = 'none'; });
}
