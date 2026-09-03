// ======================================================
// Tttc.js — Game 3: Tic-Tac-Toe 2P
// Membutuhkan shared.js sudah dimuat lebih dulu
// ======================================================

  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  let tttBoardState, tttTurn, mySymbol, tttWinSvg = null, tttRoundBusy = false, tttRound = 0;

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
    if (!statusEl) return;
    
    if (!tttBoardState) {
      statusEl.textContent = '⏳ Menyiapkan permainan...';
      return;
    }

    const result = tttEval(tttBoardState);
    if (!result) {
      const myTurn = tttTurn === mySymbol;
      statusEl.textContent = myTurn ? '🟢 Giliranmu' : '⏳ Giliran lawan...';
    } else {
      statusEl.textContent = result.winner === 'draw' ? '🤝 Seri!' :
        (result.winner === mySymbol ? '🏆 Kamu menang!' : '😢 Lawan menang!');
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
      document.getElementById('tttScoreYou').textContent = s[mySymbol] || 0;
      document.getElementById('tttScoreOpp').textContent = s[mySymbol === 'X' ? 'O' : 'X'] || 0;
      document.getElementById('tttScoreDraw').textContent = s.draw || 0;
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
    for(let i=0;i<9;i++){
      const btn = document.createElement('button');
      btn.className = 'ttt-cell';
      btn.dataset.i = i;
      btn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); tttCellClick(i); });
      bd.appendChild(btn);
    }
  }

  function renderTTTBoard(){
    const cells = document.querySelectorAll('#tttBoard .ttt-cell');
    if(!cells || cells.length === 0) buildTTTBoard();
    
    const currentCells = document.querySelectorAll('#tttBoard .ttt-cell');
    const board = tttBoardState || tttEmptyBoard();

    currentCells.forEach((cell, i) => {
      const v = board[i];
      if(v === 'O') cell.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" class="o-circle"/></svg>';
      else if(v === 'X') cell.innerHTML = '<svg viewBox="0 0 100 100"><line x1="20" y1="20" x2="80" y2="80" class="x-line"/><line x1="80" y1="20" x2="20" y2="80" class="x-line"/></svg>';
      else cell.innerHTML = '';
    });
  }

  function tttCellCenter(i){ const col = i % 3, row = Math.floor(i/3); return {x: col+0.5, y: row+0.5}; }

  function drawTTTWinLine(line){
    clearTTTWinLine();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 3 3');
    svg.setAttribute('class', 'winline-svg');
    const p1 = tttCellCenter(line[0]), p2 = tttCellCenter(line[2]);
    const ln = document.createElementNS(ns, 'line');
    ln.setAttribute('x1', p1.x); ln.setAttribute('y1', p1.y);
    ln.setAttribute('x2', p2.x); ln.setAttribute('y2', p2.y);
    ln.setAttribute('class', 'winline');
    svg.appendChild(ln);
    const wrap = document.getElementById('tttBoardWrap');
    if(wrap) wrap.appendChild(svg);
    tttWinSvg = svg;
  }

  function clearTTTWinLine(){ if(tttWinSvg){ tttWinSvg.remove(); tttWinSvg = null; } }

  function tttCellClick(idx){
    if(!tttBoardState || tttRoundBusy) return;
    if(tttTurn !== mySymbol) return;
    if(tttBoardState[idx]) return;
    const newBoard = tttBoardState.slice();
    newBoard[idx] = mySymbol;
    roomRef.child('state').set({ board: newBoard, turn: mySymbol === 'X' ? 'O' : 'X' });
  }

  document.getElementById('btnTttBack').onclick = () => {
    if(activePresenceRef) activePresenceRef.remove();
    clearSession(); location.reload();
  };
