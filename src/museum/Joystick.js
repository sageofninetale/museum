// A self-contained virtual joystick: owns its own DOM and pointer capture,
// reports normalized { x: strafe, z: forward } to onMove, null on release.
export class Joystick {
  constructor({ onMove }) {
    this.onMove = onMove;
    this.radius = 46;
    this.pointerId = null;
    this.#build();
  }

  #build() {
    this.root = document.createElement('div');
    this.root.className = 'touch-joystick';
    this.root.innerHTML = `
      <div class="joystick-base">
        <div class="joystick-knob"></div>
      </div>
    `;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    this.base = this.root.querySelector('.joystick-base');
    this.knob = this.root.querySelector('.joystick-knob');

    this.base.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      try { this.base.setPointerCapture(e.pointerId); } catch { /* no real pointer session to capture */ }
      this.#updateFrom(e);
      e.preventDefault();
    });
    this.base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.#updateFrom(e);
    });
    const release = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.onMove?.(null);
    };
    this.base.addEventListener('pointerup', release);
    this.base.addEventListener('pointercancel', release);
  }

  #updateFrom(e) {
    const rect = this.base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const max = rect.width / 2;
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    const nx = dx / max;
    const ny = dy / max;
    // screen-down is positive dy; pushing the stick up should mean "forward"
    this.onMove?.({ x: nx, z: -ny });
  }

  show() {
    this.root.style.display = '';
  }

  hide() {
    this.root.style.display = 'none';
    this.pointerId = null;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }
}
