import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarFiltro, type InvitadoFiltrable } from "../filtros";
import { parsearCsv, procesarFilas, proponerMapeo } from "../importar";

test("csv: comas, punto y coma, tabuladores, comillas y BOM", () => {
  assert.deepEqual(parsearCsv('﻿email,nombre\r\na@x.com,"Pérez, Ana"\r\n'), [["email", "nombre"], ["a@x.com", "Pérez, Ana"]]);
  assert.deepEqual(parsearCsv("email;nombre\na@x.com;Ana\n"), [["email", "nombre"], ["a@x.com", "Ana"]]);
  assert.deepEqual(parsearCsv("email\tnombre\na@x.com\tAna"), [["email", "nombre"], ["a@x.com", "Ana"]]);
  assert.deepEqual(parsearCsv('a,"dice ""hola""\nadiós"\n\n'), [["a", 'dice "hola"\nadiós']]);
});

test("importar: mapeo propuesto por cabecera", () => {
  assert.deepEqual(proponerMapeo(["Correo electrónico", "First Name", "Last Name", "Account Name", "Tags"]), {
    email: 0,
    nombre: 1,
    apellidos: 2,
    empresa: 3,
    etiquetas: 4,
  });
});

test("importar: valida, normaliza, deduplica e informa", () => {
  const filas = parsearCsv(
    [
      "email,nombre,apellidos,empresa,etiquetas",
      "Ana@Fondo.com,Ana,García,Fondo,VIP; Banca",
      "ana@fondo.com ,Ana,García,Fondo,",
      "malo-sin-arroba,Luis,,X,",
      ",Sin,Email,,",
      "info@empresa.es,,,Empresa,",
    ].join("\n"),
  );
  const inf = procesarFilas(filas, proponerMapeo(filas[0]!), { tieneCabecera: true, origenPorDefecto: "Zoho", etiquetasExtra: ["Navidad"] });
  assert.equal(inf.totalFilas, 5);
  assert.equal(inf.validas.length, 2);
  assert.deepEqual(inf.validas[0], {
    linea: 2,
    email: "ana@fondo.com",
    nombre: "Ana García",
    empresa: "Fondo",
    cargo: null,
    telefono: null,
    responsableEmail: null,
    etiquetas: ["VIP", "Banca", "Navidad"],
    origen: "Zoho",
  });
  assert.deepEqual(inf.duplicadas, [{ linea: 3, email: "ana@fondo.com", primeraLinea: 2 }]);
  assert.equal(inf.invalidas.length, 2);
  assert.deepEqual(inf.genericas, ["info@empresa.es"]);
  assert.throws(() => procesarFilas(filas, {}, { tieneCabecera: true }), /email/);
});

const inv = (o: Partial<InvitadoFiltrable> & { id: string }): InvitadoFiltrable => ({
  email: `${o.id}@x.com`,
  nombre: o.id,
  empresa: null,
  etiquetas: [],
  origen: null,
  responsable_id: null,
  respuesta: null,
  acompanante: false,
  excluido: false,
  rebotado: false,
  de_baja: false,
  tipos_recibidos: [],
  created_at: "2026-11-16T00:00:00Z",
  ...o,
});

const lista = [
  inv({ id: "a", etiquetas: ["VIP"], empresa: "Fondo", created_at: "2026-11-16T00:00:01Z" }),
  inv({ id: "b", etiquetas: ["vip", "Banca"], respuesta: "si", acompanante: true, created_at: "2026-11-16T00:00:02Z" }),
  inv({ id: "c", respuesta: "quizas", tipos_recibidos: ["invitacion"], created_at: "2026-11-16T00:00:03Z" }),
  inv({ id: "d", de_baja: true, etiquetas: ["VIP"], created_at: "2026-11-16T00:00:04Z" }),
  inv({ id: "e", rebotado: true, created_at: "2026-11-16T00:00:05Z" }),
  inv({ id: "f", email: "f@otro.es", responsable_id: "u1", created_at: "2026-11-16T00:00:06Z" }),
];
const ids = (r: ReturnType<typeof aplicarFiltro>) => r.seleccionados.map((i) => i.id);

test("filtros: etiquetas (sin distinguir mayúsculas), bloqueados aparte", () => {
  const r = aplicarFiltro(lista, { etiquetas: ["VIP"] });
  assert.deepEqual(ids(r), ["a", "b"]);
  assert.deepEqual(r.bloqueados.map((b) => [b.invitado.id, b.motivo]), [["d", "Baja"]]);
  assert.deepEqual(ids(aplicarFiltro(lista, { etiquetas: ["vip", "banca"], todasEtiquetas: true })), ["b"]);
});

test("filtros: respuestas, acompañante, tipo no recibido, dominio, responsable", () => {
  assert.deepEqual(ids(aplicarFiltro(lista, { respuestas: ["sin_respuesta"] })), ["a", "f"]);
  assert.deepEqual(ids(aplicarFiltro(lista, { respuestas: ["si", "quizas"], conAcompanante: true })), ["b"]);
  assert.deepEqual(ids(aplicarFiltro(lista, { noRecibidoTipo: "invitacion" })), ["a", "b", "f"]);
  assert.deepEqual(ids(aplicarFiltro(lista, { dominios: ["otro.es"] })), ["f"]);
  assert.deepEqual(ids(aplicarFiltro(lista, { responsables: ["u1"] })), ["f"]);
});

test("filtros: selección manual, límite y orden aleatorio determinista", () => {
  assert.deepEqual(ids(aplicarFiltro(lista, { ids: ["c", "a", "d"] })), ["a", "c"]);
  assert.deepEqual(ids(aplicarFiltro(lista, { limite: 2 })), ["a", "b"]);
  const r1 = ids(aplicarFiltro(lista, { orden: "aleatorio", semilla: 7 }));
  const r2 = ids(aplicarFiltro([...lista].reverse(), { orden: "aleatorio", semilla: 7 }));
  assert.deepEqual(r1, r2, "misma semilla → mismo orden aunque cambie el orden de entrada");
  assert.equal(r1.length, 4);
});
