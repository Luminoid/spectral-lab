// Galaxy Spiral Renderer — logarithmic spiral arms with density wave physics
// Physics: r(θ) = a·e^(b·θ) where b = tan(pitchAngle)
// Disc: I(r) = I₀·exp(-r/h), Bulge: Sérsic I(r) = I_e·exp(-b_n·[(r/r_e)^(1/n)-1])
// Stellar populations: blue O/B in arms, yellow K/M in bulge, pink Hα H II regions
// Dust lanes on inner (concave) edge of arms — density wave compression
// NASA/HST-quality: diffraction spikes, background galaxies, smooth disc glow

function seededRngGalaxy(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Gaussian random using Box-Muller
function gaussRng(rng) {
  const u1 = rng() + 0.0001;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Simple noise for dust lane variation
function createGalaxyNoise(seed) {
  const perm = new Uint8Array(512);
  const rng = seededRngGalaxy(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function dot2(gi, x, y) { const g = grad2[gi % 8]; return g[0] * x + g[1] * y; }

  return {
    noise2d(x, y) {
      const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
      const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
      return lerp(
        lerp(dot2(aa, xf, yf), dot2(ba, xf - 1, yf), u),
        lerp(dot2(ab, xf, yf - 1), dot2(bb, xf - 1, yf - 1), u), v
      );
    },
    fbm(x, y, octaves, lac = 2.0, gain = 0.5) {
      let val = 0, amp = 1, freq = 1, max = 0;
      for (let i = 0; i < octaves; i++) {
        val += amp * this.noise2d(x * freq, y * freq);
        max += amp; amp *= gain; freq *= lac;
      }
      return val / max;
    },
  };
}

function renderGalaxy(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  const cx = W / 2, cy = H / 2;

  const {
    armCount = 2,
    tightness = 0.3,
    armWidth = 40,
    starCount = 12000,
    coreSize = 120,
    coreBrightness = 90,
    dustLanes = true,
    tilt = 30,
    rotation = 0,
    hueShift = 0,
    barLength = 0,
    seed = 42,
  } = config;

  const sc = W / 2048;
  const rng = seededRngGalaxy(seed);
  const noise = createGalaxyNoise(seed + 7);
  const tiltRad = (tilt * Math.PI) / 180;
  const rotRad = (rotation * Math.PI) / 180;
  const cosRot = Math.cos(rotRad), sinRot = Math.sin(rotRad);
  const yScale = Math.cos(tiltRad);
  const pitchAngle = tightness;
  const maxR = W * 0.42;
  const scaleLength = maxR * 0.22;
  const cb = coreBrightness / 100;

  // Transform galaxy coordinates to screen with tilt and rotation
  function transform(x, y) {
    const rx = x * cosRot - y * sinRot;
    const ry = x * sinRot + y * cosRot;
    return [cx + rx, cy + ry * yScale];
  }

  // --- Deep space background ---
  ctx.fillStyle = '#020210';
  ctx.fillRect(0, 0, W, H);

  // Subtle dark blue gradient for depth
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.7);
  bgGrad.addColorStop(0, 'rgba(8,6,24,0.6)');
  bgGrad.addColorStop(1, 'rgba(2,2,8,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // --- Distant background stars (field stars, not in the galaxy) ---
  const bgRng = seededRngGalaxy(seed + 500);
  for (let i = 0; i < 600; i++) {
    const x = bgRng() * W, y = bgRng() * H;
    const b = 15 + bgRng() * 40;
    const starSz = (0.3 + bgRng() * 0.8) * sc;
    // Slight color variation
    const temp = bgRng();
    const sr = temp < 0.3 ? b * 0.85 : b;
    const sg = b * 0.95;
    const sb = temp > 0.7 ? b * 0.85 : b * 1.05;
    ctx.fillStyle = `rgba(${sr|0},${sg|0},${sb|0},${0.3 + bgRng() * 0.5})`;
    ctx.fillRect(x, y, starSz, starSz);
  }

  // --- Tiny background galaxies (for depth, like HST deep field) ---
  const bgGalRng = seededRngGalaxy(seed + 600);
  for (let i = 0; i < 8; i++) {
    const gx = bgGalRng() * W;
    const gy = bgGalRng() * H;
    // Skip if too close to center (would be hidden by galaxy)
    const distFromCenter = Math.hypot(gx - cx, gy - cy);
    if (distFromCenter < maxR * 0.5) continue;

    const gSize = (3 + bgGalRng() * 8) * sc;
    const gAngle = bgGalRng() * Math.PI;
    const gRatio = 0.3 + bgGalRng() * 0.6;
    const gHue = (30 + bgGalRng() * 200 + hueShift) % 360;
    const gAlpha = 0.08 + bgGalRng() * 0.15;

    ctx.save();
    ctx.translate(gx, gy);
    ctx.rotate(gAngle);
    const galGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, gSize);
    galGrad.addColorStop(0, `hsla(${gHue},30%,80%,${gAlpha})`);
    galGrad.addColorStop(0.4, `hsla(${gHue},25%,60%,${gAlpha * 0.5})`);
    galGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = galGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, gSize, gSize * gRatio, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- Smooth diffuse disc glow (many layers for NASA-like smoothness) ---
  for (let layer = 8; layer >= 0; layer--) {
    const r = scaleLength * (2.5 + layer * 1.2);
    const alpha = cb * (0.006 + (8 - layer) * 0.004);
    const hue = (50 + hueShift) % 360;
    const sat = 20 + layer * 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `hsla(${hue},${sat}%,78%,${alpha})`);
    grad.addColorStop(0.3, `hsla(${hue},${sat - 5}%,60%,${alpha * 0.6})`);
    grad.addColorStop(0.7, `hsla(${hue},${sat - 10}%,40%,${alpha * 0.2})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * yScale, rotRad, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Bulge glow (warm golden, Sérsic n=4 de Vaucouleurs) ---
  const bulgeR = coreSize * sc;
  for (let layer = 5; layer >= 0; layer--) {
    const r = bulgeR * (0.8 + layer * 0.5);
    const alpha = cb * (0.04 + (5 - layer) * 0.03);
    const hue = (42 + hueShift) % 360;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `hsla(${hue},40%,92%,${alpha})`);
    grad.addColorStop(0.2, `hsla(${hue},45%,80%,${alpha * 0.7})`);
    grad.addColorStop(0.5, `hsla(${hue},35%,60%,${alpha * 0.25})`);
    grad.addColorStop(0.8, `hsla(${hue + 5},25%,40%,${alpha * 0.06})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * yScale, rotRad, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Spiral arm diffuse glow (drawn before stars for soft backdrop) ---
  const maxTheta = 12;
  const rawMax = Math.exp(pitchAngle * maxTheta);
  const spiralScale = maxR / rawMax;
  function spiralR(theta, armIndex) {
    return spiralScale * Math.exp(pitchAngle * (theta + (armIndex * 2 * Math.PI / armCount)));
  }

  // Soft arm glow — many wide passes for foggy diffuse light beyond arm edges
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let arm = 0; arm < armCount; arm++) {
    for (let pass = 0; pass < 6; pass++) {
      ctx.beginPath();
      let started = false;
      for (let theta = 0.3; theta < 12; theta += 0.04) {
        const rBase = spiralR(theta, arm);
        if (rBase > maxR * 0.95) break;
        const armAngle = theta + (arm * 2 * Math.PI / armCount);
        // Slight perpendicular wobble for organic look on outer passes
        const wobble = pass > 2 ? noise.fbm(theta * 2 + pass * 5, arm * 7, 2) * armWidth * sc * 0.15 : 0;
        const x = (rBase + wobble) * Math.cos(armAngle);
        const y = (rBase + wobble) * Math.sin(armAngle);
        const [px, py] = transform(x, y);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      const glowW = armWidth * sc * (0.8 + pass * 0.9);
      const hue = pass < 3 ? (210 + hueShift) % 360 : (50 + hueShift) % 360;
      const sat = pass < 3 ? 40 : 20;
      const lit = pass < 3 ? 65 : 55;
      const alpha = (0.015 - pass * 0.002) * cb;
      ctx.strokeStyle = `hsla(${hue},${sat}%,${lit}%,${Math.max(0.002, alpha)})`;
      ctx.lineWidth = glowW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }
  ctx.restore();

  // --- Generate star particles ---
  const allStars = [];

  for (let i = 0; i < starCount; i++) {
    const armIdx = Math.floor(rng() * armCount);
    const theta = rng() * 12;
    const rBase = spiralR(theta, armIdx);
    if (rBase > maxR) continue;

    // Wide Gaussian scatter — stars spread well beyond arm core
    // Inner stars tighter, outer stars more diffuse (like real galaxies)
    const perpSpread = armWidth * sc * (0.6 + rBase / maxR * 0.8);
    const offset = gaussRng(rng) * perpSpread * 0.55;
    const armAngle = theta + (armIdx * 2 * Math.PI / armCount);

    const r = rBase + offset;
    const x = r * Math.cos(armAngle);
    const y = r * Math.sin(armAngle);

    // Disc exponential brightness falloff
    const radialFade = Math.exp(-rBase / (maxR * 0.55));
    const armProximity = Math.exp(-offset * offset / (perpSpread * perpSpread * 0.5));

    // Density wave stellar population sequence
    const normalizedOffset = offset / perpSpread;
    let starHue, starSat, starLit;

    if (normalizedOffset < -0.3 && rng() > 0.55) {
      // H II region (pink Hα emission) — brighter, more saturated
      starHue = (345 + hueShift + rng() * 15) % 360;
      starSat = 65 + rng() * 30;
      starLit = 55 + rng() * 30;
    } else if (normalizedOffset < 0.15) {
      // Young blue O/B stars — vivid
      starHue = (205 + hueShift + rng() * 25) % 360;
      starSat = 50 + rng() * 40;
      starLit = 55 + radialFade * 30;
    } else {
      // Older yellow/orange K/M stars
      starHue = (38 + hueShift + rng() * 25) % 360;
      starSat = 25 + rng() * 35;
      starLit = 42 + radialFade * 22;
    }

    const brightness = (0.12 + armProximity * 0.55 + radialFade * 0.33) * (0.3 + rng() * 0.7);
    const isBlue = normalizedOffset > -0.25 && normalizedOffset < 0.25 && rng() > 0.78;
    const size = isBlue ? (1.2 + rng() * 2.8) * sc : (0.4 + brightness * 1.6) * sc;

    allStars.push({
      x, y, brightness, hue: starHue, sat: starSat, lit: starLit,
      isBlue, size, r: rBase,
      isHII: normalizedOffset < -0.3 && rng() > 0.65,
      isForeground: false,
    });
  }

  // Inter-arm / disc haze stars — creates the foggy diffuse look
  // Real galaxies have a thick disc population that fills between arms
  const hazeCount = Math.floor(starCount * 0.4);
  for (let i = 0; i < hazeCount; i++) {
    const angle = rng() * Math.PI * 2;
    // Exponential disc profile — more stars near center, thinning outward
    const rRaw = -Math.log(rng() + 0.001) * maxR * 0.3;
    const r = Math.min(rRaw, maxR * 0.95);
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    const brightness = (0.04 + rng() * 0.2) * Math.exp(-r / (maxR * 0.5));
    const hue = (43 + hueShift + rng() * 20) % 360;
    const sat = 15 + rng() * 20;

    allStars.push({
      x, y, brightness, hue, sat, lit: 38 + brightness * 22,
      isBlue: false, size: (0.3 + brightness * 0.7) * sc, r,
      isHII: false, isForeground: false,
    });
  }

  // Bulge stars (concentrated, old population — warm golden)
  const bulgeStarCount = Math.floor(starCount * 0.35);
  for (let i = 0; i < bulgeStarCount; i++) {
    const angle = rng() * Math.PI * 2;
    const r = Math.abs(gaussRng(rng)) * coreSize * sc * 0.65;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    const brightness = (0.25 + rng() * 0.75) * Math.exp(-r / (coreSize * sc * 0.7));
    const hue = (40 + hueShift + rng() * 18) % 360;

    allStars.push({
      x, y, brightness, hue, sat: 30, lit: 58 + brightness * 25,
      isBlue: false, size: (0.4 + brightness * 1.4) * sc, r,
      isHII: false, isForeground: false,
    });
  }

  // Sort by radius (draw distant first)
  allStars.sort((a, b) => b.r - a.r);

  // --- Dust lanes (stronger, noise-modulated, on inner arm edge) ---
  if (dustLanes) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let arm = 0; arm < armCount; arm++) {
      // Multiple passes for thicker, more visible dust
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        let started = false;
        for (let theta = 0.4; theta < 12; theta += 0.04) {
          const rBase = spiralR(theta, arm);
          if (rBase > maxR * 0.85) break;
          if (rBase < bulgeR * 0.5) continue; // No dust in bulge center

          const armAngle = theta + (arm * 2 * Math.PI / armCount);
          // Noise modulation for irregular dust density
          const nx = rBase * Math.cos(armAngle) / (50 * sc);
          const ny = rBase * Math.sin(armAngle) / (50 * sc);
          const noiseVal = noise.fbm(nx + pass * 10, ny + pass * 10, 3) * 0.5 + 0.5;

          const dustOffset = -armWidth * sc * (0.3 + pass * 0.08 + noiseVal * 0.1);
          const dr = rBase + dustOffset;
          const x = dr * Math.cos(armAngle);
          const y2 = dr * Math.sin(armAngle);
          const [px, py] = transform(x, y2);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        const dustW = armWidth * sc * (0.3 - pass * 0.06);
        const dustAlpha = (0.25 - pass * 0.06) * cb;
        ctx.strokeStyle = `rgba(20,10,5,${dustAlpha})`;
        ctx.lineWidth = dustW;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Draw galaxy stars ---
  for (const star of allStars) {
    const [px, py] = transform(star.x, star.y);
    if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;

    // H II region: soft pink nebula blob
    if (star.isHII && star.brightness > 0.25) {
      const hiiR = star.size * 7;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, hiiR);
      const hiiHue = (348 + hueShift) % 360;
      grad.addColorStop(0, `hsla(${hiiHue},75%,68%,${star.brightness * 0.18})`);
      grad.addColorStop(0.5, `hsla(${hiiHue},65%,55%,${star.brightness * 0.06})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, hiiR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blue star glow — brighter, more prominent
    if (star.isBlue && star.brightness > 0.35) {
      const glowR = star.size * 5;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
      const blueHue = (215 + hueShift) % 360;
      grad.addColorStop(0, `hsla(${blueHue},75%,85%,${star.brightness * 0.25})`);
      grad.addColorStop(0.4, `hsla(${blueHue},60%,70%,${star.brightness * 0.08})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Star point
    ctx.fillStyle = `hsla(${star.hue},${star.sat}%,${star.lit}%,${star.brightness})`;
    if (star.size < 1.5) {
      ctx.fillRect(px - star.size * 0.5, py - star.size * 0.5, star.size, star.size);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Bright core center (luminous golden nucleus) ---
  const brightR = bulgeR * 0.5;
  for (let layer = 2; layer >= 0; layer--) {
    const r = brightR * (0.6 + layer * 0.3);
    const alpha = cb * (0.5 - layer * 0.12);
    const coreHue = (43 + hueShift) % 360;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `hsla(${coreHue},30%,97%,${alpha})`);
    grad.addColorStop(0.15, `hsla(${coreHue},40%,88%,${alpha * 0.7})`);
    grad.addColorStop(0.4, `hsla(${coreHue},45%,70%,${alpha * 0.25})`);
    grad.addColorStop(0.7, `hsla(${coreHue},35%,50%,${alpha * 0.05})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * yScale, rotRad, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Foreground Milky Way stars with diffraction spikes ---
  const fgRng = seededRngGalaxy(seed + 800);
  const fgStarCount = 6 + Math.floor(fgRng() * 5);
  for (let i = 0; i < fgStarCount; i++) {
    const fx = fgRng() * W;
    const fy = fgRng() * H;
    const fBright = 0.5 + fgRng() * 0.5;
    const fSize = (1.5 + fgRng() * 3) * sc;
    // Slight color: warm white to blue-white
    const fTemp = fgRng();
    const fHue = fTemp < 0.4 ? (210 + hueShift) % 360 : (50 + hueShift) % 360;
    const fSat = 15 + fgRng() * 25;

    // Glow
    const glowR = fSize * 6;
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, glowR);
    grad.addColorStop(0, `hsla(${fHue},${fSat}%,95%,${fBright * 0.6})`);
    grad.addColorStop(0.3, `hsla(${fHue},${fSat}%,80%,${fBright * 0.15})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
    ctx.fill();

    // 4-point diffraction spikes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const spikeLen = fSize * (8 + fBright * 12);
    const spikeAlpha = fBright * 0.4;
    for (let s = 0; s < 4; s++) {
      const angle = (s * Math.PI / 4) + 0.2; // Slight rotation
      const ex = Math.cos(angle) * spikeLen;
      const ey = Math.sin(angle) * spikeLen;
      const spikeGrad = ctx.createLinearGradient(fx - ex, fy - ey, fx + ex, fy + ey);
      spikeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      spikeGrad.addColorStop(0.35, `hsla(${fHue},${fSat}%,90%,${spikeAlpha * 0.3})`);
      spikeGrad.addColorStop(0.5, `hsla(${fHue},${fSat}%,95%,${spikeAlpha})`);
      spikeGrad.addColorStop(0.65, `hsla(${fHue},${fSat}%,90%,${spikeAlpha * 0.3})`);
      spikeGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = spikeGrad;
      ctx.lineWidth = sc * (0.6 + fBright * 0.4);
      ctx.beginPath();
      ctx.moveTo(fx - ex, fy - ey);
      ctx.lineTo(fx + ex, fy + ey);
      ctx.stroke();
    }
    ctx.restore();

    // Core point
    ctx.fillStyle = `hsla(${fHue},${fSat}%,97%,${fBright})`;
    ctx.beginPath();
    ctx.arc(fx, fy, fSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Vignette ---
  const vigGrad = ctx.createRadialGradient(cx, cy, W * 0.28, cx, cy, W * 0.72);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  return {
    arms: armCount,
    stars: allStars.length,
    tilt: tilt + '\u00B0',
  };
}
