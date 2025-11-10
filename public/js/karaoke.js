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

  // 🔹 Nueva función para cargar canción y su referencia
  async setSong(path) {
    if (!path) return;
    this.audioEl.pause();
    this.audioEl.src = path;
    this.audioEl.load();
    this.audioEl.oncanplay = () => this.audioEl.play();
    this._status(`Canción cargada: ${path}`, "ok");


    // Intenta cargar su referencia de frecuencia
    const refName = path.split("/").pop().replace(/\.[^/.]+$/, "_ref.json");
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

    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, w, h);

    // Efecto de energía sobre el fondo
    const energia = Math.min(1, this.currentRms * 8);
    ctx.fillStyle = `rgba(0, 255, 0, ${energia * 0.25})`;
    ctx.fillRect(0, 0, w, h);

    // Cuadrícula
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

    // 🔵 Línea de referencia (pista)
    if (this.reference && this.audioEl && !isNaN(this.audioEl.currentTime)) {
      const t = this.audioEl.currentTime;

      // 🎵 Calcular tono actual de la referencia (solo una vez por frame)
      let idx = this.reference.findIndex(p => p.t > t);
      if (idx === -1) idx = this.reference.length - 1;
      const punto = this.reference[idx];
      this.refHz = punto ? punto.hz : null;

      // Muestra los últimos 5 segundos de referencia (más fluido)
      const segmentos = this.reference.filter(p => p.t <= t && p.t >= t - 5);

      if (segmentos.length > 1) {
        ctx.strokeStyle = "#5db3ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        segmentos.forEach((p, i) => {
          const x = (i / (segmentos.length - 1)) * w;
          const y = this._mapHzToY(p.hz);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 🔘 Puntero actual (punto azul brillante)
        const puntoActual = segmentos[segmentos.length - 1];
        if (puntoActual) {
          ctx.beginPath();
          ctx.arc(w - 10, this._mapHzToY(puntoActual.hz), 5, 0, Math.PI * 2);
          ctx.fillStyle = "#80c8ff";
          ctx.shadowColor = "#5db3ff";
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        // 🎯 Barra de precisión (comparación entre mic y canción)
        if (this.currentHz && this.refHz) {
          const diff = Math.abs(this.currentHz - this.refHz);
          const precision = Math.max(0, 1 - diff / 50); // 0–1 (tolerancia de ±50 Hz)
          const barWidth = w * precision;

          ctx.fillStyle = precision > 0.8 ? "#4cff4c" : precision > 0.5 ? "#ffb84c" : "#ff4c4c";
          ctx.fillRect(0, h - 8, barWidth, 6);

          ctx.font = "12px monospace";
          ctx.fillStyle = "#ccc";
          ctx.textAlign = "center";
          ctx.fillText(`Δ ${diff.toFixed(1)} Hz`, w / 2, h - 15);
        }

      }
    }


    // 🟢 Línea de la voz actual (historial)
    if (this.history.length > 1) {
      ctx.strokeStyle = "#7fff7f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.history.forEach((hz, i) => {
        if (!hz) return;
        const x = (i / this.maxHistory) * w;
        const y = this._mapHzToY(hz);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // 💜 Usuario remoto: bolita con estela dinámica (ajustada)
    const remote = getRemotePitch();
    if (remote && remote.hz) {
      const yRemote = this._mapHzToY(remote.hz);
      this.remoteTrail = this.remoteTrail || [];
      this.remoteTrail.push(yRemote);
      if (this.remoteTrail.length > 25) this.remoteTrail.shift(); // largo de la estela

      // Posición X base de la cabeza (bolita principal)
      const headX = w * 0.85;

      // 🎨 Dibujar la estela (de atrás hacia la cabeza)
      for (let i = 0; i < this.remoteTrail.length; i++) {
        const alpha = i / this.remoteTrail.length;
        const radius = 5 * (1 - alpha * 0.6);
        const offsetX = headX - (this.remoteTrail.length - i) * 8; // se aleja hacia la izquierda
        ctx.beginPath();
        ctx.arc(offsetX, this.remoteTrail[i], radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(213,110,255,${0.7 - alpha * 0.5})`;
        ctx.fill();
      }

      // 💜 Bolita principal (al frente)
      ctx.beginPath();
      ctx.arc(headX, yRemote, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#d56eff";
      ctx.shadowColor = "#d56eff";
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // 🏷️ Etiqueta
      ctx.fillStyle = "#d56eff";
      ctx.font = "13px system-ui";
      ctx.fillText(`${remote.user}: ${remote.hz.toFixed(1)} Hz`, headX - 60, yRemote - 15);
    }

    // Mostrar valores actuales de frecuencia
    ctx.fillStyle = "#9ad1ff";
    ctx.font = "14px monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `🎙️ Mic: ${this.currentHz ? this.currentHz.toFixed(1) + " Hz" : "—"}`,
      10,
      20
    );
    ctx.fillText(
      `🎵 Song: ${this.refHz ? this.refHz.toFixed(1) + " Hz" : "—"}`,
      10,
      40
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
