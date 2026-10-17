// ──────────────────────────────────────────────────────────────────────
//  FOTOS DEL EQUIPO
//
//  Mapa de ATTUID → archivo de la foto, dentro de la carpeta /fotos/.
//
//  Los archivos NO se nombran con el ATTUID a propósito. El sitio de
//  Netlify es público aunque el repositorio sea privado, así que un
//  archivo llamado "fotos/LM164E.jpg" lo podría adivinar cualquiera que
//  conozca el número de empleado. Con una clave aleatoria, no.
//
//  Para dar de alta una foto:
//    1. Guarda la imagen en /fotos/ con un nombre aleatorio (.jpg o .webp),
//       cuadrada y de 400x400 px es más que suficiente.
//    2. Agrega aquí la línea "ATTUID": "fotos/<archivo>".
//
//  Quien no tenga foto aquí sale con sus iniciales. No hay que hacer nada
//  más para eso.
// ──────────────────────────────────────────────────────────────────────
window.LC_FOTOS = {
  // "LM164E": "fotos/a7f3c9d2e1.jpg",
};

// Devuelve la ruta de la foto de alguien, o null si no tiene.
window.fotoDe = function(attuid){
  try{
    var m = window.LC_FOTOS || {};
    return m[attuid] || null;
  }catch(e){ return null; }
};
