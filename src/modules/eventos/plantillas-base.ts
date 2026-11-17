/** Contenido inicial de cada tipo de plantilla (se edita después en el editor). */
import type { Bloque, TipoPlantilla } from "@/lib/eventos/render/tipos";

const PIE =
  "Impar Capital · Madrid. Recibes este correo por tu relación profesional con Impar Capital. Tus datos se tratan conforme a nuestra política de privacidad.";

export function plantillaBase(tipo: TipoPlantilla): { asunto: string; preheader: string; bloques: Bloque[]; adjuntar_ics: boolean } {
  switch (tipo) {
    case "invitacion":
      return {
        asunto: "{{nombre|Te invitamos}}, te invitamos a {{evento.nombre}}",
        preheader: "{{evento.fecha}} · Confírmanos tu asistencia",
        adjuntar_ics: false,
        bloques: [
          { tipo: "titulo", texto: "{{evento.nombre}}" },
          { tipo: "texto", texto: "Querido/a {{nombre|amigo/a}}:\n\nNos encantaría contar contigo en {{evento.nombre}}. ¿Nos confirmas tu asistencia?" },
          { tipo: "ficha_evento" },
          { tipo: "botones_rsvp", si: "Asistiré", quizas: "Quizás", no: "No podré" },
          { tipo: "pie", texto: PIE },
        ],
      };
    case "recordatorio":
      return {
        asunto: "Recordatorio: {{evento.nombre}}",
        preheader: "Aún no nos has confirmado tu asistencia",
        adjuntar_ics: false,
        bloques: [
          { tipo: "titulo", texto: "{{evento.nombre}}" },
          { tipo: "texto", texto: "Querido/a {{nombre|amigo/a}}:\n\nTodavía no hemos recibido tu respuesta. Nos encantaría saber si podrás acompañarnos." },
          { tipo: "ficha_evento" },
          { tipo: "botones_rsvp", si: "Asistiré", quizas: "Quizás", no: "No podré" },
          { tipo: "pie", texto: PIE },
        ],
      };
    case "confirmacion":
      return {
        asunto: "Confirmado: {{evento.nombre}}",
        preheader: "Te esperamos el {{evento.fecha}}",
        adjuntar_ics: true,
        bloques: [
          { tipo: "titulo", texto: "Gracias por confirmar" },
          { tipo: "texto", texto: "Querido/a {{nombre|amigo/a}}:\n\nTe esperamos en {{evento.nombre}}. Te adjuntamos la invitación para tu calendario." },
          { tipo: "ficha_evento" },
          { tipo: "boton", texto: "Añadir al calendario", destino: "calendario" },
          { tipo: "texto", texto: "Si tus planes cambian, puedes modificar tu respuesta [aquí]({{enlace_respuesta}})." },
          { tipo: "pie", texto: PIE },
        ],
      };
    case "info_final":
      return {
        asunto: "Todo listo para {{evento.nombre}}",
        preheader: "Información práctica para el {{evento.fecha}}",
        adjuntar_ics: false,
        bloques: [
          { tipo: "titulo", texto: "Nos vemos pronto" },
          { tipo: "texto", texto: "Querido/a {{nombre|amigo/a}}:\n\nTe compartimos los detalles prácticos del evento." },
          { tipo: "ficha_evento" },
          { tipo: "pie", texto: PIE },
        ],
      };
    default:
      return { asunto: "{{evento.nombre}}", preheader: "", adjuntar_ics: false, bloques: [{ tipo: "texto", texto: "" }, { tipo: "pie", texto: PIE }] };
  }
}
