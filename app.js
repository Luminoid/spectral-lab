// --- RAF debounce — prevents redundant renders during slider drag ---
let _prismRaf = 0;
let _waveRaf = 0;

function schedulePrism() {
  cancelAnimationFrame(_prismRaf);
  _prismRaf = requestAnimationFrame(updatePrism);
}

function scheduleWaveform() {
  cancelAnimationFrame(_waveRaf);
  _waveRaf = requestAnimationFrame(updateWaveform);
}

// --- Tab switching ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.generator').forEach(g => g.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('gen-' + btn.dataset.tab).classList.add('active');
  });
});

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
    prismInfo.innerHTML = '<span class="tir-warning">Total internal reflection — light cannot exit at these angles</span>';
  } else {
    prismInfo.textContent =
      `Deviation: ${result.deviation}\u00B0 | ` +
      `Beam: ${result.beamDirection}\u00B0 | ` +
      `Exit: ${result.exitDirection}\u00B0`;
  }
}

// Bind all prism controls
document.querySelectorAll('#gen-prism .controls input, #gen-prism .controls select').forEach(el => {
  const event = el.type === 'range' ? 'input' : 'change';
  el.addEventListener(event, () => {
    const valueEl = document.getElementById('v-' + el.id.replace('p-', ''));
    if (valueEl) valueEl.textContent = el.value;
    schedulePrism();
  });
});

// Download
document.getElementById('prism-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-prism.png';
  link.href = prismCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('prism-download-hd').addEventListener('click', () => {
  const hd = document.createElement('canvas');
  hd.width = 4096; hd.height = 4096;
  renderPrism(hd, getPrismConfig());
  const link = document.createElement('a');
  link.download = 'spectral-prism-4k.png';
  link.href = hd.toDataURL('image/png');
  link.click();
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

document.querySelectorAll('#gen-waveform .controls input').forEach(el => {
  const event = (el.type === 'range') ? 'input' : 'change';
  el.addEventListener(event, () => {
    const valueEl = document.getElementById('v-' + el.id.replace('w-', ''));
    if (valueEl) valueEl.textContent = el.value;
    scheduleWaveform();
  });
});

document.getElementById('waveform-download').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'spectral-waveform.png';
  link.href = waveCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById('waveform-download-hd').addEventListener('click', () => {
  const hd = document.createElement('canvas');
  hd.width = 4096; hd.height = 4096;
  renderWaveform(hd, getWaveConfig());
  const link = document.createElement('a');
  link.download = 'spectral-waveform-4k.png';
  link.href = hd.toDataURL('image/png');
  link.click();
});

document.getElementById('waveform-randomize').addEventListener('click', () => {
  const seedInput = document.getElementById('w-seed');
  seedInput.value = Math.floor(Math.random() * 9999) + 1;
  document.getElementById('v-seed').textContent = seedInput.value;
  scheduleWaveform();
});

// --- Initial render ---
updatePrism();
updateWaveform();
