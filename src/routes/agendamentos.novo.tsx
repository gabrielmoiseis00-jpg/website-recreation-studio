import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PacienteForm } from "@/components/PacienteForm";
import { emptySemanas } from "@/lib/store";
import { upsertAppointment } from "@/lib/supabase/data";

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
  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2">
        <Link to="/agendamentos" aria-label="Voltar" className="rounded-md p-1 hover:bg-accent"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold">Novo Agendamento</h1>
      </div>
      <PacienteForm
        initial={{ nome: "", telefone: "", email: "", foto: "", data: "", horario: "", obs: "" }}
        onSubmit={async (v) => {
          try {
            await upsertAppointment({ ...v, id: crypto.randomUUID(), status: "agendado", semanas: emptySemanas() });
            toast.success(typeof navigator !== "undefined" && !navigator.onLine ? "Agendamento salvo neste dispositivo. Aguardando sincronização." : "Agendamento cadastrado com sucesso");
            nav({ to: "/agendamentos" });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível salvar o agendamento.");
          }
        }}
        onCancel={() => nav({ to: "/agendamentos" })}
      />
    </AppShell>
  );
}
