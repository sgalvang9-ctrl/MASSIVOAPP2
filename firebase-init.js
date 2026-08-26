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

// Huella irreversible del teléfono: permite saber si un número ya está dado
// de baja SIN guardar el número mismo en la base. No se puede "descifrar".
// Se usa un salt fijo por tienda para que la huella no sea adivinable con
// una simple tabla de los 10 dígitos posibles.
function huellaTelefono(tienda, phone){
  var base = "leoncentro::" + slugify(tienda) + "::" + String(phone||"").replace(/\D/g,"");
  var h1 = 5381, h2 = 52711;
  for(var i=0;i<base.length;i++){
    var c = base.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + (c * 31)) >>> 0;
  }
  return "h" + h1.toString(36) + h2.toString(36);
}

// Fecha de HOY en horario local (México), no UTC — toISOString() da la fecha
// en UTC y puede adelantarse un día completo por la tarde/noche.
function fechaLocal(d){
  d = d || new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth()+1).padStart(2,"0");
  var dd = String(d.getDate()).padStart(2,"0");
  return yyyy + "-" + mm + "-" + dd;
}

function lunesDeLaSemana(d){
  d = d || new Date();
  var dia = d.getDay();               // 0=domingo
  var off = (dia === 0) ? -6 : 1 - dia;
  var l = new Date(d); l.setDate(d.getDate() + off);
  return fechaLocal(l);
}

window.LC = {
  lunesDeLaSemana: lunesDeLaSemana,
  auth: LCAuth,
  db: LCDb,

  // El autorregistro está deshabilitado a propósito: las cuentas las crea
  // el gerente desde la consola de Firebase. Así nadie puede apropiarse de
  // un ATTUID ajeno registrándolo antes que su dueño.
  signUp: function(){
    return Promise.reject(new Error("El registro está deshabilitado. Pide tu cuenta a tu gerente."));
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
      }).catch(function(err){
        // si la lectura del perfil falla, avisamos en vez de dejar la pantalla colgada
        console.error("No se pudo leer el perfil:", err);
        callback(user, null);
      });
    });
  },

  // ---------- Promos: registro de envíos y estado de contactos ----------
  registrarEnvio: function(perfil){
    var fecha = fechaLocal();
    perfil = perfil || {};
    return LCDb.collection("envios").add({
      tienda: perfil.tienda || "",
      ejecutivo: perfil.nombre || perfil.ejecutivo || "",
      attuid: perfil.attuid || "",
      uid: LCAuth.currentUser ? LCAuth.currentUser.uid : null,
      fecha: fecha,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  promosSetEstado: function(tienda, phone, estado){
    var id = slugify(tienda) + "__" + huellaTelefono(tienda, phone);
    return LCDb.collection("promosContactos").doc(id).set({
      tienda: tienda,
      huella: huellaTelefono(tienda, phone),   // ya NO se guarda el número
      estado: estado,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  promosClearEstado: function(tienda, phone){
    var nuevoId = slugify(tienda) + "__" + huellaTelefono(tienda, phone);
    var viejoId = slugify(tienda) + "__" + phone;   // formato anterior, en claro
    return Promise.all([
      LCDb.collection("promosContactos").doc(nuevoId).delete().catch(function(){}),
      LCDb.collection("promosContactos").doc(viejoId).delete().catch(function(){})
    ]);
  },

  // Devuelve un objeto indexado por huella. Entiende los registros viejos
  // (que traían el teléfono en claro) y los convierte al vuelo.
  promosGetEstados: function(tienda){
    return LCDb.collection("promosContactos").where("tienda","==",tienda).get().then(function(snap){
      var out = {};
      snap.forEach(function(doc){
        var d = doc.data();
        var huella = d.huella || (d.phone ? huellaTelefono(tienda, d.phone) : null);
        if(!huella) return;
        out[huella] = { estado: d.estado, ts: d.ts, legacyId: d.huella ? null : doc.id };
      });
      return out;
    });
  },

  huellaTelefono: function(tienda, phone){ return huellaTelefono(tienda, phone); },

  // Migración silenciosa: reescribe en formato cifrado los registros viejos
  // que todavía traen el teléfono en claro, y borra el original.
  promosMigrarViejos: function(tienda){
    return LCDb.collection("promosContactos").where("tienda","==",tienda).get().then(function(snap){
      var pendientes = [];
      snap.forEach(function(doc){
        var d = doc.data();
        if(d.huella || !d.phone) return;   // ya está migrado
        var h = huellaTelefono(tienda, d.phone);
        pendientes.push(
          LCDb.collection("promosContactos").doc(slugify(tienda) + "__" + h).set({
            tienda: tienda, huella: h, estado: d.estado, ts: d.ts || firebase.firestore.FieldValue.serverTimestamp()
          }).then(function(){
            return LCDb.collection("promosContactos").doc(doc.id).delete();
          }).catch(function(){})
        );
      });
      return Promise.all(pendientes).then(function(){ return pendientes.length; });
    }).catch(function(){ return 0; });
  },

  // ---------- Llamadas: registro de resultado ----------
  registrarLlamada: function(perfil, resultado){
    var fecha = fechaLocal();
    perfil = perfil || {};
    return LCDb.collection("llamadas").add({
      tienda: perfil.tienda || "",
      ejecutivo: perfil.nombre || perfil.ejecutivo || "",
      attuid: perfil.attuid || "",
      uid: LCAuth.currentUser ? LCAuth.currentUser.uid : null,
      resultado: resultado || "",
      fecha: fecha,
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // ---------- conteo de actividad del día, por ATTUID ----------
  contarMensajesHoy: function(attuid){
    var fecha = fechaLocal();
    return LCDb.collection("envios").where("attuid","==",attuid).where("fecha","==",fecha).get().then(function(snap){ return snap.size; });
  },
  contarLlamadasHoy: function(attuid){
    var fecha = fechaLocal();
    return LCDb.collection("llamadas").where("attuid","==",attuid).where("fecha","==",fecha).get().then(function(snap){ return snap.size; });
  },

  contarActividadDia: function(attuid, fecha){
    var mensajesQ = LCDb.collection("envios").where("attuid","==",attuid).where("fecha","==",fecha).get();
    var llamadasQ = LCDb.collection("llamadas").where("attuid","==",attuid).where("fecha","==",fecha).get();
    return Promise.all([mensajesQ, llamadasQ]).then(function(results){
      return { mensajes: results[0].size, llamadas: results[1].size };
    });
  },

  // ---------- Checklist: autoguardado por día en tiempo real ----------
  checklistGuardarDia: function(perfil, semana, dia, datosDia){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve();
    var id = uid + "_" + semana + "_" + dia;
    var doc = Object.assign({}, datosDia, {
      uid: uid, ejecutivo: (perfil && (perfil.nombre || perfil.ejecutivo)) || "", attuid: (perfil && perfil.attuid) || "", tienda: (perfil && perfil.tienda) || "",
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

  // ---------- Cuotas del equipo (las fija el gerente, las ve todo el equipo) ----------
  getCuotas: function(){
    return LCDb.collection("config").doc("cuotas").get().then(function(doc){
      var d = doc.exists ? doc.data() : {};
      return {
        mensajesSemana: d.mensajesSemana || 0,
        llamadasSemana: d.llamadasSemana || 0,
        diasPiso: d.diasPiso || 6,
        porAttuid: d.porAttuid || {},   // cuotas individuales que pisan la general
        kpis: d.kpis || { pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0, arpu:0 }
      };
    }).catch(function(){
      return { mensajesSemana:0, llamadasSemana:0, diasPiso:6, porAttuid:{},
               kpis:{ pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0, arpu:0 } };
    });
  },

  setCuotas: function(cuotas){
    var doc = {
      mensajesSemana: Number(cuotas.mensajesSemana) || 0,
      llamadasSemana: Number(cuotas.llamadasSemana) || 0,
      diasPiso: Number(cuotas.diasPiso) || 6,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      actualizadoPor: LCAuth.currentUser ? LCAuth.currentUser.uid : null
    };
    if(cuotas.porAttuid) doc.porAttuid = cuotas.porAttuid;
    if(cuotas.kpis) doc.kpis = cuotas.kpis;
    return LCDb.collection("config").doc("cuotas").set(doc, {merge:true});
  },

  // Cuota semanal efectiva de una persona: la suya si la tiene, si no la del equipo
  cuotaDe: function(cuotas, attuid){
    var ind = (cuotas && cuotas.porAttuid && cuotas.porAttuid[attuid]) || null;
    return {
      mensajesSemana: (ind && Number(ind.mensajesSemana)) || Number(cuotas.mensajesSemana) || 0,
      llamadasSemana: (ind && Number(ind.llamadasSemana)) || Number(cuotas.llamadasSemana) || 0,
      individual: !!ind
    };
  },

  // ---------- KPIs de venta (salen del Checklist, sin captura extra) ----------
  kpisSemana: function(attuid, semana){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve(null);
    return LCDb.collection("checklistDias")
      .where("uid","==",uid).where("semana","==",semana).get()
      .then(function(snap){ return window.LC._sumarKpis(snap); })
      .catch(function(){ return window.LC._kpisVacio(); });
  },

  kpisEquipoSemana: function(semana){
    return LCDb.collection("checklistDias").where("semana","==",semana).get().then(function(snap){
      var porAttuid = {};
      snap.forEach(function(doc){
        var d = doc.data(), a = d.attuid || "(sin ATTUID)";
        if(!porAttuid[a]) porAttuid[a] = { docs: [] };
        porAttuid[a].docs.push(d);
      });
      var out = {};
      Object.keys(porAttuid).forEach(function(a){
        out[a] = window.LC._sumarDocs(porAttuid[a].docs);
      });
      return out;
    }).catch(function(){ return {}; });
  },

  _kpisVacio: function(){
    return { pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0, arpu:0 };
  },

  _sumarDocs: function(docs){
    var t = window.LC._kpisVacio(), arpuVals = [];
    docs.forEach(function(d){
      var a = d.activos || {};
      t.pospagoNuevo  += Number(a.pospagoNuevo)  || 0;
      t.pospagoPropio += Number(a.pospagoPropio) || 0;
      t.renovacion    += Number(a.renovacion)    || 0;
      t.accesorios    += Number(a.accesorios)    || 0;
      t.seguros       += Number(a.seguros)       || 0;
      var r = d.arpu || {};
      [r.equipoNuevo, r.equipoPropio, r.renovaciones].forEach(function(v){
        var n = Number(v) || 0;
        if(n > 0) arpuVals.push(n);
      });
    });
    t.arpu = arpuVals.length ? Math.round(arpuVals.reduce(function(x,y){return x+y;},0) / arpuVals.length) : 0;
    return t;
  },

  _sumarKpis: function(snap){
    var docs = [];
    snap.forEach(function(doc){ docs.push(doc.data()); });
    return window.LC._sumarDocs(docs);
  },

  // Lista de todo el equipo (para el ranking), desde la lista blanca
  listarEquipo: function(){
    return LCDb.collection("attuidsAutorizados").get().then(function(snap){
      var out = [];
      snap.forEach(function(doc){
        var d = doc.data();
        if(d.activo === true) out.push({ attuid: doc.id, nombre: d.nombreSugerido || doc.id, rol: d.rol || "ejecutivo" });
      });
      return out;
    }).catch(function(){ return []; });
  },

  // Actividad día por día de la semana, para graficar (Lun→Dom)
  actividadSemanaPorDia: function(attuid, semanaInicio){
    var inicio = new Date(semanaInicio + "T00:00:00");
    var fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
    var fFin = fechaLocal(fin);
    var qm = LCDb.collection("envios").where("attuid","==",attuid)
              .where("fecha",">=",semanaInicio).where("fecha","<=",fFin).get();
    var ql = LCDb.collection("llamadas").where("attuid","==",attuid)
              .where("fecha",">=",semanaInicio).where("fecha","<=",fFin).get();
    return Promise.all([qm, ql]).then(function(r){
      var dias = [];
      for(var i=0;i<7;i++){
        var d = new Date(inicio); d.setDate(inicio.getDate()+i);
        dias.push(fechaLocal(d));
      }
      var m = [0,0,0,0,0,0,0], l = [0,0,0,0,0,0,0];
      r[0].forEach(function(doc){ var i = dias.indexOf(doc.data().fecha); if(i>=0) m[i]++; });
      r[1].forEach(function(doc){ var i = dias.indexOf(doc.data().fecha); if(i>=0) l[i]++; });
      return { fechas: dias, mensajes: m, llamadas: l };
    }).catch(function(){
      return { fechas: [], mensajes:[0,0,0,0,0,0,0], llamadas:[0,0,0,0,0,0,0] };
    });
  },

  // ---------- Vista Gerencial: actividad real de la semana, directo de Firestore ----------
  contarActividadSemana: function(semanaInicio){
    var inicio = new Date(semanaInicio + "T00:00:00");
    var fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
    var fechaInicio = semanaInicio;
    var fechaFin = fechaLocal(fin);

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
