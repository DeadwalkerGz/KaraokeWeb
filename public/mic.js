// ✅ Variables globales
let audioContext;
let analyser;
let buffer;

const notaObjetivo = 440;
const margenError = 5;

// ✅ Parámetros de análisis (puedes ajustarlos)
const CONFIG = {
  fftSize: 1024,          // antes 2048 → más velocidad
  suavizado: 60,           // antes 10 → respuesta más rápida
  filtroBajo: 2000,       // antes 1000 Hz → captura más armónicos
};

// ✅ Función global: actualizarAfinacion
function actualizarAfinacion(frecuencia, afinacionP) {
  if (frecuencia === null) {
    afinacionP.textContent = "🎶 Esperando tono...";
    afinacionP.style.color = "#ccc";
    return;
  }

  const diferencia = frecuencia - notaObjetivo;

  if (Math.abs(diferencia) <= margenError) {
    afinacionP.textContent = "✅ Afinado";
    afinacionP.style.color = "limegreen";
  } else if (diferencia > 0) {
    afinacionP.textContent = "📈 Muy alto";
    afinacionP.style.color = "orange";
  } else {
    afinacionP.textContent = "📉 Muy bajo";
    afinacionP.style.color = "red";
  }
}

// ✅ Carga el micrófono y ejecuta en DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  const frecuenciaSpan = document.getElementById('frecuencia');
  const afinacionP = document.getElementById('afinacion');
  const canvas = document.getElementById('barra-tono');
  const ctx = canvas.getContext('2d');

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);

      // 🎚️ Filtro paso banda para voz humana
      const filtroPasoBanda = audioContext.createBiquadFilter();
      filtroPasoBanda.type = "bandpass";
      filtroPasoBanda.frequency.value = 300;
      filtroPasoBanda.Q = 1.0;

      // 🎚️ Filtro paso alto (<80 Hz)
      const filtroPasoAlto = audioContext.createBiquadFilter();
      filtroPasoAlto.type = "highpass";
      filtroPasoAlto.frequency.value = 80;

      // 🎚️ Filtro paso bajo (>2000 Hz)
      const filtroPasoBajo = audioContext.createBiquadFilter();
      filtroPasoBajo.type = "lowpass";
      filtroPasoBajo.frequency.value = CONFIG.filtroBajo;

      // 🔗 Cadena de filtros: micrófono → alto → banda → bajo → analizador
      source.connect(filtroPasoAlto);
      filtroPasoAlto.connect(filtroPasoBanda);
      filtroPasoBanda.connect(filtroPasoBajo);

      analyser = audioContext.createAnalyser();
      analyser.fftSize = CONFIG.fftSize; // 🔹 Ventana de análisis más corta
      filtroPasoBajo.connect(analyser);

      buffer = new Float32Array(analyser.fftSize);

      detectarFrecuencia();
    })
    .catch(err => {
      console.error('No se pudo acceder al micrófono:', err);
      frecuenciaSpan.textContent = 'Error';
    });

  // 🔸 Suavizado
  const historialFrecuencias = [];
  const maxHistorial = CONFIG.suavizado;

  // 🔍 Detección de frecuencia
  function detectarFrecuencia() {
    analyser.getFloatTimeDomainData(buffer);
    const pitch = detectarTono(buffer, audioContext.sampleRate);

    if (pitch === -1 || isNaN(pitch)) {
      frecuenciaSpan.textContent = 'Error';
      dibujarBarra(0);
      actualizarAfinacion(null, afinacionP);
    } else {
      // 🎯 Suavizado: promedio de los últimos N valores
      historialFrecuencias.push(pitch);
      if (historialFrecuencias.length > maxHistorial) historialFrecuencias.shift();

      const promedio = historialFrecuencias.reduce((a, b) => a + b, 0) / historialFrecuencias.length;

      // Mostrar frecuencia
      frecuenciaSpan.textContent = promedio.toFixed(2);
      dibujarBarra(promedio);
      actualizarAfinacion(promedio, afinacionP);

      // 📤 Enviar al comparador visual
      if (typeof actualizarFrecuencia === "function") {
        actualizarFrecuencia(promedio);
      }
    }

    requestAnimationFrame(detectarFrecuencia); // 🔹 Análisis continuo (~60 FPS)
  }

  // 🎨 Dibujar barra de volumen
  function dibujarBarra(frecuencia) {
    const maxFrecuencia = 1000;
    const porcentaje = Math.min(frecuencia / maxFrecuencia, 1);
    const ancho = canvas.width * porcentaje;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(0, 0, ancho, canvas.height);
  }
});
