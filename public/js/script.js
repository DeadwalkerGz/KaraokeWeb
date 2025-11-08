// ===================================================
// 🎤 SCRIPT PRINCIPAL DEL KARAOKE
// Conexión Host + sincronización de canciones
// ===================================================

import { selectSong } from "./socketClient.js";

// Esperar a que el DOM esté listo
window.addEventListener("DOMContentLoaded", async () => {
  const app = new KaraokeApp();
  await app.init();

  const selector = document.getElementById("selector-cancion");
  const btnCargar = document.getElementById("btn-cargar");
  const audio = document.getElementById("audio");

  // ==========================
  // 1️⃣ Cargar lista de canciones
  // ==========================
  async function cargarCanciones() {
    try {
      const res = await fetch("/api/songs");
      if (!res.ok) throw new Error("Error al obtener canciones");

      const songs = await res.json();
      selector.innerHTML = "";

      if (songs.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "No hay canciones disponibles";
        selector.appendChild(opt);
        return;
      }

      songs.forEach(song => {
        const opt = document.createElement("option");
        opt.value = song;
        opt.textContent = song;
        selector.appendChild(opt);
      });

      console.log(`✅ Canciones cargadas: ${songs.length}`);
    } catch (err) {
      console.error("❌ Error al cargar canciones:", err);
    }
  }

  await cargarCanciones();

  // ==========================
  // 2️⃣ Evento: cargar canción seleccionada
  // ==========================
  btnCargar.addEventListener("click", async () => {
    const seleccionada = selector.value;
    if (!seleccionada || seleccionada === "No hay canciones disponibles") {
      alert("Selecciona una canción válida primero.");
      return;
    }

    const ruta = `/uploads/${seleccionada}`;
    console.log(`🎵 Cargando canción: ${ruta}`);

    try {
      // Cargar y reproducir canción
      audio.src = ruta;
      audio.pause();
      audio.load();
      audio.oncanplay = () => audio.play();

      // Notificar a Usuario 2
      selectSong(seleccionada);

      // Generar referencia (Hz) y cargar en karaoke.js
      app.setSong(ruta);

      console.log(`✅ Canción reproducida y sincronizada: ${seleccionada}`);
    } catch (err) {
      console.error("❌ Error al cargar la canción:", err);
    }
  });
});
