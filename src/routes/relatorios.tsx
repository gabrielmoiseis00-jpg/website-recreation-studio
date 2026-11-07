import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { brl, exportFinanceiro, exportExcel, type Agendamento } from "@/lib/store";
import { listAppointments } from "@/lib/supabase/data";

export const Route = createFileRoute("/relatorios")({ component: Relatorios });

function Relatorios() {
  const [rows,setRows] = useState<Agendamento[]>([]);
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [search,setSearch] = useState("");
  const [loading,setLoading] = useState(true);
  useEffect(()=>{let active=true;listAppointments().then(data=>{if(active)setRows(data);}).catch(e=>toast.error(e instanceof Error?e.message:"Não foi possível carregar relatórios.")).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const filtered=useMemo(()=>rows.filter(r=>r.data.startsWith(month)).filter(r=>!search||[r.nome,r.email,r.telefone].join(" ").toLowerCase().includes(search.toLowerCase())),[rows,month,search]);
  const total=filtered.reduce((sum,r)=>sum+(r.valor??0),0);
  const received=filtered.filter(r=>r.pagStatus==="pago").reduce((sum,r)=>sum+(r.valor??0),0);
  const pending=filtered.filter(r=>r.pagStatus!=="pago").reduce((sum,r)=>sum+(r.valor??0),0);
  const counts={agendado:filtered.filter(r=>r.status==="agendado").length,confirmado:filtered.filter(r=>r.status==="confirmado").length,concluido:filtered.filter(r=>r.status==="concluido").length,cancelado:filtered.filter(r=>r.status==="cancelado").length};
  return <AppShell>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Relatórios e indicadores</h1><p className="text-sm text-muted-foreground">Resumo de consultas e valores registrados no período.</p></div><div className="flex gap-2"><button className="btn-success" onClick={()=>exportExcel(filtered)}><FileSpreadsheet className="h-4 w-4"/> Exportar consultas</button><button className="btn-ghost border" onClick={()=>exportFinanceiro(filtered)}>Exportar financeiro</button></div></div>
    <div className="mb-4 grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Mês<input type="month" className="input mt-1" value={month} onChange={e=>setMonth(e.target.value)}/></label><label className="field-icon self-end"><Search className="h-4 w-4"/><input placeholder="Filtrar paciente" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Consultas no período" value={loading?"—":String(filtered.length)}/><Metric label="Valor registrado" value={loading?"—":brl(total)}/><Metric label="Recebido" value={loading?"—":brl(received)}/><Metric label="Em aberto / não pago" value={loading?"—":brl(pending)}/>
    </div>
    <section className="mt-6 rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">Consultas por situação</h2><div className="grid gap-3 sm:grid-cols-4">{Object.entries(counts).map(([k,v])=><div key={k} className="rounded-lg bg-muted/50 p-4"><div className="text-sm capitalize text-muted-foreground">{k}</div><div className="mt-1 text-2xl font-bold">{loading?"—":v}</div></div>)}</div></section>
    <section className="mt-6 overflow-hidden rounded-xl border bg-card"><h2 className="border-b p-4 font-semibold">Detalhamento do período</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr><th className="p-3">Paciente</th><th className="p-3">Data</th><th className="p-3">Status</th><th className="p-3">Valor</th><th className="p-3">Pagamento</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} className="border-t"><td className="p-3 font-medium">{r.nome}</td><td className="p-3">{r.data.split("-").reverse().join("/")}</td><td className="p-3 capitalize">{r.status}</td><td className="p-3">{brl(r.valor??0)}</td><td className="p-3">{r.pagStatus==="pago"?"Pago":r.pagStatus==="nao_pago"?"Não pago":"Aguardando"}</td></tr>)}{!loading&&filtered.length===0&&<tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum registro neste período.</td></tr>}</tbody></table></div></section>
  </AppShell>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>}
