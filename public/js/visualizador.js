window.addEventListener("DOMContentLoaded", async () => {
  const audio = document.getElementById("audio");
  const canvas = document.getElementById("grafica");
  const ctx = canvas.getContext("2d");
  const labelDB = document.createElement("div");
  labelDB.id = "label-db";
  document.body.appendChild(labelDB);

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  const WINDOW_SECS = 10; // segundos visibles
  const MIN_DB = -60, MAX_DB = 0;

  let datosDecibelios = [];
  let nivelActual = MIN_DB;

  // 🎧 Analizar MP3 y obtener decibelios
  async function analizarAudio() {
    const audioCtx = new AudioContext();
    const respuesta = await fetch("assets/cancion.mp3");
    const buffer = await respuesta.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(buffer);

    const canal = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const paso = Math.floor(sampleRate / 20); // 20 muestras por segundo

    for (let i = 0; i < canal.length; i += paso) {
      const fragmento = canal.slice(i, i + paso);
      const rms = Math.sqrt(fragmento.reduce((s, v) => s + v * v, 0) / fragmento.length);
      const db = 20 * Math.log10(rms || 1e-8);
      datosDecibelios.push({ tiempo: i / sampleRate, db });
    }

    console.log("🎧 Análisis completado:", datosDecibelios.length, "puntos");
  }

  // 🎨 Dibujo con scroll y color dinámico
  function dibujar() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const duracion = audio.duration || 1;
    const tNow = audio.currentTime;
    const t0 = Math.max(0, tNow - WINDOW_SECS / 2);
    const t1 = t0 + WINDOW_SECS;

    // Escala Y de decibelios (-60 → 0)
    const escalaY = v => h - ((v - MIN_DB) / (MAX_DB - MIN_DB)) * h;

    // Dibujar línea del volumen
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < datosDecibelios.length; i++) {
      const p = datosDecibelios[i];
      if (p.tiempo < t0 || p.tiempo > t1) continue;
      const x = ((p.tiempo - t0) / (t1 - t0)) * w;
      const y = escalaY(p.db);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 🔴 Línea del tiempo actual (centro)
    const xCenter = w / 2;
    ctx.strokeStyle = "red";
    ctx.beginPath();
    ctx.moveTo(xCenter, 0);
    ctx.lineTo(xCenter, h);
    ctx.stroke();

    // 🟢 Actualizar nivel actual
    const cercano = datosDecibelios.reduce((prev, curr) =>
      Math.abs(curr.tiempo - tNow) < Math.abs(prev.tiempo - tNow) ? curr : prev
    );
    nivelActual = cercano.db;

    actualizarIndicador(nivelActual);

    requestAnimationFrame(dibujar);
  }

  // 🔰 Cambiar color y texto del indicador según el volumen
  function actualizarIndicador(db) {
    let color;
    if (db < -45) color = "#00aaff"; // bajo → azul
    else if (db < -30) color = "#00ff88"; // medio → verde
    else if (db < -15) color = "#ffff00"; // fuerte → amarillo
    else color = "#ff4444"; // muy alto → rojo

    labelDB.style.color = color;
    labelDB.textContent = `${db.toFixed(1)} dB`;
  }

  await analizarAudio();

  // ▶️ Inicia animación al reproducir
  audio.addEventListener("play", () => requestAnimationFrame(dibujar));
});
