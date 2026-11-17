import type { Filtro } from "@/lib/eventos/filtros";
import type { Bloque, Marca, TipoPlantilla } from "@/lib/eventos/render/tipos";

export interface Evento {
  id: string;
  nombre: string;
  slug: string;
  inicio: string;
  fin: string;
  lugar: string | null;
  direccion: string | null;
  mapa_url: string | null;
  fecha_limite: string | null;
  aforo: number | null;
  permite_acompanante: boolean;
  landing: LandingTextos;
  remitente: string | null;
  remitente_nombre: string;
  reply_to: string | null;
  ics_uid: string;
  ics_sequence: number;
  estado: "borrador" | "activo" | "cerrado";
  created_at: string;
}

export interface LandingTextos {
  titulo?: string;
  intro?: string;
  gracias_si?: string;
  gracias_no?: string;
  gracias_quizas?: string;
  imagen?: string;
}

export interface Invitado {
  id: string;
  evento_id: string;
  persona_id: string | null;
  email: string;
  nombre: string | null;
  empresa: string | null;
  cargo: string | null;
  telefono: string | null;
  responsable_id: string | null;
  etiquetas: string[];
  origen: string | null;
  respuesta: "si" | "no" | "quizas" | null;
  acompanante: boolean;
  acompanante_nombre: string | null;
  telefono_rsvp: string | null;
  comentario: string | null;
  respondido_en: string | null;
  primera_visita: string | null;
  ultima_visita: string | null;
  n_visitas: number;
  rebotado_en: string | null;
  rebote_motivo: string | null;
  excluido: boolean;
  excluido_motivo: string | null;
  created_at: string;
}

export interface Plantilla {
  id: string;
  evento_id: string | null;
  tipo: TipoPlantilla;
  nombre: string;
  asunto: string;
  preheader: string | null;
  modo: "bloques" | "html";
  bloques: Bloque[];
  html: string | null;
  adjuntar_ics: boolean;
  version: number;
  updated_at: string;
}

export type EstadoEnvio = "borrador" | "en_curso" | "pausado" | "completado" | "cancelado";
export type EstadoDestinatario = "pendiente" | "enviando" | "enviado" | "error" | "incierto" | "omitido";

export interface Envio {
  id: string;
  evento_id: string;
  nombre: string;
  plantilla_id: string;
  filtro: Filtro;
  estado: EstadoEnvio;
  delay_ms: number;
  motivo_pausa: string | null;
  ultimo_envio_en: string | null;
  iniciado_en: string | null;
  completado_en: string | null;
  created_at: string;
}

export interface Destinatario {
  invitado_id: string;
  orden: number;
  estado: EstadoDestinatario;
  intentos: number;
  plantilla_version: number | null;
  reservado_en: string | null;
  enviado_en: string | null;
  error: string | null;
  email?: string;
  nombre?: string | null;
}

export interface Ajustes {
  marca: Partial<Marca>;
  modo_prueba: boolean;
  delay_min_ms: number;
  tope_diario: number;
}

export const TIPOS_PLANTILLA: { tipo: TipoPlantilla; etiqueta: string }[] = [
  { tipo: "invitacion", etiqueta: "Invitación" },
  { tipo: "recordatorio", etiqueta: "Recordatorio" },
  { tipo: "confirmacion", etiqueta: "Confirmación (con calendario)" },
  { tipo: "info_final", etiqueta: "Información final" },
  { tipo: "libre", etiqueta: "Libre" },
];

export const ETIQUETA_RESPUESTA: Record<string, string> = {
  si: "Sí",
  no: "No",
  quizas: "Quizás",
  sin_respuesta: "Sin respuesta",
};
