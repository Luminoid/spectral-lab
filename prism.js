// Prism Refraction Renderer — Snell's law with configurable glass types
// Physics: accurate refraction with artistic spread exaggeration for visibility

// --- Math helpers ---

function snell(n1, n2, theta1) {
  const s = (n1 / n2) * Math.sin(theta1);
  if (Math.abs(s) > 1) return null; // Total internal reflection
  return Math.asin(Math.min(1.0, Math.max(-1.0, s)));
}

function prismVertices(cx, cy, sideLen, apexAngleDeg, rotationDeg) {
  const A = (apexAngleDeg * Math.PI) / 180;
  const rot = (-rotationDeg * Math.PI) / 180;
  const halfBase = sideLen * Math.sin(A / 2);
  const height = sideLen * Math.cos(A / 2);
  const centroidY = height / 3;
  const raw = [
    [0, -(height - centroidY)],
    [-halfBase, centroidY],
    [halfBase, centroidY],
  ];
  const c = Math.cos(rot),
    s = Math.sin(rot);
  return raw.map(([x, y]) => [x * c - y * s + cx, x * s + y * c + cy]);
}

function faceNormal(p1, p2, center) {
  const dx = p2[0] - p1[0],
    dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  const n1 = [-dy / len, dx / len];
  const n2 = [dy / len, -dx / len];
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const d1 =
    (mid[0] + n1[0] - center[0]) ** 2 + (mid[1] + n1[1] - center[1]) ** 2;
  const d2 =
    (mid[0] + n2[0] - center[0]) ** 2 + (mid[1] + n2[1] - center[1]) ** 2;
  return d1 > d2 ? n1 : n2;
}

function lerpPt(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function raySegmentIntersect(origin, dir, segA, segB) {
  // Find where ray (origin + t*dir) intersects segment segA→segB
  const dx = segB[0] - segA[0],
    dy = segB[1] - segA[1];
  const denom = dir[0] * dy - dir[1] * dx;
  if (Math.abs(denom) < 1e-10) return null;
  const t =
    ((segA[0] - origin[0]) * dy - (segA[1] - origin[1]) * dx) / denom;
  const s =
    ((segA[0] - origin[0]) * dir[1] - (segA[1] - origin[1]) * dir[0]) /
    denom;
  if (t < 0 || s < 0 || s > 1) return null;
  return [origin[0] + t * dir[0], origin[1] + t * dir[1]];
}

// seededRng provided by noise.js

// --- Glass presets ---

const GLASS_TYPES = {
  bk7: { label: "BK7 (Borosilicate)", nMin: 1.51, nMax: 1.535 },
  crown: { label: "Crown K9", nMin: 1.513, nMax: 1.538 },
  flint: { label: "Dense Flint SF11", nMin: 1.74, nMax: 1.81 },
  diamond: { label: "Diamond", nMin: 2.407, nMax: 2.451 },
};

// Generate N evenly-spaced spectrum colors by interpolating wavelength → RGB
// Pegged colors at key wavelengths (nm): 380 violet → 700 red
function spectrumColor(t) {
  // t: 0 (red/700nm) → 1 (violet/380nm)
  // Pegged reference points for smooth interpolation
  const stops = [
    [0.0,  [255, 40, 40]],    // Red 700nm
    [0.15, [255, 150, 0]],    // Orange 620nm
    [0.28, [255, 235, 0]],    // Yellow 580nm
    [0.42, [0, 220, 70]],     // Green 530nm
    [0.60, [0, 150, 255]],    // Blue 470nm
    [0.78, [90, 30, 210]],    // Indigo 430nm
    [1.0,  [170, 0, 230]],    // Violet 380nm
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

function getSpectrumColors(count) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(spectrumColor(i / (count - 1)));
  }
  return colors;
}

const BAND_PRESETS = {
  6: getSpectrumColors(6),
  7: getSpectrumColors(7),
  12: getSpectrumColors(12),
  20: getSpectrumColors(20),
};

// --- Layer builder ---

function buildLayerDefs(glowSpan) {
  // Core layer = 1.0× inter-ray distance (no gaps between rays)
  // Glow layers extend outward: 1.0 → glowSpan
  const coreSpan = 1.0;
  const count = 10;
  const alphas = [0.01, 0.02, 0.04, 0.07, 0.11, 0.16, 0.24, 0.35, 0.52, 0.8];
  const defs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    defs.push([coreSpan + (glowSpan - coreSpan) * (1 - t), alphas[i]]);
  }
  return defs;
}

// --- Cached resources ---

let _starCache = null;
let _starCacheSize = 0;
let _bloomCanvas = null;

function getStarField(W, H) {
  if (_starCache && _starCacheSize === W) return _starCache;
  const offscreen = document.createElement("canvas");
  offscreen.width = W;
  offscreen.height = H;
  const ctx = offscreen.getContext("2d");
  drawStarFieldDirect(ctx, W, H);
  _starCache = offscreen;
  _starCacheSize = W;
  return offscreen;
}

function getBloomCanvas(W, H) {
  if (!_bloomCanvas || _bloomCanvas.width !== W || _bloomCanvas.height !== H) {
    _bloomCanvas = document.createElement("canvas");
    _bloomCanvas.width = W;
    _bloomCanvas.height = H;
  }
  return _bloomCanvas;
}

// --- Drawing helpers ---

function drawStarFieldDirect(ctx, W, H) {
  const rng = seededRng(42);
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(rng() * W),
      y = Math.floor(rng() * H);
    const b = 10 + Math.floor(rng() * 25);
    ctx.fillStyle = `rgb(${b},${b},${Math.min(b + 5, 255)})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * W),
      y = Math.floor(rng() * H);
    const b = 40 + Math.floor(rng() * 45);
    ctx.fillStyle = `rgb(${b},${b},${Math.min(b + 8, 255)})`;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
  for (let i = 0; i < 10; i++) {
    const x = 5 + Math.floor(rng() * (W - 10)),
      y = 5 + Math.floor(rng() * (H - 10));
    const b = 100 + Math.floor(rng() * 60);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 3);
    grad.addColorStop(0, `rgba(${b},${b},${b},1)`);
    grad.addColorStop(1, `rgba(${b},${b},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
}

function drawExitBands(
  ctx,
  perColorExits,
  exitBase,
  exitAngles,
  exitAvg,
  bands,
  spread,
  W,
  glowSpan,
) {
  const rayLen = W * 0.72;
  const segments = 60;
  const bandCount = bands.length;

  // Layer definitions (width multiplier, alpha) — 10 layers, dynamic span
  const layerDefs = buildLayerDefs(glowSpan);

  // Precompute all ray paths
  const rays = [];
  for (let i = 0; i < bandCount; i++) {
    const offset = (exitAngles[i] - exitAvg) * spread;
    const angle = exitBase + offset;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const ep = perColorExits[i];
    const xs = new Float64Array(segments + 1);
    const ys = new Float64Array(segments + 1);
    for (let s = 0; s <= segments; s++) {
      const frac = s / segments;
      xs[s] = ep[0] + dx * rayLen * frac;
      ys[s] = ep[1] + dy * rayLen * frac;
    }
    rays.push({ xs, ys, dx, dy, ep });
  }

  // Precompute inter-ray spacing at each segment for glow sizing
  // At each segment, compute distance between adjacent ray midpoints
  const interRayDist = [];
  for (let i = 0; i < bandCount; i++) {
    const dists = new Float64Array(segments);
    for (let s = 0; s < segments; s++) {
      const mx = (rays[i].xs[s] + rays[i].xs[s + 1]) * 0.5;
      const my = (rays[i].ys[s] + rays[i].ys[s + 1]) * 0.5;
      let dist;
      if (i === 0 && bandCount > 1) {
        const nx = (rays[1].xs[s] + rays[1].xs[s + 1]) * 0.5;
        const ny = (rays[1].ys[s] + rays[1].ys[s + 1]) * 0.5;
        dist = Math.hypot(nx - mx, ny - my);
      } else if (i === bandCount - 1) {
        const px = (rays[i - 1].xs[s] + rays[i - 1].xs[s + 1]) * 0.5;
        const py = (rays[i - 1].ys[s] + rays[i - 1].ys[s + 1]) * 0.5;
        dist = Math.hypot(mx - px, my - py);
      } else {
        const px = (rays[i - 1].xs[s] + rays[i - 1].xs[s + 1]) * 0.5;
        const py = (rays[i - 1].ys[s] + rays[i - 1].ys[s + 1]) * 0.5;
        const nx = (rays[i + 1].xs[s] + rays[i + 1].xs[s + 1]) * 0.5;
        const ny = (rays[i + 1].ys[s] + rays[i + 1].ys[s + 1]) * 0.5;
        dist = (Math.hypot(mx - px, my - py) + Math.hypot(nx - mx, ny - my)) / 2;
      }
      dists[s] = dist;
    }
    interRayDist.push(dists);
  }

  for (let i = 0; i < bandCount; i++) {
    const { xs, ys } = rays[i];
    const [r, g, b] = bands[i].color;

    for (const [wMul, baseAlpha] of layerDefs) {
      ctx.lineCap = "butt";
      for (let s = 0; s < segments; s++) {
        const frac = s / segments;
        // Width = inter-ray spacing × wMul (all layers use same principle)
        const segWidth = interRayDist[i][s] * wMul;
        const fade = 1 - frac * frac * frac;
        const segAlpha = baseAlpha * fade;
        if (segAlpha < 0.001) continue;

        ctx.beginPath();
        ctx.moveTo(xs[s], ys[s]);
        ctx.lineTo(xs[s + 1], ys[s + 1]);
        ctx.strokeStyle = `rgba(${r},${g},${b},${segAlpha})`;
        ctx.lineWidth = segWidth;
        ctx.stroke();
      }
    }
  }
}

function drawGlow(ctx, pt, radius, color) {
  const grad = ctx.createRadialGradient(
    pt[0],
    pt[1],
    0,
    pt[0],
    pt[1],
    radius,
  );
  const [cr, cg, cb] = color;
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.35)`);
  grad.addColorStop(0.08, `rgba(${cr},${cg},${cb},0.28)`);
  grad.addColorStop(0.18, `rgba(${cr},${cg},${cb},0.2)`);
  grad.addColorStop(0.3, `rgba(${cr},${cg},${cb},0.13)`);
  grad.addColorStop(0.45, `rgba(${cr},${cg},${cb},0.07)`);
  grad.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.035)`);
  grad.addColorStop(0.8, `rgba(${cr},${cg},${cb},0.01)`);
  grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPrismFill(ctx, verts) {
  const [apex, left, right] = verts;
  const minY = Math.min(apex[1], left[1], right[1]);
  const maxY = Math.max(apex[1], left[1], right[1]);

  // Glass fill gradient
  const grad = ctx.createLinearGradient(0, minY, 0, maxY);
  grad.addColorStop(0, "rgba(70,80,110,0.95)");
  grad.addColorStop(1, "rgba(45,50,72,0.95)");

  ctx.beginPath();
  ctx.moveTo(apex[0], apex[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawPrismEdges(ctx, verts, W) {
  const [apex, left, right] = verts;
  const sc = W / 4096;

  // Outer glow
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  ctx.moveTo(apex[0], apex[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.closePath();
  ctx.strokeStyle = "rgba(120,130,175,1)";
  ctx.lineWidth = 44 * sc;
  ctx.filter = `blur(${18 * sc}px)`;
  ctx.stroke();
  ctx.filter = "none";
  ctx.restore();

  // Bold outline
  const edges = [
    [apex, left, "rgba(240,242,255,1)", 22],
    [apex, right, "rgba(220,222,240,1)", 22],
    [left, right, "rgba(190,195,210,1)", 20],
  ];
  for (const [p1, p2, color, w] of edges) {
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = w * sc;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Vertex dots
  for (const [vx, vy] of verts) {
    const grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, 20 * sc);
    grad.addColorStop(0, "rgba(240,245,255,0.4)");
    grad.addColorStop(1, "rgba(240,245,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(vx, vy, 20 * sc, 0, Math.PI * 2);
    ctx.fill();
  }
}

function computeInternalRayPaths(entryPt, intAngles, intAvg, verts, bands, beamWidth, W, entryFaceDir, thetaI, exitPt, internalSpread) {
  const sc = W / 4096;
  const [apex, , right] = verts;
  const projectedBeamWidth = (beamWidth * sc) / Math.cos(thetaI);
  const bandCount = bands.length;
  const entryBandWidth = projectedBeamWidth / bandCount;

  const baseDx = exitPt[0] - entryPt[0];
  const baseDy = exitPt[1] - entryPt[1];
  const baseAngle = Math.atan2(baseDy, baseDx);

  const entryPts = [];
  const perColorExits = [];
  for (let i = 0; i < bandCount; i++) {
    const t = (i / (bandCount - 1) - 0.5) * (projectedBeamWidth - entryBandWidth);
    const ep = [
      entryPt[0] + entryFaceDir[0] * t,
      entryPt[1] + entryFaceDir[1] * t,
    ];
    entryPts.push(ep);

    const offset = (intAvg - intAngles[i]) * internalSpread;
    const angle = baseAngle + offset;
    const dir = [Math.cos(angle), Math.sin(angle)];
    perColorExits.push(raySegmentIntersect(ep, dir, apex, right) || exitPt);
  }

  return { entryPts, perColorExits, entryBandWidth };
}

function drawInternalRays(ctx, verts, bands, glowSpan, rayPaths) {
  const { entryPts, perColorExits, entryBandWidth } = rayPaths;
  const bandCount = bands.length;
  const layerDefs = buildLayerDefs(glowSpan);
  const segCount = 12;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(verts[0][0], verts[0][1]);
  ctx.lineTo(verts[1][0], verts[1][1]);
  ctx.lineTo(verts[2][0], verts[2][1]);
  ctx.closePath();
  ctx.clip();

  for (let i = 0; i < bandCount; i++) {
    const start = entryPts[i];
    const end = perColorExits[i];
    const [r, g, b] = bands[i].color;

    for (const [wMul, a] of layerDefs) {
      ctx.lineCap = "butt";
      for (let s = 0; s < segCount; s++) {
        const frac = s / segCount;
        const nextFrac = (s + 1) / segCount;

        let spacing;
        if (bandCount < 2) {
          spacing = entryBandWidth;
        } else if (i === 0) {
          const myX = start[0] + (end[0] - start[0]) * frac;
          const myY = start[1] + (end[1] - start[1]) * frac;
          const nxX = entryPts[1][0] + (perColorExits[1][0] - entryPts[1][0]) * frac;
          const nxY = entryPts[1][1] + (perColorExits[1][1] - entryPts[1][1]) * frac;
          spacing = Math.hypot(nxX - myX, nxY - myY);
        } else if (i === bandCount - 1) {
          const myX = start[0] + (end[0] - start[0]) * frac;
          const myY = start[1] + (end[1] - start[1]) * frac;
          const pvX = entryPts[i - 1][0] + (perColorExits[i - 1][0] - entryPts[i - 1][0]) * frac;
          const pvY = entryPts[i - 1][1] + (perColorExits[i - 1][1] - entryPts[i - 1][1]) * frac;
          spacing = Math.hypot(myX - pvX, myY - pvY);
        } else {
          const myX = start[0] + (end[0] - start[0]) * frac;
          const myY = start[1] + (end[1] - start[1]) * frac;
          const pvX = entryPts[i - 1][0] + (perColorExits[i - 1][0] - entryPts[i - 1][0]) * frac;
          const pvY = entryPts[i - 1][1] + (perColorExits[i - 1][1] - entryPts[i - 1][1]) * frac;
          const nxX = entryPts[i + 1][0] + (perColorExits[i + 1][0] - entryPts[i + 1][0]) * frac;
          const nxY = entryPts[i + 1][1] + (perColorExits[i + 1][1] - entryPts[i + 1][1]) * frac;
          spacing = (Math.hypot(myX - pvX, myY - pvY) + Math.hypot(nxX - myX, nxY - myY)) / 2;
        }

        const segWidth = spacing * wMul;
        const x0 = start[0] + (end[0] - start[0]) * frac;
        const y0 = start[1] + (end[1] - start[1]) * frac;
        const x1 = start[0] + (end[0] - start[0]) * nextFrac;
        const y1 = start[1] + (end[1] - start[1]) * nextFrac;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        ctx.lineWidth = segWidth;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawBeamLine(ctx, start, end, coreWidth) {
  const layers = [
    [coreWidth * 12, 0.015, [140, 150, 210]],
    [coreWidth * 8, 0.03, [165, 175, 230]],
    [coreWidth * 5, 0.07, [195, 205, 245]],
    [coreWidth * 3, 0.15, [215, 222, 250]],
    [coreWidth * 2, 0.3, [232, 238, 254]],
    [coreWidth * 1.3, 0.55, [248, 250, 255]],
  ];
  for (const [w, a, c] of layers) {
    const grad = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
    grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    grad.addColorStop(0.4, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.3})`);
    grad.addColorStop(0.75, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.7})`);
    grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.strokeStyle = grad;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  // Core
  const coreGrad = ctx.createLinearGradient(start[0], start[1], end[0], end[1]);
  coreGrad.addColorStop(0, "rgba(255,255,255,0)");
  coreGrad.addColorStop(0.4, "rgba(255,255,255,0.3)");
  coreGrad.addColorStop(0.75, "rgba(255,255,255,0.7)");
  coreGrad.addColorStop(1, "rgba(255,255,255,1)");
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  ctx.lineTo(end[0], end[1]);
  ctx.strokeStyle = coreGrad;
  ctx.lineWidth = coreWidth;
  ctx.lineCap = "round";
  ctx.stroke();
}

function applyBloom(ctx, W, H) {
  const tmp = getBloomCanvas(W, H);
  const tc = tmp.getContext("2d");
  tc.clearRect(0, 0, W, H);
  tc.drawImage(ctx.canvas, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [blur, alpha] of [
    [W * 0.006, 0.25],
    [W * 0.016, 0.15],
    [W * 0.03, 0.08],
  ]) {
    ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = alpha;
    ctx.drawImage(tmp, 0, 0);
  }
  ctx.restore();
}

function applyVignette(ctx, W, H) {
  const grad = ctx.createRadialGradient(
    W / 2,
    H / 2,
    W * 0.25,
    W / 2,
    H / 2,
    W * 0.72,
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// --- Main render ---

function renderPrism(canvas, config = {}) {
  const W = canvas.width,
    H = canvas.height;
  const ctx = canvas.getContext("2d");
  const cx = W / 2,
    cy = H / 2;
  const sc = W / 4096;

  const {
    prismAngle = 60,
    rotation = 0,
    spread = 8,
    incidentAngle = 49,
    prismScale = 0.32,
    beamWidth = 22,
    showStars = true,
    showBloom = true,
    glassType = "bk7",
    bandCount = 7,
    glowSpan = 1,
  } = config;

  const A = (prismAngle * Math.PI) / 180;
  const thetaI = (incidentAngle * Math.PI) / 180;
  const glass = GLASS_TYPES[glassType] || GLASS_TYPES.bk7;

  // Build spectral bands
  const spectrumColors = BAND_PRESETS[bandCount] || getSpectrumColors(bandCount);
  const bands = spectrumColors.map((color, i) => ({
    color,
    n: glass.nMin + ((glass.nMax - glass.nMin) * i) / (spectrumColors.length - 1),
  }));

  // 1. Background
  ctx.fillStyle = "#030303";
  ctx.fillRect(0, 0, W, H);

  // 2. Stars (cached offscreen canvas)
  if (showStars) ctx.drawImage(getStarField(W, H), 0, 0);

  // 3. Prism geometry
  const side = W * prismScale;
  const verts = prismVertices(cx, cy, side, prismAngle, rotation);
  const [apex, left, right] = verts;
  const center = [
    (apex[0] + left[0] + right[0]) / 3,
    (apex[1] + left[1] + right[1]) / 3,
  ];
  const entryPt = lerpPt(apex, left, 0.5);
  const exitPt = lerpPt(apex, right, 0.5);

  // 4. Entry physics
  const entryN = faceNormal(apex, left, center);
  const nAngle = Math.atan2(entryN[1], entryN[0]);
  const inAngle = nAngle + Math.PI;
  const beamAngle = inAngle - thetaI;
  const bDx = Math.cos(beamAngle),
    bDy = Math.sin(beamAngle);
  const tBack =
    (W * 0.75) / Math.max(Math.abs(bDx), Math.abs(bDy), 0.001);
  const beamStart = [entryPt[0] - bDx * tBack, entryPt[1] - bDy * tBack];

  // 5. Exit physics
  const exitN = faceNormal(apex, right, center);
  const exNAngle = Math.atan2(exitN[1], exitN[0]);

  const exitAngles = [];
  let tir = false;
  for (const band of bands) {
    const t2 = snell(1.0, band.n, thetaI);
    if (t2 === null) {
      tir = true;
      break;
    }
    const t3 = A - t2;
    if (t3 < 0 || t3 > Math.PI / 2) {
      tir = true;
      break;
    }
    const t4 = snell(band.n, 1.0, t3);
    if (t4 === null) {
      tir = true;
      break;
    }
    exitAngles.push(t4);
  }

  if (tir) {
    // Total internal reflection — just show beam + prism
    drawPrismFill(ctx, verts);
    drawPrismEdges(ctx, verts, W);
    drawBeamLine(ctx, beamStart, entryPt, beamWidth * sc);
    drawGlow(ctx, entryPt, 180 * sc, [220, 228, 255]);
    applyVignette(ctx, W, H);
    return { tir: true };
  }

  const exitAvg = exitAngles.reduce((a, b) => a + b, 0) / exitAngles.length;
  const exitBase = exNAngle + exitAvg;

  // Internal refraction angles for each band
  const intAngles = bands.map((b) => snell(1.0, b.n, thetaI));
  const intAvg = intAngles.reduce((a, b) => a + b, 0) / intAngles.length;
  const internalSpread = 12; // artistic exaggeration of ~0.5° real spread

  // Entry face direction (apex→left) for spreading rays across the beam width
  const efDx = left[0] - apex[0], efDy = left[1] - apex[1];
  const efLen = Math.hypot(efDx, efDy);
  const entryFaceDir = [efDx / efLen, efDy / efLen];

  // 6. Beam (drawn before prism so glass covers the round cap overlap)
  drawBeamLine(ctx, beamStart, entryPt, beamWidth * sc);

  // 7. Entry glow
  drawGlow(ctx, entryPt, 180 * sc, [220, 228, 255]);

  // 8. Compute internal ray paths (no drawing)
  const rayPaths = computeInternalRayPaths(entryPt, intAngles, intAvg, verts, bands, beamWidth, W, entryFaceDir, thetaI, exitPt, internalSpread);

  // 9. Prism fill (background, below internal rays)
  drawPrismFill(ctx, verts);

  // 10. Internal rays (clipped to prism shape, on top of fill)
  drawInternalRays(ctx, verts, bands, glowSpan, rayPaths);

  // 11. Exit bands
  drawExitBands(ctx, rayPaths.perColorExits, exitBase, exitAngles, exitAvg, bands, spread, W, glowSpan);

  // 12. Prism edges (on top of internal rays and exit bands)
  drawPrismEdges(ctx, verts, W);

  // 11. Bloom
  if (showBloom) applyBloom(ctx, W, H);

  // 12. Exit glow
  drawGlow(ctx, exitPt, 220 * sc, [255, 255, 255]);

  // 13. Vignette
  applyVignette(ctx, W, H);

  // Return computed angles for display
  const deviation = (thetaI * 180) / Math.PI + (exitAvg * 180) / Math.PI - prismAngle;
  return {
    tir: false,
    entryAngle: Math.round((nAngle * 180) / Math.PI * 10) / 10,
    exitAngle: Math.round((exNAngle * 180) / Math.PI * 10) / 10,
    deviation: Math.round(deviation * 10) / 10,
    beamDirection: Math.round((beamAngle * 180) / Math.PI * 10) / 10,
    exitDirection: Math.round((exitBase * 180) / Math.PI * 10) / 10,
  };
}
