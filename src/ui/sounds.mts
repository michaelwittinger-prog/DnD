/**
 * sounds.mjs — MIR S1.8 Sound Effects.
 *
 * Lightweight procedural audio using Web Audio API oscillators.
 * No external audio files needed — everything is synthesized.
 *
 * Call initSounds() once on first user interaction to unlock AudioContext.
 */

let audioCtx = null;
let soundEnabled = true;

/**
 * Initialize the audio context. Must be called from a user gesture.
 */
export function initSounds() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    console.warn("[sounds] Web Audio not available");
  }
}

/**
 * Enable/disable sound effects.
 * @param {boolean} enabled
 */
export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

export function isSoundEnabled() {
  return soundEnabled;
}

// ── Synthesized sound effects ───────────────────────────────────────

function playTone(freq, duration, type = "sine", volume = 0.15) {
  if (!audioCtx || !soundEnabled) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playNoise(duration, volume = 0.08) {
  if (!audioCtx || !soundEnabled) return;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

/** Footstep — soft low thud */
export function playMove() {
  playTone(120, 0.1, "sine", 0.08);
  setTimeout(() => playTone(100, 0.08, "sine", 0.06), 80);
}

/** Sword hit — sharp high + impact */
export function playHit() {
  playNoise(0.15, 0.12);
  playTone(800, 0.08, "square", 0.1);
  setTimeout(() => playTone(200, 0.15, "sawtooth", 0.08), 50);
}

/** Miss — whoosh */
export function playMiss() {
  playTone(600, 0.12, "sine", 0.06);
  setTimeout(() => playTone(300, 0.15, "sine", 0.04), 60);
}

/** Kill — dramatic low boom */
export function playKill() {
  playTone(80, 0.4, "sawtooth", 0.15);
  playNoise(0.3, 0.1);
  setTimeout(() => playTone(60, 0.3, "sine", 0.1), 100);
}

/** Initiative roll — dice rattle */
export function playInitiative() {
  for (let i = 0; i < 6; i++) {
    setTimeout(() => playTone(400 + Math.random() * 400, 0.05, "square", 0.06), i * 40);
  }
  setTimeout(() => playTone(900, 0.15, "sine", 0.1), 280);
}

/** Turn start — gentle chime */
export function playTurnStart() {
  playTone(523, 0.12, "sine", 0.08);
  setTimeout(() => playTone(659, 0.12, "sine", 0.08), 100);
  setTimeout(() => playTone(784, 0.15, "sine", 0.1), 200);
}

/** Error/rejection — low buzz */
export function playError() {
  playTone(150, 0.2, "square", 0.06);
}

/** Combat end — victory fanfare */
export function playCombatEnd() {
  playTone(523, 0.15, "sine", 0.12);
  setTimeout(() => playTone(659, 0.15, "sine", 0.12), 150);
  setTimeout(() => playTone(784, 0.2, "sine", 0.14), 300);
  setTimeout(() => playTone(1047, 0.4, "sine", 0.16), 500);
}
