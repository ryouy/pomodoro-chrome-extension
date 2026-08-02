let audioContext;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getContext() {
  audioContext ||= new AudioContext();
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  return audioContext;
}

function createEnvelope(context, gainNode, startTime, attack, peak, releaseTo, endTime) {
  gainNode.gain.cancelScheduledValues(startTime);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(peak, startTime + attack);
  gainNode.gain.exponentialRampToValueAtTime(releaseTo, endTime);
}

function scheduleTone(context, {
  time,
  frequency,
  duration,
  type = 'sine',
  volume = 0.18,
  attack = 0.01,
  releaseFloor = 0.0001,
  sweepTo = null,
  detune = 0
}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  if (sweepTo) {
    oscillator.frequency.exponentialRampToValueAtTime(sweepTo, time + duration);
  }
  if (detune) {
    oscillator.detune.setValueAtTime(detune, time);
  }

  createEnvelope(context, gain, time, attack, volume, releaseFloor, time + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.03);
}

function scheduleBell(context, time, frequency, duration, volume) {
  scheduleTone(context, { time, frequency, duration, type: 'sine', volume, attack: 0.002, releaseFloor: 0.00012 });
  scheduleTone(context, { time, frequency: frequency * 2.01, duration: duration * 0.88, type: 'sine', volume: volume * 0.55, attack: 0.002, releaseFloor: 0.00012 });
  scheduleTone(context, { time, frequency: frequency * 2.97, duration: duration * 0.72, type: 'triangle', volume: volume * 0.22, attack: 0.002, releaseFloor: 0.00012 });
}

function scheduleBirdChirp(context, {
  time,
  from,
  to,
  duration,
  volume = 0.075,
  harmonic = 0.24,
  vibratoRate = 24,
  vibratoDepth = 16,
  breath = 0.012
}) {
  const gain = context.createGain();
  const oscillator = context.createOscillator();
  const overtone = context.createOscillator();
  const overtoneGain = context.createGain();
  const vibrato = context.createOscillator();
  const vibratoGain = context.createGain();

  oscillator.type = 'sine';
  overtone.type = 'sine';
  oscillator.frequency.setValueAtTime(from, time);
  oscillator.frequency.exponentialRampToValueAtTime(to, time + duration);
  overtone.frequency.setValueAtTime(from * 2.015, time);
  overtone.frequency.exponentialRampToValueAtTime(to * 2.015, time + duration);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(0.018, duration * 0.2));
  gain.gain.setValueAtTime(volume * 0.85, time + duration * 0.65);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  overtoneGain.gain.setValueAtTime(harmonic, time);

  vibrato.frequency.setValueAtTime(vibratoRate, time);
  vibratoGain.gain.setValueAtTime(vibratoDepth, time);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(oscillator.detune);
  vibratoGain.connect(overtone.detune);

  oscillator.connect(gain);
  overtone.connect(overtoneGain);
  overtoneGain.connect(gain);
  gain.connect(context.destination);

  if (breath > 0) {
    const frameCount = Math.ceil(context.sampleRate * duration);
    const noiseBuffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / frameCount * 0.35);
    }
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = (from + to) / 2;
    filter.Q.value = 3.5;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.linearRampToValueAtTime(breath, time + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(context.destination);
    noise.start(time);
    noise.stop(time + duration);
  }

  oscillator.start(time);
  overtone.start(time);
  vibrato.start(time);
  oscillator.stop(time + duration + 0.02);
  overtone.stop(time + duration + 0.02);
  vibrato.stop(time + duration + 0.02);
}

async function playClassic(context) {
  const now = context.currentTime + 0.03;
  scheduleTone(context, { time: now, frequency: 660, duration: 0.16, type: 'square', volume: 0.13 });
  scheduleTone(context, { time: now + 0.22, frequency: 660, duration: 0.16, type: 'square', volume: 0.13 });
  scheduleTone(context, { time: now + 0.44, frequency: 880, duration: 0.28, type: 'square', volume: 0.14 });
}

async function playDigital(context) {
  const now = context.currentTime + 0.03;
  [1046, 1318, 1567, 1318].forEach((frequency, index) => {
    scheduleTone(context, { time: now + index * 0.13, frequency, duration: 0.09, type: 'triangle', volume: 0.12, attack: 0.004 });
  });
}

async function playGentle(context) {
  const now = context.currentTime + 0.03;
  scheduleTone(context, { time: now, frequency: 523, duration: 0.22, type: 'sine', volume: 0.14, attack: 0.02 });
  scheduleTone(context, { time: now + 0.25, frequency: 659, duration: 0.22, type: 'sine', volume: 0.13, attack: 0.02 });
  scheduleTone(context, { time: now + 0.50, frequency: 784, duration: 0.34, type: 'sine', volume: 0.12, attack: 0.02 });
}

async function playBellTone(context) {
  const now = context.currentTime + 0.03;
  scheduleBell(context, now, 784, 0.8, 0.13);
  scheduleBell(context, now + 0.28, 1046, 0.95, 0.11);
}

async function playCrystal(context) {
  const now = context.currentTime + 0.03;
  scheduleTone(context, { time: now, frequency: 988, duration: 0.16, type: 'triangle', volume: 0.10, attack: 0.006 });
  scheduleTone(context, { time: now + 0.17, frequency: 1318, duration: 0.16, type: 'triangle', volume: 0.10, attack: 0.006 });
  scheduleTone(context, { time: now + 0.34, frequency: 1760, duration: 0.34, type: 'triangle', volume: 0.095, attack: 0.006 });
  scheduleTone(context, { time: now + 0.34, frequency: 1320, duration: 0.34, type: 'sine', volume: 0.05, attack: 0.006 });
}

async function playUguisu(context) {
  const start = context.currentTime + 0.04;
  [
    [0, 1850, 1500, 0.15, 0.065],
    [0.22, 1650, 2600, 0.22, 0.08],
    [0.45, 2550, 2100, 0.12, 0.07],
    [0.59, 2100, 3050, 0.24, 0.08],
    [0.86, 2850, 2300, 0.13, 0.06]
  ].forEach(([offset, from, to, duration, volume]) => {
    scheduleBirdChirp(context, { time: start + offset, from, to, duration, volume, vibratoRate: 28, vibratoDepth: 20 });
  });
}

async function playRobin(context) {
  const start = context.currentTime + 0.04;
  const notes = [
    [0, 2200, 3300, 0.1], [0.12, 3100, 2450, 0.08],
    [0.23, 2500, 3700, 0.13], [0.38, 3450, 2800, 0.09],
    [0.51, 2050, 3150, 0.11], [0.64, 3000, 3900, 0.08],
    [0.75, 3600, 2550, 0.14]
  ];
  notes.forEach(([offset, from, to, duration], index) => {
    scheduleBirdChirp(context, {
      time: start + offset,
      from,
      to,
      duration,
      volume: index % 2 ? 0.052 : 0.068,
      harmonic: 0.18,
      vibratoRate: 31,
      vibratoDepth: 24
    });
  });
}

async function playTit(context) {
  const start = context.currentTime + 0.04;
  [0, 0.19, 0.44, 0.63].forEach((offset, index) => {
    scheduleBirdChirp(context, {
      time: start + offset,
      from: index < 2 ? 3250 : 3000,
      to: index % 2 === 0 ? 2700 : 2450,
      duration: 0.12,
      volume: 0.07,
      harmonic: 0.2,
      vibratoRate: 20,
      vibratoDepth: 12
    });
  });
}

async function playCuckoo(context) {
  const start = context.currentTime + 0.04;
  [0, 0.7].forEach((phraseOffset) => {
    scheduleBirdChirp(context, { time: start + phraseOffset, from: 820, to: 780, duration: 0.25, volume: 0.085, harmonic: 0.42, vibratoRate: 7, vibratoDepth: 9, breath: 0.006 });
    scheduleBirdChirp(context, { time: start + phraseOffset + 0.29, from: 650, to: 620, duration: 0.34, volume: 0.09, harmonic: 0.4, vibratoRate: 7, vibratoDepth: 8, breath: 0.006 });
  });
}

async function playSparrow(context) {
  const start = context.currentTime + 0.04;
  [0, 0.09, 0.23, 0.34, 0.49, 0.58, 0.72].forEach((offset, index) => {
    const rising = index % 3 !== 1;
    scheduleBirdChirp(context, {
      time: start + offset,
      from: rising ? 2800 : 3800,
      to: rising ? 4100 : 2750,
      duration: index % 2 ? 0.065 : 0.085,
      volume: 0.045,
      harmonic: 0.12,
      vibratoRate: 38,
      vibratoDepth: 28,
      breath: 0.026
    });
  });
}

async function playSound(soundId) {
  const context = await getContext();

  switch (soundId) {
    case 'classic':
      await playClassic(context);
      break;
    case 'digital':
      await playDigital(context);
      break;
    case 'gentle':
      await playGentle(context);
      break;
    case 'bell':
      await playBellTone(context);
      break;
    case 'crystal':
      await playCrystal(context);
      break;
    case 'bird':
    case 'bird-uguisu':
      await playUguisu(context);
      break;
    case 'bird-robin':
      await playRobin(context);
      break;
    case 'bird-tit':
      await playTit(context);
      break;
    case 'bird-cuckoo':
      await playCuckoo(context);
      break;
    case 'bird-sparrow':
      await playSparrow(context);
      break;
    default:
      await playClassic(context);
  }

  await sleep(80);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message?.type !== 'PLAY_SOUND') {
    return false;
  }

  playSound(message.soundId)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
