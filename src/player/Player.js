/**
 * Player.js â€” Third-Person Character Controller
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
import { soundManager } from '../audio/SoundManager.js';
import { getGroundHeight } from '../world/Terrain.js';

// Shared materials and geometries for flight particles (smoke & spark)
const sharedThrusterSmokeGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const sharedThrusterSmokeMat = new THREE.MeshBasicMaterial({
  color: 0x888888,
  transparent: true,
  opacity: 0.55
});
const sharedThrusterFireGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
const sharedThrusterFireMat = new THREE.MeshBasicMaterial({
  color: 0xff4500,
  transparent: true,
  opacity: 0.85
});

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
    this.position = new THREE.Vector3(32, 5.0, 32); // spawn high â€” falls cleanly to ground

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
    this._bobTime     = 0;
    this._footSinSign = 1;
    this._nextFoot    = 'left';

    // Dust particle system
    this._prevOnGround  = false;
    this._dustParticles = [];
    this._dustPool      = [];

    /** HP & Combat state */
    this.hp = 100;
    this.energy = 100;
    this.maxEnergy = 100;
    this._flightFatigued = false; // Prevents stutter-flying at 0%
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
    // â”€â”€ Material Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const suitMat   = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }); // White spacesuit
    const suitDark  = new THREE.MeshLambertMaterial({ color: 0xc0c0c0 }); // Panel shadow grey
    const suitAccent= new THREE.MeshLambertMaterial({ color: 0xf0a500 }); // NASA orange stripe
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0xdddddd }); // Helmet shell
    const visorMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a,
      emissive: 0x002244, emissiveIntensity: 0.5 });                       // Dark reflective visor
    const bootMat   = new THREE.MeshLambertMaterial({ color: 0x555555 }); // Grey boots
    const glowMat   = new THREE.MeshBasicMaterial({ color: 0xffe066 });   // HUD glow

    // â”€â”€ TORSO (bulky pressurised suit chest) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const bodyGeo = new THREE.BoxGeometry(0.78, 1.05, 0.52);
    const body    = new THREE.Mesh(bodyGeo, suitMat);
    body.position.y = -0.08;
    this.group.add(body);

    // Chest panel ridge (front)
    const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.06), suitDark);
    chestPanel.position.set(0, 0.1, 0.29);
    this.group.add(chestPanel);

    // Chest LED indicator
    const ledGeo = new THREE.BoxGeometry(0.06, 0.06, 0.04);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0, 0.22, 0.32);
    this.group.add(led);
    const ledLight = new THREE.PointLight(0x00ff88, 0.8, 1.5);
    ledLight.position.copy(led.position);
    this.group.add(ledLight);

    // Orange accent stripes on torso sides
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.54), suitAccent);
    stripeL.position.set(-0.42, 0.05, -0.01);
    this.group.add(stripeL);
    const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.54), suitAccent);
    stripeR.position.set(0.42, 0.05, -0.01);
    this.group.add(stripeR);

    // â”€â”€ UTILITY BELT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.54), beltMat);
    belt.position.set(0, -0.4, 0);
    this.group.add(belt);

    // Belt pouches
    const pouchGeo = new THREE.BoxGeometry(0.12, 0.1, 0.08);
    const pouchMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    [-0.22, 0, 0.22].forEach(x => {
      const pouch = new THREE.Mesh(pouchGeo, pouchMat);
      pouch.position.set(x, -0.4, 0.32);
      this.group.add(pouch);
    });

    // â”€â”€ HELMET (rounded box with wide visor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const helmetShell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.58), helmetMat);
    helmetShell.position.y = 0.68;
    this.group.add(helmetShell);

    // Helmet neck ring (connects to suit)
    const neckRing = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.52), beltMat);
    neckRing.position.y = 0.38;
    this.group.add(neckRing);

    // Wide reflective visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.14), visorMat);
    visor.position.set(0, 0.7, 0.28);
    this.group.add(visor);

    // Visor gold tint rim
    const visorRimT = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.06), glowMat);
    visorRimT.position.set(0, 0.82, 0.27);
    this.group.add(visorRimT);
    const visorRimB = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.06), glowMat);
    visorRimB.position.set(0, 0.59, 0.27);
    this.group.add(visorRimB);

    // Helmet-mounted light (Spotlight pointing forward)
    const lampMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.06), glowMat);
    lampMesh.position.set(0, 0.98, 0.22);
    this.group.add(lampMesh);
    
    this.visorLight = new THREE.SpotLight(0xffe066, 12.0, 45.0, Math.PI / 4, 0.6, 1.0);
    this.visorLight.position.set(0, 0.98, 0.26);
    
    const visorTarget = new THREE.Object3D();
    visorTarget.position.set(0, 0.98, 5.0);
    this.group.add(visorTarget);
    
    this.visorLight.target = visorTarget;
    this.group.add(this.visorLight);

    // Helmet side comms bumps
    const commGeo = new THREE.BoxGeometry(0.06, 0.1, 0.06);
    const commMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const commL = new THREE.Mesh(commGeo, commMat);
    commL.position.set(-0.34, 0.72, 0.08);
    this.group.add(commL);
    const commR = new THREE.Mesh(commGeo, commMat);
    commR.position.set(0.34, 0.72, 0.08);
    this.group.add(commR);

    // â”€â”€ LIFE SUPPORT BACKPACK (PLSS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const plss = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suitDark);
    plss.position.set(0, -0.02, -0.41);
    this.group.add(plss);

    // O2 tanks (two cylinders on backpack)
    const tankGeo = new THREE.BoxGeometry(0.14, 0.5, 0.1);
    const tankMat = new THREE.MeshLambertMaterial({ color: 0xb0b0b0 });
    const tankL = new THREE.Mesh(tankGeo, tankMat);
    tankL.position.set(-0.18, 0.02, -0.56);
    this.group.add(tankL);
    const tankR = new THREE.Mesh(tankGeo, tankMat);
    tankR.position.set(0.18, 0.02, -0.56);
    this.group.add(tankR);

    // Grappling hook indicator (glowing on PLSS)
    const hookMat = new THREE.MeshLambertMaterial({
      color: 0xffe066, emissive: 0xffe066, emissiveIntensity: 0.6
    });
    this._hookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), hookMat);
    this._hookMesh.position.set(0.26, 0.28, -0.56);
    this.group.add(this._hookMesh);

    // â”€â”€ GLIDER WINGS (kept as-is) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this._leftWing  = this._makeWing(-1);
    this._rightWing = this._makeWing(1);
    this.group.add(this._leftWing);
    this.group.add(this._rightWing);
    this._leftWing.visible  = false;
    this._rightWing.visible = false;

    // â”€â”€ LEGS (puffy spacesuit legs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const thighGeo = new THREE.BoxGeometry(0.22, 0.38, 0.22);
    const calfGeo  = new THREE.BoxGeometry(0.2,  0.36, 0.2);
    const bootGeo  = new THREE.BoxGeometry(0.22, 0.12, 0.28);

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.22, -0.6, 0);
    this.group.add(this.leftLeg);

    const leftThigh = new THREE.Mesh(thighGeo, suitMat);
    leftThigh.position.y = -0.19;
    this.leftLeg.add(leftThigh);
    // Orange knee pad
    const lKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), suitAccent);
    lKneePad.position.y = -0.38;
    this.leftLeg.add(lKneePad);

    this.leftKnee = new THREE.Group();
    this.leftKnee.position.set(0, -0.38, 0);
    this.leftLeg.add(this.leftKnee);

    const leftCalf = new THREE.Mesh(calfGeo, suitMat);
    leftCalf.position.y = -0.18;
    this.leftKnee.add(leftCalf);
    const leftBoot = new THREE.Mesh(bootGeo, bootMat);
    leftBoot.position.set(0, -0.38, 0.03);
    this.leftKnee.add(leftBoot);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.22, -0.6, 0);
    this.group.add(this.rightLeg);

    const rightThigh = new THREE.Mesh(thighGeo, suitMat);
    rightThigh.position.y = -0.19;
    this.rightLeg.add(rightThigh);
    const rKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), suitAccent);
    rKneePad.position.y = -0.38;
    this.rightLeg.add(rKneePad);

    this.rightKnee = new THREE.Group();
    this.rightKnee.position.set(0, -0.38, 0);
    this.rightLeg.add(this.rightKnee);

    const rightCalf = new THREE.Mesh(calfGeo, suitMat);
    rightCalf.position.y = -0.18;
    this.rightKnee.add(rightCalf);
    const rightBoot = new THREE.Mesh(bootGeo, bootMat);
    rightBoot.position.set(0, -0.38, 0.03);
    this.rightKnee.add(rightBoot);

    // â”€â”€ ARMS (puffy spacesuit arms) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const upperArmGeo = new THREE.BoxGeometry(0.2, 0.38, 0.2);
    const forearmGeo  = new THREE.BoxGeometry(0.18, 0.34, 0.18);
    const gloveGeo    = new THREE.BoxGeometry(0.16, 0.1, 0.16);
    const gloveMat    = new THREE.MeshLambertMaterial({ color: 0x333333 });

    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.5, 0.18, 0);
    this.group.add(this.leftArm);

    const leftUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
    leftUpperArm.position.y = -0.19;
    this.leftArm.add(leftUpperArm);
    // Orange shoulder ring
    const lShoulderRing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), suitAccent);
    lShoulderRing.position.y = -0.01;
    this.leftArm.add(lShoulderRing);

    this.leftElbow = new THREE.Group();
    this.leftElbow.position.set(0, -0.38, 0);
    this.leftArm.add(this.leftElbow);

    const leftForearm = new THREE.Mesh(forearmGeo, suitMat);
    leftForearm.position.y = -0.17;
    this.leftElbow.add(leftForearm);
    const leftGlove = new THREE.Mesh(gloveGeo, gloveMat);
    leftGlove.position.y = -0.36;
    this.leftElbow.add(leftGlove);

    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.5, 0.18, 0);
    this.group.add(this.rightArm);

    const rightUpperArm = new THREE.Mesh(upperArmGeo, suitMat);
    rightUpperArm.position.y = -0.19;
    this.rightArm.add(rightUpperArm);
    const rShoulderRing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), suitAccent);
    rShoulderRing.position.y = -0.01;
    this.rightArm.add(rShoulderRing);

    this.rightElbow = new THREE.Group();
    this.rightElbow.position.set(0, -0.38, 0);
    this.rightArm.add(this.rightElbow);

    const rightForearm = new THREE.Mesh(forearmGeo, suitMat);
    rightForearm.position.y = -0.17;
    this.rightElbow.add(rightForearm);
    const rightGlove = new THREE.Mesh(gloveGeo, gloveMat);
    rightGlove.position.y = -0.36;
    this.rightElbow.add(rightGlove);

    // â”€â”€ WEAPONS (kept identical â€” attached to gloves) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    // Right pistol
    this.gunGroup = new THREE.Group();
    this.gunGroup.position.set(0.02, -0.36, 0.1);
    this.gunGroup.rotation.set(-Math.PI / 2, 0, 0);
    this.gunGroup.visible = false;
    const gBodyR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.22), ironMat);
    gBodyR.position.set(0, 0, -0.08);
    this.gunGroup.add(gBodyR);
    const gGripR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    gGripR.position.set(0, -0.04, 0.04);
    this.gunGroup.add(gGripR);
    const gBarrelR = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.08), ironMat);
    gBarrelR.position.set(0, 0.015, -0.21);
    this.gunGroup.add(gBarrelR);
    this.rightElbow.add(this.gunGroup);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    this.muzzleFlash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.055, 0.12, 6), flashMat);
    this.muzzleFlash.rotation.x = Math.PI / 2;
    this.muzzleFlash.position.set(0, 0.015, -0.26);
    this.muzzleFlash.visible = false;
    this.gunGroup.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffaa00, 1.5, 4);
    this.muzzleLight.position.set(0, 0.015, -0.28);
    this.muzzleLight.visible = false;
    this.gunGroup.add(this.muzzleLight);

    // Left pistol
    this.pistolGroup = new THREE.Group();
    this.pistolGroup.position.set(-0.02, -0.36, 0.1);
    this.pistolGroup.rotation.set(-Math.PI / 2, 0, 0);
    this.pistolGroup.visible = false;
    const gBodyL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.22), ironMat);
    gBodyL.position.set(0, 0, -0.08);
    this.pistolGroup.add(gBodyL);
    const gGripL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    gGripL.position.set(0, -0.04, 0.04);
    this.pistolGroup.add(gGripL);
    const gBarrelL = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.08), ironMat);
    gBarrelL.position.set(0, 0.015, -0.21);
    this.pistolGroup.add(gBarrelL);
    this.leftElbow.add(this.pistolGroup);

    const flashMat2 = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    this.muzzleFlashL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.055, 0.12, 6), flashMat2);
    this.muzzleFlashL.rotation.x = Math.PI / 2;
    this.muzzleFlashL.position.set(0, 0.015, -0.26);
    this.muzzleFlashL.visible = false;
    this.pistolGroup.add(this.muzzleFlashL);

    this.muzzleLightL = new THREE.PointLight(0xffcc44, 1.5, 4);
    this.muzzleLightL.position.set(0, 0.015, -0.28);
    this.muzzleLightL.visible = false;
    this.pistolGroup.add(this.muzzleLightL);

    // â”€â”€ CAPE / COAT STUBS (no-op Groups so animation code compiles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The astronaut suit has no cape â€” stub objects satisfy the physics anim refs
    const _stub = () => new THREE.Group();
    this.leftCapeSeg1  = _stub(); this.group.add(this.leftCapeSeg1);
    this.leftCapeSeg2  = _stub(); this.leftCapeSeg1.add(this.leftCapeSeg2);
    this.leftCapeSeg3  = _stub(); this.leftCapeSeg2.add(this.leftCapeSeg3);
    this.leftCapeSeg4  = _stub(); this.leftCapeSeg3.add(this.leftCapeSeg4);
    this.rightCapeSeg1 = _stub(); this.group.add(this.rightCapeSeg1);
    this.rightCapeSeg2 = _stub(); this.rightCapeSeg1.add(this.rightCapeSeg2);
    this.rightCapeSeg3 = _stub(); this.rightCapeSeg2.add(this.rightCapeSeg3);
    this.rightCapeSeg4 = _stub(); this.rightCapeSeg3.add(this.rightCapeSeg4);
    this.frontCoatL    = _stub(); this.group.add(this.frontCoatL);
    this.frontCoatL2   = _stub(); this.frontCoatL.add(this.frontCoatL2);
    this.frontCoatR    = _stub(); this.group.add(this.frontCoatR);
    this.frontCoatR2   = _stub(); this.frontCoatR.add(this.frontCoatR2);

    // Boot Thruster Geometry
    const thrustGeo = new THREE.CylinderGeometry(0.06, 0.0, 0.25, 6);
    const thrustMat = new THREE.MeshBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    this.leftThruster = new THREE.Mesh(thrustGeo, thrustMat);
    this.leftThruster.position.set(0, -0.48, 0.03); // under the boot
    this.leftThruster.rotation.x = Math.PI; // pointing downward
    this.leftThruster.visible = false;
    this.leftKnee.add(this.leftThruster);

    this.rightThruster = new THREE.Mesh(thrustGeo, thrustMat);
    this.rightThruster.position.set(0, -0.48, 0.03);
    this.rightThruster.rotation.x = Math.PI;
    this.rightThruster.visible = false;
    this.rightKnee.add(this.rightThruster);

    // Static PointLight (avoid recompile, set intensity to 0 when inactive)
    this.thrusterLight = new THREE.PointLight(0xffaa44, 0.0, 8.0);
    this.thrusterLight.position.set(0, -0.4, 0);
    this.group.add(this.thrusterLight);

    this.thrusterParticles = [];

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

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

    // Sub-part references for sequential mechanical folding anim
    wingGroup.userData = { main: mainMesh, tip: tipMesh };

    // Sub-parts start folded/collapsed
    mainMesh.scale.set(0, 1, 0);
    tipMesh.scale.set(0, 0, 0);

    // Group is always 1 scale
    wingGroup.scale.set(1, 1, 1);

    return wingGroup;
  }

  /**
   * Main update â€” call each frame.
   * @param {number} delta â€” seconds
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
    this._updateDustParticles(delta);
    this._updateThrusterParticles(delta);

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
      // No input â€” decelerate
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

    // Face direction of movement â€” update target angle, NOT current rotation
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
   * @private â€” Jump & jump hold
   */
  _handleJump(delta, input) {
    // Jump mechanics disabled in favor of combat system
  }

  /**
   * @private â€” Fly upward (Faster and punchier lift-off)
   */
  _handleTool(delta, input, camera) {
    // If energy drops to 0, trigger fatigue
    if (this.energy <= 0) {
      this._flightFatigued = true;
    }
    // Recover fatigue once energy reaches 15%
    if (this._flightFatigued && this.energy >= 15.0) {
      this._flightFatigued = false;
    }

    // If holding fly button, not fatigued, and has energy
    if (input.tool && !this._flightFatigued && this.energy > 0) {
      // Consume energy
      this.energy = Math.max(0, this.energy - delta * 30.0);

      // Play thruster sound
      soundManager.setThrusterActive(true);

      // Fly upward
      this.physics.velocity.y = THREE.MathUtils.lerp(
        this.physics.velocity.y,
        9.0, // target upward speed
        0.18 // higher lerp factor for punchier lift-off
      );
      if (!this._gliderActive) {
        this._gliderActive = true;
        this.state = 'gliding';
        // Takeoff dust burst — kicked up from ground
        if (this.onGround) this._spawnDustBurst(12, 3.8);
      }
    } else {
      // Not flying (or fatigued/out of energy) — turn off glider and thruster sound
      if (this._gliderActive) {
        this._gliderActive = false;
        if (this.onGround) {
          this.state = 'idle';
        }
      }
      soundManager.setThrusterActive(false);

      // Regenerate energy over time
      this.energy = Math.min(this.maxEnergy, this.energy + delta * 12.0);
    }
  }

  /**
   * @private â€” Artefact interaction & tower transmit (Instant pickup)
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
   * @private â€” Visual animations (bob, lean, facing rotation)
   */
  _animate(delta, input) {
    // Facing rotation â€” shortest-angle lerp to prevent spinning
    if (this._targetFacingAngle !== undefined) {
      // When locked onto an enemy, rotate faster for a snappy combat feel
      const rotSpeed = (this.isFiring || this._hasTarget) ? 0.3 : 0.15;
      // Compute shortest angle difference (handles wrap-around Â±Ï€)
      let diff = this._targetFacingAngle - this.group.rotation.y;
      // Normalize diff to -Ï€..Ï€
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

      // ── Footstep trigger: fire on each sine zero-crossing (foot hits ground)
      if (this.onGround) {
        const sinNow = Math.sin(this._bobTime);
        if (this._footSinSign > 0 && sinNow <= 0) {
          soundManager.playFootstep(this._nextFoot);
          this._spawnDustBurst(3, 1.2); // small per-step puff
          this._nextFoot = this._nextFoot === 'left' ? 'right' : 'left';
        } else if (this._footSinSign <= 0 && sinNow > 0) {
          soundManager.playFootstep(this._nextFoot);
          this._spawnDustBurst(3, 1.2);
          this._nextFoot = this._nextFoot === 'left' ? 'right' : 'left';
        }
        this._footSinSign = sinNow;
      }
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
      this._bobTime     = 0;
      this._footSinSign = 1;
      this._nextFoot    = 'left';
      
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

    // ── GLIDER WINGS & THRUSTERS (Iron Man Sequence) ──
    const mainL = this._leftWing.userData.main;
    const mainR = this._rightWing.userData.main;
    const tipL = this._leftWing.userData.tip;
    const tipR = this._rightWing.userData.tip;

    if (this._gliderActive) {
      this._leftWing.visible = true;
      this._rightWing.visible = true;

      // Phase 1: Deploy main wing panels (length-wise and width-wise)
      mainL.scale.x = THREE.MathUtils.lerp(mainL.scale.x, 1.0, 0.18);
      mainL.scale.z = THREE.MathUtils.lerp(mainL.scale.z, 1.0, 0.18);
      mainR.scale.copy(mainL.scale);

      // Phase 2: Snap tip winglets open once main wing is mostly out
      if (mainL.scale.x > 0.75) {
        tipL.scale.x = THREE.MathUtils.lerp(tipL.scale.x, 1.0, 0.28);
        tipL.scale.y = THREE.MathUtils.lerp(tipL.scale.y, 1.0, 0.28);
        tipL.scale.z = THREE.MathUtils.lerp(tipL.scale.z, 1.0, 0.28);
        tipR.scale.copy(tipL.scale);
      }

      // Activate boots thrusters
      this.leftThruster.visible = true;
      this.rightThruster.visible = true;
      
      const flicker = 0.85 + Math.random() * 0.45;
      this.leftThruster.scale.set(flicker, flicker * 1.6, flicker);
      this.rightThruster.scale.set(flicker, flicker * 1.6, flicker);

      // Thruster PointLight glow
      this.thrusterLight.intensity = 2.8 + Math.random() * 1.2;

      // Spawn thruster smoke/fire particles under feet
      const leftPos = new THREE.Vector3();
      const rightPos = new THREE.Vector3();
      this.leftThruster.getWorldPosition(leftPos);
      this.rightThruster.getWorldPosition(rightPos);

      // Spawn particle trails
      this._spawnThrusterParticle(leftPos);
      this._spawnThrusterParticle(rightPos);

      // Spawn wind trails at wingtips if fully deployed
      if (tipL.scale.x > 0.75) {
        const tipLPos = new THREE.Vector3();
        const tipRPos = new THREE.Vector3();
        this._leftTipMarker.getWorldPosition(tipLPos);
        this._rightTipMarker.getWorldPosition(tipRPos);
        this._spawnTrailParticle(tipLPos);
        this._spawnTrailParticle(tipRPos);
      }

      // Flap wings
      const flapT = Date.now() * 0.005;
      this._leftWing.rotation.z  = -0.1 + Math.sin(flapT) * 0.03;
      this._rightWing.rotation.z =  0.1 - Math.sin(flapT) * 0.03;

    } else {
      // Retract Sequence: Tips collapse first, then main wings
      tipL.scale.x = THREE.MathUtils.lerp(tipL.scale.x, 0.0, 0.24);
      tipL.scale.y = THREE.MathUtils.lerp(tipL.scale.y, 0.0, 0.24);
      tipL.scale.z = THREE.MathUtils.lerp(tipL.scale.z, 0.0, 0.24);
      tipR.scale.copy(tipL.scale);

      if (tipL.scale.x < 0.25) {
        mainL.scale.x = THREE.MathUtils.lerp(mainL.scale.x, 0.0, 0.2);
        mainL.scale.z = THREE.MathUtils.lerp(mainL.scale.z, 0.0, 0.2);
        mainR.scale.copy(mainL.scale);
      }

      if (mainL.scale.x < 0.05) {
        this._leftWing.visible = false;
        this._rightWing.visible = false;
      }

      // Turn off boots thrusters
      this.leftThruster.visible = false;
      this.rightThruster.visible = false;
      this.thrusterLight.intensity = 0.0;

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

    // --- COAT PHYSICS ANIMATION (Dante-style) ---
    const speedX = this.physics.velocity.x;
    const speedZ = this.physics.velocity.z;
    const horizontalSpeed = Math.sqrt(speedX * speedX + speedZ * speedZ);
    const verticalSpeed = this.physics.velocity.y;

    let baseCapeAngle = 0.12;
    let flutterSpeed = 10;
    let flutterIntensity = 0.04;
    let frontSwingX = 0.0;  // front panels forward swing
    let frontSwingZ = 0.0;  // front panels outward spread

    if (this._gliderActive) {
      if (verticalSpeed > 0.5) {
        baseCapeAngle = 0.02 - (verticalSpeed * 0.04);
        baseCapeAngle = Math.max(-0.3, baseCapeAngle);
        flutterSpeed = 16;
        flutterIntensity = 0.06;
        frontSwingX = -0.4;   // front panels blow backward (forward of character)
        frontSwingZ = 0.5;
      } else {
        baseCapeAngle = 1.3 - (verticalSpeed * 0.05);
        flutterSpeed = 26;
        flutterIntensity = 0.22;
        frontSwingX = -0.8;
        frontSwingZ = 0.7;
      }
    } else if (this.state === 'running') {
      baseCapeAngle = 0.55 + (horizontalSpeed / RUN_SPEED) * 0.5;
      flutterSpeed = 20;
      flutterIntensity = 0.18;
      frontSwingX = 0.35;
      frontSwingZ = 0.45;
    } else if (this.state === 'walking') {
      baseCapeAngle = 0.25 + (horizontalSpeed / RUN_SPEED) * 0.3;
      flutterSpeed = 12;
      flutterIntensity = 0.08;
      frontSwingX = 0.12;
      frontSwingZ = 0.2;
    } else if (this.state === 'jumping' || this.state === 'falling') {
      baseCapeAngle = 0.18 - (verticalSpeed * 0.09);
      flutterSpeed = 15;
      flutterIntensity = 0.12;
      frontSwingX = 0.2;
      frontSwingZ = 0.25;
    } else {
      // Idle: gentle atmospheric flutter
      baseCapeAngle = 0.08;
      flutterSpeed = 3;
      flutterIntensity = 0.025;
      frontSwingX = 0.0;
      frontSwingZ = 0.05;
    }

    const capeTime = Date.now() * 0.001 * flutterSpeed;
    const LR = 0.09; // lerp rate for coat (heavier fabric = slower response)

    // â”€â”€ Back panels â€” each segment inherits parent rotation but adds own flutter â”€â”€
    // Left panel
    this.leftCapeSeg1.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.x, baseCapeAngle + Math.sin(capeTime) * flutterIntensity, LR);
    this.leftCapeSeg2.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg2.rotation.x, baseCapeAngle * 0.85 + Math.sin(capeTime - 0.8) * flutterIntensity * 1.15, LR);
    this.leftCapeSeg3.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg3.rotation.x, baseCapeAngle * 0.65 + Math.sin(capeTime - 1.6) * flutterIntensity * 1.35, LR);
    this.leftCapeSeg4.rotation.x = THREE.MathUtils.lerp(this.leftCapeSeg4.rotation.x, baseCapeAngle * 0.45 + Math.sin(capeTime - 2.5) * flutterIntensity * 1.6, LR);

    // Right panel (phase offset for organic look)
    this.rightCapeSeg1.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.x, baseCapeAngle + Math.sin(capeTime + 0.4) * flutterIntensity, LR);
    this.rightCapeSeg2.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg2.rotation.x, baseCapeAngle * 0.85 + Math.sin(capeTime - 0.4) * flutterIntensity * 1.15, LR);
    this.rightCapeSeg3.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg3.rotation.x, baseCapeAngle * 0.65 + Math.sin(capeTime - 1.2) * flutterIntensity * 1.35, LR);
    this.rightCapeSeg4.rotation.x = THREE.MathUtils.lerp(this.rightCapeSeg4.rotation.x, baseCapeAngle * 0.45 + Math.sin(capeTime - 2.1) * flutterIntensity * 1.6, LR);

    // Lateral spread (coat opens wide when airborne / running)
    const baseSpread = 0.06;
    const speedSpread = this._gliderActive ? 0.4 : (this.state === 'running' ? 0.28 : (this.state === 'walking' ? 0.14 : 0.0));
    this.leftCapeSeg1.rotation.z  = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.z,  -baseSpread - speedSpread, LR);
    this.rightCapeSeg1.rotation.z = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.z,   baseSpread + speedSpread, LR);

    // Side swing (wind / direction changes)
    const sideSwing = Math.sin(Date.now() * 0.001 * (flutterSpeed * 0.4)) * flutterIntensity * 0.45;
    this.leftCapeSeg1.rotation.y  = THREE.MathUtils.lerp(this.leftCapeSeg1.rotation.y,  sideSwing, LR);
    this.leftCapeSeg2.rotation.y  = THREE.MathUtils.lerp(this.leftCapeSeg2.rotation.y,  sideSwing * 1.3, LR);
    this.leftCapeSeg3.rotation.y  = THREE.MathUtils.lerp(this.leftCapeSeg3.rotation.y,  sideSwing * 1.7, LR);
    this.leftCapeSeg4.rotation.y  = THREE.MathUtils.lerp(this.leftCapeSeg4.rotation.y,  sideSwing * 2.1, LR);
    this.rightCapeSeg1.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg1.rotation.y, sideSwing, LR);
    this.rightCapeSeg2.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg2.rotation.y, sideSwing * 1.3, LR);
    this.rightCapeSeg3.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg3.rotation.y, sideSwing * 1.7, LR);
    this.rightCapeSeg4.rotation.y = THREE.MathUtils.lerp(this.rightCapeSeg4.rotation.y, sideSwing * 2.1, LR);

    // â”€â”€ Front coat panels â€” swing outward and back when moving (Dante billow) â”€â”€
    const frontFlutter = Math.sin(capeTime * 0.7) * flutterIntensity * 0.6;
    this.frontCoatL.rotation.x  = THREE.MathUtils.lerp(this.frontCoatL.rotation.x,  -frontSwingX + frontFlutter, LR);
    this.frontCoatL.rotation.z  = THREE.MathUtils.lerp(this.frontCoatL.rotation.z,  -frontSwingZ, LR);
    this.frontCoatL2.rotation.x = THREE.MathUtils.lerp(this.frontCoatL2.rotation.x, -frontSwingX * 0.6 + frontFlutter * 1.3, LR);

    this.frontCoatR.rotation.x  = THREE.MathUtils.lerp(this.frontCoatR.rotation.x,  -frontSwingX + frontFlutter, LR);
    this.frontCoatR.rotation.z  = THREE.MathUtils.lerp(this.frontCoatR.rotation.z,   frontSwingZ, LR);
    this.frontCoatR2.rotation.x = THREE.MathUtils.lerp(this.frontCoatR2.rotation.x, -frontSwingX * 0.6 + frontFlutter * 1.3, LR);



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

    // Landing dust burst — detect ground contact transition
    if (onGround && !this._prevOnGround && this.physics.velocity.y < -1.5) {
      this._spawnDustBurst(18, 4.5);
    }
    this._prevOnGround = onGround;

    if (!onGround && this.physics.velocity.y < -2 && this.state !== 'gliding') {
      this.state = 'falling';
    }
  }

  /**
   * Spawn a radial burst of dust particles at the player's feet.
   * @param {number} count  — number of particles
   * @param {number} speed  — outward spread speed (m/s)
   */
  _spawnDustBurst(count, speed) {
    const basePos = this.position.clone();
    // this.position.y is 1.3m above ground (Physics CHAR_HY offset)
    // subtract that so dust spawns at ground/foot level
    basePos.y = this.position.y - 1.25;

    for (let i = 0; i < count; i++) {
      let p;
      if (this._dustPool.length > 0) {
        p = this._dustPool.pop();
        p.mesh.position.copy(basePos);
        p.mesh.scale.set(1, 1, 1);
        p.mesh.material.opacity = 0.55;
        p.mesh.visible = true;
        p.age = 0;
      } else {
        // Flat disc (PlaneGeometry) — looks like a ground puff
        const geo = new THREE.CircleGeometry(0.18 + Math.random() * 0.14, 6);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xc8b48a,      // sandy beige dust
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI * 0.5; // lie flat on ground
        mesh.position.copy(basePos);
        this.scene.add(mesh);
        p = { mesh, age: 0 };
      }

      // Random outward direction
      const angle = Math.random() * Math.PI * 2;
      const r     = 0.4 + Math.random() * 0.6; // lateral spread
      p.velocity = new THREE.Vector3(
        Math.cos(angle) * speed * r,
        0.6 + Math.random() * 1.2,             // gentle upward drift
        Math.sin(angle) * speed * r
      );
      p.maxAge   = 0.35 + Math.random() * 0.25;
      p.mesh.rotation.y = Math.random() * Math.PI * 2;
      this._dustParticles.push(p);
    }
  }

  _updateDustParticles(delta) {
    const active = [];
    for (let i = 0; i < this._dustParticles.length; i++) {
      const p = this._dustParticles[i];
      p.age += delta;

      p.mesh.position.addScaledVector(p.velocity, delta);
      // Gravity drag on Y, lateral friction
      p.velocity.y  -= delta * 2.8;  // light gravity — dust floats
      p.velocity.x  *= 0.92;
      p.velocity.z  *= 0.92;

      // Expand disc as it rises, then fade
      const t = p.age / p.maxAge;
      const s = 1.0 + t * 1.4;            // grow from 1x to 2.4x
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = (1 - t) * 0.55;

      if (p.age >= p.maxAge) {
        p.mesh.visible = false;
        this._dustPool.push(p);
      } else {
        active.push(p);
      }
    }
    this._dustParticles = active;
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
    // Visual flash feedback removed as per user request
    return this.hp <= 0;
  }

  setTargetPosition(pos) {
    this._targetEnemyPos = pos;
    this._hasTarget = !!pos;
  }

  _spawnThrusterParticle(pos) {
    if (!this.thrusterParticles) this.thrusterParticles = [];

    // Spawn fire sparks or smoke
    const isFire = Math.random() > 0.45;
    
    // Instantiate separate material copies to safely fade opacity without sharing
    const pMat = isFire ? sharedThrusterFireMat.clone() : sharedThrusterSmokeMat.clone();
    const pMesh = new THREE.Mesh(
      isFire ? sharedThrusterFireGeo : sharedThrusterSmokeGeo,
      pMat
    );

    pMesh.position.copy(pos);
    pMesh.position.x += (Math.random() - 0.5) * 0.15;
    pMesh.position.z += (Math.random() - 0.5) * 0.15;

    this.scene.add(pMesh);

    this.thrusterParticles.push({
      mesh: pMesh,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -1.8 - Math.random() * 2.2, // thrust downward
      vz: (Math.random() - 0.5) * 0.4,
      life: 0.35 + Math.random() * 0.25,
      isFire
    });
  }

  _updateThrusterParticles(delta) {
    if (!this.thrusterParticles) return;
    for (let i = this.thrusterParticles.length - 1; i >= 0; i--) {
      const p = this.thrusterParticles[i];
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.y += p.vy * delta;
      p.mesh.position.z += p.vz * delta;

      if (p.isFire) {
        p.mesh.scale.multiplyScalar(Math.max(0.1, 1.0 - 2.0 * delta));
        p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - delta * 2.8);
      } else {
        p.mesh.scale.multiplyScalar(1.0 + 1.6 * delta);
        p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - delta * 1.5);
      }

      p.life -= delta;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.material.dispose(); // dispose clone material
        this.thrusterParticles.splice(i, 1);
      }
    }
  }
}
