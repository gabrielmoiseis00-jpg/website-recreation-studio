import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fmtDate, type Agendamento } from "@/lib/store";
import { listAppointments } from "@/lib/supabase/data";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const [rows, setRows] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    listAppointments().then(data => { if(alive) setRows(data); })
      .catch(error => toast.error(error instanceof Error ? error.message : "Não foi possível carregar o painel."))
      .finally(() => { if(alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const today = new Date().toISOString().slice(0,10);
  const todayRows = useMemo(() => rows.filter(r => r.data === today && r.status !== "cancelado").sort((a,b)=>a.horario.localeCompare(b.horario)), [rows,today]);
  const uniquePatients = new Set(rows.map(r=>r.email.toLowerCase())).size;
  const pending = rows.filter(r=>r.status==="agendado" || r.status==="confirmado").length;
  const done = rows.filter(r=>r.status==="concluido").length;
  const cards = [
    {label:"Consultas hoje",value:todayRows.length,icon:CalendarDays},
    {label:"Pacientes atendidos/cadastrados",value:uniquePatients,icon:Users},
    {label:"Consultas pendentes",value:pending,icon:Clock3},
    {label:"Consultas concluídas",value:done,icon:CheckCircle2},
  ];
  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Painel inicial</h1><p className="text-sm text-muted-foreground">Resumo operacional da Clínica Storbem.</p></div><Link to="/agendamentos/novo" className="btn-primary">Novo agendamento</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({label,value,icon:Icon})=><div key={label} className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="h-5 w-5"/></div><div className="mt-3 text-3xl font-bold">{loading?"—":value}</div></div>)}
    </div>
    <section className="mt-6 rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Agenda de hoje</h2><p className="text-xs text-muted-foreground">{fmtDate(today)}</p></div><Link to="/agendamentos" className="text-sm font-medium text-primary hover:underline">Ver agenda completa</Link></div>
      {loading?<p className="p-6 text-sm text-muted-foreground">Carregando agenda…</p>:todayRows.length===0?<p className="p-8 text-center text-sm text-muted-foreground">Não há consultas para hoje.</p>:<div className="divide-y">{todayRows.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4"><div><div className="font-medium">{r.nome}</div><div className="text-xs text-muted-foreground">{r.telefone}</div></div><div className="text-right"><div className="font-semibold">{r.horario}</div><div className="text-xs capitalize text-muted-foreground">{r.status}</div></div></div>)}</div>}
    </section>
  </AppShell>;
}
