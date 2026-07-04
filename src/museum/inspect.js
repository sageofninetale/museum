import { gsap } from 'gsap';

// The painting inspect view: zoomed high-res look with title, year,
// story, and fun facts. Baseline interaction — pending user check-in.
export class InspectView {
  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.painting = null;
    this.#build();
  }

  #build() {
    this.root = document.createElement('div');
    this.root.id = 'inspect';
    this.root.innerHTML = `
      <div class="inspect-backdrop"></div>
      <figure class="inspect-fig">
        <img alt="" draggable="false" />
      </figure>
      <aside class="inspect-panel">
        <button class="inspect-close" aria-label="Close">×</button>
        <span class="inspect-eyebrow"></span>
        <h2 class="inspect-title"></h2>
        <p class="inspect-meta"></p>
        <hr class="inspect-rule" />
        <p class="inspect-story"></p>
        <ul class="inspect-facts"></ul>
        <div class="inspect-links">
          <a class="inspect-wiki" target="_blank" rel="noopener">Read on Wikipedia ↗</a>
          <a class="inspect-full" target="_blank" rel="noopener">Full resolution ↗</a>
        </div>
      </aside>
    `;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    this.els = {
      backdrop: this.root.querySelector('.inspect-backdrop'),
      fig: this.root.querySelector('.inspect-fig'),
      img: this.root.querySelector('.inspect-fig img'),
      panel: this.root.querySelector('.inspect-panel'),
      eyebrow: this.root.querySelector('.inspect-eyebrow'),
      title: this.root.querySelector('.inspect-title'),
      meta: this.root.querySelector('.inspect-meta'),
      story: this.root.querySelector('.inspect-story'),
      facts: this.root.querySelector('.inspect-facts'),
      wiki: this.root.querySelector('.inspect-wiki'),
      full: this.root.querySelector('.inspect-full'),
    };

    this.root.querySelector('.inspect-close').addEventListener('click', () => this.close());
    this.els.backdrop.addEventListener('click', () => this.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    // click the image to magnify around the cursor
    this.els.img.addEventListener('click', (e) => {
      const zoomed = this.els.fig.classList.toggle('zoomed');
      if (zoomed) {
        const r = this.els.img.getBoundingClientRect();
        const ox = ((e.clientX - r.left) / r.width) * 100;
        const oy = ((e.clientY - r.top) / r.height) * 100;
        this.els.img.style.transformOrigin = `${ox}% ${oy}%`;
      }
    });
  }

  get isOpen() {
    return this.root.style.display !== 'none';
  }

  open(painting, artistName = '') {
    this.painting = painting;
    const { els } = this;

    els.img.src = painting.textureUrl ?? painting.imageUrl;
    els.eyebrow.textContent = [artistName, painting.year].filter(Boolean).join('  ·  ');
    els.title.textContent = painting.title;
    els.meta.textContent = [painting.medium, painting.location].filter(Boolean).join('  ·  ');
    els.story.textContent = painting.story ?? '';
    els.facts.innerHTML = (painting.funFacts ?? [])
      .map((f) => `<li>${f}</li>`)
      .join('');
    els.wiki.href = painting.wikipediaUrl ?? '#';
    els.wiki.style.display = painting.wikipediaUrl ? '' : 'none';
    els.full.href = painting.imageUrl ?? painting.textureUrl;
    els.fig.classList.remove('zoomed');

    this.root.style.display = '';
    gsap.fromTo(els.backdrop, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    gsap.fromTo(
      els.fig,
      { opacity: 0, scale: 0.93 },
      { opacity: 1, scale: 1, duration: 0.6, ease: 'power3.out' }
    );
    gsap.fromTo(
      els.panel,
      { opacity: 0, x: 36 },
      { opacity: 1, x: 0, duration: 0.55, delay: 0.08, ease: 'power3.out' }
    );
  }

  close() {
    if (!this.isOpen) return;
    this.painting = null;
    gsap.to([this.els.backdrop, this.els.panel, this.els.fig], {
      opacity: 0,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: () => {
        this.root.style.display = 'none';
        this.onClose?.();
      },
    });
  }
}
