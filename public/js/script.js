// public/js/script.js
(async function () {
  const app = new KaraokeApp({
    audioId: "audio",
    btnMicId: "btn-mic",
    canvasId: "canvas-afinacion",
    labelHzId: "label-actual",
    labelEstadoId: "label-estado",
    lyricsId: "letra-actual",
  });

  const selector = document.getElementById("selector-cancion");
  const btnCargar = document.getElementById("btn-cargar");
  const audio = document.getElementById("audio");

  // 🔹 Obtener lista de canciones desde el servidor
  async function cargarListaCanciones() {
    const res = await fetch("/api/songs");
    const canciones = await res.json();

    selector.innerHTML = "";
    if (canciones.length === 0) {
      selector.innerHTML = `<option value="">(No hay canciones en /uploads)</option>`;
    } else {
      canciones.forEach(nombre => {
        const opt = document.createElement("option");
        opt.value = nombre;
        opt.textContent = `🎵 ${nombre}`;
        selector.appendChild(opt);
      });
    }
  }

  // 🔹 Nueva función: analizar canción seleccionada
  async function analizarCancion(nombre) {
    try {
      const res = await fetch(`/api/analyze/${nombre}`);
      const data = await res.json();

      if (data.status === "ok") {
        console.log(`✅ Referencia generada: ${data.ref}`);
        app._status("Análisis completado y guardado en /references/", "ok");
        alert(`✅ Análisis completado y guardado en /references/`);
      } else {
        console.error("❌ Error al analizar:", data.msg);
        alert("❌ Error al analizar la canción.");
      }
    } catch (err) {
      console.error("❌ Error al conectarse al servidor:", err);
      alert("❌ Error al analizar la canción. Revisa la consola.");
    }
  }

  // 🔹 Evento: cargar canción seleccionada
  btnCargar.addEventListener("click", async () => {
    const seleccionada = selector.value;
    if (!seleccionada) return alert("Selecciona una canción primero.");

    const ruta = `/uploads/${seleccionada}`;
    audio.src = ruta;
    audio.pause();
    audio.load();
    audio.oncanplay = () => audio.play();


    app.setSong(ruta);

    // 🧠 Ejecutar análisis automático
    await analizarCancion(seleccionada);
  });

  // 🔹 Ajuste automático del canvas
  function resizeCanvas() {
    const canvas = document.getElementById("canvas-afinacion");
    const ratio = window.devicePixelRatio || 1;
    const style = getComputedStyle(canvas);
    const cssWidth = parseFloat(style.width) || canvas.clientWidth || 800;
    const cssHeight = parseFloat(style.height) || canvas.clientHeight || 180;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  await app.init();
  await cargarListaCanciones();
})();
