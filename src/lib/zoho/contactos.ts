/**
 * Integración con Zoho CRM (fase 4, pendiente).
 *
 * Al marcar Contactado en un hito: alta o actualización del contacto por email
 * en Zoho CRM v8 (zohoapis.eu), propietario = el empleado que contacta, y alta
 * como miembro de la Campaign del hito con estado «Contactado». Se guardará
 * personas.zoho_id y hitos.zoho_campaign_id.
 *
 * De momento no hace nada: la app funciona igual y la sincronización se
 * enganchará aquí sin tocar las pantallas.
 */
export async function registrarContactoEnZoho(_input: {
  hitoId: string;
  personaId: string;
  empleadoId: string;
}): Promise<{ sincronizado: boolean }> {
  return { sincronizado: false };
}
