/**
 * Revisión de una plantilla antes de guardarla o de usarla en un envío.
 * `errores` bloquean; `avisos` se muestran pero dejan continuar.
 */
import { generarCorreo, MAX_BYTES } from "./render";
import type { ContenidoPlantilla, ContextoCorreo, TipoPlantilla } from "./tipos";
import { variablesDesconocidas } from "./variables";

export interface Revision {
  errores: string[];
  avisos: string[];
}

const CTX_EJEMPLO: ContextoCorreo = {
  invitado: { nombre: "Nombre Apellido", empresa: "Empresa", cargo: "Cargo", email: "ejemplo@yopmail.com" },
  evento: {
    nombre: "Evento",
    inicio: new Date("2026-12-17T18:30:00Z"),
    fin: new Date("2026-12-17T21:30:00Z"),
    lugar: "Lugar",
    direccion: "Dirección",
    mapaUrl: "https://maps.example.com",
  },
  enlaces: {
    respuesta: "https://eventos.imparcapital.com/e/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    baja: "https://eventos.imparcapital.com/baja/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    calendario: "https://eventos.imparcapital.com/ics/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  },
};

export function revisarPlantilla(p: ContenidoPlantilla, tipo: TipoPlantilla): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];

  if (!p.asunto.trim()) errores.push("El asunto está vacío.");
  if (p.asunto.length > 120) avisos.push("El asunto es muy largo (más de 120 caracteres): se cortará en móvil.");

  const textos = [p.asunto, p.preheader ?? "", p.html ?? "", JSON.stringify(p.bloques)];
  const desconocidas = [...new Set(textos.flatMap(variablesDesconocidas))];
  if (desconocidas.length) errores.push(`Variables desconocidas: ${desconocidas.map((v) => `{{${v}}}`).join(", ")}.`);

  if (p.modo === "html") {
    const html = p.html ?? "";
    if (!html.trim()) errores.push("El HTML está vacío.");
    if (!/\{\{\s*enlace_baja\s*\}\}/.test(html)) errores.push("Falta el enlace de baja: {{enlace_baja}}.");
    if (tipo === "invitacion" || tipo === "recordatorio") {
      if (!/\{\{\s*enlace_respuesta\s*\}\}/.test(html)) errores.push("Falta el enlace para responder: {{enlace_respuesta}}.");
    }
    if (/<script\b/i.test(html)) errores.push("El HTML no puede contener <script>.");
    if (/\son[a-z]+\s*=/i.test(html)) errores.push("El HTML no puede contener atributos de eventos (onclick…).");
    if (/<(iframe|form|object|embed)\b/i.test(html)) errores.push("El HTML no puede contener iframes, formularios ni objetos incrustados.");
    if (/src\s*=\s*["']http:\/\//i.test(html)) errores.push("Hay imágenes por http: deben ser https.");
    for (const img of html.match(/<img\b[^>]*>/gi) ?? []) {
      if (!/\salt\s*=\s*["'][^"']+["']/i.test(img)) {
        avisos.push("Hay imágenes sin texto alternativo (alt): Outlook las bloquea por defecto y no se entendería el mensaje.");
        break;
      }
    }
    const soloTexto = html.replace(/<[^>]+>/g, " ").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
    if (soloTexto.length < 150) {
      avisos.push("Hay muy poco texto real: un correo que es casi solo imagen tiene más riesgo de acabar en spam.");
    }
  } else {
    if (p.bloques.length === 0) errores.push("La plantilla no tiene bloques.");
    if (!p.bloques.some((b) => b.tipo === "pie")) errores.push("Falta el bloque de pie (texto legal y baja).");
    if ((tipo === "invitacion" || tipo === "recordatorio") && !p.bloques.some((b) => b.tipo === "botones_rsvp" || (b.tipo === "boton" && b.destino === "respuesta"))) {
      errores.push("Una invitación o recordatorio necesita los botones de respuesta o un botón «Responder».");
    }
    for (const b of p.bloques) {
      if (b.tipo === "imagen") {
        if (!/^https:\/\//.test(b.src)) errores.push("Hay una imagen sin dirección https.");
        if (!b.alt.trim()) avisos.push("Hay una imagen sin texto alternativo.");
      }
      if (b.tipo === "boton" && b.destino === "url" && !/^https:\/\//.test(b.url ?? "")) {
        errores.push("Hay un botón con enlace que no es https.");
      }
    }
    const tieneTexto = p.bloques.some((b) => b.tipo === "texto" && b.texto.trim().length > 40);
    if (!tieneTexto) avisos.push("No hay ningún bloque de texto: conviene acompañar la imagen con texto real.");
  }

  try {
    const correo = generarCorreo(p, CTX_EJEMPLO);
    if (correo.bytes > MAX_BYTES) {
      errores.push(`El correo pesa ${Math.round(correo.bytes / 1024)} KB: Gmail lo recorta a partir de 102 KB (máximo 100 KB).`);
    } else if (correo.bytes > 80 * 1024) {
      avisos.push(`El correo pesa ${Math.round(correo.bytes / 1024)} KB: cerca del límite de Gmail.`);
    }
  } catch (err) {
    errores.push(`No se pudo generar el correo: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { errores, avisos };
}
