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
import { Enemy }         from './world/Enemy.js';
import { soundManager }  from './audio/SoundManager.js';
import { getGroundHeight } from './world/Terrain.js';

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

    // Combat states
    this.enemies = [];
    this.enemyProjectiles = [];
    this.playerProjectiles = [];
    this.targetEnemy = null;
    this.crosshairMesh = null;
    this.playerShootCooldown = 0;
    this.enemySpawnTimer = 0;

    // Ammo system
    this.playerAmmo    = 30;
    this.playerMaxAmmo = 30;
    this.reloadTimer   = 0;
    this.isReloading   = false;
  }

  async init() {
    setLoadingProgress(5,  'Creating renderer...');   this._initRenderer();
    setLoadingProgress(20, 'Building scene...');      this._initScene();
    setLoadingProgress(40, 'Generating world...');    this._initWorld();
    setLoadingProgress(60, 'Initializing player...'); this._initPlayer();
    setLoadingProgress(75, 'Setting up controls...');  this._initControls();
    setLoadingProgress(90, 'Preparing HUD...');       this._initHUD();
    this._initSettings();
    setLoadingProgress(100, 'Ready!');

    await new Promise(r => setTimeout(r, 400));
    this._startGame();
  }

  _initRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(PIXEL_RATIO);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x1a1a2e, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
  }

  _initScene() {
    this.scene   = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera3.position.set(32, 12, 50);

    this.environment = new Environment(this.scene);
    this.environment.applyBiome('grey_district', true);

    // Auto-aim 3D Crosshair Ring mesh
    const ringGeo = new THREE.RingGeometry(0.55, 0.65, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3c3c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.crosshairMesh = new THREE.Mesh(ringGeo, ringMat);
    this.crosshairMesh.visible = false;
    this.scene.add(this.crosshairMesh);
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

    // 4. Sky and shadow sun follows player
    this.environment.update(this.player.position);

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
    this._updateCombat(delta);
    this._updateHUD(delta);
  }

  _updateCombat(delta) {
    const playerPos = this.player.position;

    // 1. Spawning enemies randomly around the player
    this.enemySpawnTimer += delta;
    if (this.enemySpawnTimer >= 1.5) {
      this.enemySpawnTimer = 0;
      if (this.enemies.length < 5) {
        // Find a random position around player
        const angle = Math.random() * Math.PI * 2;
        const radius = 15.0 + Math.random() * 15.0;
        const sx = playerPos.x + Math.sin(angle) * radius;
        const sz = playerPos.z + Math.cos(angle) * radius;
        const sy = getGroundHeight(sx, sz);
        
        // Ensure not inside initial spawn point
        if (Math.hypot(sx - 32, sz - 32) > 8) {
          const enemy = new Enemy(this.scene, new THREE.Vector3(sx, sy, sz));
          this.enemies.push(enemy);
        }
      }
    }

    // 2. Target acquisition — find closest enemy in range (just for crosshair + fire target)
    let bestTarget = null;
    let minDistance = 22.0;

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const dist = playerPos.distanceTo(enemy.group.position);
      if (dist < minDistance) {
        minDistance = dist;
        bestTarget = enemy;
      }
    }
    this.targetEnemy = bestTarget;

    // 3. Player Firing Controls
    this.playerShootCooldown -= delta;
    const wantsToFire = this.input.fire || this.input.keys.space;
    this.player.isFiring = wantsToFire;

    // ── Reload logic ──
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.playerAmmo  = this.playerMaxAmmo;
        this._updateAmmoHUD();
      }
    }

    if (wantsToFire && !this.isReloading) {
      // Only face-lock and show crosshair when actively firing
      if (bestTarget) {
        this.player.setTargetPosition(bestTarget.group.position);
        this.crosshairMesh.visible = true;
        this.crosshairMesh.position.copy(bestTarget.group.position).add(new THREE.Vector3(0, 0.8, 0));
        this.crosshairMesh.rotation.z += 2.0 * delta;
        this.crosshairMesh.lookAt(this.camera3.position);
      } else {
        this.crosshairMesh.visible = false;
      }

      if (this.playerShootCooldown <= 0 && this.playerAmmo > 0) {
        this.playerShootCooldown = 0.18;
        this.playerAmmo--;
        this._updateAmmoHUD();

        const muzzleWorldPos = this.player.triggerShootEffect();

        // Bullet direction: toward locked enemy or straight forward
        let bulletDir = new THREE.Vector3();
        if (bestTarget) {
          const aimPos = bestTarget.group.position.clone().add(new THREE.Vector3(0, 0.6, 0));
          bulletDir.subVectors(aimPos, muzzleWorldPos).normalize();
        } else {
          bulletDir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.facingAngle);
        }

        // Player bullet — small elongated cylinder (looks like a real bullet)
        const bGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.16, 6);
        const bMat = new THREE.MeshBasicMaterial({ color: 0xffd700 }); // Brass/gold
        const bMesh = new THREE.Mesh(bGeo, bMat);
        bMesh.position.copy(muzzleWorldPos);
        // Orient bullet along travel direction
        bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bulletDir);
        this.scene.add(bMesh);

        // Glowing orange trail light
        const bLight = new THREE.PointLight(0xff8800, 1.0, 2.5);
        bMesh.add(bLight);

        this.playerProjectiles.push({
          mesh:    bMesh,
          dir:     bulletDir,
          speed:   40.0,
          age:     0,
          maxAge:  0.65,
          hitDone: false,
        });

        // Play shooting sound
        soundManager.playGunshot('player');

        // Auto-reload when empty
        if (this.playerAmmo <= 0) {
          this.isReloading  = true;
          this.reloadTimer  = 1.8;
          this._updateAmmoHUD();
        }
      }
    } else if (!wantsToFire) {
      // Not firing — release face lock and hide crosshair
      this.player.setTargetPosition(null);
      this.crosshairMesh.visible = false;
    }

    // 4. Update enemies AI, shoot triggers, and HP bar overlays
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.group.position.y = getGroundHeight(enemy.group.position.x, enemy.group.position.z);

      enemy.update(playerPos, delta, (startPos, targetPos) => {
        // Enemy bullet — glowing red cylinder to make it visible
        const bGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.25, 6);
        const bMat = new THREE.MeshBasicMaterial({ color: 0xff3333 }); // Glowing red
        const bulletMesh = new THREE.Mesh(bGeo, bMat);
        
        // Add a small point light to the bullet
        const bLight = new THREE.PointLight(0xff3333, 1.0, 3.0);
        bulletMesh.add(bLight);
        
        bulletMesh.position.copy(startPos);

        const dir = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
        bulletMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        this.scene.add(bulletMesh);

        this.enemyProjectiles.push({
          mesh: bulletMesh,
          dir,
          speed: 18.0,
          age: 0,
          maxAge: 1.8
        });
        
        soundManager.playGunshot('enemy');
      });

      // Update 2D HP bar position (project world → screen)
      enemy.updateHPBarDOM(this.camera3, this.renderer, this.chunkManager.buildings);
    }

    // 5. Update enemy bullets & hit player checks
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const bullet = this.enemyProjectiles[i];
      bullet.mesh.position.addScaledVector(bullet.dir, bullet.speed * delta);
      bullet.age += delta;

      const distToPlayer = bullet.mesh.position.distanceTo(
        new THREE.Vector3().copy(playerPos).add(new THREE.Vector3(0, 0.6, 0))
      );
      if (distToPlayer < 1.0) {
        const playerDead = this.player.takeDamage(10);
        const hpBar = document.getElementById('hp-bar');
        if (hpBar) hpBar.style.width = this.player.hp + '%';

        this.scene.remove(bullet.mesh);
        bullet.mesh.geometry.dispose();
        bullet.mesh.material.dispose();
        this.enemyProjectiles.splice(i, 1);

        if (playerDead) {
          this.player.hp = 100;
          this.player.energy = 100;
          this.player.position.set(32, getGroundHeight(32, 32) + 4, 32);
          if (hpBar) hpBar.style.width = '100%';
          for (const enemy of this.enemies) enemy.destroy();
          this.enemies = [];
          this.targetEnemy = null;
          this.crosshairMesh.visible = false;
          this.player.setTargetPosition(null);
          // Refill ammo on death/respawn
          this.playerAmmo     = this.playerMaxAmmo;
          this.isReloading    = false;
          this._updateAmmoHUD();
        }
        continue;
      }

      if (bullet.age >= bullet.maxAge) {
        this.scene.remove(bullet.mesh);
        bullet.mesh.geometry.dispose();
        bullet.mesh.material.dispose();
        this.enemyProjectiles.splice(i, 1);
      }
    }

    // 6. Update player bullets — move & check enemy hit
    for (let i = this.playerProjectiles.length - 1; i >= 0; i--) {
      const proj = this.playerProjectiles[i];
      proj.mesh.position.addScaledVector(proj.dir, proj.speed * delta);
      proj.age += delta;

      if (!proj.hitDone) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const enemy = this.enemies[j];
          const dist = proj.mesh.position.distanceTo(
            enemy.group.position.clone().add(new THREE.Vector3(0, 0.6, 0))
          );
          if (dist < 1.0) {
            proj.hitDone = true;
            const isDead = enemy.takeDamage(10);
            if (isDead) {
              enemy.destroy();
              this.enemies.splice(j, 1);
              if (enemy === this.targetEnemy) {
                this.targetEnemy = null;
                this.crosshairMesh.visible = false;
                this.player.setTargetPosition(null);
              }
            }
            break;
          }
        }
      }

      if (proj.age >= proj.maxAge || proj.hitDone) {
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        proj.mesh.material.dispose();
        this.playerProjectiles.splice(i, 1);
      }
    }
  }

  /** Update ammo count DOM display */
  _updateAmmoHUD() {
    const el = document.getElementById('ammo-count');
    if (!el) return;
    if (this.isReloading) {
      el.textContent = 'RELOADING...';
      el.classList.add('empty');
    } else {
      el.textContent = `${this.playerAmmo} / ${this.playerMaxAmmo}`;
      el.classList.toggle('empty', this.playerAmmo === 0);
    }
  }

  // ── Artefact System (NO scene.traverse) ───────────────────────────────────
  _checkArtefactProximity() {
    const playerPos = this.player.position;

    // chunkManager.artefacts contains the spawned spell orbs
    for (const art of this.chunkManager.artefacts) {
      if (!art.visible) continue;
      if (this._artefactsCollected.has(art.userData.id)) continue;

      const dx = art.position.x - playerPos.x;
      const dz = art.position.z - playerPos.z;
      const dy = art.position.y - playerPos.y;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      // Walk-over collision check (no manual interaction button needed)
      if (dist < 1.3) {
        const type = art.userData.type; // 'heal' or 'energy'
        this._artefactsCollected.add(art.userData.id);
        art.visible = false;
        
        soundManager.playPickup(type);

        if (type === 'heal') {
          this.player.hp = Math.min(100, this.player.hp + 25);
          const hpBar = document.getElementById('hp-bar');
          if (hpBar) hpBar.style.width = this.player.hp + '%';
          this.hud.showStatus('HEALTH +25', 2000);
        } else {
          this.player.energy = Math.min(100, this.player.energy + 40);
          const energyBar = document.getElementById('energy-bar');
          if (energyBar) energyBar.style.width = this.player.energy + '%';
          this.hud.showStatus('ENERGY +40', 2000);
        }

        // Rebuild list to exclude picked up orb
        this.chunkManager._rebuildFlatLists();
        break;
      }
    }
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
    // Overridden: no manual transmission/alert text popups needed anymore for orbs
  }

  _initSettings() {
    // Apply default medium preset
    this.applyPreset('medium');
  }

  applyPreset(preset) {
    if (!this.renderer || !this.environment || !this.chunkManager) return;

    const sun = this.environment._sun;

    if (preset === 'low') {
      // Low: disable sun shadows for performance, keep player spotlight
      if (sun) sun.castShadow = false;
      this.chunkManager.loadRadius = 1;
      this.chunkManager.unloadDist = 2;
    } else if (preset === 'medium') {
      // Medium: 1024 shadow map, moderate chunk radius
      if (sun) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      this.chunkManager.loadRadius = 2;
      this.chunkManager.unloadDist = 3;
    } else if (preset === 'high') {
      // High: 2048 shadow map (Environment default), wider chunk radius
      if (sun) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      }
      this.chunkManager.loadRadius = 3;
      this.chunkManager.unloadDist = 4;
    }

    // Notify scene materials of shadow changes
    this.scene.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.needsUpdate = true;
      }
    });

    // Force immediate chunk manager update to load/unload according to preset load limits
    this.chunkManager.update(this.player.position, 1.0);
  }


  _updateHUD(delta) {
    this._frameCount++;
    this._fpsTimer += delta;
    if (this._fpsTimer >= 1) {
      this._currentFPS = this._frameCount;
      this._frameCount = 0;
      this._fpsTimer  -= 1;
    }
    // Update energy bar HUD
    const energyBar = document.getElementById('energy-bar');
    if (energyBar) energyBar.style.width = this.player.energy + '%';

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
    // 1. Request fullscreen + landscape on user gesture, resume AudioContext
    requestFullscreenLandscape();
    soundManager.resume();

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
