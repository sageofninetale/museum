import * as THREE from 'three';
import { fbm3 } from './noise.js';

// materials are created per island so filtering can dim islands independently.
// the "saffron" tint marks the Art-of-India sister islands.
function createMaterials(tint) {
  const saffron = tint === 'saffron';
  return {
    rock: new THREE.MeshStandardMaterial({
      color: saffron ? 0x6b5f60 : 0x566079,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    }),
    marble: new THREE.MeshStandardMaterial({
      color: saffron ? 0xd4c3a3 : 0xc9c0af,
      roughness: 0.5,
      metalness: 0.02,
    }),
    gem: new THREE.MeshStandardMaterial({
      color: 0x1a1006,
      emissive: saffron ? 0xff9440 : 0xffb26b,
      emissiveIntensity: 2.2,
      roughness: 0.3,
    }),
    ring: new THREE.MeshBasicMaterial({
      color: saffron ? 0xffb26e : 0xffd9a4,
      transparent: true,
      opacity: 0.85,
    }),
  };
}

function createRock(seed, rockMaterial) {
  const geometry = new THREE.CylinderGeometry(5.4, 0.7, 9.5, 12, 6);
  geometry.translate(0, -4.75, 0); // top face sits at y = 0

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const depth = THREE.MathUtils.clamp(-y / 9.5, 0, 1);
    const angle = Math.atan2(z, x);
    // noise keyed on (angle, y) so seam-duplicated vertices displace identically
    const n = fbm3(Math.cos(angle) * 1.4, y * 0.3, Math.sin(angle) * 1.4, seed, 3) - 0.5;
    const radial = 1 + n * (0.45 + 0.75 * depth);
    pos.setX(i, x * radial);
    pos.setZ(i, z * radial);
    if (depth > 0.02 && depth < 0.98) {
      pos.setY(i, y + (fbm3(x * 0.22, seed * 1.7, z * 0.22, seed + 3.1, 2) - 0.5) * 1.4 * depth);
    }
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, rockMaterial);
}

export function createIsland({ period, index, seed, tint, scale = 1 }) {
  const group = new THREE.Group();
  if (scale !== 1) group.scale.setScalar(scale);
  const materials = createMaterials(tint);

  const rock = createRock(seed, materials.rock);
  rock.userData.island = group;
  group.add(rock);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(6.0, 6.45, 0.6, 56),
    materials.marble
  );
  platform.position.y = 0.3;
  platform.userData.island = group;
  group.add(platform);

  // luminous rim ring — the bloom pass makes this the island's signature glow
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.22, 0.05, 8, 96), materials.ring);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.62;
  group.add(ring);

  // central marker: a small tapered stele crowned with an ember gem
  const stele = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 2.6, 4), materials.marble);
  stele.rotation.y = Math.PI / 4;
  stele.position.y = 1.9;
  stele.userData.island = group;
  group.add(stele);

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), materials.gem);
  gem.position.y = 3.6;
  group.add(gem);

  // warm pool of light on the platform
  const glow = new THREE.PointLight(tint === 'saffron' ? 0xffab5e : 0xffc98a, 30, 20, 2);
  glow.position.set(0, 3.2, 0);
  group.add(glow);

  // small rock shards drifting around the underside
  const shards = new THREE.Group();
  const shardCount = 4 + Math.floor(seed * 100) % 3;
  for (let i = 0; i < shardCount; i++) {
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.28 + Math.random() * 0.4), materials.rock);
    const a = Math.random() * Math.PI * 2;
    const r = 5.5 + Math.random() * 3.5;
    shard.position.set(Math.cos(a) * r, -3 - Math.random() * 5, Math.sin(a) * r);
    shard.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    shard.userData.orbit = { a, r, y: shard.position.y, speed: 0.05 + Math.random() * 0.08 };
    shards.add(shard);
  }
  group.add(shards);

  const bobPhase = seed * 37.7;
  group.userData.period = period;
  group.userData.index = index;
  group.userData.gem = gem;
  group.userData.materials = materials;
  group.userData.glow = glow;
  group.userData.clickables = [rock, platform, stele];
  group.userData.dim = { value: 0 };

  group.userData.update = (t) => {
    group.position.y = group.userData.baseY + Math.sin(t * 0.35 + bobPhase) * 0.55;
    gem.rotation.y = t * 0.5;
    for (const shard of shards.children) {
      const o = shard.userData.orbit;
      const a = o.a + t * o.speed;
      shard.position.x = Math.cos(a) * o.r;
      shard.position.z = Math.sin(a) * o.r;
      shard.position.y = o.y + Math.sin(t * 0.4 + o.a * 5.0) * 0.4;
      shard.rotation.x += 0.0004;
      shard.rotation.y += 0.0007;
    }
  };

  return group;
}
