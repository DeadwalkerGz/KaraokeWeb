// analyze/songAnalyzer.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import decode from "audio-decode";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// Detección de tono por autocorrelación (ACF)
// ===============================
function detectPitchACF(frame, sampleRate) {
  // Cálculo RMS para descartar silencios
  let rms = 0;
  for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / frame.length);
  if (rms < 0.008) return { hz: 0, rms }; // silencio

  // Autocorrelación
  const SIZE = frame.length;
  const c = new Float32Array(SIZE);
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0;
    for (let j = 0; j < SIZE - lag; j++) sum += frame[j] * frame[j + lag];
    c[lag] = sum;
  }

  // Pico principal
  let d = 0;
  while (d < SIZE && c[d] > c[d + 1]) d++;
  let maxv = -1, maxi = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxv) { maxv = c[i]; maxi = i; }
  }
  if (maxi <= 0) return { hz: 0, rms };

  // Interpolación parabólica
  const x1 = c[maxi - 1], x2 = c[maxi], x3 = c[maxi + 1] || x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a ? -b / (2 * a) : 0;
  const period = maxi + shift;
  const freq = sampleRate / period;

  const hz = isFinite(freq) && freq > 50 && freq < 2000 ? freq : 0;
  return { hz, rms };
}

// ===============================
// Analizador de pista (Hz + RMS)
// ===============================
export async function analyzeSong(fileName) {
  const filePath = path.join(__dirname, "../public/uploads", fileName);
  const refDir = path.join(__dirname, "../public/references");
  const outPath = path.join(refDir, fileName.replace(/\.[^/.]+$/, "_ref.json"));

  if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true });

  // ✅ Verificar que el archivo exista antes de leerlo
  if (!fs.existsSync(filePath)) {
    console.error("❌ No se encontró el archivo:", filePath);
    return;
  }

  const buffer = fs.readFileSync(filePath);
  const audioBuffer = await decode(buffer);
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  const hopSize = 2048;
  const reference = [];

  let lastHz = 0;
  for (let i = 0; i < channelData.length; i += hopSize) {
    const frame = channelData.slice(i, i + hopSize);
    if (frame.length < hopSize) continue;

    // Detectar pitch y energía
    const { hz, rms } = detectPitchACF(frame, sampleRate);

    // Suavizado de tono
    const smoothHz = hz > 50 && hz < 2000 ? (lastHz * 0.8 + hz * 0.2) : lastHz;
    lastHz = smoothHz;

    reference.push({
      t: parseFloat((i / sampleRate).toFixed(2)),
      hz: parseFloat(smoothHz.toFixed(2)),
      rms: parseFloat(rms.toFixed(4))
    });
  }

  fs.writeFileSync(outPath, JSON.stringify(reference, null, 2));
  console.log(`✅ Referencia (Hz + RMS) generada: ${outPath}`);
  return outPath;
}

// ===============================================
// 🚀 Ejecución directa desde la terminal
// Permite usar: node analyze/songAnalyzer.js archivo.mp3
// ===============================================
if (process.argv[2]) {
  const fileName = process.argv[2];
  analyzeSong(fileName)
    .then(() => console.log(`🏁 Análisis completado para ${fileName}`))
    .catch((err) => console.error("❌ Error en el análisis:", err));
}
