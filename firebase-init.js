// firebase-init.js — configuración compartida de Firebase
// Usado por index.html (concha/login), promos.html, checklist_salida.html y llamadas.html
// Requiere que el HTML ya haya cargado, ANTES de este archivo:
//   firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js

var firebaseConfig = {
  apiKey: "AIzaSyDn_fccvUlE3QdmQNGCBfciMUSCn2jlN04",
  authDomain: "gestion-de-personal-64fbe.firebaseapp.com",
  projectId: "gestion-de-personal-64fbe",
  storageBucket: "gestion-de-personal-64fbe.firebasestorage.app",
  messagingSenderId: "267253226951",
  appId: "1:267253226951:web:af48917ac3f2fa64fccde2",
  measurementId: "G-M1Q470GVVD"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

var LCAuth = firebase.auth();
var LCDb = firebase.firestore();

// Persistencia local — la sesión se recuerda en este navegador (compartida
// entre la concha y los 3 iframes, porque todos viven en el mismo origen).
LCAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});

window.LC = {
  auth: LCAuth,
  db: LCDb,

  // Crea una cuenta nueva — SOLO si el ATTUID ya está en la lista blanca
  // (colección "attuidsAutorizados" en Firestore, la administra el gerente
  // directo desde la consola de Firebase — no desde ninguna app).
  signUp: function(nombre, attuid, tienda, email, password){
    var attuidUpper = (attuid || "").trim().toUpperCase();
    if(!attuidUpper) return Promise.reject(new Error("Escribe tu ATTUID."));

    return LCDb.collection("attuidsAutorizados").doc(attuidUpper).get().then(function(wDoc){
      if(!wDoc.exists || wDoc.data().activo !== true){
        throw new Error("Tu ATTUID no está autorizado todavía. Pídele a tu gerente que te agregue en Firestore.");
      }
      var rol = wDoc.data().rol || "ejecutivo";
      return LCAuth.createUserWithEmailAndPassword(email, password).then(function(cred){
        return LCDb.collection("usuarios").doc(cred.user.uid).set({
          nombre: nombre,
          attuid: attuidUpper,
          tienda: tienda,
          email: email,
          rol: rol,
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(){ return cred.user; });
      });
    });
  },

  signIn: function(email, password){
    return LCAuth.signInWithEmailAndPassword(email, password).then(function(cred){ return cred.user; });
  },

  signOut: function(){
    return LCAuth.signOut();
  },

  getPerfil: function(uid){
    return LCDb.collection("usuarios").doc(uid).get().then(function(doc){
      return doc.exists ? doc.data() : null;
    });
  },

  // callback(user, perfil) — user es null si no hay sesión activa
  onAuthChange: function(callback){
    LCAuth.onAuthStateChanged(function(user){
      if(!user){ callback(null, null); return; }
      window.LC.getPerfil(user.uid).then(function(perfil){
        callback(user, perfil);
      });
    });
  }
};
