# Spectral Lab

Interactive physics-based light and signal visualization tool. Two generators:

1. **Prism Refraction** — Snell's law refraction through configurable glass prisms with real-time dispersion
2. **Pulse Profile** — Stacked intensity waveforms based on the CP 1919 pulsar plotting technique (Harold Craft, 1970)

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
- PNG export (2K)

## Physics

All optical calculations use real physics:

- **Snell's law**: `n1 sin(theta1) = n2 sin(theta2)` with TIR detection
- **Glass refractive indices**: Match published manufacturer specs (Schott, etc.)
- **Prism deviation**: `delta = theta_i + theta_e - A`
- **Dispersion**: Shorter wavelengths refract more (violet > red) — spread is artistically exaggerated for visibility
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
  index.html      # UI, controls, tab switching, event binding
  prism.js        # Prism refraction renderer (optics engine)
  waveform.js     # Pulse profile renderer (signal generator)
  styles.css      # Dark theme styling
```

## License

MIT
