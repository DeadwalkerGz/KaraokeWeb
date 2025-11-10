// server.js (versión HTTPS lista)

import express from "express";
import http from "http";
import https from "https"; // 🔹 Agregado
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { analyzeSong } from "./analyze/songAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===============================
// 🔹 Cargar certificados SSL
// ===============================
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, "cert", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "cert", "cert.pem")),
};

// ===============================
// 🔹 Crear servidor HTTPS
// ===============================
const server = https.createServer(sslOptions, app);

// Inicializa Socket.IO con configuración estable
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = 3000;

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// 🔹 SOCKET.IO — Comunicación en tiempo real
// ===============================
io.on("connection", (socket) => {
  console.log(`🟢 Usuario conectado: ${socket.id}`);

  // Recibir nombre del usuario (Host o User2)
  socket.on("setUser", (name) => {
    socket.userName = name;
    console.log(`👤 Usuario identificado como: ${name}`);
    io.emit("userConnected", { name });
  });

  // Reenviar tono (pitch) a todos los demás
  socket.on("pitchData", (data) => {
    socket.broadcast.emit("updatePitch", data);
  });

  // Reenviar selección de canción
  socket.on("selectSong", (song) => {
    console.log(`🎵 Canción seleccionada: ${song}`);
    io.emit("songSelected", song);
  });

  // 🔹 Reenviar control de música (play/pause)
  socket.on("musicControl", (data) => {
    console.log(`🎛️ Control recibido: ${data.action} de ${data.from}`);
    io.emit("musicControl", data);
  });

  // ===================================================
  // 🔸 NUEVO EVENTO → Sincronización de Play (Karaoke)
  // ===================================================
  socket.on("playSong", (data) => {
    console.log(`▶️ Evento de Play recibido de ${data.sender}`);
    // Reenviar a todos los demás usuarios
    socket.broadcast.emit("playSong", data);
  });

  // 🔴 Desconexión
  socket.on("disconnect", () => {
    console.log(`🔴 Usuario desconectado: ${socket.id}`);
    io.emit("userDisconnected", { name: socket.userName });
  });
});

// ===============================
// 🔹 ENDPOINTS DE API
// ===============================
app.get("/api/analyze/:file", async (req, res) => {
  const file = req.params.file;
  try {
    const result = await analyzeSong(file);
    res.json({ status: "ok", ref: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", msg: err.message });
  }
});

app.get("/api/songs", (req, res) => {
  const uploadsDir = path.join(__dirname, "public", "uploads");
  fs.readdir(uploadsDir, (err, files) => {
    if (err)
      return res.status(500).json({ error: "No se pudieron leer las canciones." });
    const songs = files.filter((f) => /\.(mp3|wav|ogg)$/i.test(f));
    res.json(songs);
  });
});

// ===============================
// 🔹 INICIO DEL SERVIDOR
// ===============================
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🔒 Servidor Karaoke HTTPS corriendo en: https://192.168.1.8:${PORT}`);
  console.log("📡 Micrófono habilitado para dispositivos móviles.");
});
