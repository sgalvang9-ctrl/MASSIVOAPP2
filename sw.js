const CACHE_NAME = "leoncentro-v9";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./promos.html",
  "./checklist_salida.html",
  "./llamadas.html",
  "./firebase-init.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(CORE_ASSETS);
    })
  );
  self.skipWaiting();
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

// Cache-first para el cascarón de la app; network-first (con fallback a caché) para todo lo demás.
self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return;

  var url = new URL(req.url);
  var isCore = url.origin === self.location.origin;

  if(isCore){
    event.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req).then(function(res){
          var resClone = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, resClone); });
          return res;
        });
      }).catch(function(){
        return caches.match("./index.html");
      })
    );
  }else{
    // librerías externas (SheetJS, jsPDF): intenta red, si falla usa lo que haya en caché
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
