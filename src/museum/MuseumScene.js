import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

let rectAreaInit = false;

// wall palettes — heroes always get the oxblood room
const PALETTES = [
  { wall: 0x442220, trim: 0x8a7a5e }, // oxblood
  { wall: 0x25322b, trim: 0x7e7458 }, // deep green
  { wall: 0x1f2b3a, trim: 0x76705c }, // prussian blue
  { wall: 0x33222e, trim: 0x81745a }, // aubergine
];

const goldMaterial = new THREE.MeshStandardMaterial({
  color: 0xc9a227,
  metalness: 1.0,
  roughness: 0.34,
  envMapIntensity: 1.1,
});

const linerMaterial = new THREE.MeshStandardMaterial({
  color: 0x151009,
  metalness: 0.2,
  roughness: 0.8,
});

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// procedural dark oak planks for the floor overlay
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20160f';
  ctx.fillRect(0, 0, 1024, 1024);
  const plankW = 128;
  for (let px = 0; px < 8; px++) {
    for (let y = 0; y < 1024; y += 4) {
      const n = Math.sin(y * 0.017 + px * 13.7) * 0.5 + Math.sin(y * 0.05 + px * 7.1) * 0.5;
      const l = 16 + n * 7 + Math.random() * 4;
      ctx.fillStyle = `rgb(${l + 18}, ${l + 8}, ${l})`;
      ctx.fillRect(px * plankW, y, plankW, 4);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(px * plankW, 0, 2, 1024);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// engraved artist name for the far wall
function makeNamePlaque(artist) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 768;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8b96a';
  ctx.font = '500 170px "EB Garamond", Georgia, serif';
  const name = artist.name.toUpperCase();
  ctx.letterSpacing = '38px';
  ctx.fillText(name, 1024, 330, 1900);
  ctx.font = 'italic 74px "EB Garamond", Georgia, serif';
  ctx.letterSpacing = '10px';
  ctx.fillStyle = 'rgba(216,185,106,0.72)';
  const dates = `${artist.birthYear ?? ''} — ${artist.deathYear ?? ''}`;
  ctx.fillText(dates, 1024, 490);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MuseumScene {
  constructor({ artist, paintings, renderer }) {
    this.artist = artist;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0b09);
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.05,
      220
    );
    this.clickTargets = [];
    this.disposables = [];
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this._shadowFrames = 0;

    const hero = !!artist.hero;
    this.palette = hero ? PALETTES[0] : PALETTES[hashCode(artist.id) % PALETTES.length];

    // pull the widest fresco up onto the ceiling for the fresco masters
    let wallPaintings = [...paintings];
    this.ceilingPainting = null;
    if (artist.ceilingFresco) {
      const wide = wallPaintings
        .filter((p) => p.width / p.height >= 1.95)
        .sort((a, b) => b.width / b.height - a.width / a.height)[0];
      if (wide) {
        this.ceilingPainting = wide;
        wallPaintings = wallPaintings.filter((p) => p !== wide);
      }
    }
    this.wallPaintings = wallPaintings;

    const perWall = Math.ceil(wallPaintings.length / 2);
    const spacing = hero ? 7.2 : 6.2;
    this.W = hero ? 17 : 13;
    this.H = hero ? 10 : 6.8;
    this.L = Math.max(perWall * spacing + 12, 30);

    this.#buildEnvironment();
    this.#buildRoom(hero);
    this.#hangPaintings(spacing);
    if (this.ceilingPainting) this.#buildCeilingFresco();
    this.#furnish();

    // player spawn: at the entrance end, looking down the hall
    this.camera.position.set(0, 1.7, this.L / 2 - 3);
    this.camera.lookAt(0, 2.2, 0);
    this.bounds = {
      minX: -this.W / 2 + 0.7,
      maxX: this.W / 2 - 0.7,
      minZ: -this.L / 2 + 0.9,
      maxZ: this.L / 2 - 0.9,
    };
  }

  #buildEnvironment() {
    if (!rectAreaInit) {
      RectAreaLightUniformsLib.init();
      rectAreaInit = true;
    }
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.3;
    this.disposables.push(envTex);
  }

  #buildRoom(hero) {
    const { W, H, L } = this;
    const wallMat = new THREE.MeshStandardMaterial({
      color: this.palette.wall,
      roughness: 0.94,
      metalness: 0.0,
    });
    const wainscotMat = new THREE.MeshStandardMaterial({
      color: 0x241c15,
      roughness: 0.62,
      metalness: 0.05,
    });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x171310, roughness: 0.95 });

    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mkWall(L, H, -W / 2, H / 2, 0, Math.PI / 2); // left
    mkWall(L, H, W / 2, H / 2, 0, -Math.PI / 2); // right
    mkWall(W, H, 0, H / 2, -L / 2, 0); // far
    mkWall(W, H, 0, H / 2, L / 2, Math.PI); // near (behind spawn)

    // wainscot band + gold rail along both long walls
    for (const side of [-1, 1]) {
      const ws = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, L), wainscotMat);
      ws.position.set(side * (W / 2 - 0.04), 0.525, 0);
      ws.receiveShadow = true;
      this.scene.add(ws);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, L), goldMaterial);
      rail.position.set(side * (W / 2 - 0.06), 1.1, 0);
      this.scene.add(rail);
      // crown molding
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, L), wainscotMat);
      crown.position.set(side * (W / 2 - 0.05), H - 0.07, 0);
      this.scene.add(crown);
    }

    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.scene.add(ceil);

    // floor: mirror underneath, worn dark oak on top
    const mirror = new Reflector(new THREE.PlaneGeometry(W, L), {
      textureWidth: Math.min(window.innerWidth, 1600),
      textureHeight: Math.min(window.innerHeight, 1000),
      color: 0x9a9a9a,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = 0.0;
    this.scene.add(mirror);
    this.mirror = mirror;

    const woodTex = makeWoodTexture();
    woodTex.repeat.set(W / 6, L / 6);
    const wood = new THREE.Mesh(
      new THREE.PlaneGeometry(W, L),
      new THREE.MeshStandardMaterial({
        map: woodTex,
        transparent: true,
        opacity: 0.72,
        roughness: 0.55,
        metalness: 0.0,
      })
    );
    wood.rotation.x = -Math.PI / 2;
    wood.position.y = 0.015;
    wood.receiveShadow = true;
    this.scene.add(wood);
    this.disposables.push(woodTex);

    // far-wall engraved name
    const plaqueTex = makeNamePlaque(this.artist);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 3.15),
      new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true })
    );
    plaque.position.set(0, hero ? 4.6 : 3.6, -L / 2 + 0.03);
    this.scene.add(plaque);
    this.disposables.push(plaqueTex);

    // ambient scheme: dim, warm, gallery-like
    this.scene.add(new THREE.HemisphereLight(0x6b5f4e, 0x0f0c0a, 0.75));
    const wash = new THREE.RectAreaLight(0xffe9cf, 1.6, W - 3, L - 6);
    wash.position.set(0, H - 0.15, 0);
    wash.rotation.x = -Math.PI / 2;
    this.scene.add(wash);
  }

  #frameFor(w, h) {
    // beveled gold frame with a dark liner around the canvas
    const t = 0.11; // frame bar thickness
    const d = 0.09; // depth off the wall
    const group = new THREE.Group();
    const bar = (bw, bh, x, y) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, d), goldMaterial);
      m.position.set(x, y, 0);
      m.castShadow = true;
      group.add(m);
    };
    bar(w + t * 2, t, 0, h / 2 + t / 2);
    bar(w + t * 2, t, 0, -h / 2 - t / 2);
    bar(t, h, -w / 2 - t / 2, 0);
    bar(t, h, w / 2 + t / 2, 0);
    const liner = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, d * 0.55), linerMaterial);
    liner.position.z = -0.055; // fully behind the canvas plane
    group.add(liner);
    return group;
  }

  #paintingMesh(painting, w, h) {
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x14100c,
      roughness: 0.68,
      metalness: 0.0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.42,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    this.loader
      .loadAsync(painting.textureUrl ?? painting.imageUrl)
      .then((tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        material.map = tex;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        this.disposables.push(tex);
      })
      .catch(() => {
        material.color.set(0x241a12); // leave a dark panel if the image fails
      });
    return mesh;
  }

  #hangPaintings(spacing) {
    const { W, L } = this;
    const eye = this.artist.hero ? 2.5 : 2.15;
    const zStart = -L / 2 + 7;

    // every shadow map costs a fragment texture unit (WebGL guarantees only
    // 16 total, shared with material maps) — exceeding the budget makes every
    // lit material fail to compile and the whole room renders black.
    const shadowBudget = Math.max(0, Math.min(6, this.renderer.capabilities.maxTextures - 8));

    this.wallPaintings.forEach((painting, i) => {
      const side = i % 2 === 0 ? -1 : 1; // alternate left/right
      const k = Math.floor(i / 2);
      const z = zStart + k * spacing;

      const aspect = (painting.width || 4) / (painting.height || 3);
      let h = Math.sqrt(4.6 / aspect);
      h = THREE.MathUtils.clamp(h, 1.15, this.H - 3.4);
      let w = h * aspect;
      const maxW = this.artist.hero ? 5.8 : 4.6;
      if (w > maxW) {
        w = maxW;
        h = w / aspect;
      }

      const group = new THREE.Group();
      group.position.set(side * (W / 2 - 0.12), eye, z);
      group.rotation.y = (side * Math.PI) / 2 * -1;

      const canvas = this.#paintingMesh(painting, w, h);
      canvas.userData.painting = painting;
      canvas.castShadow = true;
      group.add(canvas);
      this.clickTargets.push(canvas);

      const frame = this.#frameFor(w, h);
      frame.position.z = -0.02;
      frame.children.forEach((c) => (c.userData.painting = painting));
      this.clickTargets.push(...frame.children);
      group.add(frame);

      this.scene.add(group);

      // dedicated spotlight from the ceiling, angled like a track light —
      // intensity follows the inverse-square throw so every canvas reads evenly
      const spotPos = new THREE.Vector3(side * (W / 2 - 3.1), this.H - 0.4, z);
      const throwSq = spotPos.distanceToSquared(group.position);
      const spot = new THREE.SpotLight(
        0xfff0da,
        3.6 * throwSq,
        0,
        Math.atan((Math.max(w, h) / 2 + 0.7) / Math.sqrt(throwSq)),
        0.48,
        2
      );
      spot.position.copy(spotPos);
      spot.target = canvas;
      // only the first few casters get real shadow maps; the rest still light
      // their canvases, just without shadows
      spot.castShadow = i < shadowBudget;
      if (spot.castShadow) {
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0004;
      }
      this.scene.add(spot);
    });
  }

  #buildCeilingFresco() {
    const { W, H, L } = this;
    const p = this.ceilingPainting;
    const aspect = p.width / p.height;
    const short = Math.min(W - 5, 9);
    const long = Math.min(L - 12, short * aspect);
    const shortFit = long / aspect;

    const group = new THREE.Group();
    group.position.y = H - 0.02;

    // the fresco hangs a hand-span below the ceiling plane, inside its surround
    const canvas = this.#paintingMesh(p, long, shortFit);
    canvas.rotation.x = Math.PI / 2; // face down
    canvas.rotation.z = Math.PI / 2; // long axis down the hall
    canvas.position.y = -0.14;
    canvas.userData.painting = p;
    group.add(canvas);
    this.clickTargets.push(canvas);

    // gilded surround ring (four bars, not a slab, so the fresco stays visible)
    const t = 0.3;
    const bar = (bw, bl, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.22, bl), goldMaterial);
      m.position.set(x, -0.05, z);
      group.add(m);
    };
    bar(shortFit + t * 2, t, 0, long / 2 + t / 2);
    bar(shortFit + t * 2, t, 0, -long / 2 - t / 2);
    bar(t, long, shortFit / 2 + t / 2, 0);
    bar(t, long, -shortFit / 2 - t / 2, 0);

    this.scene.add(group);

    // cornice uplights to bathe the fresco
    for (const side of [-1, 1]) {
      const up = new THREE.RectAreaLight(0xffe4bf, 3.4, L - 10, 1.6);
      up.position.set(side * (W / 2 - 1.2), H - 1.4, 0);
      up.rotation.set(Math.PI / 2, 0, 0); // face the ceiling
      this.scene.add(up);
    }
  }

  #furnish() {
    const { L } = this;
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.75 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.6 });
    for (const z of [-L / 5, L / 5]) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.62), leather);
      seat.position.y = 0.48;
      seat.castShadow = true;
      bench.add(seat);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.5), woodMat);
        leg.position.set(sx * 0.95, 0.21, 0);
        leg.castShadow = true;
        bench.add(leg);
      }
      bench.position.set(0, 0, z);
      this.scene.add(bench);
    }
  }

  update() {
    // bake the shadow maps once the scene has drawn a few frames, then freeze
    if (this._shadowFrames < 4) {
      this._shadowFrames++;
      if (this._shadowFrames === 4) this.renderer.shadowMap.autoUpdate = false;
    }
  }

  refreshShadows() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.renderer.shadowMap.autoUpdate = true;
    this.scene.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
    this.mirror.dispose?.();
    for (const d of this.disposables) d.dispose?.();
    this.pmrem.dispose();
  }
}
