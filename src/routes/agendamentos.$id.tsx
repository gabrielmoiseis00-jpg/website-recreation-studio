import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { emptySemanas, fmtDate, get, upsert, type Agendamento } from "@/lib/store";

export const Route = createFileRoute("/agendamentos/$id")({
  head: () => ({
    meta: [
      { title: "Progresso Semanal do Paciente — Storbem" },
      { name: "description", content: "Acompanhamento semanal de medicamentos e observações do paciente." },
      { property: "og:title", content: "Progresso Semanal — Storbem" },
      { property: "og:description", content: "Acompanhamento semanal de medicamentos do paciente." },
    ],
  }),
  component: Detalhe,
});

function Detalhe() {
  const { id } = Route.useParams();
  const [a, setA] = useState<Agendamento | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const x = get(id); if (x) setA({ ...x, semanas: x.semanas?.length ? x.semanas : emptySemanas() }); }, [id]);
  if (!a) return <AppShell><p className="text-muted-foreground">Agendamento não encontrado.</p></AppShell>;
  const sem = a.semanas[w]!;
  const upd = (s: typeof sem) => setA({ ...a, semanas: a.semanas.map((x, i) => (i === w ? s : x)) });

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/agendamentos" aria-label="Voltar" className="rounded-md p-1 hover:bg-accent"><ChevronLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-2xl font-bold">{a.nome}</h1>
            <p className="text-sm text-muted-foreground">{fmtDate(a.data)} às {a.horario} · {a.telefone}</p>
          </div>
        </div>
        <Link to="/agendamentos/editar/$id" params={{ id: a.id }} className="btn-ghost border"><Pencil className="h-4 w-4" /> Editar cadastro</Link>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Progresso Semanal</h2>
        <div className="mb-6 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-sm">
          {a.semanas.map((_, i) => (
            <button key={i} onClick={() => setW(i)} className={i === w ? "tab tab-active" : "tab"}>Semana {i + 1}</button>
          ))}
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">Progresso da Semana {w + 1}</h3>
          <button onClick={() => { upsert(a); toast.success("Progresso salvo"); }} className="btn-dark"><Check className="h-4 w-4" /> Salvar</button>
        </div>
        <div className="space-y-4">
          {sem.meds.map((m, i) => {
            const setM = (p: Partial<typeof m>) => upd({ ...sem, meds: sem.meds.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <input className="input" placeholder="Nome do medicamento" value={m.nome} onChange={(e) => setM({ nome: e.target.value })} />
                  <button aria-label="Remover" onClick={() => upd({ ...sem, meds: sem.meds.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                  {(["sim", "nao"] as const).map((v) => (
                    <label key={v} className="flex items-center gap-1">
                      <input type="radio" name={`m${w}-${i}`} checked={m.tomou === v} onChange={() => setM({ tomou: v })} /> {v === "sim" ? "Sim" : "Não"}
                    </label>
                  ))}
                  <input type="date" className="input w-auto py-1" value={m.data} onChange={(e) => setM({ data: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={() => upd({ ...sem, meds: [...sem.meds, { nome: "", tomou: "", data: "" }] })} className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="h-4 w-4" /> Adicionar medicamento
        </button>
        <label className="mt-6 block text-sm">
          <span className="mb-1 flex items-center gap-1 font-medium"><Pencil className="h-4 w-4" /> Observações</span>
          <textarea rows={3} className="input" placeholder="Adicione observações sobre o progresso do paciente" value={sem.obs} onChange={(e) => upd({ ...sem, obs: e.target.value })} />
        </label>
      </div>
    </AppShell>
  );
}
