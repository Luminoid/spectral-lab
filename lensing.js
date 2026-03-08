// Gravitational Lensing Renderer — inverse ray-tracing through a point-mass lens
// Physics: Einstein's deflection α = θ_E² / θ, lens equation β = θ - θ_E²/θ
// For each output pixel, trace backward through the lens to find the source pixel

// Cached upscale canvas — avoids creating a new canvas element per render
let _lensingTmpCanvas = null;
let _lensingTmpSize = 0;

function getLensingTmpCanvas(size) {
  if (!_lensingTmpCanvas || _lensingTmpSize !== size) {
    _lensingTmpCanvas = document.createElement('canvas');
    _lensingTmpCanvas.width = size;
    _lensingTmpCanvas.height = size;
    _lensingTmpSize = size;
  }
  return _lensingTmpCanvas;
}

// seededRng and hslToRgb provided by noise.js

// --- Source galaxy: small elliptical blob with Sérsic-like profile ---
function createSourceGalaxy(rng, cx, cy, size, hue, brightness) {
  const axisRatio = 0.4 + rng() * 0.5;
  const angle = rng() * Math.PI;
  const n = 1 + rng() * 2; // Sérsic index
  return { cx, cy, size, hue, brightness, axisRatio, angle, n };
}

function sampleGalaxy(gal, x, y) {
  // Rotate into galaxy frame
  const dx = x - gal.cx, dy = y - gal.cy;
  const c = Math.cos(gal.angle), s = Math.sin(gal.angle);
  const gx = dx * c + dy * s;
  const gy = (-dx * s + dy * c) / gal.axisRatio;
  const r = Math.hypot(gx, gy) / gal.size;
  if (r > 4) return null;
  // Sérsic profile: I(r) = I_e · exp(-b_n · (r^(1/n) - 1))
  const bn = 1.9992 * gal.n - 0.3271;
  const intensity = gal.brightness * Math.exp(-bn * (Math.pow(r + 0.01, 1 / gal.n) - 1));
  if (intensity < 0.001) return null;
  return { intensity, hue: gal.hue };
}

function renderLensing(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const cx = W / 2, cy = H / 2;

  const {
    mass = 80,
    sourceX = 30,
    sourceY = -20,
    sourceSize = 30,
    einsteinRadius = 200,
    ringBrightness = 80,
    starCount = 300,
    distortion = 1.0,
    showGrid = false,
    colorShift = 0,
    seed = 42,
  } = config;

  const sc = W / 2048;
  const rng = seededRng(seed);
  const eR = einsteinRadius * sc * (mass / 50);
  const softening = 2 * sc; // prevent singularity at center

  // Create source plane — background galaxies and stars
  // Source galaxies positioned relative to lens center
  const srcGalaxies = [];
  // Main source (user-controlled position)
  srcGalaxies.push(createSourceGalaxy(
    rng, sourceX * sc, sourceY * sc, sourceSize * sc,
    (210 + colorShift) % 360, (ringBrightness / 100) * 1.2,
  ));
  // Additional background sources for richer field
  const bgRng = seededRng(seed + 100);
  for (let i = 0; i < 5; i++) {
    const gx = (bgRng() - 0.5) * W * 0.6;
    const gy = (bgRng() - 0.5) * H * 0.6;
    const gs = (10 + bgRng() * 25) * sc;
    const gh = (180 + bgRng() * 120 + colorShift) % 360;
    const gb = 0.3 + bgRng() * 0.5;
    srcGalaxies.push(createSourceGalaxy(bgRng, gx, gy, gs, gh, gb));
  }

  // Background star field (in source plane)
  const bgStars = [];
  const starRng = seededRng(seed + 200);
  for (let i = 0; i < starCount; i++) {
    bgStars.push({
      x: (starRng() - 0.5) * W * 1.2,
      y: (starRng() - 0.5) * H * 1.2,
      b: 0.2 + starRng() * 0.6,
      r: (1.5 + starRng() * 3.0) * sc,
    });
  }

  // Spatial grid for fast star proximity checks
  const gridCellSize = 30 * sc;
  const gridExtent = W * 0.6;
  const gridCols = Math.ceil(2 * gridExtent / gridCellSize) + 1;
  const starGrid = new Array(gridCols * gridCols);
  for (let i = 0; i < starGrid.length; i++) starGrid[i] = [];
  for (const star of bgStars) {
    const gx = Math.floor((star.x + gridExtent) / gridCellSize);
    const gy = Math.floor((star.y + gridExtent) / gridCellSize);
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridCols) {
      starGrid[gy * gridCols + gx].push(star);
    }
  }

  // --- Inverse ray-trace: for each pixel, map back through lens equation ---
  // Work at reduced resolution for performance, then upscale
  const res = Math.min(W, 1024);
  const step = W / res;
  const buf = new Float32Array(res * res * 3);

  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      // Image plane position relative to lens center
      const theta_x = (px * step + step / 2 - cx);
      const theta_y = (py * step + step / 2 - cy);
      const theta2 = theta_x * theta_x + theta_y * theta_y + softening * softening;

      // Lens equation: β = θ - θ_E² · θ / |θ|²
      // (deflection is radial, toward lens center)
      const deflect = (eR * eR) / theta2 * distortion;
      const beta_x = theta_x - deflect * theta_x;
      const beta_y = theta_y - deflect * theta_y;

      // Sample source plane at β
      let r = 0, g = 0, b = 0;

      // Check source galaxies
      for (const gal of srcGalaxies) {
        const sample = sampleGalaxy(gal, beta_x, beta_y);
        if (sample) {
          const h = sample.hue;
          const s = 0.7;
          const l = Math.min(0.95, sample.intensity * 0.6);
          const [cr, cg, cb] = hslToRgb(h / 360, s, l);
          r += cr * sample.intensity;
          g += cg * sample.intensity;
          b += cb * sample.intensity;
        }
      }

      // Background stars — spatial grid lookup in source plane
      const sgx = Math.floor((beta_x + gridExtent) / gridCellSize);
      const sgy = Math.floor((beta_y + gridExtent) / gridCellSize);
      for (let gdy = -1; gdy <= 1; gdy++) {
        const gyi = sgy + gdy;
        if (gyi < 0 || gyi >= gridCols) continue;
        for (let gdx = -1; gdx <= 1; gdx++) {
          const gxi = sgx + gdx;
          if (gxi < 0 || gxi >= gridCols) continue;
          const cell = starGrid[gyi * gridCols + gxi];
          for (let si = 0; si < cell.length; si++) {
            const star = cell[si];
            const sdx = beta_x - star.x, sdy = beta_y - star.y;
            const cutoff = star.r * 3;
            const d2 = sdx * sdx + sdy * sdy;
            if (d2 < cutoff * cutoff) {
              const intensity = star.b * Math.exp(-d2 / (star.r * star.r * 0.5));
              r += intensity * 0.8;
              g += intensity * 0.8;
              b += intensity * 0.85;
            }
          }
        }
      }

      const idx = (py * res + px) * 3;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
    }
  }

  // Convert buffer to ImageData at working resolution, then GPU-upscale
  const resImg = ctx.createImageData(res, res);
  const resData = resImg.data;
  for (let i = 0; i < res * res; i++) {
    const bi = i * 3, pi = i * 4;
    resData[pi] = Math.min(255, (buf[bi] + 0.008) * 255);
    resData[pi + 1] = Math.min(255, (buf[bi + 1] + 0.006) * 255);
    resData[pi + 2] = Math.min(255, (buf[bi + 2] + 0.015) * 255);
    resData[pi + 3] = 255;
  }
  const tmp = getLensingTmpCanvas(res);
  tmp.getContext('2d').putImageData(resImg, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(tmp, 0, 0, W, H);

  // --- Overlay: foreground lens galaxy (warm elliptical) ---
  const lensR = eR * 0.25;
  const lensGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, lensR);
  lensGrad.addColorStop(0, 'rgba(255,210,140,0.85)');
  lensGrad.addColorStop(0.3, 'rgba(220,170,110,0.6)');
  lensGrad.addColorStop(0.7, 'rgba(180,130,80,0.2)');
  lensGrad.addColorStop(1, 'rgba(120,80,50,0)');
  ctx.fillStyle = lensGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, lensR, lensR * 0.8, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Distortion grid overlay
  if (showGrid) {
    ctx.strokeStyle = 'rgba(60,80,120,0.25)';
    ctx.lineWidth = 1 * sc;
    const gridStep = 80 * sc;
    const halfW = W / 2, halfH = H / 2;
    // Vertical lines (distorted)
    for (let gx = -halfW; gx <= halfW; gx += gridStep) {
      ctx.beginPath();
      for (let gy = -halfH; gy <= halfH; gy += 4 * sc) {
        const theta2g = gx * gx + gy * gy + softening * softening;
        const def = (eR * eR) / theta2g * distortion;
        const nx = cx + gx + def * gx * 0.08;
        const ny = cy + gy + def * gy * 0.08;
        if (gy === -halfH) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
    // Horizontal lines
    for (let gy = -halfH; gy <= halfH; gy += gridStep) {
      ctx.beginPath();
      for (let gx = -halfW; gx <= halfW; gx += 4 * sc) {
        const theta2g = gx * gx + gy * gy + softening * softening;
        const def = (eR * eR) / theta2g * distortion;
        const nx = cx + gx + def * gx * 0.08;
        const ny = cy + gy + def * gy * 0.08;
        if (gx === -halfW) ctx.moveTo(nx, ny);
        else ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
  }

  // Vignette
  const vigGrad = ctx.createRadialGradient(cx, cy, W * 0.28, cx, cy, W * 0.72);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  const srcDist = Math.hypot(sourceX, sourceY) * sc;
  const alignment = Math.max(0, Math.round((1 - srcDist / (eR * 2)) * 100));
  return { einsteinRadius: Math.round(eR / sc), alignment };
}

