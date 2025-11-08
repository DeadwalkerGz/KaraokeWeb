document.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('audio');
  const letraActual = document.getElementById('letra-actual');

  let letras = [];

  // Cargar letra.json
  fetch('public/letra.json')
    .then(response => response.json())
    .then(data => {
      letras = data;
    });

  // Escuchar cada cambio de tiempo en el audio
  audio.ontimeupdate = () => {
    const tiempoActual = audio.currentTime;
    actualizarLetra(tiempoActual);
  };

  function actualizarLetra(tiempo) {
    for (let i = letras.length - 1; i >= 0; i--) {
      if (tiempo >= letras[i].tiempo) {
        letraActual.textContent = letras[i].linea;
        break;
      }
    }
  }
});
