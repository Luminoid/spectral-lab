// Topographic Contour Renderer — cartographic contour lines with hillshading
// Based on USGS/Swiss cartographic traditions (Eduard Imhof principles)
// Terrain: fBM + ridged noise, contours via marching squares, Imhof-style hillshading

function seededRngTopo(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// --- Gradient noise (Perlin-style) with permutation table ---
function createNoiseField(seed) {
  const rng = seededRngTopo(seed);
  const size = 256;
  const perm = new Uint8Array(size * 2);
  for (let i = 0; i < size; i++) perm[i] = i;
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
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

  return {
    // Standard fBM
    fbm(x, y, octaves, persistence) {
      let val = 0, amp = 1, freq = 1, max = 0;
      for (let o = 0; o < octaves; o++) {
        val += noise2d(x * freq, y * freq) * amp;
        max += amp;
        amp *= persistence;
        freq *= 2.0; // lacunarity
      }
      return (val / max + 1) * 0.5;
    },
    // Ridged noise for mountain ridges: 1 - |noise| creates sharp peaks
    ridged(x, y, octaves, persistence) {
      let val = 0, amp = 1, freq = 1, weight = 1;
      for (let o = 0; o < octaves; o++) {
        let signal = noise2d(x * freq, y * freq);
        signal = 1.0 - Math.abs(signal);
        signal *= signal;
        signal *= weight;
        weight = Math.min(1, Math.max(0, signal * 2));
        val += signal * amp;
        freq *= 2.0;
        amp *= persistence;
      }
      return Math.min(1, Math.max(0, val * 0.5));
    },
  };
}

// --- Color palettes (Swiss/USGS/Imhof traditions) ---
const TOPO_PALETTES = {
  swiss: [
    [0.00, [68, 105, 141]],   // deep water
    [0.08, [119, 163, 194]],  // shallow water
    [0.15, [172, 208, 165]],  // lowland green
    [0.30, [204, 219, 175]],  // sage
    [0.45, [222, 214, 163]],  // warm tan
    [0.60, [212, 185, 152]],  // sandy brown
    [0.75, [195, 167, 142]],  // highland brown
    [0.90, [188, 175, 169]],  // cool gray
    [1.00, [232, 228, 223]],  // snow
  ],
  ocean: [
    [0.00, [10, 30, 60]],
    [0.20, [18, 55, 100]],
    [0.40, [30, 85, 140]],
    [0.60, [50, 130, 180]],
    [0.80, [100, 180, 210]],
    [1.00, [160, 215, 230]],
  ],
  earth: [
    [0.00, [35, 60, 55]],
    [0.15, [55, 90, 75]],
    [0.30, [95, 125, 95]],
    [0.50, [160, 155, 120]],
    [0.70, [190, 165, 130]],
    [0.85, [175, 145, 120]],
    [1.00, [215, 205, 195]],
  ],
  mono: [
    [0.00, [20, 40, 55]],
    [0.25, [55, 95, 125]],
    [0.50, [80, 130, 160]],
    [0.75, [120, 165, 190]],
    [1.00, [210, 225, 232]],
  ],
};

function samplePalette(palette, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < palette.length; i++) {
    if (t <= palette[i][0]) {
      const [t0, c0] = palette[i - 1];
      const [t1, c1] = palette[i];
      const f = (t - t0) / (t1 - t0);
      // Smoothstep interpolation for softer bands
      const sf = f * f * (3 - 2 * f);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * sf),
        Math.round(c0[1] + (c1[1] - c0[1]) * sf),
        Math.round(c0[2] + (c1[2] - c0[2]) * sf),
      ];
    }
  }
  return [...palette[palette.length - 1][1]];
}

function renderTopographic(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  const {
    contourCount = 20,
    lineWidth = 1.5,
    palette = 'swiss',
    scale = 3.0,
    offsetX = 0,
    offsetY = 0,
    octaves = 6,
    fillBands = true,
    showLines = true,
    seed = 42,
  } = config;

  const sc = W / 2048;
  const noise = createNoiseField(seed);
  const noise2 = createNoiseField(seed + 137);

  // Generate height map at working resolution
  const res = Math.min(W, 512);
  const step = W / res;
  const heightMap = new Float64Array(res * res);

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const nx = (x / res) * scale + offsetX;
      const ny = (y / res) * scale + offsetY;
      // Blend standard fBM with ridged noise for realistic terrain
      const base = noise.fbm(nx, ny, octaves, 0.5);
      const ridge = noise.ridged(nx, ny, Math.max(2, octaves - 1), 0.5);
      // Domain warp for organic feel
      const wx = nx + noise2.fbm(nx * 0.5, ny * 0.5, 3, 0.5) * 0.8;
      const wy = ny + noise2.fbm(nx * 0.5 + 5.2, ny * 0.5 + 1.3, 3, 0.5) * 0.8;
      const warped = noise.fbm(wx, wy, octaves, 0.5);
      // Mountain mask: ridges appear more at higher elevations
      const mountainMask = base * base;
      heightMap[y * res + x] = warped * 0.5 + ridge * mountainMask * 0.4 + base * 0.1;
    }
  }

  // Normalize heightmap
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    if (heightMap[i] < hMin) hMin = heightMap[i];
    if (heightMap[i] > hMax) hMax = heightMap[i];
  }
  const hRange = hMax - hMin || 1;
  for (let i = 0; i < heightMap.length; i++) {
    heightMap[i] = (heightMap[i] - hMin) / hRange;
  }

  // --- Hillshading (NW illumination, 315°, altitude 45°) ---
  const hillshade = new Float64Array(res * res);
  const azimuth = 315 * Math.PI / 180;
  const altitude = 45 * Math.PI / 180;
  const zFactor = 2.5;

  for (let y = 1; y < res - 1; y++) {
    for (let x = 1; x < res - 1; x++) {
      // Horn's method (3x3 kernel)
      const a = heightMap[(y - 1) * res + (x - 1)];
      const b = heightMap[(y - 1) * res + x];
      const c2 = heightMap[(y - 1) * res + (x + 1)];
      const d = heightMap[y * res + (x - 1)];
      const f = heightMap[y * res + (x + 1)];
      const g = heightMap[(y + 1) * res + (x - 1)];
      const h = heightMap[(y + 1) * res + x];
      const ii = heightMap[(y + 1) * res + (x + 1)];

      const dzdx = ((c2 + 2 * f + ii) - (a + 2 * d + g)) / 8.0 * zFactor;
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c2)) / 8.0 * zFactor;

      const slopeAngle = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);

      hillshade[y * res + x] =
        Math.cos(altitude) * Math.cos(slopeAngle) +
        Math.sin(altitude) * Math.sin(slopeAngle) * Math.cos(azimuth - aspect);
    }
  }

  // --- Render filled bands with hillshading ---
  const pal = TOPO_PALETTES[palette] || TOPO_PALETTES.swiss;

  const imgData = ctx.createImageData(res, res);
  const data = imgData.data;

  // Imhof shadow/highlight colors
  const shadowR = 50, shadowG = 45, shadowB = 70;  // purple-blue shadow
  const highR = 255, highG = 248, highB = 230;      // warm white highlight

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const idx = y * res + x;
      const h2 = heightMap[idx];
      const shade = Math.max(0, Math.min(1, hillshade[idx]));

      let r, g, b;
      if (fillBands) {
        // Quantize to contour bands
        const band = Math.floor(h2 * contourCount) / contourCount;
        [r, g, b] = samplePalette(pal, band);
      } else {
        r = 10; g = 10; b = 15;
      }

      // Imhof-style hillshading blend
      if (shade > 0.5) {
        const t = (shade - 0.5) * 2 * 0.3;
        r = r + (highR - r) * t;
        g = g + (highG - g) * t;
        b = b + (highB - b) * t;
      } else {
        const t = (0.5 - shade) * 2 * 0.45;
        r = r + (shadowR - r) * t;
        g = g + (shadowG - g) * t;
        b = b + (shadowB - b) * t;
      }

      const pidx = idx * 4;
      data[pidx] = Math.max(0, Math.min(255, r));
      data[pidx + 1] = Math.max(0, Math.min(255, g));
      data[pidx + 2] = Math.max(0, Math.min(255, b));
      data[pidx + 3] = 255;
    }
  }

  // Draw to canvas via temp upscale
  const tmp = document.createElement('canvas');
  tmp.width = res; tmp.height = res;
  tmp.getContext('2d').putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, W, H);

  // --- Contour lines via marching squares (single-pass collection) ---
  if (showLines) {
    const contourColor = fillBands ? [120, 80, 50] : null; // sepia brown

    // Single-pass: iterate grid once, collect segments per contour level
    const contourSegs = new Array(contourCount);
    for (let c = 0; c < contourCount; c++) contourSegs[c] = [];

    for (let y = 0; y < res - 1; y++) {
      for (let x = 0; x < res - 1; x++) {
        const v00 = heightMap[y * res + x];
        const v10 = heightMap[y * res + x + 1];
        const v01 = heightMap[(y + 1) * res + x];
        const v11 = heightMap[(y + 1) * res + x + 1];

        // Only process contour levels that cross this cell
        const minV = Math.min(v00, v10, v01, v11);
        const maxV = Math.max(v00, v10, v01, v11);
        const minC = Math.max(1, Math.ceil(minV * contourCount));
        const maxC = Math.min(contourCount - 1, Math.floor(maxV * contourCount));
        if (minC > maxC) continue;

        const px = x * step, py = y * step;

        for (let c = minC; c <= maxC; c++) {
          const threshold = c / contourCount;
          const b00 = v00 >= threshold ? 1 : 0;
          const b10 = v10 >= threshold ? 1 : 0;
          const b01 = v01 >= threshold ? 1 : 0;
          const b11 = v11 >= threshold ? 1 : 0;
          const ci = b00 | (b10 << 1) | (b01 << 2) | (b11 << 3);
          if (ci === 0 || ci === 15) continue;

          const interpT = (a2, b2) => a2 === b2 ? 0.5 : (threshold - a2) / (b2 - a2);
          const tx = px + interpT(v00, v10) * step, ty = py;
          const lx = px, ly = py + interpT(v00, v01) * step;
          const rx = px + step, ry = py + interpT(v10, v11) * step;
          const bx = px + interpT(v01, v11) * step, by = py + step;
          const segs = contourSegs[c];

          switch (ci) {
            case 1: case 14: segs.push(tx, ty, lx, ly); break;
            case 2: case 13: segs.push(tx, ty, rx, ry); break;
            case 3: case 12: segs.push(lx, ly, rx, ry); break;
            case 4: case 11: segs.push(lx, ly, bx, by); break;
            case 5: case 10: segs.push(tx, ty, bx, by); break;
            case 6: { // Saddle (TR=1, BL=1 diagonal)
              const center = (v00 + v10 + v01 + v11) * 0.25;
              if (center >= threshold) { segs.push(tx, ty, rx, ry); segs.push(lx, ly, bx, by); }
              else { segs.push(tx, ty, lx, ly); segs.push(rx, ry, bx, by); }
              break;
            }
            case 7: case 8: segs.push(rx, ry, bx, by); break;
            case 9: { // Saddle (TL=1, BR=1 diagonal)
              const center = (v00 + v10 + v01 + v11) * 0.25;
              if (center >= threshold) { segs.push(tx, ty, lx, ly); segs.push(rx, ry, bx, by); }
              else { segs.push(tx, ty, rx, ry); segs.push(lx, ly, bx, by); }
              break;
            }
          }
        }
      }
    }

    // Draw collected segments per contour level
    for (let c = 1; c < contourCount; c++) {
      const segs = contourSegs[c];
      if (segs.length === 0) continue;

      const isIndex = c % 5 === 0;
      const lw = (isIndex ? lineWidth * 2.2 : lineWidth) * sc;

      if (contourColor) {
        const alpha = isIndex ? 0.7 : 0.35;
        ctx.strokeStyle = `rgba(${contourColor[0]},${contourColor[1]},${contourColor[2]},${alpha})`;
      } else {
        const [cr, cg, cb] = samplePalette(pal, c / contourCount);
        const alpha = isIndex ? 0.85 : 0.45;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      }
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';

      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(segs[i], segs[i + 1]);
        ctx.lineTo(segs[i + 2], segs[i + 3]);
      }
      ctx.stroke();
    }
  }

  return { contours: contourCount, scale: scale.toFixed(1) };
}
