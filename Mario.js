// ======================================================
// Mario.js — Game 1: Mario Coin Rush (Multiplayer)
// Membutuhkan shared.js sudah dimuat lebih dulu (pakai variabel
// & fungsi bersama seperti dbRoot, roomRef, myRole, currentGame,
// attachPresence, saveSession, clearSession, dst).
// ======================================================

  // ======================================================
  // ================== GAME 1: MARIO ====================
  // ======================================================
  // Mario sekarang: MULTIPLAYER (bukan cuma 2 pemain), level INFINITE
  // (dibuat prosedural, tidak ada garis finish), dan fokusnya cuma
  // mengumpulkan koin sebanyak-banyaknya. Karakter pemain lain baru
  // digambar begitu mereka benar-benar ada di data 'players' room —
  // jadi kalau belum ada yang join, cuma karakter kita sendiri yang muncul.
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 440; canvas.height = 247;

  const CHUNK_W = 640;
  const GROUND_Y = 210;
  const gravity = 0.45;
  const PLAYER_COLORS = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ec4899'];

  let myPlayerId = null;
  let myChar = null;
  let otherPlayers = {};       // { playerId: {x,y,targetX,targetY,facing,color} }
  let mapSeed = 0, mapStartTime = 0;
  let chunkCache = {};         // { chunkIndex: {platforms,coins,enemies} }
  let coinsTakenSet = {};      // synced dari Firebase: { 'chunkIdx_coinIdx': true }
  let killedEnemiesSet = {};   // synced dari Firebase: { 'chunkIdx_enemyIdx': true } -- musuh yang udah diinjek mati
  let myCoinCount = 0;         // koin milik kita SENDIRI (bukan total gabungan semua pemain)
  let marioActive = true;      // ON/OFF: kalau OFF, karakter kita ilang (dari layar sendiri & dari pemain lain)

  function mulberry32(seed){
    return function(){
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Chunk dibuat murni dari fungsi (chunkIndex, mapSeed) sehingga SEMUA klien
  // menghasilkan layout yang identik tanpa perlu kirim data lewat Firebase.
  function genChunk(idx){
    if(chunkCache[idx]) return chunkCache[idx];
    const rng = mulberry32(mapSeed + idx * 104729 + 1);
    const baseX = idx * CHUNK_W;
    const platforms = [];
    const coins = [];
    const enemies = [];
    const hazards = [];

    const platCount = 2 + Math.floor(rng() * 2);
    for(let i = 0; i < platCount; i++){
      const px = baseX + 60 + i * 220 + rng() * 90;
      const py = 100 + rng() * 90;
      const pw = 55 + rng() * 45;
      platforms.push({ x: px, y: py, w: pw, h: 14 });
      const coinN = 1 + Math.floor(rng() * 2);
      for(let c = 0; c < coinN; c++){
        const cIdx = coins.length;
        coins.push({ x: px + 10 + c * 20, y: py - 30, chunk: idx, idx: cIdx, taken: !!coinsTakenSet[idx + '_' + cIdx] });
      }
    }
    // koin tambahan melayang di udara sepanjang jalan
    if(rng() > 0.4){
      const cIdx = coins.length;
      coins.push({ x: baseX + 300 + rng() * 200, y: 70 + rng() * 40, chunk: idx, idx: cIdx, taken: !!coinsTakenSet[idx + '_' + cIdx] });
    }

    const enemyCount = rng() > 0.25 ? 1 : 0;
    for(let i = 0; i < enemyCount; i++){
      enemies.push({
        idx: i, baseX: baseX + 200 + rng() * 300, y: GROUND_Y - 16, w: 16, h: 16,
        range: 60 + rng() * 60, speed: 0.5 + rng() * 0.5, phase: rng() * Math.PI * 2,
        killed: !!killedEnemiesSet[idx + '_' + i]
      });
    }

    // Rintangan baru: duri statis di tanah. Beda dari hewan kecil (musuh),
    // duri ini GAK BISA diinjek/dikalahkan -- kesentuh dari arah manapun
    // langsung mati dan balik ke checkpoint terakhir.
    if(rng() > 0.55){
      const hw = 26 + rng() * 22;
      hazards.push({ x: baseX + 380 + rng() * 140, y: GROUND_Y - 14, w: hw, h: 14 });
    }

    // sesekali ada platform melayang bergerak (deterministik lewat waktu, tanpa perlu sinkronisasi)
    let movingPlat = null;
    if(rng() > 0.5){
      movingPlat = {
        baseX: baseX + 340 + rng() * 120, y: 150 + rng() * 40, w: 55, h: 12,
        range: 50 + rng() * 30, speed: 0.4 + rng() * 0.3, phase: rng() * Math.PI * 2
      };
    }

    const chunk = { idx, platforms, coins, enemies, hazards, movingPlat };
    chunkCache[idx] = chunk;
    return chunk;
  }

  function chunksAround(x, marginChunks){
    const center = Math.floor(x / CHUNK_W);
    const list = [];
    for(let i = center - marginChunks; i <= center + marginChunks; i++) list.push(genChunk(i));
    return list;
  }

  function timeNow(){ return (Date.now() - mapStartTime) / 1000; }

  function enemyCurrentX(e){ return e.baseX + Math.sin(timeNow() * e.speed + e.phase) * e.range; }
  function platCurrentX(p){ return p.baseX + Math.sin(timeNow() * p.speed + p.phase) * p.range; }

  function initMario(){
    myPlayerId = (myRole === 'p1' ? 'host_' : 'pl_') + getDeviceId();
    document.getElementById('marioRoleTag').textContent = myRole === 'p1' ? 'HOST' : 'PEMAIN';
    document.getElementById('playersCounter').textContent = '👥 1';

    otherPlayers = {};
    chunkCache = {};
    coinsTakenSet = {};
    killedEnemiesSet = {};
    myCoinCount = pendingResumeCoin || 0;
    pendingResumeCoin = 0;
    marioActive = true;
    setMarioToggleUI(true);
    myChar = { x: 30, y: 140, w: 18, h: 24, vx: 0, vy: 0, grounded: false, facing: 'right', checkX: 30, checkY: 140 };
    window.keys = { left: false, right: false };
    document.getElementById('coinCounter').textContent = '🪙 ' + myCoinCount;

    attachPresence('marioStatus', roomIdGlobal);

    // Ambil mapSeed & waktu mulai room supaya semua pemain menghasilkan level yang sama persis.
    // PENTING: game loop (dan genChunk yang meng-cache hasilnya permanen)
    // BARU boleh mulai SETELAH mapSeed asli ini sampai. Sebelumnya
    // requestAnimationFrame(marioLoop) langsung jalan di baris terakhir
    // initMario() tanpa nunggu fetch async ini selesai, jadi chunk di
    // sekitar titik spawn keburu ke-generate & ke-cache pakai mapSeed
    // default (1) sebelum mapSeed asli datang. Karena tiap HP beda
    // kecepatan koneksinya, tiap pemain akhirnya dapat layout awal yang
    // beda-beda padahal harusnya identik. Nunggu dulu di sini supaya
    // SEMUA pemain pasti pakai mapSeed yang sama sebelum chunk pertama
    // dibuat.
    roomRef.once('value').then(snap => {
      const d = snap.val() || {};
      mapSeed = d.mapSeed || 1;
      mapStartTime = d.created || Date.now();
      lastMarioTs = 0;
      requestAnimationFrame(marioLoop);
    });

    const myPresRef = roomRef.child('players/' + myPlayerId);
    dbRoot.ref('.info/connected').on('value', (snap) => {
      if(snap.val() === true){
        myPresRef.onDisconnect().remove();
      }
    });
    // Jaring pengaman tambahan: onDisconnect() Firebase butuh koneksi
    // socket beneran putus, dan di WebView WhatsApp/mobile itu suka
    // telat kedeteksi (tab dipindah, app di-minimize, dll). pagehide
    // langsung hapus node kita begitu halaman ditinggalkan, jadi counter
    // 👥 gak nyangkut ke-itung padahal orangnya udah pergi.
    window.addEventListener('pagehide', () => { myPresRef.remove(); });

    // Render pemain lain HANYA kalau memang ada datanya di Firebase —
    // jadi karakter lawan baru kelihatan begitu mereka benar-benar join.
    roomRef.child('players').on('value', (snap) => {
      const data = snap.val() || {};
      const seenIds = new Set();
      Object.keys(data).forEach(pid => {
        if(pid === myPlayerId) return;
        seenIds.add(pid);
        const d = data[pid];
        if(!otherPlayers[pid]){
          let hash = 0; for(let i = 0; i < pid.length; i++) hash = (hash * 31 + pid.charCodeAt(i)) | 0;
          const color = PLAYER_COLORS[Math.abs(hash) % PLAYER_COLORS.length];
          otherPlayers[pid] = { x: d.x, y: d.y, targetX: d.x, targetY: d.y, facing: d.facing || 'right', color };
        } else {
          otherPlayers[pid].targetX = d.x;
          otherPlayers[pid].targetY = d.y;
          otherPlayers[pid].facing = d.facing || 'right';
        }
      });
      Object.keys(otherPlayers).forEach(pid => { if(!seenIds.has(pid)) delete otherPlayers[pid]; });
      document.getElementById('playersCounter').textContent = '👥 ' + (seenIds.size + (marioActive ? 1 : 0));
    });

    // coinsTaken cuma dipakai buat sinkronisasi DUNIA (biar koin yang udah
    // diambil siapapun gak muncul lagi / gak bisa diambil dobel). Angka yang
    // ditampilkan di layar tetap koin milik KITA SENDIRI (myCoinCount), bukan
    // total gabungan semua pemain.
    roomRef.child('coinsTaken').on('value', (snap) => {
      coinsTakenSet = snap.val() || {};
      Object.keys(chunkCache).forEach(ci => {
        chunkCache[ci].coins.forEach(c => { c.taken = !!coinsTakenSet[c.chunk + '_' + c.idx]; });
      });
    });

    // Sinkronisasi musuh yang udah diinjek mati -- biar begitu satu pemain
    // ngalahin musuh, musuh itu ilang juga di layar pemain lain (gak muncul
    // lagi / gak bisa "membunuh" siapa-siapa lagi).
    roomRef.child('enemiesKilled').on('value', (snap) => {
      killedEnemiesSet = snap.val() || {};
      Object.keys(chunkCache).forEach(ci => {
        chunkCache[ci].enemies.forEach(e => { e.killed = !!killedEnemiesSet[ci + '_' + e.idx]; });
      });
    });

    window.marioPosInterval = setInterval(() => {
      if(!roomRef || !myChar) return;
      if(!marioActive) return; // OFF -> jangan kirim posisi, node kita udah dihapus dari Firebase
      roomRef.child('players/' + myPlayerId).set({ x: Math.round(myChar.x), y: Math.round(myChar.y), facing: myChar.facing });
    }, 40);
  }

  function marioRespawnToCheckpoint(){
    myChar.x = myChar.checkX; myChar.y = myChar.checkY; myChar.vx = 0; myChar.vy = 0;
  }

  function rectOverlap(a, b){
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function marioUpdate(dt){
    if(!myChar || currentGame !== 'mario') return;
    if(!marioActive) return; // mario lagi OFF -> jangan update fisika/posisi sama sekali

    if(window.keys.left) { myChar.vx = -2.8; myChar.facing = 'left'; }
    else if(window.keys.right) { myChar.vx = 2.8; myChar.facing = 'right'; }
    else { myChar.vx *= 0.8; }

    myChar.vy += gravity * dt;
    if(myChar.vy > 12) myChar.vy = 12; // batasi kecepatan jatuh biar gak sempat "nembus" dataran tipis

    const lerp = Math.min(1, 0.35 * dt); // di-clamp biar gak overshoot pas dt gede (abis tab di-background)
    Object.values(otherPlayers).forEach(p => {
      p.x += (p.targetX - p.x) * lerp;
      p.y += (p.targetY - p.y) * lerp;
    });

    const nearChunks = chunksAround(myChar.x, 2);

    // Kumpulkan semua "dataran" solid (platform diam + platform yang lagi
    // bergerak) jadi satu daftar rect, dipakai buat tabrakan horizontal & vertikal.
    const solids = [];
    nearChunks.forEach(chunk => {
      chunk.platforms.forEach(p => solids.push(p));
      if(chunk.movingPlat){
        const mp = chunk.movingPlat;
        solids.push({ x: platCurrentX(mp), y: mp.y, w: mp.w, h: mp.h });
      }
    });

    // ===== GERAK HORIZONTAL + TABRAKAN =====
    myChar.x += myChar.vx * dt;
    if(myChar.x < 5) myChar.x = 5;
    solids.forEach(s => {
      if(rectOverlap(myChar, s)){
        if(myChar.vx > 0) myChar.x = s.x - myChar.w;
        else if(myChar.vx < 0) myChar.x = s.x + s.w;
        myChar.vx = 0;
      }
    });

    // ===== GERAK VERTIKAL + TABRAKAN =====
    // Sebelumnya di sini cuma dicek posisi AKHIR tiap frame, jadi kalau
    // gerak vertikalnya cukup jauh dalam satu frame (abis loncat, atau HP
    // sempat nge-lag lalu dt-nya gede), karakter bisa "loncat" dari atas
    // ke bawah dataran (atau sebaliknya) tanpa pernah overlap di frame
    // manapun -> nembus. Sekarang dibandingin posisi SEBELUM (prevY) vs
    // SESUDAH (myChar.y) gerak, jadi tabrakan pasti kedeteksi walau
    // gerakannya cepat.
    const prevY = myChar.y;
    myChar.y += myChar.vy * dt;
    myChar.grounded = false;
    solids.forEach(s => {
      const overlapX = myChar.x < s.x + s.w && myChar.x + myChar.w > s.x;
      if(!overlapX) return;
      if(myChar.vy >= 0){
        // lagi jatuh/turun: berdiri di ATAS dataran begitu kaki "melewati" permukaannya
        if(prevY + myChar.h <= s.y + 1 && myChar.y + myChar.h >= s.y){
          myChar.y = s.y - myChar.h;
          myChar.vy = 0;
          myChar.grounded = true;
        }
      } else {
        // lagi loncat ke atas: kejedot bagian BAWAH dataran, berhenti (bentrok), gak nembus
        if(prevY >= s.y + s.h - 1 && myChar.y <= s.y + s.h){
          myChar.y = s.y + s.h;
          myChar.vy = 0;
        }
      }
    });

    // Lantai dasar tak berujung (tidak ada jurang / garis finish)
    if(myChar.y + myChar.h >= GROUND_Y){
      myChar.y = GROUND_Y - myChar.h;
      myChar.vy = 0;
      myChar.grounded = true;
    }

    if(myChar.grounded) { myChar.checkX = myChar.x; myChar.checkY = myChar.y; }

    // Jatuh ke jurang virtual (di bawah layar) -> balik ke checkpoint terakhir, bukan game over
    if(myChar.y > canvas.height + 60) marioRespawnToCheckpoint();

    // ===== KOIN =====
    nearChunks.forEach(chunk => {
      chunk.coins.forEach(c => {
        if(c.taken) return;
        if(myChar.x < c.x + 12 && myChar.x + myChar.w > c.x && myChar.y < c.y + 12 && myChar.y + myChar.h > c.y){
          c.taken = true;
          roomRef.child('coinsTaken/' + c.chunk + '_' + c.idx).set(true);
          myCoinCount++;
          document.getElementById('coinCounter').textContent = '🪙 ' + myCoinCount;
          // Simpan ulang sesi tiap koin nambah (bukan cuma sekali di enterGame
          // sebelum koin mulai dikumpulkan) - supaya kalau ke-back/reload,
          // "Lanjutkan Room" balikin counter pribadi yang akurat, sinkron
          // dengan coinsTaken di Firebase yang memang tidak bisa diambil ulang.
          saveSession();
        }
      });
    });

    // ===== HEWAN KECIL (musuh) =====
    // Aturan: kalau KITA yang nginjek dari ATAS (lagi jatuh & posisi sebelumnya
    // ada di atas musuh) -> musuhnya yang mati. Kalau kesenggol dari arah
    // lain (samping/bawah) -> KITA yang mati, balik ke checkpoint terakhir.
    nearChunks.forEach(chunk => {
      chunk.enemies.forEach(e => {
        if(e.killed) return;
        const ex = enemyCurrentX(e);
        const eRect = { x: ex, y: e.y, w: e.w, h: e.h };
        if(!rectOverlap(myChar, eRect)) return;
        const wasAbove = prevY + myChar.h <= eRect.y + 6;
        if(myChar.vy >= 0 && wasAbove){
          e.killed = true;
          roomRef.child('enemiesKilled/' + chunk.idx + '_' + e.idx).set(true);
          myChar.vy = -6.5; // mantul dikit abis nginjek, kayak Mario asli
        } else {
          marioRespawnToCheckpoint();
        }
      });

      // ===== RINTANGAN BARU: duri =====
      // Beda dari hewan kecil, duri statis ini GAK bisa diinjek/dikalahkan --
      // kesentuh dari arah manapun langsung bikin kita mati & balik ke checkpoint.
      chunk.hazards.forEach(h => {
        if(rectOverlap(myChar, h)) marioRespawnToCheckpoint();
      });
    });
  }

  function drawPlayer(p, color){
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y + 6, p.w, p.h - 6);
    ctx.fillStyle = '#ffcc99';
    ctx.fillRect(p.x + (p.facing === 'right' ? 4 : 0), p.y + 4, 12, 8);
    ctx.fillStyle = color;
    ctx.fillRect(p.x + (p.facing === 'right' ? 2 : -2), p.y, 16, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(p.x + (p.facing === 'right' ? 12 : 3), p.y + 6, 2, 2);
  }

  function marioDraw(){
    if(!myChar || currentGame !== 'mario') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let cameraX = myChar.x - 100;
    if(cameraX < 0) cameraX = 0;
    ctx.save();
    ctx.translate(-cameraX, 0);

    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(cameraX, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    for(let i = 0; i < 3; i++){
      const cx = cameraX + 80 + i * 160;
      ctx.beginPath();
      ctx.arc(cx, 50, 16, 0, Math.PI * 2);
      ctx.arc(cx + 20, 45, 20, 0, Math.PI * 2);
      ctx.arc(cx + 40, 50, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // lantai tak berujung
    ctx.fillStyle = '#c84c0c';
    ctx.fillRect(cameraX - 20, GROUND_Y, canvas.width + 40, 60);
    ctx.fillStyle = '#00a800';
    ctx.fillRect(cameraX - 20, GROUND_Y, canvas.width + 40, 4);

    const nearChunks = chunksAround(myChar.x, 2);
    nearChunks.forEach(chunk => {
      chunk.platforms.forEach(p => {
        ctx.fillStyle = '#c84c0c';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#00a800';
        ctx.fillRect(p.x, p.y, p.w, 4);
      });
      if(chunk.movingPlat){
        const mp = chunk.movingPlat;
        ctx.fillStyle = '#fc9838';
        ctx.fillRect(platCurrentX(mp), mp.y, mp.w, mp.h);
      }
      chunk.coins.forEach(c => {
        if(c.taken) return;
        ctx.fillStyle = '#ffd33d';
        ctx.beginPath(); ctx.arc(c.x + 6, c.y + 6, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e3a800';
        ctx.beginPath(); ctx.arc(c.x + 6, c.y + 6, 6, 0, Math.PI * 2); ctx.stroke();
      });
      chunk.enemies.forEach(e => {
        if(e.killed) return;
        const ex = enemyCurrentX(e);
        ctx.fillStyle = '#a81000';
        ctx.fillRect(ex, e.y, e.w, e.h);
        ctx.fillStyle = '#fff';
        ctx.fillRect(ex + 2, e.y + 4, 3, 4);
        ctx.fillRect(ex + 11, e.y + 4, 3, 4);
      });
      chunk.hazards.forEach(h => {
        // Duri: rintangan statis, gak bisa diinjek, kesentuh dari arah manapun = mati.
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(h.x, h.y + h.h - 3, h.w, 3);
        ctx.fillStyle = '#e8e8e8';
        const spikeW = 8;
        for(let sx = h.x; sx < h.x + h.w; sx += spikeW){
          ctx.beginPath();
          ctx.moveTo(sx, h.y + h.h);
          ctx.lineTo(sx + spikeW / 2, h.y);
          ctx.lineTo(sx + spikeW, h.y + h.h);
          ctx.closePath();
          ctx.fill();
        }
      });
    });

    // Karakter pemain lain HANYA digambar kalau memang sudah join
    Object.values(otherPlayers).forEach(p => drawPlayer(p, p.color));
    // Karakter kita sendiri cuma digambar kalau mario lagi ON
    if(marioActive) drawPlayer(myChar, myRole === 'p1' ? PLAYER_COLORS[0] : PLAYER_COLORS[1]);

    ctx.restore();
  }

  let lastMarioTs = 0;
  function marioLoop(ts){
    if(!lastMarioTs) lastMarioTs = ts;
    // dt dinormalisasi ke satuan "1 frame @60fps". Di-clamp max 3 supaya kalau
    // tab sempat di-background lama (host pindah app share kode room), pas
    // balik lagi karakternya gak tiba-tiba loncat jauh / nembus tembok.
    let dt = (ts - lastMarioTs) / (1000 / 60);
    lastMarioTs = ts;
    dt = Math.max(0, Math.min(dt, 3));

    marioUpdate(dt); marioDraw();
    if(currentGame === 'mario') requestAnimationFrame(marioLoop);
  }

  const bL = document.getElementById('btnLeft');
  const bR = document.getElementById('btnRight');
  const bJ = document.getElementById('btnJump');
  const setLeft = (val) => window.keys ? window.keys.left = val : null;
  const setRight = (val) => window.keys ? window.keys.right = val : null;

  bL.addEventListener('touchstart', (e)=>{ e.preventDefault(); setLeft(true); });
  bL.addEventListener('touchend', (e)=>{ e.preventDefault(); setLeft(false); });
  bR.addEventListener('touchstart', (e)=>{ e.preventDefault(); setRight(true); });
  bR.addEventListener('touchend', (e)=>{ e.preventDefault(); setRight(false); });
  bL.addEventListener('mousedown', ()=> setLeft(true));
  bL.addEventListener('mouseup', ()=> setLeft(false));
  bL.addEventListener('mouseleave', ()=> setLeft(false));
  bR.addEventListener('mousedown', ()=> setRight(true));
  bR.addEventListener('mouseup', ()=> setRight(false));
  bR.addEventListener('mouseleave', ()=> setRight(false));

  function doJump(){ if(myChar && myChar.grounded){ myChar.vy = -9.2; myChar.grounded = false; } }
  bJ.addEventListener('touchstart', (e)=>{ e.preventDefault(); doJump(); });
  bJ.addEventListener('mousedown', doJump);

  document.addEventListener('keydown', (e)=>{
    if(currentGame !== 'mario' || !window.keys) return;
    if(e.code === 'ArrowLeft' || e.code === 'KeyA') setLeft(true);
    if(e.code === 'ArrowRight' || e.code === 'KeyD') setRight(true);
    if(e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space'){ e.preventDefault(); doJump(); }
  });
  document.addEventListener('keyup', (e)=>{
    if(currentGame !== 'mario' || !window.keys) return;
    if(e.code === 'ArrowLeft' || e.code === 'KeyA') setLeft(false);
    if(e.code === 'ArrowRight' || e.code === 'KeyD') setRight(false);
  });

  function setMarioToggleUI(active){
    const btn = document.getElementById('btnMarioToggle');
    const banner = document.getElementById('marioOffBanner');
    const controls = document.querySelectorAll('#marioScreen .btn-game');
    btn.textContent = active ? '🟢 ON' : '🔴 OFF';
    btn.classList.toggle('off', !active);
    banner.classList.toggle('show', !active);
    controls.forEach(c => c.style.opacity = active ? '1' : '0.35');
    controls.forEach(c => c.style.pointerEvents = active ? 'auto' : 'none');
  }

  document.getElementById('btnMarioToggle').onclick = () => {
    marioActive = !marioActive;
    setMarioToggleUI(marioActive);
    if(!marioActive){
      // OFF: hapus karakter kita dari Firebase biar ilang juga di layar pemain lain,
      // dan hentikan gerakan/input kita sendiri.
      window.keys.left = false; window.keys.right = false;
      if(myChar){ myChar.vx = 0; }
      if(roomRef && myPlayerId) roomRef.child('players/' + myPlayerId).remove();
    } else {
      // ON lagi: langsung kirim posisi sekarang biar pemain lain kelihatan lagi tanpa nunggu interval
      if(roomRef && myChar){
        roomRef.child('players/' + myPlayerId).set({ x: Math.round(myChar.x), y: Math.round(myChar.y), facing: myChar.facing });
      }
    }
  };

  document.getElementById('btnMarioBack').onclick = () => {
    if(roomRef && myPlayerId) roomRef.child('players/' + myPlayerId).remove();
    if(activePresenceRef) activePresenceRef.remove();
    clearSession();
    location.reload();
  };

