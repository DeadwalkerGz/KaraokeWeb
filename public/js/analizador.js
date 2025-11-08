let contexto, buffer, resultado = [];

// ======= FUNCIÓN PRINCIPAL DE ANÁLISIS =======
async function analizarAudio() {
  const archivo = document.getElementById('archivoAudio').files[0];
  if (!archivo) return alert('Por favor selecciona un archivo MP3 o WAV.');

  document.getElementById('log').textContent = 'Cargando audio...';
  contexto = new AudioContext();
  const arrayBuffer = await archivo.arrayBuffer();
  buffer = await contexto.decodeAudioData(arrayBuffer);

  const sampleRate = buffer.sampleRate;
  const canal = buffer.getChannelData(0);
  const chunkSize = Math.floor(sampleRate * 0.025); // 25 ms
  const overlap = 0.75;
  const stepSize = Math.floor(chunkSize * (1 - overlap));

  resultado = [];
  document.getElementById('log').textContent = 'Analizando... (esto puede tardar unos segundos)';

  for (let i = 0; i < canal.length - chunkSize; i += stepSize) {
    const segmento = canal.slice(i, i + chunkSize);
    const frecuencia = detectarTono(segmento, sampleRate);

    // ✅ Filtro de rango vocal (descarta ruido)
    if (frecuencia >= 80 && frecuencia <= 1200) {
      const tiempo = i / sampleRate;
      resultado.push({ tiempo: parseFloat(tiempo.toFixed(2)), frecuencia: parseFloat(frecuencia.toFixed(2)) });
    }
  }

  // ✅ Filtro de saltos bruscos (>200 Hz)
  resultado = resultado.filter((p, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return Math.abs(p.frecuencia - prev.frecuencia) < 200;
  });

  // ✅ Promediado local (suaviza picos)
  const suavizado = resultado.map((p, i, arr) => {
    const prev = arr[i - 1]?.frecuencia ?? p.frecuencia;
    const next = arr[i + 1]?.frecuencia ?? p.frecuencia;
    const prom = (prev + p.frecuencia + next) / 3;
    return { tiempo: p.tiempo, frecuencia: parseFloat(prom.toFixed(2)) };
  });
  resultado = suavizado;

  // ✅ Log final
  const duracion = (canal.length / sampleRate).toFixed(2);
  document.getElementById('log').textContent =
    `✅ Análisis completado.\nMuestras registradas: ${resultado.length}\nDuración: ${duracion}s`;
}

// ======= EXPORTAR ARCHIVO JSON =======
function exportarJSON() {
  if (resultado.length === 0) {
    alert('No hay resultados aún.');
    return;
  }
  const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cancionUno.json';
  a.click();
  document.getElementById('log').textContent += '\n📁 Archivo descargado correctamente.';
}

// ======= DETECTOR DE TONO (AUTOCORRELACIÓN OPTIMIZADA) =======
function detectarTono(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1, threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < threshold) { r2 = SIZE - i; break; }
  buffer = buffer.slice(r1, r2);
  const newSize = buffer.length;

  const c = new Float32Array(newSize);
  for (let i = 0; i < newSize; i++) {
    let sum = 0;
    for (let j = 0; j < newSize - i; j++) sum += buffer[j] * buffer[j + i];
    c[i] = sum;
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < newSize; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  return sampleRate / maxpos;
}

// ======= ASIGNAR EVENTOS =======
window.addEventListener('DOMContentLoaded', () => {
  const btnAnalizar = document.getElementById('btnAnalizar');
  const btnExportar = document.getElementById('btnExportar');
  if (btnAnalizar) btnAnalizar.addEventListener('click', analizarAudio);
  if (btnExportar) btnExportar.addEventListener('click', exportarJSON);
});
