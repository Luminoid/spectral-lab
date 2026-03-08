// i18n.js — Language detection and JS string translations
// Must be loaded BEFORE app.js

const LANG = location.pathname.startsWith('/zh') ? 'zh' : 'en';

const I18N = {
  en: {
    tirWarning: 'Total internal reflection — light cannot exit at these angles',
    deviation: 'Deviation',
    beam: 'Beam',
    exit: 'Exit',
    einsteinRadius: 'Einstein radius',
    alignment: 'Alignment',
    contours: 'Contours',
    scale: 'Scale',
    pattern: 'Pattern',
    fringeFreq: 'Fringe freq',
    stars: 'Stars',
    palette: 'Palette',
  },
  zh: {
    tirWarning: '全反射 — 此角度下光线无法出射',
    deviation: '偏转角',
    beam: '光束方向',
    exit: '出射角',
    einsteinRadius: '爱因斯坦半径',
    alignment: '对齐度',
    contours: '等高线',
    scale: '比例',
    pattern: '图案',
    fringeFreq: '条纹频率',
    stars: '星星',
    palette: '配色',
  },
};

function t(key) {
  return I18N[LANG]?.[key] ?? I18N.en[key] ?? key;
}
