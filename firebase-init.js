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

function sumarSemanas(semanaISO, n){
  var d = new Date(semanaISO + "T00:00:00");
  d.setDate(d.getDate() + n*7);
  return fechaLocal(d);
}
function etiquetaSemana(semanaISO){
  var i = new Date(semanaISO + "T00:00:00");
  var f = new Date(i); f.setDate(i.getDate()+6);
  var m = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return i.getDate() + " " + m[i.getMonth()] + " – " + f.getDate() + " " + m[f.getMonth()];
}

window.LC = {
  lunesDeLaSemana: lunesDeLaSemana,
  sumarSemanas: sumarSemanas,
  etiquetaSemana: etiquetaSemana,
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
        kpis: d.kpis || { pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0, arpuConEquipo:0, arpuSoloServicio:0, arpuRenovaciones:0, citas:0, campanas:0, resenas:0 }
      };
    }).catch(function(){
      return { mensajesSemana:0, llamadasSemana:0, diasPiso:6, porAttuid:{},
               kpis:{ pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0, arpuConEquipo:0, arpuSoloServicio:0, arpuRenovaciones:0, citas:0, campanas:0, resenas:0 } };
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
    return { pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0,
             arpuConEquipo:0, arpuSoloServicio:0, arpuRenovaciones:0,
             citas:0, campanas:0, resenas:0, prospectosPos:0, prospectosRen:0,
             efectivo:0, tarjeta:0 };
  },

  _sumarDocs: function(docs){
    var t = window.LC._kpisVacio(), conEq = [], soloSrv = [], renov = [];
    docs.forEach(function(d){
      var a = d.activos || {};
      var c = d.crm || {}, pr = d.prospeccion || {}, cj = d.caja || {};
      t.prospectosPos += Number(c.pos) || 0;
      t.prospectosRen += Number(c.ren) || 0;
      t.campanas      += Number(pr.campanas) || 0;
      t.resenas       += Number(d.resenas) || 0;
      t.efectivo      += Number(cj.efectivo) || 0;
      t.tarjeta       += Number(cj.tarjeta) || 0;
      t.citas         += (d.citasConfirmadas && d.citasConfirmadas.length) || 0;
      t.pospagoNuevo  += Number(a.pospagoNuevo)  || 0;
      t.pospagoPropio += Number(a.pospagoPropio) || 0;
      t.renovacion    += Number(a.renovacion)    || 0;
      t.accesorios    += Number(a.accesorios)    || 0;
      t.seguros       += Number(a.seguros)       || 0;
      var r = d.arpu || {};
      // ARPU con equipo = lo capturado en "equipo nuevo"
      var n1 = Number(r.equipoNuevo) || 0;  if(n1 > 0) conEq.push(n1);
      // ARPU solo servicio = lo capturado en "equipo propio"
      var n2 = Number(r.equipoPropio) || 0; if(n2 > 0) soloSrv.push(n2);
      var n3 = Number(r.renovaciones) || 0;  if(n3 > 0) renov.push(n3);
    });
    function prom(a){ return a.length ? Math.round(a.reduce(function(x,y){return x+y;},0)/a.length) : 0; }
    t.arpuConEquipo     = prom(conEq);
    t.arpuSoloServicio  = prom(soloSrv);
    t.arpuRenovaciones  = prom(renov);
    return t;
  },

  _sumarKpis: function(snap){
    var docs = [];
    snap.forEach(function(doc){ docs.push(doc.data()); });
    return window.LC._sumarDocs(docs);
  },

  // Actividad por día de todo el equipo (para contar días en 0)
  actividadEquipoPorDia: function(semanaInicio){
    var inicio = new Date(semanaInicio + "T00:00:00");
    var fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
    var fFin = fechaLocal(fin);
    var qm = LCDb.collection("envios").where("fecha",">=",semanaInicio).where("fecha","<=",fFin).get();
    var ql = LCDb.collection("llamadas").where("fecha",">=",semanaInicio).where("fecha","<=",fFin).get();
    return Promise.all([qm, ql]).then(function(r){
      var porAttuid = {};   // attuid -> { fecha: true }
      function marcar(doc){
        var d = doc.data(), a = d.attuid;
        if(!a) return;
        if(!porAttuid[a]) porAttuid[a] = {};
        porAttuid[a][d.fecha] = true;
      }
      r[0].forEach(marcar); r[1].forEach(marcar);
      return porAttuid;
    }).catch(function(){ return {}; });
  },

  // Resumen completo del equipo: prospección + venta + tasa de cierre.
  // Solo tiene sentido para el gerente (las reglas limitan la lectura ajena).
  resumenEquipo: function(semana){
    return Promise.all([
      window.LC.contarActividadSemana(semana),
      window.LC.kpisEquipoSemana(semana),
      window.LC.listarEquipo(),
      window.LC.actividadEquipoPorDia(semana)
    ]).then(function(r){
      var act = r[0] || {}, kpis = r[1] || {}, equipo = r[2] || [], porDia = r[3] || {};
      var msj = act.mensajesPorAttuid || {}, llm = act.llamadasPorAttuid || {};
      var vistos = {};
      equipo.forEach(function(p){ vistos[p.attuid] = true; });
      var attuidGerente = null;
      equipo.forEach(function(p){ if((p.rol||"") === "gerente") attuidGerente = p.attuid; });
      Object.keys(msj).concat(Object.keys(llm)).concat(Object.keys(kpis)).forEach(function(a){
        if(a && a !== "(sin ATTUID)" && a !== attuidGerente && !vistos[a]){
          vistos[a] = true; equipo.push({attuid:a, nombre:a});
        }
      });
      // El gerente no cuenta para cuotas ni promedios del equipo
      equipo = equipo.filter(function(p){ return (p.rol || "ejecutivo") !== "gerente"; });

      var filas = equipo.map(function(p){
        var k = kpis[p.attuid] || window.LC._kpisVacio();
        var m = msj[p.attuid] || 0, l = llm[p.attuid] || 0;
        var contactos = m + l;
        var activaciones = k.pospagoNuevo + k.pospagoPropio + k.renovacion;
        return {
          attuid: p.attuid, nombre: p.nombre, rol: p.rol || "ejecutivo",
          mensajes: m, llamadas: l, contactos: contactos,
          activaciones: activaciones, kpis: k,
          cierre: contactos > 0 ? Math.round(activaciones / contactos * 1000) / 10 : null,
          diasEnCero: (function(){
            var inicio = new Date(semana + "T00:00:00");
            var hoy = new Date(); hoy.setHours(0,0,0,0);
            var conAct = porDia[p.attuid] || {};
            var cero = 0;
            for(var i=0;i<7;i++){
              var d = new Date(inicio); d.setDate(inicio.getDate()+i);
              if(d > hoy) break;                       // días futuros no cuentan
              if(!conAct[fechaLocal(d)]) cero++;
            }
            return cero;
          })()
        };
      });
      // totales de tienda
      var tot = { mensajes:0, llamadas:0, activaciones:0,
                  pospagoNuevo:0, pospagoPropio:0, renovacion:0, accesorios:0, seguros:0,
                  citas:0, campanas:0, resenas:0, prospectosPos:0, prospectosRen:0,
                  efectivo:0, tarjeta:0 };
      filas.forEach(function(f){
        tot.mensajes += f.mensajes; tot.llamadas += f.llamadas; tot.activaciones += f.activaciones;
        ["pospagoNuevo","pospagoPropio","renovacion","accesorios","seguros",
         "citas","campanas","resenas","prospectosPos","prospectosRen","efectivo","tarjeta"]
          .forEach(function(k){ tot[k] += f.kpis[k] || 0; });
      });
      var conCierre = filas.filter(function(f){ return f.cierre !== null; });
      var promCierre = conCierre.length
        ? Math.round(conCierre.reduce(function(a,f){return a+f.cierre;},0) / conCierre.length * 10) / 10
        : null;
      return { filas: filas, totales: tot, promedioCierre: promCierre };
    });
  },

  // Agregados del equipo (solo promedios, sin datos de nadie en particular).
  // Los escribe el gerente al abrir Gerencia; los lee todo el equipo.
  guardarAgregados: function(semana, ag){
    return LCDb.collection("config").doc("agregados_" + semana).set({
      semana: semana,
      promedioCierre: (ag.promedioCierre === null || ag.promedioCierre === undefined) ? null : Number(ag.promedioCierre),
      promedioContactos: Number(ag.promedioContactos) || 0,
      promedioActivaciones: Number(ag.promedioActivaciones) || 0,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true}).catch(function(){});
  },

  getAgregados: function(semana){
    return LCDb.collection("config").doc("agregados_" + semana).get().then(function(doc){
      return doc.exists ? doc.data() : null;
    }).catch(function(){ return null; });
  },

  // Espejo del ejecutivo: sus propios números + el promedio del equipo como
  // referencia, SIN exponer datos individuales de nadie más.
  miEspejo: function(attuid, semana){
    return Promise.all([
      window.LC.contarActividadSemana(semana),
      window.LC.kpisSemana(attuid, semana),
      window.LC.actividadEquipoPorDia(semana),
      window.LC.listarEquipo(),
      window.LC.getAgregados(semana)
    ]).then(function(r){
      var act = r[0] || {}, misKpis = r[1] || window.LC._kpisVacio();
      var porDia = r[2] || {}, equipo = (r[3] || []).filter(function(p){
        return (p.rol || "ejecutivo") !== "gerente";
      });
      var msj = act.mensajesPorAttuid || {}, llm = act.llamadasPorAttuid || {};

      var mios = { mensajes: msj[attuid] || 0, llamadas: llm[attuid] || 0 };
      mios.contactos = mios.mensajes + mios.llamadas;
      mios.activaciones = misKpis.pospagoNuevo + misKpis.pospagoPropio + misKpis.renovacion;
      mios.cierre = mios.contactos > 0
        ? Math.round(mios.activaciones / mios.contactos * 1000) / 10 : null;

      // promedios del equipo — solo agregados, nunca por persona
      var contactosEq = [], sumaContactos = 0;
      equipo.forEach(function(p){
        var c = (msj[p.attuid]||0) + (llm[p.attuid]||0);
        sumaContactos += c;
        if(c > 0) contactosEq.push(c);
      });
      var promContactos = contactosEq.length
        ? Math.round(sumaContactos / contactosEq.length) : 0;

      // días en cero propios
      var inicio = new Date(semana + "T00:00:00");
      var hoy = new Date(); hoy.setHours(0,0,0,0);
      var conAct = porDia[attuid] || {}, cero = 0;
      for(var i=0;i<7;i++){
        var d = new Date(inicio); d.setDate(inicio.getDate()+i);
        if(d > hoy) break;
        if(!conAct[fechaLocal(d)]) cero++;
      }
      mios.diasEnCero = cero;
      mios.kpis = misKpis;

      var ag = r[4] || {};
      return {
        mios: mios,
        promedioContactos: promContactos,
        promedioCierre: (ag.promedioCierre === undefined) ? null : ag.promedioCierre
      };
    }).catch(function(){ return null; });
  },

  // ---------- Base repartida por el gerente ----------
  // El gerente sube el Excel; el sistema reparte parejo entre los ejecutivos
  // que él elija. Lo no atendido se acumula con lo nuevo.
  repartirBase: function(perfil, contactos, attuids, nombreBase){
    if(!attuids || !attuids.length) return Promise.reject(new Error("Elige al menos un ejecutivo."));
    var lote = "base_" + Date.now();
    var batchSize = 400;
    var docs = contactos.map(function(c, i){
      return {
        phone: c.phone,
        nombre: c.name || "",
        asignadoA: attuids[i % attuids.length],   // reparto parejo, en orden
        estado: "pendiente",                      // pendiente | atendido
        lote: lote,
        nombreBase: nombreBase || "",
        tienda: (perfil && perfil.tienda) || "",
        creadoPor: LCAuth.currentUser ? LCAuth.currentUser.uid : null,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      };
    });

    // Firestore limita cada lote; se manda por tandas
    function mandarTanda(desde){
      if(desde >= docs.length) return Promise.resolve({total: docs.length, lote: lote});
      var batch = LCDb.batch();
      docs.slice(desde, desde + batchSize).forEach(function(d){
        var ref = LCDb.collection("baseAsignada").doc(d.asignadoA + "_" + d.phone);
        batch.set(ref, d, {merge:true});
      });
      return batch.commit().then(function(){ return mandarTanda(desde + batchSize); });
    }
    return mandarTanda(0);
  },

  // Lo que me toca atender hoy
  miBaseAsignada: function(attuid){
    return LCDb.collection("baseAsignada")
      .where("asignadoA","==",attuid).where("estado","==","pendiente").get()
      .then(function(snap){
        var out = [];
        snap.forEach(function(d){ var x = d.data(); x._id = d.id; out.push(x); });
        return out;
      }).catch(function(){ return []; });
  },

  marcarAtendido: function(attuid, phone){
    return LCDb.collection("baseAsignada").doc(attuid + "_" + phone).set({
      estado: "atendido",
      atendidoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true}).catch(function(){});
  },

  // Avance de la base, para el gerente
  avanceBase: function(){
    return LCDb.collection("baseAsignada").get().then(function(snap){
      var por = {};
      snap.forEach(function(d){
        var x = d.data(), a = x.asignadoA || "(sin asignar)";
        if(!por[a]) por[a] = { pendientes:0, atendidos:0, total:0 };
        por[a].total++;
        if(x.estado === "atendido") por[a].atendidos++; else por[a].pendientes++;
      });
      return por;
    }).catch(function(){ return {}; });
  },

  // ---------- Seguimiento de clientes potenciales ----------
  // Solo se guarda el teléfono de quien el ejecutivo marca como potencial:
  // es la única forma de poder recordárselo después.
  guardarSeguimiento: function(perfil, datos){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.reject(new Error("Sin sesión"));
    var id = uid + "_" + String(datos.phone||"").replace(/\D/g,"");
    var doc = {
      uid: uid,
      attuid: (perfil && perfil.attuid) || "",
      ejecutivo: (perfil && (perfil.nombre || perfil.ejecutivo)) || "",
      tienda: (perfil && perfil.tienda) || "",
      phone: datos.phone || "",
      nombre: datos.nombre || "",
      etiqueta: datos.etiqueta || "",
      comentario: datos.comentario || "",
      estado: datos.estado || "potencial",     // potencial | vendido | descartado
      origen: datos.origen || "lista",         // lista | base
      ultimoContacto: fechaLocal(),
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    };
    if(datos.creado !== false) doc.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
    return LCDb.collection("seguimientos").doc(id).set(doc, {merge:true});
  },

  // Mis seguimientos abiertos (potenciales sin cerrar)
  misSeguimientos: function(){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve([]);
    return LCDb.collection("seguimientos")
      .where("uid","==",uid).where("estado","==","potencial").get()
      .then(function(snap){
        var out = [];
        snap.forEach(function(d){ var x = d.data(); x._id = d.id; out.push(x); });
        // los que llevan más tiempo sin seguimiento, primero
        out.sort(function(a,b){ return String(a.ultimoContacto||"").localeCompare(String(b.ultimoContacto||"")); });
        return out;
      }).catch(function(){ return []; });
  },

  // ¿Este número ya tiene nota? (para mostrarla antes de volver a contactar)
  seguimientoDe: function(phone){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.resolve(null);
    var id = uid + "_" + String(phone||"").replace(/\D/g,"");
    return LCDb.collection("seguimientos").doc(id).get()
      .then(function(d){ return d.exists ? d.data() : null; })
      .catch(function(){ return null; });
  },

  cerrarSeguimiento: function(phone, estado){
    var uid = LCAuth.currentUser ? LCAuth.currentUser.uid : null;
    if(!uid) return Promise.reject(new Error("Sin sesión"));
    var id = uid + "_" + String(phone||"").replace(/\D/g,"");
    return LCDb.collection("seguimientos").doc(id).set({
      estado: estado,                                   // vendido | descartado
      cerradoEn: firebase.firestore.FieldValue.serverTimestamp()
    }, {merge:true});
  },

  // Para el gerente: todos los seguimientos de la tienda
  seguimientosEquipo: function(){
    return LCDb.collection("seguimientos").where("estado","==","potencial").get()
      .then(function(snap){
        var out = [];
        snap.forEach(function(d){ out.push(d.data()); });
        return out;
      }).catch(function(){ return []; });
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
