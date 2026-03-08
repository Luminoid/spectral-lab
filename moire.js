// Moiré Pattern Renderer — sinusoidal grating interference
// Physics: cos(2πf₁x)·cos(2πf₂x) = ½[cos(2π(f₁-f₂)x) + cos(2π(f₁+f₂)x)]
// Uses smooth sinusoidal gratings for clean interference (no harmonics)
// Supports linear, circular, radial, and zone plate grating types

function renderMoire(canvas, config = {}) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  const {
    pattern = 'lines',      // lines, circles, dots, radial
    frequency = 30,         // cycles across canvas
    rotation1 = 0,
    rotation2 = 5,
    offsetX = 0,
    offsetY = 0,
    amplitude = 1.0,
    color1 = '#ffffff',
    color2 = '#ffffff',
    backgroundColor = '#000000',
    blendMode = 'multiply', // multiply, screen, difference
    scale2 = 100,
  } = config;

  // Parse colors
  const parseHex = (hex) => {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  };
  const c1 = parseHex(color1);
  const c2 = parseHex(color2);
  const bg = parseHex(backgroundColor);

  const cx = W / 2, cy = H / 2;
  const freq = frequency;
  const freq2 = freq * (100 / scale2);
  const a1 = (rotation1 * Math.PI) / 180;
  const a2 = (rotation2 * Math.PI) / 180;
  const ox = offsetX * W / 2048;
  const oy = offsetY * W / 2048;
  const amp = amplitude;

  // Precompute trig constants (avoid recomputing per pixel)
  const cos_a1 = Math.cos(a1), sin_a1 = Math.sin(a1);
  const cos_a2 = Math.cos(a2), sin_a2 = Math.sin(a2);
  const k1 = 2 * Math.PI * freq / W;
  const k2 = 2 * Math.PI * freq2 / W;
  const halfAmp = 0.5 * amp;

  // Precompute color scale factors
  const c1r = c1[0] / 255, c1g = c1[1] / 255, c1b = c1[2] / 255;
  const c2r = c2[0] / 255, c2g = c2[1] / 255, c2b = c2[2] / 255;

  // Select blend function (inlined via flag for hot loop)
  const BLEND_MULTIPLY = 0, BLEND_SCREEN = 1, BLEND_DIFFERENCE = 2;
  const blendType = blendMode === 'screen' ? BLEND_SCREEN
    : blendMode === 'difference' ? BLEND_DIFFERENCE
    : BLEND_MULTIPLY;

  // --- Per-pixel sinusoidal grating evaluation ---
  const imgData = ctx.createImageData(W, H);
  const data = imgData.data;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = px - cx;
      const y = py - cy;

      let v1, v2;

      switch (pattern) {
        case 'circles': {
          const r1 = Math.hypot(x, y);
          const r2 = Math.hypot(px - cx - ox, py - cy - oy);
          v1 = 0.5 + halfAmp * Math.cos(k1 * r1);
          v2 = 0.5 + halfAmp * Math.cos(k2 * r2);
          break;
        }
        case 'radial':
          v1 = 0.5 + halfAmp * Math.cos(freq * Math.atan2(y, x));
          v2 = 0.5 + halfAmp * Math.cos(freq2 * Math.atan2(py - cy - oy, px - cx - ox));
          break;
        case 'dots': {
          const p1a = x * cos_a1 + y * sin_a1;
          const p1b = -x * sin_a1 + y * cos_a1;
          const dx2 = x - ox, dy2 = y - oy;
          const p2a = dx2 * cos_a2 + dy2 * sin_a2;
          const p2b = -dx2 * sin_a2 + dy2 * cos_a2;
          v1 = (0.5 + 0.5 * Math.cos(k1 * p1a)) * (0.5 + 0.5 * Math.cos(k1 * p1b));
          v2 = (0.5 + 0.5 * Math.cos(k2 * p2a)) * (0.5 + 0.5 * Math.cos(k2 * p2b));
          break;
        }
        default: // lines
          v1 = 0.5 + halfAmp * Math.cos(k1 * (x * cos_a1 + y * sin_a1));
          v2 = 0.5 + halfAmp * Math.cos(k2 * ((x - ox) * cos_a2 + (y - oy) * sin_a2));
          break;
      }

      // Blend the two gratings (inlined to avoid function call overhead)
      const vr1 = v1 * c1r, vg1 = v1 * c1g, vb1 = v1 * c1b;
      const vr2 = v2 * c2r, vg2 = v2 * c2g, vb2 = v2 * c2b;
      let moireR, moireG, moireB;
      if (blendType === BLEND_MULTIPLY) {
        moireR = vr1 * vr2; moireG = vg1 * vg2; moireB = vb1 * vb2;
      } else if (blendType === BLEND_SCREEN) {
        moireR = 1 - (1 - vr1) * (1 - vr2);
        moireG = 1 - (1 - vg1) * (1 - vg2);
        moireB = 1 - (1 - vb1) * (1 - vb2);
      } else {
        moireR = Math.abs(vr1 - vr2);
        moireG = Math.abs(vg1 - vg2);
        moireB = Math.abs(vb1 - vb2);
      }

      // Composite over background
      const idx = (py * W + px) * 4;
      data[idx] = Math.min(255, bg[0] + (255 - bg[0]) * moireR);
      data[idx + 1] = Math.min(255, bg[1] + (255 - bg[1]) * moireG);
      data[idx + 2] = Math.min(255, bg[2] + (255 - bg[2]) * moireB);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Compute moiré fringe frequency for info display
  const f1 = freq, f2 = freq2;
  const angleDiff = Math.abs(rotation2 - rotation1);
  const theta = (angleDiff * Math.PI) / 180;
  const fMoire = Math.sqrt(f1 * f1 + f2 * f2 - 2 * f1 * f2 * Math.cos(theta));

  return {
    angleDiff: angleDiff.toFixed(1),
    fringeFreq: fMoire.toFixed(1),
    pattern,
  };
}
