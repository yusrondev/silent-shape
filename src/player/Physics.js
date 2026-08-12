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

const GRAVITY         = -22;
const MAX_FALL        = -35;
const CHAR_HX         = 0.4;
const CHAR_HY         = 0.9;
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
    _charBox.set(
      _tmp.set(resolved.x - CHAR_HX, currentPos.y - CHAR_HY, currentPos.z - CHAR_HZ),
      _tmp.set(resolved.x + CHAR_HX, currentPos.y + CHAR_HY, currentPos.z + CHAR_HZ)
    );
    // Note: Box3.set doesn't copy, need proper setup:
    _charBox.min.set(resolved.x - CHAR_HX, currentPos.y - CHAR_HY, currentPos.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, currentPos.y + CHAR_HY, currentPos.z + CHAR_HZ);

    for (const box of nearby) {
      if (_charBox.intersectsBox(box)) {
        resolved.x    = currentPos.x;
        this.velocity.x = 0;
        break;
      }
    }

    // ── Z axis ──
    _charBox.min.set(resolved.x - CHAR_HX, currentPos.y - CHAR_HY, resolved.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, currentPos.y + CHAR_HY, resolved.z + CHAR_HZ);

    for (const box of nearby) {
      if (_charBox.intersectsBox(box)) {
        resolved.z    = currentPos.z;
        this.velocity.z = 0;
        break;
      }
    }

    // ── Y axis ──
    _charBox.min.set(resolved.x - CHAR_HX, resolved.y - CHAR_HY, resolved.z - CHAR_HZ);
    _charBox.max.set(resolved.x + CHAR_HX, resolved.y + CHAR_HY, resolved.z + CHAR_HZ);

    for (const box of nearby) {
      if (!_charBox.intersectsBox(box)) continue;

      const playerWasAboveTop = currentPos.y - CHAR_HY >= box.max.y - 0.2;
      const playerWasBelowBot = currentPos.y + CHAR_HY <= box.min.y + 0.2;

      if (playerWasAboveTop) {
        resolved.y    = box.max.y + CHAR_HY;
        onGround      = true;
        if (this.velocity.y < 0) this.velocity.y = 0;
      } else if (playerWasBelowBot) {
        resolved.y    = box.min.y - CHAR_HY;
        if (this.velocity.y > 0) this.velocity.y = 0;
      }
      break;
    }

    // ── Ground plane ──
    if (resolved.y - CHAR_HY < 0) {
      resolved.y    = CHAR_HY;
      onGround      = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    return { resolvedPos: resolved, onGround };
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
