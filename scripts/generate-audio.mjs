import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44_100;
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio');

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function makeBuffer(seconds) {
  return new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
}

function addTone(buffer, { start = 0, duration, frequency, endFrequency, volume = 0.3, type = 'sine' }) {
  const startSample = Math.floor(start * SAMPLE_RATE);
  const length = Math.floor(duration * SAMPLE_RATE);
  for (let index = 0; index < length; index += 1) {
    const t = index / SAMPLE_RATE;
    const progress = index / Math.max(1, length - 1);
    const envelope = Math.min(1, progress * 60) * Math.exp(-progress * 5.5);
    const freq = frequency + (endFrequency - frequency) * progress;
    const phase = 2 * Math.PI * freq * t;
    const wave =
      type === 'triangle'
        ? (2 / Math.PI) * Math.asin(Math.sin(phase))
        : Math.sin(phase);
    const target = startSample + index;
    if (target < buffer.length) buffer[target] += wave * envelope * volume;
  }
}

function addNoise(buffer, { start = 0, duration, volume, seed, lowpass = 0.55 }) {
  const random = mulberry32(seed);
  const startSample = Math.floor(start * SAMPLE_RATE);
  const length = Math.floor(duration * SAMPLE_RATE);
  let filtered = 0;
  for (let index = 0; index < length; index += 1) {
    const progress = index / Math.max(1, length - 1);
    const envelope = Math.exp(-progress * 9);
    const noise = random() * 2 - 1;
    filtered = filtered * lowpass + noise * (1 - lowpass);
    const target = startSample + index;
    if (target < buffer.length) buffer[target] += filtered * envelope * volume;
  }
}

function finish(buffer, volume = 0.72) {
  let peak = 0;
  for (const sample of buffer) peak = Math.max(peak, Math.abs(sample));
  const scale = peak > 0 ? Math.min(1, volume / peak) : 1;
  const pcm = Buffer.alloc(buffer.length * 2);
  for (let index = 0; index < buffer.length; index += 1) {
    const value = Math.max(-1, Math.min(1, buffer[index] * scale));
    pcm.writeInt16LE(Math.round(value * 32_767), index * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function keySound(seed, baseFrequency, duration) {
  const buffer = makeBuffer(duration + 0.03);
  addNoise(buffer, { duration: duration * 0.55, volume: 0.9, seed, lowpass: 0.35 });
  addTone(buffer, {
    duration,
    frequency: baseFrequency,
    endFrequency: baseFrequency * 0.55,
    volume: 0.45,
    type: 'triangle',
  });
  return finish(buffer, 0.55);
}

mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(resolve(OUT_DIR, 'key-01.wav'), keySound(11, 170, 0.055));
writeFileSync(resolve(OUT_DIR, 'key-02.wav'), keySound(29, 205, 0.07));
writeFileSync(resolve(OUT_DIR, 'key-03.wav'), keySound(47, 145, 0.045));

const backspace = makeBuffer(0.12);
addNoise(backspace, { duration: 0.03, volume: 0.8, seed: 71, lowpass: 0.3 });
addTone(backspace, { duration: 0.05, frequency: 240, endFrequency: 150, volume: 0.4 });
addNoise(backspace, { start: 0.055, duration: 0.025, volume: 0.45, seed: 83, lowpass: 0.4 });
writeFileSync(resolve(OUT_DIR, 'backspace.wav'), finish(backspace, 0.5));

const submit = makeBuffer(0.2);
addNoise(submit, { duration: 0.05, volume: 0.85, seed: 97, lowpass: 0.25 });
addTone(submit, { duration: 0.1, frequency: 120, endFrequency: 72, volume: 0.55, type: 'triangle' });
addNoise(submit, { start: 0.08, duration: 0.03, volume: 0.25, seed: 101, lowpass: 0.4 });
writeFileSync(resolve(OUT_DIR, 'submit.wav'), finish(submit, 0.62));

const correct = makeBuffer(0.5);
addNoise(correct, { duration: 0.025, volume: 0.25, seed: 131, lowpass: 0.35 });
addTone(correct, { start: 0.02, duration: 0.18, frequency: 659.25, endFrequency: 659.25, volume: 0.32 });
addTone(correct, { start: 0.14, duration: 0.3, frequency: 880, endFrequency: 880, volume: 0.28 });
addTone(correct, { start: 0.14, duration: 0.3, frequency: 1_320, endFrequency: 1_320, volume: 0.08 });
writeFileSync(resolve(OUT_DIR, 'correct.wav'), finish(correct, 0.5));

const wrong = makeBuffer(0.36);
addTone(wrong, { duration: 0.2, frequency: 196, endFrequency: 130, volume: 0.4, type: 'triangle' });
addTone(wrong, { start: 0.06, duration: 0.24, frequency: 146.83, endFrequency: 110, volume: 0.26 });
addNoise(wrong, { duration: 0.03, volume: 0.14, seed: 151, lowpass: 0.5 });
writeFileSync(resolve(OUT_DIR, 'wrong.wav'), finish(wrong, 0.42));

console.log('Generated typewriter audio assets in', OUT_DIR);
