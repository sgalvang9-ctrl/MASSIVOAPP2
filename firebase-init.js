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

function emailDeAttuid(attuid){
  return String(attuid || "").trim().toLowerCase().replace(/[^a-z0-9]/g,"") + "@leoncentro.app";
}
function slugify(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-"); }

window.LC = {
  auth: LCAuth,
  db: LCDb,

  // Autorregistro (opcional) — un ejecutivo crea su propia cuenta.
  // SOLO funciona si su ATTUID ya está en la lista blanca.
  signUp: function(nombre, attuid, tienda, password){
    var attuidUpper = (attuid || "").trim().toUpperCase();
    if(!attuidUpper) return Promise.reject(new Error("Escribe tu ATTUID."));
    var email = emailDeAttuid(attuidUpper);

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
          rol: rol,
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function(){ return cred.user; });
      });
    });
  },

  // Login normal — ATTUID + contraseña. Si es la primera vez que esa
  // cuenta entra (fue creada a mano por el gerente en Firebase Auth,
  // sin perfil todavía en Firestore), se autoaprovisiona sola leyendo
  // la lista blanca — el ejecutivo no tiene que llenar ningún formulario.
  signIn: function(attuid, password){
    var attuidUpper = (attuid || "").trim().toUpperCase();
    var email = emailDeAttuid(attuidUpper);
    return LCAuth.signInWithEmailAndPassword(email, password).then(function(cred){
      return window.LC.getPerfil(cred.user.uid).then(function(perfil){
        if(perfil) return cred.user;
        // sin perfil todavía — autoaprovisionar desde la lista blanca
        return LCDb.collection("attuidsAutorizados").doc(attuidUpper).get().then(function(wDoc){
          if(!wDoc.exists || wDoc.data().activo !== true){
            return LCAuth.signOut().then(function(){
              throw new Error("Tu ATTUID no está autorizado. Pídele a tu gerente que te agregue en Firestore.");
            });
          }
          var w = wDoc.data();
          return LCDb.collection("usuarios").doc(cred.user.uid).set({
            nombre: w.nombreSugerido || attuidUpper,
            attuid: attuidUpper,
            tienda: w.tienda || "",
            rol: w.rol || "ejecutivo",
            creadoEn: firebase.firestore.FieldValue.serverTimestamp()
          }).then(function(){ return cred.user; });
        });
      });
    });
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
  },

  // ---------- Promos: registro de envíos y estado de contactos ----------
  registrarEnvio: function(perfil){
    var fecha = new Date().toISOString().slice(0,10);
    return LCDb.collection("envios").add({
      tienda: perfil.tienda, ejecutivo: perfil.nombre, attuid: perfil.attuid,
      uid: LCAuth.currentUser ? LCAuth.currentUser.uid : null,
      fecha: fecha,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(){ /* nunca debe romper el envío por esto */ });
  },

  promosSetEstado: function(tienda, phone, estado){
    var id = slugify(tienda) + "__" + phone;
    return LCDb.collection("promosContactos").doc(id).set({
      tienda: tienda, phone: phone, estado: estado,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  },
  promosClearEstado: function(tienda, phone){
    var id = slugify(tienda) + "__" + phone;
    return LCDb.collection("promosContactos").doc(id).delete();
  },
  promosGetEstados: function(tienda){
    return LCDb.collection("promosContactos").where("tienda","==",tienda).get().then(function(snap){
      var out = {};
      snap.forEach(function(doc){ out[doc.data().phone] = doc.data(); });
      return out;
    });
  },

  // ---------- Llamadas: registro de resultado ----------
  registrarLlamada: function(perfil, resultado){
    var fecha = new Date().toISOString().slice(0,10);
    return LCDb.collection("llamadas").add({
      tienda: perfil.tienda, ejecutivo: perfil.nombre, attuid: perfil.attuid,
      uid: LCAuth.currentUser ? LCAuth.currentUser.uid : null,
      resultado: resultado, fecha: fecha,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(){});
  },

  // ---------- conteo de actividad del día, por ATTUID ----------
  contarMensajesHoy: function(attuid){
    var fecha = new Date().toISOString().slice(0,10);
    return LCDb.collection("envios").where("attuid","==",attuid).where("fecha","==",fecha).get().then(function(snap){ return snap.size; });
  },
  contarLlamadasHoy: function(attuid){
    var fecha = new Date().toISOString().slice(0,10);
    return LCDb.collection("llamadas").where("attuid","==",attuid).where("fecha","==",fecha).get().then(function(snap){ return snap.size; });
  },

  // ---------- Checklist: autoguardado por día en tiempo real ----------
  checklistGuardarDia: function(perfil, semana, dia, datosDia){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve();
    var id = uid + "_" + semana + "_" + dia;
    var doc = Object.assign({}, datosDia, {
      uid: uid, ejecutivo: perfil.nombre, attuid: perfil.attuid, tienda: perfil.tienda,
      semana: semana, dia: dia,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    return LCDb.collection("checklistDias").doc(id).set(doc, {merge:true});
  },

  checklistCargarSemana: function(semana){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve({});
    return LCDb.collection("checklistDias")
      .where("uid","==",uid).where("semana","==",semana)
      .get().then(function(snap){
        var out = {};
        snap.forEach(function(doc){ out[doc.data().dia] = doc.data(); });
        return out;
      });
  },

  checklistCargarEquipoSemana: function(semana){
    return LCDb.collection("checklistDias").where("semana","==",semana).get().then(function(snap){
      var out = [];
      snap.forEach(function(doc){ out.push(doc.data()); });
      return out;
    });
  },

  // ---------- Vista Gerencial: actividad real de la semana, directo de Firestore ----------
  contarActividadSemana: function(semanaInicio){
    var inicio = new Date(semanaInicio + "T00:00:00");
    var fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
    var fechaInicio = semanaInicio;
    var fechaFin = fin.toISOString().slice(0,10);

    var mensajesQ = LCDb.collection("envios").where("fecha",">=",fechaInicio).where("fecha","<=",fechaFin).get();
    var llamadasQ = LCDb.collection("llamadas").where("fecha",">=",fechaInicio).where("fecha","<=",fechaFin).get();

    return Promise.all([mensajesQ, llamadasQ]).then(function(results){
      var mensajesPorAttuid = {}, llamadasPorAttuid = {};
      results[0].forEach(function(doc){
        var a = doc.data().attuid || "(sin ATTUID)";
        mensajesPorAttuid[a] = (mensajesPorAttuid[a] || 0) + 1;
      });
      results[1].forEach(function(doc){
        var a = doc.data().attuid || "(sin ATTUID)";
        llamadasPorAttuid[a] = (llamadasPorAttuid[a] || 0) + 1;
      });
      return { mensajesPorAttuid: mensajesPorAttuid, llamadasPorAttuid: llamadasPorAttuid };
    });
  }
};
