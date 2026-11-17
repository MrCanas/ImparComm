import assert from "node:assert/strict";
import { test } from "node:test";

import { generarCorreo, htmlATexto, MAX_BYTES } from "../render/render";
import type { Bloque, ContenidoPlantilla, ContextoCorreo } from "../render/tipos";
import { revisarPlantilla } from "../render/validar";
import { sustituir } from "../render/variables";

const ctx = (nombre: string | null = "Íñigo Muñoz <Peña>"): ContextoCorreo => ({
  invitado: { nombre, empresa: "Fondo & Co", cargo: null, email: "inigo@yopmail.com" },
  evento: {
    nombre: "Cóctel de Navidad",
    inicio: new Date("2026-12-17T18:30:00Z"),
    fin: new Date("2026-12-17T21:30:00Z"),
    lugar: "Casino de Madrid",
    direccion: "Alcalá 15",
    mapaUrl: "https://maps.example.com/x",
  },
  enlaces: {
    respuesta: "https://eventos.imparcapital.com/e/TOKEN",
    baja: "https://eventos.imparcapital.com/baja/TOKEN",
    calendario: "https://eventos.imparcapital.com/ics/TOKEN",
  },
});

const bloques: Bloque[] = [
  { tipo: "imagen", src: "https://eventos.imparcapital.com/img/cabecera.jpg", alt: "Navidad en Impar" },
  { tipo: "titulo", texto: "Te invitamos, {{nombre|amigo}}" },
  { tipo: "texto", texto: "Querido/a {{nombre|amigo/a}}:\nNos encantaría verte en **{{evento.nombre}}**. [Más info](https://imparcapital.com) y [malo](javascript:alert(1))" },
  { tipo: "ficha_evento" },
  { tipo: "botones_rsvp", si: "Asistiré", quizas: "Quizás", no: "No podré" },
  { tipo: "pie", texto: "Impar Capital · Madrid" },
];
const plantilla: ContenidoPlantilla = { asunto: "{{nombre|Hola}}, te invitamos", preheader: "Jueves 17", modo: "bloques", bloques };

test("render: variables, escapado y nombre de pila", () => {
  const c = generarCorreo(plantilla, ctx());
  assert.equal(c.asunto, "Íñigo, te invitamos");
  assert.match(c.html, /Querido\/a Íñigo:/);
  assert.doesNotMatch(c.html, /<Peña>/, "no inyecta HTML del nombre");
  assert.match(c.html, /<strong>Cóctel de Navidad<\/strong>/);
});

test("render: texto por defecto si falta el nombre (sin doble escapado)", () => {
  const c = generarCorreo(plantilla, ctx(null));
  assert.equal(c.asunto, "Hola, te invitamos");
  assert.match(c.html, /Querido\/a amigo\/a:/);
  assert.match(c.html, /TE INVITAMOS, AMIGO/);
});

test("render: títulos en mayúsculas con Baskerville y cuerpo en Lato, con respaldo para Outlook", () => {
  const c = generarCorreo(plantilla, ctx());
  assert.match(c.html, /TE INVITAMOS, ÍÑIGO/);
  assert.match(c.html, /class="t" style="[^"]*font-family:'Libre Baskerville', Baskerville/);
  assert.match(c.html, /class="c" style="[^"]*font-family:Lato, 'Helvetica Neue'/);
  assert.match(c.html, /<!--\[if mso\]><style>\.t\{font-family:Georgia,serif!important\}\.c\{font-family:Arial,sans-serif!important\}/);
});

test("render: tamaños de la marca y por bloque", () => {
  const c = generarCorreo(
    { ...plantilla, bloques: [{ tipo: "titulo", texto: "A", tamano: 40 }, { tipo: "texto", texto: "b" }, { tipo: "pie", texto: "" }] },
    ctx(),
    { cuerpoTamano: 17 },
  );
  assert.match(c.html, /font-size:40px/);
  assert.match(c.html, /font-size:17px;line-height/);
});

test("render: botones RSVP, ficha, enlaces seguros y baja siempre presente", () => {
  const c = generarCorreo(plantilla, ctx());
  for (const r of ["si", "quizas", "no"]) assert.ok(c.html.includes(`https://eventos.imparcapital.com/e/TOKEN?r=${r}`));
  assert.match(c.html, /href="https:\/\/eventos\.imparcapital\.com\/baja\/TOKEN"/);
  assert.match(c.html, /href="https:\/\/imparcapital\.com"/);
  assert.doesNotMatch(c.html, /javascript:/);
  assert.match(c.html, /jueves, 17 de diciembre de 2026/);
  assert.match(c.html, /19:30 – 22:30/);
  assert.match(c.html, /Alcalá 15/);
  assert.match(c.texto, /Asistiré: https:\/\/eventos\.imparcapital\.com\/e\/TOKEN\?r=si/);
  assert.match(c.texto, /darte de baja aquí: https:\/\/eventos\.imparcapital\.com\/baja\/TOKEN/);
  assert.ok(c.bytes < MAX_BYTES);
});

test("render: modo HTML propio sustituye variables escapando valores", () => {
  const c = generarCorreo(
    { asunto: "Hola", modo: "html", bloques: [], html: '<p>Hola {{nombre_completo}}</p><a href="{{enlace_baja}}">baja</a>' },
    ctx(),
  );
  assert.match(c.html, /Hola Íñigo Muñoz &lt;Peña&gt;/);
  assert.match(c.texto, /baja \(https:\/\/eventos\.imparcapital\.com\/baja\/TOKEN\)/);
});

test("variables: desconocidas se dejan visibles", () => {
  assert.equal(sustituir("{{inventada}} y {{empresa}}", ctx(), true), "{{inventada}} y Fondo &amp; Co");
});

test("validar: plantilla de bloques correcta pasa sin errores", () => {
  const r = revisarPlantilla(plantilla, "invitacion");
  assert.deepEqual(r.errores, []);
});

test("validar: detecta lo que falta o es peligroso", () => {
  const sinPie = revisarPlantilla({ ...plantilla, bloques: bloques.filter((b) => b.tipo !== "pie" && b.tipo !== "botones_rsvp") }, "invitacion");
  assert.ok(sinPie.errores.some((e) => /pie/.test(e)));
  assert.ok(sinPie.errores.some((e) => /botones de respuesta/.test(e)));

  const html = revisarPlantilla(
    { asunto: "A", modo: "html", bloques: [], html: '<img src="http://x/y.png"><script>x</script><p onclick="x">{{inventada}}</p>' },
    "invitacion",
  );
  for (const re of [/baja/, /enlace_respuesta/, /script/, /eventos/, /https/, /desconocidas/]) {
    assert.ok(html.errores.some((e) => re.test(e)), `falta error ${re}`);
  }
  assert.ok(html.avisos.some((a) => /alt/.test(a)));
  assert.ok(html.avisos.some((a) => /spam/.test(a)));

  const grande = revisarPlantilla(
    { asunto: "A", modo: "html", bloques: [], html: `{{enlace_baja}}{{enlace_respuesta}}${"x".repeat(MAX_BYTES + 10)}` },
    "invitacion",
  );
  assert.ok(grande.errores.some((e) => /Gmail/.test(e)));
});

test("htmlATexto: enlaces y entidades", () => {
  assert.equal(htmlATexto('<p>A &amp; B</p><p><a href="https://x">ir</a></p>'), "A & B\nir (https://x)");
});
