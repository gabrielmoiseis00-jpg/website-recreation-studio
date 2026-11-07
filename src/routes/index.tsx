import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { login } from "@/lib/auth";
import { OlhoBtn } from "@/components/SenhaInput";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar — Sistema de Agendamentos Dr. Ricardo" },
      { name: "description", content: "Acesso ao sistema de agendamentos do Consultório Dr. Ricardo." },
      { property: "og:title", content: "Sistema de Agendamentos — Dr. Ricardo" },
      { property: "og:description", content: "Acesso ao sistema de agendamentos do consultório." },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      nav({ to: "/agendamentos" });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <CalendarDays className="h-6 w-6" />
        </div>
        <h1 className="text-center text-2xl font-bold">Sistema de Agendamentos</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Consultório Dr. Ricardo</p>
        <label className="field-icon">
          <Mail className="h-4 w-4" />
          <input type="email" autoComplete="username" required placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field-icon mt-3">
          <Lock className="h-4 w-4" />
          <input type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Senha" value={password} onChange={(event) => setPassword(event.target.value)} />
          <OlhoBtn show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
        </label>
        {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
        <button disabled={loading} className="btn-primary mt-5 w-full">
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
