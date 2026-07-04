import * as THREE from 'three';
import { gsap } from 'gsap';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  SMAAEffect,
} from 'postprocessing';
import { loadData } from './data/loader.js';
import { AscentWorld } from './world/AscentWorld.js';
import { CameraRig } from './world/cameraRig.js';
import { ArtistCard } from './ui/artistCard.js';
import { FilterMenu } from './ui/filter.js';
import { WelcomeMenu } from './ui/welcome.js';
import { MuseumScene } from './museum/MuseumScene.js';
import { WalkControls } from './museum/WalkControls.js';
import { Joystick } from './museum/Joystick.js';
import { InspectView } from './museum/inspect.js';

// primary input, not just capability — a laptop with a touchscreen still
// has a fine-pointer primary input and should keep mouse/keyboard controls.
// ?touch=1 forces touch mode for testing on desktop.
const isTouchDevice =
  matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  stencil: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(0, 6, 60);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

function makeComposer(scene, cam, { bloomIntensity, bloomThreshold, vignette }) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, cam));
  const effects = [
    new BloomEffect({
      intensity: bloomIntensity,
      luminanceThreshold: bloomThreshold,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
      radius: 0.8,
    }),
    new VignetteEffect({ offset: 0.26, darkness: vignette }),
  ];
  try {
    effects.push(new SMAAEffect());
  } catch (e) {
    console.warn('SMAA unavailable, continuing without it', e);
  }
  composer.addPass(new EffectPass(cam, ...effects));
  composer.setSize(window.innerWidth, window.innerHeight);
  return composer;
}

init().catch((err) => {
  console.error('Failed to start Volta:', err);
  const veilText = document.querySelector('#veil p');
  if (veilText) veilText.textContent = 'something went wrong — see console';
});

async function init() {
  const data = await loadData();
  const world = new AscentWorld(data);
  const rig = new CameraRig(camera, world);
  const inspect = new InspectView({
    onClose: () => {
      if (mode === 'museum') {
        walk.frozen = false;
        showWalkOverlay();
      }
    },
  });

  // gallery data arrives incrementally from the Wikipedia pipeline —
  // cache hits, but re-check misses so galleries unlock as files land.
  // (Vite's SPA fallback answers missing files with 200 + index.html,
  // so a real content-type check is required.)
  const paintingsCache = new Map();
  async function fetchPaintings(artistId) {
    if (paintingsCache.has(artistId)) return paintingsCache.get(artistId);
    try {
      const res = await fetch(`/data/paintings/${artistId}.json`);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('json')) return null;
      const data = await res.json();
      if (!data.paintings?.length) return null;
      paintingsCache.set(artistId, data.paintings);
      return data.paintings;
    } catch {
      return null;
    }
  }

  const card = new ArtistCard({
    onEnterMuseum: (artist) => enterMuseum(artist),
    checkAvailability: async (artist) => !!(await fetchPaintings(artist.id)),
  });

  // the lobby: curated doors straight into the galleries
  // the lobby IS the home screen — the timeline world stays dormant behind it
  const welcome = new WelcomeMenu(data, {
    isReady: async (artist) => !!(await fetchPaintings(artist.id)),
    onEnterArtist: (artist) => enterMuseum(artist, { dive: false }),
    onVisibility: (visible) => {
      document.getElementById('labels').style.visibility = visible ? 'hidden' : '';
    },
  });

  const periodNameOf = (artist) =>
    data.places.find((p) => p.id === artist.periodId)?.name ?? '';

  const islandOfPeriod = (periodId) =>
    world.islands.find((i) => i.userData.period.id === periodId);

  const filter = new FilterMenu(data, {
    onSelectPeriod: (period) => {
      const island = islandOfPeriod(period.id);
      if (!island) return;
      world.setPeriodFilter(period.id);
      world.focusIsland(island);
      rig.flyTo(island);
    },
    onSelectArtist: (artist) => {
      const island = islandOfPeriod(artist.periodId);
      if (!island) return;
      world.setPeriodFilter(null);
      world.focusIsland(island);
      rig.flyTo(island);
      gsap.delayedCall(1.7, () => {
        if (world.focused === island) card.open(artist, periodNameOf(artist));
      });
    },
    onClear: () => world.setPeriodFilter(null),
  });

  const worldComposer = makeComposer(world.scene, camera, {
    bloomIntensity: 0.9,
    bloomThreshold: 0.72,
    vignette: 0.5,
  });

  // ---- museum state ----
  let mode = 'world';
  let museum = null;
  let walk = null;
  let museumComposer = null;
  let suppressPause = false; // true during the inspect glide, before the overlay opens

  const hud = document.getElementById('museum-hud');
  const hudArtist = hud.querySelector('.hud-artist h2');
  const hudArtistDates = hud.querySelector('.hud-artist span');
  const walkOverlay = document.getElementById('walk-overlay');
  const walkTitle = walkOverlay.querySelector('h2');
  const walkInstructions = walkOverlay.querySelector('p');
  if (isTouchDevice) {
    walkInstructions.innerHTML =
      'Drag to look around&ensp;·&ensp;Joystick to walk<br />Tap a painting to inspect';
    walkOverlay.querySelector('.walk-enter').textContent = 'Step Inside';
  }
  const joystick = isTouchDevice ? new Joystick({ onMove: (v) => walk?.setJoystick(v) }) : null;
  const transition = document.getElementById('transition');
  const labelsEl = document.getElementById('labels');
  const hint = document.getElementById('hint');
  const masthead = document.getElementById('masthead');

  function showWalkOverlay() {
    walkOverlay.style.display = 'flex';
    hud.classList.remove('walking');
    joystick?.hide();
  }

  function hideWalkOverlay() {
    walkOverlay.style.display = 'none';
    hud.classList.add('walking');
    joystick?.show();
  }

  walkOverlay.querySelector('.walk-enter').addEventListener('click', () => walk?.lock());
  walkOverlay.querySelector('.walk-leave').addEventListener('click', () => exitMuseum());
  hud.querySelector('.hud-return').addEventListener('click', () => exitMuseum());

  const fadeTo = (opacity, duration, ease) =>
    new Promise((resolve) => {
      gsap.to(transition, { opacity, duration, ease, onComplete: resolve });
      // rAF throttling safety: never let a transition strand the user
      setTimeout(resolve, duration * 1000 + 400);
    });

  // check-in #3 pick B: plunge toward the island's stele, gold light engulfs
  function diveIntoLight(island) {
    return new Promise((resolve) => {
      rig.enabled = false;
      const gem = island.position.clone().add(new THREE.Vector3(0, 3.6, 0));
      const look = {
        v: camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(12).add(camera.position),
      };
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(camera.position, {
        x: gem.x, y: gem.y, z: gem.z,
        duration: 2.1,
        ease: 'power2.in',
      }, 0);
      tl.to(look.v, {
        x: gem.x, y: gem.y, z: gem.z,
        duration: 1.4,
        ease: 'power1.inOut',
        onUpdate: () => camera.lookAt(look.v),
      }, 0);
      tl.to(transition, { opacity: 1, duration: 0.85, ease: 'power2.in' }, 1.25);
      // rAF-throttle safety
      setTimeout(resolve, 2600);
    });
  }

  async function enterMuseum(artist, { dive = true } = {}) {
    if (mode !== 'world') return;
    const paintings = await fetchPaintings(artist.id);
    if (!paintings) {
      card.flashEnterLabel('Gallery in preparation…');
      return;
    }

    card.close();
    const island = islandOfPeriod(artist.periodId);
    if (island && dive) {
      await diveIntoLight(island);
    } else {
      await fadeTo(1, 0.8, 'power2.in');
    }
    welcome.hide();
    world.clearFocus();

    museum = new MuseumScene({ artist, paintings, renderer });
    walk = new WalkControls(museum.camera, renderer.domElement, museum.bounds, { touch: isTouchDevice });
    walk.onLock(() => {
      walk.frozen = false;
      hideWalkOverlay();
    });
    walk.onUnlock(() => {
      if (!inspect.isOpen && !suppressPause) showWalkOverlay();
    });
    museumComposer = makeComposer(museum.scene, museum.camera, {
      bloomIntensity: 0.42,
      bloomThreshold: 0.85,
      vignette: 0.42,
    });

    hudArtist.textContent = artist.name;
    hudArtistDates.textContent = periodNameOf(artist);
    walkTitle.textContent = `The ${artist.name} Gallery`;

    labelsEl.style.display = 'none';
    filter.root.style.display = 'none';
    hint.style.display = 'none';
    masthead.style.display = 'none';
    hud.style.display = 'block';
    showWalkOverlay();

    mode = 'museum';
    await fadeTo(0, 1.1, 'power2.out');
  }

  async function exitMuseum() {
    if (mode !== 'museum') return;
    await fadeTo(1, 0.7, 'power2.in');

    walk?.unlock();
    walk?.dispose();
    museumComposer?.dispose();
    museum?.dispose();
    museum = walk = museumComposer = null;

    hud.style.display = 'none';
    walkOverlay.style.display = 'none';
    joystick?.hide();

    // hand the camera back to the rig, snapped to its glide pose
    rig.enabled = true;
    rig._initialized = false;

    mode = 'world';
    welcome.open(); // home is the lobby, not the timeline world
    await fadeTo(0, 1.0, 'power2.out');
  }

  // ---- sizing ----
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    worldComposer.setSize(w, h);
    labelRenderer.setSize(w, h);
    museum?.resize();
    museumComposer?.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- input ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = null;

  window.addEventListener(
    'wheel',
    (e) => {
      if (mode !== 'world' || card.isOpen || welcome.isOpen) return;
      if (rig.isFocused) {
        world.clearFocus();
        rig.blur();
      }
      rig.nudge(e.deltaY * 0.00016);
      hint.classList.add('faded');
    },
    { passive: true }
  );

  window.addEventListener('keydown', (e) => {
    if (mode !== 'world' || card.isOpen || welcome.isOpen) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') rig.nudge(0.035);
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') rig.nudge(-0.035);
  });

  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'world') return;
    rig.pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      (e.clientY / window.innerHeight) * 2 - 1
    );

    if (downAt && e.buttons === 1) {
      rig.nudge(e.movementY * 0.0006);
      if (Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 8) {
        hint.classList.add('faded');
      }
    }

    ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(world.clickTargets, false);
    canvas.style.cursor = hits.length ? 'pointer' : 'grab';
  });

  // museum: click/tap-to-inspect from the crosshair while walking.
  // check-in #3 pick C: glide up to the canvas, then crossfade to the overlay
  function attemptInspect() {
    if (!walk?.locked || inspect.isOpen || walk.frozen) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), museum.camera);
    const hits = raycaster.intersectObjects(museum.clickTargets, false);
    const hit = hits.find((h) => h.object.userData.painting);
    if (!hit || hit.distance > 14) return;

    const painting = hit.object.userData.painting;
    walk.frozen = true;
    suppressPause = true;
    walk.unlock();
    joystick?.hide();

    const center = new THREE.Vector3();
    hit.object.getWorldPosition(center);
    const normal = new THREE.Vector3();
    hit.object.getWorldDirection(normal);
    if (normal.dot(museum.camera.position.clone().sub(center)) < 0) normal.negate();

    const params = hit.object.geometry.parameters ?? {};
    const pw = params.width ?? 2, ph = params.height ?? 2;
    const standoff = Math.max(ph, pw / museum.camera.aspect) * 0.82 + 0.75;
    const dest = center.clone().add(normal.multiplyScalar(standoff));
    dest.y = THREE.MathUtils.clamp(dest.y, 1.35, museum.H - 1.2);

    const look = { v: museum.camera.getWorldDirection(new THREE.Vector3()).add(museum.camera.position) };
    const open = () => {
      suppressPause = false;
      inspect.open(painting, museum.artist.name);
    };
    gsap.timeline({ onComplete: open })
      .to(museum.camera.position, {
        x: dest.x, y: dest.y, z: dest.z,
        duration: 0.95,
        ease: 'power3.inOut',
      }, 0)
      .to(look.v, {
        x: center.x, y: center.y, z: center.z,
        duration: 0.95,
        ease: 'power3.inOut',
        onUpdate: () => museum.camera.lookAt(look.v),
      }, 0);
    // rAF-throttle safety: never strand the glide without its overlay
    setTimeout(() => { if (suppressPause) open(); }, 1400);
  }

  // touch: drag anywhere on the canvas to look around; a short tap inspects.
  // (desktop look-around comes from raw mousemove while pointer-locked, which
  // needs no drag tracking — this path only exists for touch.)
  let lookPointerId = null;
  let lookLast = null;
  let lookDistance = 0;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || mode !== 'museum' || !walk?.locked || lookPointerId !== null) return;
    lookPointerId = e.pointerId;
    lookLast = { x: e.clientX, y: e.clientY };
    lookDistance = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* no real pointer session to capture */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookPointerId) return;
    const dx = e.clientX - lookLast.x;
    const dy = e.clientY - lookLast.y;
    lookLast = { x: e.clientX, y: e.clientY };
    lookDistance += Math.abs(dx) + Math.abs(dy);
    walk?.lookBy(dx, dy);
  });

  const releaseLook = (e) => {
    if (e.pointerId !== lookPointerId) return;
    const tapped = lookDistance < 10;
    lookPointerId = null;
    lookLast = null;
    if (tapped) attemptInspect();
  };
  canvas.addEventListener('pointerup', releaseLook);
  canvas.addEventListener('pointercancel', releaseLook);

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return; // handled by the look/tap listeners above

    if (mode === 'museum') {
      attemptInspect();
      return;
    }

    if (!downAt) return;
    const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
    downAt = null;
    if (moved > 8 || card.isOpen) return;

    ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(world.clickTargets, false);
    if (!hits.length) return;

    const obj = hits[0].object;
    if (obj.userData.artist) {
      card.open(obj.userData.artist, periodNameOf(obj.userData.artist));
    } else if (obj.userData.island) {
      const island = obj.userData.island;
      world.focusIsland(island);
      rig.flyTo(island);
      hint.classList.add('faded');
    }
  });

  // ---- loop ----
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (mode === 'world') {
      // the lobby covers the world entirely — don't burn GPU behind it
      if (welcome.isOpen) return;
      rig.update(dt);
      world.update(t, dt, camera);
      worldComposer.render(dt);
      labelRenderer.render(world.scene, camera);
    } else if (museum) {
      walk.update(dt);
      museum.update(t, dt);
      museumComposer.render(dt);
    }
  });

  // ---- reveal ----
  const veil = document.getElementById('veil');
  gsap.to(veil, {
    opacity: 0,
    duration: 1.6,
    delay: 0.3,
    ease: 'power2.inOut',
    onComplete: () => veil.remove(),
  });
  // rAF can be throttled in hidden/occluded tabs, which stalls the tween —
  // make sure the veil never outstays its welcome
  setTimeout(() => { if (veil.isConnected) veil.remove(); }, 2600);

  // opening drift: rise gently into the first island
  rig.p = -0.018;

  // the lobby is the home screen; timeline-world UI stays retired
  filter.root.style.display = 'none';
  hint.style.display = 'none';
  masthead.style.display = 'none'; // the lobby carries the brand now
  welcome.open();

  // debug handle for live tuning during development
  window.__volta = {
    rig, world, camera, renderer, card, filter, gsap, inspect, welcome,
    enterMuseum, exitMuseum,
    get museum() { return museum; },
    get walk() { return walk; },
  };
}
