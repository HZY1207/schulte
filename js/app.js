'use strict';

/* =========================================================
 * 配置：关键参数集中管理
 * ======================================================= */
const CONFIG = {
  storage: {
    theme: 'schulte_theme',
    history: 'schulte_history',
    prefs: 'schulte_prefs'
  },
  themes: [
    { id: 'forest', name: '森林', color: '#1A1714' },
    { id: 'ocean', name: '深海', color: '#131A22' },
    { id: 'graphite', name: '石墨', color: '#17181A' },
    { id: 'ember', name: '余烬', color: '#1C1512' },
    { id: 'paper', name: '纸白', color: '#F1EBDF' }
  ],
  defaultTheme: 'forest',
  sizes: [5, 6, 7],
  defaultSize: 5,
  maxMs: 5 * 60 * 1000,
  historyLimit: 50,
  trendCount: 10,
  stress: {
    windowMs: 2000,
    minGapMs: 6500,
    maxGapMs: 12000
  },
  penalties: {
    normal: 1,
    anti: 2
  },
  rating: {
    s: 1.35,
    a: 1.85,
    b: 2.70
  },
  modeFactor: {
    basic: 1,
    alternate: 1.22,
    dual: 1.42,
    anti: 1.25
  },
  sizeFactor: {
    5: 1,
    6: 1.06,
    7: 1.12
  },
  modes: [
    { id: 'basic', name: '基础', desc: '数字升序点击' },
    { id: 'alternate', name: '交替', desc: '1 → A → 2 → B 交替' },
    { id: 'dual', name: '双序列', desc: '红升序 / 蓝降序交替' },
    { id: 'anti', name: '抗干扰', desc: '忽略干扰符号，点错双倍' }
  ],
  distractors: ['●', '▲', '■', '◆', '✚', '✕', '◇', '○'],
  alertTypes: [
    { code: 'STALL', zh: '失速告警' },
    { code: 'TCAS', zh: '防撞告警' },
    { code: 'GPWS', zh: '近地告警' },
    { code: 'WINDSHEAR', zh: '风切变告警' }
  ]
};

/* =========================================================
 * 状态
 * ======================================================= */
const state = {
  theme: CONFIG.defaultTheme,
  mode: 'basic',
  size: CONFIG.defaultSize,
  stress: false,
  view: 'start',
  running: false,
  finished: false,
  elapsed: 0,
  total: 25,
  step: 0,
  errors: 0,
  correct: 0,
  reactions: [],
  expected: [],
  startAt: 0,
  lastAt: 0,
  timerId: null,
  stressTimer: null,
  alertTimer: null,
  alertActive: false,
  errorHotTimer: null,
  modalOnClose: null,
  modalReturnFocus: null
};

const el = {};

/* =========================================================
 * 工具
 * ======================================================= */
function $(id) {
  return document.getElementById(id);
}

function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function fmtSeconds(ms) {
  return (ms / 1000).toFixed(1);
}

function modeName(id) {
  const m = CONFIG.modes.find(function (item) { return item.id === id; });
  return m ? m.name : id;
}

function clampSize(size) {
  return CONFIG.sizes.indexOf(size) >= 0 ? size : CONFIG.defaultSize;
}

function savePrefs() {
  storeSet(CONFIG.storage.prefs, {
    mode: state.mode,
    size: state.size,
    stress: state.stress
  });
}

/* =========================================================
 * 存储
 * ======================================================= */
function storeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 隐私模式或配额不足时静默降级 */
  }
}

function storeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    /* 忽略 */
  }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(CONFIG.storage.theme);
    if (saved && CONFIG.themes.some(function (t) { return t.id === saved; })) {
      return saved;
    }
  } catch (e) {
    /* 忽略 */
  }
  return CONFIG.defaultTheme;
}

function loadPrefs() {
  const saved = storeGet(CONFIG.storage.prefs, {});
  const modeOk = CONFIG.modes.some(function (m) { return m.id === saved.mode; });
  return {
    mode: modeOk ? saved.mode : 'basic',
    size: clampSize(saved.size),
    stress: saved.stress === true
  };
}

function loadHistory() {
  const raw = storeGet(CONFIG.storage.history, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(function (item) {
      return item && typeof item.ms === 'number' && typeof item.rating === 'string';
    })
    .slice(-CONFIG.historyLimit);
}

function saveHistory(history) {
  storeSet(CONFIG.storage.history, history.slice(-CONFIG.historyLimit));
}

/* =========================================================
 * 主题
 * ======================================================= */
function applyTheme(id, persist) {
  const theme = CONFIG.themes.find(function (t) { return t.id === id; }) || CONFIG.themes[0];
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  root.style.colorScheme = theme.id === 'paper' ? 'light' : 'dark';

  const meta = $('themeColor');
  if (meta) meta.setAttribute('content', theme.color);

  state.theme = theme.id;
  if (persist) {
    try {
      localStorage.setItem(CONFIG.storage.theme, theme.id);
    } catch (e) {
      /* 忽略 */
    }
  }
  updateThemeButtons();
}

function buildThemeList() {
  const wrap = el.themeOptions;
  if (!wrap) return;
  wrap.innerHTML = '';
  CONFIG.themes.forEach(function (theme) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-option';
    btn.dataset.opt = theme.id;
    btn.setAttribute('aria-label', theme.name + '主题');
    btn.setAttribute('aria-pressed', 'false');

    const dot = document.createElement('span');
    dot.className = 'theme-dot-preview';
    dot.setAttribute('data-theme', theme.id);
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'theme-name';
    name.textContent = theme.name;

    btn.appendChild(dot);
    btn.appendChild(name);
    btn.addEventListener('click', function () {
      applyTheme(theme.id, true);
      closeTheme();
    });
    wrap.appendChild(btn);
  });
  updateThemeButtons();
}

function updateThemeButtons() {
  if (!el.themeOptions) return;
  Array.prototype.forEach.call(el.themeOptions.querySelectorAll('.theme-option'), function (btn) {
    btn.setAttribute('aria-pressed', btn.dataset.opt === state.theme ? 'true' : 'false');
  });
}

function openTheme() {
  if (state.running) stopStress();
  el.themeLayer.hidden = false;
  el.themeBtn.setAttribute('aria-expanded', 'true');
  updateThemeButtons();
  const current = el.themeOptions.querySelector('[aria-pressed="true"]') || el.themeOptions.querySelector('.theme-option');
  if (current) current.focus({ preventScroll: true });
}

function closeTheme() {
  if (el.themeLayer.hidden) return;
  el.themeLayer.hidden = true;
  el.themeBtn.setAttribute('aria-expanded', 'false');
  if (state.running) scheduleStress();
  el.themeBtn.focus({ preventScroll: true });
}

/* =========================================================
 * 初始化
 * ======================================================= */
function init() {
  cacheElements();
  state.theme = loadTheme();
  applyTheme(state.theme, false);

  const prefs = loadPrefs();
  state.mode = prefs.mode;
  state.size = prefs.size;
  state.stress = prefs.stress;
  state.total = state.size * state.size;

  buildThemeList();
  buildModeList();
  buildSizeList();
  bindEvents();
  renderSetup();
  updateHud();
  showView('start');
  registerSW();
}

function cacheElements() {
  el.hud = $('hud');
  el.hudTime = $('hudTime');
  el.hudErr = $('hudErr');
  el.hudErrNum = $('hudErrNum');
  el.hudCount = $('hudCount');
  el.hudBar = $('hudBar');
  el.quitBtn = $('quitBtn');
  el.themeBtn = $('themeBtn');

  el.prompt = $('prompt');
  el.promptToken = $('promptToken');
  el.promptHint = $('promptHint');
  el.board = $('board');

  el.startView = $('startView');
  el.resultView = $('resultView');
  el.modeList = $('modeList');
  el.sizeList = $('sizeList');
  el.stressToggle = $('stressToggle');
  el.startBtn = $('startBtn');
  el.dataBtn = $('dataBtn');

  el.resultRating = $('resultRating');
  el.resultTitle = $('resultTitle');
  el.resultSub = $('resultSub');
  el.resultTime = $('resultTime');
  el.resultAvg = $('resultAvg');
  el.resultErrors = $('resultErrors');
  el.resultAcc = $('resultAcc');
  el.resultAdvice = $('resultAdvice');
  el.restNote = $('restNote');
  el.resultTrend = $('resultTrend');
  el.againBtn = $('againBtn');
  el.changeSizeBtn = $('changeSizeBtn');
  el.changeModeBtn = $('changeModeBtn');

  el.stressBar = $('stressBar');
  el.stressCode = $('stressCode');
  el.stressZh = $('stressZh');
  el.stressConfirm = $('stressConfirm');
  el.live = $('live');

  el.themeLayer = $('themeLayer');
  el.themeScrim = $('themeScrim');
  el.themeOptions = $('themeOptions');

  el.modalLayer = $('modalLayer');
  el.modalScrim = $('modalScrim');
  el.modalCard = $('modalCard');
  el.modalTitle = $('modalTitle');
  el.modalBody = $('modalBody');
  el.modalActions = $('modalActions');
}

function buildModeList() {
  el.modeList.innerHTML = '';
  CONFIG.modes.forEach(function (mode) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-card';
    btn.dataset.mode = mode.id;
    btn.setAttribute('aria-pressed', 'false');

    const name = document.createElement('span');
    name.className = 'mode-name';
    name.textContent = mode.name;

    const desc = document.createElement('span');
    desc.className = 'mode-desc';
    desc.textContent = mode.desc;

    btn.appendChild(name);
    btn.appendChild(desc);
    btn.addEventListener('click', function () {
      state.mode = mode.id;
      savePrefs();
      renderSetup();
    });
    el.modeList.appendChild(btn);
  });
}

function buildSizeList() {
  el.sizeList.innerHTML = '';
  CONFIG.sizes.forEach(function (size) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.size = String(size);
    btn.textContent = size + '×' + size;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      state.size = size;
      state.total = size * size;
      savePrefs();
      renderSetup();
      updateHud();
    });
    el.sizeList.appendChild(btn);
  });
}

function bindEvents() {
  el.startBtn.addEventListener('click', startGame);
  el.againBtn.addEventListener('click', startGame);
  el.stressToggle.addEventListener('click', function () {
    state.stress = !state.stress;
    savePrefs();
    renderSetup();
  });
  el.dataBtn.addEventListener('click', openDataModal);
  el.changeSizeBtn.addEventListener('click', function () { backToSetup('size'); });
  el.changeModeBtn.addEventListener('click', function () { backToSetup('mode'); });

  el.themeBtn.addEventListener('click', function () {
    if (el.themeLayer.hidden) openTheme();
    else closeTheme();
  });
  el.themeScrim.addEventListener('click', closeTheme);
  el.quitBtn.addEventListener('click', askQuit);
  el.stressConfirm.addEventListener('click', confirmStress);

  el.board.addEventListener('click', function (event) {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    onCell(cell);
  });
  el.board.addEventListener('keydown', onBoardKeydown);

  el.modalScrim.addEventListener('click', closeModal);
  el.modalLayer.addEventListener('keydown', trapModalFocus);
  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('visibilitychange', onVisibilityChange);
}

/* =========================================================
 * 设置界面
 * ======================================================= */
function renderSetup() {
  if (el.modeList) {
    Array.prototype.forEach.call(el.modeList.querySelectorAll('.mode-card'), function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.mode === state.mode ? 'true' : 'false');
    });
  }
  if (el.sizeList) {
    Array.prototype.forEach.call(el.sizeList.querySelectorAll('button'), function (btn) {
      btn.setAttribute('aria-pressed', Number(btn.dataset.size) === state.size ? 'true' : 'false');
    });
  }
  if (el.stressToggle) {
    el.stressToggle.setAttribute('aria-checked', state.stress ? 'true' : 'false');
  }
}

function backToSetup(focus) {
  state.elapsed = 0;
  state.step = 0;
  state.errors = 0;
  state.correct = 0;
  state.total = state.size * state.size;
  updateHud();
  renderSetup();
  showView('start');
  const target = focus === 'size' ? el.sizeList : el.modeList;
  requestAnimationFrame(function () {
    target.classList.add('flash');
    setTimeout(function () { target.classList.remove('flash'); }, 140);
    const first = target.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  });
}

function showView(view) {
  state.view = view;
  el.startView.hidden = view !== 'start';
  el.resultView.hidden = view !== 'result';
  document.body.dataset.view = view;
  el.hud.classList.toggle('is-idle', view !== 'game');
  if (view !== 'game') el.quitBtn.hidden = true;
}

/* =========================================================
 * 出题
 * ======================================================= */
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

function buildBoard(mode, size) {
  const total = size * size;
  const items = [];
  const sequence = [];

  if (mode === 'alternate') {
    const numberCount = Math.ceil(total / 2);
    const letterCount = Math.floor(total / 2);
    const numbers = [];
    const letters = [];

    for (let i = 1; i <= numberCount; i++) {
      const item = { key: 'n' + i, label: String(i), kind: 'num' };
      numbers.push(item);
      items.push(item);
    }
    for (let i = 0; i < letterCount; i++) {
      const ch = String.fromCharCode(65 + i);
      const item = { key: 'l' + ch, label: ch, kind: 'letter' };
      letters.push(item);
      items.push(item);
    }
    for (let i = 0; i < total; i++) {
      sequence.push(i % 2 === 0 ? numbers[i / 2] : letters[(i - 1) / 2]);
    }
  } else if (mode === 'dual') {
    const upCount = Math.ceil(total / 2);
    const downCount = Math.floor(total / 2);
    const upItems = [];
    const downItems = [];

    for (let i = 1; i <= upCount; i++) {
      const item = { key: 'r' + i, label: String(i), kind: 'up' };
      upItems.push(item);
      items.push(item);
    }
    for (let i = downCount; i >= 1; i--) {
      const item = { key: 'b' + i, label: String(i), kind: 'down' };
      downItems.push(item);
      items.push(item);
    }
    for (let i = 0; i < total; i++) {
      sequence.push(i % 2 === 0 ? upItems[i / 2] : downItems[(i - 1) / 2]);
    }
  } else if (mode === 'anti') {
    const targetCount = Math.max(1, Math.round(total * 0.68));
    for (let i = 1; i <= targetCount; i++) {
      const item = { key: 'n' + i, label: String(i), kind: 'num' };
      items.push(item);
      sequence.push(item);
    }
    const decoyCount = total - targetCount;
    for (let i = 0; i < decoyCount; i++) {
      items.push({
        key: 'x' + i,
        label: CONFIG.distractors[i % CONFIG.distractors.length],
        kind: 'decoy'
      });
    }
  } else {
    for (let i = 1; i <= total; i++) {
      const item = { key: 'n' + i, label: String(i), kind: 'num' };
      items.push(item);
      sequence.push(item);
    }
  }

  shuffle(items);
  return { items: items, sequence: sequence };
}

function cellAriaLabel(item) {
  if (item.kind === 'decoy') return '干扰符号';
  if (item.kind === 'letter') return '字母 ' + item.label;
  if (item.kind === 'up') return '红色数字 ' + item.label;
  if (item.kind === 'down') return '蓝色数字 ' + item.label;
  return '数字 ' + item.label;
}

function renderBoard(items) {
  el.board.dataset.size = String(state.size);
  el.board.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach(function (item, index) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell kind-' + item.kind;
    btn.dataset.key = item.key;
    btn.textContent = item.label;
    btn.setAttribute('aria-label', cellAriaLabel(item));
    btn.tabIndex = index === 0 ? 0 : -1;
    frag.appendChild(btn);
  });
  el.board.appendChild(frag);
}

/* =========================================================
 * 训练流程
 * ======================================================= */
function startGame() {
  if (state.running) return;
  closeTheme();
  closeModal();
  stopStress();

  state.running = true;
  state.finished = false;
  state.elapsed = 0;
  state.step = 0;
  state.errors = 0;
  state.correct = 0;
  state.reactions = [];

  const built = buildBoard(state.mode, state.size);
  state.expected = built.sequence;
  state.total = built.sequence.length;

  renderBoard(built.items);
  state.startAt = performance.now();
  state.lastAt = state.startAt;

  el.quitBtn.hidden = false;
  showView('game');
  updatePrompt();
  updateHud();

  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 200);
  scheduleStress();

  const first = el.board.querySelector('.cell');
  if (first && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    first.focus({ preventScroll: true });
  }
}

function tick() {
  if (!state.running) return;
  state.elapsed = Math.min(performance.now() - state.startAt, CONFIG.maxMs);
  updateHud();
  if (state.elapsed >= CONFIG.maxMs) finish(true);
}

function updateHud() {
  if (!el.hudTime) return;
  el.hudTime.textContent = fmtClock(state.elapsed || 0);
  el.hudErrNum.textContent = String(state.errors);
  el.hudCount.textContent = state.step + '/' + (state.total || state.size * state.size);
  const pct = state.total ? Math.min(100, (state.step / state.total) * 100) : 0;
  el.hudBar.style.width = pct + '%';
}

function bumpErrors() {
  el.hudErr.classList.add('is-hot');
  clearTimeout(state.errorHotTimer);
  state.errorHotTimer = setTimeout(function () {
    el.hudErr.classList.remove('is-hot');
  }, 200);
}

function updatePrompt() {
  const token = state.expected[state.step];
  if (!token) {
    el.promptToken.textContent = '✓';
    el.promptToken.className = 'prompt-token';
    el.promptHint.textContent = '完成';
    return;
  }

  el.promptToken.textContent = token.label;
  el.promptToken.className = 'prompt-token kind-' + token.kind;

  let hint = '';
  if (state.mode === 'basic') {
    hint = '按 1 → ' + state.total + ' 顺序';
  } else if (state.mode === 'alternate') {
    hint = token.kind === 'num' ? '数字 · 升序' : '字母 · 升序';
  } else if (state.mode === 'dual') {
    hint = token.kind === 'up' ? '红色 · 升序' : '蓝色 · 降序';
  } else {
    hint = '忽略干扰符号';
  }
  el.promptHint.textContent = hint;
}

function onCell(cell) {
  if (!state.running || state.finished) return;
  if (cell.classList.contains('done') || cell.classList.contains('wrong')) return;

  const token = state.expected[state.step];
  if (!token) return;

  if (cell.dataset.key === token.key) {
    cell.classList.add('done');
    cell.setAttribute('aria-disabled', 'true');

    const now = performance.now();
    state.reactions.push(now - state.lastAt);
    state.lastAt = now;
    state.correct += 1;
    state.step += 1;

    updateHud();
    updatePrompt();

    if (state.step >= state.expected.length) finish(false);
    return;
  }

  const penalty = state.mode === 'anti' ? CONFIG.penalties.anti : CONFIG.penalties.normal;
  state.errors += penalty;
  cell.classList.add('wrong');
  setTimeout(function () { cell.classList.remove('wrong'); }, 200);
  updateHud();
  bumpErrors();
}

function calcRating(avgSeconds, errors, mode, size, incomplete) {
  if (incomplete) return 'C';
  const factor = (CONFIG.modeFactor[mode] || 1) * (CONFIG.sizeFactor[size] || 1);
  const sLimit = CONFIG.rating.s * factor;
  const aLimit = CONFIG.rating.a * factor;
  const bLimit = CONFIG.rating.b * factor;

  if (errors === 0 && avgSeconds <= sLimit) return 'S';
  if (errors <= 1 && avgSeconds <= aLimit) return 'A';
  if (errors <= 3 && avgSeconds <= bLimit) return 'B';
  return 'C';
}

function adaptDifficulty(history, currentSize) {
  if (history.length < 2) return null;
  const lastTwo = history.slice(-2);
  const sameSize = lastTwo.every(function (item) { return item.size === currentSize; });
  if (!sameSize) return null;

  const high = lastTwo.every(function (item) {
    return item.rating === 'S' || item.rating === 'A';
  });
  const low = lastTwo.every(function (item) { return item.rating === 'C'; });

  let next = currentSize;
  if (high) next = Math.min(7, currentSize + 1);
  else if (low) next = Math.max(5, currentSize - 1);

  if (next === currentSize) return null;

  state.size = next;
  savePrefs();
  return {
    dir: next > currentSize ? 'up' : 'down',
    from: currentSize,
    to: next
  };
}

function finish(timedOut) {
  if (state.finished) return;
  state.finished = true;
  state.running = false;

  clearInterval(state.timerId);
  state.timerId = null;
  stopStress();

  if (timedOut) {
    state.elapsed = CONFIG.maxMs;
  } else {
    state.elapsed = Math.min(performance.now() - state.startAt, CONFIG.maxMs);
  }

  const avg = state.reactions.length
    ? state.reactions.reduce(function (sum, value) { return sum + value; }, 0) / state.reactions.length
    : 0;
  const incomplete = state.step < state.expected.length;
  const accuracy = state.correct + state.errors > 0
    ? Math.round((state.correct / (state.correct + state.errors)) * 100)
    : 0;
  const rating = calcRating(avg / 1000, state.errors, state.mode, state.size, timedOut || incomplete);

  const entry = {
    ts: Date.now(),
    mode: state.mode,
    size: state.size,
    ms: Math.round(state.elapsed),
    avg: Math.round(avg),
    errors: state.errors,
    correct: state.correct,
    accuracy: accuracy,
    rating: rating,
    complete: !incomplete,
    timedOut: !!timedOut
  };

  const history = loadHistory();
  history.push(entry);
  saveHistory(history);
  const advice = adaptDifficulty(history, state.size);

  el.quitBtn.hidden = true;
  updateHud();
  renderResult(entry, advice, timedOut, history);
  showView('result');
  renderSetup();
}

function renderResult(entry, advice, timedOut, history) {
  el.resultRating.textContent = entry.rating;
  el.resultRating.className = 'rating grade-' + entry.rating.toLowerCase();
  el.resultTitle.textContent = timedOut ? '时间到，先休息' : '训练完成';
  el.resultSub.textContent = modeName(entry.mode) + ' · ' + entry.size + '×' + entry.size + (state.stress ? ' · 压力模式' : '');
  el.resultTime.textContent = fmtClock(entry.ms);
  el.resultAvg.textContent = entry.avg > 0 ? (entry.avg / 1000).toFixed(2) + 's' : '—';
  el.resultErrors.textContent = String(entry.errors);
  el.resultAcc.textContent = entry.accuracy + '%';
  el.restNote.hidden = !timedOut;
  el.resultAdvice.textContent = buildAdvice(entry, advice);
  renderTrend(el.resultTrend, history);
}

function buildAdvice(entry, advice) {
  if (advice) {
    if (advice.dir === 'up') {
      return '下局建议：升到 ' + advice.to + '×' + advice.to + '（连续两局 S/A，已自动应用）';
    }
    return '下局建议：降到 ' + advice.to + '×' + advice.to + '（连续两局 C，先稳住准确率，已自动应用）';
  }
  if (entry.rating === 'S' || entry.rating === 'A') {
    return entry.size < 7
      ? '下局建议：保持 ' + entry.size + '×' + entry.size + '，再连续拿下两局即可升档。'
      : '下局建议：保持 7×7，最高档位继续保持。';
  }
  return '下局建议：保持 ' + entry.size + '×' + entry.size + '，先准确后速度。';
}

function renderTrend(container, history) {
  if (!container) return;
  container.innerHTML = '';
  const items = history.slice(-CONFIG.trendCount);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'trend-empty';
    empty.textContent = '暂无记录，先完成一局。';
    container.appendChild(empty);
    return;
  }

  const max = Math.max.apply(null, items.map(function (item) { return item.ms; }).concat([1000]));

  items.forEach(function (item) {
    const col = document.createElement('div');
    col.className = 'trend-col';

    const plot = document.createElement('div');
    plot.className = 'trend-plot';

    const bar = document.createElement('div');
    bar.className = 'trend-bar grade-' + item.rating.toLowerCase();
    bar.style.height = Math.max(6, Math.round((item.ms / max) * 100)) + '%';
    const seconds = Math.round(item.ms / 1000);
    bar.title = modeName(item.mode) + ' ' + item.size + '×' + item.size + ' · ' + seconds + ' 秒 · ' + item.rating;

    const label = document.createElement('span');
    label.className = 'trend-label';
    label.textContent = String(seconds);

    plot.appendChild(bar);
    col.appendChild(plot);
    col.appendChild(label);
    container.appendChild(col);
  });
}

/* =========================================================
 * 压力模式
 * ======================================================= */
function scheduleStress() {
  if (!state.stress || !state.running || state.finished || state.alertActive) return;
  clearTimeout(state.stressTimer);
  const gap = CONFIG.stress.minGapMs + Math.random() * (CONFIG.stress.maxGapMs - CONFIG.stress.minGapMs);
  state.stressTimer = setTimeout(showStress, gap);
}

function showStress() {
  if (!state.running || state.finished || state.alertActive) return;
  const alert = CONFIG.alertTypes[Math.floor(Math.random() * CONFIG.alertTypes.length)];
  state.alertActive = true;
  el.stressCode.textContent = alert.code;
  el.stressZh.textContent = alert.zh;
  el.stressBar.hidden = false;
  el.live.textContent = alert.code + ' ' + alert.zh + '，2 秒内确认';

  clearTimeout(state.alertTimer);
  state.alertTimer = setTimeout(function () { failStress(alert); }, CONFIG.stress.windowMs);
}

function confirmStress() {
  if (!state.alertActive) return;
  state.alertActive = false;
  clearTimeout(state.alertTimer);
  el.stressBar.hidden = true;
  el.live.textContent = '告警已确认';
  scheduleStress();
}

function failStress(alert) {
  if (!state.alertActive) return;
  state.alertActive = false;
  el.stressBar.hidden = true;
  state.errors += 1;
  updateHud();
  bumpErrors();
  el.live.textContent = (alert ? alert.code : '告警') + ' 超时，记一次错误';
  scheduleStress();
}

function stopStress() {
  clearTimeout(state.stressTimer);
  clearTimeout(state.alertTimer);
  state.stressTimer = null;
  state.alertTimer = null;
  state.alertActive = false;
  if (el.stressBar) el.stressBar.hidden = true;
}

function askQuit() {
  if (!state.running) return;
  stopStress();
  openModal({
    title: '结束本局？',
    bodyText: '本局成绩不会记录，计时将停止。',
    actions: [
      { label: '继续训练', kind: 'ghost' },
      {
        label: '结束本局',
        kind: 'danger',
        onClick: function () {
          abortGame();
          return true;
        }
      }
    ],
    onClose: function () {
      if (state.running) scheduleStress();
    }
  });
}

function abortGame() {
  state.running = false;
  state.finished = true;
  clearInterval(state.timerId);
  state.timerId = null;
  stopStress();
  closeModal();
  el.quitBtn.hidden = true;
  state.elapsed = 0;
  state.step = 0;
  state.errors = 0;
  state.correct = 0;
  state.total = state.size * state.size;
  updateHud();
  renderSetup();
  showView('start');
}

/* =========================================================
 * 键盘
 * ======================================================= */
function onBoardKeydown(event) {
  if (!state.running) return;

  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    const focused = document.activeElement;
    if (focused && focused.classList && focused.classList.contains('cell')) {
      event.preventDefault();
      if (!event.repeat) onCell(focused);
    }
    return;
  }

  if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) < 0) return;

  const cells = Array.prototype.slice.call(el.board.querySelectorAll('.cell'));
  if (!cells.length) return;
  const current = cells.indexOf(document.activeElement);
  const n = state.size;
  let next = -1;

  if (event.key === 'ArrowRight') next = current + 1;
  else if (event.key === 'ArrowLeft') next = current - 1;
  else if (event.key === 'ArrowDown') next = current + n;
  else if (event.key === 'ArrowUp') next = current - n;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = cells.length - 1;

  if (current < 0 && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) next = 0;
  if (next < 0 || next >= cells.length) return;

  event.preventDefault();
  cells.forEach(function (cell) { cell.tabIndex = -1; });
  cells[next].tabIndex = 0;
  cells[next].focus({ preventScroll: true });
}

function onGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  if (!el.modalLayer.hidden) {
    event.preventDefault();
    closeModal();
    return;
  }
  if (!el.themeLayer.hidden) {
    event.preventDefault();
    closeTheme();
    return;
  }
  if (state.running) {
    event.preventDefault();
    askQuit();
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    if (state.running) stopStress();
  } else if (state.running) {
    scheduleStress();
  }
}

/* =========================================================
 * 主题面板 / 弹层
 * ======================================================= */
function openModal(options) {
  const wasHidden = el.modalLayer.hidden;
  if (wasHidden) state.modalReturnFocus = document.activeElement;
  state.modalOnClose = options.onClose || null;

  el.modalTitle.textContent = options.title || '提示';
  el.modalBody.innerHTML = '';
  if (options.bodyNode) {
    el.modalBody.appendChild(options.bodyNode);
  } else if (options.bodyText) {
    const p = document.createElement('p');
    p.textContent = options.bodyText;
    el.modalBody.appendChild(p);
  }

  el.modalActions.innerHTML = '';
  const actions = options.actions || [{ label: '关闭' }];
  actions.forEach(function (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn' + (action.kind === 'danger' ? ' danger' : action.kind === 'ghost' ? ' ghost' : '');
    btn.textContent = action.label;
    btn.addEventListener('click', function () {
      if (action.onClick) {
        const keepOpen = action.onClick();
        if (keepOpen === true) return;
      }
      closeModal();
    });
    el.modalActions.appendChild(btn);
  });

  el.modalLayer.hidden = false;
  requestAnimationFrame(function () {
    el.modalCard.focus({ preventScroll: true });
  });
}

function closeModal() {
  if (el.modalLayer.hidden) return;
  el.modalLayer.hidden = true;
  const callback = state.modalOnClose;
  state.modalOnClose = null;
  const target = state.modalReturnFocus;
  state.modalReturnFocus = null;
  if (callback) callback();
  if (target && typeof target.focus === 'function' && document.contains(target)) {
    target.focus({ preventScroll: true });
  }
}

function trapModalFocus(event) {
  if (event.key !== 'Tab') return;
  const nodes = Array.prototype.slice.call(
    el.modalLayer.querySelectorAll('button, [href], textarea, input, select')
  ).filter(function (node) {
    return !node.disabled && node.offsetParent !== null;
  });
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === el.modalCard)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* =========================================================
 * 数据 / CSV
 * ======================================================= */
function bestRating(history) {
  const order = { S: 0, A: 1, B: 2, C: 3 };
  return history.reduce(function (best, item) {
    return order[item.rating] < order[best] ? item.rating : best;
  }, 'C');
}

function openDataModal() {
  const history = loadHistory();
  const body = document.createElement('div');

  const summary = document.createElement('p');
  summary.className = 'muted';
  if (history.length) {
    const best = Math.min.apply(null, history.map(function (item) { return item.ms; }));
    summary.textContent = '本机共 ' + history.length + ' 局，最佳评级 ' + bestRating(history) + '，最快 ' + fmtSeconds(best) + ' 秒。';
  } else {
    summary.textContent = '本机还没有训练记录。';
  }
  body.appendChild(summary);

  if (history.length) {
    const head = document.createElement('div');
    head.className = 'trend-head';
    const title = document.createElement('span');
    title.textContent = '最近 10 局用时';
    const unit = document.createElement('span');
    unit.className = 'muted';
    unit.textContent = '单位：秒';
    head.appendChild(title);
    head.appendChild(unit);

    const trend = document.createElement('div');
    trend.className = 'trend';
    trend.setAttribute('aria-label', '最近十局用时柱状图');
    renderTrend(trend, history);
    body.appendChild(head);
    body.appendChild(trend);
  }

  const status = document.createElement('p');
  status.className = 'data-status';
  status.setAttribute('role', 'status');
  body.appendChild(status);

  openModal({
    title: '训练数据',
    bodyNode: body,
    actions: [
      {
        label: '导出 CSV',
        onClick: function () {
          const ok = exportCsv();
          status.textContent = ok ? 'CSV 已生成。' : '暂无数据可导出。';
          return true;
        }
      },
      {
        label: '清空数据',
        kind: 'ghost',
        onClick: function () {
          askClear();
          return true;
        }
      },
      { label: '关闭', kind: 'ghost' }
    ]
  });
}

function askClear() {
  openModal({
    title: '清空数据？',
    bodyText: '将删除本机全部训练记录；主题与偏好保留。此操作不可撤销。',
    actions: [
      { label: '取消', kind: 'ghost' },
      {
        label: '确认清空',
        kind: 'danger',
        onClick: function () {
          storeRemove(CONFIG.storage.history);
          openModal({
            title: '已清空',
            bodyText: '本机训练记录已删除。',
            actions: [{ label: '好的' }]
          });
          return true;
        }
      }
    ]
  });
}

function isIOS() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function buildCsv(history) {
  const rows = [['时间', '模式', '难度', '用时秒', '平均反应毫秒', '错误', '正确率%', '评级']];
  history.forEach(function (item) {
    rows.push([
      new Date(item.ts).toLocaleString('zh-CN', { hour12: false }),
      modeName(item.mode),
      item.size + 'x' + item.size,
      fmtSeconds(item.ms),
      item.avg,
      item.errors,
      item.accuracy,
      item.rating
    ]);
  });
  return rows.map(function (row) {
    return row.map(csvCell).join(',');
  }).join('\r\n');
}

function dateStamp() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + m + d;
}

function exportCsv() {
  const history = loadHistory();
  if (!history.length) return false;
  const csv = buildCsv(history);

  if (isIOS()) {
    showCsvModal(csv);
    return true;
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'schulte-scores-' + dateStamp() + '.csv';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  return true;
}

function showCsvModal(csv) {
  const body = document.createElement('div');
  const tip = document.createElement('p');
  tip.className = 'muted';
  tip.textContent = 'iOS 不支持直接下载。长按下方文本，全选后复制到表格应用。';

  const box = document.createElement('textarea');
  box.className = 'csv-box';
  box.readOnly = true;
  box.value = csv;
  box.setAttribute('aria-label', 'CSV 原文');

  body.appendChild(tip);
  body.appendChild(box);
  openModal({
    title: '导出 CSV',
    bodyNode: body,
    actions: [{ label: '完成' }]
  });
}

/* =========================================================
 * Service Worker
 * ======================================================= */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {
      /* 本地 file:// 或权限受限时静默忽略 */
    });
  });
}

/* =========================================================
 * 启动
 * ======================================================= */
init();
