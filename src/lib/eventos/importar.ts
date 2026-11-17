/**
 * Importación de la lista de invitados: CSV (o lo pegado desde Excel, que llega
 * separado por tabuladores) → filas normalizadas + informe. Función pura: no
 * guarda nada; la comprobación de MX y de bajas se hace después en el servidor.
 */
import { esGenerica, normalizarEmail } from "./guardas";

export type Campo = "email" | "nombre" | "apellidos" | "empresa" | "cargo" | "telefono" | "responsable" | "etiquetas" | "origen";

export const CAMPOS: { campo: Campo; etiqueta: string; alias: string[] }[] = [
  { campo: "email", etiqueta: "Email", alias: ["email", "e-mail", "correo", "correo electrónico", "correo electronico", "mail", "email address"] },
  { campo: "nombre", etiqueta: "Nombre", alias: ["nombre", "name", "first name", "first_name", "nombre completo", "full name"] },
  { campo: "apellidos", etiqueta: "Apellidos", alias: ["apellidos", "apellido", "last name", "last_name", "surname"] },
  { campo: "empresa", etiqueta: "Empresa", alias: ["empresa", "company", "compañía", "compania", "organización", "organizacion", "account name", "account"] },
  { campo: "cargo", etiqueta: "Cargo", alias: ["cargo", "title", "puesto", "job title", "position"] },
  { campo: "telefono", etiqueta: "Teléfono", alias: ["teléfono", "telefono", "phone", "móvil", "movil", "mobile"] },
  { campo: "responsable", etiqueta: "Responsable en Impar (email)", alias: ["responsable", "responsable_impar", "owner", "propietario", "contact owner"] },
  { campo: "etiquetas", etiqueta: "Etiquetas", alias: ["etiquetas", "etiqueta", "tags", "tag", "segmento"] },
  { campo: "origen", etiqueta: "Origen", alias: ["origen", "fuente", "source", "lead source"] },
];

/** Parser CSV (RFC 4180): comillas, comillas dobles escapadas y saltos dentro de campos. */
export function parsearCsv(entrada: string): string[][] {
  const texto = entrada.replace(/^﻿/, "");
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = cuenta("\t") > 0 ? "\t" : cuenta(";") > cuenta(",") ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"' && campo === "") {
      comillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

/** Propone qué columna es cada campo a partir de la cabecera. */
export function proponerMapeo(cabecera: string[]): Partial<Record<Campo, number>> {
  const mapeo: Partial<Record<Campo, number>> = {};
  cabecera.forEach((h, idx) => {
    const n = h.trim().toLowerCase();
    const def = CAMPOS.find((c) => c.alias.includes(n));
    if (def && mapeo[def.campo] === undefined) mapeo[def.campo] = idx;
  });
  return mapeo;
}

export interface FilaImportada {
  linea: number;
  email: string;
  nombre: string | null;
  empresa: string | null;
  cargo: string | null;
  telefono: string | null;
  responsableEmail: string | null;
  etiquetas: string[];
  origen: string | null;
}

export interface InformeImportacion {
  validas: FilaImportada[];
  invalidas: { linea: number; valor: string; motivo: string }[];
  duplicadas: { linea: number; email: string; primeraLinea: number }[];
  genericas: string[];
  totalFilas: number;
}

const limpiar = (s: string | undefined) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
};

export function procesarFilas(
  filas: string[][],
  mapeo: Partial<Record<Campo, number>>,
  opciones: { tieneCabecera: boolean; origenPorDefecto?: string | null; etiquetasExtra?: string[] },
): InformeImportacion {
  if (mapeo.email === undefined) throw new Error("Indica qué columna contiene el email.");
  const datos = opciones.tieneCabecera ? filas.slice(1) : filas;
  const primeraLinea = opciones.tieneCabecera ? 2 : 1;
  const col = (f: string[], c: Campo) => (mapeo[c] === undefined ? undefined : f[mapeo[c]!]);

  const vistos = new Map<string, number>();
  const informe: InformeImportacion = { validas: [], invalidas: [], duplicadas: [], genericas: [], totalFilas: datos.length };

  datos.forEach((f, idx) => {
    const linea = idx + primeraLinea;
    const bruto = col(f, "email") ?? "";
    const email = normalizarEmail(bruto);
    if (!email) {
      informe.invalidas.push({ linea, valor: bruto.trim(), motivo: bruto.trim() ? "Formato de email no válido" : "Sin email" });
      return;
    }
    const previa = vistos.get(email);
    if (previa !== undefined) {
      informe.duplicadas.push({ linea, email, primeraLinea: previa });
      return;
    }
    vistos.set(email, linea);
    if (esGenerica(email)) informe.genericas.push(email);

    const nombre = [limpiar(col(f, "nombre")), limpiar(col(f, "apellidos"))].filter(Boolean).join(" ") || null;
    const etiquetas = [
      ...(limpiar(col(f, "etiquetas"))?.split(/[,;|]/).map((e) => e.trim()).filter(Boolean) ?? []),
      ...(opciones.etiquetasExtra ?? []),
    ];
    informe.validas.push({
      linea,
      email,
      nombre,
      empresa: limpiar(col(f, "empresa")),
      cargo: limpiar(col(f, "cargo")),
      telefono: limpiar(col(f, "telefono")),
      responsableEmail: normalizarEmail(col(f, "responsable")),
      etiquetas: [...new Set(etiquetas)],
      origen: limpiar(col(f, "origen")) ?? opciones.origenPorDefecto ?? null,
    });
  });
  return informe;
}
