import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Lock, User } from "lucide-react";
import { useState } from "react";
import { login } from "@/lib/store";

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
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (login(u, p)) nav({ to: "/agendamentos" }); else setErr("Usuário ou senha inválidos"); }}
        className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
          <CalendarDays className="h-6 w-6" />
        </div>
        <h1 className="text-center text-2xl font-bold">Sistema de Agendamentos</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">Consultório Dr. Ricardo</p>
        <label className="field-icon"><User className="h-4 w-4" /><input placeholder="Usuário" value={u} onChange={(e) => setU(e.target.value)} /></label>
        <label className="field-icon mt-3"><Lock className="h-4 w-4" /><input type={showP ? "text" : "password"} placeholder="Senha" value={p} onChange={(e) => setP(e.target.value)} /><OlhoBtn show={showP} onToggle={() => setShowP(!showP)} /></label>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        <button className="btn-primary mt-5 w-full">Entrar</button>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Usuários para teste:<br />Médico: medico / medico123<br />Secretária: secretaria / secretaria123<br />Aplicação: aplicacao / aplicacao123
        </p>
      </form>
    </div>
  );
}
