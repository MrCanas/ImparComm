import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-page px-4 text-center">
      <p className="text-5xl font-semibold text-icam-900">404</p>
      <p className="text-text-muted">Esta página no existe o no tienes acceso.</p>
      <Link href="/" className="inline-flex min-h-11 items-center rounded-md bg-icam-900 px-4 text-sm font-medium text-white">
        Volver al inicio
      </Link>
    </div>
  );
}
