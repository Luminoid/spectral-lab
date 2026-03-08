// --- Shared HD export canvas — reused across all generators to avoid 64MB allocations ---
let _hdCanvas = null;

function getHdCanvas() {
  if (!_hdCanvas) {
    _hdCanvas = document.createElement('canvas');
    _hdCanvas.width = 4096;
    _hdCanvas.height = 4096;
  }
  return _hdCanvas;
}

function downloadHd(renderFn, configFn, filename) {
  const hd = getHdCanvas();
  renderFn(hd, configFn());
  const link = document.createElement('a');
  link.download = filename;
  link.href = hd.toDataURL('image/png');
  link.click();
}

// --- RAF debounce — prevents redundant renders during slider drag ---
let _prismRaf = 0;
let _waveRaf = 0;
let _lensingRaf = 0;
let _topoRaf = 0;
let _moireRaf = 0;
let _nebulaRaf = 0;

function schedulePrism() {
  cancelAnimationFrame(_prismRaf);
  _prismRaf = requestAnimationFrame(updatePrism);
}

function scheduleWaveform() {
  cancelAnimationFrame(_waveRaf);
  _waveRaf = requestAnimationFrame(updateWaveform);
}

function scheduleLensing() {
  cancelAnimationFrame(_lensingRaf);
  _lensingRaf = requestAnimationFrame(updateLensing);
}

function scheduleTopo() {
  cancelAnimationFrame(_topoRaf);
  _topoRaf = requestAnimationFrame(updateTopo);
}

function scheduleMoire() {
  cancelAnimationFrame(_moireRaf);
  _moireRaf = requestAnimationFrame(updateMoire);
}

function scheduleNebula() {
  cancelAnimationFrame(_nebulaRaf);
  _nebulaRaf = requestAnimationFrame(updateNebula);
}

// --- Tab switching ---
let activeTab = 'prism';
const initialRenders = { prism: true, waveform: true };

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.generator').forEach(g => g.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    document.getElementById('gen-' + activeTab).classList.add('active');
    // Lazy render on first visit
    if (!initialRenders[activeTab]) {
      initialRenders[activeTab] = true;
      const renderMap = {
        lensing: updateLensing,
        topographic: updateTopo,
        moire: updateMoire,
        nebula: updateNebula,
      };
      if (renderMap[activeTab]) renderMap[activeTab]();
    }
  });
});

// --- Helper: bind controls and update value labels ---
function bindControls(genId, prefix, scheduleFn) {
  document.querySelectorAll(`#gen-${genId} .controls input, #gen-${genId} .controls select`).forEach(el => {
    const event = el.type === 'range' ? 'input' : 'change';
    el.addEventListener(event, () => {
      const valueEl = document.getElementById('v-' + el.id);
      if (valueEl) valueEl.textContent = el.value;
      scheduleFn();
    });
  });
}

// --- Prism controls ---
const prismCanvas = document.getElementById('prism-canvas');
const prismInfo = document.getElementById('prism-info');

function getPrismConfig() {
  return {
    glassType: document.getElementById('p-glass').value,
    prismAngle: +document.getElementById('p-prismAngle').value,
    incidentAngle: +document.getElementById('p-incidentAngle').value,
    rotation: +document.getElementById('p-rotation').value,
    spread: +document.getElementById('p-spread').value,
    prismScale: +document.getElementById('p-prismScale').value / 100,
    beamWidth: +document.getElementById('p-beamWidth').value,
    showStars: document.getElementById('p-stars').checked,
    showBloom: document.getElementById('p-bloom').checked,
  };
}

function updatePrism() {
  const config = getPrismConfig();
  const result = renderPrism(prismCanvas, config);
  if (result.tir) {
    prismInfo.innerHTML = `<span class="tir-warning">${t('tirWarning')}</span>`;
  } else {
    prismInfo.textContent =
      `${t('deviation')}: ${result.deviation}\u00B0 | ` +
      `${t('beam')}: ${result.beamDirection}\u00B0 | ` +
      `${t('exit')}: ${result.exitDirection}\u00B0`;
  }
}

bindControls('prism', 'p', schedulePrism);

document.getElementById('prism-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-prism.png';
  link.href = prismCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('prism-download-hd').addEventListener('click', () => {
  downloadHd(renderPrism, getPrismConfig, 'spectral-prism-4k.png');
});

// --- Waveform controls ---
const waveCanvas = document.getElementById('waveform-canvas');

function getWaveConfig() {
  return {
    lineCount: +document.getElementById('w-lineCount').value,
    amplitude: +document.getElementById('w-amplitude').value,
    noise: +document.getElementById('w-noise').value,
    peakCount: +document.getElementById('w-peakCount').value,
    peakWidth: +document.getElementById('w-peakWidth').value,
    centerBias: +document.getElementById('w-centerBias').value,
    lineWidth: +document.getElementById('w-lineWidth').value,
    strokeColor: document.getElementById('w-strokeColor').value,
    backgroundColor: document.getElementById('w-bgColor').value,
    seed: +document.getElementById('w-seed').value,
    fillBelow: document.getElementById('w-fillBelow').checked,
  };
}

function updateWaveform() {
  renderWaveform(waveCanvas, getWaveConfig());
}

bindControls('waveform', 'w', scheduleWaveform);

document.getElementById('waveform-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-waveform.png';
  link.href = waveCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('waveform-download-hd').addEventListener('click', () => {
  downloadHd(renderWaveform, getWaveConfig, 'spectral-waveform-4k.png');
});

document.getElementById('waveform-randomize').addEventListener('click', () => {
  const seedInput = document.getElementById('w-seed');
  seedInput.value = Math.floor(Math.random() * 9999) + 1;
  document.getElementById('v-w-seed').textContent = seedInput.value;
  scheduleWaveform();
});

// --- Gravitational Lensing controls ---
const lensingCanvas = document.getElementById('lensing-canvas');
const lensingInfo = document.getElementById('lensing-info');

function getLensingConfig() {
  return {
    mass: +document.getElementById('l-mass').value,
    sourceX: +document.getElementById('l-sourceX').value,
    sourceY: +document.getElementById('l-sourceY').value,
    sourceSize: +document.getElementById('l-sourceSize').value,
    einsteinRadius: +document.getElementById('l-einsteinRadius').value,
    ringBrightness: +document.getElementById('l-ringBrightness').value,
    distortion: +document.getElementById('l-distortion').value,
    colorShift: +document.getElementById('l-colorShift').value,
    starCount: +document.getElementById('l-starCount').value,
    showGrid: document.getElementById('l-showGrid').checked,
  };
}

function updateLensing() {
  const result = renderLensing(lensingCanvas, getLensingConfig());
  lensingInfo.textContent =
    `${t('einsteinRadius')}: ${result.einsteinRadius} | ${t('alignment')}: ${result.alignment}%`;
}

bindControls('lensing', 'l', scheduleLensing);

document.getElementById('lensing-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-lensing.png';
  link.href = lensingCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('lensing-download-hd').addEventListener('click', () => {
  downloadHd(renderLensing, getLensingConfig, 'spectral-lensing-4k.png');
});

// --- Topographic controls ---
const topoCanvas = document.getElementById('topographic-canvas');
const topoInfo = document.getElementById('topographic-info');

function getTopoConfig() {
  return {
    contourCount: +document.getElementById('t-contourCount').value,
    lineWidth: +document.getElementById('t-lineWidth').value,
    palette: document.getElementById('t-palette').value,
    scale: +document.getElementById('t-scale').value,
    offsetX: +document.getElementById('t-offsetX').value,
    offsetY: +document.getElementById('t-offsetY').value,
    octaves: +document.getElementById('t-octaves').value,
    fillBands: document.getElementById('t-fillBands').checked,
    showLines: document.getElementById('t-showLines').checked,
    seed: +document.getElementById('t-seed').value,
  };
}

function updateTopo() {
  const result = renderTopographic(topoCanvas, getTopoConfig());
  topoInfo.textContent =
    `${t('contours')}: ${result.contours} | ${t('scale')}: ${result.scale}`;
}

bindControls('topographic', 't', scheduleTopo);

document.getElementById('topographic-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-topographic.png';
  link.href = topoCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('topographic-download-hd').addEventListener('click', () => {
  downloadHd(renderTopographic, getTopoConfig, 'spectral-topographic-4k.png');
});

document.getElementById('topographic-randomize').addEventListener('click', () => {
  const seedInput = document.getElementById('t-seed');
  seedInput.value = Math.floor(Math.random() * 9999) + 1;
  document.getElementById('v-t-seed').textContent = seedInput.value;
  scheduleTopo();
});

// --- Moiré Pattern controls ---
const moireCanvas = document.getElementById('moire-canvas');
const moireInfo = document.getElementById('moire-info');

function getMoireConfig() {
  return {
    pattern: document.getElementById('m-pattern').value,
    blendMode: document.getElementById('m-blendMode').value,
    frequency: +document.getElementById('m-frequency').value,
    rotation1: +document.getElementById('m-rotation1').value,
    rotation2: +document.getElementById('m-rotation2').value,
    offsetX: +document.getElementById('m-offsetX').value,
    offsetY: +document.getElementById('m-offsetY').value,
    amplitude: +document.getElementById('m-amplitude').value,
    scale2: +document.getElementById('m-scale2').value,
    color1: document.getElementById('m-color1').value,
    color2: document.getElementById('m-color2').value,
    backgroundColor: document.getElementById('m-bgColor').value,
  };
}

function updateMoire() {
  const result = renderMoire(moireCanvas, getMoireConfig());
  moireInfo.textContent =
    `${t('pattern')}: ${result.pattern} | \u0394\u03B8: ${result.angleDiff}\u00B0 | ${t('fringeFreq')}: ${result.fringeFreq}`;
}

bindControls('moire', 'm', scheduleMoire);

document.getElementById('moire-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-moire.png';
  link.href = moireCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('moire-download-hd').addEventListener('click', () => {
  downloadHd(renderMoire, getMoireConfig, 'spectral-moire-4k.png');
});

// --- Nebula controls ---
const nebulaCanvas = document.getElementById('nebula-canvas');
const nebulaInfo = document.getElementById('nebula-info');

function getNebulaConfig() {
  return {
    scale: +document.getElementById('n-scale').value,
    density: +document.getElementById('n-density').value,
    turbulence: +document.getElementById('n-turbulence').value,
    starCount: +document.getElementById('n-starCount').value,
    starBrightness: +document.getElementById('n-starBrightness').value,
    palette: document.getElementById('n-palette').value,
    hueShift: +document.getElementById('n-hueShift').value,
    contrast: +document.getElementById('n-contrast').value,
    seed: +document.getElementById('n-seed').value,
  };
}

function updateNebula() {
  const result = renderNebula(nebulaCanvas, getNebulaConfig());
  nebulaInfo.textContent =
    `${t('stars')}: ${result.stars} | ${t('palette')}: ${result.palette}`;
}

bindControls('nebula', 'n', scheduleNebula);

document.getElementById('nebula-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-nebula.png';
  link.href = nebulaCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('nebula-download-hd').addEventListener('click', () => {
  downloadHd(renderNebula, getNebulaConfig, 'spectral-nebula-4k.png');
});

document.getElementById('nebula-randomize').addEventListener('click', () => {
  const seedInput = document.getElementById('n-seed');
  seedInput.value = Math.floor(Math.random() * 9999) + 1;
  document.getElementById('v-n-seed').textContent = seedInput.value;
  scheduleNebula();
});

// --- Randomize seeds on page load ---
['w-seed', 't-seed', 'n-seed'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    const val = Math.floor(Math.random() * 9999) + 1;
    el.value = val;
    const label = document.getElementById('v-' + id);
    if (label) label.textContent = val;
  }
});

// --- Initial render ---
updatePrism();
updateWaveform();
