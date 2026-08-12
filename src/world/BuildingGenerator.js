/**
 * BuildingGenerator.js — Optimized Low-Poly Building Generator
 *
 * Performance changes vs v1:
 *  - NO window panels (removed ~30 draw calls per building)
 *  - Geometry cache by key (never create same box twice)
 *  - Debris merged into ONE merged geometry per chunk (1 draw call instead of 8-10)
 *  - Returns { group, buildingMeshes, artefact } for external caching
 *  - Material cache shared globally
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGroundHeight } from './Terrain.js';

// ── Global caches — never recreated ──────────────────────────────────────────
const GEO_CACHE = new Map();   // "wxh" → BoxGeometry
const MAT_CACHE = new Map();   // hex → MeshLambertMaterial

function getGeometry(w, h, d) {
  const key = `${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)}`;
  if (!GEO_CACHE.has(key)) {
    GEO_CACHE.set(key, new THREE.BoxGeometry(w, h, d));
  }
  return GEO_CACHE.get(key);
}

function getMaterial(colorHex) {
  if (!MAT_CACHE.has(colorHex)) {
    MAT_CACHE.set(colorHex, new THREE.MeshLambertMaterial({
      color: colorHex,
      flatShading: true,
    }));
  }
  return MAT_CACHE.get(colorHex);
}

// ── Biome palettes ────────────────────────────────────────────────────────────
const BIOME_PALETTES = {
  grey_district: {
    buildings: [0x8d8fa3, 0x6b6c7a, 0x9a9bad, 0x5d5e6b],
    ground:    0x3d3d3d,
    debris:    0x555565,
  },
  rust_valley: {
    buildings: [0x7a4a2a, 0x9a6040, 0x5a3820, 0x8a5030],
    ground:    0x3a2a18,
    debris:    0x6a4028,
  },
  pale_horizon: {
    buildings: [0xb8a0a8, 0xc8b0b8, 0x9a8890, 0xd0b8c0],
    ground:    0x706068,
    debris:    0x907880,
  },
  echo_spire: {
    buildings: [0x1a3040, 0x102030, 0x203848, 0x0c1c2c],
    ground:    0x080c14,
    debris:    0x142030,
  },
};

function seededRng(seed) {
  let s = Math.abs(seed) | 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export class BuildingGenerator {
  constructor(biome = 'grey_district') {
    this.biome   = biome;
    this.palette = BIOME_PALETTES[biome] ?? BIOME_PALETTES.grey_district;
  }

  /**
   * Generate chunk geometry.
   * @returns {{ group: THREE.Group, buildingMeshes: THREE.Mesh[], artefact: THREE.Mesh|null }}
   */
  generateChunk(chunkX, chunkZ, chunkSize = 64) {
    const group = new THREE.Group();
    group.name  = `chunk_${chunkX}_${chunkZ}`;

    const seed = ((chunkX + 1000) * 31337 + (chunkZ + 1000) * 7919) | 0;
    const rng  = seededRng(seed);

    // ── Ground — displaced PlaneGeometry ──────────────────────────────────
    const segments = 16;
    const groundGeo = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
    const posAttr = groundGeo.attributes.position;
    const centerX = chunkX * chunkSize + chunkSize / 2;
    const centerZ = chunkZ * chunkSize + chunkSize / 2;

    for (let i = 0; i < posAttr.count; i++) {
      const lx = posAttr.getX(i);
      const ly = posAttr.getY(i);
      
      const vx = centerX + lx;
      const vz = centerZ - ly; // PlaneGeometry Y matches Z space direction
      const height = getGroundHeight(vx, vz);
      posAttr.setZ(i, height); // displacement in Z before rotateX
    }
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.computeVertexNormals();

    const groundMat = getMaterial(this.palette.ground);
    const ground    = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(centerX, 0, centerZ);
    ground.name = 'ground';
    ground.receiveShadow = true;
    group.add(ground);

    // ── Buildings ─────────────────────────────────────────────────────────
    const buildingMeshes = [];
    const count = Math.floor(rng() * 5 + 4); // 4–8 buildings (reduced from 5-10)

    for (let i = 0; i < count; i++) {
      const mesh = this._makeBuilding(rng, chunkX, chunkZ, chunkSize, group);
      if (mesh) {
        group.add(mesh);
        buildingMeshes.push(mesh);
      }
    }

    // ── Debris — ALL MERGED into 1 draw call ──────────────────────────────
    this._addMergedDebris(group, rng, chunkX, chunkZ, chunkSize);

    // ── Artefact (optional, 35% chance) ──────────────────────────────────
    const artefact = this._maybeAddArtefact(group, rng, chunkX, chunkZ, chunkSize, seed);

    return { group, buildingMeshes, artefact };
  }

  _makeBuilding(rng, chunkX, chunkZ, chunkSize, group) {
    const offsetX = chunkX * chunkSize;
    const offsetZ = chunkZ * chunkSize;

    // Quantize sizes to small set → geometry cache hit rate ↑
    const widths  = [4, 5, 6, 8, 10];
    const heights = [4, 6, 8, 12, 16, 20, 24];
    const depths  = [4, 5, 6, 8, 10];

    const width  = widths [Math.floor(rng() * widths.length)];
    const height = heights[Math.floor(rng() * heights.length)];
    const depth  = depths [Math.floor(rng() * depths.length)];

    const margin = Math.max(width, depth) / 2 + 1;
    let posX, posZ;
    let attempts = 0;
    const spawnX = 32;
    const spawnZ = 32;
    const minDistance = 10;

    do {
      posX = offsetX + rng() * (chunkSize - margin * 2) + margin;
      posZ = offsetZ + rng() * (chunkSize - margin * 2) + margin;
      attempts++;
    } while (
      chunkX === 0 &&
      chunkZ === 0 &&
      Math.hypot(posX - spawnX, posZ - spawnZ) < minDistance &&
      attempts < 100
    );

    const tiltX  = (rng() - 0.5) * 0.22;
    const tiltZ  = (rng() - 0.5) * 0.22;

    const colors = this.palette.buildings;
    const color  = colors[Math.floor(rng() * colors.length)];

    const geo  = getGeometry(width, height, depth);
    const mat  = getMaterial(color);
    const mesh = new THREE.Mesh(geo, mat);

    const terrainH = getGroundHeight(posX, posZ);
    mesh.position.set(posX, terrainH + height / 2, posZ);
    mesh.rotation.set(tiltX, rng() * Math.PI * 2, tiltZ);
    mesh.name = 'building';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Pre-compute world bounding box ONCE here — cached on userData
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    mesh.userData.cachedBox = box;
    mesh.userData.isBuilding = true;

    // Spawn 3D creeping ivy on building walls
    this._addIvyToBuilding(group, posX, posZ, width, height, depth, tiltX, tiltZ, rng);

    return mesh;
  }

  _addMergedDebris(group, rng, chunkX, chunkZ, chunkSize) {
    const offsetX    = chunkX * chunkSize;
    const offsetZ    = chunkZ * chunkSize;
    const debrisGeos = [];
    const mat        = getMaterial(this.palette.debris);
    const _dummy     = new THREE.Object3D();

    const clusterCount = Math.floor(rng() * 5 + 3);

    for (let c = 0; c < clusterCount; c++) {
      const cx   = offsetX + rng() * chunkSize;
      const cz   = offsetZ + rng() * chunkSize;
      const pcs  = Math.floor(rng() * 3 + 2);

      for (let i = 0; i < pcs; i++) {
        const w = rng() * 1.2 + 0.3;
        const h = rng() * 0.6 + 0.15;
        const d = rng() * 1.2 + 0.3;

        const geo = new THREE.BoxGeometry(w, h, d);
        const px = cx + (rng() - 0.5) * 3;
        const pz = cz + (rng() - 0.5) * 3;
        const terrainH = getGroundHeight(px, pz);
        _dummy.position.set(px, terrainH + h / 2, pz);
        _dummy.rotation.y = rng() * Math.PI;
        _dummy.updateMatrix();
        geo.applyMatrix4(_dummy.matrix);
        debrisGeos.push(geo);
      }
    }

    if (debrisGeos.length > 0) {
      const merged  = mergeGeometries(debrisGeos, false);
      const mesh    = new THREE.Mesh(merged, mat);
      mesh.name     = 'debris';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      // Dispose individual geos after merge
      debrisGeos.forEach(g => g.dispose());
    }
  }

  _maybeAddArtefact(group, rng, chunkX, chunkZ, chunkSize, seed) {
    if (rng() > 0.65) return null; // 35% chance

    const offsetX = chunkX * chunkSize;
    const offsetZ = chunkZ * chunkSize;

    // 50% chance to be Heal (green) or Energy (orange)
    const isHeal = rng() > 0.5;
    const color = isHeal ? 0x22ff22 : 0xff8c00;

    const geo = new THREE.SphereGeometry(0.35, 8, 8);
    const mat = new THREE.MeshLambertMaterial({
      color:             color,
      emissive:          color,
      emissiveIntensity: 0.6,
    });

    const px = offsetX + rng() * chunkSize;
    const pz = offsetZ + rng() * chunkSize;
    const terrainH = getGroundHeight(px, pz);

    const mesh         = new THREE.Mesh(geo, mat);
    mesh.position.set(px, terrainH + 0.4, pz);
    mesh.name          = 'spell_orb';
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.userData      = {
      isSpell: true,
      type:    isHeal ? 'heal' : 'energy',
      id:      `spell_${chunkX}_${chunkZ}`,
    };

    group.add(mesh);
    return mesh;
  }

  _addIvyToBuilding(group, posX, posZ, width, height, depth, tiltX, tiltZ, rng) {
    const ivyColor = 0x2d3a22; // Mossy dark green/brown
    const leafColor = 0x8c5b36; // Withered orange/brown
    const vineMat = getMaterial(ivyColor);
    const leafMat = getMaterial(leafColor);

    // Number of vines on this building
    const vineCount = Math.floor(rng() * 2 + 1); // 1 or 2 vines
    for (let v = 0; v < vineCount; v++) {
      // Choose a side: 0=front, 1=back, 2=left, 3=right
      const side = Math.floor(rng() * 4);
      const vineHeight = height * (0.4 + rng() * 0.5); // climbs up part of the building
      
      const vineGeo = getGeometry(0.08, vineHeight, 0.08);
      const vineMesh = new THREE.Mesh(vineGeo, vineMat);
      
      // Position relative to building center
      let vx = 0;
      let vz = 0;
      if (side === 0) { vz = depth / 2 + 0.04; }
      else if (side === 1) { vz = -depth / 2 - 0.04; }
      else if (side === 2) { vx = -width / 2 - 0.04; }
      else if (side === 3) { vx = width / 2 + 0.04; }

      // Adjust for vine height pivot
      vineMesh.position.set(vx, vineHeight / 2 - height / 2, vz);
      vineMesh.castShadow = true;
      vineMesh.receiveShadow = true;
      
      // Local group to handle building rotation
      const vineGroup = new THREE.Group();
      const terrainH = getGroundHeight(posX, posZ);
      vineGroup.position.set(posX, terrainH + height / 2, posZ);
      vineGroup.rotation.set(tiltX, rng() * Math.PI * 2, tiltZ);
      vineGroup.add(vineMesh);
      group.add(vineGroup);
    }
  }

  /**
   * Dispose group geometry. Skips cached shared geometries.
   */
  static disposeChunk(group) {
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      // Only dispose merged/unique geos (debris, spell_orb mat)
      if (obj.name === 'debris' || obj.name === 'spell_orb') {
        obj.geometry.dispose();
        if (obj.material && !MAT_CACHE.has(obj.material.color?.getHex())) {
          obj.material.dispose();
        }
      }
      // Building geos are cached — don't dispose
    });
  }
}

const ARTEFACT_LOGS = [
  "Sinyal terakhir dipancarkan 23 hari yang lalu. Tidak ada balasan. Tapi aku terus mencoba.",
  "Geometri ini dulunya adalah taman bermain. Sekarang hanya sudut-sudut tajam yang tersisa.",
  "Mereka bilang bangunan-bangunan ini runtuh karena gravitasi berubah. Aku bilang mereka baru saja miring mencari sesuatu yang hilang.",
  "Catatan frekuensi: 432Hz masih aktif di menara barat. Itu berarti seseorang masih di sana.",
  "Aku menulis ini di lantai 12. Dindingnya sekarang menjadi langit-langit. Perspektif adalah segalanya.",
  "Jejak kaki terakhir terhenti di sini. Milik siapa? Entahlah. Tapi mereka terus bergerak ke atas.",
  "Satu-satunya warna yang tersisa adalah abu-abu dan oker. Tapi dari puncak menara itu — langit masih ungu.",
  "Sistem sinyal kuno masih bisa diaktifkan. Kamu hanya perlu cukup tinggi untuk menjangkaunya.",
];
