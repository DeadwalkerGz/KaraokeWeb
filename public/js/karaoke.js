// public/js/karaoke.js
import { getRemotePitch, sendPitch } from "./socketClient.js";

class KaraokeApp {
  constructor(cfg = {}) {
    this.audioEl = document.getElementById(cfg.audioId || "audio");
    this.btnMic = document.getElementById(cfg.btnMicId || "btn-mic");
    this.canvas = document.getElementById(cfg.canvasId || "canvas-afinacion");
    this.ctx = this.canvas.getContext("2d");

    this.labelHz = document.getElementById(cfg.labelHzId || "label-actual");
    this.labelEstado = document.getElementById(cfg.labelEstadoId || "label-estado");
    this.lyrEl = document.getElementById(cfg.lyricsId || "letra-actual");

    // Audio
    this.ac = null;
    this.analyser = null;
    this.stream = null;

    // Buffers
    this.bufSize = 2048;
    this.data = new Float32Array(this.bufSize);

    // Detección
    this.sampleRate = 48000;
    this.minHz = 80;
    this.maxHz = 1000;
    this.currentHz = null;
    this.refHz = null; // Frecuencia actual de la pista de referencia
    this.currentRms = 0;  // nivel de energía de la voz
    this.lastHz = 0;      // última frecuencia válida (para suavizado)


    // Visual
    this.lastDraw = 0;
    this.history = [];
    this.maxHistory = 60;

    // Referencia de pista (fase 3)
    this.reference = null; // Datos del _ref.json
    this.refIndex = 0;

    // Letra (opcional)
    this.lyrics = null;
    this.startTime = 0;

    this._raf = null;

    // =========================================================
    // 🔹 CONFIGURACIÓN DE DELAY POR CANCIÓN (inicio de Johnson)
    // =========================================================
    this.songDelays = {
      fuisteTu: 11,         // Espera 7.5 segundos antes de comparar
      BTS_______PROOF_CDonly__StillWithYouAcapellabyJUNGKOOK: 1,        // Sin delay (empieza de inmediato)
      SinceraTe: 5.1,       // Espera 5.1 s
      on: 2.3,                // Espera 2.3 s
      blackbird: 10.0         // Espera 10 s
    };

    // 🔹 Valor activo del delay según la canción cargada
    this.timeOffset = 0;

  }

  async init() {
    try {
      const res = await fetch("data/letra.json");
      if (res.ok) this.lyrics = await res.json();
    } catch (_) { }

    this.btnMic.addEventListener("click", () => this.toggleMic());
    this.audioEl.addEventListener("play", () => (this.startTime = this.audioEl.currentTime));
    this.audioEl.addEventListener("timeupdate", () => this._syncLyrics());

    this._draw(0);
  }
  // 🔹 Nueva función para cargar canción y su referencia (con delay manual)
  async setSong(path) {
    if (!path) return;

    // 🔹 Detener cualquier reproducción previa
    this.audioEl.pause();

    // 🔹 Obtener nombre base del archivo (sin extensión)
    const baseName = path.split("/").pop().replace(/\.[^/.]+$/, "");

    // 🔹 Configurar delay manual (por nombre exacto del archivo)
    this.timeOffset = this.songDelays[baseName] || 0;
    console.log(`⏱️ Delay configurado para "${baseName}": ${this.timeOffset}s`);

    // =======================================================
    // 🎧 Cargar versión completa desde /canciones/
    // =======================================================
    const fullSongPath = `/canciones/${baseName}.mp3`;
    this.audioEl.src = fullSongPath;
    this.audioEl.load();
    this.audioEl.oncanplay = () => this.audioEl.play();
    this._status(`🎵 Reproduciendo versión completa: ${baseName}`, "ok");

    // =======================================================
    // 🔸 Cargar referencia (Johnson) asociada a la canción
    // =======================================================
    const refName = baseName + "_ref.json";
    try {
      const res = await fetch(`/references/${refName}`);
      if (res.ok) {
        this.reference = await res.json();
        console.log(`✅ Referencia cargada: ${refName}`);
      } else {
        this.reference = null;
        console.warn(`⚠️ No se encontró referencia para ${refName}`);
      }
    } catch (err) {
      console.error("❌ Error al cargar referencia:", err);
      this.reference = null;
    }
    // =======================================================
    // 🔸 Cargar letra sincronizada (si existe en /data/)
    // =======================================================
    try {
      const lyricName = baseName + ".json";
      const lyricRes = await fetch(`/data/${lyricName}`);
      if (lyricRes.ok) {
        this.lyrics = await lyricRes.json();
        console.log(`📝 Letra sincronizada cargada: ${lyricName}`);
      } else {
        console.warn(`⚠️ No se encontró letra para ${lyricName}`);
      }
    } catch (err) {
      console.error("❌ Error al cargar letra:", err);
      this.lyrics = null;
    }

  }



  async toggleMic() {
    if (this.stream) return this._stopMic();
    await this._startMic();
  }

  async _startMic() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });

      this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)();
      this.sampleRate = this.ac.sampleRate;

      const src = this.ac.createMediaStreamSource(this.stream);
      this.analyser = this.ac.createAnalyser();
      this.analyser.fftSize = 2048;
      src.connect(this.analyser);

      this.btnMic.textContent = "🛑 Desactivar micrófono";
      this._loop();
    } catch (e) {
      console.error(e);
      this._status("No se pudo acceder al micrófono", "bad");
    }
  }

  _stopMic() {
    this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    cancelAnimationFrame(this._raf);
    this.btnMic.textContent = "🎙️ Activar micrófono";
    this._status("Micrófono apagado", "warn");
  }

  _loop() {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.data);

    // 🔹 Detectar tono y nivel RMS
    const { hz, rms } = this._detectPitchACF(this.data, this.sampleRate);
    this.currentRms = rms; // guarda nivel de energía

    // 🔹 Suavizado y estabilidad de tono
    if (hz) {
      if (!this.lastHz) this.lastHz = hz;
      // mezcla tono nuevo con anterior para suavizar saltos
      this.currentHz = this.lastHz * 0.8 + hz * 0.2;
      this.lastHz = this.currentHz;
    } else {
      // si no hay tono válido, mantiene un poco el anterior antes de soltarlo
      this.currentHz = this.lastHz * 0.9;
      if (this.currentHz < this.minHz) this.currentHz = null;
    }

    // 🔹 Actualización de la interfaz
    if (this.currentHz) {
      this.labelHz.textContent = `${this.currentHz.toFixed(1)} Hz`;
      this._status("Cantando", "ok");
      this._pushHistory(this.currentHz);
    } else {
      this.labelHz.textContent = "– Hz";
      this._status("Esperando tono…", "warn");
      this._pushHistory(null);
    }

    // 🔹 Control de FPS (60 por segundo aprox)
    const now = performance.now();
    if (now - this.lastDraw > 1000 / 60) {
      this._draw(now);
      this.lastDraw = now;
    }

    this._raf = requestAnimationFrame(() => this._loop());
    if (this.currentHz && performance.now() % 3 < 1) sendPitch(this.currentHz);

  }


  // 🔸 Detección de tono (autocorrelación)
  _detectPitchACF(buf, sampleRate) {
    // Calcular RMS (nivel de energía)
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);

    // Filtro de silencio (si hay poco volumen)
    if (rms < 0.01) return { hz: null, rms };

    // Autocorrelación
    const SIZE = buf.length;
    const c = new Float32Array(SIZE);
    for (let lag = 0; lag < SIZE; lag++) {
      let sum = 0;
      for (let j = 0; j < SIZE - lag; j++) sum += buf[j] * buf[j + lag];
      c[lag] = sum;
    }

    // Buscar primer pico significativo
    let d = 0;
    while (d < SIZE && c[d] > c[d + 1]) d++;
    let maxv = -1, maxi = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxv) { maxv = c[i]; maxi = i; }
    }
    if (maxi <= 0) return { hz: null, rms };

    // Interpolación parabólica (mejora precisión)
    const x1 = c[maxi - 1], x2 = c[maxi], x3 = c[maxi + 1] || x2;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    const shift = a ? -b / (2 * a) : 0;
    const period = maxi + shift;
    const freq = sampleRate / period;

    // Validar rango
    const hz = isFinite(freq) && freq >= this.minHz && freq <= this.maxHz ? freq : null;

    return { hz, rms };
  }


  _pushHistory(hz) {
    this.history.push(hz);
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  _mapHzToY(hz) {
    const h = this.canvas.height;
    if (!hz) return null;
    const clamped = Math.min(this.maxHz, Math.max(this.minHz, hz));
    const norm = (clamped - this.minHz) / (this.maxHz - this.minHz);
    return h - norm * h;
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 🎬 Fondo base
    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, w, h);

    // 💡 Efecto de energía del micrófono (brillo dinámico)
    const energia = Math.min(1, this.currentRms * 8);
    ctx.fillStyle = `rgba(0, 255, 0, ${energia * 0.25})`;
    ctx.fillRect(0, 0, w, h);

    // 🧱 Cuadrícula
    ctx.strokeStyle = "#223046";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.25;
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 💜 Usuario remoto centrado con estela detrás (fondo)
    const remote = getRemotePitch();
    if (remote && remote.hz) {
      const yRemote = this._mapHzToY(remote.hz);
      this.remoteTrail = this.remoteTrail || [];
      this.remoteTrail.push(yRemote);
      if (this.remoteTrail.length > 25) this.remoteTrail.shift();

      const headX = w / 2; // eje central compartido

      // 🎨 Estela (dibujada primero — queda detrás de todo)
      for (let i = 0; i < this.remoteTrail.length; i++) {
        const alpha = i / this.remoteTrail.length;
        const radius = 5 * (1 - alpha * 0.6);
        const offsetX = headX - (this.remoteTrail.length - i) * 8; // hacia atrás
        ctx.beginPath();
        ctx.arc(offsetX, this.remoteTrail[i], radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(213,110,255,${0.35 - alpha * 0.2})`;
        ctx.fill();
      }

      // 💜 Bolita principal (queda detrás del azul y verde)
      ctx.beginPath();
      ctx.arc(headX, yRemote, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(213,110,255,0.6)";
      ctx.fill();
    }

    // 🔵 Línea de referencia (pista musical centrada)
    if (this.reference && this.audioEl && !isNaN(this.audioEl.currentTime)) {
      // 🕒 Aplicar delay manual configurado para esta canción
      const t = this.audioEl.currentTime - (this.timeOffset || 0);

      // 🚫 Si todavía estamos dentro del delay, no dibujar la referencia
      if (t < 0) {
        ctx.fillStyle = "#999";
        ctx.font = "16px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`⏳ Esperando ${Math.abs(t).toFixed(1)}s para iniciar sincronización...`, w / 2, h / 2);
        return; // 🛑 salir del _draw temporalmente
      }

      const windowSize = 2; // segundos antes y después del punto actual
      const segmentos = this.reference.filter(p => p.t >= t - windowSize && p.t <= t + windowSize);

      let idx = this.reference.findIndex(p => p.t > t);
      if (idx === -1) idx = this.reference.length - 1;
      const punto = this.reference[idx];
      this.refHz = punto ? punto.hz : null;

      if (segmentos.length > 1) {
        ctx.strokeStyle = "#5db3ff";
        ctx.lineWidth = 2;
        ctx.beginPath();

        segmentos.forEach((p, i) => {
          const relTime = p.t - t; // tiempo relativo (-2 a +2)
          const x = w / 2 + (relTime / windowSize) * (w / 2);
          const y = this._mapHzToY(p.hz);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 🎯 Puntero de la canción (en el centro)
        const centerY = this._mapHzToY(this.refHz);
        ctx.beginPath();
        ctx.arc(w / 2, centerY, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#80c8ff";
        ctx.shadowColor = "#5db3ff";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // 🎚️ Barra de precisión (Micrófono vs Canción)
        if (this.currentHz && this.refHz) {
          const diff = Math.abs(this.currentHz - this.refHz);
          const precision = Math.max(0, 1 - diff / 50); // tolerancia ±50 Hz
          const barWidth = w * precision;
          ctx.fillStyle =
            precision > 0.8 ? "#4cff4c" :
              precision > 0.5 ? "#ffb84c" : "#ff4c4c";
          ctx.fillRect((w - barWidth) / 2, h - 8, barWidth, 6);

          ctx.font = "12px monospace";
          ctx.fillStyle = "#ccc";
          ctx.textAlign = "center";
          ctx.fillText(`Δ ${diff.toFixed(1)} Hz`, w / 2, h - 15);
        }
      }
    }

    // 🟢 Línea de voz actual centrada (usuario local)
    if (this.history.length > 1) {
      ctx.strokeStyle = "#7fff7f";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const recent = this.history.slice(-this.maxHistory);

      // 🔹 Dibujar la estela desde el centro hacia la izquierda
      for (let i = recent.length - 1; i >= 0; i--) {
        if (!recent[i]) continue;
        const x = w / 2 - (recent.length - i) * 6; // estela hacia la izquierda
        const y = this._mapHzToY(recent[i]);
        if (i === recent.length - 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 🔘 Bolita verde central (tu voz actual)
      if (this.currentHz) {
        const yCurrent = this._mapHzToY(this.currentHz);
        ctx.beginPath();
        ctx.arc(w / 2, yCurrent, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#7fff7f";
        ctx.shadowColor = "#7fff7f";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }


    // 💜 Etiqueta del usuario remoto (por encima, visible)
    if (remote && remote.hz) {
      const yRemote = this._mapHzToY(remote.hz);
      ctx.fillStyle = "#d56eff";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${remote.user}: ${remote.hz.toFixed(1)} Hz`, w / 2, yRemote - 20);
    }

    // 📊 Mostrar datos actuales
    ctx.fillStyle = "#9ad1ff";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `🎙️ Mic: ${this.currentHz ? this.currentHz.toFixed(1) + " Hz" : "—"}`,
      10, 20
    );
    ctx.fillText(
      `🎵 Song: ${this.refHz ? this.refHz.toFixed(1) + " Hz" : "—"}`,
      10, 40
    );
  }


  _status(text, lvl = "") {
    this.labelEstado.textContent = text;
    this.labelEstado.classList.remove("ok", "warn", "bad");
    if (lvl) this.labelEstado.classList.add(lvl);
  }

  _syncLyrics() {
    if (!this.lyrics || !Array.isArray(this.lyrics)) return;
    const t = this.audioEl.currentTime;
    let line = null;
    for (let i = 0; i < this.lyrics.length; i++) {
      if (this.lyrics[i].t <= t) line = this.lyrics[i];
      else break;
    }
    if (line) this.lyrEl.textContent = line.txt;
  }
}

export { KaraokeApp };

//window.KaraokeApp = KaraokeApp;
