// server.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { analyzeSong } from "./analyze/songAnalyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));
// Analiza una canción seleccionada y genera la referencia
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

// Endpoint para listar canciones disponibles
app.get("/api/songs", (req, res) => {
  const uploadsDir = path.join(__dirname, "public", "uploads");

  fs.readdir(uploadsDir, (err, files) => {
    if (err) return res.status(500).json({ error: "No se pudieron leer las canciones." });

    // Solo MP3, WAV, OGG
    const songs = files.filter(f => /\.(mp3|wav|ogg)$/i.test(f));
    res.json(songs);
  });
});

// Servir canciones directamente
app.get("/uploads/:file", (req, res) => {
  const filePath = path.join(__dirname, "public", "uploads", req.params.file);
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  console.log(`🎤 Servidor Karaoke corriendo en: http://localhost:${PORT}`);
});
