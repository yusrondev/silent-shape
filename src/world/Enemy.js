import * as THREE from 'three';
import { getGroundHeight } from './Terrain.js';

const sharedDustGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const sharedDustMat1 = new THREE.MeshBasicMaterial({ color: 0x24083a });
const sharedDustMat2 = new THREE.MeshBasicMaterial({ color: 0x111111 });

let _hpContainer = null;
function getHPContainer() {
  if (!_hpContainer) {
    _hpContainer = document.createElement('div');
    _hpContainer.id = 'enemy-hp-container';
    _hpContainer.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 50; overflow: hidden;
    `;
    document.body.appendChild(_hpContainer);
  }
  return _hpContainer;
}

export class Enemy {
  constructor(scene, spawnPos, type = 'alien') {
    this.scene = scene;
    this.type = type; // 'alien' or 'spider'
    this.hp = type === 'spider' ? 50 : 30; // spider has more health
    this.maxHp = this.hp;
    this.speed = type === 'spider' ? 2.5 : 2.0;
    
    // Combat: reduced shooting intervals for faster, more challenging action
    this.shootTimer = Math.random() * 1.0;
    this.shootInterval = type === 'spider' ? 0.7 + Math.random() * 0.5 : 0.9 + Math.random() * 0.6;

    this.state = 'idle'; // 'idle' | 'walking'
    this._bobTime = 0;

    // Dissolve state
    this.isDead = false;
    this.isDissolved = false;
    this.dissolveTimer = 0.0;
    this.maxDissolveTime = 1.2;
    this.dustParticles = [];

    this.group = new THREE.Group();
    // Shift position y upward so feet stand on ground
    const groundH = getGroundHeight(spawnPos.x, spawnPos.z);
    this.group.position.set(spawnPos.x, groundH + (type === 'spider' ? 0.84 : 0.72), spawnPos.z);
    this.scene.add(this.group);

    this._buildMesh();
    if (type === 'spider') {
      this.group.scale.setScalar(3.0);
    }

    // HP Bar Setup
    const container = getHPContainer();
    this._hpEl = document.createElement('div');
    this._hpEl.style.cssText = `
      position: absolute;
      width: 60px;
      transform: translateX(-50%);
      pointer-events: none;
    `;
    const label = document.createElement('div');
    label.textContent = type === 'spider' ? 'MONSTER' : 'ALIEN';
    label.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 9px;
      font-weight: 700;
      color: ${type === 'spider' ? '#ffaa00' : '#ff5555'};
      text-align: center;
      letter-spacing: 1px;
      text-shadow: 0 0 6px ${type === 'spider' ? 'rgba(255,170,0,0.9)' : 'rgba(255,50,50,0.9)'};
      margin-bottom: 2px;
    `;
    this._hpEl.appendChild(label);

    const track = document.createElement('div');
    track.style.cssText = `
      width: 100%; height: 5px;
      background: rgba(80,0,0,0.8);
      border: 1px solid ${type === 'spider' ? 'rgba(255,170,0,0.4)' : 'rgba(255,80,80,0.4)'};
      border-radius: 3px;
      overflow: hidden;
    `;

    this._hpFillEl = document.createElement('div');
    this._hpFillEl.style.cssText = `
      height: 100%; width: 100%;
      background: ${type === 'spider' ? '#ffaa00' : '#ff2222'};
      box-shadow: 0 0 4px ${type === 'spider' ? '#ffaa00' : '#ff2222'};
      border-radius: 3px;
      transition: width 0.08s linear, background 0.15s linear;
    `;
    track.appendChild(this._hpFillEl);
    this._hpEl.appendChild(track);
    container.appendChild(this._hpEl);

    this.boundingBox = new THREE.Box3();
    this._headWorldPos = new THREE.Vector3();
  }

  _buildMesh() {
    if (this.type === 'alien') {
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a189a });
      const headMat = new THREE.MeshLambertMaterial({ color: 0x7b2cbf });
      const bootMat = new THREE.MeshLambertMaterial({ color: 0x240046 });
      const gripMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const eyeMat  = new THREE.MeshBasicMaterial({ color: 0x39ff14 });

      // Torso
      const bodyGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45);
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = 0.4;
      this.group.add(bodyMesh);

      // Head
      const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.set(0, 1.05, 0);
      this.group.add(headMesh);

      // Glowing eyes
      const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
      eyeL.position.set(-0.13, 1.1, 0.23);
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
      eyeR.position.set(0.13, 1.1, 0.23);
      this.group.add(eyeL, eyeR);

      // Jointed Legs
      const thighGeo = new THREE.BoxGeometry(0.2, 0.32, 0.2);
      const calfGeo  = new THREE.BoxGeometry(0.18, 0.3, 0.18);
      const bootGeo  = new THREE.BoxGeometry(0.2, 0.1, 0.24);

      // Left Leg
      this.leftLeg = new THREE.Group();
      this.leftLeg.position.set(-0.2, -0.05, 0);
      this.group.add(this.leftLeg);
      const leftThigh = new THREE.Mesh(thighGeo, bodyMat);
      leftThigh.position.y = -0.16;
      this.leftLeg.add(leftThigh);

      this.leftKnee = new THREE.Group();
      this.leftKnee.position.set(0, -0.32, 0);
      this.leftLeg.add(this.leftKnee);
      const leftCalf = new THREE.Mesh(calfGeo, bodyMat);
      leftCalf.position.y = -0.15;
      this.leftKnee.add(leftCalf);
      const leftBoot = new THREE.Mesh(bootGeo, bootMat);
      leftBoot.position.set(0, -0.3, 0.03);
      this.leftKnee.add(leftBoot);

      // Right Leg
      this.rightLeg = new THREE.Group();
      this.rightLeg.position.set(0.2, -0.05, 0);
      this.group.add(this.rightLeg);
      const rightThigh = new THREE.Mesh(thighGeo, bodyMat);
      rightThigh.position.y = -0.16;
      this.rightLeg.add(rightThigh);

      this.rightKnee = new THREE.Group();
      this.rightKnee.position.set(0, -0.32, 0);
      this.rightLeg.add(this.rightKnee);
      const rightCalf = new THREE.Mesh(calfGeo, bodyMat);
      rightCalf.position.y = -0.15;
      this.rightKnee.add(rightCalf);
      const rightBoot = new THREE.Mesh(bootGeo, bootMat);
      rightBoot.position.set(0, -0.3, 0.03);
      this.rightKnee.add(rightBoot);

      // Jointed Arms
      const upperArmGeo = new THREE.BoxGeometry(0.18, 0.32, 0.18);
      const forearmGeo  = new THREE.BoxGeometry(0.16, 0.28, 0.16);

      // Left Arm
      this.leftArm = new THREE.Group();
      this.leftArm.position.set(-0.45, 0.65, 0);
      this.group.add(this.leftArm);
      const leftUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
      leftUpperArm.position.y = -0.16;
      this.leftArm.add(leftUpperArm);

      this.leftElbow = new THREE.Group();
      this.leftElbow.position.set(0, -0.32, 0);
      this.leftArm.add(this.leftElbow);
      const leftForearm = new THREE.Mesh(forearmGeo, bodyMat);
      leftForearm.position.y = -0.14;
      this.leftElbow.add(leftForearm);

      // Pistol Left
      const pistolMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
      this.pistolL = new THREE.Group();
      this.pistolL.position.set(0, -0.32, 0.08);
      this.pistolL.rotation.set(-Math.PI / 2, 0, 0);
      const slideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.18), pistolMat);
      slideL.position.set(0, 0, -0.08);
      this.pistolL.add(slideL);
      const gripL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), gripMat);
      gripL.position.set(0, -0.04, 0.02);
      this.pistolL.add(gripL);
      const barrelL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), pistolMat);
      barrelL.position.set(0, 0.01, -0.18);
      this.pistolL.add(barrelL);
      const muzzleL = new THREE.Object3D();
      muzzleL.position.set(0, 0.01, -0.22);
      this.pistolL.add(muzzleL);
      this.pistolL.userData = { muzzle: muzzleL };
      this.leftElbow.add(this.pistolL);

      // Right Arm
      this.rightArm = new THREE.Group();
      this.rightArm.position.set(0.45, 0.65, 0);
      this.group.add(this.rightArm);
      const rightUpperArm = new THREE.Mesh(upperArmGeo, bodyMat);
      rightUpperArm.position.y = -0.16;
      this.rightArm.add(rightUpperArm);

      this.rightElbow = new THREE.Group();
      this.rightElbow.position.set(0, -0.32, 0);
      this.rightArm.add(this.rightElbow);
      const rightForearm = new THREE.Mesh(forearmGeo, bodyMat);
      rightForearm.position.y = -0.14;
      this.rightElbow.add(rightForearm);

      // Pistol Right
      this.pistolR = new THREE.Group();
      this.pistolR.position.set(0, -0.32, 0.08);
      this.pistolR.rotation.set(-Math.PI / 2, 0, 0);
      const slideR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.18), pistolMat);
      slideR.position.set(0, 0, -0.08);
      this.pistolR.add(slideR);
      const gripR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), gripMat);
      gripR.position.set(0, -0.04, 0.02);
      this.pistolR.add(gripR);
      const barrelR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), pistolMat);
      barrelR.position.set(0, 0.01, -0.18);
      this.pistolR.add(barrelR);
      const muzzleR = new THREE.Object3D();
      muzzleR.position.set(0, 0.01, -0.22);
      this.pistolR.add(muzzleR);
      this.pistolR.userData = { muzzle: muzzleR };
      this.rightElbow.add(this.pistolR);
    } else if (this.type === 'spider') {
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0xa0522d });
      const legMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      // Main body
      const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 0.9);
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = 0.1;
      this.group.add(bodyMesh);

      // Head
      const headGeo = new THREE.BoxGeometry(0.42, 0.32, 0.32);
      const headMesh = new THREE.Mesh(headGeo, bodyMat);
      headMesh.position.set(0, 0.2, 0.52);
      this.group.add(headMesh);

      // 4 red eyes
      const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
      const eyeOffsets = [
        [-0.1, 0.24, 0.66],
        [0.1, 0.24, 0.66],
        [-0.05, 0.14, 0.66],
        [0.05, 0.14, 0.66]
      ];
      eyeOffsets.forEach(pos => {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(pos[0], pos[1], pos[2]);
        this.group.add(eye);
      });

      // Laser Cannon
      const barrelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.45), barrelMat);
      barrel.position.set(0, 0.42, 0);
      this.group.add(barrel);

      const muzzle = new THREE.Object3D();
      muzzle.position.set(0, 0.42, 0.26);
      this.group.add(muzzle);
      this.laserMuzzle = muzzle;

      // 6 Legs
      this.legs = [];
      const legOffsets = [
        { side: -1, z: 0.24, rotY: -Math.PI / 6 },
        { side: -1, z: 0.0,  rotY: 0 },
        { side: -1, z: -0.24, rotY: Math.PI / 6 },
        { side: 1,  z: 0.24, rotY: Math.PI / 6 },
        { side: 1,  z: 0.0,  rotY: 0 },
        { side: 1,  z: -0.24, rotY: -Math.PI / 6 }
      ];

      legOffsets.forEach((l) => {
        const hip = new THREE.Group();
        hip.position.set(l.side * 0.35, 0.05, l.z);
        hip.rotation.y = l.rotY;
        this.group.add(hip);

        const upperGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
        const upper = new THREE.Mesh(upperGeo, legMat);
        upper.position.y = 0.16;
        upper.rotation.z = -l.side * Math.PI / 4;
        hip.add(upper);

        const knee = new THREE.Group();
        knee.position.set(l.side * 0.14, 0.32, 0);
        hip.add(knee);

        const lowerGeo = new THREE.BoxGeometry(0.08, 0.6, 0.08);
        const lower = new THREE.Mesh(lowerGeo, legMat);
        lower.position.y = -0.28;
        lower.rotation.z = l.side * Math.PI / 5;
        knee.add(lower);

        this.legs.push({ hip, upper, knee, lower, side: l.side, defaultRotZ: upper.rotation.z, rotY: l.rotY });
      });
    }

    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  updateHPBarDOM(camera, renderer, buildingsList = []) {
    if (this.isDead) {
      if (this._hpEl && this._hpEl.parentNode) {
        this._hpEl.parentNode.removeChild(this._hpEl);
      }
      return;
    }

    this._headWorldPos.set(0, this.type === 'spider' ? 0.7 : 1.5, 0).applyMatrix4(this.group.matrixWorld);

    let isOccluded = false;
    if (buildingsList.length > 0) {
      if (!this._raycaster) this._raycaster = new THREE.Raycaster();
      const dir = new THREE.Vector3().subVectors(this._headWorldPos, camera.position);
      const distToEnemy = dir.length();
      dir.normalize();
      
      this._raycaster.set(camera.position, dir);
      this._raycaster.far = distToEnemy;
      const intersects = this._raycaster.intersectObjects(buildingsList, false);
      if (intersects.length > 0) {
        isOccluded = true;
      }
    }

    const projected = this._headWorldPos.clone().project(camera);

    const canvas = renderer.domElement;
    const x = (projected.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (projected.y * -0.5 + 0.5) * canvas.clientHeight;

    const distToEnemy = camera.position.distanceTo(this.group.position);

    if (distToEnemy > 20.0 || isOccluded || projected.z > 1 || x < -80 || x > canvas.clientWidth + 80) {
      this._hpEl.style.display = 'none';
      return;
    }

    this._hpEl.style.display = 'block';
    this._hpEl.style.left = x + 'px';
    this._hpEl.style.top  = (y - 16) + 'px';

    const ratio = Math.max(0, this.hp / this.maxHp);
    this._hpFillEl.style.width = (ratio * 100) + '%';
    if (ratio > 0.5) {
      this._hpFillEl.style.background = '#22ff22';
      this._hpFillEl.style.boxShadow  = '0 0 4px #22ff22';
    } else if (ratio > 0.25) {
      this._hpFillEl.style.background = '#ff8800';
      this._hpFillEl.style.boxShadow  = '0 0 4px #ff8800';
    } else {
      this._hpFillEl.style.background = '#ff2222';
      this._hpFillEl.style.boxShadow  = '0 0 4px #ff2222';
    }
  }

  updateBounds() {
    this.boundingBox.setFromObject(this.group);
  }

  update(playerPos, delta, onShoot) {
    if (this.isDead) {
      // Thanos Dissolve Particle animation
      this.dissolveTimer += delta;
      if (this.dissolveTimer >= this.maxDissolveTime) {
        this.isDissolved = true;
        return;
      }

      // Shrink meshes
      const progress = this.dissolveTimer / this.maxDissolveTime;
      this.group.traverse((child) => {
        if (child.isMesh && child.name !== 'dust') {
          child.scale.setScalar(Math.max(0, 1.0 - progress));
        }
      });

      // Spawn floating dust particles
      if (Math.random() < 0.45) {
        const pMat = Math.random() > 0.5 ? sharedDustMat1 : sharedDustMat2;
        const pMesh = new THREE.Mesh(sharedDustGeo, pMat);
        pMesh.name = 'dust';
        
        pMesh.position.set(
          (Math.random() - 0.5) * 0.7,
          Math.random() * 0.8,
          (Math.random() - 0.5) * 0.7
        );
        this.group.add(pMesh);

        this.dustParticles.push({
          mesh: pMesh,
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5),
          age: 0.0,
          maxAge: 0.6 + Math.random() * 0.4
        });
      }

      // Update active dust particles
      for (let i = this.dustParticles.length - 1; i >= 0; i--) {
        const d = this.dustParticles[i];
        d.mesh.position.addScaledVector(d.vel, delta);
        d.age += delta;
        d.mesh.scale.multiplyScalar(0.96);
        if (d.age >= d.maxAge) {
          this.group.remove(d.mesh);
          // Do NOT dispose shared geometry/material!
          this.dustParticles.splice(i, 1);
        }
      }
      return;
    }

    this.updateBounds();

    const dir = new THREE.Vector3().subVectors(playerPos, this.group.position);
    const dist = dir.length();
    dir.y = 0;
    dir.normalize();

    if (dist > 1.0) {
      const targetAngle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = targetAngle;
    }

    if (dist < 25 && dist > 6) {
      this.group.position.addScaledVector(dir, this.speed * delta);
      this.state = 'walking';
    } else {
      this.state = 'idle';
    }

    const inCombat = dist < 20.0;

    // --- ANIMATE LIMBS ---
    if (this.type === 'alien') {
      if (this.state === 'walking') {
        this._bobTime += delta * 8;
        
        const maxSwing = 0.5;
        const maxKneeBend = 0.55;

        // Leg swing
        this.leftLeg.rotation.x = Math.sin(this._bobTime) * maxSwing;
        this.rightLeg.rotation.x = -Math.sin(this._bobTime) * maxSwing;
        this.leftKnee.rotation.x = Math.max(0, -Math.sin(this._bobTime)) * maxKneeBend;
        this.rightKnee.rotation.x = Math.max(0, Math.sin(this._bobTime)) * maxKneeBend;

        // Arm aiming pose when in combat
        if (inCombat) {
          this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -Math.PI / 2, 0.15);
          this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -Math.PI / 2, 0.15);
          this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, 0, 0.15);
          this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, 0, 0.15);
        } else {
          this.leftArm.rotation.x = -Math.sin(this._bobTime) * 0.4;
          this.rightArm.rotation.x = Math.sin(this._bobTime) * 0.4;
          this.leftElbow.rotation.x = -0.2 - Math.abs(Math.sin(this._bobTime)) * 0.2;
          this.rightElbow.rotation.x = -0.2 - Math.abs(Math.sin(this._bobTime)) * 0.2;
        }
      } else {
        // Idle
        const tFactor = 0.15;
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, tFactor);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, tFactor);
        this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 0, tFactor);
        this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 0, tFactor);

        if (inCombat) {
          this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -Math.PI / 2, tFactor);
          this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -Math.PI / 2, tFactor);
          this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, 0, tFactor);
          this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, 0, tFactor);
        } else {
          this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, tFactor);
          this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, tFactor);
          this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, -0.15, tFactor);
          this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, -0.15, tFactor);
        }
      }
    } else if (this.type === 'spider') {
      // Spider leg tripod gait animation
      if (this.state === 'walking') {
        this._bobTime += delta * 12.0; // Spiders scurry quickly!
        const maxSwing = 0.28;

        this.legs.forEach((leg, idx) => {
          const phase = (idx % 2 === 0) ? Math.sin(this._bobTime) : -Math.sin(this._bobTime);
          
          leg.hip.rotation.y = leg.rotY + phase * maxSwing * 0.8;
          leg.upper.rotation.z = leg.defaultRotZ + Math.abs(phase) * 0.18;
          leg.knee.rotation.z = (leg.side * Math.PI / 5) - Math.abs(phase) * 0.2;
        });
      } else {
        const tFactor = 0.15;
        this.legs.forEach((leg) => {
          leg.hip.rotation.y = THREE.MathUtils.lerp(leg.hip.rotation.y, leg.rotY, tFactor);
          leg.upper.rotation.z = THREE.MathUtils.lerp(leg.upper.rotation.z, leg.defaultRotZ, tFactor);
          leg.knee.rotation.z = THREE.MathUtils.lerp(leg.knee.rotation.z, leg.side * Math.PI / 5, tFactor);
        });
      }
    }

    // Firing routine
    this.shootTimer += delta;
    if (this.shootTimer >= this.shootInterval && inCombat) {
      this.shootTimer = 0;
      const startPos = new THREE.Vector3();

      if (this.type === 'alien') {
        this._shootHand = this._shootHand === 'right' ? 'left' : 'right';
        const pistol = this._shootHand === 'right' ? this.pistolR : this.pistolL;
        pistol.userData.muzzle.getWorldPosition(startPos);
      } else {
        // Spider laser barrel
        this.laserMuzzle.getWorldPosition(startPos);
      }

      const targetPos = playerPos.clone().add(new THREE.Vector3(0, 0.5, 0));
      onShoot(startPos, targetPos, this.type);
    }
  }

  takeDamage(amount) {
    if (this.isDead) return false;
    this.hp -= amount;

    // Flash white visual feedback (pre-scans unique materials first to avoid shared original color race conditions)
    const materialsToRestore = [];
    this.group.traverse(child => {
      if (child.isMesh && child.material && child.name !== 'dust') {
        const mat = child.material;
        if (!materialsToRestore.some(entry => entry.mat === mat)) {
          materialsToRestore.push({
            mat: mat,
            origColor: mat.color.getHex()
          });
        }
      }
    });

    // Apply flash color
    materialsToRestore.forEach(entry => {
      entry.mat.color.setHex(0xffffff);
    });

    // Restore after 80ms
    setTimeout(() => {
      materialsToRestore.forEach(entry => {
        entry.mat.color.setHex(entry.origColor);
      });
    }, 80);

    if (this.hp <= 0) {
      this.isDead = true;
      if (this._hpEl && this._hpEl.parentNode) {
        this._hpEl.parentNode.removeChild(this._hpEl);
      }
      return true; // Lethal hit
    }
    return false;
  }

  destroy() {
    if (this._hpEl && this._hpEl.parentNode) {
      this._hpEl.parentNode.removeChild(this._hpEl);
    }
    
    // Dispose dust leftovers
    this.dustParticles.forEach(d => {
      this.group.remove(d.mesh);
      d.mesh.geometry.dispose();
      d.mesh.material.dispose();
    });

    this.scene.remove(this.group);
  }
}
