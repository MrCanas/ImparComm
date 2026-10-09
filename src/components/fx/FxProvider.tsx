"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { celebrar, centroDe, type Celebracion } from "@/components/fx/confetti";

interface Flotante {
  id: number;
  x: number;
  y: number;
  texto: string;
}

interface Aviso {
  id: number;
  emoji: string;
  titulo: string;
  detalle?: string;
}

interface FxApi {
  /** «+1 ⭐» que sube y se desvanece desde el elemento (o el centro). */
  flotar: (texto: string, desde?: Element | null) => void;
  /** Confeti; con `desde`, sale del elemento. */
  celebrar: (tipo: Celebracion, desde?: Element | null) => void;
  /** Toast de logro / nivel en la parte superior. */
  avisar: (aviso: Omit<Aviso, "id">) => void;
}

const FxContext = createContext<FxApi | null>(null);

/** Sin provider (tests, páginas sueltas) las llamadas no hacen nada. */
const NOOP: FxApi = { flotar: () => {}, celebrar: () => {}, avisar: () => {} };

export function useFx(): FxApi {
  return useContext(FxContext) ?? NOOP;
}

export function FxProvider({ children }: { children: ReactNode }) {
  const [flotantes, setFlotantes] = useState<Flotante[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const seq = useRef(0);

  const flotar = useCallback((texto: string, desde?: Element | null) => {
    const c = centroDe(desde) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const id = ++seq.current;
    setFlotantes((f) => [...f, { id, texto, ...c }]);
    window.setTimeout(() => setFlotantes((f) => f.filter((x) => x.id !== id)), 1200);
  }, []);

  const avisar = useCallback((a: Omit<Aviso, "id">) => {
    const id = ++seq.current;
    setAvisos((l) => [...l.slice(-2), { ...a, id }]);
    window.setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== id)), 3800);
  }, []);

  const api = useMemo<FxApi>(
    () => ({ flotar, avisar, celebrar: (tipo, desde) => celebrar(tipo, centroDe(desde)) }),
    [flotar, avisar],
  );

  return (
    <FxContext.Provider value={api}>
      {children}
      {flotantes.map((f) => (
        <span
          key={f.id}
          className="fx-float-up rounded-full bg-icam-gold px-2.5 py-1 text-sm font-bold text-white shadow-lg"
          style={{ left: f.x, top: f.y - 10 }}
          aria-hidden="true"
        >
          {f.texto}
        </span>
      ))}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[75] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {avisos.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
              className="flex max-w-sm items-center gap-3 rounded-xl border border-icam-gold/40 bg-icam-900 px-4 py-3 text-white shadow-2xl"
            >
              <span className="text-2xl animate-wiggle" aria-hidden="true">{a.emoji}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{a.titulo}</span>
                {a.detalle ? <span className="block text-xs text-white/70">{a.detalle}</span> : null}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </FxContext.Provider>
  );
}
