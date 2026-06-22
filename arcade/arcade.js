// =============================================================================
// CODEX ARCADE — shell logic: card menu, navigation, launch/exit, neon backdrop
// =============================================================================

/** Presentation data (art, copy, theme) keyed by game id.
 *  The launcher (runtime.js) supplies the live list + ports; this supplies looks. */
const PRESENTATION = {
  'mortal-codex': {
    kicker: 'NEON DOJO BRAWLER',
    title: 'MORTAL CODEX',
    tag: 'Two fighters step into the neon arena. Chain strikes, block, and unleash specials to drop your rival and take the round.',
    meta: ['1–2P', 'FIGHTING'],
    theme: '#ff2d4a',
    theme2: '#2d7cff',
    art: (a) => `
      <div class="ambient"></div>
      <div class="fighters">
        <img class="f-left"  src="${a}/mc-fighter-left.png"  alt="" draggable="false" />
        <img class="f-right" src="${a}/mc-fighter-right.png" alt="" draggable="false" />
      </div>
      <div class="vs-badge">VS</div>
      <div class="floor"></div>`,
  },
  'flamethrow': {
    kicker: 'ARCADE FIREBALL HOOPS',
    title: 'FLAMETHROW',
    tag: 'Sink buckets to stoke the fire meter. Keep the streak alive and the whole court erupts into roaring multipliers.',
    meta: ['1P', 'HOOPS'],
    theme: '#9b5cff',
    theme2: '#37c8ff',
    art: () => `
      <div class="ambient"></div>
      <svg class="flame-court" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice"
           fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="ftBall" cx="38%" cy="32%" r="72%">
            <stop offset="0" stop-color="#ffdca8"/>
            <stop offset="34%" stop-color="#ff912f"/>
            <stop offset="100%" stop-color="#a63806"/>
          </radialGradient>
          <radialGradient id="ftGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stop-color="#ffd36b" stop-opacity="0.9"/>
            <stop offset="42%" stop-color="#ff6a1f" stop-opacity="0.42"/>
            <stop offset="100%" stop-color="#9b5cff" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="ftRim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#ff7a18"/>
            <stop offset="1" stop-color="#ffd23f"/>
          </linearGradient>
          <linearGradient id="ftFlame" x1="0" y1="1" x2="0.25" y2="0">
            <stop offset="0" stop-color="#9b5cff" stop-opacity="0.15"/>
            <stop offset="0.35" stop-color="#ff5a1f"/>
            <stop offset="0.74" stop-color="#ffb02e"/>
            <stop offset="1" stop-color="#fff3c0"/>
          </linearGradient>
          <linearGradient id="ftFlame2" x1="0" y1="1" x2="0.2" y2="0">
            <stop offset="0" stop-color="#ff5a1f" stop-opacity="0.25"/>
            <stop offset="0.5" stop-color="#ffd23f"/>
            <stop offset="1" stop-color="#fff6e0"/>
          </linearGradient>
        </defs>

        <!-- backboard, rim and net (upper right) -->
        <g class="ft-hoop">
          <rect x="352" y="44" width="10" height="150" fill="#16203c" opacity="0.6"/>
          <rect x="226" y="56" width="132" height="98" rx="7" fill="#0a1230" fill-opacity="0.55"
                stroke="#37c8ff" stroke-width="3"/>
          <rect x="266" y="90" width="50" height="40" stroke="#37c8ff" stroke-width="3" opacity="0.85"/>
          <g stroke="#bfe9ff" stroke-opacity="0.5" stroke-width="1.6">
            <path d="M250 172 L268 214 M268 176 L283 216 M291 182 L291 220 M314 176 L299 216 M332 172 L314 214"/>
            <path d="M262 192 Q291 202 320 192 M270 208 Q291 215 312 208"/>
          </g>
          <ellipse cx="291" cy="170" rx="44" ry="13" stroke="url(#ftRim)" stroke-width="7"/>
          <path d="M247 170 A44 13 0 0 0 335 170" stroke="#fff3d0" stroke-width="2.4" opacity="0.55"/>
        </g>

        <!-- predicted swish: dashed arc continuing from the ball into the rim -->
        <path class="ft-arc" d="M238 218 Q274 196 288 182" stroke="#ffd23f" stroke-width="3.5"
              stroke-linecap="round" opacity="0.85"/>

        <!-- fiery comet trail coming up from the lower-left -->
        <path class="ft-trail" d="M238 222 C198 280 170 338 120 434 C178 352 218 296 258 244 Z"
              fill="url(#ftFlame)" opacity="0.92"/>
        <path class="ft-trail ft-trail-2" d="M234 224 C208 276 188 322 156 400 C198 334 228 296 250 246 Z"
              fill="url(#ftFlame2)" opacity="0.95"/>

        <!-- flaming basketball, almost at the rim -->
        <g transform="translate(236 220)">
          <circle r="80" fill="url(#ftGlow)"/>
          <path class="ft-licks" d="M-14 -26 Q-6 -44 2 -54 Q6 -40 12 -34 Q22 -46 22 -60
                Q34 -40 22 -24 Q10 -14 -6 -18 Z" fill="url(#ftFlame)" opacity="0.9"/>
          <g class="ft-ball">
            <circle r="31" fill="url(#ftBall)"/>
            <g stroke="#5a1e06" stroke-width="2.6" fill="none" stroke-opacity="0.9">
              <circle r="31"/>
              <line x1="0" y1="-31" x2="0" y2="31"/>
              <line x1="-31" y1="0" x2="31" y2="0"/>
              <path d="M0 -31 Q-27 0 0 31"/>
              <path d="M0 -31 Q27 0 0 31"/>
            </g>
            <ellipse cx="-10" cy="-12" rx="9" ry="5.5" fill="#fff" opacity="0.38"/>
          </g>
        </g>

        <!-- sparks -->
        <g fill="#ffd36b">
          <circle class="ft-spark" cx="302" cy="156" r="2.6"/>
          <circle class="ft-spark" cx="270" cy="196" r="2" style="animation-delay:.5s"/>
          <circle class="ft-spark" cx="190" cy="300" r="2.4" style="animation-delay:.9s"/>
          <circle class="ft-spark" cx="150" cy="374" r="2" style="animation-delay:1.3s"/>
        </g>
      </svg>
      <div class="floor"></div>`,
  },
};

const DEFAULT_GAMES = [
  { id: 'mortal-codex', title: 'Mortal Codex', port: 4322 },
  { id: 'flamethrow', title: 'Flamethrow', port: 4323 },
];

const ASSETS = '/arcade/assets';
const EXIT_MESSAGE = 'codex-arcade:exit';

const arcade = document.getElementById('arcade');
const cabinet = document.getElementById('cabinet');
const scene = document.getElementById('scene');
const player = document.getElementById('player');
const screen = document.getElementById('screen');
const bezelTitle = document.getElementById('bezelTitle');
const exitBtn = document.getElementById('exitBtn');
const transition = document.getElementById('transition');

const config = window.__ARCADE__ || { games: DEFAULT_GAMES };
const host = config.host || location.hostname || '127.0.0.1';
const proto = config.protocol || location.protocol;
const games = (config.games && config.games.length ? config.games : DEFAULT_GAMES).map((g) => ({
  ...g,
  origin: g.origin || g.path || `${proto}//${host}:${g.port}`,
  pres: PRESENTATION[g.id] || {
    kicker: 'ARCADE',
    title: (g.title || g.id).toUpperCase(),
    tag: '',
    meta: [],
    theme: '#ff2d95',
    theme2: '#16e0ff',
    art: () => '<div class="ambient"></div><div class="floor"></div>',
  },
}));

let state = 'menu'; // 'menu' | 'playing'
let selected = 0;
const cards = [];

// ---------------------------------------------------------------------------
// Render cards
// ---------------------------------------------------------------------------
function buildCards() {
  cabinet.innerHTML = '';
  cards.length = 0;
  games.forEach((game, i) => {
    const p = game.pres;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = game.id;
    card.style.setProperty('--theme', p.theme);
    card.style.setProperty('--theme2', p.theme2);
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', `Play ${p.title}`);
    card.innerHTML = `
      <div class="card-art">${p.art(ASSETS)}</div>
      <div class="card-info">
        <p class="card-kicker">${p.kicker}</p>
        <h2 class="card-title">${p.title}</h2>
        <p class="card-tag">${p.tag}</p>
        <div class="card-meta">${p.meta.map((m) => `<b>${m}</b>`).join('')}</div>
      </div>
      <div class="card-play">&#9654; PLAY</div>`;

    card.addEventListener('mouseenter', () => select(i));
    card.addEventListener('click', () => {
      select(i);
      launch(i);
    });
    cabinet.appendChild(card);
    cards.push(card);
  });
  select(0);
}

function select(i) {
  selected = (i + cards.length) % cards.length;
  cards.forEach((c, idx) => {
    const on = idx === selected;
    c.classList.toggle('is-selected', on);
    c.setAttribute('aria-selected', String(on));
  });
}

// ---------------------------------------------------------------------------
// Launch / exit
// ---------------------------------------------------------------------------
function launch(i) {
  if (state === 'playing') return;
  const game = games[i];
  if (!game) return;
  state = 'playing';

  flash('power-on');
  bezelTitle.textContent = game.pres.title;

  const iframe = document.createElement('iframe');
  iframe.src = game.origin;
  iframe.title = game.pres.title;
  iframe.allow = 'autoplay; gamepad; fullscreen';
  iframe.setAttribute('tabindex', '0');
  screen.innerHTML = '';
  screen.appendChild(iframe);

  player.hidden = false;
  // Force a reflow so removing [hidden] registers before we flip the state —
  // that makes the opacity transition actually animate (and doesn't depend on
  // requestAnimationFrame, which is paused while the tab is hidden).
  void player.offsetWidth;
  arcade.dataset.state = 'playing';
  // Give the game keyboard focus so its controls work immediately.
  setTimeout(() => {
    try { iframe.contentWindow && iframe.contentWindow.focus(); } catch (_) {}
    iframe.focus();
  }, 120);
}

function exitToMenu() {
  if (state !== 'playing') return;
  state = 'menu';
  flash('power-off');
  arcade.dataset.state = 'menu';
  setTimeout(() => {
    screen.innerHTML = '';
    player.hidden = true;
    bezelTitle.textContent = ' ';
  }, 460);
  // re-arm keyboard on the shell
  window.focus();
}

function flash(kind) {
  transition.classList.remove('power-on', 'power-off');
  // force reflow so the animation restarts
  void transition.offsetWidth;
  transition.classList.add(kind);
}

// ---------------------------------------------------------------------------
// Input — keyboard, exit message, gamepad
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (state === 'playing') {
    if (e.key === 'Escape') {
      e.preventDefault();
      exitToMenu();
    }
    return;
  }
  switch (e.key) {
    case 'ArrowRight':
    case 'd':
    case 'D':
      e.preventDefault();
      select(selected + 1);
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      e.preventDefault();
      select(selected - 1);
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      launch(selected);
      break;
    default:
      if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < cards.length) {
          select(idx);
          launch(idx);
        }
      }
  }
});

// Games (in their iframe) post this to ask the cabinet to return to the menu.
window.addEventListener('message', (e) => {
  const data = e.data;
  if (data && (data === EXIT_MESSAGE || data.type === EXIT_MESSAGE)) {
    exitToMenu();
  }
});

exitBtn.addEventListener('click', exitToMenu);

// Gamepad: dpad / left-stick to move, A/Start to play, B to exit.
const padState = { x: 0, a: false, b: false, start: false };
function pollGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let any = null;
  for (const pad of pads) if (pad) { any = pad; break; }
  if (any) {
    const ax = any.axes[0] || 0;
    const dpadL = any.buttons[14] && any.buttons[14].pressed;
    const dpadR = any.buttons[15] && any.buttons[15].pressed;
    const x = dpadL ? -1 : dpadR ? 1 : ax < -0.5 ? -1 : ax > 0.5 ? 1 : 0;
    const a = !!(any.buttons[0] && any.buttons[0].pressed);
    const b = !!(any.buttons[1] && any.buttons[1].pressed);
    const start = !!(any.buttons[9] && any.buttons[9].pressed);

    if (state === 'menu') {
      if (x !== 0 && padState.x === 0) select(selected + x);
      if ((a && !padState.a) || (start && !padState.start)) launch(selected);
    } else if (state === 'playing') {
      if (b && !padState.b) exitToMenu();
    }
    padState.x = x; padState.a = a; padState.b = b; padState.start = start;
  }
  requestAnimationFrame(pollGamepads);
}
requestAnimationFrame(pollGamepads);

// ===========================================================================
// Animated synthwave backdrop
// ===========================================================================
function startBackdrop() {
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  const stars = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars.length = 0;
    const count = Math.round((w * h) / 9000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.6,
        r: Math.random() * 1.4 + 0.2,
        tw: Math.random() * Math.PI * 2,
        sp: Math.random() * 0.04 + 0.01,
      });
    }
  }
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  function frame() {
    t += 1;
    const horizon = h * 0.62;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0a0612');
    sky.addColorStop(0.55, '#1a0b2e');
    sky.addColorStop(1, '#3a1146');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // ground
    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, '#160821');
    ground.addColorStop(1, '#05030a');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    // sun
    const cx = w / 2;
    const sunR = Math.min(w, h) * 0.17;
    const sunY = horizon - sunR * 0.62;
    const glow = ctx.createRadialGradient(cx, sunY, sunR * 0.2, cx, sunY, sunR * 2.2);
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.02);
    glow.addColorStop(0, `rgba(255,120,180,${0.5 + pulse * 0.25})`);
    glow.addColorStop(0.5, 'rgba(255,80,150,0.18)');
    glow.addColorStop(1, 'rgba(255,80,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - sunR * 2.4, sunY - sunR * 2.4, sunR * 4.8, sunR * 4.8);

    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, '#ffe66d');
    sunGrad.addColorStop(0.5, '#ff5da2');
    sunGrad.addColorStop(1, '#9b2fae');
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sunGrad;
    ctx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);
    // sun bands
    ctx.fillStyle = '#1a0b2e';
    for (let i = 0; i < 7; i++) {
      const by = sunY + sunR * 0.25 + i * (sunR * 0.16);
      ctx.fillRect(cx - sunR, by, sunR * 2, Math.max(2, sunR * 0.05 + i * 0.6));
    }
    ctx.restore();

    // stars
    for (const s of stars) {
      s.tw += s.sp;
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(s.tw));
      ctx.fillStyle = `rgba(220,240,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // perspective grid
    ctx.strokeStyle = 'rgba(22,224,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // verticals converging to vanishing point (cx, horizon)
    const lines = 22;
    for (let i = -lines; i <= lines; i++) {
      const fx = cx + (i / lines) * w * 1.1;
      ctx.moveTo(cx + (i / lines) * w * 0.06, horizon);
      ctx.lineTo(fx, h);
    }
    ctx.stroke();
    // horizontals accelerating toward the viewer (scrolling)
    ctx.strokeStyle = 'rgba(255,45,149,0.5)';
    ctx.beginPath();
    const scroll = (t * 0.012) % 1;
    for (let i = 0; i < 16; i++) {
      const p = (i + scroll) / 16;
      const y = horizon + (h - horizon) * (p * p);
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    if (!document.hidden) requestAnimationFrame(frame);
    else setTimeout(() => requestAnimationFrame(frame), 200);
  }
  // Kick the first frame synchronously so the backdrop paints even if the page
  // starts hidden (rAF is paused while hidden); the loop self-schedules after.
  frame();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
buildCards();
startBackdrop();
arcade.dataset.state = 'menu';
