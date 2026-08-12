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
    this.particles = [];
    this._particlePool = [];

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

    /** HP & Combat state */
    this.hp = 100;
    this.isFiring = false;
    this._hasTarget = false;
    this._targetEnemyPos = null;
    this._fireHand = 'right'; // alternates each shot: 'right' | 'left'

    this._buildMesh();
    this.scene.add(this.group);
    this.group.position.copy(this.position);
  }

  /**
   * Build low-poly shape-style character.
   * @private
   */
  /**
   * Build low-poly shape-style character with jointed limbs.
   * @private
   */
  _buildMesh() {
    // Body — main block (Dark Charcoal tunic style)
    const bodyGeo = new THREE.BoxGeometry(0.65, 1.0, 0.38);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); // Dark Charcoal
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.1;
    this.group.add(body);

    const goldMat  = new THREE.MeshLambertMaterial({
      color: 0xe8c547,
      emissive: 0xe8c547,
      emissiveIntensity: 0.3
    });

    // Gold sash/belt
    const sashGeo = new THREE.BoxGeometry(0.67, 0.12, 0.4);
    const sashMesh = new THREE.Mesh(sashGeo, goldMat);
    sashMesh.position.set(0, -0.22, 0);
    this.group.add(sashMesh);

    // Front crossover collar flaps (outer vest style)
    const flapMat = new THREE.MeshLambertMaterial({ color: 0x242424 }); // Slightly lighter charcoal
    
    const leftFlap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.04), flapMat);
    leftFlap.position.set(-0.1, 0.15, 0.2);
    leftFlap.rotation.z = -0.15;
    this.group.add(leftFlap);

    const rightFlap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.04), flapMat);
    rightFlap.position.set(0.1, 0.15, 0.2);
    rightFlap.rotation.z = 0.15;
    this.group.add(rightFlap);

    // Crossover gold trim lines
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.05), goldMat);
    leftTrim.position.set(-0.06, 0.15, 0.21);
    leftTrim.rotation.z = -0.15;
    this.group.add(leftTrim);

    const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.05), goldMat);
    rightTrim.position.set(0.06, 0.15, 0.21);
    rightTrim.rotation.z = 0.15;
    this.group.add(rightTrim);

    // Gold collar hanging tassels (left/right)
    const tasselGeo = new THREE.BoxGeometry(0.04, 0.16, 0.04);
    
    const leftTassel = new THREE.Mesh(tasselGeo, goldMat);
    leftTassel.position.set(-0.12, -0.05, 0.22);
    this.group.add(leftTassel);

    const rightTassel = new THREE.Mesh(tasselGeo, goldMat);
    rightTassel.position.set(0.12, -0.05, 0.22);
    this.group.add(rightTassel);

    // Head — slightly smaller cube
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.4);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.65;
    this.group.add(head);

    // Visor (signature explorer mask)
    const visorGeo = new THREE.BoxGeometry(0.52, 0.15, 0.22);
    const visorMat = new THREE.MeshLambertMaterial({ color: 0x22222b });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 0.68, 0.1);
    this.group.add(visorMesh);

    // Glowing visor bar
    const glowGeo = new THREE.BoxGeometry(0.42, 0.04, 0.05);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xe8c547, // glowing gold theme
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.set(0, 0.68, 0.21);
    this.group.add(glowMesh);

    // Dynamic forward PointLight for dramatic visor glow
    const visorLight = new THREE.PointLight(0xe8c547, 2.5, 6.0);
    visorLight.position.set(0, 0.68, 0.25);
    this.group.add(visorLight);

    // Backpack — small box on back
    const packGeo = new THREE.BoxGeometry(0.35, 0.5, 0.25);
    const packMat = new THREE.MeshLambertMaterial({ color: 0x8d8fa3 });
    const pack    = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, -0.05, -0.32);
    this.group.add(pack);

    // Grappling hook indicator (glowing cube on pack)
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

    // --- MILITARY OVERCOAT / CLOAK (JUBAH) ---
    const cloakMat = new THREE.MeshLambertMaterial({ color: 0x1d2d44 }); // Dark Navy Blue/Teal

    // High Collar
    const collarGeo = new THREE.BoxGeometry(0.53, 0.22, 0.42);
    const collarMesh = new THREE.Mesh(collarGeo, cloakMat);
    collarMesh.position.set(0, 0.38, 0.02);
    this.group.add(collarMesh);

    // Collar gold trim
    const trimGeo = new THREE.BoxGeometry(0.55, 0.04, 0.44);
    const trimMesh = new THREE.Mesh(trimGeo, goldMat);
    trimMesh.position.set(0, 0.48, 0.02);
    this.group.add(trimMesh);

    // Shoulder capes / Epaulets (left & right)
    const shoulderGeo = new THREE.BoxGeometry(0.18, 0.25, 0.42);
    
    const leftShoulder = new THREE.Mesh(shoulderGeo, cloakMat);
    leftShoulder.position.set(-0.35, 0.15, -0.05);
    this.group.add(leftShoulder);

    // Left gold top plate (pauldron)
    const leftPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.44), goldMat);
    leftPauldron.position.set(-0.35, 0.28, -0.05);
    this.group.add(leftPauldron);

    const rightShoulder = new THREE.Mesh(shoulderGeo, cloakMat);
    rightShoulder.position.set(0.35, 0.15, -0.05);
    this.group.add(rightShoulder);

    // Right gold top plate (pauldron)
    const rightPauldron = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.44), goldMat);
    rightPauldron.position.set(0.35, 0.28, -0.05);
    this.group.add(rightPauldron);

    // Split Back Cloak (Left & Right panels)
    // Left Cape Chain
    this.leftCapeSeg1 = new THREE.Group();
    this.leftCapeSeg1.position.set(-0.18, 0.1, -0.22);
    this.group.add(this.leftCapeSeg1);

    const leftCapeMesh1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.03), cloakMat);
    leftCapeMesh1.position.y = -0.2;
    this.leftCapeSeg1.add(leftCapeMesh1);

    this.leftCapeSeg2 = new THREE.Group();
    this.leftCapeSeg2.position.set(0, -0.4, 0);
    this.leftCapeSeg1.add(this.leftCapeSeg2);

    const leftCapeMesh2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.02), cloakMat);
    leftCapeMesh2.position.y = -0.2;
    this.leftCapeSeg2.add(leftCapeMesh2);

    this.leftCapeSeg3 = new THREE.Group();
    this.leftCapeSeg3.position.set(0, -0.4, 0);
    this.leftCapeSeg2.add(this.leftCapeSeg3);

    const leftCapeMesh3 = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.4, 0.015), cloakMat);
    leftCapeMesh3.position.y = -0.2;
    this.leftCapeSeg3.add(leftCapeMesh3);

    // Left Cape Tassel
    const bottomTasselGeo = new THREE.BoxGeometry(0.05, 0.15, 0.05);
    const leftCapeTassel = new THREE.Mesh(bottomTasselGeo, goldMat);
    leftCapeTassel.position.set(0, -0.475, 0);
    this.leftCapeSeg3.add(leftCapeTassel);

    // Right Cape Chain
    this.rightCapeSeg1 = new THREE.Group();
    this.rightCapeSeg1.position.set(0.18, 0.1, -0.22);
    this.group.add(this.rightCapeSeg1);

    const rightCapeMesh1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.03), cloakMat);
    rightCapeMesh1.position.y = -0.2;
    this.rightCapeSeg1.add(rightCapeMesh1);

    this.rightCapeSeg2 = new THREE.Group();
    this.rightCapeSeg2.position.set(0, -0.4, 0);
    this.rightCapeSeg1.add(this.rightCapeSeg2);

    const rightCapeMesh2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.02), cloakMat);
    rightCapeMesh2.position.y = -0.2;
    this.rightCapeSeg2.add(rightCapeMesh2);

    this.rightCapeSeg3 = new THREE.Group();
    this.rightCapeSeg3.position.set(0, -0.4, 0);
    this.rightCapeSeg2.add(this.rightCapeSeg3);

    const rightCapeMesh3 = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.4, 0.015), cloakMat);
    rightCapeMesh3.position.y = -0.2;
    this.rightCapeSeg3.add(rightCapeMesh3);

    // Right Cape Tassel
    const rightCapeTassel = new THREE.Mesh(bottomTasselGeo, goldMat);
    rightCapeTassel.position.set(0, -0.475, 0);
    this.rightCapeSeg3.add(rightCapeTassel);

    // --- JOINTED LIMBS ---
    const limbMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.2, -0.6, 0);
    this.group.add(this.leftLeg);

    const thighGeo = new THREE.BoxGeometry(0.16, 0.35, 0.16);
    const leftThigh = new THREE.Mesh(thighGeo, limbMat);
    leftThigh.position.y = -0.175; // pivot at top of thigh
    this.leftLeg.add(leftThigh);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -0.35, 0);
    this.leftLeg.add(this.leftKnee);

    // Calf (Boot style: dark color)
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x1f1f1f });
    const calfGeo = new THREE.BoxGeometry(0.14, 0.35, 0.14);
    
    const leftCalf = new THREE.Mesh(calfGeo, bootMat);
    leftCalf.position.y = -0.175; // pivot at knee
    this.leftKnee.add(leftCalf);

    // Left boot fold band
    const leftBootBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), goldMat);
    leftBootBand.position.y = -0.05; // top of boot
    this.leftKnee.add(leftBootBand);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.2, -0.6, 0);
    this.group.add(this.rightLeg);

    const rightThigh = new THREE.Mesh(thighGeo, limbMat);
    rightThigh.position.y = -0.175;
    this.rightLeg.add(rightThigh);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -0.35, 0);
    this.rightLeg.add(this.rightKnee);

    const rightCalf = new THREE.Mesh(calfGeo, bootMat);
    rightCalf.position.y = -0.175;
    this.rightKnee.add(rightCalf);

    // Right boot fold band
    const rightBootBand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), goldMat);
    rightBootBand.position.y = -0.05;
    this.rightKnee.add(rightBootBand);

    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.43, 0.2, 0);
    this.group.add(this.leftArm);

    const upperArmGeo = new THREE.BoxGeometry(0.14, 0.35, 0.14);
    const leftUpperArm = new THREE.Mesh(upperArmGeo, limbMat);
    leftUpperArm.position.y = -0.175;
    this.leftArm.add(leftUpperArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.set(0, -0.35, 0);
    this.leftArm.add(this.leftElbow);

    const forearmGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
    const leftForearm = new THREE.Mesh(forearmGeo, limbMat);
    leftForearm.position.y = -0.16;
    this.leftElbow.add(leftForearm);

    // Left cuff
    const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), goldMat);
    leftCuff.position.y = -0.24; // bottom of forearm
    this.leftElbow.add(leftCuff);

    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.43, 0.2, 0);
    this.group.add(this.rightArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeo, limbMat);
    rightUpperArm.position.y = -0.175;
    this.rightArm.add(rightUpperArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -0.35, 0);
    this.rightArm.add(this.rightElbow);

    const rightForearm = new THREE.Mesh(forearmGeo, limbMat);
    rightForearm.position.y = -0.16;
    this.rightElbow.add(rightForearm);

    // Right cuff
    const rightCuff = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), goldMat);
    rightCuff.position.y = -0.24; // bottom of forearm
    this.rightElbow.add(rightCuff);

    // Long rifle (Laras Panjang)
    this.gunGroup = new THREE.Group();
    this.gunGroup.position.set(0.04, -0.24, 0.12);
    this.gunGroup.rotation.set(-Math.PI / 2, 0, 0); // Pointing forward

    const ironMat = new THREE.MeshLambertMaterial({ color: 0x1f1f1f });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 }); // Brown stock

    // Gun body
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.45), woodMat);
    bodyMesh.position.set(0, 0, -0.1);
    this.gunGroup.add(bodyMesh);

    // Barrel (Laras Panjang)
    const barrelMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.65), ironMat);
    barrelMesh.position.set(0, 0.02, -0.55);
    this.gunGroup.add(barrelMesh);

    // Scope
    const scopeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), ironMat);
    scopeMesh.position.set(0, 0.06, -0.1);
    this.gunGroup.add(scopeMesh);

    this.gunGroup.visible = false; // Hidden until combat
    this.rightElbow.add(this.gunGroup);

    // Muzzle Flash (right rifle)
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    this.muzzleFlash = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.07, 0.18, 6), flashMat);
    this.muzzleFlash.rotation.x = Math.PI / 2;
    this.muzzleFlash.position.set(0, 0.02, -0.88);
    this.muzzleFlash.visible = false;
    this.gunGroup.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffaa00, 2, 5);
    this.muzzleLight.position.set(0, 0.02, -0.9);
    this.muzzleLight.visible = false;
    this.gunGroup.add(this.muzzleLight);

    // --- LEFT HAND PISTOL ---
    this.pistolGroup = new THREE.Group();
    this.pistolGroup.position.set(-0.04, -0.24, 0.1);
    this.pistolGroup.rotation.set(-Math.PI / 2, 0, 0);
    this.pistolGroup.visible = false; // Hidden until combat

    const pistolIron = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    // Pistol slide
    const pistolBody = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.22), pistolIron);
    pistolBody.position.set(0, 0, -0.08);
    this.pistolGroup.add(pistolBody);

    // Pistol grip
    const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    pistolGrip.position.set(0, -0.04, 0.04);
    this.pistolGroup.add(pistolGrip);

    // Pistol barrel tip
    const pistolBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.08), pistolIron);
    pistolBarrel.position.set(0, 0.015, -0.21);
    this.pistolGroup.add(pistolBarrel);

    this.leftElbow.add(this.pistolGroup);

    // Muzzle flash for pistol (left hand)
    const flashMat2 = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    this.muzzleFlashL = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.055, 0.12, 6), flashMat2);
    this.muzzleFlashL.rotation.x = Math.PI / 2;
    this.muzzleFlashL.position.set(0, 0.015, -0.26);
    this.muzzleFlashL.visible = false;
    this.pistolGroup.add(this.muzzleFlashL);

    this.muzzleLightL = new THREE.PointLight(0xffcc44, 1.5, 4);
    this.muzzleLightL.position.set(0, 0.015, -0.28);
    this.muzzleLightL.visible = false;
    this.pistolGroup.add(this.muzzleLightL);

    this.muzzleParticles = [];
  }

  _makeWing(side) {
    const wingGroup = new THREE.Group();

    // Main wing box (swept back)
    const mainGeo = new THREE.BoxGeometry(1.3, 0.04, 0.5);
    const mainMat = new THREE.MeshLambertMaterial({ color: 0xe8c547 }); // matching yellow emissive theme
    const mainMesh = new THREE.Mesh(mainGeo, mainMat);
    mainMesh.position.set(side * 0.65, 0, -0.2);
    mainMesh.rotation.y = -side * 0.15; // swept back
    wingGroup.add(mainMesh);

    // Winglet (vertical tip pointing up)
    const tipGeo = new THREE.BoxGeometry(0.08, 0.3, 0.35);
    const tipMat = new THREE.MeshLambertMaterial({ color: 0x3d3d3d });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.position.set(side * 1.3, 0.13, -0.25);
    tipMesh.rotation.y = -side * 0.15;
    wingGroup.add(tipMesh);

    // Tip marker for particle spawn
    const tipMarker = new THREE.Object3D();
    tipMarker.position.set(side * 1.3, 0.28, -0.25);
    wingGroup.add(tipMarker);
    if (side === -1) this._leftTipMarker = tipMarker;
    else this._rightTipMarker = tipMarker;

    // Initialize with 0 scale for deployment animation
    wingGroup.scale.set(0, 0, 0);

    return wingGroup;
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
    this._updateParticles(delta);
    this._updateMuzzleParticles(delta);

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
    if (this._hasTarget && this._targetEnemyPos) {
      const dx = this._targetEnemyPos.x - this.position.x;
      const dz = this._targetEnemyPos.z - this.position.z;
      this._targetFacingAngle = Math.atan2(dx, dz);
    } else if (moveDir.length() > 0.1) {
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
    // Jump mechanics disabled in favor of combat system
  }

  /**
   * @private — Fly upward (Faster and punchier lift-off)
   */
  _handleTool(delta, input, camera) {
    if (input.tool) {
      // Fly faster and more naturally upwards
      this.physics.velocity.y = THREE.MathUtils.lerp(
        this.physics.velocity.y,
        9.0, // target upward speed
        0.18 // higher lerp factor for punchier lift-off
      );
      if (!this._gliderActive) {
        this._gliderActive = true;
        this.state = 'gliding';
      }
    } else {
      if (this._gliderActive) {
        this._gliderActive = false;
        // Let natural physics take over (gravity falls back)
        if (this.onGround) {
          this.state = 'idle';
        }
      }
    }
  }

  /**
   * @private — Artefact interaction & tower transmit (Instant pickup)
   */
  _handleArtefactInteraction(delta, input) {
    if (!this._nearArtefact) return;

    if (input.interact || input.keys.e) {
      this._transmitHold = 3.0; // Instantly completes interaction
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
      // When locked onto an enemy, rotate faster for a snappy combat feel
      const rotSpeed = (this.isFiring || this._hasTarget) ? 0.3 : 0.15;
      // Compute shortest angle difference (handles wrap-around ±π)
      let diff = this._targetFacingAngle - this.group.rotation.y;
      // Normalize diff to -π..π
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.group.rotation.y += diff * rotSpeed;
    }
    // Sync facingAngle so other systems (auto-aim, shooting) see the real direction
    this.facingAngle = this.group.rotation.y;

    // --- LIMBS & MODEL ANIMATION SYSTEM ---
    const bobSpeed = this.state === 'running' ? 13 : 8;
    
    if (this.state === 'walking' || this.state === 'running') {
      this._bobTime += delta * bobSpeed;
      
      // Bob the body up and down
      this.group.position.y = this.position.y + Math.sin(this._bobTime) * 0.05;

      const maxSwing = this.state === 'running' ? 0.75 : 0.4;
      const maxKneeBend = this.state === 'running' ? 0.8 : 0.45;
      const maxArmSwing = this.state === 'running' ? 0.8 : 0.45;
      const maxElbowBend = this.state === 'running' ? 0.6 : 0.3;

      // Leg swing (alternating)
      this.leftLeg.rotation.x = Math.sin(this._bobTime) * maxSwing;
      this.rightLeg.rotation.x = -Math.sin(this._bobTime) * maxSwing;

      // Knee bend: bend calves backwards during recovery/backswing
      this.leftKnee.rotation.x = Math.max(0, -Math.sin(this._bobTime)) * maxKneeBend;
      this.rightKnee.rotation.x = Math.max(0, Math.sin(this._bobTime)) * maxKneeBend;

      if (!this.isFiring && !this._hasTarget) {
        // Arm swing (opposing legs)
        this.leftArm.rotation.x = -Math.sin(this._bobTime) * maxArmSwing;
        this.rightArm.rotation.x = Math.sin(this._bobTime) * maxArmSwing;

        // Outward arm rotation for running style
        this.leftArm.rotation.z = -0.08 - Math.abs(Math.sin(this._bobTime)) * 0.04;
        this.rightArm.rotation.z = 0.08 + Math.abs(Math.sin(this._bobTime)) * 0.04;

        // Elbow bend (bend forward)
        this.leftElbow.rotation.x = -0.2 - Math.abs(Math.sin(this._bobTime)) * maxElbowBend;
        this.rightElbow.rotation.x = -0.2 - Math.abs(Math.sin(this._bobTime)) * maxElbowBend;
      }

    } else if (this.state === 'idle') {
      this._bobTime = 0;
      
      // Smooth reset to idle position
      const tFactor = 0.15;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, tFactor);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, tFactor);
      
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 0, tFactor);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 0, tFactor);
      
      if (!this.isFiring && !this._hasTarget) {
        // Idle breathing for arms
        const breath = Math.sin(Date.now() * 0.003) * 0.03;
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, tFactor);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, tFactor);
        
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -0.05 + breath, tFactor);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.05 - breath, tFactor);

        this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, -0.15, tFactor);
        this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, -0.15, tFactor);
      }

    } else if (this.state === 'jumping' || this.state === 'falling') {
      // Dynamic jump/fall poses
      const tFactor = 0.15;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.25, tFactor);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -0.1, tFactor);
      
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 0.4, tFactor);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 0.15, tFactor);

      if (!this.isFiring && !this._hasTarget) {
        // Raise arms slightly
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -0.5, tFactor);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.5, tFactor);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -0.2, tFactor);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.2, tFactor);
        
        this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, -0.4, tFactor);
        this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, -0.4, tFactor);
      }

    } else if (this.state === 'gliding') {
      // Glide wing-spread pose
      const tFactor = 0.15;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.3, tFactor);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0.3, tFactor);
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 0.2, tFactor);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 0.2, tFactor);

      if (!this.isFiring && !this._hasTarget) {
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, tFactor);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, tFactor);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -1.2, tFactor);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 1.2, tFactor);

        this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, -0.1, tFactor);
        this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, -0.1, tFactor);
      }
    }

    // Smooth deploy/retract animation for wings
    const targetScale = this._gliderActive ? 1.0 : 0.0;
    this._leftWing.scale.x = THREE.MathUtils.lerp(this._leftWing.scale.x, targetScale, 0.15);
    this._leftWing.scale.y = THREE.MathUtils.lerp(this._leftWing.scale.y, targetScale, 0.15);
    this._leftWing.scale.z = THREE.MathUtils.lerp(this._leftWing.scale.z, targetScale, 0.15);
    this._leftWing.visible = this._leftWing.scale.x > 0.01;

    this._rightWing.scale.copy(this._leftWing.scale);
    this._rightWing.visible = this._leftWing.visible;

    // Spawn wind trails at wingtips if flying
    if (this._gliderActive && this._leftWing.scale.x > 0.5) {
      const leftPos = new THREE.Vector3();
      const rightPos = new THREE.Vector3();
      this._leftTipMarker.getWorldPosition(leftPos);
      this._rightTipMarker.getWorldPosition(rightPos);

      this._spawnTrailParticle(leftPos);
      this._spawnTrailParticle(rightPos);
    }

    // Glider wing flap / angle
    if (this._gliderActive) {
      const flapT = Date.now() * 0.005;
      this._leftWing.rotation.z  = -0.1 + Math.sin(flapT) * 0.03;
      this._rightWing.rotation.z =  0.1 - Math.sin(flapT) * 0.03;
    } else {
      this._leftWing.rotation.z  = THREE.MathUtils.lerp(this._leftWing.rotation.z, -0.1, 0.15);
      this._rightWing.rotation.z = THREE.MathUtils.lerp(this._rightWing.rotation.z, 0.1, 0.15);
    }

    // Shooter stance overrides (takes priority over normal arm animations)
    if (this.isFiring || this._hasTarget) {
      // Show weapons when in combat
      this.gunGroup.visible = true;
      this.pistolGroup.visible = true;

      const tFactor = 0.28;
      // Right arm: extend forward and slightly inward to hold trigger
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -Math.PI * 0.55, tFactor);
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0.15, tFactor);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.08, tFactor);
      this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, 0.3, tFactor);

      // Left arm: forward and across body to support barrel / fore-grip
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -Math.PI * 0.52, tFactor);
      this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, -0.35, tFactor);
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0.12, tFactor);
      this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, 0.45, tFactor);
    } else {
      // Hide weapons when not in combat
      this.gunGroup.visible = false;
      this.pistolGroup.visible = false;
    }

    // --- CAPE ANIMATION ---
    const speedX = this.physics.velocity.x;
    const speedZ = this.physics.velocity.z;
    const horizontalSpeed = Math.sqrt(speedX * speedX + speedZ * speedZ);
    const verticalSpeed = this.physics.velocity.y;

    let baseCapeAngle = 0.15; // default hang angle
    let flutterSpeed = 10;
    let flutterIntensity = 0.05;

    if (this._gliderActive) {
      if (verticalSpeed > 0.5) {
        // Ascending: Wind from above pushes cape down (cling to back)
        baseCapeAngle = 0.02 - (verticalSpeed * 0.04);
        baseCapeAngle = Math.max(-0.25, baseCapeAngle); // prevent clipping inside body
        flutterSpeed = 16;
        flutterIntensity = 0.06;
      } else {
        // Gliding horizontally / descending: Wind from front/below blows cape backward/up
        baseCapeAngle = 1.2 - (verticalSpeed * 0.05);
        flutterSpeed = 24;
        flutterIntensity = 0.2;
      }
    } else if (this.state === 'walking' || this.state === 'running') {
      // Moving on ground: Cape swings back based on speed
      baseCapeAngle = 0.2 + (horizontalSpeed / RUN_SPEED) * 0.5;
      flutterSpeed = this.state === 'running' ? 18 : 12;
      flutterIntensity = this.state === 'running' ? 0.15 : 0.08;
    } else if (this.state === 'jumping' || this.state === 'falling') {
      // In air: Cape trails vertical movement
      baseCapeAngle = 0.15 - (verticalSpeed * 0.08);
      flutterSpeed = 14;
      flutterIntensity = 0.1;
    } else {
      // Idle: gentle breeze
      baseCapeAngle = 0.1;
      flutterSpeed = 4;
      flutterIntensity = 0.03;
    }

    const capeTime = Date.now() * 0.001 * flutterSpeed;
    
    // Left Cape Panel rotations
    this.leftCapeSeg1.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.x, baseCapeAngle + Math.sin(capeTime) * flutterIntensity, 0.1);
    this.leftCapeSeg2.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg2.rotation.x, baseCapeAngle * 0.8 + Math.sin(capeTime - 1.0) * flutterIntensity * 1.2, 0.1);
    this.leftCapeSeg3.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg3.rotation.x, baseCapeAngle * 0.6 + Math.sin(capeTime - 2.0) * flutterIntensity * 1.5, 0.1);

    // Right Cape Panel rotations (slight phase offset for natural async flutter)
    this.rightCapeSeg1.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.x, baseCapeAngle + Math.sin(capeTime + 0.5) * flutterIntensity, 0.1);
    this.rightCapeSeg2.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg2.rotation.x, baseCapeAngle * 0.8 + Math.sin(capeTime - 0.5) * flutterIntensity * 1.2, 0.1);
    this.rightCapeSeg3.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg3.rotation.x, baseCapeAngle * 0.6 + Math.sin(capeTime - 1.5) * flutterIntensity * 1.5, 0.1);

    // Spread cape panels outwards when running/flying (using Z-axis rotation)
    const baseSpread = 0.08; // slight natural split
    const speedSpread = this._gliderActive ? 0.35 : (this.state === 'running' ? 0.22 : (this.state === 'walking' ? 0.12 : 0.0));
    
    this.leftCapeSeg1.rotation.z = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.z, -baseSpread - speedSpread, 0.1);
    this.rightCapeSeg1.rotation.z = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.z, baseSpread + speedSpread, 0.1);
    
    // Side swing (heading changes and wind)
    const sideSwing = Math.sin(Date.now() * 0.001 * (flutterSpeed * 0.5)) * flutterIntensity * 0.5;
    this.leftCapeSeg1.rotation.y = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.y, sideSwing, 0.1);
    this.leftCapeSeg2.rotation.y = THREE.MathUtils.lerp(this.leftCapeSeg2.rotation.y, sideSwing * 1.2, 0.1);
    this.leftCapeSeg3.rotation.y = THREE.MathUtils.lerp(this.leftCapeSeg3.rotation.y, sideSwing * 1.5, 0.1);

    this.rightCapeSeg1.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.y, sideSwing, 0.1);
    this.rightCapeSeg2.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg2.rotation.y, sideSwing * 1.2, 0.1);
    this.rightCapeSeg3.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg3.rotation.y, sideSwing * 1.5, 0.1);

    // Apply slope-aligned tilt rotation
    let targetTiltX = 0;
    let targetTiltZ = 0;
    if (this.onGround && this.physics.standingBuilding) {
      targetTiltX = this.physics.standingBuilding.rotation.x;
      targetTiltZ = this.physics.standingBuilding.rotation.z;
    }
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, targetTiltX, 0.1);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, targetTiltZ, 0.1);

    // Apply physics
    const newPos = this.physics.integrate(this.position, delta, this.onGround);
    const { resolvedPos, onGround } = this.physics.resolveCollision(newPos, this.position);

    this.position.copy(resolvedPos);
    this.onGround = onGround;

    if (!onGround && this.physics.velocity.y < -2 && this.state !== 'gliding') {
      this.state = 'falling';
    }
  }

  _spawnTrailParticle(pos) {
    let p;
    if (this._particlePool.length > 0) {
      p = this._particlePool.pop();
      p.mesh.position.copy(pos);
      p.mesh.scale.set(1, 1, 1);
      p.mesh.material.opacity = 0.5;
      p.mesh.visible = true;
      p.age = 0;
    } else {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.scene.add(mesh);
      p = { mesh, age: 0 };
    }

    // Particle velocity: slight drift back and up/down
    p.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    p.maxAge = 0.5 + Math.random() * 0.3; // 0.5s to 0.8s
    this.particles.push(p);
  }

  _updateParticles(delta) {
    const activeParticles = [];

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += delta;

      // Apply velocity
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Fade out and scale down
      const progress = p.age / p.maxAge;
      p.mesh.material.opacity = (1 - progress) * 0.5;
      const s = 1 - progress;
      p.mesh.scale.set(s, s, s);

      if (p.age >= p.maxAge) {
        p.mesh.visible = false;
        this._particlePool.push(p);
      } else {
        activeParticles.push(p);
      }
    }

    this.particles = activeParticles;
  }

  triggerShootEffect() {
    // Alternate fire hand each shot
    this._fireHand = this._fireHand === 'right' ? 'left' : 'right';

    const isRight = this._fireHand === 'right';
    const flash    = isRight ? this.muzzleFlash  : this.muzzleFlashL;
    const light    = isRight ? this.muzzleLight   : this.muzzleLightL;

    flash.visible = true;
    light.visible = true;
    setTimeout(() => {
      flash.visible = false;
      light.visible = false;
    }, 60);

    // Spawn smoke particles at the active muzzle
    const muzzleWorldPos = new THREE.Vector3();
    flash.getWorldPosition(muzzleWorldPos);

    for (let i = 0; i < 4; i++) {
      const smokeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.65
      });
      const smokeMesh = new THREE.Mesh(smokeGeo, smokeMat);
      smokeMesh.position.copy(muzzleWorldPos);
      smokeMesh.position.x += (Math.random() - 0.5) * 0.15;
      smokeMesh.position.y += (Math.random() - 0.5) * 0.15;
      smokeMesh.position.z += (Math.random() - 0.5) * 0.15;
      
      this.scene.add(smokeMesh);
      this.muzzleParticles.push({
        mesh: smokeMesh,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.6 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.6,
        life: 0.5
      });
    }

    // Return world position of active muzzle for laser origin
    return muzzleWorldPos;
  }

  _updateMuzzleParticles(delta) {
    for (let i = this.muzzleParticles.length - 1; i >= 0; i--) {
      const p = this.muzzleParticles[i];
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;
      
      p.mesh.scale.multiplyScalar(1.0 + 1.2 * delta);
      p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - delta * 1.3);
      
      p.life -= delta;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.muzzleParticles.splice(i, 1);
      }
    }
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    // Visual flash feedback (e.g. red screen or red color on character)
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        const origColor = child.material.color.getHex();
        child.material.color.setHex(0xff0000);
        setTimeout(() => {
          if (child.material) child.material.color.setHex(origColor);
        }, 80);
      }
    });
    return this.hp <= 0;
  }

  setTargetPosition(pos) {
    this._targetEnemyPos = pos;
    this._hasTarget = !!pos;
  }
}
