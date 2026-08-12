/**
 * main.js — Silent Shape Game Bootstrap (Optimized)
 *
 * Performance improvements:
 *  - ZERO scene.traverse in game loop
 *  - Artefact list from ChunkManager (flat array, no traverse)
 *  - Building list passed directly to Physics (no traverse)
 *  - Artefact animation via dedicated list, not scene walk
 *  - Collision refresh only when chunk list changes
 *  - Artefact proximity check throttled to every 3 frames
 */
import * as THREE from 'three';
import { InputManager }  from './input/InputManager.js';
import { TouchControls } from './input/TouchControls.js';
import { Player }        from './player/Player.js';
import { Camera }        from './player/Camera.js';
import { Environment }   from './world/Environment.js';
import { ChunkManager }  from './world/ChunkManager.js';
import { HUD }           from './ui/HUD.js';

const ARTEFACT_PICKUP_RADIUS = 4;
const IS_MOBILE  = /Android|iPhone|iPad/i.test(navigator.userAgent);
const PIXEL_RATIO = Math.min(window.devicePixelRatio, IS_MOBILE ? 1.5 : 2);

// ── Fullscreen + Orientation ─────────────────────────────────────────────────
function requestFullscreenLandscape() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (req) {
    req.call(el).then(() => {
      // After fullscreen granted, try to lock landscape
      if (screen?.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    }).catch(() => {
      // Fullscreen refused (common on desktop) — just continue
    });
  }
}

// ── Orientation ──────────────────────────────────────────────────────────────
function lockOrientation() {
  screen?.orientation?.lock?.('landscape').catch(() => {});
}

function checkOrientation() {
  const el = document.getElementById('orientation-warning');
  if (!el) return;
  // CSS transform handles landscape forcing; this is just a secondary hint
  if (!IS_MOBILE) { el.classList.remove('show'); return; }
  el.classList.toggle('show', window.innerHeight > window.innerWidth);
}

// ── Loading ──────────────────────────────────────────────────────────────────
function setLoadingProgress(pct, text) {
  const bar = document.getElementById('loading-bar');
  const msg = document.getElementById('loading-text');
  if (bar) bar.style.width = `${pct}%`;
  if (msg) msg.textContent = text;
}

function hideLoadingScreen() {
  document.getElementById('loading-screen')?.classList.add('hidden');
}

// ── Game ─────────────────────────────────────────────────────────────────────
class SilentShapeGame {
  constructor() {
    this.scene       = null;
    this.renderer    = null;
    this.camera3     = null;
    this.environment = null;
    this.player      = null;
    this.cameraCtrl  = null;
    this.chunkManager = null;
    this.input       = null;
    this.controls    = null;
    this.hud         = null;

    this._artefactsCollected = new Set();
    this._signalLevel        = 0;

    // Throttle counters
    this._artefactCheckFrame = 0;  // check proximity every N frames
    this._artefactCheckEvery = 3;  // every 3 frames
    this._artefactAnimTime   = 0;

    this._animFrameId = null;
    this._lastTime    = 0;
    this._frameCount  = 0;
    this._fpsTimer    = 0;
    this._currentFPS  = 0;
  }

  async init() {
    setLoadingProgress(5,  'Creating renderer...');   this._initRenderer();
    setLoadingProgress(20, 'Building scene...');      this._initScene();
    setLoadingProgress(40, 'Generating world...');    this._initWorld();
    setLoadingProgress(60, 'Initializing player...'); this._initPlayer();
    setLoadingProgress(75, 'Setting up controls...');  this._initControls();
    setLoadingProgress(90, 'Preparing HUD...');       this._initHUD();
    setLoadingProgress(100, 'Ready!');

    await new Promise(r => setTimeout(r, 400));
    this._startGame();
  }

  _initRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(PIXEL_RATIO);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x1a1a2e, 1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.LinearToneMapping;
  }

  _initScene() {
    this.scene   = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera3.position.set(32, 12, 50);

    this.environment = new Environment(this.scene);
    this.environment.applyBiome('grey_district', true);
  }

  _initWorld() {
    this.chunkManager = new ChunkManager(this.scene, 'grey_district');
    this.chunkManager.preload(new THREE.Vector3(32, 0, 32));
  }

  _initPlayer() {
    this.player     = new Player(this.scene);
    this.cameraCtrl = new Camera(this.camera3);
    this.cameraCtrl.snapTo(this.player.position);

    // Spawn guard — disable collision for first 0.8s so player falls cleanly to ground
    this._spawnGuard = true;
    this._spawnGuardTimer = 0;
    this._spawnGuardDuration = 0.8;
  }

  _initControls() {
    this.input    = new InputManager();
    this.controls = new TouchControls(this.input);

    const cl = document.getElementById('controls-layer');
    if (cl) cl.hidden = false;

    window.addEventListener('resize', this._onResize.bind(this));
    window.addEventListener('orientationchange', () => {
      setTimeout(this._onResize.bind(this), 100);
      checkOrientation();
    });
  }

  _initHUD() {
    this.hud = new HUD();
    this.hud.show();
    this.hud.setRegion('Grey District');
    this.hud.setSignalLevel(0);
  }

  _startGame() {
    hideLoadingScreen();
    lockOrientation();
    checkOrientation();

    this.hud.showStatus('EXPLORE THE RUINS', 4000);

    // Push initial building list to physics after first chunks load
    setTimeout(() => {
      if (!this._spawnGuard) {
        this.player.physics.setBuildingsList(this.chunkManager.buildings);
      }
    }, 900);

    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  // ── Game Loop ─────────────────────────────────────────────────────────────
  _loop(ts) {
    this._animFrameId = requestAnimationFrame(this._loop.bind(this));
    const delta = Math.min((ts - this._lastTime) / 1000, 0.05);
    this._lastTime = ts;

    this._update(delta);
    this.renderer.render(this.scene, this.camera3);
    this.input.flush();
  }

  _update(delta) {
    // Spawn guard — no building collision for first 0.8s to prevent stuck-in-wall
    if (this._spawnGuard) {
      this._spawnGuardTimer += delta;
      if (this._spawnGuardTimer >= this._spawnGuardDuration) {
        this._spawnGuard = false;
        this.player.physics.setBuildingsList(this.chunkManager.buildings);
      }
    }

    // 1. Player movement + physics
    this.player.update(delta, this.input, this.camera3);

    // 2. Camera (gesture only — no auto-movement)
    this.cameraCtrl.update(this.player.position, this.input, delta);

    // 3. World streaming — update returns true if chunks changed
    const chunksChanged = this.chunkManager.update(this.player.position, delta);
    if (chunksChanged) {
      // Update physics buildings list — no scene.traverse needed
      this.player.physics.setBuildingsList(this.chunkManager.buildings);
    }

    // 4. Sky follows camera
    this.environment.update(this.camera3.position);

    // 5. Artefact proximity (throttled to every 3 frames)
    this._artefactCheckFrame++;
    if (this._artefactCheckFrame >= this._artefactCheckEvery) {
      this._artefactCheckFrame = 0;
      this._checkArtefactProximity();
    }

    // 6. Artefact animation (separate, runs every frame via delta)
    this._animateArtefacts(delta);

    // 7. Transmit + HUD
    this._handleTransmit();
    this._updateHUD(delta);
  }

  // ── Artefact System (NO scene.traverse) ───────────────────────────────────
  _checkArtefactProximity() {
    const playerPos = this.player.position;
    let nearest     = null;
    let nearestDist = ARTEFACT_PICKUP_RADIUS;

    // chunkManager.artefacts is a pre-built flat array
    for (const art of this.chunkManager.artefacts) {
      if (!art.visible) continue;
      if (this._artefactsCollected.has(art.userData.id)) continue;

      const dx = art.position.x - playerPos.x;
      const dz = art.position.z - playerPos.z;
      const dy = art.position.y - playerPos.y;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest     = art;
      }
    }

    this.player.setNearArtefact(nearest);
    this.controls.setInteractVisible(!!nearest, nearest ? 'Pick Up' : '');
  }

  _animateArtefacts(delta) {
    this._artefactAnimTime += delta;
    const t = this._artefactAnimTime;

    for (const art of this.chunkManager.artefacts) {
      if (!art.visible) continue;
      art.rotation.y += delta * 1.2;
      art.position.y  = 0.8 + Math.sin(t * 2 + art.userData.id.length) * 0.12;
    }
  }

  _handleTransmit() {
    const progress     = this.player.transmitProgress;
    const transmitting = this.player.isTransmitting;

    this.hud.setTransmitProgress(progress, transmitting);

    if (this.player.isTransmitComplete) {
      const art = this.player._nearArtefact;
      if (art && !this._artefactsCollected.has(art.userData.id)) {
        this._artefactsCollected.add(art.userData.id);
        this.hud.showStoryLog(art.userData.id, art.userData.text);

        this._signalLevel = Math.min(5, this._artefactsCollected.size);
        this.hud.setSignalLevel(this._signalLevel);

        art.visible = false;
        this.player.setNearArtefact(null);
        this.controls.setInteractVisible(false);
        this.hud.showStatus('SIGNAL CAPTURED', 3000);

        // Rebuild artefact list after hiding one
        this.chunkManager._rebuildFlatLists();
      }
    }
  }

  _updateHUD(delta) {
    this._frameCount++;
    this._fpsTimer += delta;
    if (this._fpsTimer >= 1) {
      this._currentFPS = this._frameCount;
      this._frameCount = 0;
      this._fpsTimer  -= 1;
    }
    this.hud.updateDebug(this._currentFPS, this.player.position, this.chunkManager.chunkCount);
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
    this.cameraCtrl?.onResize();
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const game = new SilentShapeGame();

// Show start screen — game.init() only runs when user taps PLAY
// (Fullscreen API requires a user gesture, so we can't call it at page load)
const btnStartGame = document.getElementById('btn-start-game');
const startScreen  = document.getElementById('start-screen');

// Loading screen is hidden by default behind start screen
// so we hide it right away to show the start screen cleanly
hideLoadingScreen();

if (btnStartGame && startScreen) {
  btnStartGame.addEventListener('click', () => {
    // 1. Request fullscreen + landscape on user gesture
    requestFullscreenLandscape();

    // 2. Hide start screen with fade
    startScreen.classList.add('hidden');

    // 3. Show loading screen while initializing
    const loadEl = document.getElementById('loading-screen');
    if (loadEl) loadEl.classList.remove('hidden');
    setLoadingProgress(0, 'Initializing...');

    // 4. Boot game
    game.init().catch(err => {
      console.error('Silent Shape init error:', err);
      setLoadingProgress(100, 'Error loading. Please refresh.');
    });
  });

  // Also support pressing Enter/Space on the button (keyboard)
  btnStartGame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') btnStartGame.click();
  });
} else {
  // Fallback: no start screen found, auto-start
  game.init().catch(console.error);
}

document.addEventListener('visibilitychange', () => {
  // rAF auto-pauses when tab backgrounded — no extra handling needed
});
