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

// Ray-line intersection: parametric position along infinite line A→B
// Returns s ∈ (-∞, +∞); s=0 at A, s=1 at B. Returns 0.5 if parallel.
// Optional: if clampToSegment=true, returns null when ray misses segment or goes backward
function rayIntersect(origin, dir, segA, segB, clampToSegment) {
  const dx = segB[0] - segA[0],
    dy = segB[1] - segA[1];
  const denom = dir[0] * dy - dir[1] * dx;
  if (Math.abs(denom) < 1e-10) return clampToSegment ? null : 0.5;
  const t =
    ((segA[0] - origin[0]) * dy - (segA[1] - origin[1]) * dx) / denom;
  const s =
    ((segA[0] - origin[0]) * dir[1] - (segA[1] - origin[1]) * dir[0]) /
    denom;
  if (clampToSegment && (t < 0 || s < 0 || s > 1)) return null;
  if (clampToSegment) return [origin[0] + t * dir[0], origin[1] + t * dir[1]];
  return s;
}

// Smooth continuous mapping: any real s → [0.2, 0.8], centered at 0.5
// Uses tanh so there are no hard clamp boundaries
function softCompress(s) {
  return 0.5 + 0.3 * Math.tanh(3 * (s - 0.5));
}

// seededRng provided by noise.js

// --- Glass presets (Sellmeier dispersion coefficients) ---
// n²(λ) = 1 + Σ Bᵢλ² / (λ² - Cᵢ), λ in micrometers
// Sources: Schott datasheets, RefractiveIndex.INFO (Peter 1923 for diamond)

const GLASS_TYPES = {
  silica: {
    label: "Fused Silica",
    // Malitson 1965, RefractiveIndex.INFO — n ≈ 1.45-1.47
    sellmeier: [
      [0.6961663, 0.004679148],
      [0.4079426, 0.013512064],
      [0.8974794, 97.934003],
    ],
  },
  bk7: {
    label: "BK7 (Borosilicate)",
    // Schott datasheet — n ≈ 1.51-1.54
    sellmeier: [
      [1.03961212, 0.00600069867],
      [0.231792344, 0.0200179144],
      [1.01046945, 103.560653],
    ],
  },
  flint: {
    label: "Dense Flint SF11",
    // Schott datasheet — n ≈ 1.74-1.81
    sellmeier: [
      [1.73848403, 0.0136068604],
      [0.311168974, 0.0615960463],
      [1.17490871, 121.922711],
    ],
  },
  diamond: {
    label: "Diamond",
    // Peter 1923 two-term fit — n ≈ 2.41-2.45, C values as λ² (μm²)
    sellmeier: [
      [0.3306, 0.030625],   // C = 0.1750²
      [4.3356, 0.011236],   // C = 0.1060²
    ],
  },
};

// Evaluate Sellmeier equation: n(λ_μm) for a glass type
function sellmeierN(glass, lambda_um) {
  let n2 = 1;
  for (const [B, C] of glass.sellmeier) {
    n2 += (B * lambda_um * lambda_um) / (lambda_um * lambda_um - C);
  }
  return Math.sqrt(n2);
}

// Visible spectrum: 380nm (violet) to 700nm (red)
const LAMBDA_MIN = 0.380; // μm
const LAMBDA_MAX = 0.700; // μm

// 7 reference colors at evenly-spaced positions for smooth interpolation
// t: 0 (red/700nm) → 1 (violet/380nm)
const SPECTRUM_STOPS = [
  [0,     [255, 0, 0]],       // Red 700nm
  [1/6,   [255, 140, 0]],     // Orange 620nm
  [2/6,   [255, 240, 0]],     // Yellow 580nm
  [3/6,   [0, 210, 0]],       // Green 530nm
  [4/6,   [0, 40, 255]],      // Blue 470nm
  [5/6,   [55, 0, 200]],      // Indigo 430nm
  [1,     [130, 0, 190]],     // Violet 380nm
];

function spectrumColor(t) {
  for (let i = 0; i < SPECTRUM_STOPS.length - 1; i++) {
    const [t0, c0] = SPECTRUM_STOPS[i];
    const [t1, c1] = SPECTRUM_STOPS[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return SPECTRUM_STOPS[SPECTRUM_STOPS.length - 1][1];
}

function getSpectrumColors(count) {
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(spectrumColor(i / (count - 1)));
  }
  return colors;
}

const BAND_PRESETS = {
  // 6 ROYGBV: hardcoded — skip indigo
  6: [
    [255, 0, 0],       // Red
    [255, 140, 0],     // Orange
    [255, 240, 0],     // Yellow
    [0, 210, 0],       // Green
    [0, 40, 255],      // Blue
    [130, 0, 190],     // Violet
  ],
  // 7 ROYGBIV: exact stop colors
  7: SPECTRUM_STOPS.map(([, c]) => c),
  // 13 Fine: 2×6+1, every 2nd band hits exact stop
  13: getSpectrumColors(13),
  // 25 Continuous: 4×6+1, every 4th band hits exact stop
  25: getSpectrumColors(25),
};

// --- Layer builder (cached) ---

let _cachedLayerDefs = null;
let _cachedGlowSpan = -1;

function buildLayerDefs(glowSpan) {
  if (_cachedGlowSpan === glowSpan) return _cachedLayerDefs;
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
  _cachedLayerDefs = defs;
  _cachedGlowSpan = glowSpan;
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

// --- Inter-ray spacing ---
// Computes distance between adjacent rays at a given fraction along their paths
// For edge rays, uses single neighbor; for interior rays, averages both neighbors

function interRaySpacing(rayPosAt, bandCount, i, frac, fallbackWidth) {
  if (bandCount < 2) return fallbackWidth;
  const [mx, my] = rayPosAt(i, frac);
  if (i === 0) {
    const [nx, ny] = rayPosAt(1, frac);
    return Math.hypot(nx - mx, ny - my);
  }
  if (i === bandCount - 1) {
    const [px, py] = rayPosAt(i - 1, frac);
    return Math.hypot(mx - px, my - py);
  }
  const [px, py] = rayPosAt(i - 1, frac);
  const [nx, ny] = rayPosAt(i + 1, frac);
  return (Math.hypot(mx - px, my - py) + Math.hypot(nx - mx, ny - my)) / 2;
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
    rays.push({ xs, ys });
  }

  // Position lookup for inter-ray spacing (segment midpoints)
  const rayMidAt = (i, s) => [
    (rays[i].xs[s] + rays[i].xs[s + 1]) * 0.5,
    (rays[i].ys[s] + rays[i].ys[s + 1]) * 0.5,
  ];

  // Precompute inter-ray spacing at each segment
  const interDist = [];
  for (let i = 0; i < bandCount; i++) {
    const dists = new Float64Array(segments);
    for (let s = 0; s < segments; s++) {
      dists[s] = interRaySpacing(rayMidAt, bandCount, i, s, 1);
    }
    interDist.push(dists);
  }

  for (let i = 0; i < bandCount; i++) {
    const { xs, ys } = rays[i];
    const [r, g, b] = bands[i].color;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;

    for (const [wMul, baseAlpha] of layerDefs) {
      ctx.lineCap = "butt";
      for (let s = 0; s < segments; s++) {
        const frac = s / segments;
        const segWidth = interDist[i][s] * wMul;
        const fade = 1 - frac * frac * frac;
        const segAlpha = baseAlpha * fade;
        if (segAlpha < 0.001) continue;

        ctx.globalAlpha = segAlpha;
        ctx.lineWidth = segWidth;
        ctx.beginPath();
        ctx.moveTo(xs[s], ys[s]);
        ctx.lineTo(xs[s + 1], ys[s + 1]);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
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

function computeInternalRayPaths(entryPt, intAngles, intAvg, verts, bands, beamWidth, W, entryFaceDir, thetaI, inAngle, internalSpread) {
  const sc = W / 4096;
  const [apex, , right] = verts;
  const projectedBeamWidth = (beamWidth * sc) / Math.cos(thetaI);
  const bandCount = bands.length;
  const entryBandWidth = projectedBeamWidth / bandCount;

  // Base direction = average refracted ray (from Snell's law, not entry→exit midpoint)
  const baseAngle = inAngle - intAvg;
  const fallbackExit = lerpPt(apex, right, 0.5);

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
    perColorExits.push(rayIntersect(ep, dir, apex, right, true) || fallbackExit);
  }

  return { entryPts, perColorExits, entryBandWidth };
}

function drawInternalRays(ctx, verts, bands, glowSpan, rayPaths) {
  const { entryPts, perColorExits, entryBandWidth } = rayPaths;
  const bandCount = bands.length;
  const layerDefs = buildLayerDefs(glowSpan);
  const segCount = 12;

  // Position lookup for inter-ray spacing (linear interpolation along ray)
  const rayPosAt = (i, frac) => [
    entryPts[i][0] + (perColorExits[i][0] - entryPts[i][0]) * frac,
    entryPts[i][1] + (perColorExits[i][1] - entryPts[i][1]) * frac,
  ];

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
    ctx.strokeStyle = `rgb(${r},${g},${b})`;

    for (const [wMul, a] of layerDefs) {
      ctx.lineCap = "butt";
      ctx.globalAlpha = a;
      for (let s = 0; s < segCount; s++) {
        const frac = s / segCount;
        const nextFrac = (s + 1) / segCount;
        const spacing = interRaySpacing(rayPosAt, bandCount, i, frac, entryBandWidth);
        const segWidth = spacing * wMul;

        ctx.lineWidth = segWidth;
        ctx.beginPath();
        ctx.moveTo(
          start[0] + (end[0] - start[0]) * frac,
          start[1] + (end[1] - start[1]) * frac,
        );
        ctx.lineTo(
          start[0] + (end[0] - start[0]) * nextFrac,
          start[1] + (end[1] - start[1]) * nextFrac,
        );
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
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

  // Build spectral bands with Sellmeier dispersion (25% nonlinearity)
  // Same total n range (nRed→nViolet), band spacing is 25% Sellmeier + 75% linear
  const spectrumColors = BAND_PRESETS[bandCount] || getSpectrumColors(bandCount);
  const count = spectrumColors.length;
  const nRed = sellmeierN(glass, LAMBDA_MAX);
  const nViolet = sellmeierN(glass, LAMBDA_MIN);
  const bands = spectrumColors.map((color, i) => {
    const lambda_um = LAMBDA_MAX - ((LAMBDA_MAX - LAMBDA_MIN) * i) / (count - 1);
    const nSellmeier = sellmeierN(glass, lambda_um);
    const nLinear = nRed + (nViolet - nRed) * (i / (count - 1));
    return { color, n: nLinear * 0.75 + nSellmeier * 0.25 };
  });

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

  // 4. Entry physics — compute beam direction from incident angle
  const entryN = faceNormal(apex, left, center);
  const nAngle = Math.atan2(entryN[1], entryN[0]);
  const inAngle = nAngle + Math.PI;
  const beamAngle = inAngle - thetaI;
  const bDx = Math.cos(beamAngle),
    bDy = Math.sin(beamAngle);

  // Compute reference beam at default angle (49°) for centering
  const refThetaI = (49 * Math.PI) / 180;
  const refBeamAngle = inAngle - refThetaI;
  const refBDx = Math.cos(refBeamAngle), refBDy = Math.sin(refBeamAngle);
  const refFarPt = [cx - refBDx * W, cy - refBDy * W];
  const refEntryS = rayIntersect(refFarPt, [refBDx, refBDy], apex, left, false);

  // Entry point: offset from reference so 49° → center of face
  const farPt = [cx - bDx * W, cy - bDy * W];
  const entryS = rayIntersect(farPt, [bDx, bDy], apex, left, false);
  const entryPt = lerpPt(apex, left, softCompress(entryS - refEntryS + 0.5));

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

  // 6. Compute internal ray paths — uses Snell's law refracted angles directly
  const rayPaths = computeInternalRayPaths(entryPt, intAngles, intAvg, verts, bands, beamWidth, W, entryFaceDir, thetaI, inAngle, internalSpread);

  // Exit point: average refracted ray, centered at 49° reference
  const avgRefAngle = inAngle - intAvg;
  const avgRefDir = [Math.cos(avgRefAngle), Math.sin(avgRefAngle)];
  const exitS = rayIntersect(entryPt, avgRefDir, apex, right, false);
  // Reference exit at 49° — reuse refThetaI from entry computation
  const refAvgN = sellmeierN(glass, (LAMBDA_MAX + LAMBDA_MIN) / 2);
  const refAvgT2 = snell(1.0, refAvgN, refThetaI) || 0;
  const refRefAngle = inAngle - refAvgT2;
  const refRefDir = [Math.cos(refRefAngle), Math.sin(refRefAngle)];
  const refExitS = rayIntersect(lerpPt(apex, left, 0.5), refRefDir, apex, right, false);
  const exitPt = lerpPt(apex, right, softCompress(exitS - refExitS + 0.5));

  // 7. Beam (drawn before prism so glass covers the round cap overlap)
  drawBeamLine(ctx, beamStart, entryPt, beamWidth * sc);

  // 8. Entry glow
  drawGlow(ctx, entryPt, 180 * sc, [220, 228, 255]);

  // 9. Prism fill (background, below internal rays)
  drawPrismFill(ctx, verts);

  // 10. Internal rays (clipped to prism shape, on top of fill)
  drawInternalRays(ctx, verts, bands, glowSpan, rayPaths);

  // 11. Exit bands
  drawExitBands(ctx, rayPaths.perColorExits, exitBase, exitAngles, exitAvg, bands, spread, W, glowSpan);

  // 12. Prism edges (on top of internal rays and exit bands)
  drawPrismEdges(ctx, verts, W);

  // 13. Bloom
  if (showBloom) applyBloom(ctx, W, H);

  // 14. Exit glow
  drawGlow(ctx, exitPt, 220 * sc, [255, 255, 255]);

  // 15. Vignette
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
