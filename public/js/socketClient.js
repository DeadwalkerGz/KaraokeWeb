// ===================================================
// 🔹 CLIENTE SOCKET.IO (para PC y Móvil)
// Se conecta automáticamente al servidor del karaoke
// Detecta si es Host (PC) o User2 (móvil)
// ===================================================

// 🔹 Asegurar que 'io' esté disponible incluso dentro de módulos ES6
const io = window.io || globalThis.io;

// --- Conexión automática ---
const socket = io({
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
// 🎭 Selector de rol visual
let userName = localStorage.getItem("karaokeRole");

function initRoleSelector() {
  const overlay = document.getElementById("role-overlay");
  const btnHost = document.getElementById("btn-host");
  const btnUser2 = document.getElementById("btn-user2");

  // Si ya hay rol guardado, ocultar selector
  if (userName) {
    overlay.style.display = "none";
    console.log(`🎭 Rol restaurado: ${userName}`);
    return;
  }

  // Mostrar el overlay
  overlay.style.display = "flex";

  // Asignar rol de Host
  btnHost.onclick = () => {
    userName = "Host-PC";
    localStorage.setItem("karaokeRole", userName);
    overlay.style.display = "none";
    console.log("🎙️ Rol establecido: Host-PC");
    window.location.reload();
  };

  // Asignar rol de User2
  btnUser2.onclick = () => {
    userName = "User2";
    localStorage.setItem("karaokeRole", userName);
    overlay.style.display = "none";
    console.log("🎧 Rol establecido: User2");
    window.location.reload();
  };
}

// Llamar al selector al cargar la página
window.addEventListener("DOMContentLoaded", initRoleSelector);


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
// ===================================================
// 🧭 Reiniciar rol manualmente (Ctrl + R)
// ===================================================
function resetRole() {
  localStorage.removeItem("karaokeRole");
  alert("Rol eliminado. Se recargará la página para volver a elegir.");
  window.location.reload();
}

// Escucha de teclado: Ctrl + R
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    resetRole();
  }
});
