/**
 * ChunkManager.js — Dynamic World Streaming
 *
 * Performance changes vs v1:
 *  - Tracks buildingMeshes and artefacts per chunk in structured data (no scene.traverse)
 *  - Exposes allArtefacts and allBuildings as flat lists for external systems
 *  - Chunk check every 0.5s (unchanged) but uses pre-cached data
 */
import * as THREE from 'three';
import { BuildingGenerator } from './BuildingGenerator.js';

const CHUNK_SIZE  = 64;
const LOAD_RADIUS = 1;
const UNLOAD_DIST = 2;

export class ChunkManager {
  constructor(scene, biome = 'grey_district') {
    this.scene     = scene;
    this.generator = new BuildingGenerator(biome);

    /** Map of "x,z" → { group, buildingMeshes, artefact } */
    this._loadedChunks  = new Map();
    this._pendingChunks = new Set();

    this._playerCX = null;
    this._playerCZ = null;
    this._checkTimer = 0;
    this._checkInterval = 0.5;

    /** Flat artefact list for main loop (no traverse needed) */
    this.artefacts = [];

    /** Flat building list for physics (no traverse needed) */
    this.buildings = [];
  }

  update(playerPosition, delta) {
    this._checkTimer += delta;
    if (this._checkTimer < this._checkInterval) return false;
    this._checkTimer = 0;

    const cx = Math.floor(playerPosition.x / CHUNK_SIZE);
    const cz = Math.floor(playerPosition.z / CHUNK_SIZE);

    if (cx === this._playerCX && cz === this._playerCZ) return false;
    this._playerCX = cx;
    this._playerCZ = cz;

    this._scheduleLoads(cx, cz);
    const changed = this._unloadDistant(cx, cz);
    return changed;
  }

  _scheduleLoads(cx, cz) {
    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!this._loadedChunks.has(key) && !this._pendingChunks.has(key)) {
          this._pendingChunks.add(key);
          this._genAsync(cx + dx, cz + dz, key);
        }
      }
    }
  }

  _genAsync(chunkX, chunkZ, key) {
    const go = () => {
      if (!this._pendingChunks.has(key)) return;

      const { group, buildingMeshes, artefact } = this.generator.generateChunk(chunkX, chunkZ, CHUNK_SIZE);

      this.scene.add(group);
      this._loadedChunks.set(key, { group, buildingMeshes, artefact });
      this._pendingChunks.delete(key);

      // Rebuild flat lists
      this._rebuildFlatLists();
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(go, { timeout: 300 });
    } else {
      setTimeout(go, 16);
    }
  }

  _unloadDistant(cx, cz) {
    let changed = false;
    for (const [key, data] of this._loadedChunks) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > UNLOAD_DIST || Math.abs(kz - cz) > UNLOAD_DIST) {
        this.scene.remove(data.group);
        BuildingGenerator.disposeChunk(data.group);
        this._loadedChunks.delete(key);
        changed = true;
      }
    }
    if (changed) this._rebuildFlatLists();
    return changed;
  }

  _rebuildFlatLists() {
    this.buildings = [];
    this.artefacts = [];
    for (const { buildingMeshes, artefact } of this._loadedChunks.values()) {
      for (const m of buildingMeshes) this.buildings.push(m);
      if (artefact && artefact.visible) this.artefacts.push(artefact);
    }
  }

  preload(spawnPos) {
    const cx = Math.floor(spawnPos.x / CHUNK_SIZE);
    const cz = Math.floor(spawnPos.z / CHUNK_SIZE);
    this._scheduleLoads(cx, cz);
  }

  get chunkCount() { return this._loadedChunks.size; }
}
