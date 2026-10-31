// ======================================================
// Catur.js — Total Overhaul (Smooth Diffing Engine + Pro FX)
// ======================================================

const pieceUnicode = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
let chessBoardState, chessTurn, chessSelected = null, chessFlipped = false, myChessColor, chessGameOver = false;
let chessCastling, chessEP, chessHalfmove = 0;
let chessClocks = null;          
let chessTurnStartAt = null;     
let chessClockInterval = null;
let chessPendingPromotion = null;

let prevChessBoard = null; 
let chessAudioCtx = null;

// 🛠️ INJEKSI CSS ANIMASI PRO (Biar nggak perlu ubah index.html lagi)
const styleEl = document.createElement('style');
styleEl.innerHTML = `
  .piece-wrapper { 
    transition: transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.1); 
  }
  .piece-wrapper.selected {
    z-index: 100;
  }
  .piece-wrapper.selected .piece {
    transform: scale(1.15) translateY(-8px);
    filter: drop-shadow(0 10px 15px rgba(0,0,0,0.7));
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .piece-wrapper.capturing .piece {
    animation: pieceDestroy 0.4s cubic-bezier(0.5, 0, 0.8, 0.2) forwards;
  }
  @keyframes pieceDestroy {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2) rotate(15deg); opacity: 0.8; }
    100% { transform: scale(0) rotate(90deg); opacity: 0; }
  }
  .capture-particle {
    position: absolute; width: 8px; height: 8px; background: #e4574f; border-radius: 50%;
    pointer-events: none; z-index: 20; box-shadow: 0 0 10px #e4574f;
    animation: particleBurst 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  @keyframes particleBurst {
    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0); opacity: 0; }
  }
  .particle-ring {
    position: absolute; inset: 0; border-radius: 50%; border: 3px solid #e4574f;
    box-sizing: border-box; pointer-events: none; z-index: 20;
    animation: explodeRing 0.5s ease-out forwards;
  }
  @keyframes explodeRing {
    0% { transform: scale(0.5); opacity: 1; border-width: 6px; }
    100% { transform: scale(1.5); opacity: 0; border-width: 1px; }
  }
`;
document.head.appendChild(styleEl);

const CHESS_REASON_TEXT = {
  checkmate: 'Skakmat', stalemate: 'Remis — Stalemate (buntu, tak ada langkah legal)',
  insufficient: 'Remis — Materi tidak cukup untuk skakmat', threefold: 'Remis — Posisi berulang 3 kali',
  fifty: 'Remis — Aturan 50 langkah', timeout: 'Waktu habis'
};

// --- SOUND ENGINE ---
function getChessAudioContext() {
  if (!chessAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) chessAudioCtx = new AudioContextClass();
  }
  if (chessAudioCtx && chessAudioCtx.state === 'suspended') chessAudioCtx.resume();
  return chessAudioCtx;
}

function playChessSound(type) {
  try {
    const ctx = getChessAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    
    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    } else if (type === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    } else if (type === 'check') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.1);
      osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    }
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// --- CORE LOGIC CATUR ---
function chessColorOf(p){ if(!p) return null; return p === p.toUpperCase() ? 'w' : 'b'; }

function chessStartingState(){
  return {
    board: [
      ['r','n','b','q','k','b','n','r'], ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''], ['','','','','','','',''],
      ['','','','','','','',''], ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'], ['R','N','B','Q','K','B','N','R']
    ],
    turn: 'w', castling: { wK:true, wQ:true, bK:true, bQ:true }, ep: null, halfmove: 0,
    clocks: chessTimeControl > 0 ? { w: chessTimeControl*1000, b: chessTimeControl*1000 } : null,
    turnStartAt: chessTimeControl > 0 ? Date.now() : null
  };
}

function chessStateToFirebase(st){
  return { board: JSON.stringify(st.board), turn: st.turn, castling: st.castling, ep: st.ep, halfmove: st.halfmove, clocks: st.clocks, turnStartAt: st.turnStartAt };
}

function initChess(){
  myChessColor = myRole === 'p1' ? 'w' : 'b';
  const roleTag = document.getElementById('chessRoleTag');
  if(roleTag) roleTag.textContent = myRole === 'p1' ? 'HOST (Putih)' : 'JOINER (Hitam)';
  
  chessFlipped = myChessColor === 'b';
  chessSelected = null; chessGameOver = false; chessPendingPromotion = null;
  prevChessBoard = null;
  
  document.getElementById('chessWinOverlay').style.display = 'none';
  hideChessPromoModal();

  const starting = chessStartingState();
  chessBoardState = starting.board; chessTurn = starting.turn; chessCastling = starting.castling;
  chessEP = starting.ep; chessHalfmove = starting.halfmove; chessClocks = starting.clocks;

  buildChessDOM(); 
  chessDraw();

  if(typeof setupPresence === 'function') setupPresence('chessStatus', roomIdGlobal);

  roomRef.child('state').on('value', (snap) => {
    const data = snap.val();
    if(!data) return;
    const newBoard = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;
    
    // Jika update dari Firebase sama persis dengan layar sekarang (sisa dari optimistic update), abaikan
    if (prevChessBoard && JSON.stringify(prevChessBoard) === JSON.stringify(newBoard)) {
       chessTurn = data.turn; chessClocks = data.clocks || null; chessTurnStartAt = data.turnStartAt || null;
       return;
    }

    chessBoardState = newBoard;
    chessTurn = data.turn; chessCastling = data.castling || { wK:false, wQ:false, bK:false, bQ:false };
    chessEP = data.ep || null; chessHalfmove = data.halfmove || 0; chessClocks = data.clocks || null; chessTurnStartAt = data.turnStartAt || null;
    chessSelected = null;
    chessDraw();
    chessUpdateClockUI();
  });

  roomRef.child('result').on('value', (snap) => {
    const r = snap.val();
    if(r && !chessGameOver){
      chessGameOver = true;
      if(chessClockInterval){ clearInterval(chessClockInterval); chessClockInterval = null; }
      showChessResult(r);
    }
  });

  if(myRole === 'p1'){
    roomRef.child('state').once('value').then(snap => {
      if(!snap.exists()) roomRef.child('state').set(chessStateToFirebase(chessStartingState()));
    });
    roomRef.child('result').remove(); roomRef.child('posCounts').remove();
  }

  if(chessClockInterval) clearInterval(chessClockInterval);
  chessClockInterval = setInterval(chessUpdateClockUI, 250);
}

function buildChessDOM() {
  const sqLayer = document.getElementById('chessSquares');
  sqLayer.innerHTML = '';
  for(let dy=0; dy<8; dy++){
    for(let dx=0; dx<8; dx++){
      const cell = document.createElement('div');
      cell.className = 'cell ' + ((dx + dy) % 2 ? 'dark' : 'light');
      cell.id = `sq-${dx}-${dy}`;
      cell.onpointerdown = (e) => {
        e.preventDefault();
        const bx = chessFlipped ? 7 - dx : dx;
        const by = chessFlipped ? 7 - dy : dy;
        chessHandleClick(bx, by);
      };
      sqLayer.appendChild(cell);
    }
  }
}

// --- 🛠️ MESIN ANIMASI RENDER (SMOOTH DIFFING) ---
function chessDraw(){
  if(!chessBoardState) return;
  const layer = document.getElementById('chessPiecesLayer');
  const board = chessBoardState;
  
  const isCheck = chessIsInCheck(board, chessTurn);
  const wrapper = document.getElementById('chessWrapper');
  if(isCheck) wrapper.classList.add('in-check'); else wrapper.classList.remove('in-check');
  
  const kingPos = isCheck ? chessFindKing(board, chessTurn) : null;

  // 1. Update Highlight Kotak
  let validMoves = [];
  if(chessSelected) {
    validMoves = chessLegalMovesForSquare(board, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
  }

  for(let y=0; y<8; y++){
    for(let x=0; x<8; x++){
      const bx = chessFlipped ? 7 - x : x;
      const by = chessFlipped ? 7 - y : y;
      const cell = document.getElementById(`sq-${x}-${y}`);
      if(!cell) continue;
      
      cell.className = 'cell ' + ((x + y) % 2 ? 'dark' : 'light');
      if(chessSelected && chessSelected.x === bx && chessSelected.y === by) cell.classList.add('selected');
      if(kingPos && kingPos.x === bx && kingPos.y === by) cell.classList.add('king-check');
      
      const mv = validMoves.find(m => m.x2 === bx && m.y2 === by);
      if(mv) cell.classList.add(mv.capture ? 'capture' : 'valid');
    }
  }

  // 2. Render Bidak & Animasi
  if (!prevChessBoard) {
    // Initial Load
    layer.innerHTML = '';
    for(let y=0; y<8; y++) for(let x=0; x<8; x++) {
      if(board[y][x]) layer.appendChild(createPieceElement(board[y][x], x, y));
    }
    prevChessBoard = board.map(r => r.slice());
    updateSelectedClasses();
    return;
  }

  const domPieces = Array.from(layer.querySelectorAll('.piece-wrapper'));
  const existing = new Map(); 
  
  domPieces.forEach(el => {
    existing.set(`${el.dataset.x}-${el.dataset.y}`, { el, type: el.dataset.piece });
  });

  let moved = false, captured = false;

  for(let y=0; y<8; y++) {
    for(let x=0; x<8; x++) {
      const p = board[y][x];
      if (!p) continue;
      
      const posKey = `${x}-${y}`;
      let pieceObj = existing.get(posKey);
      
      if (pieceObj && pieceObj.type === p) {
        // Bidak diam di tempat
        existing.delete(posKey); 
      } else {
        // Bidak baru di sini (gerak, promosi, atau spawn)
        let movingObj = null;
        for (const [oldKey, obj] of existing.entries()) {
          const [ox, oy] = oldKey.split('-').map(Number);
          const oldP = prevChessBoard[oy][ox];
          
          if (oldP === p) {
            movingObj = obj;
            existing.delete(oldKey); 
            break;
          }
          
          // Deteksi Promosi
          const color = chessColorOf(p);
          const pawn = color === 'w' ? 'P' : 'p';
          if (oldP === pawn && p.toLowerCase() !== 'p' && chessColorOf(oldP) === color) {
            movingObj = obj;
            existing.delete(oldKey);
            obj.el.dataset.piece = p;
            obj.el.innerHTML = `<span class="piece ${color==='w'?'white':'black'}">${pieceUnicode[p]}</span>`;
            break;
          }
        }

        if (movingObj) {
          // Pindahkan DOM (CSS Transition akan menghandle animasinya)
          const el = movingObj.el;
          el.dataset.x = x;
          el.dataset.y = y;
          el.style.transform = getTransformString(x, y);
          moved = true;
        } else {
          // Bidak benar-benar baru (Fallback)
          layer.appendChild(createPieceElement(p, x, y));
        }
      }
    }
  }

  // 3. Animasi Makan Bidak
  existing.forEach(obj => {
    if (obj.el.parentNode) {
      captured = true;
      obj.el.classList.add('capturing');
      spawnCaptureParticles(parseInt(obj.el.dataset.x), parseInt(obj.el.dataset.y));
      setTimeout(() => obj.el.remove(), 450);
    }
  });

  // 4. Sound FX
  if (captured) playChessSound('capture');
  else if (moved) playChessSound('move');
  
  if (isCheck && (!prevChessBoard || !chessIsInCheck(prevChessBoard, chessTurn))) {
    playChessSound('check');
  }

  prevChessBoard = board.map(r => r.slice());
  updateSelectedClasses();

  // Status UI
  const myTurn = chessTurn === myChessColor && !chessGameOver;
  let statusTxt = chessGameOver ? 'Game selesai' : (myTurn ? '🟢 Giliranmu' : '⏳ Giliran lawan...');
  if(isCheck) statusTxt += (myTurn ? ' — Rajamu SKAK!' : ' — Raja lawan skak');
  const statusEl = document.getElementById('chessStatus');
  if(statusEl) statusEl.textContent = statusTxt;
}

function updateSelectedClasses() {
  document.querySelectorAll('.piece-wrapper').forEach(el => {
    const px = parseInt(el.dataset.x);
    const py = parseInt(el.dataset.y);
    if (chessSelected && chessSelected.x === px && chessSelected.y === py) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

function createPieceElement(p, bx, by) {
  const el = document.createElement('div');
  el.className = 'piece-wrapper';
  el.dataset.x = bx;
  el.dataset.y = by;
  el.dataset.piece = p;
  el.style.transform = getTransformString(bx, by);
  el.innerHTML = `<span class="piece ${chessColorOf(p)==='w'?'white':'black'}">${pieceUnicode[p]}</span>`;
  return el;
}

function getTransformString(bx, by) {
  const dx = chessFlipped ? 7 - bx : bx;
  const dy = chessFlipped ? 7 - by : by;
  return `translate(${dx * 100}%, ${dy * 100}%)`;
}

// --- FX PARTIKEL LEDAKAN (LEBIH PRO) ---
function spawnCaptureParticles(bx, by) {
  const layer = document.getElementById('chessPiecesLayer');
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.width = '12.5%';
  wrapper.style.height = '12.5%';
  wrapper.style.left = `${(chessFlipped ? 7 - bx : bx) * 12.5}%`;
  wrapper.style.top = `${(chessFlipped ? 7 - by : by) * 12.5}%`;
  wrapper.style.pointerEvents = 'none';
  layer.appendChild(wrapper);

  // Ring Ledakan
  const ring = document.createElement('div');
  ring.className = 'particle-ring';
  wrapper.appendChild(ring);
  
  // Pecahan Partikel
  for(let i=0; i<6; i++) {
    const p = document.createElement('div');
    p.className = 'capture-particle';
    p.style.left = '50%';
    p.style.top = '50%';
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * 20;
    p.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
    wrapper.appendChild(p);
  }
  
  setTimeout(() => wrapper.remove(), 600);
}

// --- LOGIKA LAINNYA ---
function chessFindKing(board, color){
  const K = color === 'w' ? 'K' : 'k';
  for(let y=0;y<8;y++) for(let x=0;x<8;x++) if(board[y][x] === K) return {x,y};
  return null;
}
function chessSlideAttack(board, x, y, byColor, dirs, chars){
  for(const [dx,dy] of dirs){
    let cx = x+dx, cy = y+dy;
    while(cx>=0 && cx<8 && cy>=0 && cy<8){
      const p = board[cy][cx];
      if(p){ if(chessColorOf(p) === byColor && chars.indexOf(p.toLowerCase()) !== -1) return true; break; }
      cx += dx; cy += dy;
    }
  }
  return false;
}
function chessSquareAttacked(board, x, y, byColor){
  if(byColor === 'w'){
    if(y+1 < 8){ if(x-1 >= 0 && board[y+1][x-1] === 'P') return true; if(x+1 < 8 && board[y+1][x+1] === 'P') return true; }
  } else {
    if(y-1 >= 0){ if(x-1 >= 0 && board[y-1][x-1] === 'p') return true; if(x+1 < 8 && board[y-1][x+1] === 'p') return true; }
  }
  const N = byColor === 'w' ? 'N' : 'n';
  for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
    const nx=x+dx, ny=y+dy; if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === N) return true;
  }
  const K = byColor === 'w' ? 'K' : 'k';
  for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
    if(!dx && !dy) continue; const nx=x+dx, ny=y+dy; if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === K) return true;
  }
  if(chessSlideAttack(board,x,y,byColor,[[1,0],[-1,0],[0,1],[0,-1]],['r','q'])) return true;
  if(chessSlideAttack(board,x,y,byColor,[[1,1],[1,-1],[-1,1],[-1,-1]],['b','q'])) return true;
  return false;
}
function chessIsInCheck(board, color){
  const k = chessFindKing(board, color);
  if(!k) return false;
  return chessSquareAttacked(board, k.x, k.y, color === 'w' ? 'b' : 'w');
}
function chessPieceMoves(board, state, x, y){
  const p = board[y][x]; if(!p) return [];
  const color = chessColorOf(p), type = p.toLowerCase(), moves = [];
  const addIfOk = (x2,y2,extra) => {
    if(x2<0 || x2>7 || y2<0 || y2>7) return;
    const t = board[y2][x2]; if(t && chessColorOf(t) === color) return;
    moves.push(Object.assign({x1:x,y1:y,x2,y2,capture:!!t,flag:null,promotion:false}, extra||{}));
  };
  if(type === 'p'){
    const dir = color === 'w' ? -1 : 1, startRow = color === 'w' ? 6 : 1, lastRow = color === 'w' ? 0 : 7;
    if(y+dir>=0 && y+dir<8 && !board[y+dir][x]){
      moves.push({x1:x,y1:y,x2:x,y2:y+dir,capture:false,flag:null,promotion:(y+dir===lastRow)});
      if(y===startRow && !board[y+2*dir][x]) moves.push({x1:x,y1:y,x2:x,y2:y+2*dir,capture:false,flag:'double',promotion:false});
    }
    for(const dx of [-1,1]){
      const nx=x+dx, ny=y+dir; if(nx<0 || nx>7 || ny<0 || ny>7) continue;
      const t = board[ny][nx];
      if(t && chessColorOf(t) !== color) moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:null,promotion:(ny===lastRow)});
      else if(!t && state.ep && state.ep.x===nx && state.ep.y===ny) moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:'enpassant',promotion:false,epCapture:{x:nx,y:y}});
    }
  } else if(type === 'n'){ [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dx,dy]) => addIfOk(x+dx,y+dy)); }
  else if(type === 'k'){
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(dx||dy) addIfOk(x+dx,y+dy); }
    const rights = state.castling || {}, homeRow = color === 'w' ? 7 : 0, oppColor = color === 'w' ? 'b' : 'w';
    if(y===homeRow && x===4 && !chessSquareAttacked(board,x,y,oppColor)){
      if((color==='w'?rights.wK:rights.bK) && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7]===(color==='w'?'R':'r')){
        if(!chessSquareAttacked(board,5,homeRow,oppColor) && !chessSquareAttacked(board,6,homeRow,oppColor)) moves.push({x1:x,y1:y,x2:6,y2:homeRow,capture:false,flag:'castleK',promotion:false});
      }
      if((color==='w'?rights.wQ:rights.bQ) && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] && board[homeRow][0]===(color==='w'?'R':'r')){
        if(!chessSquareAttacked(board,3,homeRow,oppColor) && !chessSquareAttacked(board,2,homeRow,oppColor)) moves.push({x1:x,y1:y,x2:2,y2:homeRow,capture:false,flag:'castleQ',promotion:false});
      }
    }
  } else {
    const dirs = type==='r' ? [[1,0],[-1,0],[0,1],[0,-1]] : type==='b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [dx,dy] of dirs){
      let cx=x+dx, cy=y+dy;
      while(cx>=0 && cx<8 && cy>=0 && cy<8){
        const t = board[cy][cx];
        if(t){ if(chessColorOf(t)!==color) addIfOk(cx,cy); break; }
        addIfOk(cx,cy); cx+=dx; cy+=dy;
      }
    }
  }
  return moves;
}
function chessApplyMove(board, state, move, promoteTo){
  const nb = board.map(r => r.slice()), nc = Object.assign({}, state.castling);
  const piece = nb[move.y1][move.x1], color = chessColorOf(piece);
  let capturedPiece = nb[move.y2][move.x2];
  nb[move.y1][move.x1] = '';
  let placed = piece;
  if(move.promotion){ const valid = {q:1,r:1,b:1,n:1}; placed = color==='w' ? (promoteTo||'q').toUpperCase() : (promoteTo||'q'); }
  nb[move.y2][move.x2] = placed;
  if(move.flag === 'enpassant'){ nb[move.epCapture.y][move.epCapture.x] = ''; capturedPiece = color==='w' ? 'p' : 'P'; }
  if(move.flag === 'castleK'){ nb[move.y1][5] = nb[move.y1][7]; nb[move.y1][7] = ''; }
  if(move.flag === 'castleQ'){ nb[move.y1][3] = nb[move.y1][0]; nb[move.y1][0] = ''; }
  if(piece==='K'){ nc.wK=false; nc.wQ=false; } if(piece==='k'){ nc.bK=false; nc.bQ=false; }
  if(move.x1===0 && move.y1===7) nc.wQ=false; if(move.x1===7 && move.y1===7) nc.wK=false;
  if(move.x1===0 && move.y1===0) nc.bQ=false; if(move.x1===7 && move.y1===0) nc.bK=false;
  if(move.x2===0 && move.y2===7) nc.wQ=false; if(move.x2===7 && move.y2===7) nc.wK=false;
  if(move.x2===0 && move.y2===0) nc.bQ=false; if(move.x2===7 && move.y2===0) nc.bK=false;
  const newEp = move.flag==='double' ? {x:move.x1, y:(move.y1+move.y2)/2} : null;
  const newHalfmove = (piece.toLowerCase()==='p' || capturedPiece) ? 0 : (state.halfmove||0)+1;
  return { board: nb, castling: nc, ep: newEp, halfmove: newHalfmove, capturedPiece };
}
function chessLegalMovesForSquare(board, state, x, y){
  const p = board[y][x]; if(!p) return [];
  const color = chessColorOf(p), legal = [];
  for(const m of chessPieceMoves(board, state, x, y)){
    const res = chessApplyMove(board, state, m, m.promotion ? 'q' : null);
    if(!chessIsInCheck(res.board, color)) legal.push(m);
  }
  return legal;
}
function chessAllLegalMoves(board, state, color){
  let all = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const p = board[y][x]; if(p && chessColorOf(p)===color) all = all.concat(chessLegalMovesForSquare(board,state,x,y)); }
  return all;
}
function chessIsInsufficientMaterial(board){
  const pieces = [];
  for(let y=0;y<8;y++) for(let x=0;x<8;x++){ const p = board[y][x]; if(p && p.toLowerCase() !== 'k') pieces.push({p,x,y}); }
  if(pieces.length === 0) return true;
  if(pieces.length === 1) return ['n','b'].includes(pieces[0].p.toLowerCase());
  if(pieces.length === 2){ const [a,b] = pieces; if(a.p.toLowerCase()==='b' && b.p.toLowerCase()==='b' && chessColorOf(a.p)!==chessColorOf(b.p)) return (a.x+a.y)%2 === (b.x+b.y)%2; }
  return false;
}
function chessPositionKey(board, turn, castling, ep){
  let s = ''; for(let y=0;y<8;y++) for(let x=0;x<8;x++) s += (board[y][x] || '0');
  s += '_' + turn + '_' + (castling.wK?1:0)+(castling.wQ?1:0)+(castling.bK?1:0)+(castling.bQ?1:0) + '_' + (ep ? (ep.x+'-'+ep.y) : 'n');
  return 'k' + s;
}

function chessHandleClick(x, y){
  getChessAudioContext();
  if(chessGameOver || chessPendingPromotion || chessTurn !== myChessColor) return;
  
  const board = chessBoardState || chessStartingState().board;
  const p = board[y][x];

  // Jika klik bidak yang sama, batalkan pilihan
  if(chessSelected && chessSelected.x === x && chessSelected.y === y) {
    chessSelected = null;
    chessDraw();
    return;
  }

  if(chessSelected){
    const legalMoves = chessLegalMovesForSquare(board, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
    const mv = legalMoves.find(m => m.x2 === x && m.y2 === y);
    if(mv){
      const activeMove = mv; 
      chessSelected = null;
      if(activeMove.promotion){ 
        chessPendingPromotion = activeMove; 
        showChessPromoModal(myChessColor); 
      } else {
        chessCommitMove(activeMove, null);
      }
      return;
    } else if(p && chessColorOf(p) === myChessColor){
      chessSelected = {x, y};
    } else {
      chessSelected = null;
    }
  } else if(p && chessColorOf(p) === myChessColor){
    chessSelected = {x, y};
  }
  chessDraw();
}

function chessCommitMove(move, promoteTo){
  const state = { castling: chessCastling, ep: chessEP, halfmove: chessHalfmove };
  const result = chessApplyMove(chessBoardState, state, move, promoteTo);
  const nextTurn = chessTurn === 'w' ? 'b' : 'w';
  let newClocks = chessClocks, newTurnStartAt = chessTurnStartAt;
  
  if(chessClocks){
    const elapsed = Date.now() - (chessTurnStartAt || Date.now());
    const moverColor = chessTurn;
    newClocks = Object.assign({}, chessClocks, { [moverColor]: Math.max(0, (chessClocks[moverColor]||0) - elapsed) });
    newTurnStartAt = Date.now();
  }

  // 🛠️ OPTIMISTIC UPDATE (Langsung gambar di layar kita, biar gak nunggu Firebase)
  chessBoardState = result.board;
  chessTurn = nextTurn;
  chessCastling = result.castling;
  chessEP = result.ep;
  chessHalfmove = result.halfmove;
  chessSelected = null;
  chessDraw();

  // Kirim ke Firebase
  roomRef.child('state').set({
    board: JSON.stringify(result.board), turn: nextTurn, castling: result.castling, ep: result.ep, halfmove: result.halfmove, clocks: newClocks, turnStartAt: newTurnStartAt
  });

  const key = chessPositionKey(result.board, nextTurn, result.castling, result.ep);
  roomRef.child('posCounts/' + key).transaction(c => (c||0) + 1).then(res => { if(res.committed && res.snapshot.val() >= 3) chessDeclareResult('draw', 'threefold'); }).catch(()=>{});
  
  const legalNext = chessAllLegalMoves(result.board, {castling: result.castling, ep: result.ep}, nextTurn);
  if(legalNext.length === 0){ 
    if(chessIsInCheck(result.board, nextTurn)) chessDeclareResult(myRole, 'checkmate'); 
    else chessDeclareResult('draw', 'stalemate'); 
  }
  else if(result.halfmove >= 100) chessDeclareResult('draw', 'fifty');
  else if(chessIsInsufficientMaterial(result.board)) chessDeclareResult('draw', 'insufficient');
}

function chessDeclareResult(winner, reason){ roomRef.child('result').transaction(cur => cur || { winner, reason }); }
function chessFormatClock(ms){
  if(ms < 0) ms = 0; const total = Math.ceil(ms/1000), m = Math.floor(total/60), s = total%60;
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function chessUpdateClockUI(){
  const wrap = document.getElementById('chessClockWrap'); if(!wrap) return;
  if(!chessClocks){ wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  let liveW = chessClocks.w, liveB = chessClocks.b;
  if(!chessGameOver && chessTurnStartAt){
    const elapsed = Date.now() - chessTurnStartAt;
    if(chessTurn === 'w') liveW = Math.max(0, chessClocks.w - elapsed); else liveB = Math.max(0, chessClocks.b - elapsed);
  }
  const myLive = myChessColor === 'w' ? liveW : liveB, oppLive = myChessColor === 'w' ? liveB : liveW;
  const meEl = document.getElementById('chessClockMe'), oppEl = document.getElementById('chessClockOpp');
  if(meEl) { meEl.textContent = chessFormatClock(myLive); meEl.classList.toggle('low', myLive < 30000); }
  if(oppEl) { oppEl.textContent = chessFormatClock(oppLive); oppEl.classList.toggle('low', oppLive < 30000); }
  if(!chessGameOver){ if(liveW <= 0) chessDeclareResult('p2', 'timeout'); else if(liveB <= 0) chessDeclareResult('p1', 'timeout'); }
}
function showChessResult(r){
  const overlay = document.getElementById('chessWinOverlay'), textEl = document.getElementById('chessWinText');
  if(!overlay || !textEl) return;
  const reasonTxt = CHESS_REASON_TEXT[r.reason] || '';
  if(r.winner === 'draw') textEl.innerHTML = '🤝 REMIS<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';
  else textEl.innerHTML = (r.winner === myRole ? '🏆 KAMU MENANG!' : '😢 LAWAN MENANG!') + '<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';
  overlay.style.display = 'flex';
}
function showChessPromoModal(color){
  const wrap = document.getElementById('chessPromoChoices'); if(!wrap) return;
  wrap.innerHTML = '';
  ['q','r','b','n'].forEach(t => {
    const btn = document.createElement('button'); btn.className = 'promo-btn';
    btn.innerHTML = '<span class="piece ' + (color==='w'?'white':'black') + '">' + pieceUnicode[color==='w'?t.toUpperCase():t] + '</span>';
    btn.onclick = () => chessResolvePromotion(t); wrap.appendChild(btn);
  });
  document.getElementById('chessPromoOverlay').style.display = 'flex';
}
function hideChessPromoModal(){ const el = document.getElementById('chessPromoOverlay'); if(el) el.style.display = 'none'; }
function chessResolvePromotion(choice){
  const mv = chessPendingPromotion; chessPendingPromotion = null; hideChessPromoModal();
  if(mv) chessCommitMove(mv, choice); chessDraw();
}

// Event Listener Tombol
document.getElementById('btnChessFlip').onclick = () => { 
  chessFlipped = !chessFlipped; 
  const pieces = document.querySelectorAll('.piece-wrapper');
  pieces.forEach(p => {
    p.style.transform = getTransformString(parseInt(p.dataset.x), parseInt(p.dataset.y));
  });
  chessDraw(); 
};
document.getElementById('btnChessBack').onclick = () => { if(chessClockInterval) clearInterval(chessClockInterval); if(activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };
document.getElementById('btnChessMenu').onclick = () => { if(chessClockInterval) clearInterval(chessClockInterval); if(activePresenceRef) activePresenceRef.remove(); clearSession(); location.reload(); };