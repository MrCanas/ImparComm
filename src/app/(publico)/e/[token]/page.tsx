import { notFound } from "next/navigation";

import { enlaceGoogle, enlaceOutlook } from "@/lib/eventos/ics";
import { buscarPorToken, registrarVisita, respuestasAbiertas } from "@/lib/eventos/publico";
import { fechaEvento, horaEvento } from "@/lib/eventos/render/variables";

import { FormRespuesta } from "./FormRespuesta";

const mayusculaInicial = (s: string) => s.charAt(0).toLocaleUpperCase("es-ES") + s.slice(1);

/**
 * Página de respuesta del invitado. Abrirla NO cambia la respuesta (los
 * antivirus de correo abren los enlaces): solo cuenta una visita. La respuesta
 * se guarda al pulsar «Confirmar respuesta».
 */
export default async function RespuestaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ r?: string }> }) {
  const [{ token }, { r }] = await Promise.all([params, searchParams]);
  const datos = await buscarPorToken(token);
  if (!datos) notFound();
  const { invitado, evento, hash } = datos;
  await registrarVisita(hash);

  const inicio = new Date(evento.inicio);
  const fin = new Date(evento.fin);
  const lugar = [evento.lugar, evento.direccion].filter(Boolean).join(", ");
  const nombre = invitado.nombre?.trim().split(/\s+/)[0];
  const titulo = "font-[family-name:var(--font-titulo)] uppercase tracking-[0.12em] text-[#1E2A56]";
  const l = evento.landing ?? {};
  const pre = r === "si" || r === "no" || r === "quizas" ? r : null;

  return (
    <article className="overflow-hidden bg-white shadow-sm">
      {l.imagen && /^https:\/\//.test(l.imagen) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={l.imagen} alt="" className="block h-auto w-full" />
      ) : (
        <div className="bg-[#1E2A56] px-6 py-5 text-center">
          <p className="font-[family-name:var(--font-titulo)] text-sm uppercase tracking-[0.3em] text-[#B89660]">Impar Capital</p>
        </div>
      )}
      <div className="space-y-6 px-6 py-8 sm:px-10">
        <header className="space-y-3 text-center">
          <h1 className={`${titulo} text-2xl leading-snug sm:text-3xl`}>{l.titulo || evento.nombre}</h1>
          {nombre ? <p className="text-[#6E6E6E]">Hola, {nombre}</p> : null}
          {l.intro ? <p className="whitespace-pre-line leading-relaxed">{l.intro}</p> : null}
        </header>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y border-[#B89660] py-4 text-sm">
          <dt className="text-xs uppercase tracking-widest text-[#B89660]">Fecha</dt>
          <dd>{mayusculaInicial(fechaEvento(inicio))}</dd>
          <dt className="text-xs uppercase tracking-widest text-[#B89660]">Hora</dt>
          <dd>{horaEvento(inicio, fin)}</dd>
          {evento.lugar ? (
            <>
              <dt className="text-xs uppercase tracking-widest text-[#B89660]">Lugar</dt>
              <dd>{evento.lugar}</dd>
            </>
          ) : null}
          {evento.direccion ? (
            <>
              <dt className="text-xs uppercase tracking-widest text-[#B89660]">Dirección</dt>
              <dd>
                {evento.direccion}
                {evento.mapa_url && /^https:\/\//.test(evento.mapa_url) ? (
                  <>
                    {" · "}
                    <a href={evento.mapa_url} target="_blank" rel="noopener noreferrer" className="text-[#1E2A56] underline">Ver mapa</a>
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>

        <FormRespuesta
          token={token}
          inicial={{
            respuesta: invitado.respuesta,
            acompanante: invitado.acompanante,
            acompanante_nombre: invitado.acompanante_nombre,
            telefono: invitado.telefono_rsvp,
            comentario: invitado.comentario,
          }}
          preseleccion={pre}
          permiteAcompanante={evento.permite_acompanante}
          abierto={respuestasAbiertas(evento)}
          gracias={{
            si: l.gracias_si || "¡Nos alegra mucho que vengas! Te esperamos.",
            quizas: l.gracias_quizas || "Gracias. Si puedes, confírmanos más adelante.",
            no: l.gracias_no || "Sentimos que no puedas acompañarnos. ¡Gracias por avisarnos!",
          }}
          calendario={{
            ics: `/ics/${token}`,
            google: enlaceGoogle({ inicio, fin, resumen: evento.nombre, lugar }),
            outlook: enlaceOutlook({ inicio, fin, resumen: evento.nombre, lugar }),
          }}
        />
      </div>
    </article>
  );
}
