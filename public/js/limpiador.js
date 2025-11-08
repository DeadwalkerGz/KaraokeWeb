// 🧹 limpiarGuia.js - Limpieza automática de picos y errores en guía de audio
// Genera: cancionUno_limpia.json (descarga en tu PC)

async function limpiarGuia() {
  const inputFile = "assets/cancionUno.json";
  const outputFile = "assets/cancionUno_limpia.json";

  // 1) Cargar JSON original
  const res = await fetch(inputFile);
  if (!res.ok) { alert("No se pudo cargar " + inputFile); return; }
  let datos = await res.json();

  // 2) Filtro de rango vocal humano
  datos = datos.filter(p =>
    typeof p.tiempo === "number" &&
    typeof p.frecuencia === "number" &&
    p.frecuencia > 80 && p.frecuencia < 1200
  );

  // 3) Eliminar registros con tiempos duplicados consecutivos
  const unicos = [];
  for (let i = 0; i < datos.length; i++) {
    if (i === 0 || datos[i].tiempo !== datos[i - 1].tiempo) unicos.push(datos[i]);
  }

  // 4) Eliminar saltos bruscos (>200 Hz) consecutivos
  const filtrados = unicos.filter((p, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return Math.abs(p.frecuencia - prev.frecuencia) < 200;
  });

  // 5) Suavizado (promedio móvil de 3 puntos)
  const suavizados = filtrados.map((p, i, arr) => {
    const prev = arr[i - 1]?.frecuencia ?? p.frecuencia;
    const next = arr[i + 1]?.frecuencia ?? p.frecuencia;
    const prom = (prev + p.frecuencia + next) / 3;
    return { tiempo: p.tiempo, frecuencia: +prom.toFixed(2) };
  });

  // 6) Descargar archivo limpio
  const blob = new Blob([JSON.stringify(suavizados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = outputFile;
  a.click();
  URL.revokeObjectURL(url);
  alert("✅ Generado " + outputFile + " (" + suavizados.length + " puntos)");
}

window.addEventListener("DOMContentLoaded", limpiarGuia);
