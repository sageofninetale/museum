function hash3(x, y, z, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 43.13) * 43758.5453;
  return n - Math.floor(n);
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function valueNoise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

export function fbm3(x, y, z, seed = 0, octaves = 3) {
  let amp = 0.5, freq = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 7.31);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}
