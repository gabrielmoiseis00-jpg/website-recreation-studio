import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FileSpreadsheet, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { exportExcel, fmtDate, type Agendamento, type Status } from "@/lib/store";
import { listAppointments, removeAppointment, upsertAppointment } from "@/lib/supabase/data";

export const Route = createFileRoute("/agendamentos/")({
  head: () => ({
    meta: [
      { title: "Agendamentos — Dr. Ricardo" },
      { name: "description", content: "Lista de agendamentos de pacientes do consultório." },
      { property: "og:title", content: "Agendamentos — Dr. Ricardo" },
      { property: "og:description", content: "Lista de agendamentos de pacientes." },
    ],
  }),
  component: Lista,
});

const STATUS: Status[] = ["agendado", "confirmado", "concluido", "cancelado"];

function Lista() {
  const [rows, setRows] = useState<Agendamento[]>([]);
  const [q, setQ] = useState("");
  const [d, setD] = useState("");
  const [s, setS] = useState("");
  useEffect(() => {
    let active = true;
    listAppointments()
      .then((data) => { if (active) setRows(data); })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar os agendamentos."));
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => rows
    .filter((r) => !q || [r.nome, r.email, r.telefone].join(" ").toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !d || r.data === d)
    .filter((r) => !s || r.status === s)
    .sort((a, b) => (a.data + a.horario).localeCompare(b.data + b.horario)), [rows, q, d, s]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Agendamentos</h1>
        <div className="flex gap-2">
          <Link to="/agendamentos/novo" className="btn-primary"><CalendarPlus className="h-4 w-4" /> Novo Agendamento</Link>
          <button onClick={() => exportExcel(filtered)} className="btn-success"><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</button>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <label className="field-icon"><Search className="h-4 w-4" /><input placeholder="Buscar por nome, email ou telefone" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
          <select className="input" value={s} onChange={(e) => setS(e.target.value)}>
            <option value="">Todos</option>
            {STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr><th className="p-3">Paciente</th><th className="p-3">Contato</th><th className="p-3">Data</th><th className="p-3">Horário</th><th className="p-3">Status</th><th /></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum agendamento encontrado</td></tr>}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-3">
                    <Link to="/agendamentos/$id" params={{ id: r.id }} className="flex items-center gap-2 font-medium hover:text-primary">
                      {r.foto ? <img src={r.foto} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs text-primary">{r.nome[0]}</span>}
                      {r.nome}
                    </Link>
                  </td>
                  <td className="p-3"><div>{r.telefone}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                  <td className="p-3">{fmtDate(r.data)}</td>
                  <td className="p-3">{r.horario}</td>
                  <td className="p-3">
                    <select className="input py-1" value={r.status} onChange={async (e) => { const n = { ...r, status: e.target.value as Status }; try { await upsertAppointment(n); setRows((current) => current.map((item) => item.id === n.id ? n : item)); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o status."); } }}>
                      {STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Link to="/agendamentos/editar/$id" params={{ id: r.id }} aria-label="Editar cadastro" className="mr-3 inline-flex text-muted-foreground hover:text-primary"><Pencil className="h-4 w-4" /></Link>
                    <button aria-label="Excluir" onClick={async () => { if (confirm("Excluir agendamento?")) { try { await removeAppointment(r.id); setRows((current) => current.filter((item) => item.id !== r.id)); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o agendamento."); } } }} className="inline-flex text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
