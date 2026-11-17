import assert from "node:assert/strict";
import { test } from "node:test";

import { decidir, MAX_ERRORES_SEGUIDOS } from "../decision";

const fallo = (status: number, extra: Partial<{ reintentarTrasS: number | null; incierto: boolean }> = {}) => ({
  ok: false as const,
  status,
  ms: 10,
  reintentarTrasS: null,
  detalle: "x",
  incierto: false,
  ...extra,
});

test("decisión: 202 → enviado sin pausa", () => {
  assert.deepEqual(decidir({ ok: true, status: 202, ms: 5 }), { resultado: "enviado", pausar: null, error: null });
});

test("decisión: corte de red → incierto y pausa (nunca reenvía solo)", () => {
  const d = decidir(fallo(0, { incierto: true }));
  assert.equal(d.resultado, "incierto");
  assert.ok(d.pausar);
});

test("decisión: 429 y 5xx → error y pausa con la espera que pide Microsoft", () => {
  const d = decidir(fallo(429, { reintentarTrasS: 60 }));
  assert.equal(d.resultado, "error");
  assert.match(d.pausar!, /60 s/);
  assert.ok(decidir(fallo(503)).pausar);
});

test("decisión: 401/403 → pausa por configuración", () => {
  assert.match(decidir(fallo(403)).pausar!, /permisos/);
});

test("decisión: 400 aislado sigue; varios seguidos pausan", () => {
  assert.equal(decidir(fallo(400), 0).pausar, null);
  assert.ok(decidir(fallo(400), MAX_ERRORES_SEGUIDOS - 1).pausar);
});
