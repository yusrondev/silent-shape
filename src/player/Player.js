/**
 * Player.js — Third-Person Character Controller
 *
 * Shape Style Player:
 *   - Body: BoxGeometry (main body + head block)
 *   - Color: #f0f0f0 (clean white shape)
 *
 * States:
 *   idle | walking | running | jumping | falling | climbing | grappling | gliding
 *
 * Movement is relative to camera facing direction.
 */
import * as THREE from 'three';
import { Physics } from './Physics.js';

const WALK_SPEED    = 6;
const RUN_SPEED     = 11;
const JUMP_STRENGTH = 9.5;
const GRAPPLE_SPEED = 20;

export class Player {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene    = scene;
    this.physics  = new Physics();

    /** Public position reference */
    this.position = new THREE.Vector3(32, 5.0, 32); // spawn high — falls cleanly to ground

    /** Player group (contains all mesh parts) */
    this.group    = new THREE.Group();
    this.group.name = 'player';

    /** Player state */
    this.state    = 'idle'; // 'idle'|'walking'|'running'|'jumping'|'falling'|'gliding'|'grappling'
    this.onGround = false;

    /** Grappling hook state */
    this._grappleTarget = null;
    this._grappleDir    = new THREE.Vector3();
    this._grappleActive = false;
    this._grappleCooldown = 0;

    /** Glider state */
    this._gliderActive = false;
    this._gliderVel    = new THREE.Vector3();

    /** Jump hold tracking */
    this._jumpHoldTime = 0;
    this._jumpTriggered = false;

    /** Artefact interaction */
    this._nearArtefact = null;
    this._transmitHold = 0;

    /** Facing angle (Y rotation) */
    this.facingAngle = 0;

    // Bob animation
    this._bobTime = 0;

    this._buildMesh();
    this.scene.add(this.group);
    this.group.position.copy(this.position);
  }

  /**
   * Build low-poly shape-style character.
   * @private
   */
  _buildMesh() {
    // Body — main block
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.15;
    this.group.add(body);

    // Head — slightly smaller cube
    const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.45);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.65;
    this.group.add(head);

    // Backpack — small box on back
    const packGeo = new THREE.BoxGeometry(0.35, 0.5, 0.25);
    const packMat = new THREE.MeshLambertMaterial({ color: 0x8d8fa3 });
    const pack    = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, -0.05, -0.32);
    this.group.add(pack);

    // Grappling hook indicator (small glowing cube on pack)
    const hookGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const hookMat = new THREE.MeshLambertMaterial({
      color: 0xe8c547,
      emissive: 0xe8c547,
      emissiveIntensity: 0.6,
    });
    this._hookMesh = new THREE.Mesh(hookGeo, hookMat);
    this._hookMesh.position.set(0.2, 0.25, -0.35);
    this.group.add(this._hookMesh);

    // Glider wings (hidden by default)
    this._leftWing  = this._makeWing(-1);
    this._rightWing = this._makeWing(1);
    this.group.add(this._leftWing);
    this.group.add(this._rightWing);
    this._leftWing.visible  = false;
    this._rightWing.visible = false;
  }

  _makeWing(side) {
    const geo = new THREE.BoxGeometry(1.2, 0.06, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6b6c7a });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(side * 0.75, 0, 0);
    mesh.rotation.z = side * 0.15;
    return mesh;
  }

  /**
   * Main update — call each frame.
   * @param {number} delta — seconds
   * @param {InputManager} input
   * @param {THREE.Camera} camera
   */
  update(delta, input, camera) {
    this._handleMovement(delta, input, camera);
    this._handleJump(delta, input);
    this._handleTool(delta, input, camera);
    this._handleArtefactInteraction(delta, input);
    this._animate(delta, input);

    // Sync group to position
    this.group.position.copy(this.position);
  }

  /**
   * @private — Movement relative to camera facing
   */
  _handleMovement(delta, input, camera) {
    let mx = input.move.x;
    let mz = input.move.y; // nipple y = forward
    let intensity = input.moveIntensity;

    // Keyboard fallback for movement
    if (intensity === 0) {
      if (input.keys.w) mz = 1;
      if (input.keys.s) mz = -1;
      if (input.keys.a) mx = -1;
      if (input.keys.d) mx = 1;
      if (mx !== 0 || mz !== 0) {
        intensity = 1.0; // max speed on keyboard
      }
    }

    if (Math.abs(mx) < 0.01 && Math.abs(mz) < 0.01) {
      // No input — decelerate
      this.physics.setHorizontalVelocity(
        this.physics.velocity.x * 0.8,
        this.physics.velocity.z * 0.8
      );
      if (!this._gliderActive) {
        this.state = this.onGround ? 'idle' : this.state;
      }
      return;
    }

    // Camera-relative direction
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));

    // Move direction from joystick input
    const moveDir = new THREE.Vector3()
      .addScaledVector(right, mx)
      .addScaledVector(camDir, mz)
      .normalize();

    const speed = intensity > 0.65 ? RUN_SPEED : WALK_SPEED;
    const targetVX = moveDir.x * speed * intensity;
    const targetVZ = moveDir.z * speed * intensity;

    // Smooth velocity (lerp toward target)
    const lerpFactor = this.onGround ? 0.2 : 0.05;
    this.physics.velocity.x = THREE.MathUtils.lerp(this.physics.velocity.x, targetVX, lerpFactor);
    this.physics.velocity.z = THREE.MathUtils.lerp(this.physics.velocity.z, targetVZ, lerpFactor);

    // Face direction of movement — update target angle, NOT current rotation
    if (moveDir.length() > 0.1) {
      this._targetFacingAngle = Math.atan2(moveDir.x, moveDir.z);
    }

    this.state = this.onGround
      ? (intensity > 0.65 ? 'running' : 'walking')
      : this.state;
  }

  /**
   * @private — Jump & jump hold
   */
  _handleJump(delta, input) {
    if (this._grappleActive || this._gliderActive) return;

    const isJumpPressed = input.jump || input.keys.space;
    const isJumpDown    = input.jumpDown || (input.keys.space && !this._keyboardJumpActive);

    // Track state to get a clean "down" event for space
    if (input.keys.space) {
      this._keyboardJumpActive = true;
    } else {
      this._keyboardJumpActive = false;
    }

    if (isJumpDown && this.onGround) {
      this.physics.jump(JUMP_STRENGTH);
      this.state = 'jumping';
      this._jumpTriggered = true;
      this._jumpHoldTime  = 0;
    }

    // Hold jump for extra height (max 0.3s hold boost)
    if (isJumpPressed && this._jumpTriggered && !this.onGround) {
      this._jumpHoldTime += delta;
      if (this._jumpHoldTime < 0.3) {
        this.physics.velocity.y += 12 * delta;
      } else {
        this._jumpTriggered = false;
      }
    }

    if (input.jumpUp || !isJumpPressed) {
      this._jumpTriggered = false;
    }
  }

  /**
   * @private — Grappling hook & Glider
   */
  _handleTool(delta, input, camera) {
    this._grappleCooldown -= delta;

    // Grappling hook — tap tool button
    if (input.toolDown && !this._grappleActive && this._grappleCooldown <= 0) {
      // Fire grapple in camera look direction
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      this._grappleDir.copy(camDir).normalize();
      this._grappleActive = true;
      this._jumpTriggered = false;
      this.state = 'grappling';
    }

    if (this._grappleActive) {
      // Pull player in grapple direction
      this.physics.velocity.x = this._grappleDir.x * GRAPPLE_SPEED;
      this.physics.velocity.y = this._grappleDir.y * GRAPPLE_SPEED;
      this.physics.velocity.z = this._grappleDir.z * GRAPPLE_SPEED;

      this._grappleActive = false; // Grapple is an impulse (1 frame)
      this._grappleCooldown = 3;   // 3s cooldown
      this._hookMesh.material.emissiveIntensity = 0.1; // dim hook indicator
    }

    // Glider — hold tool while in air
    if (input.tool && !this.onGround && !this._grappleActive && !input.toolDown) {
      if (!this._gliderActive) {
        this._gliderActive = true;
        this.state = 'gliding';
        this._leftWing.visible  = true;
        this._rightWing.visible = true;
      }
    }

    if (this._gliderActive) {
      // Slow fall + horizontal drift
      this.physics.velocity.y = THREE.MathUtils.lerp(
        this.physics.velocity.y,
        -1.5, // slow glide down speed
        0.05
      );
      if (this.onGround || !input.tool) {
        this._gliderActive = false;
        this.state = 'idle';
        this._leftWing.visible  = false;
        this._rightWing.visible = false;
      }
    }

    // Hook indicator glow reset
    if (this._grappleCooldown <= 0) {
      this._hookMesh.material.emissiveIntensity = 0.6;
    }
  }

  /**
   * @private — Artefact interaction & tower transmit
   */
  _handleArtefactInteraction(delta, input) {
    if (!this._nearArtefact) return;

    if (input.interact) {
      this._transmitHold += delta;
      // UI feedback handled by HUD.js listening to player.transmitProgress
    } else {
      this._transmitHold = 0;
    }
  }

  /**
   * Set the currently nearby artefact (called by GameLoop proximity check).
   * @param {THREE.Mesh|null} artefact
   */
  setNearArtefact(artefact) {
    this._nearArtefact = artefact;
    if (!artefact) this._transmitHold = 0;
  }

  get transmitProgress() {
    return Math.min(this._transmitHold / 3, 1); // 3 seconds to transmit
  }

  get isTransmitting() {
    return this._transmitHold > 0 && this._nearArtefact;
  }

  get isTransmitComplete() {
    return this._transmitHold >= 3;
  }

  /**
   * @private — Visual animations (bob, lean, facing rotation)
   */
  _animate(delta, input) {
    // Facing rotation — shortest-angle lerp to prevent spinning
    if (this._targetFacingAngle !== undefined) {
      // Compute shortest angle difference (handles wrap-around ±π)
      let diff = this._targetFacingAngle - this.group.rotation.y;
      // Normalize diff to -π..π
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * 0.15;
    }

    // Bob animation when walking/running
    if (this.state === 'walking' || this.state === 'running') {
      const bobSpeed = this.state === 'running' ? 12 : 7;
      this._bobTime += delta * bobSpeed;
      this.group.position.y = this.position.y + Math.sin(this._bobTime) * 0.06;
    } else {
      this._bobTime = 0;
    }

    // Glider wing flap
    if (this._gliderActive) {
      const flapT = Date.now() * 0.002;
      this._leftWing.rotation.z  = -0.15 + Math.sin(flapT) * 0.05;
      this._rightWing.rotation.z =  0.15 - Math.sin(flapT) * 0.05;
    }

    // Apply physics
    const newPos = this.physics.integrate(this.position, delta, this.onGround);
    const { resolvedPos, onGround } = this.physics.resolveCollision(newPos, this.position);

    this.position.copy(resolvedPos);
    this.onGround = onGround;

    if (!onGround && this.physics.velocity.y < -2 && this.state !== 'gliding') {
      this.state = 'falling';
    }
  }
}
