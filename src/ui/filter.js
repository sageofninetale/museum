import { gsap } from 'gsap';

// The timeline's filter: a gilded dropdown that swaps between Periods and
// Artists, with live search. Selecting flies the camera; filtering ghosts
// the islands that don't match.
export class FilterMenu {
  constructor(data, { onSelectPeriod, onSelectArtist, onClear }) {
    this.data = data;
    this.onSelectPeriod = onSelectPeriod;
    this.onSelectArtist = onSelectArtist;
    this.onClear = onClear;
    this.tab = 'periods';
    this.isOpen = false;
    this.#build();
  }

  #build() {
    this.root = document.createElement('div');
    this.root.id = 'filter';
    this.root.innerHTML = `
      <button class="filter-toggle">
        <span class="filter-label">The Ascent</span>
        <span class="filter-clear" title="Clear filter">×</span>
        <svg class="filter-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.2"/>
        </svg>
      </button>
      <div class="filter-panel">
        <div class="filter-tabs">
          <button data-tab="periods" class="active">Periods</button>
          <button data-tab="artists">Artists</button>
        </div>
        <div class="filter-search">
          <input type="text" placeholder="Search the masters…" spellcheck="false" />
        </div>
        <div class="filter-list"></div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.els = {
      toggle: this.root.querySelector('.filter-toggle'),
      label: this.root.querySelector('.filter-label'),
      clear: this.root.querySelector('.filter-clear'),
      chevron: this.root.querySelector('.filter-chevron'),
      panel: this.root.querySelector('.filter-panel'),
      tabs: [...this.root.querySelectorAll('.filter-tabs button')],
      search: this.root.querySelector('.filter-search'),
      input: this.root.querySelector('.filter-search input'),
      list: this.root.querySelector('.filter-list'),
    };

    this.els.toggle.addEventListener('click', (e) => {
      if (e.target === this.els.clear) return;
      this.isOpen ? this.close() : this.open();
    });

    this.els.clear.addEventListener('click', () => {
      this.setActiveLabel(null);
      this.onClear?.();
    });

    for (const tabBtn of this.els.tabs) {
      tabBtn.addEventListener('click', () => this.switchTab(tabBtn.dataset.tab));
    }

    this.els.input.addEventListener('input', () => this.#applySearch());

    // keep panel scrolling / clicks from steering the world below
    this.els.panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    window.addEventListener('pointerdown', (e) => {
      if (this.isOpen && !this.root.contains(e.target)) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  #rowsFor(tab) {
    if (tab === 'periods') {
      return (this.data.places ?? this.data.periods).map((p) => {
        const row = document.createElement('button');
        row.className = 'filter-row';
        row.innerHTML = `
          <span class="row-name">${p.name}</span>
          <span class="row-meta">${p.startYear} — ${p.endYear ?? 'present'}</span>
        `;
        row.addEventListener('click', () => {
          this.setActiveLabel(p.name);
          this.close();
          this.onSelectPeriod?.(p);
        });
        return row;
      });
    }
    return this.data.artists.map((a) => {
      const period = (this.data.places ?? this.data.periods).find((p) => p.id === a.periodId);
      const row = document.createElement('button');
      row.className = 'filter-row';
      row.dataset.search = a.name.toLowerCase();
      row.innerHTML = `
        <span class="row-name">${a.name}${a.hero ? ' <i class="row-star">✦</i>' : ''}</span>
        <span class="row-meta">${period?.name ?? ''}</span>
      `;
      row.addEventListener('click', () => {
        this.setActiveLabel(a.name);
        this.close();
        this.onSelectArtist?.(a);
      });
      return row;
    });
  }

  #populate(tab, animate = true) {
    const { list } = this.els;
    list.innerHTML = '';
    const rows = this.#rowsFor(tab);
    for (const row of rows) list.appendChild(row);
    this.els.search.style.display = tab === 'artists' ? '' : 'none';
    if (tab === 'artists') this.#applySearch();
    if (animate) {
      gsap.fromTo(
        rows.slice(0, 24),
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.022, ease: 'power2.out', clearProps: 'opacity,transform' }
      );
    }
  }

  #applySearch() {
    const q = this.els.input.value.trim().toLowerCase();
    for (const row of this.els.list.children) {
      row.style.display = !q || row.dataset.search?.includes(q) ? '' : 'none';
    }
  }

  switchTab(tab) {
    if (tab === this.tab) return;
    this.tab = tab;
    for (const b of this.els.tabs) b.classList.toggle('active', b.dataset.tab === tab);
    const oldRows = [...this.els.list.children].slice(0, 24);
    gsap.to(oldRows, {
      opacity: 0,
      y: -6,
      duration: 0.16,
      stagger: 0.01,
      ease: 'power1.in',
      onComplete: () => this.#populate(tab),
    });
  }

  open() {
    this.isOpen = true;
    const { panel, chevron } = this.els;
    panel.style.display = 'block';
    gsap.fromTo(
      panel,
      { opacity: 0, y: -10, scaleY: 0.94, transformOrigin: 'top right' },
      { opacity: 1, y: 0, scaleY: 1, duration: 0.4, ease: 'power3.out' }
    );
    gsap.to(chevron, { rotation: 180, duration: 0.3 });
    this.#populate(this.tab);
    if (this.tab === 'artists') this.els.input.focus();
  }

  close() {
    this.isOpen = false;
    const { panel, chevron } = this.els;
    gsap.to(panel, {
      opacity: 0,
      y: -8,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => { panel.style.display = 'none'; },
    });
    gsap.to(chevron, { rotation: 0, duration: 0.3 });
  }

  setActiveLabel(text) {
    this.els.label.textContent = text ?? 'The Ascent';
    this.root.classList.toggle('filtered', !!text);
  }
}
