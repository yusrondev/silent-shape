# SILENT SHAPE — Game Design Document (GDD)
**Version:** 0.1 Alpha  
**Genre:** 3D Post-Apocalyptic Exploration (Single Player)  
**Platform:** Mobile Web Browser (iOS Safari / Android Chrome)  
**Orientation:** Landscape (Horizontal)  
**Perspective:** Third-Person 3D  
**Art Style:** Low-Poly / Shape Style (Geometric Blocky 3D)

---

## 1. VISION & CONCEPT

> *"Dalam keheningan yang tersisa, hanya bentuk-bentuk geometris yang masih berdiri — gedung miring, reruntuhan tajam, dan langit yang membisu. Kamu adalah satu-satunya sinyal yang masih bergerak."*

**Silent Shape** adalah game eksplorasi 3D pasca-apokaliptik yang dirancang khusus untuk browser mobile dengan kontrol layar sentuh. Pemain menjelajahi kota-kota yang telah runtuh, memanjat bangunan miring, dan memancarkan sinyal dari puncak-puncak tertinggi untuk membuka peta dunia yang lebih luas.

### Pillars of Design
1. **Eksplorasi yang Tenang** — Tidak ada musuh. Hanya kesunyian, atmosfer, dan rasa ingin tahu.
2. **Traversal yang Memuaskan** — Memanjat, meluncur, dan grappling hook terasa responsif di layar sentuh.
3. **Visual yang Ikonik** — Low-poly shape style yang khas: gedung miring, gradien langit dusty, volumetric fog.
4. **Optimasi Mobile-First** — 60fps di HP mid-range, kontrol dual-thumb yang intuitif.

---

## 2. GAMEPLAY MECHANICS

### 2.1 Core Movement
| Kontrol | Input | Deskripsi |
|---|---|---|
| Berjalan / Lari | Joystick Kiri | Analog 360°, intensitas joystick = kecepatan (walk → run) |
| Lompat | Tombol ○ (Besar, Kanan) | Single tap = lompat, tahan = lompat lebih tinggi (hold jump) |
| Memanjat | Otomatis + Joystick Kiri | Saat menyentuh permukaan vertikal, auto-climb aktif |
| Rotasi Kamera | Swipe area tengah | Touch drag untuk orbit kamera 360° |

### 2.2 Traversal Tools
| Alat | Tombol | Mekanik |
|---|---|---|
| **Grappling Hook** | Tombol ⚡ (Tool) | Tembak ke permukaan, tarik karakter dengan cepat. Cooldown 3 detik. |
| **Glider** | Tahan ⚡ saat di udara | Deploy glider saat jatuh/melompat, meluncur horizontal dengan kontrol joystick. Lipat saat mendarat. |

### 2.3 Interaksi Artefak
- Tombol ◎ (Interact) muncul secara kontekstual saat pemain berdiri dekat **artefak cerita** (dalam radius 3 unit).
- Artefak berupa objek geometri bercahaya (pulsing glow).
- Setiap artefak memicu **text log** singkat (3-5 kalimat) yang mengungkap lore dunia.

### 2.4 Sinyal Tower Mechanic
- Di setiap region, terdapat **1 Sinyal Tower** — gedung tertinggi dengan antena geometri di puncaknya.
- Pemain harus **memanjat atau grapple** ke puncak, lalu **tahan tombol Interact** selama 3 detik untuk memancarkan sinyal.
- Efek: Fog di radius besar terbuka, region baru terbuka di peta, landmark baru muncul.

---

## 3. CORE LOOP

```
[SPAWN] Mulai di tengah reruntuhan
    ↓
[EKSPLORASI] Jelajahi chunk lingkungan sekitar
    ↓
[ARTEFAK] Temukan 3-5 artefak cerita per region (opsional)
    ↓
[NAVIGASI VERTIKAL] Identifikasi Sinyal Tower — gedung tertinggi
    ↓
[CLIMBING / GRAPPLE] Panjat dengan kombinasi joystick + grappling hook
    ↓
[TRANSMIT] Tahan Interact di puncak → Memancarkan sinyal
    ↓
[REGION BARU] Fog sirna → Area baru terbuka → Kembali ke [EKSPLORASI]
```

---

## 4. WORLD DESIGN

### 4.1 World Structure
- Dunia dibagi menjadi **Region** berukuran 256×256 unit game world.
- Setiap region memiliki **biome visual** berbeda (warna langit, intensitas fog, material gedung).
- Navigasi antar region melalui jembatan runtuh, terowongan, atau jalur terbuka.

### 4.2 Biome Regions
| Biome | Palet Warna | Karakteristik |
|---|---|---|
| **The Grey District** | Abu-abu, putih gading | Gedung kantor miring, jalan retak, fog tebal |
| **Rust Valley** | Oker, coklat karat, merah bata | Pabrik industri, tangki baja, asap statik |
| **The Pale Horizon** | Dusty rose, lavender, krem | Pinggir kota terbuka, hutan mati geometris, langit terang |
| **Echo Spire** | Navy gelap, teal, silver | Distrik teknologi, menara antena, sinyal visual biru |
| **The Fracture** | Hitam arang, kuning redup | Zone runtuh total, geometri pecah, platform melayang |

### 4.3 Environmental Features
- **Tilted Buildings**: Gedung miring 5°–20° berbagai arah (pre-set seed).
- **Debris Fields**: Cluster geometri acak di tanah (obstacle + estetika).
- **Broken Bridges**: Platform horizontal terputus, perlu grappling hook.
- **Rooftop Gardens** (Pale Horizon): Cluster box kecil berwarna dusty green sebagai platform tambahan.

---

## 5. VISUAL & ART DIRECTION

### 5.1 Art Style
- **Low-Poly / Blocky 3D**: Semua objek adalah kombinasi BoxGeometry, CylinderGeometry, ConeGeometry. Zero curves.
- **Flat Shading + Lambert**: `flatShading: true` pada semua mesh untuk look faceted.
- **No Textures di v1**: Semua material adalah `MeshLambertMaterial` dengan warna solid. Textures ditambah di v2.
- **Silhouette-First Design**: Bangunan dirancang agar siluetnya menarik dari jauh.

### 5.2 Color Palette (Grey District — Default)
```
Sky Top:      #1a1a2e  (deep navy)
Sky Bottom:   #4a4e69  (muted purple-grey)
Fog Color:    #6b6f7e  (medium grey)
Building A:   #8d8fa3  (cool grey)
Building B:   #6b6c7a  (dark grey)
Ground:       #3d3d3d  (near-black grey)
Accent/Glow:  #e8c547  (warm golden — artefak, UI poin penting)
Player:       #f0f0f0  (putih bersih)
```

### 5.3 Camera & Composition
- **Landscape FOV**: 75° horizontal, memberikan view wide yang dramatis.
- **Camera Offset**: 8 unit di belakang karakter, 4 unit di atas.
- **Depth via Fog**: `THREE.FogExp2` dengan density `0.018` untuk layer depth visual.

---

## 6. UI/UX DESIGN (LANDSCAPE MOBILE)

### 6.1 Layout Zones
```
┌─────────────────────────────────────────────────────────────┐
│ [Region: Grey District]                    [Signal ████░░] │  ← HUD Bar (Top)
│                                                             │
│         3D VIEWPORT (Camera Drag Area)                      │
│                                                             │
│                                              ⚡ [Tool]       │
│ [○ Joystick                           ◎ [Interact]          │
│   Zone]                          ○ [JUMP — Large]           │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 HUD Elements
| Element | Posisi | Detail |
|---|---|---|
| Region Name | Top-Left | Nama region saat ini, font tipis |
| Signal Meter | Top-Right | Bar progress artefak ditemukan / sinyal |
| Interaction Prompt | Center-Bottom saat aktif | "Hold to Transmit" / "Pick Up" |
| Coordinates (Debug) | Bottom-Center | x,z coordinates (dev build only) |

### 6.3 Action Button Arc (Kanan Bawah)
```
              ⚡ Tool
           ◎ Interact
        ○ JUMP (largest)
```
- **Jump**: 72px diameter, paling bawah, paling kanan.
- **Interact**: 54px diameter, muncul/hilang berdasarkan proximity.
- **Tool**: 54px diameter, paling atas dalam arc.
- Arc angle: 45° spread dari pojok kanan bawah.

---

## 7. PROGRESSION & NARRATIVE

### 7.1 Lore Framework
Dunia **Silent Shape** adalah bumi 200 tahun setelah "The Geometric Collapse" — sebuah fenomena fisika yang menyebabkan semua struktur organik berubah menjadi geometri murni. Pemain adalah **Signal Runner** terakhir — entitas yang masih bisa bergerak dan memancarkan sinyal ke menara-menara kuno.

### 7.2 Progression Arc
1. **Act 1 — Grey District**: Tutorial tersembunyi. Belajar bergerak, memanjat, menemukan artefak pertama.
2. **Act 2 — Rust Valley & Pale Horizon**: World lebih terbuka, grappling hook mulai krusial.
3. **Act 3 — Echo Spire**: Menara sinyal tertinggi. Puzzle traversal kompleks.
4. **Act 4 — The Fracture**: Zona final. Platform melayang, world geometry yang pecah.

### 7.3 Artefak Story Logs (Sample)
> *Artefak #001 — Grey District, lantai 3:*  
> "Aku masih ingat saat gedung ini masih tegak. Sekarang lantainya lebih dekat ke langit dari yang semestinya. Tapi sinyalnya... sinyalnya masih hidup."

---

## 8. AUDIO DIRECTION

- **Ambience**: Angin rendah, debu bergerak, resonansi metalik jauh.
- **Player SFX**: Langkah kaki ringan (geometri abstract), whoosh grappling, glider flutter.
- **Artefak**: Tone elektronik redup saat pickup.
- **Transmit**: Build-up frequency saat tahan transmit → release ledakan suara elektronik.
- **Music**: Generative ambient, minimal, berbasis drone dan pad. Berubah per biome.
- **Tech**: Web Audio API dengan buffer loading. No external audio library untuk performa.

---

## 9. TECHNICAL OVERVIEW

Lihat `PERFORMANCE.md` untuk detail teknis optimasi.

| Aspek | Keputusan |
|---|---|
| Renderer | Three.js r165 + WebGLRenderer |
| Virtual Input | Nipple.js v0.10 (floating dynamic joystick) |
| Build Tool | Vite 4 (Node 16 compatible) |
| Physics | Custom AABB (no external physics engine) |
| World Streaming | ChunkManager (9-chunk grid, 64-unit chunks) |
| Shading | MeshLambertMaterial (no PBR) |
| Target FPS | 60fps (mid-range Android), 60fps (iPhone 12+) |

---

*Document version 0.1 — akan diupdate seiring development.*
