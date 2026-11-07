import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { fmtDate, type Agendamento } from "@/lib/store";
import { getReceiptUrl, listAppointments } from "@/lib/supabase/data";

export const Route = createFileRoute("/recibos")({ component: Recibos });

function Recibos(){
 const [rows,setRows]=useState<Agendamento[]>([]);
 const [query,setQuery]=useState("");
 const [loading,setLoading]=useState(true);
 const [opened,setOpened]=useState<{row:Agendamento;url:string}|null>(null);
 useEffect(()=>{let active=true;listAppointments().then(data=>{if(active)setRows(data.filter(r=>!!r.comprovante));}).catch(e=>toast.error(e instanceof Error?e.message:"Não foi possível carregar comprovantes.")).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const filtered=useMemo(()=>rows.filter(r=>[r.nome,r.comprovanteNome??""].join(" ").toLowerCase().includes(query.toLowerCase())),[rows,query]);
 async function open(row:Agendamento){try{const url=await getReceiptUrl(row.comprovante!);setOpened({row,url});}catch(e){toast.error(e instanceof Error?e.message:"Não foi possível abrir o comprovante.");}}
 return <AppShell><div className="mb-6"><h1 className="text-2xl font-bold">Recibos e comprovantes</h1><p className="text-sm text-muted-foreground">Documentos anexados aos registros financeiros das consultas.</p></div>
 <div className="rounded-xl border bg-card p-4"><label className="field-icon mb-4"><Search className="h-4 w-4"/><input placeholder="Buscar por paciente ou nome do arquivo" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 {loading?<p className="p-8 text-center text-muted-foreground">Carregando comprovantes…</p>:filtered.length===0?<p className="p-8 text-center text-muted-foreground">Nenhum comprovante encontrado.</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-3">Paciente</th><th className="p-3">Consulta</th><th className="p-3">Arquivo</th><th className="p-3 text-right">Ações</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} className="border-b last:border-0"><td className="p-3 font-medium">{r.nome}</td><td className="p-3">{fmtDate(r.data)} · {r.horario}</td><td className="p-3"><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground"/>{r.comprovanteNome||"Comprovante anexado"}</span></td><td className="p-3 text-right"><button className="btn-ghost border px-3 py-2" onClick={()=>void open(r)}><Eye className="h-4 w-4"/> Visualizar</button></td></tr>)}</tbody></table></div>}
 </div>
 {opened&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setOpened(null);}}><div className="w-full max-w-3xl rounded-xl bg-card p-4"><div className="mb-3 flex items-center justify-between gap-2"><div className="font-semibold">{opened.row.comprovanteNome||"Comprovante"} · {opened.row.nome}</div><button className="btn-ghost" onClick={()=>setOpened(null)}>Fechar</button></div>{opened.row.comprovanteNome?.toLowerCase().endsWith(".pdf")?<iframe title="Comprovante" src={opened.url} className="h-[70vh] w-full"/>:<img src={opened.url} alt="Comprovante do paciente" className="mx-auto max-h-[70vh]"/>}<a className="btn-primary mt-3" href={opened.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4"/> Abrir / baixar</a></div></div>}
 </AppShell>;
}
