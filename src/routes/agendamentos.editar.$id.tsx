import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PacienteForm } from "@/components/PacienteForm";
import { get, upsert, type Agendamento } from "@/lib/store";

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
    const x = get(id);
    if (x) setA(x); else setMissing(true);
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
          upsert({ ...a, ...v });
          toast.success("Cadastro do paciente atualizado");
          nav({ to: "/agendamentos/$id", params: { id: a.id } });
        }}
        onCancel={() => nav({ to: "/agendamentos" })}
      />
    </AppShell>
  );
}
