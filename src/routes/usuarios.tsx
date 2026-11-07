import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import {
  createManagedUser, listManagedUsers, setManagedUserActive,
  getManagedUserPermissions, setManagedUserPermissions, getMyManagedPermissions, type UserPermissions,
} from "@/lib/admin";

type Role = "medico" | "secretaria" | "aplicacao";
type ManagedUser = {
  id: string; username: string; email: string; role: "suporte" | Role;
  active: boolean; clinicId: string | null; clinicName: string; createdAt: string;
};
const roleLabel: Record<ManagedUser["role"], string> = {
  suporte: "Suporte", medico: "Médico", secretaria: "Secretária", aplicacao: "Aplicação",
};
const areas = [
  { key: "dashboard", label: "Dashboard / Painel inicial", actions: ["view"] },
  { key: "appointments", label: "Agenda de consultas", actions: ["view", "create", "edit", "delete"] },
  { key: "patients", label: "Pacientes", actions: ["view", "create", "edit", "delete"] },
  { key: "medical_records", label: "Prontuários e histórico clínico", actions: ["view", "create", "edit", "delete"] },
  { key: "clinical_progress", label: "Evolução dos pacientes", actions: ["view", "create", "edit", "delete"] },
  { key: "finance", label: "Financeiro", actions: ["view", "create", "edit", "delete"] },
  { key: "reports", label: "Relatórios e indicadores", actions: ["view"] },
  { key: "receipts", label: "Recibos e comprovantes", actions: ["view", "create", "edit", "delete"] },
  { key: "users", label: "Usuários e permissões", actions: ["view", "create", "edit", "delete", "manage"] },
  { key: "settings", label: "Configurações do sistema", actions: ["view", "edit"] },
] as const;
const actionLabel: Record<string, string> = {
  view: "Visualizar", create: "Criar", edit: "Editar", delete: "Excluir", manage: "Gerenciar permissões",
};

export const Route = createFileRoute("/usuarios")({
  head: () => ({ meta: [
    { title: "Usuários — Sistema de Agendamentos Clínica Storbem" },
    { name: "description", content: "Gerenciamento seguro de usuários e permissões." },
  ] }),
  component: () => <AppShell medicoOnly><Usuarios /></AppShell>,
});

function Usuarios() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [myRole, setMyRole] = useState<"suporte" | "medico" | null>(null);
  const [myPermissions, setMyPermissions] = useState<UserPermissions>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "secretaria" as Role });

  const refresh = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const current = await getCurrentUser();
      if (!current || (current.papel !== "Suporte" && current.papel !== "Médico")) {
        setMyRole(null); throw new Error("Acesso permitido somente para Suporte e Médico.");
      }
      const role = current.papel === "Suporte" ? "suporte" : "medico";
      setMyRole(role);
      const [managedUsers, ownAccess] = await Promise.all([listManagedUsers(), getMyManagedPermissions()]);
      setUsers(managedUsers as ManagedUser[]);
      setMyPermissions(ownAccess.permissions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar os usuários.";
      setLoadError(message);
      toast.error(message);
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true);
    try {
      await createManagedUser({ data: form });
      toast.success("Usuário criado com sucesso.");
      setForm({ username: "", email: "", password: "", role: "secretaria" });
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível criar o usuário."); }
    finally { setSaving(false); }
  };

  const toggleActive = async (user: ManagedUser) => {
    if (!confirm(user.active ? `Bloquear o acesso de ${user.username}?` : `Reativar ${user.username}?`)) return;
    try {
      await setManagedUserActive({ data: { userId: user.id, active: !user.active } });
      toast.success(user.active ? "Usuário bloqueado." : "Usuário reativado."); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível alterar o acesso."); }
  };

  const openPermissions = async (user: ManagedUser) => {
    setEditing(user); setPermissionsLoading(true);
    try { setPermissions(await getManagedUserPermissions({ data: { userId: user.id } })); }
    catch (error) { setEditing(null); toast.error(error instanceof Error ? error.message : "Não foi possível carregar as permissões."); }
    finally { setPermissionsLoading(false); }
  };
  const changePermission = (area: string, action: string, checked: boolean) => {
    setPermissions((current) => ({
      ...current, [area]: { ...current[area], [action]: checked },
    }));
  };
  const toggleAreaAccess = (area: typeof areas[number], enabled: boolean) => {
    setPermissions((current) => ({
      ...current,
      [area.key]: Object.fromEntries(area.actions.map((action) => [
        action, action === "view" ? enabled : (enabled ? current[area.key]?.[action] === true : false),
      ])),
    }));
  };
  const toggleAllPermissions = (enabled: boolean) => {
    setPermissions(Object.fromEntries(areas.map((area) => [
      area.key, Object.fromEntries(area.actions.map((action) => [action, enabled])),
    ])));
  };
  const savePermissions = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await setManagedUserPermissions({ data: { userId: editing.id, permissions } });
      toast.success("Permissões atualizadas com sucesso."); setEditing(null); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar as permissões."); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuários e permissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {myRole === "suporte" ? "Gerencie os usuários da Clínica Storbem." : "Cadastre usuários e configure os acessos da Secretária e da Aplicação."}
        </p>
      </div>
      {(myRole === "suporte" || myRole === "medico") && <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Suas permissões — {myRole === "suporte" ? "Suporte" : "Médico"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {myRole === "suporte"
              ? "Sua conta possui acesso total ao sistema."
              : "Estas são as permissões administrativas da sua conta de Médico. Você pode administrar os usuários vinculados à sua clínica."}
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {areas.map((area) => {
            const allEnabled = myRole === "suporte" || area.actions.every((action) => myPermissions[area.key]?.[action] === true);
            const someEnabled = myRole === "suporte" || area.actions.some((action) => myPermissions[area.key]?.[action] === true);
            return <div key={area.key} className="rounded-lg border p-3">
              <h3 className="font-medium">{area.label}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{area.actions.map((action) => actionLabel[action]).join(" · ")}</p>
              <span className={allEnabled ? "mt-2 inline-flex items-center gap-1 text-sm font-medium text-green-700" : someEnabled ? "mt-2 inline-flex items-center gap-1 text-sm font-medium text-amber-700" : "mt-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"}>
                {allEnabled ? "✓ Todas liberadas" : someEnabled ? "Acesso parcial" : "Sem acesso"}
              </span>
            </div>;
          })}
        </div>
      </section>}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Novo usuário</h2>
        <input className="input" required minLength={2} placeholder="Nome de usuário" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="input" required type="email" placeholder="E-mail de acesso" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" required type="password" minLength={12} autoComplete="new-password" placeholder="Senha (mínimo 12 caracteres)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {myRole === "suporte" && <option value="medico">Médico</option>}
          <option value="secretaria">Secretária</option><option value="aplicacao">Aplicação</option>
        </select>
        <button disabled={saving || loading || !myRole} className="btn-primary md:col-span-2">{saving ? "Salvando..." : "Criar usuário"}</button>
      </form>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4 font-semibold">Contas cadastradas</div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Carregando...</p> : loadError
          ? <div className="space-y-2 p-6"><p className="text-sm font-semibold text-red-700">Não foi possível carregar as contas.</p><p className="text-sm text-red-700">{loadError}</p><button type="button" className="btn-ghost border px-3 py-2" onClick={() => void refresh()}>Tentar novamente</button></div>
          : users.length === 0
            ? <p className="p-6 text-sm text-muted-foreground">A consulta foi concluída, mas não retornou usuários.</p>
            : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground"><tr>
              <th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th>
              {myRole === "suporte" && <th className="p-3">Clínica</th>}
              <th className="p-3">Situação</th><th className="p-3">Ações</th>
            </tr></thead>
            <tbody>{users.map((user) => <tr key={user.id} className="border-t">
              <td className="p-3 font-medium">{user.username}</td><td className="p-3">{user.email}</td><td className="p-3">{roleLabel[user.role]}</td>
              {myRole === "suporte" && <td className="p-3">{user.clinicName}</td>}
              <td className="p-3">
                <span className={user.active ? "inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700" : "inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"}>
                  <span className={user.active ? "h-2 w-2 rounded-full bg-green-600" : "h-2 w-2 rounded-full bg-red-600"} />
                  {user.active ? "Acesso ativo" : "Acesso bloqueado"}
                </span>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {user.role !== "suporte" && (myRole === "suporte" || user.role === "secretaria" || user.role === "aplicacao") && <button type="button" className="btn-ghost border px-3 py-2" onClick={() => void openPermissions(user)}>Configurar permissões</button>}
                  {user.role !== "suporte" && <button type="button" className={user.active ? "rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" : "rounded-lg border border-green-300 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"} onClick={() => void toggleActive(user)}>
                    {user.active ? "Bloquear acesso" : "Ativar usuário"}
                  </button>}
                </div>
              </td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      {editing && <section className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Permissões: {editing.username}</h2>
            <p className="text-sm text-muted-foreground">Perfil: {roleLabel[editing.role]}. Marque os acessos que esta conta poderá utilizar.</p></div>
          <button className="btn-ghost border px-3 py-2" onClick={() => setEditing(null)}>Fechar</button>
        </div>
        {permissionsLoading ? <p>Carregando permissões...</p> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">Acesso geral deste usuário</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-100" onClick={() => toggleAllPermissions(true)}>Liberar todas</button>
              <button type="button" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100" onClick={() => toggleAllPermissions(false)}>Bloquear todas</button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
          {areas.map((area) => {
            const areaEnabled = permissions[area.key]?.view === true;
            return <div key={area.key} className="rounded-xl border bg-background p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div>
                  <h3 className="font-semibold">{area.label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Controle o que este usuário pode fazer nesta área.</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" className="peer sr-only" checked={areaEnabled}
                    onChange={(e) => toggleAreaAccess(area, e.target.checked)} />
                  <span className={areaEnabled ? "relative h-6 w-11 rounded-full bg-primary transition after:absolute after:right-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition" : "relative h-6 w-11 rounded-full bg-muted-foreground/30 transition after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition"} />
                  <span>{areaEnabled ? "Ligado" : "Desligado"}</span>
                </label>
              </div>
              <div className="mt-3 space-y-2">
                {area.actions.map((action) => <label key={action} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/60">
                  <span>{actionLabel[action]}</span>
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={permissions[area.key]?.[action] === true}
                    onChange={(e) => changePermission(area.key, action, e.target.checked)} />
                </label>)}
              </div>
            </div>;
          })}
          </div>
        </>}
        <div className="flex flex-wrap gap-2">
          <button disabled={saving || permissionsLoading} onClick={() => void savePermissions()} className="btn-primary">{saving ? "Salvando..." : "Salvar permissões"}</button>
          <button disabled={saving} onClick={() => setEditing(null)} className="btn-ghost border px-4 py-2">Cancelar</button>
        </div>
      </section>}
      <p className="text-xs text-muted-foreground">As senhas são gerenciadas pelo Supabase Auth e nunca ficam visíveis nesta tela. O bloqueio impede novos acessos sem apagar o histórico do usuário.</p>
    </div>
  );
}
