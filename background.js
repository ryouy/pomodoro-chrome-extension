const TIMER_ALARM = 'pomodoro-phase-end';
const OFFSCREEN_URL = 'offscreen.html';

const THEMES = Object.freeze({
  alpine: { accent: '#2b77c5' },
  forest: { accent: '#2f7c5d' },
  sunrise: { accent: '#d36c33' },
  twilight: { accent: '#5c64d6' },
  sakura: { accent: '#c45f88' }
});

const VALID_SOUNDS = new Set(['classic', 'digital', 'gentle', 'bell', 'crystal']);
const VALID_BIRD_SOUNDS = new Set(['uguisu', 'robin', 'tit', 'cuckoo', 'sparrow']);
const VALID_THEMES = new Set(Object.keys(THEMES));

const DEFAULT_SETTINGS = Object.freeze({
  workMinutes: 25,
  breakMinutes: 5,
  totalSets: 4,
  alarmSound: 'classic',
  birdSound: 'uguisu',
  theme: 'alpine',
  soundEnabled: true,
  notificationsEnabled: true
});

function initialTimer(settings = DEFAULT_SETTINGS) {
  return {
    status: 'idle',
    phase: 'work',
    currentSet: 1,
    remainingSeconds: settings.workMinutes * 60,
    endTime: null
  };
}

function normalizeSettings(raw = {}) {
  return {
    workMinutes: Math.min(180, Math.max(1, Number(raw.workMinutes) || DEFAULT_SETTINGS.workMinutes)),
    breakMinutes: Math.min(60, Math.max(1, Number(raw.breakMinutes) || DEFAULT_SETTINGS.breakMinutes)),
    totalSets: Math.min(12, Math.max(1, Number(raw.totalSets) || DEFAULT_SETTINGS.totalSets)),
    alarmSound: VALID_SOUNDS.has(raw.alarmSound) ? raw.alarmSound : DEFAULT_SETTINGS.alarmSound,
    birdSound: VALID_BIRD_SOUNDS.has(raw.birdSound) ? raw.birdSound : DEFAULT_SETTINGS.birdSound,
    theme: VALID_THEMES.has(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    soundEnabled: raw.soundEnabled !== undefined ? Boolean(raw.soundEnabled) : DEFAULT_SETTINGS.soundEnabled,
    notificationsEnabled: raw.notificationsEnabled !== undefined ? Boolean(raw.notificationsEnabled) : DEFAULT_SETTINGS.notificationsEnabled
  };
}

async function getStoredData() {
  const stored = await chrome.storage.local.get(['settings', 'timer']);
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(stored.settings || {}) });
  const timer = stored.timer || initialTimer(settings);
  return { settings, timer };
}

async function saveData(settings, timer) {
  await chrome.storage.local.set({ settings, timer });
  await updateBadge(settings, timer);
}

function durationForPhase(settings, phase) {
  return (phase === 'work' ? settings.workMinutes : settings.breakMinutes) * 60;
}

function liveRemaining(timer) {
  if (timer.status !== 'running' || !timer.endTime) {
    return Math.max(0, Math.ceil(timer.remainingSeconds));
  }
  return Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
}

async function updateBadge(settings, timer) {
  const setNumber = Math.min(timer.currentSet, settings.totalSets);
  let title = `${timer.phase === 'break' ? '休憩' : '作業'}：セット ${setNumber}/${settings.totalSets}`;

  if (timer.status === 'running') {
    title = timer.phase === 'work'
      ? `作業中：セット ${setNumber}/${settings.totalSets}`
      : `休憩中：セット ${setNumber}/${settings.totalSets}`;
  } else if (timer.status === 'paused') {
    title = `一時停止中：${timer.phase === 'work' ? '作業' : '休憩'} セット ${setNumber}/${settings.totalSets}`;
  } else if (timer.status === 'complete') {
    title = `全${settings.totalSets}セット完了`;
  } else {
    title = `準備完了：作業 セット ${setNumber}/${settings.totalSets}`;
  }

  await chrome.action.setBadgeText({ text: '' });
  await chrome.action.setTitle({ title });
}

async function scheduleTimerAlarm(endTime) {
  await chrome.alarms.clear(TIMER_ALARM);
  await chrome.alarms.create(TIMER_ALARM, { when: endTime });
}

async function ensureOffscreenDocument() {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [documentUrl]
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'ポモドーロの作業・休憩終了時にアラーム音を再生するため'
  });
}

async function playSound(soundId) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PLAY_SOUND', soundId });
  } catch (error) {
    console.error('アラーム音を再生できませんでした。', error);
  }
}

async function playSelectedAlarm(settings) {
  await playSound(settings.alarmSound || DEFAULT_SETTINGS.alarmSound);
}

async function playBreakBirdSound(birdId = DEFAULT_SETTINGS.birdSound) {
  const selectedBird = VALID_BIRD_SOUNDS.has(birdId) ? birdId : DEFAULT_SETTINGS.birdSound;
  await playSound(`bird-${selectedBird}`);
}

async function showNotification(title, message) {
  try {
    await chrome.notifications.create(`pomodoro-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2,
      silent: true
    });
  } catch (error) {
    console.error('通知を表示できませんでした。', error);
  }
}

async function announceTransition(settings, completedPhase, completedSet, isComplete) {
  if (settings.soundEnabled) {
    if (isComplete) {
      await playSelectedAlarm(settings);
    } else if (completedPhase === 'work') {
      await playBreakBirdSound(settings.birdSound);
    } else {
      await playSelectedAlarm(settings);
    }
  }

  if (!settings.notificationsEnabled) return;

  if (isComplete) {
    await showNotification('ポモドーロ完了', `${settings.totalSets}セットすべて完了しました。お疲れさまでした。`);
  } else if (completedPhase === 'work') {
    await showNotification('作業時間が終了しました', `セット ${completedSet}/${settings.totalSets} 完了。休憩を始めます。`);
  } else {
    await showNotification('休憩が終了しました', `セット ${completedSet + 1}/${settings.totalSets} の作業を始めます。`);
  }
}

async function advancePhase() {
  const { settings, timer } = await getStoredData();
  if (timer.status !== 'running') return;

  const completedPhase = timer.phase;
  const completedSet = timer.currentSet;
  let nextTimer;
  let isComplete = false;

  if (completedPhase === 'work') {
    if (completedSet >= settings.totalSets) {
      isComplete = true;
      nextTimer = {
        status: 'complete',
        phase: 'work',
        currentSet: settings.totalSets,
        remainingSeconds: 0,
        endTime: null
      };
      await chrome.alarms.clear(TIMER_ALARM);
    } else {
      const seconds = durationForPhase(settings, 'break');
      nextTimer = {
        status: 'running',
        phase: 'break',
        currentSet: completedSet,
        remainingSeconds: seconds,
        endTime: Date.now() + seconds * 1000
      };
      await scheduleTimerAlarm(nextTimer.endTime);
    }
  } else {
    const seconds = durationForPhase(settings, 'work');
    nextTimer = {
      status: 'running',
      phase: 'work',
      currentSet: completedSet + 1,
      remainingSeconds: seconds,
      endTime: Date.now() + seconds * 1000
    };
    await scheduleTimerAlarm(nextTimer.endTime);
  }

  await saveData(settings, nextTimer);
  await announceTransition(settings, completedPhase, completedSet, isComplete);
}

async function reconcileTimer() {
  const { settings, timer } = await getStoredData();

  if (timer.status !== 'running' || !timer.endTime) {
    await updateBadge(settings, timer);
    return;
  }

  if (timer.endTime <= Date.now()) {
    await advancePhase();
  } else {
    await scheduleTimerAlarm(timer.endTime);
    await updateBadge(settings, timer);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settings', 'timer']);
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(stored.settings || {}) });
  const timer = stored.timer || initialTimer(settings);
  await saveData(settings, timer);
});

chrome.runtime.onStartup.addListener(() => {
  reconcileTimer().catch(console.error);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM) {
    advancePhase().catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === 'offscreen') return false;

  (async () => {
    const { settings, timer } = await getStoredData();

    switch (message?.type) {
      case 'GET_STATE': {
        sendResponse({
          settings,
          timer: { ...timer, remainingSeconds: liveRemaining(timer) }
        });
        break;
      }

      case 'START': {
        if (timer.status === 'running') {
          sendResponse({ ok: true });
          break;
        }

        const remaining = timer.status === 'complete'
          ? settings.workMinutes * 60
          : Math.max(1, timer.remainingSeconds || durationForPhase(settings, timer.phase));

        const nextTimer = timer.status === 'complete'
          ? {
              status: 'running',
              phase: 'work',
              currentSet: 1,
              remainingSeconds: remaining,
              endTime: Date.now() + remaining * 1000
            }
          : {
              ...timer,
              status: 'running',
              remainingSeconds: remaining,
              endTime: Date.now() + remaining * 1000
            };

        await scheduleTimerAlarm(nextTimer.endTime);
        await saveData(settings, nextTimer);
        sendResponse({ ok: true, timer: nextTimer });
        break;
      }

      case 'PAUSE': {
        if (timer.status !== 'running') {
          sendResponse({ ok: true });
          break;
        }

        const nextTimer = {
          ...timer,
          status: 'paused',
          remainingSeconds: liveRemaining(timer),
          endTime: null
        };
        await chrome.alarms.clear(TIMER_ALARM);
        await saveData(settings, nextTimer);
        sendResponse({ ok: true, timer: nextTimer });
        break;
      }

      case 'RESET': {
        await chrome.alarms.clear(TIMER_ALARM);
        const nextTimer = initialTimer(settings);
        await saveData(settings, nextTimer);
        sendResponse({ ok: true, timer: nextTimer });
        break;
      }

      case 'SKIP': {
        if (timer.status === 'complete') {
          sendResponse({ ok: true });
          break;
        }

        const runningTimer = timer.status === 'running'
          ? timer
          : {
              ...timer,
              status: 'running',
              endTime: Date.now()
            };
        await saveData(settings, runningTimer);
        await advancePhase();
        sendResponse({ ok: true });
        break;
      }

      case 'UPDATE_SETTINGS': {
        const nextSettings = normalizeSettings(message.settings);
        await chrome.alarms.clear(TIMER_ALARM);
        const nextTimer = initialTimer(nextSettings);
        await saveData(nextSettings, nextTimer);
        sendResponse({ ok: true, settings: nextSettings, timer: nextTimer });
        break;
      }

      case 'PLAY_TEST_SOUND': {
        const soundId = VALID_SOUNDS.has(message.soundId) ? message.soundId : settings.alarmSound;
        await playSound(soundId);
        sendResponse({ ok: true });
        break;
      }

      case 'PLAY_BIRD_TEST_SOUND': {
        await playBreakBirdSound(message.birdId || settings.birdSound);
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ ok: false, error: 'Unknown message type' });
    }
  })().catch((error) => {
    console.error(error);
    sendResponse({ ok: false, error: error.message });
  });

  return true;
});

reconcileTimer().catch(console.error);
