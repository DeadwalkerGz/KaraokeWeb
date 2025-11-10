// ===================================================
// 🎤 SCRIPT PRINCIPAL DEL HOST (PC)
// Controla la interfaz, el audio y sincroniza con User2
// ===================================================

import { selectSong, getUserName } from "./socketClient.js";
import { KaraokeApp } from "./karaoke.js";

document.addEventListener("DOMContentLoaded", () => {
  // === Elementos de la interfaz ===
  const selector = document.getElementById("selector-cancion");
  const btnCargar = document.getElementById("btn-cargar");
  const btnPlay = document.getElementById("btn-play");
  const btnPause = document.getElementById("btn-pause");
  const audio = document.getElementById("audio");
  const labelEstado = document.getElementById("label-estado");

  // KaraokeApp (controlador de análisis)
  const app = new KaraokeApp({ audioId: "audio" });

  // ===================================================
  // 🔹 Cargar lista de canciones disponibles
  // ===================================================
  async function cargarCanciones() {
    try {
      const res = await fetch("/api/songs");
      const songs = await res.json();

      if (!Array.isArray(songs) || songs.length === 0) {
        selector.innerHTML = `<option>No hay canciones disponibles</option>`;
        console.warn("⚠️ No se encontraron canciones en /uploads");
        return;
      }

      selector.innerHTML = songs
        .map((s) => `<option value="${s}">${s}</option>`)
        .join("");

      console.log("🎵 Canciones disponibles:", songs);
      labelEstado.textContent = "✅ Canciones cargadas correctamente";
      labelEstado.className = "ok";
    } catch (e) {
      console.error("❌ Error al obtener canciones:", e);
      labelEstado.textContent = "❌ Error al cargar canciones";
      labelEstado.className = "bad";
    }
  }

  cargarCanciones();

  // ===================================================
  // 🔹 Cargar y reproducir canción seleccionada
  // ===================================================
  btnCargar.addEventListener("click", async () => {
    const seleccionada = selector.value;
    if (!seleccionada || seleccionada === "No hay canciones disponibles") {
      alert("Selecciona una canción válida primero.");
      return;
    }

    const ruta = `/uploads/${seleccionada}`;
    console.log(`🎵 Cargando canción: ${ruta}`);

    try {
      // Cargar y reproducir canción localmente
      audio.src = ruta;
      audio.pause();
      audio.load();
      audio.oncanplay = () => {
        const userName = localStorage.getItem("karaokeRole");
        if (userName === "Host-PC") {
          console.log("⏱️ Host retrasará 1 s antes de reproducir...");
          setTimeout(() => audio.play(), 1000); // <-- retardo de 1 s solo para Host
        } else {
          audio.play();
        }
      };


      // 🔹 Sincronizar con User2
      selectSong(seleccionada);

      // 🔹 Generar referencia Hz (guía karaoke)
      app.setSong(ruta);

      console.log(`✅ Canción reproducida y sincronizada: ${seleccionada}`);
      labelEstado.textContent = `🎶 Reproduciendo: ${seleccionada}`;
      labelEstado.className = "ok";
    } catch (err) {
      console.error("❌ Error al cargar la canción:", err);
      labelEstado.textContent = "Error al cargar canción";
      labelEstado.className = "bad";
    }
  });

  // ===================================================
  // 🔹 Botones de reproducción locales
  // ===================================================
  btnPlay.addEventListener("click", () => {
    if (!audio.src) return alert("Primero carga una canción.");
    const userName = localStorage.getItem("karaokeRole");
    if (userName === "Host-PC") {
      console.log("⏱️ Host retrasará 1 s antes de reproducir...");
      setTimeout(() => {
        audio.play();
        window.socket.emit("musicControl", { action: "play", from: getUserName() });
        console.log("▶️ Reproducción iniciada con retardo");
      }, 1000);
    } else {
      audio.play();
      window.socket.emit("musicControl", { action: "play", from: getUserName() });
      console.log("▶️ Reproducción iniciada (sin retardo)");
    }
  });


  btnPause.addEventListener("click", () => {
    if (!audio.src) return;
    audio.pause();
    window.socket.emit("musicControl", { action: "pause", from: getUserName() });
    console.log("⏸️ Reproducción pausada");
  });

  // ===================================================
  // 🔹 Reacción a comandos de reproducción remota
  // ===================================================
  if (window.socket) {
    window.socket.on("musicControl", (data) => {
      if (data.from === getUserName()) return; // evita duplicar tu propio evento

      if (data.action === "play") {
        audio.play().catch((err) =>
          console.warn("⚠️ Error al reproducir remotamente:", err)
        );
        labelEstado.textContent = "▶️ Reproduciendo por control remoto";
        labelEstado.className = "ok";
      }

      if (data.action === "pause") {
        audio.pause();
        labelEstado.textContent = "⏸️ Pausado por control remoto";
        labelEstado.className = "warn";
      }
    });
  }

  // ===================================================
  // 🔹 Estado de depuración
  // ===================================================
  audio.addEventListener("playing", () => console.log("🎶 Reproduciendo..."));
  audio.addEventListener("pause", () => console.log("⏸️ Pausado"));
  audio.addEventListener("ended", () => console.log("🏁 Canción terminada"));


  // 🟢 Inicializar micrófono y afinador
  app.init(); // <---- AGREGA ESTA LÍNEA AQUÍ
});
