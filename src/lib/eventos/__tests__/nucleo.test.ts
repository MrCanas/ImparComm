import assert from "node:assert/strict";
import { test } from "node:test";

import { comprobarDestino, entornoPermiteReal, esGenerica, normalizarEmail } from "../guardas";
import { enlaceGoogle, generarIcs, horaMadrid, plegar } from "../ics";
import { base64Lineas, cabecera, construirMime } from "../mime";
import { hashToken, tokenBienFormado, tokenCorresponde, tokenInvitado } from "../tokens";

const SECRETO = "s".repeat(40);

// ── Tokens ──────────────────────────────────────────────────────────────────
test("tokens: deterministas, 43 caracteres base64url y distintos por invitado", () => {
  const a = tokenInvitado("inv-1", SECRETO);
  assert.equal(a, tokenInvitado("inv-1", SECRETO));
  assert.notEqual(a, tokenInvitado("inv-2", SECRETO));
  assert.notEqual(a, tokenInvitado("inv-1", "otro".repeat(10)));
  assert.ok(tokenBienFormado(a));
  assert.equal(hashToken(a).length, 64);
  assert.ok(tokenCorresponde("inv-1", a, SECRETO));
  assert.ok(!tokenCorresponde("inv-2", a, SECRETO));
  assert.ok(!tokenBienFormado("abc"));
  assert.ok(!tokenBienFormado(`${a.slice(0, 42)}/`));
});

test("tokens: sin secreto suficiente, error", () => {
  const prev = process.env.EVENTOS_TOKEN_SECRET;
  process.env.EVENTOS_TOKEN_SECRET = "corto";
  assert.throws(() => tokenInvitado("x"), /EVENTOS_TOKEN_SECRET/);
  if (prev === undefined) delete process.env.EVENTOS_TOKEN_SECRET;
  else process.env.EVENTOS_TOKEN_SECRET = prev;
});

// ── Guardas ─────────────────────────────────────────────────────────────────
test("guardas: modo prueba por defecto solo deja yopmail", () => {
  assert.equal(entornoPermiteReal({}), false);
  assert.doesNotThrow(() => comprobarDestino("a@yopmail.com", false, {}));
  assert.throws(() => comprobarDestino("a@empresa.com", false, {}), /Modo prueba/);
  // Variable en 0 pero el ajuste de la base sigue en prueba → bloqueado
  assert.throws(() => comprobarDestino("a@empresa.com", true, { EVENTOS_SOLO_PRUEBA: "0" }), /Modo prueba/);
  // Ambos desactivados → permitido
  assert.doesNotThrow(() => comprobarDestino("a@empresa.com", false, { EVENTOS_SOLO_PRUEBA: "0" }));
  // Trucos que no deben colar
  assert.throws(() => comprobarDestino("a@yopmail.com.evil.com", false, {}), /Modo prueba/);
});

test("guardas: normalización y validación de emails", () => {
  assert.equal(normalizarEmail("  Ana.Pérez@Empresa.COM "), null, "no admite caracteres no ASCII en la parte local");
  assert.equal(normalizarEmail("  Ana.Perez@Empresa.COM "), "ana.perez@empresa.com");
  assert.equal(normalizarEmail("mailto:x@y.es"), "x@y.es");
  for (const malo of ["", "sin-arroba", "a@b", "a@@b.com", ".a@b.com", "a..b@c.com", "a@-b.com", "a b@c.com"]) {
    assert.equal(normalizarEmail(malo), null, malo);
  }
  assert.ok(esGenerica("info@x.com"));
  assert.ok(!esGenerica("ana@x.com"));
});

// ── ICS ─────────────────────────────────────────────────────────────────────
test("ics: hora local de Madrid en invierno y verano", () => {
  assert.equal(horaMadrid(new Date("2026-12-17T18:30:00Z")), "20261217T193000");
  assert.equal(horaMadrid(new Date("2026-07-01T10:00:00Z")), "20260701T120000");
});

test("ics: plegado a 75 octetos sin partir UTF-8", () => {
  const larga = `DESCRIPTION:${"ñ".repeat(100)}`;
  const plegada = plegar(larga);
  for (const l of plegada.split("\r\n")) assert.ok(Buffer.byteLength(l, "utf8") <= 75, l);
  assert.equal(plegada.split("\r\n").map((l, i) => (i ? l.slice(1) : l)).join(""), larga);
});

test("ics: estructura, escapado, UID estable y SEQUENCE", () => {
  const ics = generarIcs({
    metodo: "REQUEST",
    uidEvento: "evt-123",
    invitadoId: "inv-9",
    secuencia: 2,
    inicio: new Date("2026-12-17T18:30:00Z"),
    fin: new Date("2026-12-17T21:30:00Z"),
    resumen: "Cóctel de Navidad, Impar; 2026",
    lugar: "Calle Mayor 1, Madrid",
    organizador: { email: "noreply@imparcapital.com", nombre: "Impar Capital" },
    asistente: { email: "a@yopmail.com", nombre: "Ana: Pérez" },
    ahora: new Date("2026-11-16T10:00:00Z"),
  });
  assert.ok(ics.endsWith("\r\n"));
  assert.doesNotMatch(ics, /[^\r]\n/, "todas las líneas terminan en CRLF");
  assert.match(ics, /METHOD:REQUEST/);
  assert.match(ics, /UID:evt-123-inv-9@imparcapital\.com/);
  assert.match(ics, /SEQUENCE:2/);
  assert.match(ics, /DTSTART;TZID=Europe\/Madrid:20261217T193000/);
  assert.match(ics, /DTEND;TZID=Europe\/Madrid:20261217T223000/);
  assert.match(ics, /SUMMARY:Cóctel de Navidad\\, Impar\\; 2026/);
  assert.match(ics, /ATTENDEE;CN="Ana: Pérez"/);
  assert.match(ics, /DTSTAMP:20261116T100000Z/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
});

test("ics: enlace de Google en UTC", () => {
  const url = enlaceGoogle({ inicio: new Date("2026-12-17T18:30:00Z"), fin: new Date("2026-12-17T21:30:00Z"), resumen: "X" });
  assert.match(url, /dates=20261217T183000Z%2F20261217T213000Z/);
});

// ── MIME ────────────────────────────────────────────────────────────────────
test("mime: cabeceras codificadas y List-Unsubscribe", () => {
  const raw = construirMime(
    {
      de: { email: "noreply@imparcapital.com", nombre: "Impar Capital" },
      para: { email: "a@yopmail.com", nombre: "Íñigo Muñoz" },
      responderA: "eventos@imparcapital.com",
      asunto: "🎄 Invitación: Cóctel de Navidad",
      html: "<p>Hola</p>",
      texto: "Hola",
      urlBaja: "https://eventos.imparcapital.com/baja/abc",
    },
    () => "fijo",
  );
  assert.match(raw, /^From: Impar Capital <noreply@imparcapital\.com>\r\n/);
  assert.match(raw, /To: =\?UTF-8\?B\?[^?]+\?= <a@yopmail\.com>/);
  assert.match(raw, /Reply-To: <eventos@imparcapital\.com>/);
  assert.match(raw, /List-Unsubscribe: <https:\/\/eventos\.imparcapital\.com\/baja\/abc>, <mailto:noreply@imparcapital\.com\?subject=baja>/);
  assert.doesNotMatch(raw, /List-Unsubscribe-Post/, "Exchange la elimina: no se pone");
  assert.match(raw, /multipart\/alternative; boundary="alt_fijo"/);
  assert.doesNotMatch(raw, /text\/calendar/);
  // El asunto se decodifica igual
  const asunto = raw.match(/Subject: ((?:.|\r\n )+)\r\n/)![1]!;
  const decod = asunto
    .split("\r\n ")
    .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString("utf8"))
    .join("");
  assert.equal(decod, "🎄 Invitación: Cóctel de Navidad");
  for (const l of asunto.split("\r\n ")) assert.ok(l.length <= 75);
});

test("mime: con invitación de calendario usa multipart/mixed y text/calendar REQUEST", () => {
  const raw = construirMime(
    { de: { email: "n@x.com", nombre: "X" }, para: { email: "a@yopmail.com" }, asunto: "A", html: "<p>h</p>", texto: "h", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" },
    () => "f",
  );
  assert.match(raw, /multipart\/mixed; boundary="mix_f"/);
  assert.match(raw, /text\/calendar; charset=UTF-8; method=REQUEST/);
  assert.match(raw, /filename="invitacion\.ics"/);
});

test("mime: rechaza inyección de cabeceras y bajas no https", () => {
  assert.throws(() =>
    construirMime({ de: { email: "n@x.com", nombre: "X" }, para: { email: "a@y.com>\r\nBcc: z@z.com" }, asunto: "A", html: "", texto: "" }),
  );
  assert.throws(() =>
    construirMime({ de: { email: "n@x.com", nombre: "X" }, para: { email: "a@y.com" }, asunto: "A", html: "", texto: "", urlBaja: "http://x" }),
  );
  const raw = construirMime({ de: { email: "n@x.com", nombre: "X" }, para: { email: "a@y.com" }, asunto: "A\r\nBcc: z@z.com", html: "", texto: "" });
  assert.doesNotMatch(raw, /\r\nBcc:/);
});

test("mime: base64 en líneas de 76", () => {
  for (const l of base64Lineas("x".repeat(500)).split("\r\n")) assert.ok(l.length <= 76);
  assert.equal(cabecera("ascii"), "ascii");
});
