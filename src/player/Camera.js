/**
 * Camera.js — Third-Person Orbit Camera
 *
 * Input sources:
 *  - Mouse drag on canvas (desktop) — ONLY while mouse button held
 *  - Touch drag via InputManager.cameraDelta (mobile, set by TouchControls)
 *  - Arrow keys (inverted, keyboard)
 *
 * Camera DOES NOT move on its own (no auto-follow, no uncontrolled inertia).
 * Inertia decays to zero quickly after user releases drag.
 */
import * as THREE from 'three';

const ORBIT_DISTANCE    = 9;
const ORBIT_HEIGHT      = 4;
const LERP_SPEED        = 8;
const TOUCH_SENSITIVITY = 0.005;
const MOUSE_SENSITIVITY = 0.004;
const KEY_SENSITIVITY   = 0.035;
const VERT_MIN          = -0.5;   // look upward
const VERT_MAX          =  1.2;   // look downward
const INERTIA_DECAY     = 0.75;   // fast decay — camera stops quickly

export class Camera {
  constructor(camera) {
    this.camera = camera;

    this._yaw   = 0;
    this._pitch = 0.35;

    this._targetPos  = new THREE.Vector3();
    this._currentPos = new THREE.Vector3();

    // Inertia (only from touch/mouse swipe, not continuous)
    this._inertiaX = 0;
    this._inertiaY = 0;

    // Mouse state (desktop)
    this._mouseDown  = false;
    this._mouseLastX = 0;
    this._mouseLastY = 0;

    this._initCamera();
    this._initMouseDrag();
  }

  _initCamera() {
    this.camera.fov    = 75;
    this.camera.near   = 0.1;
    this.camera.far    = 120;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Mouse drag on canvas — desktop camera control.
   * Only active while left mouse button is held.
   */
  _initMouseDrag() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._mouseDown  = true;
      this._mouseLastX = e.clientX;
      this._mouseLastY = e.clientY;
      this._inertiaX   = 0;  // reset inertia on new drag
      this._inertiaY   = 0;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._mouseDown) return;

      const dx = (e.clientX - this._mouseLastX) * MOUSE_SENSITIVITY;
      const dy = (e.clientY - this._mouseLastY) * MOUSE_SENSITIVITY;

      this._yaw   -= dx;
      this._pitch += dy;
      this._pitch  = THREE.MathUtils.clamp(this._pitch, VERT_MIN, VERT_MAX);

      // Store for inertia on release
      this._inertiaX = dx * 0.5;
      this._inertiaY = dy * 0.5;

      this._mouseLastX = e.clientX;
      this._mouseLastY = e.clientY;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this._mouseDown = false;
      canvas.style.cursor = 'grab';
    });

    canvas.style.cursor = 'grab';
  }

  update(playerPos, input, delta) {
    this._applyTouchAndKeys(input);
    this._applyInertia();
    this._updateOrbit(playerPos, delta);
  }

  /**
   * Process touch delta (from TouchControls) and keyboard arrow keys.
   * These are the ONLY sources that move the camera besides mouse drag.
   */
  _applyTouchAndKeys(input) {
    let dx = 0;
    let dy = 0;

    // Touch (from InputManager.cameraDelta — pixel deltas, flushed each frame)
    if (input.cameraDelta.x !== 0 || input.cameraDelta.y !== 0) {
      dx += input.cameraDelta.x * TOUCH_SENSITIVITY;
      dy += input.cameraDelta.y * TOUCH_SENSITIVITY;
    }

    // Arrow keys — inverted as requested
    if (input.keys.arrowleft)  dx -= KEY_SENSITIVITY;
    if (input.keys.arrowright) dx += KEY_SENSITIVITY;
    if (input.keys.arrowup)    dy -= KEY_SENSITIVITY;
    if (input.keys.arrowdown)  dy += KEY_SENSITIVITY;

    if (dx !== 0 || dy !== 0) {
      this._yaw   -= dx;
      this._pitch += dy;
      this._pitch  = THREE.MathUtils.clamp(this._pitch, VERT_MIN, VERT_MAX);

      // Give touch/key inertia too (feels natural on mobile)
      this._inertiaX = dx * 0.4;
      this._inertiaY = dy * 0.4;
    }
  }

  /** Decays inertia fast so camera doesn't drift indefinitely */
  _applyInertia() {
    if (Math.abs(this._inertiaX) < 0.0001 && Math.abs(this._inertiaY) < 0.0001) {
      this._inertiaX = 0;
      this._inertiaY = 0;
      return;
    }
    this._yaw   -= this._inertiaX;
    this._pitch += this._inertiaY;
    this._pitch  = THREE.MathUtils.clamp(this._pitch, VERT_MIN, VERT_MAX);
    this._inertiaX *= INERTIA_DECAY;
    this._inertiaY *= INERTIA_DECAY;
  }

  _updateOrbit(playerPos, delta) {
    this._targetPos.set(playerPos.x, playerPos.y + 0.6, playerPos.z);

    const sinYaw   = Math.sin(this._yaw);
    const cosYaw   = Math.cos(this._yaw);
    const cosPitch = Math.cos(this._pitch);
    const sinPitch = Math.sin(this._pitch);

    const targetCamPos = new THREE.Vector3(
      this._targetPos.x + sinYaw * cosPitch * ORBIT_DISTANCE,
      this._targetPos.y + sinPitch * ORBIT_DISTANCE + ORBIT_HEIGHT,
      this._targetPos.z + cosYaw * cosPitch * ORBIT_DISTANCE
    );

    if (targetCamPos.y < 0.5) targetCamPos.y = 0.5;

    const t = Math.min(LERP_SPEED * delta, 1);
    this._currentPos.lerp(targetCamPos, t);
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._targetPos);
  }

  get yaw() { return this._yaw; }
  setYaw(yaw) { this._yaw = yaw; }

  snapTo(playerPos) {
    this._currentPos.set(
      playerPos.x + Math.sin(this._yaw) * ORBIT_DISTANCE,
      playerPos.y + ORBIT_HEIGHT + Math.sin(this._pitch) * ORBIT_DISTANCE,
      playerPos.z + Math.cos(this._yaw) * ORBIT_DISTANCE
    );
    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(playerPos);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
