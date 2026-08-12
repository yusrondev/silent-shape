import * as THREE from 'three';

/** Container div in the page that holds all enemy HP bars */
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
  constructor(scene, spawnPos) {
    this.scene = scene;
    this.hp = 30;
    this.maxHp = 30;
    this.speed = 2.0;
    this.shootTimer = Math.random() * 1.5;
    this.shootInterval = 1.6 + Math.random() * 0.8;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.scene.add(this.group);

    // Build low-poly alien model
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a189a });
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.6;
    bodyMesh.castShadow = true;
    this.group.add(bodyMesh);

    const headMat = new THREE.MeshLambertMaterial({ color: 0x7b2cbf });
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(0, 1.3, 0);
    this.group.add(headMesh);

    // Green glowing eyes
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 1.35, 0.3);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.15, 1.35, 0.3);
    this.group.add(eyeL, eyeR);

    // Dual pistols
    const pistolMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const gripMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    const _makePistol = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.5, 0.65, 0.2);
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.18), pistolMat);
      slide.position.set(0, 0, -0.04);
      g.add(slide);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.04), gripMat);
      grip.position.set(0, -0.04, 0.04);
      g.add(grip);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.06), pistolMat);
      barrel.position.set(0, 0.01, -0.14);
      g.add(barrel);
      return g;
    };

    this.pistolL = _makePistol(-1);
    this.pistolR = _makePistol(1);
    this.group.add(this.pistolL, this.pistolR);

    this._muzzlePosL = new THREE.Vector3(-0.5, 0.66, 0.2 - 0.17);
    this._muzzlePosR = new THREE.Vector3( 0.5, 0.66, 0.2 - 0.17);
    this._shootHand = 'right';

    // Enable shadows on all alien meshes
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow    = true;
        child.receiveShadow = true;
      }
    });

    // ── HTML HP bar (2D overlay, always readable) ────────────────────────────
    const container = getHPContainer();

    this._hpEl = document.createElement('div');
    this._hpEl.style.cssText = `
      position: absolute;
      width: 60px;
      transform: translateX(-50%);
      pointer-events: none;
    `;

    // Label
    const label = document.createElement('div');
    label.textContent = 'ALIEN';
    label.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 9px;
      font-weight: 700;
      color: #ff5555;
      text-align: center;
      letter-spacing: 1px;
      text-shadow: 0 0 6px rgba(255,50,50,0.9);
      margin-bottom: 2px;
    `;
    this._hpEl.appendChild(label);

    // Track
    const track = document.createElement('div');
    track.style.cssText = `
      width: 100%; height: 5px;
      background: rgba(80,0,0,0.8);
      border: 1px solid rgba(255,80,80,0.4);
      border-radius: 3px;
      overflow: hidden;
    `;

    // Fill
    this._hpFillEl = document.createElement('div');
    this._hpFillEl.style.cssText = `
      height: 100%;
      width: 100%;
      background: #ff2222;
      box-shadow: 0 0 4px #ff2222;
      border-radius: 3px;
      transition: width 0.08s linear, background 0.15s linear;
    `;
    track.appendChild(this._hpFillEl);
    this._hpEl.appendChild(track);
    container.appendChild(this._hpEl);

    this.boundingBox = new THREE.Box3();
    this._headWorldPos = new THREE.Vector3();
  }

  /**
   * Project head position to screen space and reposition the HP bar div.
   * Call every frame from main.js.
   */
  updateHPBarDOM(camera, renderer, buildingsList = []) {
    // World position of head
    this._headWorldPos.set(0, 1.9, 0).applyMatrix4(this.group.matrixWorld);

    // Occlusion Raycast
    let isOccluded = false;
    if (buildingsList.length > 0) {
      if (!this._raycaster) this._raycaster = new THREE.Raycaster();
      const dir = new THREE.Vector3().subVectors(this._headWorldPos, camera.position);
      const distToEnemy = dir.length();
      dir.normalize();
      
      this._raycaster.set(camera.position, dir);
      this._raycaster.far = distToEnemy; // Only care about objects closer than the enemy
      const intersects = this._raycaster.intersectObjects(buildingsList, false);
      if (intersects.length > 0) {
        isOccluded = true;
      }
    }

    // Project to NDC
    const projected = this._headWorldPos.clone().project(camera);

    // NDC → CSS pixels
    const canvas = renderer.domElement;
    const x = (projected.x *  0.5 + 0.5) * canvas.clientWidth;
    const y = (projected.y * -0.5 + 0.5) * canvas.clientHeight;

    const distToEnemy = camera.position.distanceTo(this.group.position);

    // Hide if too far (>20m), occluded, behind camera, or out of view
    if (distToEnemy > 20.0 || isOccluded || projected.z > 1 || x < -80 || x > canvas.clientWidth + 80) {
      this._hpEl.style.display = 'none';
      return;
    }

    this._hpEl.style.display = 'block';
    this._hpEl.style.left = x + 'px';
    this._hpEl.style.top  = (y - 16) + 'px'; // slightly above head

    // Update fill
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
    }

    this.shootTimer += delta;
    if (this.shootTimer >= this.shootInterval && dist < 20) {
      this.shootTimer = 0;
      this._shootHand = this._shootHand === 'right' ? 'left' : 'right';
      const localMuzzle = this._shootHand === 'right' ? this._muzzlePosR : this._muzzlePosL;
      const startPos = localMuzzle.clone().applyMatrix4(this.group.matrixWorld);
      const targetPos = playerPos.clone().add(new THREE.Vector3(0, 0.5, 0));
      onShoot(startPos, targetPos);
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.group.traverse(child => {
      if (child.isMesh && child.material) {
        const origColor = child.material.color.getHex();
        child.material.color.setHex(0xffffff);
        setTimeout(() => {
          if (child.material) child.material.color.setHex(origColor);
        }, 80);
      }
    });
    return this.hp <= 0;
  }

  destroy() {
    // Remove HP bar div
    if (this._hpEl && this._hpEl.parentNode) {
      this._hpEl.parentNode.removeChild(this._hpEl);
    }
    this.scene.remove(this.group);
  }
}
