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
    this._sunVisual = null;
    this._skyMesh = null;
    this._currentBiome = 'grey_district';
    this._timeOfDay = 0.5 * Math.PI; // Start at midday

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

    // Visual Sun Sphere
    const sunVisualGeo = new THREE.SphereGeometry(4, 8, 8);
    const sunVisualMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      toneMapped: false
    });
    this._sunVisual = new THREE.Mesh(sunVisualGeo, sunVisualMat);
    this.scene.add(this._sunVisual);

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
    if (!biome) return;
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
   * @param {THREE.Vector3} playerPosition
   * @param {number} delta
   */
  update(playerPosition, delta = 0.016) {
    const biome = BIOMES[this._currentBiome] || BIOMES.grey_district;

    // Advance day/night cycle: full cycle takes 75 seconds
    this._timeOfDay += delta * (Math.PI * 2 / 75.0);
    if (this._timeOfDay > Math.PI * 2) this._timeOfDay -= Math.PI * 2;

    // Sun moves in YZ plane
    const radius = 60.0;
    const sunY = Math.sin(this._timeOfDay) * radius;
    const sunZ = Math.cos(this._timeOfDay) * radius;
    this._sunOffset.set(-15, sunY, sunZ);

    if (this._skyMesh) {
      this._skyMesh.position.copy(playerPosition);
    }

    if (this._sun) {
      this._sun.position.copy(playerPosition).add(this._sunOffset);
      this._sun.target.position.copy(playerPosition);
      this._sun.target.updateMatrixWorld();
      this._sun.shadow.camera.updateProjectionMatrix();

      // Position visual sun
      if (this._sunVisual) {
        this._sunVisual.position.copy(playerPosition).add(this._sunOffset.clone().normalize().multiplyScalar(220));
      }

      // Dynamic day/sunset/night transition using smooth weight blending
      const nSunY = sunY / radius; // -1.0 (midnight) to 1.0 (midday)
      let wDay = 0.0, wSunset = 0.0, wNight = 0.0;

      if (nSunY >= 0.25) {
        wDay = 1.0;
      } else if (nSunY >= 0.0) {
        const t = nSunY / 0.25;
        wDay = t;
        wSunset = 1.0 - t;
      } else if (nSunY >= -0.25) {
        const t = nSunY / -0.25;
        wNight = t;
        wSunset = 1.0 - t;
      } else {
        wNight = 1.0;
      }

      // Define properties for the three states
      const daySunColor = new THREE.Color(biome.sunColor || 0xfff5e0);
      const daySunIntensity = biome.sunIntensity * 1.4;
      const dayAmbientColor = new THREE.Color(biome.ambientColor);
      const dayAmbientIntensity = biome.ambientIntensity * 1.2;
      const daySkyTop = new THREE.Color(biome.skyTop);
      const daySkyBottom = new THREE.Color(biome.skyBottom);
      const dayFogColor = new THREE.Color(biome.fogColor);
      const dayFogDensity = 0.005;

      const sunsetSunColor = new THREE.Color(0xffaa44);
      const sunsetSunIntensity = 0.45;
      const sunsetAmbientColor = new THREE.Color(0x5a3c30);
      const sunsetAmbientIntensity = 0.45;
      const sunsetSkyTop = new THREE.Color(0x3a1c4c);
      const sunsetSkyBottom = new THREE.Color(0xf15a24);
      const sunsetFogColor = new THREE.Color(0x8a3c20);
      const sunsetFogDensity = 0.012;

      const nightSunColor = new THREE.Color(0x383e56);
      const nightSunIntensity = 0.0;
      const nightAmbientColor = new THREE.Color(0x383e56);
      const nightAmbientIntensity = 0.28;
      const nightSkyTop = new THREE.Color(0x0e1020);
      const nightSkyBottom = new THREE.Color(0x1f223f);
      const nightFogColor = new THREE.Color(0x181a30);
      const nightFogDensity = 0.015;

      // Linearly interpolate color vectors
      const finalSunColor = new THREE.Color()
        .add(daySunColor.clone().multiplyScalar(wDay))
        .add(sunsetSunColor.clone().multiplyScalar(wSunset))
        .add(nightSunColor.clone().multiplyScalar(wNight));

      const finalSunIntensity = daySunIntensity * wDay + sunsetSunIntensity * wSunset + nightSunIntensity * wNight;

      const finalAmbientColor = new THREE.Color()
        .add(dayAmbientColor.clone().multiplyScalar(wDay))
        .add(sunsetAmbientColor.clone().multiplyScalar(wSunset))
        .add(nightAmbientColor.clone().multiplyScalar(wNight));

      const finalAmbientIntensity = dayAmbientIntensity * wDay + sunsetAmbientIntensity * wSunset + nightAmbientIntensity * wNight;

      const finalSkyTop = new THREE.Color()
        .add(daySkyTop.clone().multiplyScalar(wDay))
        .add(sunsetSkyTop.clone().multiplyScalar(wSunset))
        .add(nightSkyTop.clone().multiplyScalar(wNight));

      const finalSkyBottom = new THREE.Color()
        .add(daySkyBottom.clone().multiplyScalar(wDay))
        .add(sunsetSkyBottom.clone().multiplyScalar(wSunset))
        .add(nightSkyBottom.clone().multiplyScalar(wNight));

      const finalFogColor = new THREE.Color()
        .add(dayFogColor.clone().multiplyScalar(wDay))
        .add(sunsetFogColor.clone().multiplyScalar(wSunset))
        .add(nightFogColor.clone().multiplyScalar(wNight));

      const finalFogDensity = dayFogDensity * wDay + sunsetFogDensity * wSunset + nightFogDensity * wNight;

      // Apply lerped values smoothly
      this._sun.color.copy(finalSunColor);
      this._sun.intensity = finalSunIntensity;
      this._ambient.color.copy(finalAmbientColor);
      this._ambient.intensity = finalAmbientIntensity;
      this.scene.fog.color.copy(finalFogColor);
      this.scene.fog.density = finalFogDensity;
      this._updateSkyColors(finalSkyTop.getHex(), finalSkyBottom.getHex());
    }
  }
}
