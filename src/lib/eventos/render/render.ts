/**
 * Genera el correo final (HTML + texto plano) a partir de una plantilla y un
 * invitado. Función pura: se usa igual en la vista previa, el envío de prueba
 * y la consola de envíos, así que lo que se ve es exactamente lo que se envía.
 *
 * HTML «a prueba de Outlook»: maquetación con tablas, estilos en línea, ancho
 * máximo fijo y fuentes con respaldo. Outlook de escritorio ignora la lista de
 * respaldo cuando la primera fuente no existe (cae en Times New Roman), así que
 * para Outlook se fuerza Georgia en títulos y Arial en el cuerpo.
 */
import {
  FUENTE_CUERPO,
  FUENTE_TITULO,
  MARCA_POR_DEFECTO,
  type Bloque,
  type ContenidoPlantilla,
  type ContextoCorreo,
  type CorreoGenerado,
  type Marca,
} from "./tipos";
import { escHtml, fechaEvento, horaEvento, sustituir } from "./variables";

/** Límite práctico: Gmail recorta los correos de más de 102 KB. */
export const MAX_BYTES = 100 * 1024;

const TEXTO_BAJA = "Si no deseas recibir más comunicaciones de este tipo, puedes";

function urlSegura(u: string): string | null {
  const t = u.trim();
  return /^(https:\/\/|mailto:)/i.test(t) ? t : null;
}

/** Texto con formato mínimo: **negrita**, [texto](url) y saltos de línea. Entrada ya escapada. */
function formatoTexto(html: string, colorEnlace: string): string {
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (todo, txt: string, url: string) => {
      const u = urlSegura(url.replace(/&amp;/g, "&"));
      return u ? `<a href="${escHtml(u)}" style="color:${colorEnlace};text-decoration:underline">${txt}</a>` : txt;
    })
    .replace(/\r?\n/g, "<br>");
}

function mayusculas(s: string): string {
  return s.toLocaleUpperCase("es-ES");
}

function boton(texto: string, href: string, fondo: string, colorTexto: string, m: Marca): string {
  // Borde del color del texto: así el botón claro («No podré») también se ve como botón.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr>
<td align="center" bgcolor="${fondo}" style="background:${fondo};border:1px solid ${fondo.toUpperCase() === "#FFFFFF" ? colorTexto : fondo};border-radius:2px">
<a href="${escHtml(href)}" class="c" style="display:inline-block;padding:13px 26px;font-family:${FUENTE_CUERPO};font-size:${m.cuerpoTamano}px;font-weight:700;letter-spacing:1px;color:${colorTexto};text-decoration:none;text-transform:uppercase">${escHtml(mayusculas(texto))}</a>
</td></tr></table>`;
}

function fila(contenido: string, padding = "0 40px 20px"): string {
  return `<tr><td class="px" style="padding:${padding}">${contenido}</td></tr>`;
}

function bloqueHtml(b: Bloque, ctx: ContextoCorreo, m: Marca): string {
  const respuesta = ctx.enlaces.respuesta;
  switch (b.tipo) {
    case "imagen": {
      const src = urlSegura(b.src);
      if (!src) return "";
      const ancho = Math.min(b.ancho ?? m.anchoMax, m.anchoMax);
      const img = `<img src="${escHtml(src)}" alt="${escHtml(sustituir(b.alt, ctx, false))}" width="${ancho}" style="display:block;width:100%;max-width:${ancho}px;height:auto;border:0;outline:none;text-decoration:none;margin:0 auto">`;
      const conEnlace = b.enlace === "respuesta" ? `<a href="${escHtml(respuesta)}">${img}</a>` : img;
      return `<tr><td align="center" style="padding:0 0 20px">${conEnlace}</td></tr>`;
    }
    case "titulo": {
      const tam = b.tamano ?? (b.nivel === 2 ? m.subtituloTamano : m.tituloTamano);
      const color = b.color === "acento" ? m.colorAcento : m.colorPrincipal;
      const texto = escHtml(mayusculas(sustituir(b.texto, ctx, false)));
      const tag = b.nivel === 2 ? "h2" : "h1";
      return fila(
        `<${tag} class="t" style="margin:0;font-family:${FUENTE_TITULO};font-size:${tam}px;line-height:1.3;font-weight:400;letter-spacing:${m.tituloEspaciado}px;color:${color};text-align:${b.alineacion ?? "center"};text-transform:uppercase">${texto}</${tag}>`,
      );
    }
    case "texto": {
      const tam = b.tamano ?? m.cuerpoTamano;
      const html = formatoTexto(sustituir(escHtml(b.texto), ctx, true), m.colorPrincipal);
      return fila(
        `<p class="c" style="margin:0;font-family:${FUENTE_CUERPO};font-size:${tam}px;line-height:${m.interlineado};color:${m.colorTexto};text-align:${b.alineacion ?? "left"}">${html}</p>`,
      );
    }
    case "botones_rsvp": {
      const celda = (txt: string, r: string, fondo: string, color: string) =>
        `<td class="rsvp" align="center" style="padding:0 6px 10px">${boton(txt, `${respuesta}?r=${r}`, fondo, color, m)}</td>`;
      return fila(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${celda(b.si, "si", m.colorPrincipal, "#FFFFFF")}${celda(b.quizas, "quizas", m.colorAcento, "#FFFFFF")}${celda(b.no, "no", "#FFFFFF", m.colorPrincipal)}</tr></table>`,
        "0 34px 14px",
      );
    }
    case "boton": {
      const href =
        b.destino === "respuesta" ? respuesta : b.destino === "calendario" ? ctx.enlaces.calendario : urlSegura(b.url ?? "");
      if (!href) return "";
      return fila(boton(sustituir(b.texto, ctx, false), href, m.colorPrincipal, "#FFFFFF", m));
    }
    case "ficha_evento": {
      const e = ctx.evento;
      const datos: [string, string][] = [
        ["Fecha", fechaEvento(e.inicio)],
        ["Hora", horaEvento(e.inicio, e.fin)],
        ...(e.lugar ? [["Lugar", e.lugar] as [string, string]] : []),
        ...(e.direccion ? [["Dirección", e.direccion] as [string, string]] : []),
      ];
      const filas = datos
        .map(
          ([k, v]) =>
            `<tr><td class="c" style="padding:6px 12px 6px 0;font-family:${FUENTE_CUERPO};font-size:${m.pieTamano + 1}px;letter-spacing:1px;color:${m.colorAcento};text-transform:uppercase;white-space:nowrap;vertical-align:top">${escHtml(mayusculas(k))}</td><td class="c" style="padding:6px 0;font-family:${FUENTE_CUERPO};font-size:${m.cuerpoTamano}px;line-height:1.4;color:${m.colorTexto}">${escHtml(v)}</td></tr>`,
        )
        .join("");
      const mapa =
        b.mostrarMapa !== false && e.mapaUrl && urlSegura(e.mapaUrl)
          ? `<p class="c" style="margin:10px 0 0;font-family:${FUENTE_CUERPO};font-size:${m.pieTamano + 2}px"><a href="${escHtml(e.mapaUrl)}" style="color:${m.colorPrincipal}">Ver en el mapa</a></p>`
          : "";
      return fila(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${m.colorAcento};border-bottom:1px solid ${m.colorAcento};padding:10px 0">${filas}</table>${mapa}`,
      );
    }
    case "separador":
      return fila(`<div style="height:1px;line-height:1px;font-size:1px;background:${m.colorAcento}">&nbsp;</div>`);
    case "espacio":
      return `<tr><td style="height:${Math.max(4, Math.min(b.alto, 80))}px;line-height:1px;font-size:1px">&nbsp;</td></tr>`;
    case "pie":
      return "";
  }
}

function pieHtml(texto: string | null, ctx: ContextoCorreo, m: Marca): string {
  const legal = texto ? formatoTexto(sustituir(escHtml(texto), ctx, true), "#8A8A8A") + "<br><br>" : "";
  return `<tr><td class="px" style="padding:24px 40px 28px;border-top:1px solid #EAEBEE">
<p class="c" style="margin:0;font-family:${FUENTE_CUERPO};font-size:${m.pieTamano}px;line-height:1.5;color:#8A8A8A;text-align:center">${legal}${TEXTO_BAJA} <a href="${escHtml(ctx.enlaces.baja)}" style="color:#8A8A8A;text-decoration:underline">darte de baja aquí</a>.</p>
</td></tr>`;
}

function documento(cuerpo: string, preheader: string, m: Marca): string {
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${m.colorFondo}">${escHtml(preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>`
    : "";
  return `<!doctype html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville&family=Lato:wght@400;700&display=swap" rel="stylesheet"><!--<![endif]-->
<!--[if mso]><style>.t{font-family:Georgia,serif!important}.c{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
img{-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:620px){.px{padding-left:20px!important;padding-right:20px!important}.rsvp{display:block!important;width:100%!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${m.colorFondo}">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${m.colorFondo}"><tr><td align="center" style="padding:24px 8px">
<!--[if mso]><table role="presentation" width="${m.anchoMax}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${m.anchoMax}px;background:${m.colorTarjeta}">
${cuerpo}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

function textoPlanoBloques(bloques: Bloque[], ctx: ContextoCorreo): string {
  const out: string[] = [];
  for (const b of bloques) {
    switch (b.tipo) {
      case "titulo":
        out.push(mayusculas(sustituir(b.texto, ctx, false)));
        break;
      case "texto":
        out.push(sustituir(b.texto, ctx, false).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)"));
        break;
      case "botones_rsvp":
        out.push(
          `${b.si}: ${ctx.enlaces.respuesta}?r=si\n${b.quizas}: ${ctx.enlaces.respuesta}?r=quizas\n${b.no}: ${ctx.enlaces.respuesta}?r=no`,
        );
        break;
      case "boton": {
        const href = b.destino === "respuesta" ? ctx.enlaces.respuesta : b.destino === "calendario" ? ctx.enlaces.calendario : b.url;
        if (href) out.push(`${sustituir(b.texto, ctx, false)}: ${href}`);
        break;
      }
      case "ficha_evento": {
        const e = ctx.evento;
        out.push(
          [`Fecha: ${fechaEvento(e.inicio)}`, `Hora: ${horaEvento(e.inicio, e.fin)}`, e.lugar && `Lugar: ${e.lugar}`, e.direccion && `Dirección: ${e.direccion}`]
            .filter(Boolean)
            .join("\n"),
        );
        break;
      }
      case "pie":
        out.push(sustituir(b.texto, ctx, false));
        break;
      default:
        break;
    }
  }
  out.push(`${TEXTO_BAJA} darte de baja aquí: ${ctx.enlaces.baja}`);
  return out.filter((s) => s.trim()).join("\n\n");
}

/** Texto plano aproximado a partir de un HTML propio. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(style|head|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_t, href: string, txt: string) => `${txt.replace(/<[^>]+>/g, "").trim()} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function generarCorreo(p: ContenidoPlantilla, ctx: ContextoCorreo, marca: Partial<Marca> = {}): CorreoGenerado {
  const m: Marca = { ...MARCA_POR_DEFECTO, ...marca };
  const asunto = sustituir(p.asunto, ctx, false).replace(/[\r\n]+/g, " ").trim();
  const preheader = p.preheader ? sustituir(p.preheader, ctx, false) : "";

  let html: string;
  let texto: string;
  if (p.modo === "html") {
    html = sustituir(p.html ?? "", ctx, true);
    texto = htmlATexto(html);
  } else {
    const pie = p.bloques.find((b): b is Extract<Bloque, { tipo: "pie" }> => b.tipo === "pie");
    const cuerpo = p.bloques.map((b) => bloqueHtml(b, ctx, m)).join("\n") + pieHtml(pie?.texto ?? null, ctx, m);
    html = documento(cuerpo, preheader, m);
    texto = textoPlanoBloques(p.bloques, ctx);
  }
  return { asunto, html, texto, bytes: Buffer.byteLength(html, "utf8") };
}
