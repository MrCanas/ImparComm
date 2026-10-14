import assert from "node:assert/strict";
import { test } from "node:test";

import { logrosDe, nivelDe, rachaDe, tramoAntiguedad, xpDe } from "../gamificacion";

const CERO = { puntos: 0, contactados: 0, incluidos: 0, max_contactos_dia: 0, hitos_completados: 0, adoptados: 0, bonos: 0 };

test("nivel: límites de tramo y progreso", () => {
  assert.equal(nivelDe(0).actual.nombre, "Bronce");
  assert.equal(nivelDe(49).actual.nombre, "Bronce");
  assert.equal(nivelDe(50).actual.nombre, "Plata");
  assert.equal(nivelDe(100).progreso, 0.5);
  assert.equal(nivelDe(100).faltan, 50);
  const top = nivelDe(5000);
  assert.equal(top.actual.nombre, "Impar");
  assert.equal(top.siguiente, null);
  assert.equal(top.progreso, 1);
});

test("racha: días seguidos hasta hoy", () => {
  const r = rachaDe(["2026-10-07", "2026-10-08", "2026-10-09"], "2026-10-09");
  assert.deepEqual(r, { actual: 3, mejor: 3 });
});

test("racha: sin actividad hoy, la de ayer sigue viva", () => {
  assert.equal(rachaDe(["2026-10-07", "2026-10-08"], "2026-10-09").actual, 2);
});

test("racha: un hueco la rompe, pero se recuerda la mejor", () => {
  const r = rachaDe(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-06", "2026-10-09"], "2026-10-09");
  assert.deepEqual(r, { actual: 1, mejor: 4 });
});

test("racha: duplicados y desorden no cuentan doble", () => {
  assert.deepEqual(rachaDe(["2026-10-09", "2026-10-08", "2026-10-09T15:00:00Z"], "2026-10-09"), { actual: 2, mejor: 2 });
  assert.deepEqual(rachaDe([], "2026-10-09"), { actual: 0, mejor: 0 });
});

test("logros: conseguidos y progreso parcial", () => {
  const l = logrosDe({ ...CERO, contactados: 25, max_contactos_dia: 10 }, 3);
  const by = new Map(l.map((x) => [x.id, x]));
  assert.equal(by.get("primer-contacto")!.conseguido, true);
  assert.equal(by.get("diez-dia")!.conseguido, true);
  assert.equal(by.get("cincuenta")!.conseguido, false);
  assert.equal(by.get("cincuenta")!.progreso, 0.5);
  assert.equal(by.get("racha-7")!.conseguido, false);
});

test("xp: puntos del ritual + contactos", () => {
  assert.equal(xpDe({ puntos: 10, contactados: 4 }), 14);
});

test("antigüedad: tramos", () => {
  assert.equal(tramoAntiguedad(null, "2026-10-09"), "Sin reunión");
  assert.equal(tramoAntiguedad("2026-09-01T10:00:00Z", "2026-10-09"), "< 3 meses");
  assert.equal(tramoAntiguedad("2026-05-01", "2026-10-09"), "3-6 meses");
  assert.equal(tramoAntiguedad("2026-01-01", "2026-10-09"), "6-12 meses");
  assert.equal(tramoAntiguedad("2024-01-01", "2026-10-09"), "> 12 meses");
});
