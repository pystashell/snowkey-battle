import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(SCRIPT_DIR, "../public/audio/sfx");

const clamp = (value, minimum = -1, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000 * 2 - 1;
  };
}

function pulse(time, center, width) {
  const distance = (time - center) / width;
  return Math.exp(-distance * distance * 3.5);
}

function normalize(samples, peakLevel = 0.88) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return samples;

  const gain = peakLevel / peak;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = clamp(Math.tanh(samples[index] * gain * 1.12) / Math.tanh(1.12));
  }
  return samples;
}

function synthSnowballPack() {
  const duration = 0.18;
  const samples = new Float64Array(Math.round(duration * SAMPLE_RATE));
  const random = seededNoise(0x534e4f57);
  let compressedSnow = 0;
  let previousNoise = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const noise = random();
    compressedSnow = compressedSnow * 0.82 + noise * 0.18;
    const icyGrain = noise - previousNoise * 0.68;
    previousNoise = noise;

    const grab = pulse(time, 0.035, 0.035);
    const squeeze = pulse(time, 0.102, 0.055);
    const crystalClicks =
      pulse(time, 0.024, 0.012) +
      pulse(time, 0.066, 0.014) * 0.82 +
      pulse(time, 0.118, 0.017) * 0.68;
    const pressure = (1 - Math.exp(-time * 100)) * Math.exp(-time * 15);
    const creak = Math.sin(2 * Math.PI * (390 - time * 720) * time)
      * squeeze
      * 0.045;
    const endFade = clamp((duration - time) / 0.018, 0, 1);

    samples[index] = (
      compressedSnow * (grab * 0.42 + squeeze * 0.58) +
      icyGrain * crystalClicks * 0.21 +
      icyGrain * pressure * 0.13 +
      creak
    ) * endFade;
  }

  return normalize(samples, 0.48);
}

function synthSnowballHit() {
  const duration = 0.19;
  const samples = new Float64Array(Math.round(duration * SAMPLE_RATE));
  const random = seededNoise(0x48495421);
  let packedBody = 0;
  let powderBase = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const noise = random();
    packedBody = packedBody * 0.86 + noise * 0.14;
    powderBase = powderBase * 0.58 + noise * 0.42;
    const powderSpray = noise - powderBase * 0.72;
    const contact = pulse(time, 0.018, 0.027);
    const snowBurst = pulse(time, 0.055, 0.07) * Math.exp(-time * 8);
    const softThump = Math.sin(2 * Math.PI * 74 * time) * Math.exp(-time * 34);
    const endFade = clamp((duration - time) / 0.022, 0, 1);

    samples[index] = (
      packedBody * contact * 0.9 +
      powderSpray * snowBurst * 0.42 +
      softThump * 0.14
    ) * endFade;
  }

  return normalize(samples, 0.56);
}

function synthPlayerDown() {
  const duration = 0.72;
  const samples = new Float64Array(Math.round(duration * SAMPLE_RATE));
  const random = seededNoise(0x444f574e);
  let bodyNoise = 0;
  let phase = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / SAMPLE_RATE;
    const noise = random();
    bodyNoise = bodyNoise * 0.93 + noise * 0.07;

    const dropProgress = Math.min(1, time / 0.55);
    const frequency = 118 * Math.pow(0.39, dropProgress);
    phase += 2 * Math.PI * frequency / SAMPLE_RATE;
    const fallingTone = Math.sin(phase) * Math.exp(-time * 4.1);
    const impactEnvelope = pulse(time, 0.105, 0.09);
    const settlingEnvelope = Math.exp(-Math.max(0, time - 0.12) * 6.4);
    const softImpact = bodyNoise * impactEnvelope;
    const snowSettle = noise * settlingEnvelope * (time > 0.1 ? 1 : 0);

    samples[index] =
      fallingTone * 0.43 +
      softImpact * 0.88 +
      snowSettle * 0.13;
  }

  return normalize(samples, 0.82);
}

function encodePcmWav(samples) {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = samples.length * CHANNELS * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(Math.round(clamp(samples[index]) * 32_767), 44 + index * bytesPerSample);
  }

  return buffer;
}

const effects = [
  ["snowball-pack.wav", synthSnowballPack],
  ["snowball-hit.wav", synthSnowballHit],
  ["player-down.wav", synthPlayerDown],
];

await mkdir(OUTPUT_DIR, { recursive: true });

for (const [filename, synthesize] of effects) {
  const outputPath = path.join(OUTPUT_DIR, filename);
  const wav = encodePcmWav(synthesize());
  await writeFile(outputPath, wav);
  console.log(`${filename}: ${wav.length} bytes`);
}
