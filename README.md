# Volta — A Museum of Art History

An interactive 3D art museum that runs in the browser. Enter through a mystical, atmospheric floating-island world (inspired by the mood of Assassin's Creed Odyssey's "Fate of Atlantis") spanning art history from Medieval & Gothic through Contemporary, plus dedicated regions for Ancient Egypt, Art of India, and the Seven Wonders of the Ancient World.

Pick an artist to enter their own first-person, walkable 3D gallery hung with their real paintings — click any painting to inspect it up close with its title, year, story, and fun facts.

All artist bios, painting images, dates, and facts are sourced from Wikipedia and Wikimedia Commons.

## Stack
- [Three.js](https://threejs.org/) — 3D rendering
- [GSAP](https://gsap.com/) — animation
- [postprocessing](https://github.com/pmndrs/postprocessing) — visual effects
- [Vite](https://vitejs.dev/) — build tool

## Running locally

```bash
npm install
npm run dev
```

## Building for production

```bash
npm run build
```

Outputs a static site to `dist/` — deployable directly on [Vercel](https://vercel.com) with the Vite framework preset (no configuration needed).
