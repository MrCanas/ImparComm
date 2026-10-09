"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(response.status === 429 && body.error ? body.error : "Credenciales incorrectas");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <section className="min-h-dvh min-w-0 bg-[#1c2e69] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px] bg-card rounded-lg border border-subtle/50 shadow-sm p-5 sm:p-6">
        <div className="flex justify-center mb-5 sm:mb-6">
          <Image
            src="/IMPAR_CAPITAL_blue.png"
            alt="Impar Capital"
            width={280}
            height={80}
            className="h-12 sm:h-14 w-auto max-w-full object-contain object-center"
            priority
          />
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-icam-900 text-center">
          ImparComm
        </h1>
        <p className="text-sm text-text-muted text-center mb-4 sm:mb-5">
          Accede con tu usuario de icam web dashboard
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            inputMode="email"
            placeholder="Email"
            className="w-full min-h-11 rounded-md border border-subtle px-3 text-sm focus:outline-none focus:ring-2 focus:ring-icam-900/20"
            autoComplete="username"
            required
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="Contraseña"
            className="w-full min-h-11 rounded-md border border-subtle px-3 text-sm focus:outline-none focus:ring-2 focus:ring-icam-900/20"
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            className="w-full min-h-11 rounded-md bg-icam-900 hover:bg-icam-800 text-white text-sm font-medium transition disabled:opacity-70"
            disabled={loading}
          >
            {loading ? "Validando..." : "Acceder"}
          </button>
          {error ? <p className="text-sm text-red-600 text-center">{error}</p> : null}
        </form>
      </div>
    </section>
  );
}
