# Spectral Lab

Interactive physics-based light and signal visualization tool. Six generators:

1. **Prism Refraction** — Snell's law refraction through configurable glass prisms with real-time dispersion
2. **Pulse Profile** — Stacked intensity waveforms based on the CP 1919 pulsar plotting technique (Harold Craft, 1970)
3. **Gravitational Lensing** — Inverse ray-tracing through a point-mass lens (Einstein deflection)
4. **Nebula** — Emission nebula with ridged multi-fractal noise, multi-species color zones, ACES tone mapping
5. **Topographic** — Perlin noise terrain with marching squares contour lines
6. **Moiré Pattern** — Sinusoidal grating interference with multiply/screen/difference blending

## TODO

- [ ] **Solar Flare** — Re-add with improved visuals (Perlin granulation, luminous prominences, equatorial corona streamers, chromatic limb darkening). Recoverable from git history
- [ ] **Galaxy Spiral** — Re-add with improved visuals (foggy disc haze, noise-modulated dust lanes, foreground diffraction-spike stars, background galaxies, ridged multi-fractal arms). Recoverable from git history

## Features

### Prism Refraction

- Sellmeier dispersion equation (`n²(λ) = 1 + Σ Bᵢλ²/(λ²-Cᵢ)`) with published coefficients
- 4 glass presets (by refractive index): Fused Silica, BK7 Borosilicate, Dense Flint SF11, Diamond
- Snell's law refraction at both faces with total internal reflection detection
- Configurable spectral bands: 6 (ROYGBV), 7 (ROYGBIV), 13 (Fine), 25 (Continuous)
- Geometric entry/exit points via `rayIntersect` + `softCompress` (tanh mapping to central 60%)
- Configurable prism angle, incident angle, rotation, spread, size, beam width
- Glow span control for ray softness
- Layered rendering: prism fill → internal rays → exit bands → prism edges
- Star field and bloom post-processing
- PNG export (2K and 4K)

**Science vs. implementation tradeoffs:**

| Aspect | Physics | Implementation |
|--------|---------|----------------|
| Dispersion | Sellmeier `n(λ)` — BK7 Δn = 1.37% | 75% linear + 25% Sellmeier — same total range, subtler nonlinearity |
| Entry/exit points | Ray intersection on prism faces | `softCompress`: tanh maps to [0.2, 0.8] of face, centered at 49° |
| Internal spread | ~0.5° angular separation | 24× exaggeration (`internalSpread = 12`) for visibility |
| Exit spread | ~1-2° for BK7 | `spread` slider (default 8×) amplifies for artistic effect |
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
- Mountain fill toggle
- PNG export (2K and 4K)

### Gravitational Lensing

- Point-mass lens equation: β = θ - θ_E²·θ/|θ|²
- Inverse ray-tracing at 1024px working resolution
- Source galaxies with Sérsic profiles
- Spatial grid for fast star proximity checks
- Distortion grid overlay option
- PNG export (2K and 4K)

### Nebula

- Ridged multi-fractal + domain-warped fBM for filamentary structure
- 5 independent emission species per palette with separate noise fields
- Beer-Lambert dust absorption with ISM reddening
- ACES filmic tone mapping
- Blackbody-colored stars with JWST 6-point diffraction spikes
- 4 palettes: Emission (Orion), Hubble SHO, Reflection (Pleiades), Planetary (Ring Nebula)
- PNG export (2K and 4K)

### Topographic

- Perlin noise terrain with seeded RNG
- Marching squares contour extraction
- 4 color palettes: Swiss, Ocean, Earth, Mono
- Configurable contours, scale, octaves, line width
- Color fill and contour line toggles
- PNG export (2K and 4K)

### Moiré Pattern

- Sinusoidal grating interference (lines, circles, dots, radial)
- 3 blend modes: multiply, screen, difference
- Dual-layer rotation and scale control
- Custom colors for both layers and background
- PNG export (2K and 4K)

## Physics

All calculations use real physics:

- **Snell's law**: `n1 sin(theta1) = n2 sin(theta2)` with TIR detection
- **Sellmeier dispersion**: `n²(λ) = 1 + Σ Bᵢλ²/(λ² - Cᵢ)` — Schott (BK7, SF11), Malitson 1965 (silica), Peter 1923 (diamond), 25% nonlinearity blended with 75% linear
- **Prism deviation**: `delta = theta_i + theta_e - A`
- **Dispersion**: Shorter wavelengths refract more (violet > red) — spread artistically exaggerated for visibility
- **Gravitational lensing**: Einstein's deflection α = θ_E² / θ, lens equation β = θ - θ_E²/θ
- **Emission nebulae**: H-alpha (656nm), [OIII] (501nm), [SII] (672nm) emission lines
- **Moiré fringes**: cos(2πf₁x)·cos(2πf₂x) = ½[cos(2π(f₁-f₂)x) + cos(2π(f₁+f₂)x)]
- **Gaussian noise**: Standard Box-Muller transform
- **Seeded PRNG**: POSIX LCG (multiplier 1103515245, increment 12345)

## Run

Open `index.html` in any browser. No build step, no dependencies.

```
open index.html
```

Or serve locally:

```
python3 -m http.server 8000
```

## Files

```
spectral-lab/
  index.html      # UI, controls, tab switching (English)
  zh/index.html   # Chinese (zh-Hans) translation
  app.js          # Event binding, config extraction, render scheduling
  i18n.js         # Language detection and JS string translations
  prism.js        # Prism refraction renderer
  waveform.js     # Pulse profile renderer
  lensing.js      # Gravitational lensing renderer
  nebula.js       # Emission nebula renderer
  topographic.js  # Topographic contour renderer
  moire.js        # Moiré pattern renderer
  noise.js        # Shared utilities (PRNG, Perlin noise, color conversions)
  styles.css      # Dark theme styling
  icons/          # Favicons, touch icons, OG image
  _headers        # Cloudflare Pages security headers
  _redirects      # Cloudflare Pages language redirect
  LICENSE         # CC BY-NC 4.0
```

## License

CC BY-NC 4.0 — Non-commercial use. Generated images are free to use, including commercially.
