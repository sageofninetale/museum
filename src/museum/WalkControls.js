import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import * as THREE from 'three';

const EYE_HEIGHT = 1.7;
const TOUCH_LOOK_SENSITIVITY = 0.0032;
const TOUCH_SPEED = 3.0;
const PITCH_LIMIT = Math.PI / 2 - 0.06;

const UP = new THREE.Vector3(0, 1, 0);

// Desktop uses PointerLockControls (real mouse look + lock). Touch devices
// have neither a mouse nor a usable Pointer Lock API, so they get their own
// yaw/pitch camera driven by drag deltas, plus a virtual joystick for motion.
export class WalkControls {
  constructor(camera, domElement, bounds, { touch = false } = {}) {
    this.camera = camera;
    this.bounds = bounds;
    this.touch = touch;
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.frozen = false;
    this._lockCbs = [];
    this._unlockCbs = [];

    if (touch) {
      this._touchActive = false;
      this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
      this._joy = null; // { x: strafe, z: forward }, both -1..1
    } else {
      this.plc = new PointerLockControls(camera, domElement);
      this.plc.addEventListener('lock', () => this._fireLock());
      this.plc.addEventListener('unlock', () => this._fireUnlock());
      this._onKeyDown = (e) => this.keys.add(e.code);
      this._onKeyUp = (e) => this.keys.delete(e.code);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
    }
  }

  get locked() {
    return this.touch ? this._touchActive : this.plc.isLocked;
  }

  lock() {
    if (this.touch) this._enterTouch();
    else this.plc.lock();
  }

  unlock() {
    if (this.touch) this._exitTouch();
    else this.plc.unlock();
  }

  onLock(fn) {
    this._lockCbs.push(fn);
  }

  onUnlock(fn) {
    this._unlockCbs.push(fn);
  }

  _fireLock() {
    for (const fn of this._lockCbs) fn();
  }

  _fireUnlock() {
    for (const fn of this._unlockCbs) fn();
  }

  _enterTouch() {
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._touchActive = true;
    this._fireLock();
  }

  _exitTouch() {
    this._touchActive = false;
    this._joy = null;
    this.velocity.set(0, 0, 0);
    this._fireUnlock();
  }

  // dx/dy: raw screen-pixel deltas since the last drag event
  lookBy(dx, dy) {
    if (!this.touch) return;
    this._euler.y -= dx * TOUCH_LOOK_SENSITIVITY;
    this._euler.x -= dy * TOUCH_LOOK_SENSITIVITY;
    this._euler.x = THREE.MathUtils.clamp(this._euler.x, -PITCH_LIMIT, PITCH_LIMIT);
  }

  // vec: { x: strafe, z: forward } normalized to the joystick's unit circle, or null
  setJoystick(vec) {
    this._joy = vec;
  }

  update(dt) {
    if (this.touch) {
      this._updateTouch(dt);
      return;
    }
    const k = this.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');

    const speed = sprint ? 5.2 : 3.0;
    const target = new THREE.Vector3(strafe, 0, forward);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(speed);

    // smooth accelerate / decelerate
    const damp = 1 - Math.exp(-9 * dt);
    this.velocity.lerp(target, damp);

    if (this.locked) {
      this.plc.moveRight(this.velocity.x * dt);
      this.plc.moveForward(this.velocity.z * dt);
    }
    this._applyBounds();
  }

  _updateTouch(dt) {
    const j = this._joy;
    const target = j ? new THREE.Vector3(j.x, 0, j.z).multiplyScalar(TOUCH_SPEED) : new THREE.Vector3();
    const damp = 1 - Math.exp(-9 * dt);
    this.velocity.lerp(target, damp);

    if (this.locked) {
      this.camera.quaternion.setFromEuler(this._euler);
      if (this.velocity.lengthSq() > 0.0001) {
        const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this._euler.y);
        const right = new THREE.Vector3().crossVectors(dir, UP);
        this.camera.position.addScaledVector(dir, this.velocity.z * dt);
        this.camera.position.addScaledVector(right, this.velocity.x * dt);
      }
    }
    this._applyBounds();
  }

  _applyBounds() {
    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, this.bounds.minX, this.bounds.maxX);
    p.z = THREE.MathUtils.clamp(p.z, this.bounds.minZ, this.bounds.maxZ);
    p.y = EYE_HEIGHT;
  }

  dispose() {
    if (!this.touch) {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      this.plc.dispose?.();
    }
  }
}
