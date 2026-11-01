// ======================================================
// touch.js — Lapisan gesture sentuh untuk Uno, Poker Capsa & Domino
// - Seret kartu ke meja / geser ke atas  => langsung dimainkan
// - Poker: geser menyamping melintasi kartu => pilih banyak kartu sekaligus
// - Uno & Poker: tahan kartu => pratinjau besar
// - Domino: seret ke papan, lepas di kiri/kanan untuk pilih sisi
// - Getar (haptic), kartu "terbang" ke meja, kembali mulus kalau dibatalkan
// Tap biasa tetap memakai handler lama (tidak ada yang diganti).
// Dimuat paling akhir, setelah semua file game.
// ======================================================
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DRAG_START = 9;       // px sebelum dianggap drag
  const SWIPE_UP = 64;        // px geser ke atas = langsung main
  const HOLD_MS = 380;        // tahan untuk pratinjau

  // ---------------------- CSS ----------------------
  const st = document.createElement('style');
  st.textContent = `
    button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    #unoHandMe .capsa-card-img, #capsaHandMe .capsa-card-img, #dominoHand .dm-tile {
      touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
    }
    .gh-ghost { position: fixed; left: 0; top: 0; z-index: 2000; pointer-events: none; margin: 0; will-change: transform;
      transform-origin: 50% 55%; filter: drop-shadow(0 16px 16px rgba(0,0,0,.55)); }
    .gh-ghost.gh-img { border-radius: 7px; background: #fff; object-fit: contain; }
    .gh-ghost.gh-armed { filter: drop-shadow(0 0 10px rgba(232,172,31,.95)) drop-shadow(0 16px 16px rgba(0,0,0,.55)); }
    .gh-wrap { position: fixed; left: 0; top: 0; z-index: 2000; pointer-events: none; will-change: transform; transform-origin: 50% 55%; }
    .gh-wrap .gh-img { display: block; border-radius: 7px; background: #fff; object-fit: contain; position: absolute; left: 0; top: 0;
      box-shadow: 0 10px 22px rgba(0,0,0,.55); }
    .gh-wrap.gh-armed .gh-img { box-shadow: 0 0 0 3px #e8ac1f, 0 0 22px rgba(232,172,31,.85), 0 10px 22px rgba(0,0,0,.55); }
    .gh-badge { position: absolute; z-index: 3; background: #e8ac1f; color: #1a1a1a; font: 800 12px 'Space Grotesk', sans-serif;
      border-radius: 12px; padding: 2px 8px; box-shadow: 0 2px 6px rgba(0,0,0,.5); }
    .gh-src { opacity: .25 !important; transition: none !important; }
    .gh-zone { transition: box-shadow .16s ease, background-color .16s ease; }
    .gh-zone-on { box-shadow: inset 0 0 0 2px #e8ac1f, 0 0 24px rgba(232,172,31,.5) !important; background-color: rgba(232,172,31,.14) !important; }
    #dominoBoard.gh-L { background-image: linear-gradient(90deg, rgba(232,172,31,.42), rgba(232,172,31,0) 55%), radial-gradient(circle at 50% 40%, #17603f, #0d3d29) !important; }
    #dominoBoard.gh-R { background-image: linear-gradient(270deg, rgba(232,172,31,.42), rgba(232,172,31,0) 55%), radial-gradient(circle at 50% 40%, #17603f, #0d3d29) !important; }
    .gh-dm { display: inline-flex; flex-direction: column; background: #f6f1e3; border-radius: 6px; border: 1px solid #b9ae93; }
    .gh-dm .dm-half { width: var(--s); height: var(--s); display: grid; grid-template-columns: repeat(3,1fr); grid-template-rows: repeat(3,1fr); padding: 3px; box-sizing: content-box; }
    .gh-dm .dm-sep { height: 2px; margin: 0 3px; background: #9a8f74; }
    .gh-dm .dm-dot { width: 70%; height: 70%; margin: auto; border-radius: 50%; background: #1a1a1a; }
    .gh-preview { position: fixed; left: 50%; z-index: 2100; pointer-events: none; transform: translateX(-50%) scale(.7); opacity: 0;
      transition: transform .18s cubic-bezier(.2,1.3,.4,1), opacity .15s ease; }
    .gh-preview.on { transform: translateX(-50%) scale(1); opacity: 1; }
    .gh-preview img { display: block; width: 150px; height: auto; border-radius: 10px; background: #fff;
      box-shadow: 0 0 0 3px #e8ac1f, 0 18px 40px rgba(0,0,0,.7); }
    .gh-hint { font-size: 12px; color: var(--ink-dim, #8a94a6); text-align: center; margin-top: 8px; line-height: 1.45; }
    @media (pointer: coarse) {
      .capsa-act { min-height: 54px; font-size: 16px; }
      #dominoScreen .dm-hand { --s: 31px; gap: 10px; }
      #dominoScreen .dm-act { padding: 14px 20px; font-size: 15px; border-radius: 12px; }
      #unoHandMe[data-dense="1"] { padding-left: 18px; gap: 4px; }
      #unoHandMe[data-dense="1"] .capsa-card-img { margin-left: -18px; }
      #unoHandMe[data-dense="1"] .capsa-card-img.selected { z-index: 5; }
    }
  `;
  document.head.appendChild(st);

  // ---------------------- Pratinjau tahan ----------------------
  let previewEl = null;
  function showPreview(src, anchorRect) {
    if (!previewEl) { previewEl = document.createElement('div'); previewEl.className = 'gh-preview'; previewEl.innerHTML = '<img alt="">'; document.body.appendChild(previewEl); }
    previewEl.firstChild.src = src;
    const h = 150 * 1.42;
    previewEl.style.top = Math.max(8, anchorRect.top - h - 18) + 'px';
    requestAnimationFrame(() => previewEl && previewEl.classList.add('on'));
  }
  function hidePreview() { if (previewEl) previewEl.classList.remove('on'); }

  // ---------------------- Ghost ----------------------
  function imgGhost(el, count) {
    const r = el.getBoundingClientRect();
    const wrap = document.createElement('div');
    wrap.className = 'gh-wrap';
    wrap.style.width = r.width + 'px'; wrap.style.height = r.height + 'px';
    const n = Math.min(count || 1, 4);
    for (let i = n - 1; i >= 0; i--) {            // kartu pertama paling atas, sisanya menumpuk di belakang
      const im = new Image(); im.src = el.src; im.className = 'gh-img';
      im.style.width = r.width + 'px'; im.style.height = r.height + 'px';
      im.style.transform = 'translate(' + (i * 7) + 'px,' + (-i * 3) + 'px) rotate(' + (i * 4) + 'deg)';
      wrap.appendChild(im);
    }
    if (count > 1) { const b = document.createElement('div'); b.className = 'gh-badge'; b.textContent = '×' + count; b.style.top = '-10px'; b.style.right = '-14px'; wrap.appendChild(b); }
    document.body.appendChild(wrap);
    return { node: wrap, w: r.width, h: r.height };
  }
  function domGhost(el) {
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    g.className = 'gh-ghost gh-dm';
    g.removeAttribute('data-id'); g.onclick = null;
    g.style.setProperty('--s', getComputedStyle(el).getPropertyValue('--s') || '28px');
    document.body.appendChild(g);
    return { node: g, w: r.width, h: r.height };
  }

  // ---------------------- Mesin drag ----------------------
  function attachDrag(cfg) {
    const cont = $(cfg.container);
    if (!cont) return;
    let s = null;
    let clickGuard = false;

    const swallowClick = ev => { if (clickGuard) { ev.stopPropagation(); ev.preventDefault(); clickGuard = false; } };
    cont.addEventListener('click', swallowClick, true);
    cont.addEventListener('contextmenu', e => { if (e.target.closest(cfg.item)) e.preventDefault(); });

    cont.addEventListener('pointerdown', e => {
      if (s) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = e.target.closest(cfg.item);
      if (!el || !cont.contains(el)) return;
      s = { el, id: cfg.idOf ? cfg.idOf(el) : null, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
            type: e.pointerType, mode: 'wait', ghost: null, armed: false, visited: null, sweepTo: null, info: {} };
      if (cfg.onHold) s.timer = setTimeout(() => { if (s && s.mode === 'wait') { s.mode = 'hold'; cfg.onHold(s.el); buzz(8); } }, HOLD_MS);
      window.addEventListener('pointermove', onMove, { passive: false, capture: true });
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    });

    function cleanupListeners() {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    }

    function place(g, x, y, rot, scale) {
      g.node.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + scale + ')';
    }

    function startDrag() {
      s.mode = 'drag';
      const r = s.el.getBoundingClientRect();
      s.rect = r;
      s.grabX = s.x0 - r.left; s.grabY = s.y0 - r.top;
      s.lift = s.type === 'touch' ? 38 : 0;
      s.ghost = cfg.ghost(s.el);
      s.zone = cfg.zone ? cfg.zone() : null;
      if (s.zone) s.zone.classList.add('gh-zone');
      s.el.classList.add('gh-src');
      if (cfg.onDragStart) cfg.onDragStart(s);
      buzz(6);
    }

    function evalArmed() {
      const dy = s.y - s.y0;
      const info = { x: s.x, y: s.y, up: dy <= -SWIPE_UP, zone: s.zone, over: false };
      if (s.zone) {
        const z = s.zone.getBoundingClientRect(), pad = 14;
        info.over = s.x >= z.left - pad && s.x <= z.right + pad && (s.y - s.lift) >= z.top - pad && (s.y - s.lift) <= z.bottom + pad;
      }
      s.info = info;
      return cfg.armed ? !!cfg.armed(info, s) : (info.over || info.up);
    }

    function onMove(e) {
      if (!s || e.pointerId !== s.pid) return;
      s.x = e.clientX; s.y = e.clientY;
      const dx = s.x - s.x0, dy = s.y - s.y0;

      if (s.mode === 'wait' || s.mode === 'hold') {
        if (Math.hypot(dx, dy) < DRAG_START) return;
        clearTimeout(s.timer);
        if (s.mode === 'hold' && cfg.onHoldEnd) cfg.onHoldEnd(s.el);
        if (cfg.sweep && Math.abs(dx) > Math.abs(dy) * 1.5 && dy > -14) {
          if (cfg.sweep.canStart && !cfg.sweep.canStart(s.el)) { s.mode = 'ignore'; }
          else {
            s.mode = 'sweep'; s.visited = new Set(); s.sweepTo = cfg.sweep.begin(s.el);
            s.visited.add(s.el); cfg.sweep.apply(s.el, s.sweepTo);
          }
        } else {
          startDrag();
        }
      }
      if (s.mode === 'ignore') return;
      if (e.cancelable) e.preventDefault();

      if (s.mode === 'sweep') {
        const under = document.elementFromPoint(s.x, s.y);
        const it = under && under.closest ? under.closest(cfg.item) : null;
        if (it && cont.contains(it) && !s.visited.has(it)) { s.visited.add(it); cfg.sweep.apply(it, s.sweepTo); }
        return;
      }

      if (s.mode === 'drag') {
        const rot = Math.max(-14, Math.min(14, dx * 0.07));
        place(s.ghost, s.x - s.grabX, s.y - s.grabY - s.lift, rot, s.armed ? 1.0 : 1.1);
        const armed = evalArmed();
        if (armed !== s.armed) {
          s.armed = armed;
          s.ghost.node.classList.toggle('gh-armed', armed);
          if (s.zone) s.zone.classList.toggle('gh-zone-on', armed);
          if (armed) buzz(10);
        }
        if (cfg.onDragMove) cfg.onDragMove(s);
      }
    }

    function endCommon() {
      clearTimeout(s.timer);
      cleanupListeners();
      if (s.zone) { s.zone.classList.remove('gh-zone-on'); }
      if (cfg.onDragEnd) cfg.onDragEnd(s);
    }

    function snapBack(g, srcEl) {
      const r = s.rect;
      const node = g.node;
      const done = () => { node.remove(); srcEl.classList.remove('gh-src'); };
      if (REDUCED || !node.animate) return done();
      const cur = node.style.transform;
      const a = node.animate([{ transform: cur }, { transform: 'translate3d(' + r.left + 'px,' + r.top + 'px,0) rotate(0deg) scale(1)' }],
        { duration: 240, easing: 'cubic-bezier(.2,1.1,.4,1)' });
      a.onfinish = done; a.oncancel = done;
    }

    function flyOut(g) {
      const node = g.node;
      const z = s.zone ? s.zone.getBoundingClientRect() : null;
      const tx = z ? z.left + z.width / 2 - g.w / 2 : s.x - s.grabX;
      const ty = z ? z.top + z.height / 2 - g.h / 2 : s.y - s.grabY - 140;
      const done = () => node.remove();
      if (REDUCED || !node.animate) return done();
      const a = node.animate([{ transform: node.style.transform, opacity: 1 },
        { transform: 'translate3d(' + tx + 'px,' + ty + 'px,0) rotate(0deg) scale(.82)', opacity: 0 }],
        { duration: 220, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'forwards' });
      a.onfinish = done; a.oncancel = done;
    }

    function onUp(e) {
      if (!s || e.pointerId !== s.pid) return;
      s.x = e.clientX; s.y = e.clientY;
      const mode = s.mode;
      if (mode === 'drag') {
        s.armed = evalArmed();
        const g = s.ghost, el = s.el, armed = s.armed;
        let res = 'back';
        if (armed && cfg.onDrop) { try { res = cfg.onDrop(el, s.info, s); } catch (err) { console.error(err); res = 'back'; } }
        else if (!armed && Math.hypot(s.x - s.x0, s.y - s.y0) > 30 && cfg.onMiss) cfg.onMiss(el);
        endCommon();
        if (res === true) { flyOut(g); setTimeout(() => el.classList.remove('gh-src'), 60); buzz([12, 30, 12]); }
        else { snapBack(g, el); if (res === false) buzz([30, 40, 30]); }
        clickGuard = true; setTimeout(() => { clickGuard = false; }, 350);
      } else if (mode === 'sweep') {
        endCommon(); clickGuard = true; setTimeout(() => { clickGuard = false; }, 350);
      } else if (mode === 'hold') {
        if (cfg.onHoldEnd) cfg.onHoldEnd(s.el);
        endCommon(); clickGuard = true; setTimeout(() => { clickGuard = false; }, 350);
      } else {
        endCommon();      // tap biasa -> biarkan 'click' lama bekerja
      }
      s = null;
    }

    function onCancel(e) {
      if (!s || e.pointerId !== s.pid) return;
      if (s.mode === 'hold' && cfg.onHoldEnd) cfg.onHoldEnd(s.el);
      const g = s.ghost, el = s.el;
      endCommon();
      if (g) snapBack(g, el);
      s = null;
    }
  }

  // ======================================================
  // UNO
  // ======================================================
  function bindUno() {
    attachDrag({
      container: '#unoHandMe', item: '.capsa-card-img',
      zone: () => { const t = $('#unoTopCardImg'); return t ? (t.closest('.capsa-center') || t) : null; },
      ghost: el => imgGhost(el, (selectedUnoKeys.has(el._card.id) ? selectedUnoKeys.size : 1)),
      onHold: el => showPreview(el.src, el.getBoundingClientRect()),
      onHoldEnd: hidePreview,
      onDrop: el => {
        const d = latestUnoData;
        if (!d || d.phase !== 'playing' || d.turn !== myRole) { unoSfx('bad'); unoShake(el); return false; }
        const card = el._card;
        if (!selectedUnoKeys.has(card.id)) {
          if (!el.classList.contains('playable')) { unoSfx('bad'); unoShake(el); return false; }
          const selCard = Array.from(document.querySelectorAll('#unoHandMe .capsa-card-img')).map(x => x._card).find(c => selectedUnoKeys.has(c.id));
          if (selCard && String(selCard.value) !== String(card.value)) selectedUnoKeys.clear();
          selectedUnoKeys.add(card.id);
        }
        unoGetAudio();
        unoPaintHand(d);
        unoDoPlay();
        return true;
      }
    });
    addHint('#unoActions', '👆 Ketuk = pilih · seret kartu ke meja / geser ke atas = langsung buang · tahan = perbesar', true);
  }

  // ======================================================
  // POKER CAPSA
  // ======================================================
  function bindPoker() {
    const canSel = () => { const d = latestPokerData; return !!d && d.phase === 'playing' && d.turn === myRole; };
    attachDrag({
      container: '#capsaHandMe', item: '.capsa-card-img',
      idOf: el => el.dataset.key,
      zone: () => $('#capsaCenter'),
      ghost: el => imgGhost(el, (selectedKeys.has(el.dataset.key) ? selectedKeys.size : 1)),
      onHold: el => showPreview(el.src, el.getBoundingClientRect()),
      onHoldEnd: hidePreview,
      sweep: {
        canStart: () => true,
        begin: el => !selectedKeys.has(el.dataset.key),
        apply: (el, want) => {
          const d = latestPokerData;
          if (!canSel()) { if (!el._ghShook) { el._ghShook = true; pokerShakeCard(el); setTimeout(() => { el._ghShook = false; }, 400); } return; }
          const k = el.dataset.key, has = selectedKeys.has(k);
          if (want && !has) selectedKeys.add(k); else if (!want && has) selectedKeys.delete(k); else return;
          pokerGetAudio(); pokerSfx('tick'); buzz(4);
          pokerPaintHand(d); pokerUpdatePreview(d);
        }
      },
      onDrop: el => {
        const d = latestPokerData;
        if (!d || d.phase !== 'playing' || d.turn !== myRole) { pokerShakeCard(el); try { pokerSfx('bad'); } catch (e) {} return false; }
        const k = el.dataset.key;
        pokerGetAudio();
        if (selectedKeys.has(k)) {
          /* mainkan seluruh pilihan */
        } else if (selectedKeys.size === 0) {
          selectedKeys.add(k);
        } else {                              // sudah ada pilihan lain: kartu ini cuma ditambahkan
          selectedKeys.add(k); pokerSfx('tick');
          pokerPaintHand(d); pokerUpdatePreview(d);
          return 'back';
        }
        pokerPaintHand(d); pokerUpdatePreview(d);
        pokerDoPlay();
        return true;
      }
    });
  }

  // ======================================================
  // DOMINO
  // ======================================================
  function bindDomino() {
    const hand = $('#dominoHand'), board = $('#dominoBoard');
    if (!hand || !board) return;

    function movesFor(id) {
      const d = latestDomino;
      if (!d || d.phase !== 'playing' || d.turn !== myRole) return [];
      const h = dmArr(d.hands && d.hands[myRole]);
      return dominoMoves(h, dmArr(d.board), d).filter(m => String(m.tile.id) === String(id));
    }
    function sideFor(moves, x) {
      if (moves.length === 1) return moves[0].side;
      const r = board.getBoundingClientRect();
      return x < r.left + r.width / 2 ? 'l' : 'r';
    }
    const hintEl = () => $('#dominoHint');

    attachDrag({
      container: '#dominoHand', item: '.dm-tile',
      idOf: el => el.dataset.id,
      zone: () => board,
      ghost: el => domGhost(el),
      armed: (info, s) => {
        const hr = hand.getBoundingClientRect();
        const above = (s.y - s.lift) < hr.top - 10;                 // di atas tangan = area papan
        const ok = (info.over || above) && movesFor(s.id).length > 0;
        board.classList.remove('gh-L', 'gh-R');
        if (ok) {
          const mv = movesFor(s.id);
          if (mv.length > 1) {
            const side = sideFor(mv, s.x);
            board.classList.add(side === 'l' ? 'gh-L' : 'gh-R');
            const e = dominoEnds(dmArr(latestDomino.board));
            const h = hintEl(); if (h) h.textContent = side === 'l' ? '◀ Lepas = taruh di KIRI (' + e.l + ')' : 'Lepas = taruh di KANAN (' + e.r + ') ▶';
          }
        }
        return ok;
      },
      onDragEnd: () => board.classList.remove('gh-L', 'gh-R'),
      onDrop: (el, info, s) => {
        const mv = movesFor(s.id);
        if (!mv.length) { dominoSfx('bad'); return false; }
        const side = sideFor(mv, s.x);
        const m = mv.find(x => x.side === side) || mv[0];
        dominoSfx('');
        dominoPlay(m.tile.id, m.side);
        return true;
      },
      onMiss: () => { /* lepas di luar papan = batal */ }
    });
    addHint('#dominoHand', '👆 Ketuk kartu hijau = jalan · atau seret ke papan (kiri/kanan untuk pilih sisi)', false);
  }

  function addHint(sel, text, before) {
    const ref = $(sel);
    if (!ref || !ref.parentNode || ref.parentNode.querySelector('.gh-hint[data-for="' + sel + '"]')) return;
    const h = document.createElement('div');
    h.className = 'gh-hint'; h.dataset.for = sel; h.textContent = text;
    if (before) ref.parentNode.insertBefore(h, ref); else ref.parentNode.insertBefore(h, ref.nextSibling);
  }

  function init() {
    try { bindUno(); } catch (e) { console.error('touch uno', e); }
    try { bindPoker(); } catch (e) { console.error('touch poker', e); }
    try { bindDomino(); } catch (e) { console.error('touch domino', e); }
  }
  init();
})();
