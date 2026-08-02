const CIRCUMFERENCE = 2 * Math.PI * 94;

const THEMES = {
  alpine: {
    accent: '#2b77c5',
    accentDark: '#205f9d',
    break: '#3a9b78',
    surface: '#ffffff',
    surfaceSoft: '#eef5fd',
    line: '#d6e3f2',
    ink: '#17324b',
    muted: '#627589'
  },
  forest: {
    accent: '#2f7c5d',
    accentDark: '#255f48',
    break: '#5e8d35',
    surface: '#ffffff',
    surfaceSoft: '#eef5ef',
    line: '#d8e5db',
    ink: '#21382d',
    muted: '#69796e'
  },
  sunrise: {
    accent: '#d36c33',
    accentDark: '#ad5424',
    break: '#4d8c73',
    surface: '#ffffff',
    surfaceSoft: '#fff3eb',
    line: '#f0dfd2',
    ink: '#44281c',
    muted: '#7f6c61'
  },
  twilight: {
    accent: '#5c64d6',
    accentDark: '#474fab',
    break: '#418d88',
    surface: '#ffffff',
    surfaceSoft: '#f0f1ff',
    line: '#dee1f7',
    ink: '#232756',
    muted: '#6d7195'
  },
  sakura: {
    accent: '#c45f88',
    accentDark: '#9f476b',
    break: '#56927d',
    surface: '#ffffff',
    surfaceSoft: '#fff1f6',
    line: '#f0dbe5',
    ink: '#4a2436',
    muted: '#7e6470'
  }
};

const elements = {
  timerView: document.getElementById('timerView'),
  settingsView: document.getElementById('settingsView'),
  settingsToggle: document.getElementById('settingsToggle'),
  phaseLabel: document.getElementById('phaseLabel'),
  setLabel: document.getElementById('setLabel'),
  timeDisplay: document.getElementById('timeDisplay'),
  statusText: document.getElementById('statusText'),
  ringProgress: document.getElementById('ringProgress'),
  startPauseButton: document.getElementById('startPauseButton'),
  resetButton: document.getElementById('resetButton'),
  skipButton: document.getElementById('skipButton'),
  settingsForm: document.getElementById('settingsForm'),
  workMinutes: document.getElementById('workMinutes'),
  breakMinutes: document.getElementById('breakMinutes'),
  totalSets: document.getElementById('totalSets'),
  alarmSound: document.getElementById('alarmSound'),
  birdSound: document.getElementById('birdSound'),
  themeOptions: document.querySelectorAll('input[name="theme"]'),
  soundEnabled: document.getElementById('soundEnabled'),
  notificationsEnabled: document.getElementById('notificationsEnabled'),
  testSoundButton: document.getElementById('testSoundButton'),
  testBirdButton: document.getElementById('testBirdButton')
};

let state;
let intervalId;
let showingSettings = false;

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getRemainingSeconds(timer) {
  if (timer.status === 'running' && timer.endTime) {
    return Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
  }
  return Math.max(0, timer.remainingSeconds);
}

function phaseDurationSeconds() {
  return (state.timer.phase === 'work'
    ? state.settings.workMinutes
    : state.settings.breakMinutes) * 60;
}

function statusCopy(timer) {
  if (timer.status === 'running') return timer.phase === 'work' ? '集中しています' : '休憩しています';
  if (timer.status === 'paused') return '一時停止中';
  if (timer.status === 'complete') return '全セット完了';
  return '準備完了';
}

function applyTheme(themeName = 'alpine') {
  const theme = THEMES[themeName] || THEMES.alpine;
  const root = document.documentElement;
  root.dataset.theme = themeName;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-dark', theme.accentDark);
  root.style.setProperty('--break', theme.break);
  root.style.setProperty('--surface', theme.surface);
  root.style.setProperty('--surface-soft', theme.surfaceSoft);
  root.style.setProperty('--line', theme.line);
  root.style.setProperty('--ink', theme.ink);
  root.style.setProperty('--muted', theme.muted);
}

function renderTimer() {
  if (!state) return;

  const { settings, timer } = state;
  const remaining = getRemainingSeconds(timer);
  const duration = Math.max(1, phaseDurationSeconds());
  const progress = Math.min(1, Math.max(0, remaining / duration));

  elements.timeDisplay.textContent = formatTime(remaining);
  elements.phaseLabel.textContent = timer.phase === 'work' ? '作業' : '休憩';
  elements.setLabel.textContent = `セット ${timer.currentSet} / ${settings.totalSets}`;
  elements.statusText.textContent = statusCopy(timer);
  elements.startPauseButton.textContent = timer.status === 'running'
    ? '一時停止'
    : timer.status === 'complete' ? 'もう一度' : 'スタート';
  elements.skipButton.disabled = timer.status === 'complete';

  elements.phaseLabel.classList.toggle('break', timer.phase === 'break');
  elements.ringProgress.classList.toggle('break', timer.phase === 'break');
  elements.ringProgress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  elements.ringProgress.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - progress)}`;

  document.title = `${formatTime(remaining)} - ${timer.phase === 'work' ? '作業' : '休憩'}`;

  if (timer.status === 'running' && remaining <= 0) {
    refreshState();
  }
}

function fillSettingsForm() {
  if (!state) return;
  elements.workMinutes.value = state.settings.workMinutes;
  elements.breakMinutes.value = state.settings.breakMinutes;
  elements.totalSets.value = state.settings.totalSets;
  elements.alarmSound.value = state.settings.alarmSound || 'classic';
  elements.birdSound.value = state.settings.birdSound || 'uguisu';
  const selectedTheme = state.settings.theme || 'alpine';
  elements.themeOptions.forEach((option) => {
    option.checked = option.value === selectedTheme;
  });
  elements.soundEnabled.checked = state.settings.soundEnabled;
  elements.notificationsEnabled.checked = state.settings.notificationsEnabled;
}

async function refreshState() {
  const response = await sendMessage({ type: 'GET_STATE' });
  state = response;
  applyTheme(state.settings.theme);
  renderTimer();
  fillSettingsForm();
}

function setSettingsVisibility(visible) {
  showingSettings = visible;
  elements.timerView.hidden = visible;
  elements.settingsView.hidden = !visible;
  elements.settingsToggle.textContent = visible ? '戻る' : '設定';
  elements.settingsToggle.setAttribute('aria-expanded', String(visible));
  if (visible) fillSettingsForm();
}

elements.settingsToggle.addEventListener('click', () => {
  setSettingsVisibility(!showingSettings);
});

elements.themeOptions.forEach((option) => {
  option.addEventListener('change', (event) => {
    if (event.target.checked) applyTheme(event.target.value);
  });
});

document.querySelectorAll('.step-button').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target);
    const delta = Number(button.dataset.delta);
    const min = Number(input.min);
    const max = Number(input.max);
    const current = Number(input.value) || min;
    input.value = Math.min(max, Math.max(min, current + delta));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
});

elements.startPauseButton.addEventListener('click', async () => {
  const type = state.timer.status === 'running' ? 'PAUSE' : 'START';
  await sendMessage({ type });
  await refreshState();
});

elements.resetButton.addEventListener('click', async () => {
  await sendMessage({ type: 'RESET' });
  await refreshState();
});

elements.skipButton.addEventListener('click', async () => {
  await sendMessage({ type: 'SKIP' });
  await refreshState();
});

elements.testSoundButton.addEventListener('click', async () => {
  elements.testSoundButton.disabled = true;
  try {
    await sendMessage({ type: 'PLAY_TEST_SOUND', soundId: elements.alarmSound.value });
  } finally {
    setTimeout(() => {
      elements.testSoundButton.disabled = false;
    }, 1200);
  }
});

elements.testBirdButton.addEventListener('click', async () => {
  elements.testBirdButton.disabled = true;
  try {
    await sendMessage({ type: 'PLAY_BIRD_TEST_SOUND', birdId: elements.birdSound.value });
  } finally {
    setTimeout(() => {
      elements.testBirdButton.disabled = false;
    }, 1200);
  }
});

elements.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const response = await sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: {
      workMinutes: elements.workMinutes.value,
      breakMinutes: elements.breakMinutes.value,
      totalSets: elements.totalSets.value,
      alarmSound: elements.alarmSound.value,
      birdSound: elements.birdSound.value,
      theme: document.querySelector('input[name="theme"]:checked')?.value || 'alpine',
      soundEnabled: elements.soundEnabled.checked,
      notificationsEnabled: elements.notificationsEnabled.checked
    }
  });

  if (!response?.ok) return;
  state = { settings: response.settings, timer: response.timer };
  applyTheme(state.settings.theme);
  setSettingsVisibility(false);
  renderTimer();
});

window.addEventListener('beforeunload', () => {
  if (intervalId) clearInterval(intervalId);
});

refreshState().then(() => {
  intervalId = setInterval(renderTimer, 250);
});
