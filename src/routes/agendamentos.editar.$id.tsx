import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PacienteForm } from "@/components/PacienteForm";
import { type Agendamento } from "@/lib/store";
import { getAppointment, upsertAppointment } from "@/lib/supabase/data";

export const Route = createFileRoute("/agendamentos/editar/$id")({
  head: () => ({
    meta: [
      { title: "Editar Cadastro do Paciente — Dr. Ricardo" },
      { name: "description", content: "Alterar os dados de um paciente já cadastrado." },
      { property: "og:title", content: "Editar Cadastro do Paciente — Dr. Ricardo" },
      { property: "og:description", content: "Alterar os dados de um paciente já cadastrado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Editar,
});

function Editar() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [a, setA] = useState<Agendamento | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    getAppointment(id).then((x) => {
      if (!active) return;
      if (x) setA(x); else setMissing(true);
    }).catch((error: unknown) => {
      if (active) { setMissing(true); toast.error(error instanceof Error ? error.message : "Não foi possível carregar o cadastro."); }
    });
    return () => { active = false; };
  }, [id]);

  if (missing) return <AppShell><p className="text-muted-foreground">Agendamento não encontrado.</p></AppShell>;
  if (!a) return <AppShell><p className="text-muted-foreground">Carregando…</p></AppShell>;

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-2">
        <Link to="/agendamentos" aria-label="Voltar" className="rounded-md p-1 hover:bg-accent"><ChevronLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">Editar Cadastro</h1>
          <p className="text-sm text-muted-foreground">{a.nome}</p>
        </div>
      </div>
      <PacienteForm
        initial={{ nome: a.nome, telefone: a.telefone, email: a.email, foto: a.foto ?? "", data: a.data, horario: a.horario, obs: a.obs }}
        submitLabel="Salvar Alterações"
        onSubmit={(v) => {
          void upsertAppointment({ ...a, ...v }).then(() => {
            toast.success(typeof navigator !== "undefined" && !navigator.onLine ? "Alteração salva neste dispositivo. Aguardando sincronização." : "Cadastro do paciente atualizado");
            nav({ to: "/agendamentos/$id", params: { id: a.id } });
          }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o cadastro."));
        }}
        onCancel={() => nav({ to: "/agendamentos" })}
      />
    </AppShell>
  );
}
