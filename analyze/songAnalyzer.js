// analyze/songAnalyzer.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import decode from "audio-decode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analiza una canción MP3/WAV/OGG y genera una referencia de frecuencias reales (pitch)
 * usando detección por autocorrelación (ACF), igual que el micrófono.
 */
export async function analyzeSong(fileName) {
  const filePath = path.join(__dirname, "../public/uploads", fileName);
  const refDir = path.join(__dirname, "../public/references");
  const outPath = path.join(refDir, fileName.replace(/\.[^/.]+$/, "_ref.json"));

  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

  const buffer = fs.readFileSync(filePath);
  const audioBuffer = await decode(buffer);
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  const hopSize = 2048;
  const reference = [];

  // Detección de frecuencia fundamental (ACF)
  function detectPitchACF(frame, sampleRate) {
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);
    if (rms < 0.01) return null; // muy silencioso

    const SIZE = frame.length;
    const c = new Float32Array(SIZE);
    for (let lag = 0; lag < SIZE; lag++) {
      let sum = 0;
      for (let j = 0; j < SIZE - lag; j++) sum += frame[j] * frame[j + lag];
      c[lag] = sum;
    }

    let d = 0;
    while (d < SIZE && c[d] > c[d + 1]) d++;
    let maxv = -1, maxi = -1;
    for (let i2 = d; i2 < SIZE; i2++) {
      if (c[i2] > maxv) {
        maxv = c[i2];
        maxi = i2;
      }
    }
    if (maxi <= 0) return null;

    const x1 = c[maxi - 1],
      x2 = c[maxi],
      x3 = c[maxi + 1] || x2;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    const shift = a ? -b / (2 * a) : 0;
    const period = maxi + shift;
    const freq = sampleRate / period;
    return isFinite(freq) ? freq : null;
  }

  let lastValidHz = 0;

  for (let i = 0; i < channelData.length; i += hopSize) {
    const frame = channelData.slice(i, i + hopSize);
    if (frame.length < hopSize) continue;

    const hz = detectPitchACF(frame, sampleRate);
    if (hz && hz >= 50 && hz <= 1000) {
      // Suavizado para evitar saltos
      const smoothHz = lastValidHz * 0.7 + hz * 0.3;
      lastValidHz = smoothHz;
      reference.push({ t: +(i / sampleRate).toFixed(2), hz: +smoothHz.toFixed(2) });
    } else {
      // Si no hay tono, conserva el último válido
      reference.push({ t: +(i / sampleRate).toFixed(2), hz: +lastValidHz.toFixed(2) });
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(reference, null, 2));
  console.log(`✅ Referencia generada con ACF: ${outPath}`);
  return outPath;
}
