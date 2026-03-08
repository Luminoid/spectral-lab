# Spectral Lab

Interactive physics-based light and signal visualization tool. Six generators:

1. **Prism Refraction** — Snell's law refraction through configurable glass prisms with real-time dispersion
2. **Pulse Profile** — Stacked intensity waveforms based on the CP 1919 pulsar plotting technique (Harold Craft, 1970)
3. **Gravitational Lensing** — Inverse ray-tracing through a point-mass lens (Einstein deflection)
4. **Nebula** — Emission nebula with ridged multi-fractal noise, multi-species color zones, ACES tone mapping
5. **Topographic** — Perlin noise terrain with marching squares contour lines
6. **Moiré Pattern** — Sinusoidal grating interference with multiply/screen/difference blending

## TODO

- [ ] **Solar Flare** — Re-add with improved visuals (Perlin granulation, luminous prominences, equatorial corona streamers, chromatic limb darkening). Code exists in `flare.js`
- [ ] **Galaxy Spiral** — Re-add with improved visuals (foggy disc haze, noise-modulated dust lanes, foreground diffraction-spike stars, background galaxies, ridged multi-fractal arms). Code exists in `galaxy.js`

## Features

### Prism Refraction

- Accurate Snell's law with wavelength-dependent refractive indices
- 4 glass presets: BK7 Borosilicate, Crown K9, Dense Flint SF11, Diamond
- Total internal reflection detection
- Configurable prism angle, incident angle, rotation, spread, size, beam width
- Star field and bloom post-processing
- PNG export (2K and 4K)

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
- **Glass refractive indices**: Match published manufacturer specs (Schott, etc.)
- **Prism deviation**: `delta = theta_i + theta_e - A`
- **Dispersion**: Shorter wavelengths refract more (violet > red) — spread is artistically exaggerated for visibility
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
  index.html      # UI, controls, tab switching
  app.js          # Event binding, config extraction, render scheduling
  prism.js        # Prism refraction renderer
  waveform.js     # Pulse profile renderer
  lensing.js      # Gravitational lensing renderer
  nebula.js       # Emission nebula renderer
  topographic.js  # Topographic contour renderer
  moire.js        # Moiré pattern renderer
  flare.js        # Solar flare renderer (TODO: re-add)
  galaxy.js       # Galaxy spiral renderer (TODO: re-add)
  styles.css      # Dark theme styling
```

## License

MIT
