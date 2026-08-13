/**
 * Physics.js — Optimized AABB Collision
 *
 * Performance changes vs v1:
 *  - Uses pre-cached bounding boxes (userData.cachedBox) set once at build time
 *  - Radius filter: only checks buildings within MAX_CHECK_RADIUS of player
 *  - No setFromObject calls in the hot path (only used as fallback)
 *  - Buildings list injected from ChunkManager (no scene.traverse)
 */
import * as THREE from 'three';

import { getGroundHeight } from '../world/Terrain.js';

const GRAVITY         = -22;
const MAX_FALL        = -35;
const CHAR_HX         = 0.4;
const CHAR_HY         = 1.3;
const CHAR_HZ         = 0.4;
const MAX_CHECK_RADIUS = 18;  // only check buildings within this radius

// Reusable
const _charBox = new THREE.Box3();
const _objBox  = new THREE.Box3();
const _tmp     = new THREE.Vector3();

export class Physics {
  constructor() {
    this.velocity  = new THREE.Vector3();
    /** Set from ChunkManager.buildings — no traverse needed */
    this.buildings = [];
    this.standingBuilding = null;
  }

  integrate(position, delta, onGround) {
    if (!onGround) {
      this.velocity.y += GRAVITY * delta;
      if (this.velocity.y < MAX_FALL) this.velocity.y = MAX_FALL;
    } else if (this.velocity.y < 0) {
      this.velocity.y = 0;
    }
    return position.clone().addScaledVector(this.velocity, delta);
  }

  /**
   * Resolve collisions axis-by-axis.
   */
  resolveCollision(newPos, currentPos) {
    // Pre-filter nearby buildings once per resolve call
    const nearby = this._nearbyBuildings(currentPos);

    let resolved = newPos.clone();
    let onGround = false;

    // ── X axis ──
    _charBox.min.set(resolved.x - CHAR_HX, currentPos.y - CHAR_HY + 0.08, currentPos.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, currentPos.y + CHAR_HY, currentPos.z + CHAR_HZ);

    for (const box of nearby) {
      if (box.meshRef && this._intersectsBuilding(_charBox, box.meshRef)) {
        resolved.x    = currentPos.x;
        this.velocity.x = 0;
        break;
      }
    }

    // ── Z axis ──
    _charBox.min.set(resolved.x - CHAR_HX, currentPos.y - CHAR_HY + 0.08, resolved.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, currentPos.y + CHAR_HY, resolved.z + CHAR_HZ);

    for (const box of nearby) {
      if (box.meshRef && this._intersectsBuilding(_charBox, box.meshRef)) {
        resolved.z    = currentPos.z;
        this.velocity.z = 0;
        break;
      }
    }

    this.standingBuilding = null;

    // ── Y axis ──
    _charBox.min.set(resolved.x - CHAR_HX, resolved.y - CHAR_HY, resolved.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, resolved.y + CHAR_HY, resolved.z + CHAR_HZ);

    for (const box of nearby) {
      const mesh = box.meshRef;
      if (!mesh || !this._intersectsBuilding(_charBox, mesh)) continue;

      if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
      }

      const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const localPos = resolved.clone().applyMatrix4(invMat);
      const localCurrent = currentPos.clone().applyMatrix4(invMat);
      const localBox = mesh.geometry.boundingBox;

      const playerWasAboveTop = localCurrent.y - CHAR_HY >= localBox.max.y - 0.2;
      const playerWasBelowBot = localCurrent.y + CHAR_HY <= localBox.min.y + 0.2;

      if (playerWasAboveTop) {
        localPos.y    = localBox.max.y + CHAR_HY;
        resolved.copy(localPos.applyMatrix4(mesh.matrixWorld));
        onGround      = true;
        this.standingBuilding = mesh;
        if (this.velocity.y < 0) this.velocity.y = 0;
      } else if (playerWasBelowBot) {
        localPos.y    = localBox.min.y - CHAR_HY;
        resolved.copy(localPos.applyMatrix4(mesh.matrixWorld));
        if (this.velocity.y > 0) this.velocity.y = 0;
      }
      break;
    }

    // ── Ground plane ──
    const terrainHeight = getGroundHeight(resolved.x, resolved.z);
    if (resolved.y - CHAR_HY < terrainHeight) {
      resolved.y    = terrainHeight + CHAR_HY;
      onGround      = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    return { resolvedPos: resolved, onGround };
  }

  /**
   * Helper to check intersection with oriented buildings in local space
   * @private
   */
  _intersectsBuilding(charBox, mesh) {
    // If not tilted, fallback to faster cached AABB intersects check
    const isTilted = mesh.rotation.x !== 0 || mesh.rotation.z !== 0;
    if (!isTilted && mesh.userData.cachedBox) {
      return charBox.intersectsBox(mesh.userData.cachedBox);
    }

    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }

    // Get inverse of world matrix to transform world coordinates to local space
    const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();

    const localCharBox = new THREE.Box3();
    const min = charBox.min;
    const max = charBox.max;

    // Transform all 8 corners to local space to build a tight local AABB
    const corners = [
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(min.x, max.y, max.z),
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(max.x, max.y, max.z)
    ];

    for (const c of corners) {
      c.applyMatrix4(invMat);
      localCharBox.expandByPoint(c);
    }

    return localCharBox.intersectsBox(mesh.geometry.boundingBox);
  }

  /**
   * Filter buildings by distance — avoids checking entire world.
   * Returns cached Box3 arrays.
   * @private
   */
  _nearbyBuildings(pos) {
    const result  = [];
    const r2      = MAX_CHECK_RADIUS * MAX_CHECK_RADIUS;

    for (const mesh of this.buildings) {
      // Fast center-distance check (squared, no sqrt)
      const dx = mesh.position.x - pos.x;
      const dz = mesh.position.z - pos.z;
      if (dx * dx + dz * dz > r2) continue;

      // Use cached box if available (set at build time in BuildingGenerator)
      let box = mesh.userData.cachedBox;
      if (!box) {
        // Fallback: compute and cache
        mesh.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(mesh);
        mesh.userData.cachedBox = box;
      }
      box.meshRef = mesh;

      result.push(box);
    }
    return result;
  }

  jump(strength = 9.5) {
    this.velocity.y = strength;
  }

  setHorizontalVelocity(vx, vz) {
    this.velocity.x = vx;
    this.velocity.z = vz;
  }

  /**
   * Update buildings list from ChunkManager (no scene.traverse).
   * @param {THREE.Mesh[]} buildings
   */
  setBuildingsList(buildings) {
    this.buildings = buildings;
  }
}
