// ======================================================
// Tttc.js — Game 3: Tic-Tac-Toe 2P (Modern + Diff Render)
// Membutuhkan shared.js sudah dimuat lebih dulu
// Perbaikan: animasi tidak lagi mengulang semua bidak setiap langkah
// ======================================================

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let tttBoardState, tttTurn, mySymbol, tttWinSvg = null, tttRoundBusy = false, tttRound = 0;
let tttRendered = null, tttLast = -1, tttFxPlayed = false, tttAudio = null;

// ======================================================
// CSS (diinjeksi, menimpa style lama di index.html)
// ======================================================
const tttStyleEl = document.createElement('style');
tttStyleEl.innerHTML = `
  #tttScreen .ttt-board-wrap { transition: box-shadow .3s ease; }
  #tttScreen .ttt-board-wrap.my-turn { box-shadow: 0 0 0 2px rgba(125,160,255,.65), 0 0 26px rgba(61,107,240,.35), 0 14px 30px rgba(0,0,0,.4); }
  #tttScreen .ttt-board.refresh { animation: tttRefresh .4s ease-out; }
  @keyframes tttRefresh { from { opacity: .3; transform: scale(.97); } to { opacity: 1; transform: none; } }

  /* Kotak */
  #tttScreen .ttt-cell {
    position: relative; border-radius: 12px; -webkit-tap-highlight-color: transparent;
    background: linear-gradient(160deg, var(--panel-3), var(--panel-2));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 2px 0 rgba(0,0,0,.25);
    transition: transform .12s ease, box-shadow .25s ease, opacity .3s ease;
  }
  #tttScreen .ttt-cell.filled { cursor: default; }
  #tttScreen .ttt-cell.filled:active { transform: none; }
  #tttScreen .ttt-cell.last { box-shadow: inset 0 0 0 2px rgba(232,172,31,.55), 0 2px 0 rgba(0,0,0,.25); }
  #tttScreen .ttt-cell.dim { opacity: .35; }
  #tttScreen .ttt-cell.win[data-v="X"] { --wc: 125,160,255; }
  #tttScreen .ttt-cell.win[data-v="O"] { --wc: 43,182,115; }
  #tttScreen .ttt-cell.win {
    background: linear-gradient(160deg, rgba(var(--wc),.28), rgba(var(--wc),.08));
    animation: tttWinPulse 1s ease-in-out infinite;
  }
  @keyframes tttWinPulse {
    0%, 100% { box-shadow: inset 0 0 0 2px rgba(var(--wc),.5), 0 0 12px rgba(var(--wc),.25); }
    50%      { box-shadow: inset 0 0 0 2px rgba(var(--wc),.95), 0 0 24px rgba(var(--wc),.55); }
  }

  /* Bidak: statis, hanya yang baru (.draw) yang beranimasi */
  #tttScreen .ttt-cell .o-circle, #tttScreen .ttt-cell .x-line { stroke-dasharray: 1; stroke-dashoffset: 0; animation: none; }
  #tttScreen .ttt-cell .o-circle { stroke: #2bb673; }
  #tttScreen .ttt-cell .x-line { stroke: #7da0ff; }
  #tttScreen .ttt-cell .draw.o-circle { stroke-dashoffset: 1; animation: tttInk .42s cubic-bezier(.4,0,.2,1) forwards; }
  #tttScreen .ttt-cell .draw.x-line { stroke-dashoffset: 1; animation: tttInk .26s cubic-bezier(.4,0,.2,1) forwards; }
  #tttScreen .ttt-cell .draw.x-line:nth-child(2) { animation-delay: .14s; }
  @keyframes tttInk { to { stroke-dashoffset: 0; } }
  #tttScreen .ttt-cell svg.mark-pop { animation: tttPop .35s cubic-bezier(.2,1.4,.4,1); }
  @keyframes tttPop { from { transform: scale(.55); opacity: .2; } to { transform: scale(1); opacity: 1; } }
  #tttScreen .ttt-cell[data-v="X"] svg { filter: drop-shadow(0 0 7px rgba(125,160,255,.55)); }
  #tttScreen .ttt-cell[data-v="O"] svg { filter: drop-shadow(0 0 7px rgba(43,182,115,.55)); }

  /* Preview bidak saat hover (giliranmu) */
  @media (hover: hover) {
    #tttScreen .ttt-cell:not(.filled)::after { content: ''; position: absolute; inset: 16%; background: center / contain no-repeat; opacity: 0; transition: opacity .15s ease; pointer-events: none; }
    #tttScreen .ttt-board-wrap.my-turn[data-sym="X"] .ttt-cell:not(.filled):hover::after {
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M20 20L80 80M80 20L20 80' stroke='%237da0ff' stroke-width='9' stroke-linecap='round' fill='none'/></svg>"); opacity: .3;
    }
    #tttScreen .ttt-board-wrap.my-turn[data-sym="O"] .ttt-cell:not(.filled):hover::after {
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='34' stroke='%232bb673' stroke-width='9' fill='none'/></svg>"); opacity: .3;
    }
  }

  /* Garis kemenangan */
  #tttScreen .winline-svg { filter: drop-shadow(0 0 5px rgba(255,255,255,.45)); }
  #tttScreen .winline { stroke-width: .09; stroke-dasharray: 1; stroke-dashoffset: 1; animation: tttInk .45s .15s cubic-bezier(.4,0,.2,1) forwards; }

  /* Skor */
  #tttScreen .ttt-scoreline b { display: inline-block; transition: color .4s ease; }
  #tttScreen .ttt-scoreline b.bump { color: var(--gold); animation: tttBump .5s cubic-bezier(.2,1.5,.4,1); }
  @keyframes tttBump { 0% { transform: scale(1); } 40% { transform: scale(1.6); } 100% { transform: scale(1); } }

  @media (prefers-reduced-motion: reduce) {
    #tttScreen *, #tttScreen *::after { animation-duration: .01ms !important; animation-delay: 0s !important; }
  }
`;
document.head.appendChild(tttStyleEl);

// ======================================================
// Helper
// ======================================================
function tttMarkSvg(v, animate){
  const d = animate ? ' draw' : '';
  const pop = animate ? ' class="mark-pop"' : '';
  if(v === 'O') return `<svg viewBox="0 0 100 100"${pop}><circle cx="50" cy="50" r="34" pathLength="1" transform="rotate(-90 50 50)" class="o-circle${d}"/></svg>`;
  return `<svg viewBox="0 0 100 100"${pop}><line x1="20" y1="20" x2="80" y2="80" pathLength="1" class="x-line${d}"/><line x1="80" y1="20" x2="20" y2="80" pathLength="1" class="x-line${d}"/></svg>`;
}

function tttSound(kind){
  try{
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    if(!tttAudio) tttAudio = new AC();
    if(tttAudio.state === 'suspended') tttAudio.resume();
    const t = tttAudio.currentTime;
    const tone = (f, at, dur, type, vol) => {
      const o = tttAudio.createOscillator(), g = tttAudio.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t + at);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g); g.connect(tttAudio.destination); o.start(t + at); o.stop(t + at + dur + .02);
    };
    if(kind === 'X') tone(520, 0, .1, 'sine', .18);
    else if(kind === 'O') tone(390, 0, .1, 'sine', .18);
    else if(kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .09, .18, 'sine', .16));
    else if(kind === 'lose') [392, 330, 262].forEach((f, i) => tone(f, i * .12, .22, 'triangle', .16));
    else if(kind === 'draw') [440, 440].forEach((f, i) => tone(f, i * .14, .16, 'sine', .14));
  }catch(e){}
}

function tttSetScore(id, val){
  const el = document.getElementById(id); if(!el) return;
  if(String(val) === el.textContent) return;
  el.textContent = val;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 520);
}

function tttEmptyBoard(){ return Array(9).fill(''); }
function tttEmptyCells(b){ const r=[]; for(let i=0;i<9;i++) if(!b || !b[i]) r.push(i); return r; }

function tttEval(b){
  if(!b) return null;
  for(const l of LINES){ if(b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return {winner:b[l[0]], line:l}; }
  if(tttEmptyCells(b).length === 0) return {winner:'draw', line:null};
  return null;
}

function updateTTTStatus() {
  const statusEl = document.getElementById('tttStatus');
  const wrap = document.getElementById('tttBoardWrap');
  if (wrap && mySymbol) wrap.dataset.sym = mySymbol;
  if (!statusEl) return;

  if (!tttBoardState) {
    statusEl.textContent = '⏳ Menyiapkan permainan...';
    statusEl.style.color = 'var(--ink-dim)';
    if (wrap) wrap.classList.remove('my-turn');
    return;
  }

  const result = tttEval(tttBoardState);
  const myTurn = !result && tttTurn === mySymbol;
  if (wrap) wrap.classList.toggle('my-turn', myTurn);

  if (!result) {
    statusEl.textContent = myTurn ? '🟢 Giliranmu' : '⏳ Giliran lawan...';
    statusEl.style.color = myTurn ? 'var(--green)' : 'var(--ink-dim)';
  } else if (result.winner === 'draw') {
    statusEl.textContent = '🤝 Seri!';
    statusEl.style.color = 'var(--gold)';
  } else if (result.winner === mySymbol) {
    statusEl.textContent = '🏆 Kamu menang!';
    statusEl.style.color = 'var(--green)';
  } else {
    statusEl.textContent = '😢 Lawan menang!';
    statusEl.style.color = 'var(--red)';
  }
}

function initTTT(){
  mySymbol = myRole === 'p1' ? 'X' : 'O';
  document.getElementById('tttRoleTag').textContent = myRole === 'p1' ? 'HOST (X)' : 'JOINER (O)';
  tttRoundBusy = false;

  buildTTTBoard();
  updateTTTStatus();

  roomRef.child('score').on('value', (snap) => {
    const s = snap.val() || {};
    tttSetScore('tttScoreYou', s[mySymbol] || 0);
    tttSetScore('tttScoreOpp', s[mySymbol === 'X' ? 'O' : 'X'] || 0);
    tttSetScore('tttScoreDraw', s.draw || 0);
  });

  roomRef.child('state').on('value', (snap) => {
    const data = snap.val();
    if(!data) {
      tttBoardState = tttEmptyBoard();
      tttTurn = 'X';
      renderTTTBoard();
      updateTTTStatus();
      return;
    }

    tttBoardState = data.board || tttEmptyBoard();
    tttTurn = data.turn || 'X';
    tttRound = data.round || 0;

    const result = tttEval(tttBoardState);

    // JIKA RONDE BARU / PAPAN KOSONG
    if(!result) {
      tttRoundBusy = false;
      clearTTTWinLine();
      renderTTTBoard();
      updateTTTStatus();
    }
    // JIKA RONDE SELESAI (ADA WINNER / SERI)
    else if(result && !tttRoundBusy) {
      tttRoundBusy = true;
      renderTTTBoard();
      if(result.line) drawTTTWinLine(result.line);
      updateTTTStatus();

      // Hanya HOST (p1) yang bertanggung jawab memperbarui data ke Firebase
      if (myRole === 'p1') {
        const key = result.winner === 'draw' ? 'draw' : result.winner;
        roomRef.child('score/' + key).transaction(v => (v || 0) + 1);

        setTimeout(() => {
          const nextTurn = result.winner === 'draw' ? 'X' : result.winner;
          roomRef.child('state').set({
            board: tttEmptyBoard(),
            turn: nextTurn,
            round: tttRound + 1
          });
        }, 2000);
      }
    }

  });

  if(myRole === 'p1'){
    roomRef.child('state').once('value').then(snap => {
      if(!snap.exists()){
        roomRef.child('state').set({ board: tttEmptyBoard(), turn: 'X', round: 0 });
      }
    });
  }
}

function buildTTTBoard(){
  const bd = document.getElementById('tttBoard');
  if(!bd) return;
  bd.innerHTML = '';
  tttRendered = null; tttLast = -1;
  for(let i=0;i<9;i++){
    const btn = document.createElement('button');
    btn.className = 'ttt-cell';
    btn.dataset.i = i;
    btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tttCellClick(i); });
    bd.appendChild(btn);
  }
}

function renderTTTBoard(){
  let cells = document.querySelectorAll('#tttBoard .ttt-cell');
  if(cells.length === 0){ buildTTTBoard(); cells = document.querySelectorAll('#tttBoard .ttt-cell'); }

  const first = !tttRendered;                 // render pertama: tampilkan tanpa animasi (reconnect / baru masuk)
  if(first) tttRendered = Array(9).fill('');

  const board = tttBoardState || tttEmptyBoard();
  const result = tttEval(board);
  const winLine = result && result.line ? result.line : null;
  let cleared = false, placed = '';

  cells.forEach((cell, i) => {
    const v = board[i] || '';
    if(tttRendered[i] !== v){                 // hanya kotak yang berubah yang disentuh
      if(v){
        cell.innerHTML = tttMarkSvg(v, !first);
        cell.dataset.v = v;
        cell.classList.add('filled');
        tttLast = i; placed = v;
      } else {
        cell.innerHTML = '';
        delete cell.dataset.v;
        cell.classList.remove('filled');
        cleared = true;
      }
      tttRendered[i] = v;
    }
    cell.classList.toggle('last', !result && i === tttLast && !!v);
    cell.classList.toggle('win', !!winLine && winLine.includes(i));
    cell.classList.toggle('dim', !!winLine && !winLine.includes(i));
  });

  if(cleared){                                // ronde baru
    tttLast = -1;
    const bd = document.getElementById('tttBoard');
    bd.classList.remove('refresh'); void bd.offsetWidth; bd.classList.add('refresh');
  }

  if(placed && !first && !result) tttSound(placed);
  if(!result) tttFxPlayed = false;
  else if(!tttFxPlayed){
    tttFxPlayed = true;
    if(!first) tttSound(result.winner === 'draw' ? 'draw' : (result.winner === mySymbol ? 'win' : 'lose'));
  }
}

function tttCellCenter(i){ const col = i % 3, row = Math.floor(i/3); return {x: col+0.5, y: row+0.5}; }

function drawTTTWinLine(line){
  clearTTTWinLine();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 3 3');
  svg.setAttribute('class', 'winline-svg');

  const a = tttCellCenter(line[0]), b = tttCellCenter(line[2]);
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ext = 0.22;
  const ux = dx / len, uy = dy / len;

  const ln = document.createElementNS(ns, 'line');
  ln.setAttribute('x1', a.x - ux * ext); ln.setAttribute('y1', a.y - uy * ext);
  ln.setAttribute('x2', b.x + ux * ext); ln.setAttribute('y2', b.y + uy * ext);
  ln.setAttribute('pathLength', '1');
  ln.setAttribute('class', 'winline');
  ln.style.stroke = (tttBoardState && tttBoardState[line[0]] === 'X') ? '#7da0ff' : '#2bb673';
  svg.appendChild(ln);

  const wrap = document.getElementById('tttBoardWrap');
  if(wrap) wrap.appendChild(svg);
  tttWinSvg = svg;
}

function clearTTTWinLine(){ if(tttWinSvg){ tttWinSvg.remove(); tttWinSvg = null; } }

function tttCellClick(idx){
  tttSound('');                               // unlock audio di gesture pertama
  if(!tttBoardState || tttRoundBusy) return;
  if(tttTurn !== mySymbol) return;
  if(tttBoardState[idx]) return;
  const newBoard = tttBoardState.slice();
  newBoard[idx] = mySymbol;
  roomRef.child('state').set({ board: newBoard, turn: mySymbol === 'X' ? 'O' : 'X', round: tttRound });
}

document.getElementById('btnTttBack').onclick = () => {
  if(activePresenceRef) activePresenceRef.remove();
  clearSession(); location.reload();
};
