/**
 * Environment.js — Scene Atmosphere, Lighting & Sky
 *
 * Configures:
 *  - FogExp2 (volumetric-like depth)
 *  - AmbientLight (flat base illumination)
 *  - DirectionalLight (sun — angled for dramatic shadows without shadowmaps)
 *  - Sky gradient (gradient mesh behind everything)
 *
 * BIOME PALETTES:
 *   Each biome has a unique color set. Call applyBiome(name) to transition.
 */
import * as THREE from 'three';

const BIOMES = {
  grey_district: {
    fogColor:     0x4a4e69,
    fogDensity:   0.022,
    skyTop:       0x1a1a2e,
    skyBottom:    0x4a4e69,
    ambientColor: 0x404058,
    ambientIntensity: 0.6,
    sunColor:     0xfff0c8,
    sunIntensity: 0.8,
    sunDirection: new THREE.Vector3(-1, 2, -1).normalize(),
  },
  rust_valley: {
    fogColor:     0x7a4020,
    fogDensity:   0.025,
    skyTop:       0x2a1a0a,
    skyBottom:    0x7a4020,
    ambientColor: 0x503020,
    ambientIntensity: 0.5,
    sunColor:     0xff9040,
    sunIntensity: 0.9,
    sunDirection: new THREE.Vector3(-0.5, 1.5, -0.8).normalize(),
  },
  pale_horizon: {
    fogColor:     0xd8c0c8,
    fogDensity:   0.016,
    skyTop:       0x8a7090,
    skyBottom:    0xd8c0c8,
    ambientColor: 0x907888,
    ambientIntensity: 0.7,
    sunColor:     0xffe8e0,
    sunIntensity: 0.6,
    sunDirection: new THREE.Vector3(0, 3, -1).normalize(),
  },
  echo_spire: {
    fogColor:     0x0c2a40,
    fogDensity:   0.028,
    skyTop:       0x080c14,
    skyBottom:    0x0c2a40,
    ambientColor: 0x102030,
    ambientIntensity: 0.4,
    sunColor:     0x40a0ff,
    sunIntensity: 1.2,
    sunDirection: new THREE.Vector3(-1, 3, -2).normalize(),
  },
};

export class Environment {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene    = scene;
    this._ambient = null;
    this._sun     = null;
    this._skyMesh = null;
    this._currentBiome = null;

    this._setup();
  }

  _setup() {
    // ── Fog ──
    this.scene.fog = new THREE.FogExp2(0x4a4e69, 0.022);

    // ── Ambient Light ──
    this._ambient = new THREE.AmbientLight(0x404058, 0.6);
    this.scene.add(this._ambient);

    // ── Directional Sun ──
    this._sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    // Offset from player: sun comes from upper-left-back angle
    this._sunOffset = new THREE.Vector3(-15, 30, -5);
    this._sun.position.copy(this._sunOffset);
    this._sun.castShadow = true;
    // 2048x2048 shadow map, covering only 30x30m around player = very crisp player/nearby shadows
    this._sun.shadow.mapSize.width  = 2048;
    this._sun.shadow.mapSize.height = 2048;
    const d = 15; // tight frustum: player + immediate surroundings only
    this._sun.shadow.camera.near   = 1;
    this._sun.shadow.camera.far    = 80;
    this._sun.shadow.camera.left   = -d;
    this._sun.shadow.camera.right  =  d;
    this._sun.shadow.camera.top    =  d;
    this._sun.shadow.camera.bottom = -d;
    this._sun.shadow.bias          = -0.002;
    this._sun.shadow.normalBias    = 0.05;
    this.scene.add(this._sun);
    this.scene.add(this._sun.target);

    // ── Sky Gradient Mesh ──
    this._createSkyDome();
  }

  /**
   * Creates a large inverted sphere used as sky gradient background.
   * Uses vertex colors for top/bottom gradient.
   */
  _createSkyDome() {
    const geometry = new THREE.SphereGeometry(400, 8, 6);

    // Flip normals inward
    geometry.scale(-1, 1, 1);

    // Apply vertex colors for gradient (top = dark, bottom = lighter)
    const posAttr    = geometry.attributes.position;
    const count      = posAttr.count;
    const colors     = new Float32Array(count * 3);
    const colorAttr  = new THREE.BufferAttribute(colors, 3);

    const topColor    = new THREE.Color(0x1a1a2e);
    const bottomColor = new THREE.Color(0x4a4e69);

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      // y ranges from -400 to 400 — normalize to 0..1
      const t = THREE.MathUtils.clamp((y + 400) / 800, 0, 1);
      const col = topColor.clone().lerp(bottomColor, 1 - t);
      colorAttr.setXYZ(i, col.r, col.g, col.b);
    }

    geometry.setAttribute('color', colorAttr);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this._skyMesh = new THREE.Mesh(geometry, material);
    this._skyMesh.renderOrder = -1; // Draw behind everything
    this.scene.add(this._skyMesh);
  }

  /**
   * Apply a biome configuration to the scene.
   * @param {string} biomeName — key from BIOMES object
   * @param {boolean} instant  — if true, no lerp transition
   */
  applyBiome(biomeName, instant = true) {
    const biome = BIOMES[biomeName];
    if (!biome || this._currentBiome === biomeName) return;
    this._currentBiome = biomeName;

    if (instant) {
      // Instant switch
      this.scene.fog.color.setHex(biome.fogColor);
      this.scene.fog.density = biome.fogDensity;
      this._ambient.color.setHex(biome.ambientColor);
      this._ambient.intensity = biome.ambientIntensity;
      this._sun.color.setHex(biome.sunColor);
      this._sun.intensity = biome.sunIntensity;
      this._sun.position.copy(biome.sunDirection).multiplyScalar(20);
    }

    // Update sky dome vertex colors
    this._updateSkyColors(biome.skyTop, biome.skyBottom);
  }

  _updateSkyColors(topHex, bottomHex) {
    if (!this._skyMesh) return;
    const topColor    = new THREE.Color(topHex);
    const bottomColor = new THREE.Color(bottomHex);
    const posAttr     = this._skyMesh.geometry.attributes.position;
    const colorAttr   = this._skyMesh.geometry.attributes.color;
    const count       = posAttr.count;

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const t = THREE.MathUtils.clamp((y + 400) / 800, 0, 1);
      const col = topColor.clone().lerp(bottomColor, 1 - t);
      colorAttr.setXYZ(i, col.r, col.g, col.b);
    }
    colorAttr.needsUpdate = true;
  }

  /**
   * Makes the sky dome and sun follow the camera position.
   * Call this each frame.
   * @param {THREE.Vector3} cameraPosition
   */
  update(playerPosition) {
    if (this._skyMesh) {
      this._skyMesh.position.copy(playerPosition);
    }
    if (this._sun) {
      this._sun.position.copy(playerPosition).add(this._sunOffset);
      this._sun.target.position.copy(playerPosition);
      this._sun.target.updateMatrixWorld();
      // Required after repositioning so shadow camera picks up the new position
      this._sun.shadow.camera.updateProjectionMatrix();
    }
  }
}
