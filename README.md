# Spectral Lab

Interactive physics-based light and signal visualization tool. Six real-time generators with scientifically grounded rendering, 4K PNG export, and bilingual UI (EN/ZH-Hans).

**Live**: [lab.luminoid.dev](https://lab.luminoid.dev)

## Generators

1. **Prism Refraction** — Snell's law refraction through configurable glass prisms with Sellmeier dispersion
2. **Pulse Profile** — Stacked intensity waveforms based on the CP 1919 pulsar plotting technique (Harold Craft, 1970)
3. **Gravitational Lensing** — Inverse ray-tracing through a point-mass lens with Einstein deflection
4. **Nebula** — Emission nebula with ridged multi-fractal noise, multi-species color zones, ACES tone mapping
5. **Topographic** — Perlin noise terrain with marching squares contour lines and Imhof-style hillshading
6. **Moire Pattern** — Sinusoidal grating interference with multiply/screen/difference blending

## TODO

- [ ] **Solar Flare** — Re-add with improved visuals (Perlin granulation, luminous prominences, equatorial corona streamers, chromatic limb darkening). Recoverable from git history
- [ ] **Galaxy Spiral** — Re-add with improved visuals (foggy disc haze, noise-modulated dust lanes, foreground diffraction-spike stars, background galaxies, ridged multi-fractal arms). Recoverable from git history

## Tech Stack

- **Vanilla JavaScript** + HTML Canvas 2D — zero dependencies, no build step
- **Dark theme** CSS with custom properties
- **Bilingual** — EN (root) + ZH-Hans (`/zh/`), with hreflang SEO alternates
- **Cloudflare Pages** — hosting, security headers, language redirect
- **Canvas resolution** — 2048x2048 internal, 512x512 display, 4096x4096 HD export
- **License** — CC BY-NC-SA 4.0 (tool is non-commercial; generated images are free to use commercially)

## Architecture

### Rendering Pipeline

Each generator follows the same pattern:

1. **Config extraction** — `app.js` reads DOM slider/select values into a plain object
2. **RAF debounce** — `cancelAnimationFrame` + `requestAnimationFrame` prevents redundant renders during slider drag
3. **Render** — Generator function receives `(canvas, config)`, writes pixels, returns info object
4. **Info bar** — Returned values (deviation, alignment, contour count, etc.) displayed below canvas
5. **Lazy init** — Only prism and waveform render on page load; others render on first tab visit

### Performance Optimizations

- **Cached star field** (prism) — offscreen canvas regenerated only on resize
- **Reusable buffers** (waveform) — `Float64Array` pair avoids per-line allocation
- **Cached layer definitions** (prism) — glow span configs cached between renders
- **Reusable HD canvas** — single 4096x4096 canvas shared across all 4K exports
- **Working resolution + GPU upscale** — lensing (1024px), nebula (768px), topographic (512px) render at reduced resolution, then `drawImage` upscales to canvas size with browser-native interpolation
- **Spatial grid** (lensing) — background stars indexed into a grid for O(1) proximity lookups instead of O(n)
- **Inlined hot loops** (moire) — blend mode flag avoids function call overhead in per-pixel loop
- **Precomputed trig** (moire) — `cos`/`sin` per angle computed once outside the pixel loop

## Features

### Prism Refraction

- Sellmeier dispersion equation (`n²(λ) = 1 + Σ Bᵢλ²/(λ²-Cᵢ)`) with published coefficients
- 4 glass presets (by refractive index): Fused Silica, BK7 Borosilicate, Dense Flint SF11, Diamond
- Snell's law refraction at both faces with total internal reflection detection
- Configurable spectral bands: 6 (ROYGBV), 7 (ROYGBIV), 13 (Fine), 25 (Continuous)
- Geometric entry/exit points via `rayIntersect` + `softCompress` (tanh mapping to central 60%)
- Configurable prism angle, incident angle, rotation, spread, size, beam width
- Glow span control for ray softness
- 15-layer rendering: background, star field, prism geometry, beam line, entry glow, prism fill, internal rays (clipped), exit bands, prism edges, bloom, exit glow, vignette
- 10-layer glow stack per ray with configurable span

**Science vs. implementation tradeoffs:**

| Aspect | Physics | Implementation |
|--------|---------|----------------|
| Dispersion | Sellmeier `n(λ)` — BK7 Δn = 1.37% | 75% linear + 25% Sellmeier — same total range, subtler nonlinearity |
| Entry/exit points | Ray intersection on prism faces | `softCompress`: tanh maps to [0.2, 0.8] of face, centered at 49° |
| Internal spread | ~0.5° angular separation | 24x exaggeration (`internalSpread = 12`) for visibility |
| Exit spread | ~1-2° for BK7 | `spread` slider (default 8x) amplifies for artistic effect |
| Spectrum colors | CIE 1931 XYZ → sRGB | 7 hand-tuned RGB stops at even intervals, linear interpolation |
| Band count | Continuous spectrum | Discretized: 6 (ROYGBV), 7 (ROYGBIV), 13, 25 bands |
| Beam width | Infinitely thin ray | Configurable width (default 22px) for visibility |
| Ray rendering | Single ray per wavelength | 10-layer glow stack per ray (configurable span) |
| Glass appearance | Transparent, refractive | Semi-opaque fill with gradient for visibility |
| Glow/bloom | N/A (photon transport) | Artistic canvas glow and bloom post-processing |

### Pulse Profile

- Gaussian peak generation with Box-Muller noise
- Seeded RNG for reproducible waveforms
- Configurable line count, amplitude, noise, peaks, width, center bias
- Custom stroke and background colors
- Mountain fill toggle (occlusion by filling below each line)
- Reusable `Float64Array` buffers — avoids allocating per line
- 3-point smoothing for natural curves

### Gravitational Lensing

- Point-mass lens equation: β = θ - θ_E²·θ/|θ|²
- Inverse ray-tracing at 1024px working resolution, GPU-upscaled to canvas
- Source galaxies with Sersic profiles (`I(r) = I_e · exp(-b_n · (r^(1/n) - 1))`)
- 6 source galaxies (1 user-controlled + 5 seeded background)
- Spatial grid for O(1) background star proximity checks
- Foreground lens galaxy overlay (warm elliptical gradient)
- Distortion grid overlay — curves via inverse lens equation
- Configurable mass, Einstein radius, source position/size, color shift

### Nebula

- 3-layer noise structure: domain-warped fBM (gas base) + ridged multi-fractal (filaments) + fine-detail fBM
- 5 independent emission species per palette, each with its own noise field and spatial distribution zone
- Beer-Lambert dust absorption with ISM reddening coefficients (blue absorbed most: tau × 1.3, red least: tau × 0.7)
- Thermal dust re-emission glow in dark lanes
- ACES filmic tone mapping — preserves color richness in highlights
- Hue rotation via precomputed RGB matrix
- Blackbody-colored stars sampled by spectral type (O/B/A/F/G/K/M temperature distribution)
- Bright stars (15%) get soft glow halos and 6-point JWST-style diffraction spikes
- 4 scientifically-grounded palettes:
  - **Emission** (True Color) — Dominated by H-alpha (656nm red), with [OIII] (501nm cyan) and H-beta (486nm blue) accents
  - **Hubble SHO** — Iconic false-color: SII→Red, H-alpha→Green, [OIII]→Blue (Pillars of Creation style)
  - **Reflection** — Rayleigh scattering (I proportional to 1/lambda^4), thermal dust infrared
  - **Planetary** — [OIII]-dominant hot zones with H-alpha/[NII] outer shells (Ring Nebula, Cat's Eye)

### Topographic

- Terrain generation: fBM + ridged noise blend with domain warping
- Mountain mask (base^2) highlights ridges at higher elevations
- Hillshading via Horn's method — 3x3 Sobel-like kernel, NW azimuth (315°), 45° altitude
- Imhof-style color blending: purple-blue shadows, warm white highlights
- Marching squares contour extraction — single-pass collection with saddle case handling
- Index contours (every 5th) rendered 2.2x thicker
- 4 color palettes with smoothstep interpolation: Swiss (USGS-style elevation), Ocean, Earth, Mono
- Configurable contours, scale, offset, octaves, line width, seed

### Moire Pattern

- Sinusoidal grating interference (lines, circles, dots, radial)
- 3 blend modes: multiply, screen, difference
- Dual-layer rotation, offset, and frequency/scale control
- Custom colors for both layers and background
- Direct `putImageData` rendering (no Canvas 2D context overhead)

## Physics

All calculations use real physics with artistic exaggeration for visibility:

- **Snell's law**: `n1 sin(theta1) = n2 sin(theta2)` with TIR detection
- **Sellmeier dispersion**: `n²(λ) = 1 + Σ Bᵢλ²/(λ² - Cᵢ)` — Schott (BK7, SF11), Malitson 1965 (silica), Peter 1923 (diamond), 25% nonlinearity blended with 75% linear
- **Prism deviation**: `delta = theta_i + theta_e - A`
- **Gravitational lensing**: Einstein's deflection `α = θ_E² / θ`, lens equation `β = θ - θ_E²/θ`, softening parameter prevents singularity
- **Sersic profiles**: `I(r) = I_e · exp(-b_n · (r^(1/n) - 1))` for galaxy surface brightness
- **Emission nebulae**: H-alpha (656nm), [OIII] (501nm), [SII] (672nm), [NII] (658nm), H-beta (486nm) emission lines
- **Beer-Lambert absorption**: `I = I_0 · exp(-tau · lambda_factor)` with ISM reddening
- **ACES tone mapping**: Filmic curve preserving color richness — `(x(x + 0.0245786) - 0.000090537) / (x(0.983729x + 0.4329510) + 0.238081)`
- **Blackbody radiation**: Tanner Helland algorithm for temperature-to-RGB conversion
- **Hillshading**: Horn's method (3x3 gradient kernel) with configurable azimuth and altitude
- **Marching squares**: Isoline extraction with linear interpolation and saddle disambiguation
- **Moire fringes**: `cos(2πf₁x)·cos(2πf₂x) = ½[cos(2π(f₁-f₂)x) + cos(2π(f₁+f₂)x)]`
- **Perlin noise**: Gradient noise with permutation table, fBM, ridged multi-fractal, and domain warping
- **Gaussian noise**: Standard Box-Muller transform
- **Seeded PRNG**: POSIX LCG (multiplier 1103515245, increment 12345, 31-bit output)

## Run

Open `index.html` in any browser. No build step, no dependencies.

```
open index.html
```

Or serve locally (required for `i18n.js` module loading):

```
python3 -m http.server 8000
```

## Deployment

Hosted on **Cloudflare Pages** at [lab.luminoid.dev](https://lab.luminoid.dev).

- **Security headers** (`_headers`): CSP (`script-src 'self'`, `img-src 'self' data:`), X-Frame-Options DENY, nosniff, strict referrer, no camera/mic/geo permissions
- **Language redirect** (`_redirects`): `/ → /zh/` (302) for `Language=zh` browsers
- **SEO**: OpenGraph + Twitter Card meta, hreflang alternates for EN/ZH

## Files

```
spectral-lab/
  index.html       # UI, controls, tab switching (English)
  zh/index.html    # Chinese (zh-Hans) translation — fully localized labels
  app.js           # Event binding, config extraction, render scheduling, HD export
  i18n.js          # Language detection (path-based) and JS string translations (13 keys)
  noise.js         # Shared: seeded PRNG, Perlin noise (fBM/ridged/warped), color conversions
  prism.js         # Prism refraction — Sellmeier, Snell's law, 15-layer compositing
  waveform.js      # Pulse profile — Gaussian peaks, Box-Muller noise, mountain fill
  lensing.js       # Gravitational lensing — inverse ray-trace, Sersic profiles, spatial grid
  nebula.js        # Emission nebula — multi-species noise, dust absorption, ACES tone mapping
  topographic.js   # Topographic — Horn's hillshading, marching squares, palette interpolation
  moire.js         # Moire pattern — sinusoidal gratings, inlined blending, direct putImageData
  styles.css       # Dark theme (CSS custom properties), responsive layout
  icons/           # Favicons (16/32), apple-touch-icon, OG image
  _headers         # Cloudflare Pages security headers (CSP, X-Frame-Options, etc.)
  _redirects       # Cloudflare Pages language redirect (zh)
  LICENSE          # CC BY-NC-SA 4.0
```

## License

CC BY-NC-SA 4.0 — Non-commercial use, derivatives must share alike. Generated images are free to use, including commercially.
