import assert from "node:assert/strict";
import { test } from "node:test";

import { plantillaResumen } from "../resumen";

test("resumen: asunto con pendientes y vencidos", () => {
  const { subject, html } = plantillaResumen({
    nombre: "Ana",
    pendientes: 12,
    vencidos: [{ nombre: "Luis <Pérez>", empresa: "Fondo", dias: 4 }],
    url: "https://impar-comm.vercel.app/ritual",
  });
  assert.equal(subject, "ImparComm · 12 contactos nuevos y 1 recordatorio vencido");
  assert.match(html, /unos 3 minutos/);
  assert.match(html, /Luis &lt;Pérez&gt;/, "escapa el HTML de los nombres");
  assert.match(html, /Empezar el ritual/);
});

test("resumen: solo vencidos", () => {
  const { subject, html } = plantillaResumen({
    nombre: "Ana",
    pendientes: 0,
    vencidos: [{ nombre: "Luis", empresa: null, dias: 1 }],
    url: "https://x/ritual",
  });
  assert.equal(subject, "ImparComm · 1 recordatorio vencido");
  assert.doesNotMatch(html, /por clasificar/);
  assert.match(html, /Abrir ImparComm/);
});
