async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// Real data (written by the Wikipedia pipeline) is preferred; the placeholder
// files exist only so the world can boot before the pipeline finishes.
async function loadWithFallback(path, fallbackPath) {
  try {
    return await fetchJson(path);
  } catch {
    return fetchJson(fallbackPath);
  }
}

// Regional collections beyond the core Western periods — each is a JSON
// file shaped like { islands: [...period-like entries], artists: [...] }.
// Adding a new civilization (a lobby door + its own galleries) means adding
// one entry here plus a matching file in public/data/.
const REGIONS = [
  { key: 'india', file: 'india' },
  { key: 'egypt', file: 'egypt' },
  { key: 'wonders', file: 'wonders' },
];

export async function loadData() {
  const [periods, westernArtists, ...regionData] = await Promise.all([
    loadWithFallback('/data/periods.json', '/data/periods.placeholder.json'),
    loadWithFallback('/data/artists.json', '/data/artists.placeholder.json'),
    ...REGIONS.map((r) =>
      loadWithFallback(`/data/${r.file}.json`, `/data/${r.file}.placeholder.json`).catch(() => null)
    ),
  ]);

  const regions = Object.fromEntries(REGIONS.map((r, i) => [r.key, regionData[i]]));
  const regionIslands = regionData.flatMap((r) => r?.islands ?? []);
  const artists = [...westernArtists, ...regionData.flatMap((r) => r?.artists ?? [])];
  // "places" = everything an artist can belong to: the 15 helix periods
  // plus every region's sister islands (Art of India, Ancient Egypt, ...)
  const places = [...periods, ...regionIslands];

  const byPeriod = new Map();
  for (const place of places) byPeriod.set(place.id, []);
  for (const artist of artists) {
    if (byPeriod.has(artist.periodId)) byPeriod.get(artist.periodId).push(artist);
  }
  for (const list of byPeriod.values()) {
    list.sort((a, b) => (a.activeStart ?? 0) - (b.activeStart ?? 0));
  }

  return { periods, artists, byPeriod, regions, india: regions.india, places };
}
