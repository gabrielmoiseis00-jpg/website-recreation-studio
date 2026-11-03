import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Save } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { emptySemanas, upsert } from "@/lib/store";

export const Route = createFileRoute("/agendamentos/novo")({
  head: () => ({
    meta: [
      { title: "Novo Agendamento — Dr. Ricardo" },
      { name: "description", content: "Cadastrar um novo agendamento de paciente." },
      { property: "og:title", content: "Novo Agendamento — Dr. Ricardo" },
      { property: "og:description", content: "Cadastrar um novo agendamento de paciente." },
    ],
  }),
  component: Novo,
});

function Novo() {
  const nav = useNavigate();
  const [f, setF] = useState({ nome: "", telefone: "", email: "", data: "", horario: "", obs: "", foto: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const onFoto = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setF((p) => ({ ...p, foto: String(r.result) }));
    r.readAsDataURL(file);
  };
  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2">
        <Link to="/agendamentos" aria-label="Voltar" className="rounded-md p-1 hover:bg-accent"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold">Novo Agendamento</h1>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          upsert({ ...f, id: crypto.randomUUID(), status: "agendado", semanas: emptySemanas() });
          nav({ to: "/agendamentos" });
        }}
        className="rounded-xl border bg-card p-6"
      >
        <div className="grid gap-8 md:grid-cols-2">
          <section className="space-y-4">
            <h2 className="font-semibold">Dados do Paciente</h2>
            <Field label="Nome Completo *"><input required className="input" placeholder="Nome completo do paciente" value={f.nome} onChange={set("nome")} /></Field>
            <Field label="Telefone (WhatsApp) *"><input required className="input" placeholder="(00) 00000-0000" value={f.telefone} onChange={set("telefone")} /></Field>
            <Field label="E-mail *"><input required type="email" className="input" placeholder="email@exemplo.com" value={f.email} onChange={set("email")} /></Field>
            <Field label="Foto do Paciente (opcional)"><input type="file" accept="image/*" className="text-sm" onChange={(e) => onFoto(e.target.files?.[0])} /></Field>
          </section>
          <section className="space-y-4">
            <h2 className="font-semibold">Dados da Consulta</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data *"><input required type="date" className="input" value={f.data} onChange={set("data")} /></Field>
              <Field label="Horário *"><input required type="time" className="input" value={f.horario} onChange={set("horario")} /></Field>
            </div>
            <Field label="Observações"><textarea rows={4} className="input" placeholder="Anote informações adicionais sobre a consulta..." value={f.obs} onChange={set("obs")} /></Field>
          </section>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Link to="/agendamentos" className="btn-ghost">Cancelar</Link>
          <button className="btn-primary"><Save className="h-4 w-4" /> Salvar</button>
        </div>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}</label>;
}
