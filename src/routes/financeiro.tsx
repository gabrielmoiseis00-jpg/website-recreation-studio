import { createFileRoute } from "@tanstack/react-router";
import { Eye, FileSpreadsheet, Paperclip, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import {
  brl, exportFinanceiro, fmtDate, list, upsert, METODO_LABEL, PAG_LABEL,
  type Agendamento, type Metodo, type PagStatus,
} from "@/lib/store";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Dr. Ricardo" },
      { name: "description", content: "Controle de pagamentos, métodos e comprovantes das consultas." },
      { property: "og:title", content: "Financeiro — Dr. Ricardo" },
      { property: "og:description", content: "Controle de pagamentos das consultas." },
    ],
  }),
  component: Financeiro,
});

const BADGE: Record<PagStatus, string> = { pago: "badge-pago", nao_pago: "badge-nao-pago", aguardando: "badge-aguardando" };

function Financeiro() {
  const [rows, setRows] = useState<Agendamento[]>([]);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("");
  const [ver, setVer] = useState<Agendamento | null>(null);
  useEffect(() => setRows(list()), []);

  const save = (a: Agendamento) => { upsert(a); setRows(list()); };
  const filtered = useMemo(() => rows
    .filter((r) => !q || r.nome.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !st || (r.pagStatus ?? "aguardando") === st)
    .sort((a, b) => (b.data + b.horario).localeCompare(a.data + a.horario)), [rows, q, st]);

  const tot = (s: PagStatus) => rows.filter((r) => (r.pagStatus ?? "aguardando") === s).reduce((t, r) => t + (r.valor ?? 0), 0);

  const anexar = (r: Agendamento, file?: File) => {
    if (!file) return;
    if (file.size > 3_000_000) { toast.error("Arquivo muito grande (máx. 3 MB)"); return; }
    const fr = new FileReader();
    fr.onload = () => { save({ ...r, comprovante: String(fr.result), comprovanteNome: file.name }); toast.success("Comprovante anexado"); };
    fr.readAsDataURL(file);
  };

  return (
    <AppShell adminOnly>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <button onClick={() => exportFinanceiro(filtered)} className="btn-success"><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card label="Recebido" value={brl(tot("pago"))} cls="text-success" />
        <Card label="Aguardando" value={brl(tot("aguardando"))} cls="text-warning" />
        <Card label="Não pago" value={brl(tot("nao_pago"))} cls="text-destructive" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <label className="field-icon"><Search className="h-4 w-4" /><input placeholder="Buscar paciente" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input" value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(PAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr><th className="p-3">Paciente</th><th className="p-3">Consulta</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Método</th><th className="p-3">Pago em</th><th className="p-3">Comprovante</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum registro encontrado</td></tr>}
              {filtered.map((r) => {
                const s = r.pagStatus ?? "aguardando";
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3 font-medium">{r.nome}</td>
                    <td className="p-3">{fmtDate(r.data)} {r.horario}</td>
                    <td className="p-3">
                      <input type="number" min={0} step="0.01" className="input w-28 py-1" defaultValue={r.valor ?? ""} placeholder="0,00"
                        onBlur={(e) => save({ ...r, valor: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="p-3">
                      <select className={`input py-1 ${BADGE[s]}`} value={s}
                        onChange={(e) => {
                          const v = e.target.value as PagStatus;
                          save({ ...r, pagStatus: v, pagData: v === "pago" ? r.pagData || new Date().toISOString().slice(0, 10) : r.pagData });
                        }}>
                        {Object.entries(PAG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <select className="input py-1" value={r.metodo ?? ""} onChange={(e) => save({ ...r, metodo: e.target.value as Metodo })}>
                        {Object.entries(METODO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="p-3"><input type="date" className="input w-auto py-1" value={r.pagData ?? ""} onChange={(e) => save({ ...r, pagData: e.target.value })} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <label className="btn-ghost cursor-pointer px-2 py-1" title="Anexar comprovante">
                          <Paperclip className="h-4 w-4" />
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => anexar(r, e.target.files?.[0])} />
                        </label>
                        {r.comprovante && (
                          <>
                            <button onClick={() => setVer(r)} className="btn-ghost px-2 py-1" aria-label="Ver comprovante"><Eye className="h-4 w-4" /></button>
                            <button onClick={() => save({ ...r, comprovante: undefined, comprovanteNome: undefined })} className="text-muted-foreground hover:text-destructive" aria-label="Remover comprovante"><X className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {ver?.comprovante && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" onClick={() => setVer(null)}>
          <div className="max-h-full w-full max-w-2xl overflow-auto rounded-xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">Comprovante — {ver.nome}</span>
              <button onClick={() => setVer(null)} aria-label="Fechar"><X className="h-5 w-5" /></button>
            </div>
            {ver.comprovante.startsWith("data:application/pdf")
              ? <iframe title="Comprovante" src={ver.comprovante} className="h-[70vh] w-full" />
              : <img src={ver.comprovante} alt="Comprovante" className="mx-auto max-h-[70vh]" />}
            <a href={ver.comprovante} download={ver.comprovanteNome || "comprovante"} className="btn-primary mt-3">Baixar</a>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Card({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
