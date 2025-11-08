// ===================================================
// 🔹 CLIENTE SOCKET.IO (para PC y Móvil)
// Se conecta automáticamente al servidor del karaoke
// Detecta si es Host (PC) o User2 (móvil)
// ===================================================

// 🔹 Asegurar que 'io' esté disponible incluso dentro de módulos ES6
const io = window.io || globalThis.io;

// --- Conexión automática ---
const socket = io("http://192.168.1.8:3000", {
  transports: ["websocket"], // más estable y rápido
  reconnection: true,
  reconnectionAttempts: 5,
  timeout: 5000
});

// 🔹 Hacer el socket accesible globalmente
window.socket = socket; // ✅ IMPORTANTE para interacción con el HTML

// ===================================================
// 🎭 Selección manual del rol (sin romper lo existente)
// ===================================================
let userName = localStorage.getItem("karaokeRole");

if (!userName) {
  const rolElegido = prompt("Selecciona tu rol:\nEscribe 'Host' o 'User2'").trim();
  if (rolElegido && ["host", "user2"].includes(rolElegido.toLowerCase())) {
    userName = rolElegido.toLowerCase() === "host" ? "Host-PC" : "User2";
    localStorage.setItem("karaokeRole", userName);
  } else {
    userName = "User2"; // valor por defecto si no escribe nada válido
    localStorage.setItem("karaokeRole", userName);
  }
}

console.log(`🎭 Rol establecido: ${userName}`);


// ===================================================
// 🔸 Estado de conexión
// ===================================================
socket.on("connect", () => {
  console.log(`🟢 Conectado al servidor como ${userName} (${socket.id})`);
  socket.emit("setUser", userName);

  // 🔹 Actualizar estado visual cuando realmente se conecta
  const labelEstado = document.getElementById("label-estado");
  if (labelEstado) {
    labelEstado.textContent = "🟢 Conectado al servidor";
    labelEstado.className = "ok";
  }
});

socket.on("disconnect", () => {
  console.warn("🔴 Desconectado del servidor Karaoke");

  // 🔹 Actualizar estado visual cuando se desconecta
  const labelEstado = document.getElementById("label-estado");
  if (labelEstado) {
    labelEstado.textContent = "🔴 Desconectado del servidor";
    labelEstado.className = "bad";
  }
});

// ===================================================
// 🔸 Sincronización de tono (pitch)
// ===================================================
let remotePitch = null;

// Cuando otro usuario envía su tono
socket.on("updatePitch", (data) => {
  remotePitch = data;
  // console.log(`🎧 Recibido: ${data.user} ${data.hz.toFixed(1)} Hz`);
});

// Enviar frecuencia propia (desde micrófono)
export function sendPitch(hz) {
  socket.emit("pitchData", { user: userName, hz });
}

// Obtener última frecuencia remota
export function getRemotePitch() {
  return remotePitch;
}

// ===================================================
// 🔸 Sincronización de canciones
// ===================================================
socket.on("songSelected", (song) => {
  console.log(`🎵 Canción seleccionada por otro usuario: ${song}`);
  const audio = document.getElementById("audio");
  if (audio) {
    audio.src = `/uploads/${song}`;
    audio.play();
  }
});

export function selectSong(song) {
  socket.emit("selectSong", song);
}

// ===================================================
// 🔸 Exportar nombre del usuario
// ===================================================
export function getUserName() {
  return userName;
}

// ===================================================
// 🔸 Fin del cliente Socket.IO
// ===================================================
