import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth";

export const Route = createFileRoute("/configuracoes")({ component: Configuracoes });

type Settings = { id:string; name:string; phone:string; address:string; timezone:string; appointment_duration_minutes:number };
const empty:Settings={id:"",name:"Clínica Storbem",phone:"",address:"",timezone:"America/Rio_Branco",appointment_duration_minutes:30};

function Configuracoes(){
 const [settings,setSettings]=useState<Settings>(empty);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
  try{
   const user=await getCurrentUser();if(!user)throw new Error("Sessão expirada.");
   if(user.papel!=="Suporte"&&user.permissions?.settings?.view!==true)throw new Error("Você não tem permissão para visualizar as configurações.");
   const supabase=createClient();
   let query=supabase.from("clinics").select("id,name,phone,address,timezone,appointment_duration_minutes");
   if(user.clinicId) query=query.eq("id",user.clinicId);
   else if(user.papel==="Suporte") {
    const selected=window.localStorage.getItem("storbem-support-clinic-id");
    if(!selected) throw new Error("Selecione um consultório no cabeçalho para editar as configurações.");
    query=query.eq("id",selected);
   }
   const {data,error}=await query.limit(1);if(error)throw error;
   if(!data?.length)throw new Error("Nenhuma clínica selecionada ou vinculada foi encontrada.");
   const row=data[0];if(active)setSettings({id:row.id,name:row.name,phone:row.phone??"",address:row.address??"",timezone:row.timezone??"America/Rio_Branco",appointment_duration_minutes:row.appointment_duration_minutes??30});
  }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível carregar as configurações.");}
  finally{if(active)setLoading(false);}
 })();return()=>{active=false;};},[]);
 async function save(event:React.FormEvent){event.preventDefault();setSaving(true);try{
  const user=await getCurrentUser();if(!user||(user.papel!=="Suporte"&&user.permissions?.settings?.edit!==true))throw new Error("Você não tem permissão para alterar as configurações.");
  const {error}=await createClient().from("clinics").update({name:settings.name.trim(),phone:settings.phone.trim(),address:settings.address.trim(),timezone:settings.timezone,appointment_duration_minutes:settings.appointment_duration_minutes}).eq("id",settings.id);
  if(error)throw error;toast.success("Configurações da clínica salvas.");
 }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível salvar as configurações.");}finally{setSaving(false);}}
 return <AppShell><div className="mb-6"><h1 className="text-2xl font-bold">Configurações</h1><p className="text-sm text-muted-foreground">Dados institucionais e parâmetros básicos da clínica.</p></div>
 {loading?<p className="text-sm text-muted-foreground">Carregando…</p>:<form onSubmit={save} className="max-w-2xl space-y-4 rounded-xl border bg-card p-6">
  <label className="block text-sm font-medium">Nome da clínica<input required className="input mt-1" value={settings.name} onChange={e=>setSettings({...settings,name:e.target.value})}/></label>
  <label className="block text-sm font-medium">Telefone<input className="input mt-1" value={settings.phone} onChange={e=>setSettings({...settings,phone:e.target.value})} placeholder="Telefone de contato"/></label>
  <label className="block text-sm font-medium">Endereço<input className="input mt-1" value={settings.address} onChange={e=>setSettings({...settings,address:e.target.value})} placeholder="Endereço completo"/></label>
  <label className="block text-sm font-medium">Fuso horário<select className="input mt-1" value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})}><option value="America/Rio_Branco">Rio Branco (UTC−5)</option><option value="America/Manaus">Manaus (UTC−4)</option><option value="America/Sao_Paulo">Brasília / São Paulo (UTC−3)</option></select></label>
  <label className="block text-sm font-medium">Duração padrão da consulta (minutos)<input type="number" min={5} max={240} step={5} required className="input mt-1" value={settings.appointment_duration_minutes} onChange={e=>setSettings({...settings,appointment_duration_minutes:Number(e.target.value)})}/></label>
  <div className="flex justify-end"><button disabled={saving} className="btn-primary">{saving?"Salvando…":"Salvar configurações"}</button></div>
 </form>}
 </AppShell>;
}
