import { gsap } from 'gsap';

// Museum-placard artist card. Exemplar design — pending user check-in
// before the style is finalized and applied everywhere.
export class ArtistCard {
  constructor({ onEnterMuseum, checkAvailability } = {}) {
    this.onEnterMuseum = onEnterMuseum;
    this.checkAvailability = checkAvailability;
    this.artist = null;
    this.#build();
  }

  #build() {
    this.root = document.createElement('div');
    this.root.id = 'artist-card';
    this.root.innerHTML = `
      <div class="card-backdrop"></div>
      <article class="placard">
        <button class="placard-close" aria-label="Close">×</button>
        <div class="placard-portrait"><img alt="" draggable="false" /></div>
        <div class="placard-body">
          <span class="placard-period"></span>
          <h2 class="placard-name"></h2>
          <p class="placard-dates"></p>
          <hr class="placard-rule" />
          <p class="placard-bio"></p>
          <p class="placard-why"></p>
          <button class="placard-enter">Enter the Gallery<span>→</span></button>
        </div>
      </article>
    `;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    this.els = {
      backdrop: this.root.querySelector('.card-backdrop'),
      placard: this.root.querySelector('.placard'),
      img: this.root.querySelector('.placard-portrait img'),
      portrait: this.root.querySelector('.placard-portrait'),
      period: this.root.querySelector('.placard-period'),
      name: this.root.querySelector('.placard-name'),
      dates: this.root.querySelector('.placard-dates'),
      bio: this.root.querySelector('.placard-bio'),
      why: this.root.querySelector('.placard-why'),
      enter: this.root.querySelector('.placard-enter'),
    };

    this.root.querySelector('.placard-close').addEventListener('click', () => this.close());
    this.els.backdrop.addEventListener('click', () => this.close());
    this.els.enter.addEventListener('click', () => {
      if (this.artist && this.onEnterMuseum) this.onEnterMuseum(this.artist);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    // keep the 3D world's scroll navigation from firing underneath
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  get isOpen() {
    return this.root.style.display !== 'none';
  }

  // temporary button message, e.g. when a gallery's data isn't ready yet
  flashEnterLabel(text) {
    const btn = this.els.enter;
    if (btn.dataset.flashing) return;
    btn.dataset.flashing = '1';
    const original = btn.innerHTML;
    btn.innerHTML = text;
    setTimeout(() => {
      btn.innerHTML = original;
      delete btn.dataset.flashing;
    }, 2200);
  }

  open(artist, periodName = '') {
    this.artist = artist;
    const { els } = this;

    els.placard.classList.toggle('hero', !!artist.hero);
    els.period.textContent = periodName;
    els.name.textContent = artist.name;
    const life = artist.birthYear
      ? artist.deathYear
        ? `${artist.birthYear} — ${artist.deathYear}`
        : `b. ${artist.birthYear}`
      : '';
    els.dates.textContent = [life, artist.nationality].filter(Boolean).join('  ·  ');
    els.bio.textContent = artist.bio || '';
    els.why.textContent = artist.whyTheyMatter || '';

    if (artist.portraitUrl) {
      els.img.src = artist.portraitUrl;
      els.portrait.style.display = '';
    } else {
      els.img.removeAttribute('src');
      els.portrait.style.display = 'none';
    }

    // reflect whether this artist's gallery data has arrived yet
    const btn = els.enter;
    btn.disabled = false;
    btn.classList.remove('unavailable');
    btn.innerHTML = 'Enter the Gallery<span>→</span>';
    if (this.checkAvailability) {
      this.checkAvailability(artist).then((ok) => {
        if (this.artist !== artist || ok) return;
        btn.disabled = true;
        btn.classList.add('unavailable');
        btn.innerHTML = 'Gallery in preparation…';
      });
    }

    this.root.style.display = '';
    gsap.fromTo(this.els.backdrop, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power1.out' });
    gsap.fromTo(
      this.els.placard,
      { opacity: 0, y: 26, scale: 0.985 },
      { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: 'power3.out' }
    );
  }

  close() {
    if (!this.isOpen) return;
    this.artist = null;
    gsap.to(this.els.backdrop, { opacity: 0, duration: 0.35 });
    gsap.to(this.els.placard, {
      opacity: 0, y: 14, duration: 0.35, ease: 'power2.in',
      onComplete: () => { this.root.style.display = 'none'; },
    });
  }
}
