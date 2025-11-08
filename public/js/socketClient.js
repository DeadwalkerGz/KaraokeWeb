// ===================================================
// 🔹 CLIENTE SOCKET.IO (para PC y Móvil)
// Se conecta automáticamente al servidor del karaoke
// Detecta si es Host (PC) o User2 (móvil)
// ===================================================

// --- Conexión automática ---
const socket = io("http://192.168.1.8:3000", {
  transports: ["websocket"], // más estable y rápido
  reconnection: true,
  reconnectionAttempts: 5,
  timeout: 5000
});

// 🔹 Hacer el socket accesible globalmente
window.socket = socket; // ✅ IMPORTANTE para interacción con el HTML

// --- Identificación automática del usuario ---
let userName = "User";
if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
  userName = "User2"; // si es un móvil
} else {
  userName = "Host-PC"; // si es el PC principal
}

// ===================================================
// 🔸 Estado de conexión
// ===================================================
socket.on("connect", () => {
  console.log(`🟢 Conectado al servidor como ${userName} (${socket.id})`);
  // 🔹 Notifica al servidor el nombre del usuario
  socket.emit("setUser", userName);
});

socket.on("disconnect", () => {
  console.warn("🔴 Desconectado del servidor Karaoke");
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
