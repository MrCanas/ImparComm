/**
 * Segmentos de un envío. Función pura sobre la lista de invitados: la misma
 * lógica decide la vista previa («a quién va») y la lista que se fija en la base.
 */

export type EstadoRespuesta = "sin_respuesta" | "si" | "no" | "quizas";

export interface Filtro {
  respuestas?: EstadoRespuesta[];
  conAcompanante?: boolean;
  etiquetas?: string[];
  /** Todas las etiquetas (true) o cualquiera (false, por defecto). */
  todasEtiquetas?: boolean;
  origenes?: string[];
  empresas?: string[];
  dominios?: string[];
  responsables?: string[];
  /** Texto libre: nombre, email o empresa. */
  buscar?: string;
  /** Excluir a quien ya recibió alguna plantilla de este tipo (enviado). */
  noRecibidoTipo?: string;
  /** Selección manual: solo estos ids (si se indica). */
  ids?: string[];
  /** Excluir estos ids. */
  excluirIds?: string[];
  /** Máximo de destinatarios (los primeros según `orden`). */
  limite?: number;
  orden?: "alta" | "nombre" | "empresa" | "aleatorio";
  semilla?: number;
}

export interface InvitadoFiltrable {
  id: string;
  email: string;
  nombre: string | null;
  empresa: string | null;
  etiquetas: string[];
  origen: string | null;
  responsable_id: string | null;
  respuesta: "si" | "no" | "quizas" | null;
  acompanante: boolean;
  excluido: boolean;
  rebotado: boolean;
  de_baja: boolean;
  /** Tipos de plantilla ya enviados a este invitado */
  tipos_recibidos: string[];
  created_at: string;
}

export interface ResultadoSegmento {
  seleccionados: InvitadoFiltrable[];
  /** Coinciden con el filtro pero no pueden recibir correo (baja, rebote, excluido). */
  bloqueados: { invitado: InvitadoFiltrable; motivo: string }[];
  totalCoinciden: number;
}

function motivoBloqueo(i: InvitadoFiltrable): string | null {
  if (i.de_baja) return "Baja";
  if (i.rebotado) return "Rebotado";
  if (i.excluido) return "Excluido";
  return null;
}

/** Barajado determinista (mulberry32) para que la vista previa y el envío coincidan. */
function barajar<T>(arr: T[], semilla: number): T[] {
  let a = semilla >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function coincide(i: InvitadoFiltrable, f: Filtro): boolean {
  if (f.ids?.length && !f.ids.includes(i.id)) return false;
  if (f.excluirIds?.includes(i.id)) return false;
  if (f.respuestas?.length) {
    const estado: EstadoRespuesta = i.respuesta ?? "sin_respuesta";
    if (!f.respuestas.includes(estado)) return false;
  }
  if (f.conAcompanante !== undefined && i.acompanante !== f.conAcompanante) return false;
  if (f.etiquetas?.length) {
    const tiene = (e: string) => i.etiquetas.map(norm).includes(norm(e));
    if (f.todasEtiquetas ? !f.etiquetas.every(tiene) : !f.etiquetas.some(tiene)) return false;
  }
  if (f.origenes?.length && !f.origenes.map(norm).includes(norm(i.origen))) return false;
  if (f.empresas?.length && !f.empresas.map(norm).includes(norm(i.empresa))) return false;
  if (f.dominios?.length && !f.dominios.map(norm).includes(i.email.split("@")[1] ?? "")) return false;
  if (f.responsables?.length && !f.responsables.includes(i.responsable_id ?? "")) return false;
  if (f.noRecibidoTipo && i.tipos_recibidos.includes(f.noRecibidoTipo)) return false;
  if (f.buscar?.trim()) {
    const q = norm(f.buscar);
    if (![i.email, i.nombre, i.empresa].some((v) => norm(v).includes(q))) return false;
  }
  return true;
}

export function aplicarFiltro(invitados: InvitadoFiltrable[], f: Filtro): ResultadoSegmento {
  const coinciden = invitados.filter((i) => coincide(i, f));
  const bloqueados: ResultadoSegmento["bloqueados"] = [];
  let validos: InvitadoFiltrable[] = [];
  for (const i of coinciden) {
    const motivo = motivoBloqueo(i);
    if (motivo) bloqueados.push({ invitado: i, motivo });
    else validos.push(i);
  }
  switch (f.orden ?? "alta") {
    case "nombre":
      validos.sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre), "es"));
      break;
    case "empresa":
      validos.sort((a, b) => norm(a.empresa).localeCompare(norm(b.empresa), "es") || a.email.localeCompare(b.email));
      break;
    case "aleatorio":
      validos = barajar(
        validos.sort((a, b) => a.id.localeCompare(b.id)),
        f.semilla ?? 1,
      );
      break;
    default:
      validos.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.email.localeCompare(b.email));
  }
  const limite = f.limite && f.limite > 0 ? f.limite : undefined;
  return { seleccionados: limite ? validos.slice(0, limite) : validos, bloqueados, totalCoinciden: coinciden.length };
}
