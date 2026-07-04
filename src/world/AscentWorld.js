import * as THREE from 'three';
import { gsap } from 'gsap';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createIsland } from './Island.js';
import { createLightColumn } from './column.js';
import { createSky, createDust, createDistantIsles, FOG_COLOR } from './atmosphere.js';

// Helix layout — one island per period, ascending through history.
export const LAYOUT = {
  RISE: 13, // vertical gain per period
  STEP: 2.1, // radians of rotation per period
  RADIUS: 24, // island distance from the column
};

export class AscentWorld {
  constructor(data) {
    this.data = data;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0095);

    this.islands = [];
    this.clickTargets = [];
    this.artistNodes = [];
    this.focused = null;
    this.time = 0;

    this.periodCount = data.periods.length;

    this.#buildLights();
    this.#buildAtmosphere(data.periods.length);
    this.#buildIslands();
    this.#buildRibbon();
    this.#buildIndia();
  }

  // fractional helix index for an arbitrary year, interpolated inside the
  // period whose range contains it — lets sister islands sit at true dates
  #indexForYear(year) {
    const ps = this.data.periods;
    for (let i = 0; i < ps.length; i++) {
      const end = ps[i].endYear ?? 2030;
      if (year <= end) {
        const span = Math.max(end - ps[i].startYear, 1);
        return i + THREE.MathUtils.clamp((year - ps[i].startYear) / span, 0, 1);
      }
    }
    return ps.length - 1;
  }

  #buildLights() {
    const hemi = new THREE.HemisphereLight(0x9db8dd, 0x2a3450, 1.35);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd9a8, 2.2);
    key.position.set(35, 160, 20);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x5d7fb5, 0.8);
    fill.position.set(-50, 30, -40);
    this.scene.add(fill);

    // faint bounce from the void below so undersides never go pitch black
    const up = new THREE.DirectionalLight(0x3b5a8c, 0.9);
    up.position.set(0, -80, 10);
    this.scene.add(up);
  }

  #buildAtmosphere(periodCount) {
    const totalHeight = periodCount * LAYOUT.RISE;

    this.sky = createSky();
    this.scene.add(this.sky);

    this.dust = createDust({ height: totalHeight + 40 });
    this.scene.add(this.dust);

    this.scene.add(createDistantIsles());

    this.column = createLightColumn({ height: totalHeight + 55, baseY: -16 });
    this.scene.add(this.column);

    // the column casts real warm light onto the inner faces of the islands
    for (const y of [30, 95, 160]) {
      const glow = new THREE.PointLight(0xffc182, 650, 95, 2);
      glow.position.set(0, y, 0);
      this.scene.add(glow);
    }
  }

  islandPosition(index) {
    const angle = index * LAYOUT.STEP;
    const radius = LAYOUT.RADIUS + Math.sin(index * 1.7) * 2.5;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      index * LAYOUT.RISE,
      Math.sin(angle) * radius
    );
  }

  #buildIslands() {
    this.data.periods.forEach((period, i) => {
      const island = createIsland({ period, index: i, seed: i * 0.731 + 0.17 });
      const pos = this.islandPosition(i);
      island.position.copy(pos);
      island.userData.baseY = pos.y;
      island.userData.progressIndex = i;
      this.scene.add(island);
      this.islands.push(island);
      this.clickTargets.push(...island.userData.clickables);

      // period label floating above the stele
      const el = document.createElement('div');
      el.className = 'period-label';
      el.innerHTML = `<h2>${period.name}</h2><span>${period.startYear} — ${period.endYear ?? 'present'}</span>`;
      const label = new CSS2DObject(el);
      label.position.set(0, 5.6, 0);
      island.add(label);
      island.userData.labelEl = el;

      this.#buildArtistNodes(island, period);
    });
  }

  #buildArtistNodes(island, period) {
    const artists = this.data.byPeriod.get(period.id) ?? [];
    if (!artists.length) return;

    // the focus camera always sits at outward + 0.3, so center the arc there
    const outward = Math.atan2(island.position.z, island.position.x) + 0.3;
    const spread = Math.min(3.4, 0.75 * Math.max(artists.length - 1, 1));
    const nodeGroup = new THREE.Group();

    artists.forEach((artist, k) => {
      const t = artists.length === 1 ? 0.5 : k / (artists.length - 1);
      const angle = outward + (t - 0.5) * spread;
      const r = 4.55;

      const node = new THREE.Group();
      node.position.set(Math.cos(angle) * r, 1.45, Math.sin(angle) * r);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 18),
        new THREE.MeshStandardMaterial({
          color: 0x2a1a08,
          emissive: 0xffc98a,
          emissiveIntensity: 1.25,
          roughness: 0.4,
        })
      );
      node.add(orb);

      // generous invisible hit target for clicking
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.userData.artist = artist;
      node.add(hit);
      this.clickTargets.push(hit);

      const el = document.createElement('div');
      el.className = 'artist-label';
      const years = artist.activeStart
        ? `${artist.activeStart}–${artist.activeEnd ?? ''}`
        : '';
      el.innerHTML = `<h3>${artist.name}</h3><span>${years}</span>`;
      // alternate labels above/below the orbs to halve collisions
      const label = new CSS2DObject(el);
      label.position.set(0, k % 2 === 0 ? -0.66 : 0.78, 0);
      node.add(label);

      node.scale.setScalar(0.001);
      node.userData.labelEl = el;
      node.userData.orb = orb;
      nodeGroup.add(node);
      this.artistNodes.push(node);
    });

    nodeGroup.visible = false;
    island.add(nodeGroup);
    island.userData.artistGroup = nodeGroup;
  }

  #buildRibbon() {
    // a flowing path of light linking the eras, sweeping just inside the islands
    const points = this.islands.map((island) => {
      const p = island.position.clone();
      const flat = new THREE.Vector2(p.x, p.z);
      const r = flat.length();
      flat.setLength(Math.max(r - 6.9, 1));
      return new THREE.Vector3(flat.x, p.y + 0.85, flat.y);
    });

    // let the path rise out of the void below and continue toward the crown
    const first = points[0], second = points[1];
    points.unshift(first.clone().add(first.clone().sub(second).setY(-26)));
    const last = points[points.length - 1];
    points.push(new THREE.Vector3(last.x * 0.25, last.y + 30, last.z * 0.25));

    this.ribbonCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
    this.#addRibbon(this.ribbonCurve, [1.0, 0.78, 0.45], [1.0, 0.93, 0.75], 420);
  }

  #addRibbon(curve, dimColor, brightColor, segments) {
    const geometry = new THREE.TubeGeometry(curve, segments, 0.075, 8, false);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uDim: { value: new THREE.Vector3(...dimColor) },
        uBright: { value: new THREE.Vector3(...brightColor) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uDim;
        uniform vec3 uBright;
        void main() {
          // motes of light travelling up the path
          float flow = fract(vUv.x * 60.0 - uTime * 0.55);
          float pulse = smoothstep(0.0, 0.45, flow) * smoothstep(1.0, 0.55, flow);
          float a = 0.14 + pulse * 0.7;
          // taper away at both ends of the path
          a *= smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x));
          vec3 col = mix(uDim, uBright, pulse);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.ribbonMaterials ??= [];
    this.ribbonMaterials.push(material);
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  // the Art-of-India sister arc: saffron islands woven beside the helix at
  // their true dates, joined by their own warm branch of the light-path
  #buildIndia() {
    const defs = this.data.india?.islands ?? [];
    if (!defs.length) return;

    const branchPoints = [];
    defs.forEach((def, k) => {
      const fi = this.#indexForYear(def.anchorYear ?? def.startYear);
      const angle = fi * LAYOUT.STEP + 1.35;
      const radius = LAYOUT.RADIUS + 10;
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        fi * LAYOUT.RISE,
        Math.sin(angle) * radius
      );

      const island = createIsland({
        period: def,
        index: this.islands.length,
        seed: 7.7 + k * 0.91,
        tint: 'saffron',
        scale: 0.92,
      });
      island.position.copy(pos);
      island.userData.baseY = pos.y;
      island.userData.progressIndex = fi;
      this.scene.add(island);
      this.islands.push(island);
      this.clickTargets.push(...island.userData.clickables);

      const el = document.createElement('div');
      el.className = 'period-label';
      el.innerHTML = `<h2>${def.name}</h2><span>${def.startYear} — ${def.endYear ?? 'present'} · Art of India</span>`;
      const label = new CSS2DObject(el);
      label.position.set(0, 5.6, 0);
      island.add(label);
      island.userData.labelEl = el;

      this.#buildArtistNodes(island, def);

      const flat = new THREE.Vector2(pos.x, pos.z);
      flat.setLength(Math.max(flat.length() - 6.6, 1));
      branchPoints.push(new THREE.Vector3(flat.x, pos.y + 0.85, flat.y));
    });

    // the branch rises out of the deep alongside its islands
    const first = branchPoints[0];
    branchPoints.unshift(first.clone().add(new THREE.Vector3(6, -24, 6)));
    const last = branchPoints[branchPoints.length - 1];
    branchPoints.push(last.clone().add(new THREE.Vector3(-4, 22, -4)));

    const curve = new THREE.CatmullRomCurve3(branchPoints, false, 'catmullrom', 0.4);
    this.#addRibbon(curve, [1.0, 0.62, 0.28], [1.0, 0.85, 0.6], 260);
  }

  // ghost the islands that fall outside the selected period
  setPeriodFilter(periodId) {
    this.activeFilter = periodId ?? null;
    for (const island of this.islands) {
      const active = !periodId || island.userData.period.id === periodId;
      const dim = island.userData.dim;
      const mats = island.userData.materials;
      gsap.killTweensOf(dim);
      gsap.to(dim, {
        value: active ? 0 : 1,
        duration: 0.9,
        ease: 'power2.inOut',
        onStart: () => {
          mats.rock.transparent = mats.marble.transparent = true;
        },
        onUpdate: () => {
          const d = dim.value;
          mats.rock.opacity = 1 - d * 0.86;
          mats.marble.opacity = 1 - d * 0.86;
          mats.ring.opacity = 0.85 - d * 0.8;
          mats.gem.emissiveIntensity = 2.2 - d * 2.05;
          island.userData.glow.intensity = 30 - d * 28;
        },
        onComplete: () => {
          if (dim.value === 0) mats.rock.transparent = mats.marble.transparent = false;
        },
      });
    }
    if (
      this.focused &&
      periodId &&
      this.focused.userData.period.id !== periodId
    ) {
      this.clearFocus();
    }
  }

  focusIsland(island) {
    if (this.focused === island) return;
    this.clearFocus(true);
    this.focused = island;

    const group = island.userData.artistGroup;
    if (!group) return;
    group.visible = true;
    group.children.forEach((node, i) => {
      gsap.to(node.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.7,
        delay: 0.25 + i * 0.09,
        ease: 'back.out(2.2)',
      });
      setTimeout(() => node.userData.labelEl.classList.add('visible'), 380 + i * 90);
    });
  }

  clearFocus(immediate = false) {
    const island = this.focused;
    this.focused = null;
    if (!island) return;
    const group = island.userData.artistGroup;
    if (!group) return;
    group.children.forEach((node) => {
      node.userData.labelEl.classList.remove('visible');
      gsap.killTweensOf(node.scale);
      gsap.to(node.scale, {
        x: 0.001, y: 0.001, z: 0.001,
        duration: immediate ? 0.15 : 0.35,
        ease: 'power2.in',
      });
    });
    setTimeout(() => { if (this.focused !== island) group.visible = false; }, 420);
  }

  update(t, dt, camera) {
    this.time = t;
    this.sky.material.uniforms.uTime.value = t;
    this.dust.material.uniforms.uTime.value = t;
    this.column.userData.update(t);
    for (const m of this.ribbonMaterials ?? []) m.uniforms.uTime.value = t;

    for (const island of this.islands) {
      island.userData.update(t);
      // period labels fade with distance so the sky never clutters
      const d = camera.position.distanceTo(island.position);
      let opacity = THREE.MathUtils.clamp(1 - (d - 30) / 25, 0, 1);
      opacity *= 1 - island.userData.dim.value * 0.92;
      island.userData.labelEl.style.opacity = opacity.toFixed(3);
    }
  }
}
