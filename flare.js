// Solar Flare Renderer — photosphere, chromosphere, corona, prominences
// Physics: limb darkening I(θ)/I(0) = 1 - u(1-cosθ), blackbody colors,
// granulation (convection cells), coronal streamers, magnetic field prominences
// Reference: SDO/AIA 304Å, SOHO LASCO C2, Swedish Solar Telescope

function seededRngFlare(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Blackbody temperature to sRGB (Tanner Helland approximation)
function tempToRGB(T) {
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; } else { r = Math.max(0, Math.min(255, 329.7 * Math.pow(t - 60, -0.1332))); }
  if (t <= 66) { g = Math.max(0, Math.min(255, 99.47 * Math.log(t) - 161.12)); }
  else { g = Math.max(0, Math.min(255, 288.12 * Math.pow(t - 60, -0.0755))); }
  if (t >= 66) { b = 255; } else if (t <= 19) { b = 0; }
  else { b = Math.max(0, Math.min(255, 138.52 * Math.log(t - 10) - 305.04)); }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// Simple 2D noise for granulation texture
function createFlareNoise(seed) {
  const rng = seededRngFlare(seed);
  const size = 128;
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

  function fbm(x, y, octaves) {
    let val = 0, amp = 0.5, freq = 1, max = 0;
    for (let o = 0; o < octaves; o++) {
      val += amp * noise2d(x * freq, y * freq);
      max += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return val / max;
  }

  return { noise2d, fbm };
}

function renderFlare(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const cx = W / 2, cy = H / 2;

  const {
    starRadius = 180,
    flareCount = 8,
    flareLength = 200,
    flareWidth = 15,
    turbulence = 50,
    coronaSize = 80,
    temperature = 5778,
    prominence = 50,
    chromosphere = true,
    seed = 42,
  } = config;

  const sc = W / 2048;
  const rng = seededRngFlare(seed);
  const sR = starRadius * sc;
  const granNoise = createFlareNoise(seed + 500);

  // Blackbody colors for the star
  const photoColor = tempToRGB(temperature);
  const umbraColor = tempToRGB(Math.max(2000, temperature * 0.6));
  const penumbraColor = tempToRGB(Math.max(2500, temperature * 0.78));

  // --- Background ---
  ctx.fillStyle = '#010105';
  ctx.fillRect(0, 0, W, H);

  // Background stars
  for (let i = 0; i < 200; i++) {
    const x = rng() * W, y = rng() * H;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < sR * 2.5) continue;
    const bv = 8 + rng() * 20;
    ctx.fillStyle = `rgba(${bv},${bv},${bv + 3},0.5)`;
    ctx.fillRect(x, y, sc, sc);
  }

  // --- Corona (pearly white K-corona + F-corona streamers) ---
  const coronaR = sR * (2.5 + coronaSize / 30);

  // K-corona: smooth, broad glow (electron-scattered photospheric light)
  for (let layer = 7; layer >= 0; layer--) {
    const r = coronaR * (0.3 + layer * 0.15);
    const alpha = 0.02 + (7 - layer) * 0.006;
    const grad = ctx.createRadialGradient(cx, cy, sR, cx, cy, r);
    grad.addColorStop(0, `rgba(255,255,248,${alpha})`);
    grad.addColorStop(0.3, `rgba(255,250,238,${alpha * 0.5})`);
    grad.addColorStop(0.7, `rgba(220,215,200,${alpha * 0.12})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Streamer structure — concentrated near equatorial belt (like real corona)
  const streamerCount = 50 + Math.floor(rng() * 30);
  for (let i = 0; i < streamerCount; i++) {
    const baseAngle = rng() * Math.PI * 2;
    // Streamers concentrate near equator (angle ~0, π)
    const equatorialBias = Math.cos(baseAngle * 2);
    const lengthMult = 0.3 + Math.abs(equatorialBias) * 0.9;
    const length = coronaR * lengthMult;
    const width = (2 + rng() * 4) * sc;

    // Coherent wobble using harmonics
    const wobblePhase = rng() * Math.PI * 2;
    const wobbleFreq = 1.5 + rng() * 3;
    const wobbleAmp = (4 + rng() * 10) * sc;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(baseAngle) * sR, cy + Math.sin(baseAngle) * sR);
    const segments = 40;
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const r = sR + length * t;
      const brightness = 1 / (1 + t * t * 5);
      const wobble = Math.sin(t * Math.PI * wobbleFreq + wobblePhase) * wobbleAmp * t;
      const perpAngle = baseAngle + Math.PI / 2;
      const x = cx + Math.cos(baseAngle) * r + Math.cos(perpAngle) * wobble;
      const y = cy + Math.sin(baseAngle) * r + Math.sin(perpAngle) * wobble;
      ctx.lineTo(x, y);
    }
    const ca = (0.015 + rng() * 0.03) * lengthMult;
    ctx.strokeStyle = `rgba(255,255,245,${ca})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // --- Prominences (magnetic arch structures) ---
  for (let f = 0; f < flareCount; f++) {
    const baseAngle = rng() * Math.PI * 2;
    const fLen = flareLength * sc * (0.4 + rng() * 1.2);
    const fWid = flareWidth * sc * (0.4 + rng() * 1.0);
    const turb = turbulence / 100;

    // Coherent noise harmonics for organic curves
    const nFreqs = 3 + Math.floor(rng() * 3);
    const noiseCoeffsX = [], noiseCoeffsY = [];
    for (let n = 0; n < nFreqs; n++) {
      const freq = 1 + n * (0.8 + rng() * 1.5);
      const phase = rng() * Math.PI * 2;
      const amp = turb * fLen * (0.15 / (1 + n * 0.7));
      noiseCoeffsX.push({ freq, phase, amp });
      noiseCoeffsY.push({ freq, phase: rng() * Math.PI * 2, amp: amp * 0.5 });
    }

    const arcPoints = [];
    const pointCount = 50;
    for (let p = 0; p <= pointCount; p++) {
      const t = p / pointCount;
      const height = Math.sin(t * Math.PI) * fLen;
      const lateral = (t - 0.5) * fWid * 2.5;
      let tx = 0, ty = 0;
      for (let n = 0; n < nFreqs; n++) {
        tx += noiseCoeffsX[n].amp * Math.sin(t * Math.PI * noiseCoeffsX[n].freq + noiseCoeffsX[n].phase);
        ty += noiseCoeffsY[n].amp * Math.sin(t * Math.PI * noiseCoeffsY[n].freq + noiseCoeffsY[n].phase);
      }
      const taper = Math.sin(t * Math.PI);
      tx *= taper;
      ty *= taper;
      const r = sR + height + ty;
      const angleOff = (lateral + tx) / sR;
      const a = baseAngle + angleOff;
      arcPoints.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, t });
    }

    // Broad glow under each prominence (plasma emission)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let glowLayer = 2; glowLayer >= 0; glowLayer--) {
      const glowW = (fWid * 1.5 + glowLayer * fWid * 0.8) * (prominence / 50);
      const glowAlpha = (0.015 - glowLayer * 0.004) * (prominence / 50);
      ctx.beginPath();
      for (let p = 0; p <= pointCount; p++) {
        const pt = arcPoints[p];
        if (p === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = `rgba(255,80,40,${glowAlpha})`;
      ctx.lineWidth = glowW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();

    // Multi-thread rendering (magnetic field lines)
    const threads = 3 + Math.floor(rng() * 5);
    for (let th = 0; th < threads; th++) {
      const threadOffset = ((th / threads) - 0.5) * fWid * 0.7 * (prominence / 50);

      for (let layer = 3; layer >= 0; layer--) {
        const w = (0.8 + layer * 1.5) * sc * (prominence / 50);
        const alpha = (0.05 + (3 - layer) * 0.08) * (prominence / 50);

        ctx.beginPath();
        for (let p = 0; p <= pointCount; p++) {
          const pt = arcPoints[p];
          const perpAngle = Math.atan2(pt.y - cy, pt.x - cx) + Math.PI / 2;
          const px = pt.x + Math.cos(perpAngle) * threadOffset;
          const py = pt.y + Math.sin(perpAngle) * threadOffset;
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        // Gradient from hot yellow base to cooler red at apex
        ctx.strokeStyle = layer === 0
          ? `rgba(255,${100 + layer * 20},${50 + layer * 15},${alpha})`
          : `rgba(255,${60 + layer * 20},${25 + layer * 12},${alpha * 0.7})`;
        ctx.lineWidth = w;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  }

  // --- Chromosphere (H-alpha red rim) ---
  if (chromosphere) {
    const chromoR = sR * 1.012;

    // Spicules (jet-like features) — more numerous, varied
    for (let i = 0; i < 120; i++) {
      const angle = rng() * Math.PI * 2;
      const len = (2 + rng() * 15) * sc;
      const x1 = cx + Math.cos(angle) * sR;
      const y1 = cy + Math.sin(angle) * sR;
      const x2 = cx + Math.cos(angle) * (sR + len);
      const y2 = cy + Math.sin(angle) * (sR + len);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(220,50,50,${0.06 + rng() * 0.15})`;
      ctx.lineWidth = (0.3 + rng() * 1.2) * sc;
      ctx.stroke();
    }

    // Red rim glow — brighter, more visible
    const chromoGrad = ctx.createRadialGradient(cx, cy, sR * 0.99, cx, cy, chromoR + 8 * sc);
    chromoGrad.addColorStop(0, 'rgba(0,0,0,0)');
    chromoGrad.addColorStop(0.3, 'rgba(230,50,35,0.18)');
    chromoGrad.addColorStop(0.6, 'rgba(210,40,30,0.10)');
    chromoGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = chromoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, chromoR + 8 * sc, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Photospheric disc with noise-based granulation ---
  const discSize = Math.ceil(sR * 2 + 4);
  const discCanvas = document.createElement('canvas');
  discCanvas.width = discSize;
  discCanvas.height = discSize;
  const dctx = discCanvas.getContext('2d');
  const discImg = dctx.createImageData(discSize, discSize);
  const dd = discImg.data;

  // Chromatic limb darkening coefficients (solar values)
  const uR = 0.47, uG = 0.64, uB = 0.85;

  for (let y = 0; y < discSize; y++) {
    for (let x = 0; x < discSize; x++) {
      const dx = x - discSize / 2;
      const dy = y - discSize / 2;
      const r = Math.hypot(dx, dy);

      if (r > sR + 1) continue;
      if (r > sR) {
        const alpha = Math.max(0, 1 - (r - sR));
        const idx = (y * discSize + x) * 4;
        dd[idx] = photoColor[0];
        dd[idx + 1] = photoColor[1];
        dd[idx + 2] = photoColor[2];
        dd[idx + 3] = alpha * 255;
        continue;
      }

      const mu = Math.sqrt(Math.max(0, 1 - (r / sR) * (r / sR)));
      const ldR = 1 - uR * (1 - mu);
      const ldG = 1 - uG * (1 - mu);
      const ldB = 1 - uB * (1 - mu);

      // Noise-based granulation — multi-scale convection cells
      const gx = dx / sR * 25;
      const gy = dy / sR * 25;
      // Large granules
      const gran1 = granNoise.fbm(gx, gy, 3) * 0.5 + 0.5;
      // Smaller granules (supergranulation texture)
      const gran2 = granNoise.fbm(gx * 3 + 50, gy * 3 + 50, 2) * 0.5 + 0.5;
      // Combine: bright cell centers, dark intergranular lanes
      const gran = 0.88 + 0.08 * gran1 + 0.04 * gran2;

      // Faculae — bright patches near limb (plage regions)
      const faculae = (1 - mu) > 0.6 ? 1 + (1 - mu - 0.6) * granNoise.fbm(gx * 2 + 100, gy * 2 + 100, 2) * 0.15 : 1.0;

      const idx = (y * discSize + x) * 4;
      dd[idx] = Math.min(255, photoColor[0] * ldR * gran * faculae);
      dd[idx + 1] = Math.min(255, photoColor[1] * ldG * gran * faculae);
      dd[idx + 2] = Math.min(255, photoColor[2] * ldB * gran * faculae);
      dd[idx + 3] = 255;
    }
  }

  dctx.putImageData(discImg, 0, 0);
  ctx.drawImage(discCanvas, cx - discSize / 2, cy - discSize / 2);

  // --- Sunspots ---
  const spotCount = 2 + Math.floor(rng() * 3);
  for (let s = 0; s < spotCount; s++) {
    const angle = rng() * Math.PI * 2;
    const dist = (0.1 + rng() * 0.45) * sR;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;

    // Umbra
    const umbraR = (5 + rng() * 15) * sc;
    const uGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, umbraR);
    uGrad.addColorStop(0, `rgba(${Math.round(umbraColor[0] * 0.25)},${Math.round(umbraColor[1] * 0.15)},${Math.round(umbraColor[2] * 0.1)},0.9)`);
    uGrad.addColorStop(0.8, `rgba(${Math.round(umbraColor[0] * 0.35)},${Math.round(umbraColor[1] * 0.22)},${Math.round(umbraColor[2] * 0.15)},0.7)`);
    uGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = uGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, umbraR, 0, Math.PI * 2);
    ctx.fill();

    // Penumbra
    const penR = umbraR * 2.5;
    const penGrad = ctx.createRadialGradient(sx, sy, umbraR * 0.7, sx, sy, penR);
    penGrad.addColorStop(0, `rgba(${Math.round(penumbraColor[0] * 0.45)},${Math.round(penumbraColor[1] * 0.3)},${Math.round(penumbraColor[2] * 0.2)},0.35)`);
    penGrad.addColorStop(0.7, `rgba(${Math.round(penumbraColor[0] * 0.55)},${Math.round(penumbraColor[1] * 0.4)},${Math.round(penumbraColor[2] * 0.28)},0.15)`);
    penGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = penGrad;
    ctx.beginPath();
    ctx.arc(sx, sy, penR, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Bloom ---
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bloomGrad = ctx.createRadialGradient(cx, cy, sR * 0.3, cx, cy, sR * 2.5);
  bloomGrad.addColorStop(0, `rgba(${photoColor[0]},${photoColor[1]},${photoColor[2]},0.05)`);
  bloomGrad.addColorStop(0.4, `rgba(${photoColor[0]},${photoColor[1]},${photoColor[2]},0.015)`);
  bloomGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloomGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, sR * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Vignette
  const vigGrad = ctx.createRadialGradient(cx, cy, W * 0.28, cx, cy, W * 0.72);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  return { temperature: temperature + 'K', flares: flareCount };
}
