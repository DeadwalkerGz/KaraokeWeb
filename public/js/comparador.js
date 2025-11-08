// 🎵 comparador.js - versión visual mejorada (glow + fondo animado)
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas-afinacion");
  const ctx = canvas.getContext("2d");
  const audio = document.getElementById("audio");

  // ===== Ajuste de Canvas =====
  function ajustarCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const contenedor = document.getElementById("afinador-container");
    const w = contenedor.clientWidth;
    const h = contenedor.clientHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  ajustarCanvas();
  window.addEventListener("resize", ajustarCanvas);

  // ===== Variables =====
  let frecuenciaActual = 0;
  let historico = [];
  let guiaArtista = [];
  let animando = false;
  let rafId = null;
  let tSuavizado = 0;

  const minF = 50;
  const maxF = 2000;
  const rango = maxF - minF;
  const ventanaVisible = 6;
  const vidaTrail = 0.8;

  // ===== Cargar guía =====
  fetch("assets/cancionUno_limpia.json")
    .then(res => res.json())
    .then(data => {
      guiaArtista = data.filter(p =>
        typeof p.tiempo === "number" &&
        typeof p.frecuencia === "number" &&
        p.frecuencia >= minF &&
        p.frecuencia <= maxF
      );
      console.log(`🎵 Guía cargada (${guiaArtista.length} puntos)`);
    })
    .catch(err => console.error("⚠️ Error cargando la guía:", err));

  // ===== Micrófono =====
  window.actualizarFrecuencia = function (nuevaFrecuencia) {
    if (!audio.paused && nuevaFrecuencia > 0) {
      frecuenciaActual = nuevaFrecuencia;
      historico.push({ t: audio.currentTime, f: nuevaFrecuencia });
      const limite = audio.currentTime - vidaTrail;
      historico = historico.filter(p => p.t >= limite);
    }
  };

  // ===== Funciones de utilidad =====
  function freqToY(f, h) {
  const rangoUtil = { min: 100, max: 800 }; // Rango vocal útil
  const centro = 440; // A4 (punto de referencia)
  const margenSuperior = rangoUtil.max - centro;
  const margenInferior = centro - rangoUtil.min;

  const clamped = Math.min(rangoUtil.max, Math.max(rangoUtil.min, f));

  // desplazamiento relativo respecto al centro (0 = tono central)
  const delta = clamped - centro;

  // escalar de forma proporcional arriba y abajo del centro
  let y;
  if (delta >= 0)
    y = h / 2 - (delta / margenSuperior) * (h / 2);
  else
    y = h / 2 - (delta / margenInferior) * (h / 2);

  return y;
}


  function freqToNote(freq) {
    if (!freq || freq <= 0 || !isFinite(freq)) return "—";
    const notas = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const A4 = 440;
    const n = Math.round(12 * Math.log2(freq / A4)) + 69;
    const nota = notas[(n % 12 + 12) % 12];
    const octava = Math.floor(n / 12) - 1;
    return `${nota}${octava}`;
  }

  function frecuenciaArtistaEnTiempo(t) {
    if (guiaArtista.length === 0) return null;
    let i = 0;
    while (i < guiaArtista.length - 1 && guiaArtista[i + 1].tiempo < t) i++;
    const actual = guiaArtista[i];
    const siguiente = guiaArtista[i + 1] || actual;
    const ratio = (t - actual.tiempo) / Math.max(0.0001, siguiente.tiempo - actual.tiempo);
    const freqInterpolada = actual.frecuencia + (siguiente.frecuencia - actual.frecuencia) * ratio;
    if (!frecuenciaArtistaEnTiempo.prev)
      frecuenciaArtistaEnTiempo.prev = freqInterpolada;
    const suavizado = frecuenciaArtistaEnTiempo.prev + (freqInterpolada - frecuenciaArtistaEnTiempo.prev) * 0.2;
    frecuenciaArtistaEnTiempo.prev = suavizado;
    return suavizado;
  }

  // ===== Dibujo principal =====
  function dibujar() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const tActual = audio.currentTime;

    // 🎨 Fondo degradado animado
    const grad = ctx.createLinearGradient(0, 0, w, h);
    const t = (performance.now() / 4000) % 1;
    grad.addColorStop(0, `hsl(${200 + 60 * Math.sin(t * 2 * Math.PI)}, 60%, 10%)`);
    grad.addColorStop(1, `hsl(${240 + 60 * Math.cos(t * 2 * Math.PI)}, 70%, 12%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

        // --- Línea gris del artista (mejorada con visibilidad y brillo) ---
    if (guiaArtista.length > 1) {
      if (tSuavizado === 0) tSuavizado = tActual;
      // Suavizado temporal (más rápido para evitar retraso)
      tSuavizado += (tActual - tSuavizado) * 0.3;

      const t0 = tSuavizado - ventanaVisible / 2;
      const t1 = tSuavizado + ventanaVisible / 2;
      const visibles = guiaArtista.filter(p => p.tiempo >= t0 && p.tiempo <= t1);

      if (visibles.length >= 2) {
        const suavizadas = visibles.map((p, i, arr) => {
          const prev = arr[i - 1]?.frecuencia ?? p.frecuencia;
          const next = arr[i + 1]?.frecuencia ?? p.frecuencia;
          return { tiempo: p.tiempo, frecuencia: (prev + p.frecuencia + next) / 3 };
        });

        // 💡 Degradado brillante azulado
        const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
        lineGrad.addColorStop(0, "rgba(180,200,255,0.8)");
        lineGrad.addColorStop(0.5, "rgba(200,220,255,1)");
        lineGrad.addColorStop(1, "rgba(180,200,255,0.8)");

        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(170,190,255,0.8)";

        ctx.beginPath();
        for (let i = 0; i < suavizadas.length; i++) {
          const p = suavizadas[i];
          const x = ((p.tiempo - tSuavizado) / ventanaVisible) * w + w / 2;
          const y = freqToY(p.frecuencia, h);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.shadowBlur = 0; // evitar que afecte lo siguiente
      }
    }


    // --- Estela verde brillante (glow real) ---
    if (historico.length > 1) {
      for (let i = 1; i < historico.length; i++) {
        const a = historico[i - 1];
        const b = historico[i];
        const edad = tActual - b.t;
        const alpha = 1 - edad / vidaTrail;
        if (alpha <= 0) continue;

        const x1 = w / 2 - ((tActual - a.t) / vidaTrail) * (w * 0.25);
        const x2 = w / 2 - ((tActual - b.t) / vidaTrail) * (w * 0.25);
        const y1 = freqToY(a.f, h);
        const y2 = freqToY(b.f, h);

        const glow = ctx.createLinearGradient(x1, y1, x2, y2);
        glow.addColorStop(0, `rgba(0,255,204,${alpha * 0.1})`);
        glow.addColorStop(0.5, `rgba(0,255,204,${alpha})`);
        glow.addColorStop(1, `rgba(0,255,204,${alpha * 0.1})`);
        ctx.strokeStyle = glow;
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#00ffcc";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // --- Punto central ---
    if (frecuenciaActual > 0) {
      const y = freqToY(frecuenciaActual, h);
      const x = w / 2;
      const freqArtista = frecuenciaArtistaEnTiempo(tActual);
      let color = "#00ffcc";
      if (freqArtista) {
        const diff = frecuenciaActual - freqArtista;
        const tol = 15;
        if (diff > tol) color = "#ffcc00";
        else if (diff < -tol) color = "#0099ff";
      }
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 25);
      glow.addColorStop(0, color);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Línea roja central ---
    ctx.strokeStyle = "rgba(255,100,100,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    if (animando) rafId = requestAnimationFrame(dibujar);
  }

  // ===== Control de reproducción =====
  audio.addEventListener("play", () => {
    if (!animando) {
      animando = true;
      rafId = requestAnimationFrame(dibujar);
    }
  });
  audio.addEventListener("pause", () => {
    animando = false;
    cancelAnimationFrame(rafId);
  });
  audio.addEventListener("seeked", () => {
    if (!audio.paused && !animando) {
      animando = true;
      rafId = requestAnimationFrame(dibujar);
    } else dibujar();
  });
});
