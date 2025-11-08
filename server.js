const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// ✅ Permitir recursos locales
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self';"
  );
  next();
});

// ✅ Servir directamente la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Página principal (ahora dentro de /public)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Página del analizador
app.get('/analizador', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analizador.html'));
});

// ✅ Iniciar servidor
app.listen(PORT, () => {
  console.log(`🎶 Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`➡️  Analizador: http://localhost:${PORT}/analizador.html`);
});
