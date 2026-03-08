// Shared utilities for Spectral Lab generators
// Seeded PRNG (POSIX LCG), Gaussian noise, and gradient noise (Perlin-style)

// --- Seeded PRNG (POSIX LCG: multiplier 1103515245, increment 12345) ---
function seededRng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// --- Box-Muller Gaussian noise ---
function gaussianNoise(rng) {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
}

// --- Gradient noise (Perlin-style) with configurable permutation table ---
// size: permutation table size (128 or 256)
// Returns: { noise2d, fbm, ridged, warped }
function createNoise(seed, size = 256) {
  const rng = seededRng(seed);
  const perm = new Uint8Array(size * 2);
  for (let i = 0; i < size; i++) perm[i] = i;
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < size; i++) perm[size + i] = perm[i];

  const gradX = new Float64Array(size);
  const gradY = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const a = rng() * Math.PI * 2;
    gradX[i] = Math.cos(a);
    gradY[i] = Math.sin(a);
  }

  const mask = size - 1;

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  function noise2d(x, y) {
    const xi = Math.floor(x) & mask;
    const yi = Math.floor(y) & mask;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const g00 = gradX[aa] * xf + gradY[aa] * yf;
    const g10 = gradX[ba] * (xf - 1) + gradY[ba] * yf;
    const g01 = gradX[ab] * xf + gradY[ab] * (yf - 1);
    const g11 = gradX[bb] * (xf - 1) + gradY[bb] * (yf - 1);
    return (g00 + u * (g10 - g00)) + v * ((g01 + u * (g11 - g01)) - (g00 + u * (g10 - g00)));
  }

  function fbm(x, y, octaves, gain = 0.5) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      val += amp * noise2d(x * freq, y * freq);
      max += amp;
      amp *= gain;
      freq *= 2.0;
    }
    return val / max;
  }

  // Ridged multi-fractal — creates sharp ridges and filaments
  function ridged(x, y, octaves, gain = 0.5) {
    let val = 0, amp = 1, freq = 1, max = 0, prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = noise2d(x * freq, y * freq);
      n = 1 - Math.abs(n);
      n = n * n * prev;
      val += amp * n;
      max += amp;
      prev = n;
      amp *= gain;
      freq *= 2.0;
    }
    return val / max;
  }

  // Domain warping for organic flow
  function warped(x, y, octaves, gain, strength) {
    const q0 = fbm(x + 0, y + 0, 3, gain);
    const q1 = fbm(x + 5.2, y + 1.3, 3, gain);
    const wx = x + strength * q0;
    const wy = y + strength * q1;
    return fbm(wx, wy, octaves, gain);
  }

  return { noise2d, fbm, ridged, warped };
}

// --- Blackbody temperature to approximate RGB (Tanner Helland algorithm) ---
function tempToRGB(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) r = 255; else r = Math.max(0, Math.min(255, 329.7 * Math.pow(t - 60, -0.1332)));
  if (t <= 66) g = Math.max(0, Math.min(255, 99.47 * Math.log(t) - 161.12));
  else g = Math.max(0, Math.min(255, 288.12 * Math.pow(t - 60, -0.0755)));
  if (t >= 66) b = 255; else if (t <= 19) b = 0;
  else b = Math.max(0, Math.min(255, 138.52 * Math.log(t - 10) - 305.04));
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// --- HSL to RGB [0-1] ---
function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}
