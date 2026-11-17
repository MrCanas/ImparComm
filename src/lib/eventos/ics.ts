/**
 * Invitación de calendario (RFC 5545), una por invitado.
 *
 * - UID estable por evento e invitado: reenviar o actualizar no duplica el evento.
 * - SEQUENCE = ics_sequence del evento: sube al cambiar fecha o lugar.
 * - METHOD:REQUEST para el correo de confirmación (el cliente lo trata como
 *   invitación) y METHOD:PUBLISH para la descarga desde la landing.
 * - Horas en Europe/Madrid con su VTIMEZONE (Exchange la reescribe a «Romance
 *   Standard Time» al enviar, comprobado en el test de calidad).
 */

export interface DatosIcs {
  metodo: "REQUEST" | "PUBLISH";
  uidEvento: string;
  invitadoId: string;
  secuencia: number;
  inicio: Date;
  fin: Date;
  resumen: string;
  lugar?: string | null;
  descripcion?: string | null;
  url?: string | null;
  organizador: { email: string; nombre: string };
  asistente?: { email: string; nombre?: string | null };
  ahora?: Date;
}

const VTIMEZONE_MADRID = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Madrid",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Escapa un valor de texto (RFC 5545 §3.3.11). */
export function icsTexto(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Pliega una línea a 75 octetos sin partir caracteres UTF-8 (RFC 5545 §3.1). */
export function plegar(linea: string): string {
  const partes: string[] = [];
  let buf = Buffer.from(linea, "utf8");
  let limite = 75;
  while (buf.length > limite) {
    let n = limite;
    while (n > 0 && (buf[n]! & 0xc0) === 0x80) n--;
    partes.push(buf.subarray(0, n).toString("utf8"));
    buf = buf.subarray(n);
    limite = 74; // las líneas de continuación empiezan por un espacio
  }
  partes.push(buf.toString("utf8"));
  return partes.join("\r\n ");
}

/** Fecha y hora local de Madrid en formato iCalendar (YYYYMMDDTHHMMSS). */
export function horaMadrid(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function cn(nombre: string): string {
  // Parámetro CN: entre comillas si lleva caracteres especiales; sin comillas internas.
  const limpio = nombre.replace(/["\r\n]/g, "");
  return /[;:,]/.test(limpio) ? `"${limpio}"` : limpio;
}

export function generarIcs(d: DatosIcs): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Impar Capital//ImparComm Eventos//ES",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${d.metodo}`,
    ...VTIMEZONE_MADRID,
    "BEGIN:VEVENT",
    `UID:${d.uidEvento}-${d.invitadoId}@imparcapital.com`,
    `DTSTAMP:${utc(d.ahora ?? new Date())}`,
    `SEQUENCE:${d.secuencia}`,
    `DTSTART;TZID=Europe/Madrid:${horaMadrid(d.inicio)}`,
    `DTEND;TZID=Europe/Madrid:${horaMadrid(d.fin)}`,
    `SUMMARY:${icsTexto(d.resumen)}`,
    ...(d.lugar ? [`LOCATION:${icsTexto(d.lugar)}`] : []),
    ...(d.descripcion ? [`DESCRIPTION:${icsTexto(d.descripcion)}`] : []),
    ...(d.url ? [`URL:${d.url}`] : []),
    `ORGANIZER;CN=${cn(d.organizador.nombre)}:mailto:${d.organizador.email}`,
    ...(d.asistente
      ? [
          `ATTENDEE;CN=${cn(d.asistente.nombre || d.asistente.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${d.asistente.email}`,
        ]
      : []),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsTexto(d.resumen)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.map(plegar).join("\r\n") + "\r\n";
}

/** Enlace «Añadir a Google Calendar». */
export function enlaceGoogle(d: Pick<DatosIcs, "inicio" | "fin" | "resumen" | "lugar" | "descripcion">): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: d.resumen,
    dates: `${utc(d.inicio)}/${utc(d.fin)}`,
    ctz: "Europe/Madrid",
    ...(d.lugar ? { location: d.lugar } : {}),
    ...(d.descripcion ? { details: d.descripcion } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Enlace «Añadir a Outlook» (outlook.office.com). */
export function enlaceOutlook(d: Pick<DatosIcs, "inicio" | "fin" | "resumen" | "lugar" | "descripcion">): string {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: d.resumen,
    startdt: d.inicio.toISOString(),
    enddt: d.fin.toISOString(),
    ...(d.lugar ? { location: d.lugar } : {}),
    ...(d.descripcion ? { body: d.descripcion } : {}),
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${q.toString()}`;
}
