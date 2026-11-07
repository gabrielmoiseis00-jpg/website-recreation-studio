import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth";

export const Route = createFileRoute("/configuracoes")({ component: Configuracoes });

type Settings = {
  id: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  logo_url: string;
  timezone: string;
  appointment_duration_minutes: number;
};
const empty: Settings = {
  id: "", name: "", cnpj: "", email: "", phone: "", address: "", logo_url: "",
  timezone: "America/Rio_Branco", appointment_duration_minutes: 30,
};

function Configuracoes() {
  const [settings, setSettings] = useState<Settings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sessão expirada.");
        if (user.papel !== "Suporte" && user.permissions?.settings?.view !== true) {
          throw new Error("Você não tem permissão para visualizar as configurações.");
        }
        const supabase = createClient();
        let query = supabase.from("clinics")
          .select("id,name,cnpj,email,phone,address,logo_url,timezone,appointment_duration_minutes");
        if (user.clinicId) query = query.eq("id", user.clinicId);
        else if (user.papel === "Suporte") {
          const selected = window.localStorage.getItem("storbem-support-clinic-id");
          if (!selected) throw new Error("Selecione um consultório no cabeçalho para editar as configurações.");
          query = query.eq("id", selected);
        }
        const { data, error } = await query.limit(1);
        if (error) throw error;
        if (!data?.length) throw new Error("Nenhuma clínica selecionada ou vinculada foi encontrada.");
        const row = data[0];
        if (active) setSettings({
          id: row.id, name: row.name ?? "", cnpj: row.cnpj ?? "", email: row.email ?? "",
          phone: row.phone ?? "", address: row.address ?? "", logo_url: row.logo_url ?? "",
          timezone: row.timezone ?? "America/Rio_Branco",
          appointment_duration_minutes: row.appointment_duration_minutes ?? 30,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar as configurações.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user || (user.papel !== "Suporte" && user.permissions?.settings?.edit !== true)) {
        throw new Error("Você não tem permissão para alterar as configurações.");
      }
      const cnpjDigits = settings.cnpj.replace(/\\D/g, "");
      if (cnpjDigits && cnpjDigits.length !== 14) throw new Error("Informe um CNPJ válido com 14 números ou deixe o campo vazio.");
      if (settings.email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(settings.email)) {
        throw new Error("Informe um e-mail válido.");
      }
      const { error } = await createClient().from("clinics").update({
        name: settings.name.trim(), cnpj: cnpjDigits || null, email: settings.email.trim() || null,
        phone: settings.phone.trim() || null, address: settings.address.trim() || null,
        logo_url: settings.logo_url.trim() || null, timezone: settings.timezone,
        appointment_duration_minutes: settings.appointment_duration_minutes,
      }).eq("id", settings.id);
      if (error) {
        if (error.code === "23505") throw new Error("Este CNPJ já está cadastrado em outra clínica.");
        throw error;
      }
      toast.success("Dados institucionais da clínica salvos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  const change = (field: keyof Settings, value: string | number) =>
    setSettings((current) => ({ ...current, [field]: value }));

  return <AppShell>
    <div className="mb-6">
      <h1 className="text-2xl font-bold">Dados da clínica</h1>
      <p className="text-sm text-muted-foreground">Identidade institucional e parâmetros exclusivos deste consultório.</p>
    </div>
    {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : <form onSubmit={save} className="max-w-2xl space-y-4 rounded-xl border bg-card p-6">
      <label className="block text-sm font-medium">Nome da clínica
        <input required minLength={2} maxLength={120} className="input mt-1" value={settings.name} onChange={e => change("name", e.target.value)} />
      </label>
      <label className="block text-sm font-medium">CNPJ
        <input inputMode="numeric" maxLength={18} className="input mt-1" placeholder="00.000.000/0000-00" value={settings.cnpj} onChange={e => change("cnpj", e.target.value)} />
      </label>
      <label className="block text-sm font-medium">E-mail institucional
        <input type="email" className="input mt-1" value={settings.email} onChange={e => change("email", e.target.value)} />
      </label>
      <label className="block text-sm font-medium">Telefone
        <input className="input mt-1" value={settings.phone} onChange={e => change("phone", e.target.value)} placeholder="Telefone de contato" />
      </label>
      <label className="block text-sm font-medium">Endereço
        <input className="input mt-1" value={settings.address} onChange={e => change("address", e.target.value)} placeholder="Endereço completo" />
      </label>
      <label className="block text-sm font-medium">Logotipo (URL HTTPS)
        <input type="url" pattern="https://.*" className="input mt-1" value={settings.logo_url} onChange={e => change("logo_url", e.target.value)} placeholder="https://..." />
      </label>
      <label className="block text-sm font-medium">Fuso horário
        <select className="input mt-1" value={settings.timezone} onChange={e => change("timezone", e.target.value)}>
          <option value="America/Rio_Branco">Rio Branco (UTC−5)</option>
          <option value="America/Manaus">Manaus (UTC−4)</option>
          <option value="America/Sao_Paulo">Brasília / São Paulo (UTC−3)</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Duração padrão da consulta (minutos)
        <input type="number" min={5} max={240} step={5} required className="input mt-1" value={settings.appointment_duration_minutes} onChange={e => change("appointment_duration_minutes", Number(e.target.value))} />
      </label>
      <div className="flex justify-end">
        <button disabled={saving} className="btn-primary">{saving ? "Salvando…" : "Salvar dados da clínica"}</button>
      </div>
    </form>}
  </AppShell>;
}
