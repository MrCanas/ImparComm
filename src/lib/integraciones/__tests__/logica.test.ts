import assert from "node:assert/strict";
import { test } from "node:test";

import {
  esMomentoDelResumen,
  externosDeEvento,
  fechaMadrid,
  horaMadrid,
  htmlATexto,
  parsearFirma,
} from "../logica";

test("resumen: viernes 9:00 Madrid en horario de verano (7:00 UTC)", () => {
  assert.equal(esMomentoDelResumen(new Date("2026-10-09T07:00:00Z")), true);
  assert.equal(esMomentoDelResumen(new Date("2026-10-09T08:00:00Z")), false);
});

test("resumen: viernes 9:00 Madrid en horario de invierno (8:00 UTC)", () => {
  assert.equal(esMomentoDelResumen(new Date("2026-11-06T08:00:00Z")), true);
  assert.equal(esMomentoDelResumen(new Date("2026-11-06T07:00:00Z")), false);
});

test("resumen: nunca otro día", () => {
  assert.equal(esMomentoDelResumen(new Date("2026-10-08T07:00:00Z")), false);
});

test("hora y fecha en Madrid", () => {
  assert.equal(horaMadrid(new Date("2026-01-15T23:30:00Z")), 0);
  assert.equal(fechaMadrid(new Date("2026-01-15T23:30:00Z")), "2026-01-16");
});

test("externos: filtra internos, incluye organizador y deduplica", () => {
  const ext = externosDeEvento(
    {
      attendees: [
        { emailAddress: { address: "Ana@ImparCapital.com", name: "Ana" } },
        { emailAddress: { address: "luis@fondo.es", name: "Luis Pérez" } },
        { emailAddress: { address: "LUIS@fondo.es", name: "Luis" } },
        { emailAddress: { address: "sala-reuniones" } },
      ],
      organizer: { emailAddress: { address: "maria@banco.com", name: "María" } },
    },
    ["imparcapital.com"],
  );
  assert.deepEqual(
    ext.map((e) => e.email),
    ["luis@fondo.es", "maria@banco.com"],
  );
  assert.equal(ext[0]!.nombre, "Luis Pérez");
});

test("firma: cargo y teléfono tras el nombre", () => {
  const html = `<p>Gracias, hablamos el lunes.</p><p>Un saludo,<br>Luis Pérez<br>Director de Inversiones | Fondo Meseta<br>T. +34 912 345 678<br>www.fondomeseta.es</p>`;
  const r = parsearFirma(htmlATexto(html), "Luis Pérez");
  assert.equal(r.cargo, "Director de Inversiones | Fondo Meseta");
  assert.equal(r.telefono, "+34 912 345 678");
});

test("firma: sin datos reconocibles no inventa nada", () => {
  assert.deepEqual(parsearFirma("Hola\nNos vemos\nSaludos", "Luis Pérez"), {});
});

test("firma: no confunde fechas o importes cortos con teléfonos", () => {
  const r = parsearFirma("Luis Pérez\nReunión el 12-10-2026\nImporte 1.000", "Luis Pérez");
  assert.equal(r.telefono, undefined);
});
