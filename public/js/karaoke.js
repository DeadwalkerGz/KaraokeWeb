// public/js/karaoke.js
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
    } catch (_) {}

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

    const hz = this._detectPitchACF(this.data, this.sampleRate);
    this.currentHz = hz && hz >= this.minHz && hz <= this.maxHz ? hz : null;

    if (this.currentHz) {
      this.labelHz.textContent = `${this.currentHz.toFixed(1)} Hz`;
      this._status("Cantando", "ok");
      this._pushHistory(this.currentHz);
    } else {
      this.labelHz.textContent = "– Hz";
      this._status("Esperando tono…", "warn");
      this._pushHistory(null);
    }

    const now = performance.now();
    if (now - this.lastDraw > 1000 / 60) {
      this._draw(now);
      this.lastDraw = now;
    }

    this._raf = requestAnimationFrame(() => this._loop());
  }

  // 🔸 Detección de tono (autocorrelación)
  _detectPitchACF(buf, sampleRate) {
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.008) return null;

    const SIZE = buf.length;
    const c = new Float32Array(SIZE);
    for (let lag = 0; lag < SIZE; lag++) {
      let sum = 0;
      for (let j = 0; j < SIZE - lag; j++) sum += buf[j] * buf[j + lag];
      c[lag] = sum;
    }

    let d = 0;
    while (d < SIZE && c[d] > c[d + 1]) d++;
    let maxv = -1, maxi = -1;
    for (let i2 = d; i2 < SIZE; i2++) {
      if (c[i2] > maxv) { maxv = c[i2]; maxi = i2; }
    }
    if (maxi <= 0) return null;

    const x1 = c[maxi - 1], x2 = c[maxi], x3 = c[maxi + 1] || x2;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    const shift = a ? -b / (2 * a) : 0;
    const period = (maxi + shift);
    const freq = sampleRate / period;
    return isFinite(freq) ? freq : null;
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

    // Fondo
    ctx.fillStyle = "#0b0f15";
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

    // Muestra los últimos 5 segundos de referencia (más fluido)
    const segmentos = this.reference.filter(p => p.t <= t && p.t >= t - 5);

    if (segmentos.length > 1) {
        ctx.strokeStyle = "#5db3ff";
        ctx.lineWidth = 2;
        ctx.beginPath();

        // Dibuja la línea azul
        segmentos.forEach((p, i) => {
        const x = (i / (segmentos.length - 1)) * w; // recorre todo el ancho
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

    // Etiquetas
    ctx.fillStyle = "#8a8f98";
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(`${this.minHz} Hz`, 8, h - 8);
    ctx.textAlign = "right";
    ctx.fillText(`${this.maxHz} Hz`, w - 8, 14);
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

window.KaraokeApp = KaraokeApp;
