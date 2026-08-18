/**
 * MasivoApp — receptor de reporte centralizado + control de acceso y plantilla
 *
 * Qué hace: recibe un POST cada vez que un ejecutivo manda un mensaje (log),
 * y responde a GET con la configuración de control: qué ATTUIDs están
 * autorizados a usar la app, y cuál es la plantilla de mensaje aprobada.
 * NO recibe números de teléfono ni nombres de clientes.
 *
 * CÓMO INSTALARLO: igual que antes (ver pasos 1-10 más abajo). Si ya lo
 * tenías instalado, solo reemplaza el código y haz una NUEVA implementación
 * (Deploy → Manage deployments → editar → nueva versión) — la URL /exec no cambia.
 *
 * 1. Crea un Google Sheet nuevo (o usa uno que ya tengas para esto).
 * 2. En el Sheet: Extensiones → Apps Script.
 * 3. Borra el código de ejemplo y pega TODO este archivo.
 * 4. Guarda (ícono de disquete).
 * 5. Implementar → Nueva implementación → tipo "Aplicación web".
 * 6. "Ejecutar como": tu cuenta. "Quién tiene acceso": Cualquier usuario.
 * 7. Implementar, acepta los permisos.
 * 8. Copia la URL que termina en /exec — esa va en la app.
 * 9. En el editor, selecciona "configurarHojasIniciales" en el menú desplegable
 *    y dale ▶ Ejecutar una vez — te deja las 3 hojas (Envíos, Resumen, Config) listas.
 * 10. Abre la hoja "Config": ahí pones los ATTUIDs autorizados (uno por renglón,
 *     columna A) y el mensaje aprobado (columna C, una sola celda C2). Edítalos
 *     cuando quieras — la app los jala en cada uso, sin que tengas que tocar código.
 */

var HEADER_BG = "#0b2545";
var HEADER_FG = "#ffffff";

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function formatearEnviosHeader_(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, 5);
  headerRange.setValues([["Fecha/hora recibido", "Tienda", "Ejecutivo", "ATTUID", "Timestamp del envío"]]);
  headerRange.setFontWeight("bold").setFontColor(HEADER_FG).setBackground(HEADER_BG);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 5, 160);
  sheet.getRange(1,1,1,5).setHorizontalAlignment("center");
}

function formatearLlamadasHeader_(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, 6);
  headerRange.setValues([["Fecha/hora recibido", "Tienda", "Ejecutivo", "ATTUID", "Resultado", "Timestamp de la llamada"]]);
  headerRange.setFontWeight("bold").setFontColor(HEADER_FG).setBackground(HEADER_BG);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 6, 150);
  sheet.getRange(1,1,1,6).setHorizontalAlignment("center");
}

function formatearResumenHeader_(sheet) {
  sheet.getRange("A1").setValue("Resumen por ATTUID — se actualiza solo con cada envío");
  sheet.getRange("A1:B1").merge().setFontWeight("bold").setFontSize(12)
    .setFontColor(HEADER_FG).setBackground(HEADER_BG).setHorizontalAlignment("center");
  sheet.getRange("A2:B2").setValues([["ATTUID", "Mensajes enviados"]])
    .setFontWeight("bold").setBackground("#e1e6ec");
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 160);
  sheet.setFrozenRows(2);

  sheet.getRange("D1").setValue("Resumen por día (últimos 14 días)");
  sheet.getRange("D1:E1").merge().setFontWeight("bold").setFontSize(12)
    .setFontColor(HEADER_FG).setBackground(HEADER_BG).setHorizontalAlignment("center");
  sheet.getRange("D2:E2").setValues([["Fecha", "Mensajes enviados"]])
    .setFontWeight("bold").setBackground("#e1e6ec");
  sheet.setColumnWidth(4, 140);
  sheet.setColumnWidth(5, 160);
}

function formatearConfigHeader_(sheet) {
  sheet.getRange("A1").setValue("ATTUIDs autorizados (uno por renglón, deja vacío = todos permitidos)");
  sheet.getRange("A1:B1").merge().setFontWeight("bold")
    .setFontColor(HEADER_FG).setBackground(HEADER_BG);
  sheet.getRange("C1").setValue("Mensaje autorizado (edítalo aquí, se actualiza para todos)");
  sheet.getRange("C1:D1").merge().setFontWeight("bold")
    .setFontColor(HEADER_FG).setBackground(HEADER_BG);
  if (!sheet.getRange("C2").getValue()) {
    sheet.getRange("C2").setValue("Hola {nombre}, tenemos promos especiales este mes en AT&T. Escríbeme si te interesa saber más.");
  }
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(3, 420);
  sheet.setFrozenRows(1);
}

var CHECKLIST_HEADERS = [
  "Guardado en", "Ejecutivo", "ATTUID", "Semana", "Día",
  "Prospectos POS", "Prospectos REN", "Campañas", "Llamadas", "Mensajes", "Reseñas",
  "Pospago nuevo", "Pospago propio", "Renovación", "Accesorios", "Seguros",
  "ARPU nuevo", "ARPU propio", "ARPU renovaciones",
  "Efectivo", "Tarjeta", "Cheque salida", "Yubikeys"
];

function formatearChecklistHeader_(sheet) {
  var headerRange = sheet.getRange(1, 1, 1, CHECKLIST_HEADERS.length);
  headerRange.setValues([CHECKLIST_HEADERS]);
  headerRange.setFontWeight("bold").setFontColor(HEADER_FG).setBackground(HEADER_BG);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, CHECKLIST_HEADERS.length, 120);
}

function actualizarResumen_() {
  var enviosSheet = getOrCreateSheet_("Envíos");
  var resumenSheet = getOrCreateSheet_("Resumen");
  formatearResumenHeader_(resumenSheet);

  var lastRow = enviosSheet.getLastRow();
  if (lastRow < 2) return;

  var data = enviosSheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var porAttuid = {};
  var porDia = {};

  data.forEach(function(row) {
    var fecha = row[0];
    var attuid = row[3] || "(sin ATTUID)";
    porAttuid[attuid] = (porAttuid[attuid] || 0) + 1;
    if (fecha instanceof Date) {
      var diaKey = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");
      porDia[diaKey] = (porDia[diaKey] || 0) + 1;
    }
  });

  var attuidRows = Object.keys(porAttuid).sort().map(function(k){ return [k, porAttuid[k]]; });
  if (attuidRows.length) resumenSheet.getRange(3, 1, attuidRows.length, 2).setValues(attuidRows);

  var diaKeys = Object.keys(porDia).sort().reverse().slice(0, 14);
  var diaRows = diaKeys.map(function(k){ return [k, porDia[k]]; });
  if (diaRows.length) resumenSheet.getRange(3, 4, diaRows.length, 2).setValues(diaRows);
}

function leerConfig_() {
  var sheet = getOrCreateSheet_("Config");
  if (sheet.getLastRow() < 1) formatearConfigHeader_(sheet);

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var attuidsRaw = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(r){ return String(r[0] || "").trim(); })
    .filter(function(v){ return v !== ""; });

  var plantilla = String(sheet.getRange("C2").getValue() || "").trim();

  return { attuids: attuidsRaw, plantilla: plantilla };
}

function configurarHojasIniciales() {
  var envios = getOrCreateSheet_("Envíos");
  formatearEnviosHeader_(envios);
  var llamadas = getOrCreateSheet_("Llamadas");
  formatearLlamadasHeader_(llamadas);
  var config = getOrCreateSheet_("Config");
  formatearConfigHeader_(config);
  actualizarResumen_();
}

function guardarChecklist_(payload) {
  var sheet = getOrCreateSheet_("Checklist");
  if (sheet.getLastRow() === 0) formatearChecklistHeader_(sheet);

  var lastRow = sheet.getLastRow();
  var existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 5).getValues() : [];

  Object.keys(payload.dias || {}).forEach(function(dia) {
    var d = payload.dias[dia];
    var tieneAlgo = (d.crm && (d.crm.pos || d.crm.ren)) ||
      (d.prospeccion && (d.prospeccion.campanas || d.prospeccion.llamadas || d.prospeccion.mensajes)) ||
      (d.activos && (d.activos.pospagoNuevo || d.activos.pospagoPropio || d.activos.renovacion || d.activos.accesorios || d.activos.seguros)) ||
      (d.arpu && (d.arpu.equipoNuevo || d.arpu.equipoPropio || d.arpu.renovaciones)) ||
      (d.caja && (d.caja.efectivo || d.caja.tarjeta)) ||
      d.resenas;
    if (!tieneAlgo) return; // no guardes días vacíos

    var row = [
      new Date(),
      payload.ejecutivo || "",
      payload.attuid || "",
      payload.semana || "",
      dia,
      (d.crm && d.crm.pos) || "",
      (d.crm && d.crm.ren) || "",
      (d.prospeccion && d.prospeccion.campanas) || "",
      (d.prospeccion && d.prospeccion.llamadas) || "",
      (d.prospeccion && d.prospeccion.mensajes) || "",
      d.resenas || "",
      (d.activos && d.activos.pospagoNuevo) || "",
      (d.activos && d.activos.pospagoPropio) || "",
      (d.activos && d.activos.renovacion) || "",
      (d.activos && d.activos.accesorios) || "",
      (d.activos && d.activos.seguros) || "",
      (d.arpu && d.arpu.equipoNuevo) || "",
      (d.arpu && d.arpu.equipoPropio) || "",
      (d.arpu && d.arpu.renovaciones) || "",
      (d.caja && d.caja.efectivo) || "",
      (d.caja && d.caja.tarjeta) || "",
      d.chequeSalida ? "Sí" : "No",
      (d.yubikey && d.yubikey.cantidad) || ""
    ];

    // upsert: busca un renglón existente para este ejecutivo+semana+día y lo sobreescribe
    var foundRowIdx = -1;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][1] === payload.ejecutivo && existing[i][3] === payload.semana && existing[i][4] === dia) {
        foundRowIdx = i + 2; // +2 por header y base-1
        break;
      }
    }
    if (foundRowIdx > -1) {
      sheet.getRange(foundRowIdx, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      existing.push([row[0], row[1], "", row[3], row[4]]); // evita duplicar en el mismo POST
    }
  });
}

function leerChecklistPorSemana_(semana) {
  var sheet = getOrCreateSheet_("Checklist");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, CHECKLIST_HEADERS.length).getValues();
  return data
    .filter(function(row) { return String(row[3]) === semana; })
    .map(function(row) {
      var obj = {};
      CHECKLIST_HEADERS.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.dias) {
      // Payload del Checklist de Salida (trae "dias")
      guardarChecklist_(data);
      return ContentService.createTextOutput(JSON.stringify({ok: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.tipo === "llamada") {
      // Payload de Llamadas (registro de una llamada con su resultado)
      var llamadasSheet = getOrCreateSheet_("Llamadas");
      if (llamadasSheet.getLastRow() === 0) formatearLlamadasHeader_(llamadasSheet);

      llamadasSheet.appendRow([
        new Date(),
        data.tienda || "",
        data.ejecutivo || "",
        data.attuid || "",
        data.resultado || "",
        data.ts || ""
      ]);

      return ContentService.createTextOutput(JSON.stringify({ok: true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Payload de Promos (registro de un mensaje enviado)
    var sheet = getOrCreateSheet_("Envíos");
    if (sheet.getLastRow() === 0) formatearEnviosHeader_(sheet);

    sheet.appendRow([
      new Date(),
      data.tienda || "",
      data.ejecutivo || "",
      data.attuid || "",
      data.ts || ""
    ]);

    actualizarResumen_();

    return ContentService.createTextOutput(JSON.stringify({ok: true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function contarMensajesPorAttuidYFecha_(attuid, fechaStr) {
  var sheet = getOrCreateSheet_("Envíos");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var tz = Session.getScriptTimeZone();
  var count = 0;
  var attuidLower = String(attuid || "").toLowerCase().trim();
  data.forEach(function(row) {
    var fecha = row[0];
    var rowAttuid = String(row[3] || "").toLowerCase().trim();
    if (!(fecha instanceof Date)) return;
    var fechaKey = Utilities.formatDate(fecha, tz, "yyyy-MM-dd");
    if (fechaKey === fechaStr && rowAttuid === attuidLower) count++;
  });
  return count;
}

function contarLlamadasPorAttuidYFecha_(attuid, fechaStr) {
  var sheet = getOrCreateSheet_("Llamadas");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var tz = Session.getScriptTimeZone();
  var count = 0;
  var attuidLower = String(attuid || "").toLowerCase().trim();
  data.forEach(function(row) {
    var fecha = row[0];
    var rowAttuid = String(row[3] || "").toLowerCase().trim();
    if (!(fecha instanceof Date)) return;
    var fechaKey = Utilities.formatDate(fecha, tz, "yyyy-MM-dd");
    if (fechaKey === fechaStr && rowAttuid === attuidLower) count++;
  });
  return count;
}

function contarMensajesSemanaPorAttuid_(semanaInicioStr) {
  var sheet = getOrCreateSheet_("Envíos");
  var lastRow = sheet.getLastRow();
  var resultado = {};
  if (lastRow < 2) return resultado;

  var inicio = new Date(semanaInicioStr + "T00:00:00");
  var fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7); // exclusivo: lunes + 7 días = siguiente lunes

  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  data.forEach(function(row) {
    var fecha = row[0];
    var attuid = row[3] || "(sin ATTUID)";
    if (!(fecha instanceof Date)) return;
    if (fecha >= inicio && fecha < fin) {
      resultado[attuid] = (resultado[attuid] || 0) + 1;
    }
  });
  return resultado;
}

function contarLlamadasSemanaPorAttuid_(semanaInicioStr) {
  var sheet = getOrCreateSheet_("Llamadas");
  var lastRow = sheet.getLastRow();
  var resultado = {};
  if (lastRow < 2) return resultado;

  var inicio = new Date(semanaInicioStr + "T00:00:00");
  var fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  data.forEach(function(row) {
    var fecha = row[0];
    var attuid = row[3] || "(sin ATTUID)";
    if (!(fecha instanceof Date)) return;
    if (fecha >= inicio && fecha < fin) {
      resultado[attuid] = (resultado[attuid] || 0) + 1;
    }
  });
  return resultado;
}

function doGet(e) {
  try {
    var attuidParam = e.parameter && e.parameter.attuid;
    var fechaParam = e.parameter && e.parameter.fecha;
    var vistaParam = e.parameter && e.parameter.vista;
    var semanaParam = e.parameter && e.parameter.semana;

    if (vistaParam === "gerencial" && semanaParam) {
      var filas = leerChecklistPorSemana_(semanaParam);
      var mensajesPorAttuid = contarMensajesSemanaPorAttuid_(semanaParam);
      var llamadasPorAttuid = contarLlamadasSemanaPorAttuid_(semanaParam);
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, semana: semanaParam, filas: filas, mensajesPorAttuid: mensajesPorAttuid, llamadasPorAttuid: llamadasPorAttuid
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (attuidParam && fechaParam) {
      var mensajes = contarMensajesPorAttuidYFecha_(attuidParam, fechaParam);
      var llamadas = contarLlamadasPorAttuidYFecha_(attuidParam, fechaParam);
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, attuid: attuidParam, fecha: fechaParam, mensajes: mensajes, llamadas: llamadas
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var cfg = leerConfig_();
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      attuids: cfg.attuids,
      plantilla: cfg.plantilla
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


