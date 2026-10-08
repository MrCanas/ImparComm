export type EstadoRelacion = "nueva" | "clasificada" | "archivada";
export type TipoEtiqueta = "general" | "personal";
export type Ambito = "general" | "personal";
export type EstadoHito = "pte" | "contactado";

export interface Etiqueta {
  id: string;
  nombre: string;
  tipo: TipoEtiqueta;
  plazo_dias: number;
}

export interface Persona {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  cargo: string | null;
  zoho_id: string | null;
  empresa: { id: string; nombre: string } | null;
  etiquetas: Etiqueta[];
}

export interface Relacion {
  id: string;
  estado: EstadoRelacion;
  notas: string | null;
  ultima_reunion: string | null;
  proximo_recordatorio: string | null;
  origen: "calendario" | "manual" | "bolsa";
  created_at: string;
  persona: Persona;
}

export interface Hito {
  id: string;
  nombre: string;
  tipo: string | null;
  ambito: Ambito;
  abierto_por: string;
  etiquetas_filtro: string[];
  fecha: string | null;
  zoho_campaign_id: string | null;
  created_at: string;
}

export interface HitoPersona {
  hito_id: string;
  persona_id: string;
  estado: EstadoHito;
  canal: string | null;
  incluida_por: string | null;
  contactado_por: string | null;
  fecha_contacto: string | null;
  persona: Persona;
}

export const CANALES = ["Email", "Teléfono", "WhatsApp", "En persona", "LinkedIn", "Otro"] as const;

export const TIPOS_HITO = [
  "Levantamiento de capital",
  "Evento",
  "Comercialización",
  "Newsletter / informe",
  "Otro",
] as const;
