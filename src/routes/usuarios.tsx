import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { createManagedClinic, createManagedUser, listManagedClinics, listManagedUsers, setManagedUserActive } from "@/lib/admin";

type Role = "medico" | "secretaria" | "aplicacao";
type ManagedUser = {
  id: string;
  username: string;
  email: string;
  role: "suporte" | Role;
  active: boolean;
  clinicId: string | null;
  clinicName: string;
  createdAt: string;
};

const roleLabel: Record<ManagedUser["role"], string> = {
  suporte: "Suporte",
  medico: "Médico",
  secretaria: "Secretária",
  aplicacao: "Aplicação",
};

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Sistema de Agendamentos Dr. Ricardo" },
      { name: "description", content: "Gerenciamento seguro de usuários e consultórios." },
    ],
  }),
  component: () => <AppShell medicoOnly><Usuarios /></AppShell>,
});

function Usuarios() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [newClinicName, setNewClinicName] = useState("");
  const [myRole, setMyRole] = useState<"suporte" | "medico" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "", email: "", password: "", role: "medico" as Role, clinicName: "", clinicId: "",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const current = await getCurrentUser();
      if (!current || (current.papel !== "Suporte" && current.papel !== "Médico")) {
        setMyRole(null);
        throw new Error("Acesso permitido somente para Suporte e Médico.");
      }

      // Define o perfil antes de carregar a lista, para que falhas na listagem
      // não façam o Suporte visualizar por engano o formulário de Médico.
      setMyRole(current.papel === "Suporte" ? "suporte" : "medico");

      const rows = await listManagedUsers();
      setUsers(rows as ManagedUser[]);
      if (current.papel === "Suporte") setClinics(await listManagedClinics());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createManagedUser({ data: {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        ...(myRole === "suporte" && form.role === "medico" ? { clinicName: form.clinicName } : {}),
        ...(myRole === "suporte" && form.role !== "medico" ? { clinicId: form.clinicId } : {}),
      } });
      toast.success(myRole === "suporte" ? "Consultório e médico criados com sucesso." : "Usuário criado com sucesso.");
      setForm({ username: "", email: "", password: "", role: myRole === "suporte" ? "medico" : "secretaria", clinicName: "", clinicId: "" });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  const addClinic = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await createManagedClinic({ data: { name: newClinicName } });
      setNewClinicName("");
      toast.success("Consultório cadastrado com sucesso.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar o consultório.");
    }
  };

  const toggleActive = async (user: ManagedUser) => {
    if (!confirm(user.active ? `Bloquear o acesso de ${user.username}?` : `Reativar ${user.username}?`)) return;
    try {
      await setManagedUserActive({ data: { userId: user.id, active: !user.active } });
      toast.success(user.active ? "Usuário bloqueado." : "Usuário reativado.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o acesso.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{myRole === "suporte" ? "Consultórios e usuários" : "Usuários do consultório"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {myRole === "suporte"
            ? "Crie consultórios e cadastre o médico responsável por cada um."
            : "Cadastre secretárias e usuários de aplicação para este consultório."}
        </p>
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">{myRole === "suporte" ? "Novo consultório e médico" : "Novo usuário"}</h2>
        {myRole === "suporte" && form.role === "medico" && (
          <input className="input md:col-span-2" required minLength={2} placeholder="Nome do consultório"
            value={form.clinicName} onChange={(e) => setForm({ ...form, clinicName: e.target.value })} />
        )}
        {myRole === "suporte" && form.role !== "medico" && (
          <select className="input md:col-span-2" required value={form.clinicId}
            onChange={(e) => setForm({ ...form, clinicId: e.target.value })}>
            <option value="">Selecione o consultório</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
            ))}
          </select>
        )}
        <input className="input" required minLength={2} placeholder="Nome de usuário"
          value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="input" required type="email" placeholder="E-mail de acesso"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" required type="password" minLength={12} autoComplete="new-password" placeholder="Senha (mínimo 12 caracteres)"
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {myRole === "suporte" ? <>
            <option value="medico">Médico</option>
            <option value="secretaria">Secretária</option>
            <option value="aplicacao">Aplicação</option>
          </> : <>
            <option value="secretaria">Secretária</option>
            <option value="aplicacao">Aplicação</option>
          </>}
        </select>
        <button disabled={saving || loading || !myRole} className="btn-primary md:col-span-2">
          {saving ? "Salvando..." : myRole === "suporte" && form.role === "medico" ? "Criar consultório e médico" : "Criar usuário"}
        </button>
      </form>

      {myRole === "suporte" && (
        <form onSubmit={addClinic} className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row">
          <input className="input flex-1" required minLength={2} maxLength={120}
            placeholder="Nome do novo consultório"
            value={newClinicName} onChange={(e) => setNewClinicName(e.target.value)} />
          <button className="btn-primary" type="submit">Adicionar consultório</button>
        </form>
      )}

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b p-4 font-semibold">Contas cadastradas</div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Carregando...</p> : users.length === 0
          ? <p className="p-6 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          : <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr><th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th>{myRole === "suporte" && <th className="p-3">Consultório</th>}<th className="p-3">Situação</th><th className="p-3">Ação</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="p-3 font-medium">{user.username}</td>
                    <td className="p-3">{user.email}</td>
                    <td className="p-3">{roleLabel[user.role]}</td>
                    {myRole === "suporte" && <td className="p-3">{user.clinicName}</td>}
                    <td className="p-3">{user.active ? "Ativo" : "Bloqueado"}</td>
                    <td className="p-3">
                      {user.role !== "suporte" && <button className="btn-ghost border px-3 py-1" onClick={() => void toggleActive(user)}>
                        {user.active ? "Bloquear" : "Reativar"}
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </section>
      <p className="text-xs text-muted-foreground">
        As senhas são gerenciadas pelo Supabase Auth e nunca ficam visíveis nesta tela. O bloqueio impede novos acessos sem apagar o histórico do usuário.
      </p>
    </div>
  );
}
