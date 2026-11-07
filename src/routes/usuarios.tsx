import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import {
  createManagedUser, listManagedUsers, setManagedUserActive,
  getManagedUserPermissions, setManagedUserPermissions, getMyManagedPermissions, updateManagedUser, type UserPermissions,
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
  const [myUserId, setMyUserId] = useState("");
  const [myPermissions, setMyPermissions] = useState<UserPermissions>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ username: "", email: "", password: "", role: "secretaria" as Role, active: true });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editPermissions, setEditPermissions] = useState<UserPermissions>({});
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
      setMyUserId(ownAccess.userId);
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

  const openEditUser = async (user: ManagedUser) => {
    setEditingUser(user);
    setEditForm({ username: user.username, email: user.email, password: "", role: user.role === "suporte" ? "secretaria" : user.role, active: user.active });
    setShowEditPassword(false);
    setPermissionsLoading(true);
    try { setEditPermissions(await getManagedUserPermissions({ data: { userId: user.id } })); }
    catch (error) { setEditingUser(null); toast.error(error instanceof Error ? error.message : "Não foi possível carregar as permissões."); }
    finally { setPermissionsLoading(false); }
  };

  const submitEditUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await updateManagedUser({ data: {
        userId: editingUser.id,
        username: editForm.username,
        email: editForm.email,
        password: editForm.password,
        role: editForm.role,
        active: editForm.active,
        permissions: editPermissions,
      } });
      toast.success("Dados do usuário atualizados com sucesso.");
      setEditingUser(null);
      setEditForm({ username: "", email: "", password: "", role: "secretaria", active: true });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o usuário.");
    } finally { setSaving(false); }
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
          {myRole === "suporte" ? "Gerencie os usuários da Clínica Storbem." : "Gerencie usuários e permissões da sua clínica. Você pode configurar todas as áreas e ações dos usuários sob sua administração."}
        </p>
      </div>
      {(myRole === "suporte" || myRole === "medico") && <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Suas permissões — {myRole === "suporte" ? "Suporte" : "Médico"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {myRole === "suporte"
              ? "Sua conta possui acesso total ao sistema."
              : "Sua conta de Médico tem acesso administrativo completo à clínica e pode configurar todas as permissões da Secretária e da Aplicação."}
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
        <div className="relative">
          <input className="input w-full pr-12" required type={showCreatePassword ? "text" : "password"} minLength={12} autoComplete="new-password" placeholder="Senha (mínimo 12 caracteres)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button type="button" aria-label={showCreatePassword ? "Ocultar senha" : "Mostrar senha"} title={showCreatePassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-2 flex items-center px-2 text-muted-foreground" onClick={() => setShowCreatePassword((value) => !value)}>
            {showCreatePassword ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 9 4 10 7-0.4 1.2-1.4 2.6-2.8 3.7M6.2 6.2C3.8 7.5 2.4 9.5 2 12c1 3 5 7 10 7 1.3 0 2.5-.3 3.6-.8"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          <option value="medico">Médico</option>
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
                  {user.id !== myUserId && user.role !== "suporte" && <><button type="button" aria-label={`Editar usuário ${user.username}`} title="Editar usuário" className="btn-ghost inline-flex items-center justify-center rounded-lg border p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void openEditUser(user)}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4Z"/></svg></button></>}
                  {user.id !== myUserId && user.role !== "suporte" && (myRole === "suporte" || user.role === "secretaria" || user.role === "aplicacao") && <button type="button" className={user.active ? "rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50" : "rounded-lg border border-green-300 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50"} onClick={() => void toggleActive(user)}>
                    {user.active ? "Bloquear acesso" : "Ativar usuário"}
                  </button>}
                </div>
              </td>
            </tr>)}</tbody>
          </table></div>}
      </section>

      {editingUser && <section className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">Editar usuário: {editingUser.username}</h2>
          <p className="text-sm text-muted-foreground">Edite os dados de acesso, perfil, situação e permissões. Deixe a senha vazia para manter a atual.</p>
        </div>
        <form onSubmit={submitEditUser} className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Nome de usuário
            <input className="input w-full" required minLength={2} maxLength={80} value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm font-medium">E-mail de acesso
            <input className="input w-full" required type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm font-medium">Perfil
            <select className="input w-full" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
              <option value="medico">Médico</option>
              <option value="secretaria">Secretária</option><option value="aplicacao">Aplicação</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
            <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} /> Conta ativa
          </label>
          <label className="space-y-1 text-sm font-medium">Nova senha (opcional)
            <div className="relative">
              <input className="input w-full pr-12" type={showEditPassword ? "text" : "password"} minLength={12} maxLength={128} autoComplete="new-password" placeholder="Deixe vazio para manter a senha atual" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
              <button type="button" aria-label={showEditPassword ? "Ocultar senha" : "Mostrar senha"} title={showEditPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-2 flex items-center px-2 text-muted-foreground" onClick={() => setShowEditPassword((value) => !value)}>
                {showEditPassword ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 9 4 10 7-0.4 1.2-1.4 2.6-2.8 3.7M6.2 6.2C3.8 7.5 2.4 9.5 2 12c1.2 3 5 7 10 7 1.3 0 2.5-.3 3.6-.8"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>}
              </button>
            </div>
          </label>
          <div className="md:col-span-2 space-y-4 rounded-2xl border bg-muted/20 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold tracking-tight">Permissões de acesso</h3>
                <p className="mt-1 text-sm text-muted-foreground">Escolha exatamente quais áreas e ações este usuário poderá utilizar.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100" onClick={() => setEditPermissions(Object.fromEntries(areas.map((area) => [area.key, Object.fromEntries(area.actions.map((action) => [action, true]))])))}><span aria-hidden="true">✓</span> Liberar tudo</button>
                <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 shadow-sm transition hover:bg-rose-100" onClick={() => setEditPermissions(Object.fromEntries(areas.map((area) => [area.key, Object.fromEntries(area.actions.map((action) => [action, false]))])))}><span aria-hidden="true">×</span> Bloquear tudo</button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {areas.map((area, index) => {
                const enabledCount = area.actions.filter((action) => editPermissions[area.key]?.[action] === true).length;
                const totalCount = area.actions.length;
                const areaEnabled = editPermissions[area.key]?.view === true;
                return <div key={area.key} className="overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold">{area.label}</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">{enabledCount} de {totalCount} permissões liberadas</p>
                      </div>
                    </div>
                    <span className={enabledCount === totalCount ? "shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800" : enabledCount > 0 ? "shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800" : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"}>
                      {enabledCount === totalCount ? "Completo" : enabledCount > 0 ? "Parcial" : "Bloqueado"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                    {area.actions.map((action) => <label key={action} className={editPermissions[area.key]?.[action] === true ? "flex cursor-pointer items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-xs font-medium text-foreground transition hover:border-primary/50" : "flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-muted/50"}>
                      <input type="checkbox" className="h-4 w-4 shrink-0 rounded accent-primary" checked={editPermissions[area.key]?.[action] === true} onChange={(e) => setEditPermissions((current) => ({ ...current, [area.key]: { ...current[area.key], [action]: e.target.checked } }))} />
                      <span>{actionLabel[action]}</span>
                    </label>)}
                  </div>
                  {area.actions.length > 1 && <div className="border-t px-4 py-2">
                    <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => setEditPermissions((current) => ({ ...current, [area.key]: Object.fromEntries(area.actions.map((action) => [action, true])) }))}>Liberar todas nesta área</button>
                    <span className="px-2 text-muted-foreground">·</span>
                    <button type="button" className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline" onClick={() => setEditPermissions((current) => ({ ...current, [area.key]: Object.fromEntries(area.actions.map((action) => [action, false])) }))}>Bloquear área</button>
                  </div>}
                </div>;
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button disabled={saving || permissionsLoading} className="btn-primary">{saving ? "Salvando..." : "Salvar todas as alterações"}</button>
            <button type="button" disabled={saving} onClick={() => setEditingUser(null)} className="btn-ghost border px-4 py-2">Cancelar</button>
          </div>
        </form>
      </section>}

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
