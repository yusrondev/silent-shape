# SILENT SHAPE — Performance Strategy Guide
**Target:** 60fps on mid-range Android (Snapdragon 665+) & iPhone 12+

---

## 1. Renderer Configuration

```javascript
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game-canvas'),
  antialias: false,        // ← DISABLE antialias on mobile (expensive)
  powerPreference: 'high-performance',
  alpha: false,            // ← No transparency needed on canvas
});

// Cap pixel ratio at 2x — prevents 3x OLED screens from rendering 3x
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Shadow maps: DISABLE for v1
renderer.shadowMap.enabled = false;
```

---

## 2. Geometry Strategy

### 2.1 Instanced Meshes (Buildings)
```javascript
// Instead of 100 separate building meshes:
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshLambertMaterial({ color: 0x8d8fa3 });
const instancedMesh = new THREE.InstancedMesh(geometry, material, 100);
// Set position via matrix for each instance
```
- **Target**: All buildings of same height category → 1 InstancedMesh per category.
- **Savings**: Reduces draw calls from ~200 to ~8 per chunk.

### 2.2 Geometry Merging (Ground & Debris)
```javascript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Merge all static ground tiles into 1 geometry per chunk
const mergedGeo = mergeGeometries(groundTileGeometries);
```

### 2.3 Polygon Budget
| Object Type | Max Triangles | Notes |
|---|---|---|
| Player Character | 48 tri | Box + limb capsule approximate |
| Small Building | 12 tri | Box only |
| Large Building | 36 tri | Box + protrusions |
| Ground Chunk | 2 tri | Single plane |
| Debris Cluster | 24 tri | 4-6 small boxes merged |

---

## 3. Material Strategy

### Use MeshLambertMaterial (NOT MeshStandardMaterial)
```javascript
// ✅ Good — Lambert (per-vertex lighting, cheap)
new THREE.MeshLambertMaterial({ color: 0x8d8fa3, flatShading: true });

// ❌ Avoid — Standard (PBR, physically based, expensive on mobile)
new THREE.MeshStandardMaterial({ color: 0x8d8fa3, roughness: 0.8 });
```

### Material Consolidation
- Target: **Maximum 6 unique materials** per chunk visible at once.
- Use a `MaterialLibrary` singleton that caches and reuses materials by color key.

---

## 4. Chunk Streaming System

### Chunk Grid Design
```
Chunk size: 64 × 64 world units
Active chunks: 3×3 grid (9 chunks) centered on player
Load distance: 1 chunk ahead
Unload distance: 2 chunks behind
```

### Loading Priority
```javascript
// Priority queue — load chunks in view frustum first
const frustum = new THREE.Frustum();
frustum.setFromProjectionMatrix(camera.projectionMatrix * camera.matrixWorldInverse);

// Skip generating chunks not in frustum
if (!frustum.intersectsBox(chunkBoundingBox)) return;
```

### Async Chunk Generation
```javascript
// Use requestIdleCallback to generate chunks during idle time
requestIdleCallback(() => {
  generateChunk(chunkX, chunkZ);
}, { timeout: 100 });
```

---

## 5. Fog as Performance Tool

```javascript
// FogExp2 hides distant geometry — allows aggressive culling
scene.fog = new THREE.FogExp2(0x6b6f7e, 0.018);
// Objects >55 units away are invisible → don't need to render beyond that
renderer.setRenderDistanceMax(60); // conceptual — via frustum far plane
camera.far = 120; // keep far plane low
camera.updateProjectionMatrix();
```

---

## 6. Render Loop Optimization

### Frame Rate Management
```javascript
let lastTime = 0;
const TARGET_FPS = 60;
const FRAME_MS = 1000 / TARGET_FPS;

function gameLoop(timestamp) {
  const delta = timestamp - lastTime;
  if (delta >= FRAME_MS) {
    lastTime = timestamp - (delta % FRAME_MS); // Correct drift
    update(delta / 1000);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(gameLoop);
}
```

### Background Throttling
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause game loop when tab backgrounded
    cancelAnimationFrame(animFrameId);
  } else {
    animFrameId = requestAnimationFrame(gameLoop);
  }
});
```

---

## 7. Texture Strategy (v2)

- Use **texture atlases**: 1 atlas per biome (512×512px max).
- Format: **WebP** for texture files.
- **No mipmaps** on mobile (memory overhead vs benefit tradeoff).
- Defer texture loading with `THREE.LoadingManager`.

---

## 8. JavaScript Optimization

- **Object pooling** for frequently created/destroyed objects (projectiles, particles).
- **Avoid garbage collection spikes**: Pre-allocate `THREE.Vector3`, `THREE.Matrix4` instances.
- **Separate update rates**: Physics at 60Hz, chunk streaming check at 2Hz.

```javascript
// Pre-allocate reusable vectors
const _tempVec3 = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();

// Inside update loop — use _tempVec3 instead of new THREE.Vector3()
_tempVec3.set(x, y, z);
```

---

## 9. Mobile-Specific WebGL Settings

```javascript
// Check for mobile and apply extra optimizations
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
if (isMobile) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Even lower on mobile
  // Reduce fog density to compensate for lower render distance
  scene.fog.density = 0.022;
}
```

---

## 10. Performance Monitoring

```javascript
// Simple FPS counter for dev builds
let frameCount = 0;
let fpsTimer = 0;
let currentFPS = 0;

function updateFPS(delta) {
  frameCount++;
  fpsTimer += delta;
  if (fpsTimer >= 1) {
    currentFPS = frameCount;
    frameCount = 0;
    fpsTimer -= 1;
    console.log(`FPS: ${currentFPS}`);
  }
}
```

---

## Target Benchmarks

| Metric | Target | Acceptable |
|---|---|---|
| FPS (Mid Android) | 60fps | 45fps+ |
| FPS (iPhone 12) | 60fps | 60fps |
| Draw Calls per Frame | <20 | <40 |
| Memory (JS Heap) | <150MB | <250MB |
| VRAM (GPU Memory) | <80MB | <120MB |
| Chunk Load Time | <16ms | <100ms |
| Initial Load | <5s | <10s |
