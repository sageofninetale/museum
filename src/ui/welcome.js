import { gsap } from 'gsap';
import { waveify } from './waveText.js';

// the lobby: a simple, curated entry — three doors, then painters,
// then straight into a 3D gallery. The Ascent stays for wanderers.
const FEATURED = [
  'michelangelo',
  'leonardo-da-vinci',
  'raphael',
  'caravaggio',
  'johannes-vermeer',
  'rembrandt',
  'vincent-van-gogh',
  'titian',
  'sandro-botticelli',
  'diego-velazquez',
  'peter-paul-rubens',
  'paul-cezanne',
];

const INDIA_ORDER = [
  'raja-ravi-varma',
  'ajanta-painters',
  'amrita-sher-gil',
  'bichitr',
  'ustad-mansur',
  'abanindranath-tagore',
  'nihal-chand',
  'basawan',
  'govardhan',
  'nandalal-bose',
];

const EGYPT_ORDER = [
  'valley-of-the-kings-painters',
  'fayum-portrait-painters',
  'book-of-the-dead-illustrators',
  'old-kingdom-tomb-painters',
];

const WONDERS_ORDER = [
  'great-pyramid-of-giza',
  'hanging-gardens-of-babylon',
  'colossus-of-rhodes',
  'lighthouse-of-alexandria',
  'statue-of-zeus',
  'temple-of-artemis',
  'mausoleum-at-halicarnassus',
];

// negative years are BCE — collectives and wonders reach back before year 0
const fmtYear = (y) => (y == null || y === '' ? '' : y < 0 ? `${-y} BC` : `${y}`);

// Commons thumbnail for fast tile loading; falls back to the original
function thumb(url, width = 330) {
  const m = url?.match(/\/wikipedia\/commons\/(\w\/\w\w)\/(.+)$/);
  if (!m) return url;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${width}px-${m[2]}`;
}

// the lobby's living backdrop: a slow procession of the collection's
// most breathtaking works, resolved from the real gallery data
const BACKDROP_PICKS = [
  ['michelangelo', 'Creation of Adam', 'Michelangelo'],
  ['ajanta-painters', 'Padmapani', 'The Ajanta Painters'],
  ['johannes-vermeer', 'Pearl', 'Johannes Vermeer'],
  ['vincent-van-gogh', 'Starry', 'Vincent van Gogh'],
  ['raja-ravi-varma', 'Shakuntala', 'Raja Ravi Varma'],
  ['leonardo-da-vinci', 'Mona Lisa', 'Leonardo da Vinci'],
  ['caravaggio', 'Matthew', 'Caravaggio'],
  ['amrita-sher-gil', 'Ladies', 'Amrita Sher-Gil'],
  ['valley-of-the-kings-painters', 'Nefertari', 'Painters of the Valley of the Kings'],
];

export class WelcomeMenu {
  constructor(data, { isReady, onEnterArtist, onWander, onVisibility }) {
    this.data = data;
    this.isReady = isReady;
    this.onEnterArtist = onEnterArtist;
    this.onWander = onWander;
    this.onVisibility = onVisibility;
    this.#build();
  }

  #artistById(id) {
    return this.data.artists.find((a) => a.id === id);
  }

  #build() {
    this.root = document.createElement('div');
    this.root.id = 'welcome';
    this.root.innerHTML = `
      <div class="welcome-bg">
        <div class="bg-layer"></div>
        <div class="bg-layer"></div>
      </div>
      <div class="welcome-shade"></div>
      <canvas class="welcome-dust"></canvas>
      <p class="welcome-caption"></p>
      <div class="welcome-inner">
        <header class="welcome-head">
          <h1>Volta</h1>
          <p class="welcome-sub">Welcome to the museum</p>
          <p class="welcome-question">What would you like to see today?</p>
        </header>

        <div class="welcome-doors">
          <button class="welcome-door" data-door="masters">
            <span class="door-title">The Masters</span>
            <span class="door-sub">The most celebrated painters in history</span>
          </button>
          <button class="welcome-door" data-door="india">
            <span class="door-title">Art of India</span>
            <span class="door-sub">From the Ajanta caves to Sher-Gil</span>
          </button>
          <button class="welcome-door" data-door="egypt">
            <span class="door-title">Ancient Egypt</span>
            <span class="door-sub">From the pyramids to Cleopatra's Nile</span>
          </button>
          <button class="welcome-door" data-door="wonders">
            <span class="door-title">Seven Wonders</span>
            <span class="door-sub">The lost marvels of the ancient world</span>
          </button>
          <button class="welcome-door" data-door="all">
            <span class="door-title">All Painters</span>
            <span class="door-sub">The full collection, ancient to modern</span>
          </button>
        </div>

        <div class="welcome-artists">
          <button class="welcome-back">←&ensp;Back</button>
          <h2 class="welcome-list-title"></h2>
          <div class="welcome-grid"></div>
        </div>
      </div>

      <footer class="site-footer">Designed by <span class="wave-name"></span></footer>
    `;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
    waveify(this.root.querySelector('.wave-name'), 'Äryan');

    this.els = {
      head: this.root.querySelector('.welcome-head'),
      doors: this.root.querySelector('.welcome-doors'),
      artists: this.root.querySelector('.welcome-artists'),
      listTitle: this.root.querySelector('.welcome-list-title'),
      grid: this.root.querySelector('.welcome-grid'),
      bgLayers: [...this.root.querySelectorAll('.bg-layer')],
      caption: this.root.querySelector('.welcome-caption'),
      dust: this.root.querySelector('.welcome-dust'),
    };

    this.root.querySelectorAll('.welcome-door').forEach((door) => {
      door.addEventListener('click', () => this.#showArtists(door.dataset.door));
    });

    this.root.querySelector('.welcome-back').addEventListener('click', () => this.#showDoors());
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  get isOpen() {
    return this.root.style.display !== 'none';
  }

  // resolve the curated backdrop works from the real gallery files
  async #initBackdrop() {
    if (this._backdropInit) return;
    this._backdropInit = true;
    const slides = [];
    await Promise.all(
      BACKDROP_PICKS.map(async ([artistId, match, artistName]) => {
        try {
          const res = await fetch(`/data/paintings/${artistId}.json`);
          if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return;
          const { paintings } = await res.json();
          const p = match
            ? paintings.find((x) => x.title.toLowerCase().includes(match.toLowerCase()))
            : paintings[0];
          if (p) slides.push({ url: p.textureUrl ?? p.imageUrl, title: p.title, artistName });
        } catch { /* skip missing galleries */ }
      })
    );
    // keep the curated order
    this.slides = BACKDROP_PICKS
      .map(([, , name]) => slides.find((s) => s.artistName === name))
      .filter(Boolean);
    if (this.slides.length) {
      this._slide = 0;
      this.#showSlide(0, true);
    }
  }

  #showSlide(index, first = false) {
    const slide = this.slides[index % this.slides.length];
    const [a, b] = this.els.bgLayers;
    const incoming = this._front === a ? b : a;
    const outgoing = this._front === a ? a : b;
    const img = new Image();
    img.onload = () => {
      incoming.style.backgroundImage = `url("${slide.url}")`;
      incoming.classList.add('active');
      if (!first) outgoing.classList.remove('active');
      this._front = incoming;
      this.els.caption.textContent = `${slide.title}  ·  ${slide.artistName}`;
    };
    img.src = slide.url;
  }

  #startBackdrop() {
    this.#initBackdrop();
    if (this._slideTimer) return;
    this._slideTimer = setInterval(() => {
      if (!this.slides?.length) return;
      this._slide = (this._slide + 1) % this.slides.length;
      this.#showSlide(this._slide);
    }, 9000);
    this.#startDust();
  }

  #stopBackdrop() {
    clearInterval(this._slideTimer);
    this._slideTimer = null;
    cancelAnimationFrame(this._dustRaf);
    this._dustRaf = null;
  }

  #startDust() {
    const canvas = this.els.dust;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    size();
    if (!this._motes) {
      this._motes = Array.from({ length: 70 }, () => ({
        x: Math.random(), y: Math.random(),
        r: 0.6 + Math.random() * 1.7,
        s: 0.00016 + Math.random() * 0.0004,
        drift: Math.random() * Math.PI * 2,
        a: 0.12 + Math.random() * 0.4,
      }));
    }
    const tick = () => {
      if (!this.isOpen) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      for (const m of this._motes) {
        m.y -= m.s;
        m.drift += 0.004;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        const x = (m.x + Math.sin(m.drift) * 0.012) * w;
        ctx.beginPath();
        ctx.arc(x, m.y * h, m.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 198, 138, ${m.a})`;
        ctx.fill();
      }
      this._dustRaf = requestAnimationFrame(tick);
    };
    this._dustRaf = requestAnimationFrame(tick);
  }

  open() {
    this.root.style.display = '';
    this.onVisibility?.(true);
    this.#showDoors();
    this.#startBackdrop();
    // a single root fade — child tweens proved fragile in throttled tabs
    gsap.fromTo(this.root, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' });
    setTimeout(() => {
      gsap.killTweensOf(this.root);
      this.root.style.opacity = '1';
    }, 1100);
  }

  // instant hide, used once a gallery has taken the screen
  hide() {
    this.onVisibility?.(false);
    this.#stopBackdrop();
    gsap.killTweensOf(this.root);
    this.root.style.display = 'none';
  }

  #showDoors() {
    this.els.artists.style.display = 'none';
    this.els.doors.style.display = '';
    this.els.head.style.display = '';
  }

  async #showArtists(kind) {
    let artists, title;
    if (kind === 'masters') {
      title = 'The Masters';
      artists = FEATURED.map((id) => this.#artistById(id)).filter(Boolean);
    } else if (kind === 'india') {
      title = 'Art of India';
      artists = INDIA_ORDER.map((id) => this.#artistById(id)).filter(Boolean);
    } else if (kind === 'egypt') {
      title = 'Ancient Egypt';
      artists = EGYPT_ORDER.map((id) => this.#artistById(id)).filter(Boolean);
    } else if (kind === 'wonders') {
      title = 'Seven Wonders of the Ancient World';
      artists = WONDERS_ORDER.map((id) => this.#artistById(id)).filter(Boolean);
    } else {
      title = 'All Painters';
      artists = this.data.artists;
    }

    this.els.doors.style.display = 'none';
    this.els.head.style.display = 'none';
    this.els.artists.style.display = '';
    this.els.listTitle.textContent = title;

    const grid = this.els.grid;
    grid.innerHTML = '';
    const tiles = artists.map((artist) => {
      const tile = document.createElement('button');
      tile.className = 'welcome-tile pending';
      const life = artist.birthYear
        ? `${fmtYear(artist.birthYear)}–${fmtYear(artist.deathYear)}`
        : `${fmtYear(artist.activeStart)}–${fmtYear(artist.activeEnd)}`;
      tile.innerHTML = `
        <span class="tile-portrait">${artist.portraitUrl ? `<img src="${thumb(artist.portraitUrl)}" data-original="${artist.portraitUrl}" alt="" decoding="async" draggable="false" />` : ''}</span>
        <span class="tile-name">${artist.name}</span>
        <span class="tile-dates">${life}</span>
        <span class="tile-state">in preparation</span>
      `;
      tile.addEventListener('click', () => {
        if (tile.classList.contains('pending')) return;
        // the lobby stays visible beneath the transition; main hides it
        // once the gallery has taken over
        this.onEnterArtist?.(artist);
      });
      // if the thumb form 404s (rare), fall back to the original file
      const img = tile.querySelector('img');
      img?.addEventListener('error', () => {
        if (img.src !== img.dataset.original) img.src = img.dataset.original;
      }, { once: true });
      grid.appendChild(tile);

      // unlock the tile once its gallery data is confirmed on disk
      this.isReady(artist).then((ok) => {
        if (ok) tile.classList.remove('pending');
      });
      return tile;
    });

    gsap.fromTo(
      tiles,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.045, ease: 'power3.out', clearProps: 'transform' }
    );
  }
}
