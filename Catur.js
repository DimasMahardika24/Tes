// ======================================================
// Catur.js — Game 2: Catur 2P Online (Fixed & Optimized)
// ======================================================

  const pieceUnicode = {k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟',K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙'};
  let chessBoardState, chessTurn, chessSelected = null, chessFlipped = false, myChessColor, chessGameOver = false;
  let chessCastling, chessEP, chessHalfmove = 0;
  let chessClocks = null;          
  let chessTurnStartAt = null;     
  let chessClockInterval = null;
  let chessPendingPromotion = null;

  const CHESS_REASON_TEXT = {
    checkmate: 'Skakmat',
    stalemate: 'Remis — Stalemate (buntu, tak ada langkah legal)',
    insufficient: 'Remis — Materi tidak cukup untuk skakmat',
    threefold: 'Remis — Posisi berulang 3 kali',
    fifty: 'Remis — Aturan 50 langkah',
    timeout: 'Waktu habis'
  };

  function chessColorOf(p){ if(!p) return null; return p === p.toUpperCase() ? 'w' : 'b'; }

  function chessStartingState(){
    return {
      board: [
        ['r','n','b','q','k','b','n','r'],
        ['p','p','p','p','p','p','p','p'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['P','P','P','P','P','P','P','P'],
        ['R','N','B','Q','K','B','N','R']
      ],
      turn: 'w',
      castling: { wK:true, wQ:true, bK:true, bQ:true },
      ep: null,
      halfmove: 0,
      clocks: chessTimeControl > 0 ? { w: chessTimeControl*1000, b: chessTimeControl*1000 } : null,
      turnStartAt: chessTimeControl > 0 ? Date.now() : null
    };
  }

  function chessStateToFirebase(st){
    return {
      board: JSON.stringify(st.board), turn: st.turn, castling: st.castling,
      ep: st.ep, halfmove: st.halfmove, clocks: st.clocks, turnStartAt: st.turnStartAt
    };
  }

    function initChess(){
    myChessColor = myRole === 'p1' ? 'w' : 'b';
    const roleTag = document.getElementById('chessRoleTag');
    if(roleTag) roleTag.textContent = myRole === 'p1' ? 'HOST (Putih)' : 'JOINER (Hitam)';
    
    chessFlipped = myChessColor === 'b';
    chessSelected = null;
    chessGameOver = false;
    chessPendingPromotion = null;
    
    const winOverlay = document.getElementById('chessWinOverlay');
    if(winOverlay) winOverlay.style.display = 'none';
    hideChessPromoModal();

    // PAKSA PAKAI BOARD STARTING LANGSUNG
    const starting = chessStartingState();
    chessBoardState = starting.board;
    chessTurn = starting.turn;
    chessCastling = starting.castling;
    chessEP = starting.ep;
    chessHalfmove = starting.halfmove;
    chessClocks = starting.clocks;

    // GAMBAR PAPAN SEGERA
    chessDraw();

    attachPresence('chessStatus', roomIdGlobal);

    // Dapatkan data state real-time dari Firebase
    roomRef.child('state').on('value', (snap) => {
      const data = snap.val();
      if(!data) return;
      chessBoardState = typeof data.board === 'string' ? JSON.parse(data.board) : data.board;
      chessTurn = data.turn;
      chessCastling = data.castling || { wK:false, wQ:false, bK:false, bQ:false };
      chessEP = data.ep || null;
      chessHalfmove = data.halfmove || 0;
      chessClocks = data.clocks || null;
      chessTurnStartAt = data.turnStartAt || null;
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
        if(!snap.exists()){
          roomRef.child('state').set(chessStateToFirebase(chessStartingState()));
        }
      });
      roomRef.child('result').remove();
      roomRef.child('posCounts').remove();
    }

    if(chessClockInterval) clearInterval(chessClockInterval);
    chessClockInterval = setInterval(chessUpdateClockUI, 250);
  }


  // ---------- Deteksi Serangan & Skak ----------
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
        if(p){
          if(chessColorOf(p) === byColor && chars.indexOf(p.toLowerCase()) !== -1) return true;
          break;
        }
        cx += dx; cy += dy;
      }
    }
    return false;
  }

  function chessSquareAttacked(board, x, y, byColor){
    if(byColor === 'w'){
      if(y+1 < 8){
        if(x-1 >= 0 && board[y+1][x-1] === 'P') return true;
        if(x+1 < 8 && board[y+1][x+1] === 'P') return true;
      }
    } else {
      if(y-1 >= 0){
        if(x-1 >= 0 && board[y-1][x-1] === 'p') return true;
        if(x+1 < 8 && board[y-1][x+1] === 'p') return true;
      }
    }
    const N = byColor === 'w' ? 'N' : 'n';
    const nOff = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for(const [dx,dy] of nOff){
      const nx=x+dx, ny=y+dy;
      if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === N) return true;
    }
    const K = byColor === 'w' ? 'K' : 'k';
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx && !dy) continue;
      const nx=x+dx, ny=y+dy;
      if(nx>=0 && nx<8 && ny>=0 && ny<8 && board[ny][nx] === K) return true;
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

  // ---------- Generate Langkah Legal ----------
  function chessPieceMoves(board, state, x, y){
    const p = board[y][x];
    if(!p) return [];
    const color = chessColorOf(p);
    const type = p.toLowerCase();
    const moves = [];
    const addIfOk = (x2,y2,extra) => {
      if(x2<0 || x2>7 || y2<0 || y2>7) return;
      const t = board[y2][x2];
      if(t && chessColorOf(t) === color) return;
      moves.push(Object.assign({x1:x,y1:y,x2,y2,capture:!!t,flag:null,promotion:false}, extra||{}));
    };
    if(type === 'p'){
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const lastRow = color === 'w' ? 0 : 7;
      if(y+dir>=0 && y+dir<8 && !board[y+dir][x]){
        moves.push({x1:x,y1:y,x2:x,y2:y+dir,capture:false,flag:null,promotion:(y+dir===lastRow)});
        if(y===startRow && !board[y+2*dir][x]){
          moves.push({x1:x,y1:y,x2:x,y2:y+2*dir,capture:false,flag:'double',promotion:false});
        }
      }
      for(const dx of [-1,1]){
        const nx=x+dx, ny=y+dir;
        if(nx<0 || nx>7 || ny<0 || ny>7) continue;
        const t = board[ny][nx];
        if(t && chessColorOf(t) !== color){
          moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:null,promotion:(ny===lastRow)});
        } else if(!t && state.ep && state.ep.x===nx && state.ep.y===ny){
          moves.push({x1:x,y1:y,x2:nx,y2:ny,capture:true,flag:'enpassant',promotion:false,epCapture:{x:nx,y:y}});
        }
      }
    } else if(type === 'n'){
      [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([dx,dy]) => addIfOk(x+dx,y+dy));
    } else if(type === 'k'){
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(dx||dy) addIfOk(x+dx,y+dy); }
      const rights = state.castling || {};
      const homeRow = color === 'w' ? 7 : 0;
      const oppColor = color === 'w' ? 'b' : 'w';

      if(y===homeRow && x===4 && !chessSquareAttacked(board,x,y,oppColor)){
        const canCastleK = color === 'w' ? rights.wK : rights.bK;
        if(canCastleK && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7]===(color==='w'?'R':'r')){
          if(!chessSquareAttacked(board,5,homeRow,oppColor) && !chessSquareAttacked(board,6,homeRow,oppColor)){
            moves.push({x1:x,y1:y,x2:6,y2:homeRow,capture:false,flag:'castleK',promotion:false});
          }
        }
        const canCastleQ = color === 'w' ? rights.wQ : rights.bQ;
        if(canCastleQ && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] && board[homeRow][0]===(color==='w'?'R':'r')){
          if(!chessSquareAttacked(board,3,homeRow,oppColor) && !chessSquareAttacked(board,2,homeRow,oppColor)){
            moves.push({x1:x,y1:y,x2:2,y2:homeRow,capture:false,flag:'castleQ',promotion:false});
          }
        }
      }
    } else {
      const dirs = type==='r' ? [[1,0],[-1,0],[0,1],[0,-1]]
        : type==='b' ? [[1,1],[1,-1],[-1,1],[-1,-1]]
        : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [dx,dy] of dirs){
        let cx=x+dx, cy=y+dy;
        while(cx>=0 && cx<8 && cy>=0 && cy<8){
          const t = board[cy][cx];
          if(t){ if(chessColorOf(t)!==color) addIfOk(cx,cy); break; }
          addIfOk(cx,cy);
          cx+=dx; cy+=dy;
        }
      }
    }
    return moves;
  }

  function chessApplyMove(board, state, move, promoteTo){
    const nb = board.map(r => r.slice());
    const nc = Object.assign({}, state.castling);
    const piece = nb[move.y1][move.x1];
    const color = chessColorOf(piece);
    let capturedPiece = nb[move.y2][move.x2];
    nb[move.y1][move.x1] = '';
    let placed = piece;
    if(move.promotion){
      const valid = {q:1,r:1,b:1,n:1};
      const choice = (promoteTo && valid[promoteTo]) ? promoteTo : 'q';
      placed = color==='w' ? choice.toUpperCase() : choice;
    }
    nb[move.y2][move.x2] = placed;

    if(move.flag === 'enpassant'){
      nb[move.epCapture.y][move.epCapture.x] = '';
      capturedPiece = color==='w' ? 'p' : 'P';
    }
    if(move.flag === 'castleK'){
      const row = move.y1;
      nb[row][5] = nb[row][7]; nb[row][7] = '';
    }
    if(move.flag === 'castleQ'){
      const row = move.y1;
      nb[row][3] = nb[row][0]; nb[row][0] = '';
    }

    if(piece==='K'){ nc.wK=false; nc.wQ=false; }
    if(piece==='k'){ nc.bK=false; nc.bQ=false; }
    if(move.x1===0 && move.y1===7) nc.wQ=false;
    if(move.x1===7 && move.y1===7) nc.wK=false;
    if(move.x1===0 && move.y1===0) nc.bQ=false;
    if(move.x1===7 && move.y1===0) nc.bK=false;
    if(move.x2===0 && move.y2===7) nc.wQ=false;
    if(move.x2===7 && move.y2===7) nc.wK=false;
    if(move.x2===0 && move.y2===0) nc.bQ=false;
    if(move.x2===7 && move.y2===0) nc.bK=false;

    const newEp = move.flag==='double' ? {x:move.x1, y:(move.y1+move.y2)/2} : null;
    const isPawnMove = piece.toLowerCase()==='p';
    const newHalfmove = (isPawnMove || capturedPiece) ? 0 : (state.halfmove||0)+1;

    return { board: nb, castling: nc, ep: newEp, halfmove: newHalfmove, capturedPiece };
  }

  function chessLegalMovesForSquare(board, state, x, y){
    const p = board[y][x];
    if(!p) return [];
    const color = chessColorOf(p);
    const pseudo = chessPieceMoves(board, state, x, y);
    const legal = [];
    for(const m of pseudo){
      const promoChoice = m.promotion ? 'q' : null;
      const res = chessApplyMove(board, state, m, promoChoice);
      if(!chessIsInCheck(res.board, color)) legal.push(m);
    }
    return legal;
  }

  function chessAllLegalMoves(board, state, color){
    let all = [];
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){
      const p = board[y][x];
      if(p && chessColorOf(p)===color) all = all.concat(chessLegalMovesForSquare(board,state,x,y));
    }
    return all;
  }

  function chessIsInsufficientMaterial(board){
    const pieces = [];
    for(let y=0;y<8;y++) for(let x=0;x<8;x++){
      const p = board[y][x];
      if(p && p.toLowerCase() !== 'k') pieces.push({p,x,y});
    }
    if(pieces.length === 0) return true;
    if(pieces.length === 1){
      const t = pieces[0].p.toLowerCase();
      return t==='n' || t==='b';
    }
    if(pieces.length === 2){
      const [a,b] = pieces;
      if(a.p.toLowerCase()==='b' && b.p.toLowerCase()==='b' && chessColorOf(a.p)!==chessColorOf(b.p)){
        if((a.x+a.y)%2 === (b.x+b.y)%2) return true;
      }
      return false;
    }
    return false;
  }

  function chessPositionKey(board, turn, castling, ep){
    let s = '';
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) s += (board[y][x] || '0');
    s += '_' + turn + '_' + (castling.wK?1:0)+(castling.wQ?1:0)+(castling.bK?1:0)+(castling.bQ?1:0);
    s += '_' + (ep ? (ep.x+'-'+ep.y) : 'n');
    return 'k' + s;
  }

  function chessDraw(){
    const bd = document.getElementById('chessBoard');
    if(!bd) return;
    bd.innerHTML = '';

    // FALLBACK: Jika Firebase belum kirim data, gunakan papan default sementara
    const board = chessBoardState || [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];

    let validMoves = [];
    if(chessSelected && chessBoardState){
      validMoves = chessLegalMovesForSquare(chessBoardState, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
    }

    for(let y=0; y<8; y++){
      for(let x=0; x<8; x++){
        const ry = chessFlipped ? 7 - y : y;
        const rx = chessFlipped ? 7 - x : x;
        const cell = document.createElement('div');
        cell.className = 'cell ' + ((rx + ry) % 2 ? 'dark' : 'light');
        
        if(chessSelected && chessSelected.x === rx && chessSelected.y === ry) cell.classList.add('selected');
        
        const move = validMoves.find(m => m.x2 === rx && m.y2 === ry);
        if(move) cell.classList.add(move.capture ? 'capture' : 'valid');
        
        // Aman dari error undefined
        const p = board[ry][rx];
        if(p) cell.innerHTML = '<span class="piece ' + (chessColorOf(p)==='w' ? 'white' : 'black') + '">' + pieceUnicode[p] + '</span>';
        
        cell.onclick = () => chessHandleClick(rx, ry);
        bd.appendChild(cell);
      }
    }

    const myTurn = chessTurn === myChessColor && !chessGameOver;
    let statusTxt;
    if(chessGameOver){
      statusTxt = 'Game selesai';
    } else {
      statusTxt = myTurn ? '🟢 Giliranmu (' + (myChessColor==='w'?'Putih':'Hitam') + ')' : '⏳ Giliran lawan...';
      if(chessBoardState && chessIsInCheck(chessBoardState, chessTurn)) statusTxt += (myTurn ? ' — Rajamu SKAK!' : ' — Raja lawan skak');
    }
    
    const statusEl = document.getElementById('chessStatus');
    if(statusEl) statusEl.textContent = statusTxt;
  }

  function chessHandleClick(x, y){
    if(chessGameOver || chessPendingPromotion || !chessBoardState) return;
    if(chessTurn !== myChessColor) return;
    const p = chessBoardState[y][x];
    if(chessSelected){
      const legalMoves = chessLegalMovesForSquare(chessBoardState, {castling:chessCastling, ep:chessEP}, chessSelected.x, chessSelected.y);
      const mv = legalMoves.find(m => m.x2===x && m.y2===y);
      if(mv){
        chessSelected = null;
        if(mv.promotion){
          chessPendingPromotion = mv;
          showChessPromoModal(myChessColor);
        } else {
          chessCommitMove(mv, null);
        }
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
      const remain = Math.max(0, (chessClocks[moverColor]||0) - elapsed);
      newClocks = Object.assign({}, chessClocks, { [moverColor]: remain });
      newTurnStartAt = Date.now();
    }

    roomRef.child('state').set({
      board: JSON.stringify(result.board), turn: nextTurn, castling: result.castling,
      ep: result.ep, halfmove: result.halfmove, clocks: newClocks, turnStartAt: newTurnStartAt
    });

    // Pengecekan Threefold Repetition
    const key = chessPositionKey(result.board, nextTurn, result.castling, result.ep);
    roomRef.child('posCounts/' + key).transaction(c => (c||0) + 1).then(res => {
      if(res.committed && res.snapshot.val() >= 3) chessDeclareResult('draw', 'threefold');
    }).catch(()=>{});

    const legalNext = chessAllLegalMoves(result.board, {castling: result.castling, ep: result.ep}, nextTurn);
    if(legalNext.length === 0){
      if(chessIsInCheck(result.board, nextTurn)) chessDeclareResult(myRole, 'checkmate');
      else chessDeclareResult('draw', 'stalemate');
    } else if(result.halfmove >= 100){
      chessDeclareResult('draw', 'fifty');
    } else if(chessIsInsufficientMaterial(result.board)){
      chessDeclareResult('draw', 'insufficient');
    }
  }

  function chessDeclareResult(winner, reason){
    roomRef.child('result').transaction(cur => cur || { winner, reason });
  }

  function chessFormatClock(ms){
    if(ms < 0) ms = 0;
    const total = Math.ceil(ms/1000);
    const m = Math.floor(total/60), s = total%60;
    return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  }

  function chessUpdateClockUI(){
    const wrap = document.getElementById('chessClockWrap');
    if(!wrap) return;
    if(!chessClocks){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    let liveW = chessClocks.w, liveB = chessClocks.b;
    if(!chessGameOver && chessTurnStartAt){
      const elapsed = Date.now() - chessTurnStartAt;
      if(chessTurn === 'w') liveW = Math.max(0, chessClocks.w - elapsed);
      else liveB = Math.max(0, chessClocks.b - elapsed);
    }
    const myLive = myChessColor === 'w' ? liveW : liveB;
    const oppLive = myChessColor === 'w' ? liveB : liveW;
    const meEl = document.getElementById('chessClockMe'), oppEl = document.getElementById('chessClockOpp');
    if(meEl) {
      meEl.textContent = chessFormatClock(myLive);
      meEl.classList.toggle('low', myLive < 30000);
    }
    if(oppEl) {
      oppEl.textContent = chessFormatClock(oppLive);
      oppEl.classList.toggle('low', oppLive < 30000);
    }

    if(!chessGameOver){
      if(liveW <= 0) chessDeclareResult('p2', 'timeout');
      else if(liveB <= 0) chessDeclareResult('p1', 'timeout');
    }
  }

  function showChessResult(r){
    const overlay = document.getElementById('chessWinOverlay');
    const textEl = document.getElementById('chessWinText');
    if(!overlay || !textEl) return;
    const reasonTxt = CHESS_REASON_TEXT[r.reason] || '';
    if(r.winner === 'draw'){
      textEl.innerHTML = '🤝 REMIS<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';
    } else {
      const won = r.winner === myRole;
      textEl.innerHTML = (won ? '🏆 KAMU MENANG!' : '😢 LAWAN MENANG!') + '<br><span style="font-size:13px;opacity:.85">' + reasonTxt + '</span>';
    }
    overlay.style.display = 'flex';
  }

  function showChessPromoModal(color){
    const wrap = document.getElementById('chessPromoChoices');
    if(!wrap) return;
    wrap.innerHTML = '';
    ['q','r','b','n'].forEach(t => {
      const key = color === 'w' ? t.toUpperCase() : t;
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.innerHTML = '<span class="piece ' + (color==='w'?'white':'black') + '">' + pieceUnicode[key] + '</span>';
      btn.onclick = () => chessResolvePromotion(t);
      wrap.appendChild(btn);
    });
    document.getElementById('chessPromoOverlay').style.display = 'flex';
  }

  function hideChessPromoModal(){
    const el = document.getElementById('chessPromoOverlay');
    if(el) el.style.display = 'none';
  }

  function chessResolvePromotion(choice){
    const mv = chessPendingPromotion;
    chessPendingPromotion = null;
    hideChessPromoModal();
    if(mv) chessCommitMove(mv, choice);
    chessDraw();
  }

  const btnFlip = document.getElementById('btnChessFlip');
  if(btnFlip) btnFlip.onclick = () => { chessFlipped = !chessFlipped; chessDraw(); };

  const btnBack = document.getElementById('btnChessBack');
  if(btnBack) btnBack.onclick = () => {
    if(chessClockInterval){ clearInterval(chessClockInterval); chessClockInterval = null; }
    if(activePresenceRef) activePresenceRef.remove();
    clearSession(); location.reload();
  };

  const btnMenu = document.getElementById('btnChessMenu');
  if(btnMenu) btnMenu.onclick = () => {
    if(chessClockInterval){ clearInterval(chessClockInterval); chessClockInterval = null; }
    if(activePresenceRef) activePresenceRef.remove();
    clearSession(); location.reload();
  };
