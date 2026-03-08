// Stacked Pulse Profile Renderer — pulsar radio intensity visualization
// Based on the technique used to plot CP 1919 data (Harold Craft, 1970)

// seededRng and gaussianNoise provided by noise.js

// Reusable buffers — avoids allocating 2 Float64Arrays per line
let _wavePoints = null;
let _waveSmoothed = null;
let _waveBufferSize = 0;

function getWaveBuffers(pointCount) {
  if (_waveBufferSize !== pointCount) {
    _wavePoints = new Float64Array(pointCount);
    _waveSmoothed = new Float64Array(pointCount);
    _waveBufferSize = pointCount;
  }
  return { points: _wavePoints, smoothed: _waveSmoothed };
}

function generateWaveformLine(rng, pointCount, config) {
  const {
    amplitude = 1.0,
    noise = 0.3,
    peakCount = 3,
    peakWidth = 0.05,
    centerBias = 0.6,
  } = config;

  const { points, smoothed } = getWaveBuffers(pointCount);
  points.fill(0);

  const center = pointCount / 2;

  // Generate peaks
  for (let p = 0; p < peakCount; p++) {
    const basePeakPos =
      center + (rng() - 0.5) * pointCount * centerBias;
    const peakSigma = pointCount * peakWidth * (0.5 + rng());
    const peakHeight = (0.3 + rng() * 0.7) * amplitude;

    for (let i = 0; i < pointCount; i++) {
      const dist = (i - basePeakPos) / peakSigma;
      points[i] += peakHeight * Math.exp(-0.5 * dist * dist);
    }
  }

  // Add noise
  const noiseFactor = noise * amplitude * 0.15;
  for (let i = 0; i < pointCount; i++) {
    points[i] += gaussianNoise(rng) * noiseFactor;
  }

  // Taper edges
  const edgeScale = 1 / (pointCount * 0.12);
  for (let i = 0; i < pointCount; i++) {
    const edgeDist = Math.min(i, pointCount - i) * edgeScale;
    if (edgeDist < 1) points[i] *= edgeDist;
  }

  // Simple smooth (3-point average)
  smoothed[0] = points[0];
  for (let i = 1; i < pointCount - 1; i++) {
    smoothed[i] = (points[i - 1] + points[i] + points[i + 1]) / 3;
  }
  smoothed[pointCount - 1] = points[pointCount - 1];

  return smoothed;
}

function renderWaveform(canvas, config = {}) {
  const W = canvas.width,
    H = canvas.height;
  const ctx = canvas.getContext("2d");

  const {
    lineCount = 60,
    amplitude = 1.0,
    noise = 0.3,
    peakCount = 3,
    peakWidth = 0.05,
    centerBias = 0.6,
    lineWidth = 1.5,
    strokeColor = "#ffffff",
    backgroundColor = "#000000",
    fillBelow = true,
    seed = 1979,
  } = config;

  const rng = seededRng(seed);

  // Canvas setup
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, W, H);

  // Layout
  const margin = W * 0.12;
  const drawWidth = W - margin * 2;
  const drawHeight = H - margin * 2;
  const lineSpacing = drawHeight / (lineCount + 1);
  const pointCount = 300;
  const maxDeflection = lineSpacing * 2.5 * amplitude;
  const xStep = drawWidth / (pointCount - 1);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth * (W / 1024);

  // Draw lines from back (top) to front (bottom)
  for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
    const baseY = margin + (lineIdx + 1) * lineSpacing;
    const line = generateWaveformLine(rng, pointCount, config);

    // First point
    const x0 = margin;
    const y0 = baseY - line[0] * maxDeflection;

    if (fillBelow) {
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.lineTo(x0, y0);
      for (let i = 1; i < pointCount; i++) {
        ctx.lineTo(margin + i * xStep, baseY - line[i] * maxDeflection);
      }
      ctx.lineTo(margin + (pointCount - 1) * xStep, baseY);
      ctx.closePath();
      ctx.fillStyle = backgroundColor;
      ctx.fill();
    }

    // Draw the line stroke
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < pointCount; i++) {
      ctx.lineTo(margin + i * xStep, baseY - line[i] * maxDeflection);
    }
    ctx.stroke();
  }
}
