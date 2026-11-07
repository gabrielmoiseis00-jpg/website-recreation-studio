import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, CheckCircle2, Clock3, Users, Plus, ArrowUpRight,
  CalendarCheck, UserRound, FileText, Wallet, Activity, Sparkles,
} from "lucide-react";
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
    listAppointments()
      .then((data) => { if (alive) setRows(data); })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar o painel."))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const todayRows = useMemo(
    () => rows.filter((r) => r.data === today && r.status !== "cancelado").sort((a, b) => a.horario.localeCompare(b.horario)),
    [rows, today],
  );
  const uniquePatients = new Set(rows.map((r) => r.email.toLowerCase())).size;
  const pending = rows.filter((r) => r.status === "agendado" || r.status === "confirmado").length;
  const done = rows.filter((r) => r.status === "concluido").length;
  const stats = [
    { label: "Consultas hoje", value: todayRows.length, icon: CalendarDays, note: "Agendamentos do dia", tone: "text-blue-600 bg-blue-500/10" },
    { label: "Pacientes", value: uniquePatients, icon: Users, note: "Na base de agendamentos", tone: "text-violet-600 bg-violet-500/10" },
    { label: "Consultas pendentes", value: pending, icon: Clock3, note: "Aguardando atendimento", tone: "text-amber-600 bg-amber-500/10" },
    { label: "Consultas concluídas", value: done, icon: CheckCircle2, note: "Atendimentos finalizados", tone: "text-emerald-600 bg-emerald-500/10" },
  ];
  const shortcuts = [
    { title: "Novo agendamento", description: "Marque uma consulta", icon: CalendarCheck, to: "/agendamentos/novo", tone: "bg-blue-500/10 text-blue-600" },
    { title: "Pacientes", description: "Consulte os cadastros", icon: UserRound, to: "/pacientes", tone: "bg-violet-500/10 text-violet-600" },
    { title: "Prontuários", description: "Histórico clínico", icon: FileText, to: "/prontuarios", tone: "bg-emerald-500/10 text-emerald-600" },
    { title: "Financeiro", description: "Acompanhe os valores", icon: Wallet, to: "/financeiro", tone: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 px-6 py-7 text-primary-foreground shadow-lg sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/10" />
          <div className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                <Sparkles className="h-3.5 w-3.5" /> Painel de gestão
              </div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Olá! Bem-vindo ao painel.</h1>
              <p className="mt-2 text-sm text-white/80 sm:text-base">Acompanhe a rotina da sua clínica em um só lugar.</p>
              <p className="mt-4 text-sm font-medium text-white/90">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            <Link to="/agendamentos/novo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-primary shadow-md transition hover:-translate-y-0.5 hover:bg-white/90">
              <Plus className="h-4 w-4" /> Novo agendamento
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Visão geral</h2>
              <p className="text-sm text-muted-foreground">Resumo dos principais indicadores</p>
            </div>
            <span className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Atualizado ao abrir</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, note, tone }) => (
              <article key={label} className="group rounded-2xl border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{label}</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{loading ? "—" : value}</p>
                  </div>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{note}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold tracking-tight">Acesso rápido</h2>
            <p className="text-sm text-muted-foreground">Atalhos para as áreas mais utilizadas</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {shortcuts.map(({ title, description, icon: Icon, to, tone }) => (
              <Link key={title} to={to} className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
              <div><h2 className="font-semibold">Agenda de hoje</h2><p className="text-xs text-muted-foreground">{fmtDate(today)} · {todayRows.length} {todayRows.length === 1 ? "consulta" : "consultas"}</p></div>
            </div>
            <Link to="/agendamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Ver agenda completa <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
          {loading ? (
            <div className="space-y-3 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : todayRows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><CalendarDays className="h-7 w-7" /></span>
              <h3 className="mt-4 font-semibold">Agenda livre por enquanto</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Não há consultas marcadas para hoje. Você pode aproveitar para organizar os próximos atendimentos.</p>
              <Link to="/agendamentos/novo" className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-muted"><Plus className="h-4 w-4" /> Agendar consulta</Link>
            </div>
          ) : (
            <div className="divide-y">
              {todayRows.map((row, index) => (
                <div key={row.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-muted/30 sm:px-6">
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-muted/70 px-2 py-2">
                    <span className="text-sm font-bold tabular-nums">{row.horario}</span><span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Horário</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{row.nome}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{row.telefone || "Telefone não informado"}</p>
                  </div>
                  <span className={row.status === "concluido" ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700" : row.status === "confirmado" ? "rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-700" : "rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700"}>
                    {row.status === "concluido" ? "Concluído" : row.status === "confirmado" ? "Confirmado" : "Agendado"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="flex items-center justify-center gap-2 pb-1 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" /> Gestão de atendimentos</div>
      </div>
    </AppShell>
  );
}
