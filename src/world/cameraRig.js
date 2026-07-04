import * as THREE from 'three';
import { gsap } from 'gsap';
import { LAYOUT } from './AscentWorld.js';

const GLIDE_RADIUS = 42;
const TRAIL_ANGLE = 0.55;

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.count = world.periodCount; // glide path spans the main helix only

    this.p = 0; // smoothed progress along the ascent, 0..1
    this.targetP = 0;
    this.enabled = true; // false while a cinematic (museum dive) owns the camera
    this.focusBlend = 0;
    this.focusTarget = null;
    this.pointer = new THREE.Vector2();

    this._glidePos = new THREE.Vector3();
    this._glideLook = new THREE.Vector3();
    this._focusPos = new THREE.Vector3();
    this._focusLook = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  progressOf(island) {
    // sister islands carry a fractional index at their true date
    const i = island.userData.progressIndex ?? island.userData.index;
    return THREE.MathUtils.clamp(i / (this.count - 1), 0, 1);
  }

  glidePose(p, outPos, outLook) {
    const i = p * (this.count - 1);
    const angle = i * LAYOUT.STEP - TRAIL_ANGLE;
    const y = i * LAYOUT.RISE + 7.5;
    outPos.set(Math.cos(angle) * GLIDE_RADIUS, y, Math.sin(angle) * GLIDE_RADIUS);

    // gaze rests on the current island; the column holds the left third
    const aCur = i * LAYOUT.STEP;
    const rCur = (LAYOUT.RADIUS + Math.sin(i * 1.7) * 2.5) * 0.92;
    outLook.set(Math.cos(aCur) * rCur, i * LAYOUT.RISE + 2.4, Math.sin(aCur) * rCur);
  }

  focusPose(island, outPos, outLook) {
    const p = island.position;
    const outward = Math.atan2(p.z, p.x);
    const islandR = Math.hypot(p.x, p.z);
    const a = outward + 0.3;
    const r = islandR + 13.5;
    outPos.set(Math.cos(a) * r, p.y + 6.8, Math.sin(a) * r);
    outLook.set(p.x, p.y + 1.1, p.z);
  }

  nudge(delta) {
    this.targetP = THREE.MathUtils.clamp(this.targetP + delta, 0, 1);
  }

  flyTo(island) {
    this.focusTarget = island;
    gsap.killTweensOf(this);
    gsap.to(this, {
      targetP: this.progressOf(island),
      focusBlend: 1,
      duration: 1.9,
      ease: 'power3.inOut',
    });
  }

  blur() {
    if (!this.focusTarget) return;
    const island = this.focusTarget;
    gsap.killTweensOf(this);
    gsap.to(this, {
      focusBlend: 0,
      duration: 0.9,
      ease: 'power2.out',
      onComplete: () => {
        if (this.focusTarget === island && this.focusBlend === 0) this.focusTarget = null;
      },
    });
  }

  get isFocused() {
    return this.focusBlend > 0.55 && !!this.focusTarget;
  }

  update(dt) {
    if (!this.enabled) return;
    this.p = THREE.MathUtils.damp(this.p, this.targetP, 3.4, dt);

    this.glidePose(this.p, this._glidePos, this._glideLook);
    this._pos.copy(this._glidePos);
    this._look.copy(this._glideLook);

    if (this.focusTarget) {
      this.focusPose(this.focusTarget, this._focusPos, this._focusLook);
      const b = THREE.MathUtils.smoothstep(this.focusBlend, 0, 1);
      this._pos.lerp(this._focusPos, b);
      this._look.lerp(this._focusLook, b);
    }

    // gentle hand-held parallax from the pointer
    const px = this.pointer.x, py = this.pointer.y;
    this._pos.y += py * 0.9;
    this._look.x += px * 2.4;
    this._look.y -= py * 2.2;

    if (!this._initialized) {
      this._initialized = true;
      this.camera.position.copy(this._pos);
    } else {
      this.camera.position.lerp(this._pos, 1 - Math.exp(-8 * dt));
    }
    this.camera.lookAt(this._look);
  }
}
