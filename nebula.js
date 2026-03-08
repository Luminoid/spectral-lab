// Nebula Renderer — emission nebula with layered noise and pillar structures
// Physics: H-alpha (656nm red), [OIII] (501nm teal), [SII] (672nm deep red)
// Technique: ridged multi-fractal + domain warping for filamentary structure
// Rendering: layered gas emission with dust absorption, ACES tone mapping

function seededRngNebula(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function createNebulaNoise(seed) {
  const rng = seededRngNebula(seed);
  const size = 256;
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

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  function noise2d(x, y) {
    const xi = Math.floor(x) & (size - 1);
    const yi = Math.floor(y) & (size - 1);
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
      n = 1 - Math.abs(n); // fold to create ridges
      n = n * n * prev;    // sharpen and weight by previous
      val += amp * n;
      max += amp;
      prev = n;
      amp *= gain;
      freq *= 2.0;
    }
    return val / max;
  }

  // Domain warping for organic gas flow
  function warped(x, y, octaves, gain, strength) {
    const q0 = fbm(x + 0, y + 0, 3, gain);
    const q1 = fbm(x + 5.2, y + 1.3, 3, gain);
    const wx = x + strength * q0;
    const wy = y + strength * q1;
    return fbm(wx, wy, octaves, gain);
  }

  return { noise2d, fbm, ridged, warped };
}

// Palettes — scientifically calibrated emission line colors
// Emission lines and their true wavelengths:
//   Hα  656.3nm — deep red         [SII] 671.6nm — deep red (redder than Hα)
//   [NII] 658.4nm — deep red       [OIII] 500.7nm — green-cyan
//   Hβ  486.1nm — blue-cyan        [OII] 372.7nm — violet
// In true color, Hα/[NII]/[SII] are ALL red (654-673nm range)
// Dramatic multi-color images are FALSE COLOR (Hubble SHO remapping)
//
// offset: noise seed offset for independent spatial zones
// thresh: density threshold — lower = more extended, higher = core-only
const NEBULA_PALETTES = {
  emission: {
    // True color — Orion/Carina. Dominated by reds (Hα/[NII]/[SII])
    // with green-cyan [OIII] and blue Hβ accents in hot ionized zones
    species: [
      { color: [230, 12, 10],  weight: 1.0,  offset: 0,   thresh: 0.0 },  // Hα 656nm — deep red, most extended
      { color: [210, 8, 6],    weight: 0.7,  offset: 50,  thresh: 0.1 },  // [NII] 658nm — deep red, slightly different spatial zone
      { color: [200, 5, 3],    weight: 0.55, offset: 100, thresh: 0.15 }, // [SII] 672nm — deepest red, shock fronts
      { color: [20, 210, 160], weight: 0.6,  offset: 150, thresh: 0.12 }, // [OIII] 501nm — green-cyan, hot ionized zones
      { color: [30, 100, 220], weight: 0.3,  offset: 200, thresh: 0.25 }, // Hβ 486nm — blue-cyan, dense cores only
    ],
    dust: [35, 15, 8],
    bg: [10, 6, 18],
    core: [255, 220, 200],
  },
  hubble: {
    // Hubble Heritage SHO false-color: SII→Red, Hα→Green, [OIII]→Blue
    // This is the iconic "Pillars of Creation" color mapping
    species: [
      { color: [230, 40, 15],  weight: 1.0,  offset: 0,   thresh: 0.0 },  // SII→Red channel (shock/boundary gas)
      { color: [50, 220, 40],  weight: 0.85, offset: 80,  thresh: 0.05 }, // Hα→Green channel (most abundant)
      { color: [25, 60, 240],  weight: 0.7,  offset: 160, thresh: 0.1 },  // [OIII]→Blue channel (hot ionized)
      { color: [180, 130, 20], weight: 0.45, offset: 240, thresh: 0.2 },  // SII+Hα overlap → amber/gold
      { color: [40, 140, 140], weight: 0.3,  offset: 300, thresh: 0.18 }, // Hα+[OIII] overlap → teal
    ],
    dust: [15, 8, 3],
    bg: [6, 5, 14],
    core: [255, 245, 210],
  },
  reflection: {
    // Rayleigh scattering of starlight — bluer than source star
    // Real physics: I ∝ 1/λ⁴, so blue light scatters ~5.5× more than red
    // Warm infrared dust emission from heated grains
    species: [
      { color: [70, 120, 255],  weight: 1.0,  offset: 0,   thresh: 0.0 },  // Rayleigh-scattered blue
      { color: [100, 150, 240], weight: 0.7,  offset: 70,  thresh: 0.1 },  // Scattered blue-white
      { color: [140, 130, 220], weight: 0.45, offset: 140, thresh: 0.15 }, // UV fluorescence → violet
      { color: [90, 170, 230],  weight: 0.4,  offset: 210, thresh: 0.1 },  // Scattered cyan
      { color: [200, 150, 100], weight: 0.2,  offset: 280, thresh: 0.3 },  // Thermal dust (2000K blackbody)
    ],
    dust: [8, 8, 20],
    bg: [5, 5, 12],
    core: [210, 225, 255],
  },
  planetary: {
    // Planetary nebulae — very hot central star ionizes shells
    // [OIII] dominant (requires high excitation), Hα/[NII] in outer shell
    // Real examples: Ring Nebula, Cat's Eye, Helix
    species: [
      { color: [15, 220, 170],  weight: 1.0,  offset: 0,   thresh: 0.0 },  // [OIII] 501nm — dominant green-cyan
      { color: [220, 15, 15],   weight: 0.7,  offset: 90,  thresh: 0.1 },  // Hα 656nm — red outer shell
      { color: [200, 10, 10],   weight: 0.5,  offset: 180, thresh: 0.15 }, // [NII] 658nm — red, slightly different zone
      { color: [25, 90, 210],   weight: 0.4,  offset: 250, thresh: 0.2 },  // Hβ 486nm — blue in hot core
      { color: [10, 180, 130],  weight: 0.35, offset: 320, thresh: 0.25 }, // [OIII] 496nm — secondary green line
    ],
    dust: [12, 6, 10],
    bg: [8, 5, 12],
    core: [210, 255, 245],
  },
};

// Blackbody temperature to approximate RGB (Tanner Helland algorithm)
function starColor(rng) {
  const roll = rng();
  let temp;
  if (roll < 0.02) temp = 25000 + rng() * 20000;      // O/B hot blue
  else if (roll < 0.08) temp = 7500 + rng() * 2500;    // A white
  else if (roll < 0.15) temp = 6000 + rng() * 1500;    // F yellow-white
  else if (roll < 0.30) temp = 5200 + rng() * 800;     // G yellow
  else if (roll < 0.50) temp = 3700 + rng() * 1500;    // K orange
  else temp = 2500 + rng() * 1200;                      // M red

  const t = temp / 100;
  let r, g, b;
  if (t <= 66) r = 255; else r = Math.max(0, Math.min(255, 329.7 * Math.pow(t - 60, -0.1332)));
  if (t <= 66) g = Math.max(0, Math.min(255, 99.47 * Math.log(t) - 161.12));
  else g = Math.max(0, Math.min(255, 288.12 * Math.pow(t - 60, -0.0755)));
  if (t >= 66) b = 255; else if (t <= 19) b = 0;
  else b = Math.max(0, Math.min(255, 138.52 * Math.log(t - 10) - 305.04));

  return [r, g, b, temp];
}

function renderNebula(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  const {
    scale = 3.0,
    density = 60,
    turbulence = 6,
    starCount = 500,
    starBrightness = 80,
    palette = 'emission',
    hueShift = 0,
    contrast = 50,
    seed = 42,
  } = config;

  const rng = seededRngNebula(seed + 999);
  const pal = NEBULA_PALETTES[palette] || NEBULA_PALETTES.emission;
  const noiseMain = createNebulaNoise(seed);
  const noiseDetail = createNebulaNoise(seed + 137);
  const noiseDust = createNebulaNoise(seed + 271);
  // Per-species noise fields — each emission line has its own spatial distribution
  const speciesNoises = pal.species.map((sp) => createNebulaNoise(seed + 500 + sp.offset));
  const contrastPow = 0.6 + (contrast / 100) * 0.8; // gamma curve for contrast
  const warpStr = 1.5 + turbulence * 0.25;
  const densityThresh = 1.05 - density / 100; // higher density = lower threshold

  // Work at higher resolution for better detail
  const res = Math.min(W, 768);
  const imgData = ctx.createImageData(res, res);
  const data = imgData.data;

  // ACES filmic tone mapping
  const toneMap = (v) => {
    const a = v * (v + 0.0245786) - 0.000090537;
    const d = v * (0.983729 * v + 0.4329510) + 0.238081;
    return Math.max(0, Math.min(1, a / d));
  };

  // Hue rotation matrix coefficients (precompute once)
  const hRad = (hueShift * Math.PI) / 180;
  const cosH = Math.cos(hRad), sinH = Math.sin(hRad);

  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      const nx = (px / res) * scale;
      const ny = (py / res) * scale;

      // --- Layer 1: Large-scale gas structure (domain-warped fBM) ---
      // This defines where the nebula exists
      const gasBase = noiseMain.warped(nx, ny, turbulence, 0.5, warpStr);
      const gasNorm = gasBase * 0.5 + 0.5; // [0,1]

      // --- Layer 2: Filamentary ridges (ridged multi-fractal) ---
      // Creates pillar-like structures and bright edges
      const ridgeVal = noiseDetail.ridged(
        nx + gasBase * 0.8,  // slightly warped by gas flow
        ny + noiseMain.fbm(nx + 3, ny + 7, 3, 0.5) * 0.8,
        Math.max(3, turbulence - 1), 0.55
      );

      // --- Layer 3: Fine detail texture ---
      const detail = noiseDetail.fbm(nx * 2.5 + 20, ny * 2.5 + 20, 4, 0.45) * 0.5 + 0.5;

      // --- Combine into emission density ---
      // Gas provides the broad structure, ridges add filaments
      const combined = gasNorm * 0.65 + ridgeVal * 0.25 + detail * 0.1;
      const emission = Math.max(0, combined - densityThresh) / (1 - densityThresh);

      if (emission < 0.002) {
        // Background — no nebula here
        const idx = (py * res + px) * 4;
        data[idx] = pal.bg[0];
        data[idx + 1] = pal.bg[1];
        data[idx + 2] = pal.bg[2];
        data[idx + 3] = 255;
        continue;
      }

      // Apply contrast curve
      const shaped = Math.pow(emission, contrastPow);
      const ridgeMix = Math.min(1, ridgeVal * 1.5);

      // --- Multi-species color mixing ---
      // Each emission species has its own independent noise field
      // This creates spatially distinct color zones like real nebulae
      let r = 0, g = 0, b = 0;
      for (let si = 0; si < pal.species.length; si++) {
        const sp = pal.species[si];
        const spNoise = speciesNoises[si];

        // Each species samples its own warped noise for spatial distribution
        const spField = spNoise.warped(nx * 0.9, ny * 0.9, 4, 0.5, warpStr * 0.6);
        const spNorm = spField * 0.5 + 0.5;

        // Species-specific density: only appears where its noise is above threshold
        const spDensity = Math.max(0, spNorm - sp.thresh) / (1 - sp.thresh);
        // Modulated by overall emission envelope
        const spEmission = spDensity * shaped * sp.weight;

        r += (sp.color[0] / 255) * spEmission;
        g += (sp.color[1] / 255) * spEmission;
        b += (sp.color[2] / 255) * spEmission;
      }

      // Bright core glow on ridges — luminous ionization fronts
      const coreGlow = ridgeMix * shaped * 0.35;
      r += (pal.core[0] / 255) * coreGlow;
      g += (pal.core[1] / 255) * coreGlow;
      b += (pal.core[2] / 255) * coreGlow;

      // --- Dust absorption ---
      const dustRaw = noiseDust.fbm(nx * 0.8 + 10, ny * 0.8 + 7, 5, 0.5);
      const dustDensity = Math.max(0, dustRaw * 0.5 + 0.3);
      // Dust absorbs more at shorter wavelengths (ISM reddening)
      const tauBase = dustDensity * 2.5;
      r *= Math.exp(-tauBase * 0.7);   // red absorbed least
      g *= Math.exp(-tauBase * 1.0);
      b *= Math.exp(-tauBase * 1.3);   // blue absorbed most
      // Thermal dust re-emission (faint warm glow in dark lanes)
      const dustEmit = dustDensity * 0.03;
      r += (pal.dust[0] / 255) * dustEmit;
      g += (pal.dust[1] / 255) * dustEmit;

      // Background bleed
      r += pal.bg[0] / 255 * 0.03;
      g += pal.bg[1] / 255 * 0.03;
      b += pal.bg[2] / 255 * 0.05;

      // Hue rotation
      if (hueShift > 0) {
        const rr = r * (0.667 + 0.333 * cosH + 0.236 * sinH) +
                   g * (0.333 - 0.333 * cosH - 0.471 * sinH) +
                   b * (0.333 - 0.333 * cosH + 0.236 * sinH);
        const gg = r * (0.333 - 0.333 * cosH + 0.471 * sinH) +
                   g * (0.667 + 0.333 * cosH + 0.236 * sinH) +
                   b * (0.333 - 0.333 * cosH - 0.236 * sinH);
        const bb = r * (0.333 - 0.333 * cosH - 0.236 * sinH) +
                   g * (0.333 - 0.333 * cosH + 0.471 * sinH) +
                   b * (0.667 + 0.333 * cosH);
        r = rr; g = gg; b = bb;
      }

      // ACES tone mapping — preserves color richness in highlights
      r = toneMap(r * 1.8);
      g = toneMap(g * 1.8);
      b = toneMap(b * 1.8);

      const idx = (py * res + px) * 4;
      data[idx] = Math.min(255, r * 255) | 0;
      data[idx + 1] = Math.min(255, g * 255) | 0;
      data[idx + 2] = Math.min(255, b * 255) | 0;
      data[idx + 3] = 255;
    }
  }

  // Upscale nebula to canvas
  const tmp = document.createElement('canvas');
  tmp.width = res; tmp.height = res;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, W, H);

  // --- Stars with blackbody colors ---
  const sc = W / 2048;
  const starAlpha = starBrightness / 100;

  for (let i = 0; i < starCount; i++) {
    const x = rng() * W, y = rng() * H;
    const [sr, sg, sb] = starColor(rng);
    const brightness = starAlpha * (0.3 + rng() * 0.7);
    const baseR = (0.4 + rng() * 2) * sc;
    const isBright = rng() > 0.85;

    if (isBright) {
      // Soft glow halo
      const glowR = baseR * (8 + rng() * 10);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      grad.addColorStop(0, `rgba(255,255,255,${brightness * 0.8})`);
      grad.addColorStop(0.06, `rgba(255,252,248,${brightness * 0.6})`);
      grad.addColorStop(0.15, `rgba(${sr},${sg},${sb},${brightness * 0.3})`);
      grad.addColorStop(0.4, `rgba(${sr},${sg},${sb},${brightness * 0.06})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // 6-point diffraction spikes (JWST style)
      if (brightness > 0.4) {
        const spikeLen = glowR * (1.5 + brightness * 1.5);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let s = 0; s < 6; s++) {
          const angle = s * Math.PI / 3 + 0.15; // slight tilt
          const ex = Math.cos(angle) * spikeLen;
          const ey = Math.sin(angle) * spikeLen;
          const sGrad = ctx.createLinearGradient(x - ex, y - ey, x + ex, y + ey);
          sGrad.addColorStop(0, 'rgba(0,0,0,0)');
          sGrad.addColorStop(0.38, `rgba(${sr},${sg},${sb},${brightness * 0.06})`);
          sGrad.addColorStop(0.5, `rgba(255,252,248,${brightness * 0.15})`);
          sGrad.addColorStop(0.62, `rgba(${sr},${sg},${sb},${brightness * 0.06})`);
          sGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = sGrad;
          ctx.lineWidth = 0.5 * sc;
          ctx.beginPath();
          ctx.moveTo(x - ex, y - ey);
          ctx.lineTo(x + ex, y + ey);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Star core
    ctx.fillStyle = `rgba(${Math.min(255, sr + 50) | 0},${Math.min(255, sg + 50) | 0},${Math.min(255, sb + 50) | 0},${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft vignette
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.72);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  return { stars: starCount, palette };
}
