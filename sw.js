const CACHE_NAME = "leoncentro-v35";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./tablero.html",
  "./gerencia.html",
  "./promos.html",
  "./checklist_salida.html",
  "./llamadas.html",
  "./firebase-init.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalación resiliente: si un recurso falla, NO se cae toda la instalación.
// (Antes usábamos cache.addAll, que falla completo si un solo archivo da 404 —
// eso dejó service workers viejos atorados sirviendo copias viejas de la app.)
self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(
        CORE_ASSETS.map(function(asset){
          return cache.add(asset).catch(function(){ /* recurso opcional faltante: continuar */ });
        })
      );
    })
  );
});

// Permite que la app le pida activarse de inmediato (botón "Actualizar")
self.addEventListener("message", function(ev){
  if(ev.data && ev.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// HTML y navegación: SIEMPRE red primero (con fallback a caché si no hay internet).
// Así, cada vez que subimos una versión nueva, se ve de inmediato — nunca más
// una copia vieja atorada. Solo los recursos estáticos usan cache-first.
self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;

  var url = new URL(req.url);
  var isCore = url.origin === self.location.origin;
  var esHTML = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1 || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  var esJS = url.pathname.endsWith(".js");

  if(isCore && (esHTML || esJS)){
    // network-first: siempre intenta traer lo más nuevo
    event.respondWith(
      fetch(req).then(function(res){
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(cached){
          return cached || caches.match("./index.html");
        });
      })
    );
  }else if(isCore){
    // estáticos propios (iconos, manifest): cache-first
    event.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req).then(function(res){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
          return res;
        });
      })
    );
  }else{
    // librerías externas: red primero, caché de respaldo
    event.respondWith(
      fetch(req).then(function(res){
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
        return res;
      }).catch(function(){
        return caches.match(req);
      })
    );
  }
});
