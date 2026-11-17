/** Tipos de plantillas de eventos (compartidos entre servidor y editor). */

export interface Marca {
  /** Tamaños en px */
  tituloTamano: number;
  subtituloTamano: number;
  cuerpoTamano: number;
  pieTamano: number;
  interlineado: number;
  anchoMax: number;
  colorPrincipal: string;
  colorAcento: string;
  colorTexto: string;
  colorFondo: string;
  colorTarjeta: string;
  /** Espaciado entre letras de los títulos en mayúsculas (px) */
  tituloEspaciado: number;
}

export const MARCA_POR_DEFECTO: Marca = {
  tituloTamano: 26,
  subtituloTamano: 18,
  cuerpoTamano: 15,
  pieTamano: 11,
  interlineado: 1.6,
  anchoMax: 600,
  colorPrincipal: "#1E2A56",
  colorAcento: "#B89660",
  colorTexto: "#2C2C2C",
  colorFondo: "#F5F5F5",
  colorTarjeta: "#FFFFFF",
  tituloEspaciado: 2,
};

/** Baskerville siempre en mayúsculas; Lato para el cuerpo. Con respaldo para Gmail/Outlook. */
export const FUENTE_TITULO = "'Libre Baskerville', Baskerville, 'Baskerville Old Face', Georgia, 'Times New Roman', serif";
export const FUENTE_CUERPO = "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export type Alineacion = "left" | "center" | "right";

export type Bloque =
  | { tipo: "imagen"; src: string; alt: string; ancho?: number; enlace?: "respuesta" | "ninguno" }
  | { tipo: "titulo"; texto: string; nivel?: 1 | 2; tamano?: number; alineacion?: Alineacion; color?: "principal" | "acento" }
  | { tipo: "texto"; texto: string; tamano?: number; alineacion?: Alineacion }
  | { tipo: "botones_rsvp"; si: string; quizas: string; no: string }
  | { tipo: "boton"; texto: string; destino: "respuesta" | "calendario" | "url"; url?: string }
  | { tipo: "ficha_evento"; mostrarMapa?: boolean }
  | { tipo: "separador" }
  | { tipo: "espacio"; alto: number }
  | { tipo: "pie"; texto: string };

export type TipoPlantilla = "invitacion" | "recordatorio" | "confirmacion" | "info_final" | "libre";

export interface ContenidoPlantilla {
  asunto: string;
  preheader?: string | null;
  modo: "bloques" | "html";
  bloques: Bloque[];
  html?: string | null;
}

/** Datos con los que se rellena un correo concreto. */
export interface ContextoCorreo {
  invitado: { nombre?: string | null; empresa?: string | null; cargo?: string | null; email: string };
  evento: {
    nombre: string;
    inicio: Date;
    fin: Date;
    lugar?: string | null;
    direccion?: string | null;
    mapaUrl?: string | null;
  };
  enlaces: { respuesta: string; baja: string; calendario: string };
}

export interface CorreoGenerado {
  asunto: string;
  html: string;
  texto: string;
  bytes: number;
}
