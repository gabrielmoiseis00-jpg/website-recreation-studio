import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fmtDate, type Agendamento } from "@/lib/store";
import { listAppointments } from "@/lib/supabase/data";

export const Route=createFileRoute("/evolucao")({component:Evolucao});
function Evolucao(){
 const [rows,setRows]=useState<Agendamento[]>([]);
 const [q,setQ]=useState("");
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;listAppointments().then(data=>{if(active)setRows(data);}).catch(e=>toast.error(e instanceof Error?e.message:"Não foi possível carregar evoluções.")).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const filtered=useMemo(()=>rows.filter(r=>[r.nome,r.telefone].join(" ").toLowerCase().includes(q.toLowerCase())).sort((a,b)=>(b.data+b.horario).localeCompare(a.data+a.horario)),[rows,q]);
 return <AppShell><div className="mb-6"><h1 className="text-2xl font-bold">Evolução dos pacientes</h1><p className="text-sm text-muted-foreground">Acompanhamento semanal, medicamentos e observações vinculados às consultas.</p></div>
 <div className="rounded-xl border bg-card p-4"><label className="field-icon mb-4"><Search className="h-4 w-4"/><input placeholder="Buscar paciente ou telefone" value={q} onChange={e=>setQ(e.target.value)}/></label>
 {loading?<p className="p-8 text-center text-muted-foreground">Carregando…</p>:filtered.length===0?<p className="p-8 text-center text-muted-foreground">Nenhuma consulta encontrada.</p>:<div className="divide-y">{filtered.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><div className="font-semibold">{r.nome}</div><div className="text-sm text-muted-foreground">{fmtDate(r.data)} às {r.horario} · {r.telefone}</div></div><Link to="/agendamentos/$id" params={{id:r.id}} className="btn-ghost border"><ClipboardList className="h-4 w-4"/> Abrir evolução</Link></div>)}</div>}
 </div></AppShell>;
}
