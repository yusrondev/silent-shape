import * as THREE from 'three';

export class Enemy {
  constructor(scene, spawnPos) {
    this.scene = scene;
    this.hp = 30; // 3 shots to kill
    this.maxHp = 30;
    this.speed = 2.0;
    this.shootTimer = Math.random() * 1.5;
    this.shootInterval = 1.6 + Math.random() * 0.8;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.scene.add(this.group);

    // Build low-poly alien model
    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5a189a }); // Purple alien
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.6;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x7b2cbf });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.set(0, 1.3, 0);
    headMesh.castShadow = true;
    this.group.add(headMesh);

    // Green glowing eyes
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 }); // Neon green
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 1.35, 0.3);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.15, 1.35, 0.3);
    this.group.add(eyeL, eyeR);

    // Pistol
    const pistolGeo = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const pistolMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    this.pistol = new THREE.Mesh(pistolGeo, pistolMat);
    this.pistol.position.set(0.4, 0.6, 0.2);
    this.group.add(this.pistol);

    // Bounding box for raycast collision
    this.boundingBox = new THREE.Box3();
    this.updateBounds();
  }

  updateBounds() {
    this.boundingBox.setFromObject(this.group);
  }

  update(playerPos, delta, onShoot) {
    this.updateBounds();

    // Look at player
    const dir = new THREE.Vector3().subVectors(playerPos, this.group.position);
    const dist = dir.length();
    dir.y = 0; // Keep horizontal orientation
    dir.normalize();

    // Rotate towards player
    if (dist > 1.0) {
      const targetAngle = Math.atan2(dir.x, dir.z);
      this.group.rotation.y = targetAngle;
    }

    // AI movement: walk towards player if within 25 units but stop at 6 units to shoot
    if (dist < 25 && dist > 6) {
      this.group.position.addScaledVector(dir, this.speed * delta);
    }

    // Shooting logic
    this.shootTimer += delta;
    if (this.shootTimer >= this.shootInterval && dist < 20) {
      this.shootTimer = 0;
      // Spawn bullet/beam heading from alien pistol to player chest
      const startPos = new THREE.Vector3().copy(this.pistol.position).applyMatrix4(this.group.matrixWorld);
      const targetPos = new THREE.Vector3().copy(playerPos).add(new THREE.Vector3(0, 0.5, 0));
      onShoot(startPos, targetPos);
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    // Brief red flash
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

  destroy() {
    this.scene.remove(this.group);
  }
}
