import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getPatientPhotoUrl, listPatients, removePatient, savePatient, type PatientRecord } from "@/lib/supabase/data";

export const Route = createFileRoute("/pacientes/")({ component: Pacientes });

const blank = (): PatientRecord => ({ id: "", nome: "", telefone: "", email: "", foto: undefined, criadoEm: "" });

function Pacientes() {
  const [rows, setRows] = useState<PatientRecord[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<PatientRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try { setRows(await listPatients()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar os pacientes."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => rows.filter((p) =>
    [p.nome, p.telefone, p.email].join(" ").toLowerCase().includes(query.toLowerCase())
  ), [rows, query]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      await savePatient(form);
      toast.success(form.id ? "Paciente atualizado." : "Paciente cadastrado.");
      setForm(null);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o paciente."); }
    finally { setBusy(false); }
  }

  async function erase(patient: PatientRecord) {
    if (!confirm(`Excluir o cadastro de ${patient.nome}? Agendamentos vinculados também podem ser removidos.`)) return;
    try {
      await removePatient(patient.id);
      toast.success("Paciente excluído.");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o paciente."); }
  }

  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Pacientes</h1><p className="text-sm text-muted-foreground">Cadastro centralizado de pacientes da clínica.</p></div>
      <button className="btn-primary" onClick={() => setForm(blank())}><Plus className="h-4 w-4" /> Novo paciente</button>
    </div>
    <div className="rounded-xl border bg-card p-4">
      <label className="field-icon mb-4"><Search className="h-4 w-4" /><input placeholder="Buscar por nome, telefone ou e-mail" value={query} onChange={e => setQuery(e.target.value)} /></label>
      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando pacientes…</p> :
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground"><tr><th className="p-3">Paciente</th><th className="p-3">Telefone(s)</th><th className="p-3">E-mail</th><th className="p-3 text-right">Ações</th></tr></thead>
        <tbody>
          {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhum paciente encontrado.</td></tr>}
          {filtered.map(p => <tr key={p.id} className="border-b last:border-0">
            <td className="p-3 font-medium">{p.nome}</td><td className="p-3 whitespace-pre-wrap">{p.telefone.split(" | ").join("\n")}</td><td className="p-3">{p.email}</td>
            <td className="p-3 text-right whitespace-nowrap">
              <button className="mr-2 rounded-md border p-2 hover:bg-muted" title="Editar" onClick={() => setForm(p)}><Pencil className="h-4 w-4" /></button>
              <button className="rounded-md border p-2 text-destructive hover:bg-destructive/5" title="Excluir" onClick={() => void erase(p)}><Trash2 className="h-4 w-4" /></button>
            </td>
          </tr>)}
        </tbody>
      </table></div>}
    </div>
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if(e.target===e.currentTarget) setForm(null); }}>
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{form.id ? "Editar paciente" : "Novo paciente"}</h2><button type="button" onClick={() => setForm(null)} aria-label="Fechar"><X className="h-5 w-5" /></button></div>
        <label className="block text-sm font-medium">Nome completo<input className="input mt-1" required value={form.nome} onChange={e => setForm({...form,nome:e.target.value})} /></label>
        <label className="block text-sm font-medium">Telefone(s)<input className="input mt-1" required placeholder="Separe vários números com |" value={form.telefone} onChange={e => setForm({...form,telefone:e.target.value})} /><span className="mt-1 block text-xs text-muted-foreground">Para mais de um número, separe-os com | (barra vertical).</span></label>
        <label className="block text-sm font-medium">E-mail<input className="input mt-1" required type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button disabled={busy} className="btn-primary">{busy ? "Salvando…" : "Salvar paciente"}</button></div>
      </form>
    </div>}
  </AppShell>;
}
