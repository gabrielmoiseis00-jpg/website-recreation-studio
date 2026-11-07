import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import {
  createManagedUser, listManagedUsers, setManagedUserActive,
  getManagedUserPermissions, setManagedUserPermissions, type UserPermissions,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>({});
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "secretaria" as Role });

  const refresh = async () => {
    setLoading(true);
    try {
      const current = await getCurrentUser();
      if (!current || (current.papel !== "Suporte" && current.papel !== "Médico")) {
        setMyRole(null); throw new Error("Acesso permitido somente para Suporte e Médico.");
      }
      setMyRole(current.papel === "Suporte" ? "suporte" : "medico");
      setUsers(await listManagedUsers() as ManagedUser[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os usuários.");
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
      {myRole === "suporte" && <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Suas permissões — Suporte</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sua conta possui acesso total ao sistema. Todas as áreas e operações estão liberadas automaticamente.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {areas.map((area) => <div key={area.key} className="rounded-lg border p-3">
            <h3 className="font-medium">{area.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{area.actions.map((action) => actionLabel[action]).join(" · ")}</p>
            <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-green-700">✓ Acesso liberado</span>
          </div>)}
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
        {loading ? <p className="p-6 text-sm text-muted-foreground">Carregando...</p> : users.length === 0
          ? <p className="p-6 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted text-left text-muted-foreground"><tr>
              <th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th>
              {myRole === "suporte" && <th className="p-3">Clínica</th>}
              <th className="p-3">Situação</th><th className="p-3">Ações</th>
            </tr></thead>
            <tbody>{users.map((user) => <tr key={user.id} className="border-t">
              <td className="p-3 font-medium">{user.username}</td><td className="p-3">{user.email}</td><td className="p-3">{roleLabel[user.role]}</td>
              {myRole === "suporte" && <td className="p-3">{user.clinicName}</td>}
              <td className="p-3">{user.active ? "Ativo" : "Bloqueado"}</td>
              <td className="flex flex-wrap gap-2 p-3">
                {user.role !== "suporte" && (myRole === "suporte" || user.role === "secretaria" || user.role === "aplicacao") && <button className="btn-ghost border px-3 py-1" onClick={() => void openPermissions(user)}>Permissões</button>}
                {user.role !== "suporte" && <button className="btn-ghost border px-3 py-1" onClick={() => void toggleActive(user)}>{user.active ? "Bloquear" : "Reativar"}</button>}
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
        {permissionsLoading ? <p>Carregando permissões...</p> : <div className="space-y-3">
          {areas.map((area) => <div key={area.key} className="rounded-lg border p-3">
            <h3 className="mb-2 font-medium">{area.label}</h3>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {area.actions.map((action) => <label key={action} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={permissions[area.key]?.[action] === true}
                  onChange={(e) => changePermission(area.key, action, e.target.checked)} />
                {actionLabel[action]}
              </label>)}
            </div>
          </div>)}
        </div>}
        <div className="flex flex-wrap gap-2">
          <button disabled={saving || permissionsLoading} onClick={() => void savePermissions()} className="btn-primary">{saving ? "Salvando..." : "Salvar permissões"}</button>
          <button disabled={saving} onClick={() => setEditing(null)} className="btn-ghost border px-4 py-2">Cancelar</button>
        </div>
      </section>}
      <p className="text-xs text-muted-foreground">As senhas são gerenciadas pelo Supabase Auth e nunca ficam visíveis nesta tela. O bloqueio impede novos acessos sem apagar o histórico do usuário.</p>
    </div>
  );
}
