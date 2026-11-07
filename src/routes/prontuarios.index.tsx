import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { listPatients, listMedicalRecords, removeMedicalRecord, saveMedicalRecord, type MedicalRecord, type PatientRecord } from "@/lib/supabase/data";

export const Route = createFileRoute("/prontuarios/")({ component: Prontuarios });

type Draft = { id: string; patientId: string; title: string; content: string };
const emptyDraft = (): Draft => ({ id: "", patientId: "", title: "", content: "" });

function Prontuarios() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [recordRows, patientRows] = await Promise.all([listMedicalRecords(), listPatients()]);
      setRecords(recordRows);
      setPatients(patientRows);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar os prontuários."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => records.filter(r =>
    [r.patientName, r.title, r.content].join(" ").toLowerCase().includes(search.toLowerCase())
  ), [records, search]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await saveMedicalRecord(draft);
      toast.success(draft.id ? "Prontuário atualizado." : "Prontuário cadastrado.");
      setDraft(null);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o prontuário."); }
    finally { setSaving(false); }
  }

  async function erase(record: MedicalRecord) {
    if (!confirm(`Excluir o prontuário "${record.title}" de ${record.patientName}?`)) return;
    try { await removeMedicalRecord(record.id); toast.success("Prontuário excluído."); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir o prontuário."); }
  }

  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Prontuários e histórico clínico</h1><p className="text-sm text-muted-foreground">Registros clínicos privados e vinculados ao paciente.</p></div><button className="btn-primary" onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> Novo prontuário</button></div>
    <div className="rounded-xl border bg-card p-4">
      <label className="field-icon mb-4"><Search className="h-4 w-4" /><input placeholder="Buscar paciente, título ou conteúdo" value={search} onChange={e => setSearch(e.target.value)} /></label>
      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando prontuários…</p> : filtered.length === 0 ? <p className="p-8 text-center text-muted-foreground">Nenhum prontuário encontrado.</p> :
        <div className="space-y-3">{filtered.map(r=><article key={r.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><FileText className="mt-1 h-5 w-5 text-primary"/><div><h2 className="font-semibold">{r.title}</h2><p className="text-sm text-muted-foreground">{r.patientName} · {new Date(r.createdAt).toLocaleString("pt-BR")}</p></div></div><div className="flex gap-2"><button className="rounded-md border p-2 hover:bg-muted" title="Editar" onClick={()=>setDraft({id:r.id,patientId:r.patientId,title:r.title,content:r.content})}><Pencil className="h-4 w-4"/></button><button className="rounded-md border p-2 text-destructive hover:bg-destructive/5" title="Excluir" onClick={()=>void erase(r)}><Trash2 className="h-4 w-4"/></button></div></div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{r.content}</p>
        </article>)}</div>}
    </div>
    {draft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setDraft(null);}}>
      <form onSubmit={submit} className="w-full max-w-2xl space-y-4 rounded-xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{draft.id?"Editar prontuário":"Novo prontuário"}</h2><button type="button" onClick={()=>setDraft(null)} aria-label="Fechar"><X className="h-5 w-5"/></button></div>
        <label className="block text-sm font-medium">Paciente<select className="input mt-1" required disabled={!!draft.id} value={draft.patientId} onChange={e=>setDraft({...draft,patientId:e.target.value})}><option value="">Selecione o paciente</option>{patients.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
        <label className="block text-sm font-medium">Título do registro<input className="input mt-1" required maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Ex.: Consulta inicial, avaliação, retorno"/></label>
        <label className="block text-sm font-medium">Conteúdo clínico<textarea className="input mt-1 min-h-40" required rows={8} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})} placeholder="Registre as informações clínicas relevantes…"/></label>
        <p className="text-xs text-muted-foreground">O acesso a este conteúdo é limitado pelas permissões de prontuário configuradas para cada usuário.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={()=>setDraft(null)}>Cancelar</button><button disabled={saving||patients.length===0} className="btn-primary">{saving?"Salvando…":"Salvar prontuário"}</button></div>
      </form>
    </div>}
  </AppShell>;
}
