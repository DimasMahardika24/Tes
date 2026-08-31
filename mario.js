// =========================================================================
// MODULE & DEPENDENCIES
// =========================================================================
const crypto = require('crypto');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

module.exports = async (naze, m, command, args, text, senderId, prefix, chatId, isOwner, Reply, fkontak, store) => {
    
    const checkRegistration = async (m, isOwner, isRegistered) => {
        if (typeof global.checkRegistration === 'function') {
            return await global.checkRegistration(m, isOwner, isRegistered);
        }
        return true;
    };

    const checkLimit = (m, user) => {
        if (typeof global.checkLimit === 'function') {
            return global.checkLimit(m, user);
        }
        return false;
    };

    const isRegistered = (user) => global.db?.users?.[user]?.registered === true;

    switch (command) {

        case 'mario':
        case 'mario2p':
        case 'mariomulti': {
            if (!(await checkRegistration(m, isOwner, isRegistered(senderId)))) return true;
            if (checkLimit(m, global.db?.users?.[senderId])) return true;

            // Role Player (p1 = Mario/Merah, p2 = Luigi/Hijau) & Room ID dari Chat ID
            let role = (args[0] && args[0].toLowerCase() === 'p2') ? 'p2' : 'p1';
            let roomId = chatId.replace(/[^a-zA-Z0-9]/g, '');

            await naze.sendMessage(chatId, { react: { text: "🍄", key: m.key } });

            const marioFullData = {
                botForwardedMessage: {
                    message: {
                        richResponseMessage: {
                            messageType: 1,
                            unifiedResponse: {
                                data: Buffer.from(JSON.stringify({
                                    __typename: "GenAIUnifiedResponse",
                                    response_id: crypto.randomUUID(),
                                    sections: [{
                                        __typename: "GenAIUnifiedResponseSection",
                                        view_model: {
                                            __typename: "GenAISingleLayoutViewModel",
                                            primitive: {
                                                __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
                                                trusted_sources: [],
                                                payload: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
*{box-sizing:border-box;user-select:none;-webkit-user-select:none;margin:0;padding:0}
html,body{width:100%;background:transparent;font-family:-apple-system,'Segoe UI',Arial,sans-serif}
body{padding:8px}
.card{width:100%;max-width:500px;margin:0 auto;background:#1a1f24;border:1px solid #2d333b;border-radius:16px;padding:12px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px}
.title{font-size:16px;font-weight:700;color:#f0f2f5}
.scoreboard{display:flex;gap:12px;font-size:12px;font-weight:700;color:#f7c548;background:#121619;padding:4px 10px;border-radius:6px;border:1px solid #2d333b}
.status{font-size:12px;color:#1abc84;margin-bottom:8px;font-weight:600;text-align:center;background:#121619;padding:4px;border-radius:6px}
.game-wrapper{width:100%;aspect-ratio:16/9;position:relative;background:#5c94fc;border-radius:8px;overflow:hidden;border:1px solid #2d333b}
canvas{width:100%;height:100%;display:block}
.touch-controls{display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:0 4px}
.dpad,.actions{display:flex;gap:8px}
.btn-game{width:46px;height:46px;background:#262b33;border:1px solid #3d444d;color:#fff;border-radius:10px;font-size:18px;font-weight:bold;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}
.btn-game:active{background:#1abc84;transform:scale(0.95)}
.btn-jump{width:65px;background:#e74c3c}
</style></head><body>
<div class="card">
  <div class="header">
    <div class="title">🍄 Mario 2P Online</div>
    <div class="scoreboard">
      <span>Role: <b id="roleTag">${role.toUpperCase()}</b></span>
    </div>
  </div>
  <div class="status" id="status">Menghubungkan Cloud Server...</div>
  <div class="game-wrapper">
    <canvas id="canvas"></canvas>
  </div>
  <div class="touch-controls">
    <div class="dpad">
      <button class="btn-game" id="btnLeft">◀</button>
      <button class="btn-game" id="btnRight">▶</button>
    </div>
    <div class="actions">
      <button class="btn-game btn-jump" id="btnJump">LOMPAT</button>
    </div>
  </div>
</div>

<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>

<script>(function(){
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = 400; canvas.height = 225;

const myRole = "${role}";
const roomId = "${roomId}";

const firebaseConfig = {
  databaseURL: "https://mario-multiplayer-default-rtdb.asia-southeast1.firebasedatabase.app"
};
if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database().ref('rooms/' + roomId);

let myChar, opponentChar, platforms, keys;
const gravity = 0.45;

function init(){
  myChar = { 
    x: myRole === 'p1' ? 30 : 60, 
    y: 140, w: 16, h: 20, vx: 0, vy: 0, 
    grounded: false, color: myRole === 'p1' ? '#e74c3c' : '#2ecc71' 
  };

  opponentChar = { 
    x: myRole === 'p1' ? 60 : 30, 
    y: 140, w: 16, h: 20, 
    color: myRole === 'p1' ? '#2ecc71' : '#e74c3c' 
  };

  keys = { left: false, right: false };

  platforms = [
    { x: 0, y: 195, w: 700, h: 30 },
    { x: 90, y: 150, w: 60, h: 12 },
    { x: 200, y: 120, w: 80, h: 12 },
    { x: 330, y: 150, w: 70, h: 12 },
    { x: 450, y: 120, w: 90, h: 12 }
  ];

  document.getElementById('status').textContent = 'Online! Kamu: ' + (myRole === 'p1' ? 'Mario (Merah)' : 'Luigi (Hijau)');

  const opponentRole = myRole === 'p1' ? 'p2' : 'p1';
  db.child(opponentRole).on('value', (snapshot) => {
    const data = snapshot.val();
    if(data){
      opponentChar.x = data.x;
      opponentChar.y = data.y;
    }
  });
}

function sendMyPosition(){
  db.child(myRole).set({
    x: Math.round(myChar.x),
    y: Math.round(myChar.y)
  });
}

setInterval(sendMyPosition, 100);

function update(){
  if(keys.left) myChar.vx = -2.5;
  else if(keys.right) myChar.vx = 2.5;
  else myChar.vx = 0;

  myChar.vy += gravity;
  myChar.x += myChar.vx;
  myChar.y += myChar.vy;

  myChar.grounded = false;
  platforms.forEach(p => {
    if(myChar.x < p.x + p.w && myChar.x + myChar.w > p.x &&
       myChar.y + myChar.h >= p.y && myChar.y + myChar.h <= p.y + p.h + myChar.vy){
        myChar.y = p.y - myChar.h;
        myChar.vy = 0;
        myChar.grounded = true;
    }
  });

  if(myChar.x < 0) myChar.x = 0;
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let cameraX = myChar.x - 80;
  if(cameraX < 0) cameraX = 0;

  ctx.save();
  ctx.translate(-cameraX, 0);

  // Background
  ctx.fillStyle = '#5c94fc';
  ctx.fillRect(cameraX, 0, canvas.width, canvas.height);

  // Platforms
  platforms.forEach(p => {
    ctx.fillStyle = '#c84c0c';
    ctx.fillRect(p.x, p.y, p.w, p.h);
  });

  // Player Lawan
  ctx.fillStyle = opponentChar.color;
  ctx.fillRect(opponentChar.x, opponentChar.y, opponentChar.w, opponentChar.h);

  // Player Saya
  ctx.fillStyle = myChar.color;
  ctx.fillRect(myChar.x, myChar.y, myChar.w, myChar.h);

  ctx.restore();
}

function gameLoop(){
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

const btnL = document.getElementById('btnLeft');
const btnR = document.getElementById('btnRight');
const btnJ = document.getElementById('btnJump');

btnL.ontouchstart = () => keys.left = true;
btnL.ontouchend = () => keys.left = false;
btnR.ontouchstart = () => keys.right = true;
btnR.ontouchend = () => keys.right = false;
btnJ.onclick = () => {
  if(myChar.grounded){ myChar.vy = -9; myChar.grounded = false; }
};

init();
gameLoop();
})();</script></body></html>`
                                            }
                                        }
                                    }]
                                })).toString("base64")
                            },
                            contextInfo: { isForwarded: true, forwardOrigin: 4 }
                        }
                    }
                }
            };

            const msg = generateWAMessageFromContent(chatId, marioFullData, {});
            await naze.relayMessage(chatId, msg.message, { messageId: msg.key.id });



            return true;
        }

        default:
            return false;
    }
};
