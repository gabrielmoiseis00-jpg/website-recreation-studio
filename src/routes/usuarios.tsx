import { createFileRoute } from "@tanstack/react-router";
import { Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getUser, listContas, saveContas, type Conta } from "@/lib/store";

export const Route = createFileRoute("/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — Sistema de Agendamentos Dr. Ricardo" },
      { name: "description", content: "Cadastro de usuários e senhas do sistema." },
      { property: "og:title", content: "Usuários — Dr. Ricardo" },
      { property: "og:description", content: "Gerencie quem acessa o sistema." },
    ],
  }),
  component: () => <AppShell medicoOnly><Usuarios /></AppShell>,
});

function Usuarios() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [n, setN] = useState<Conta>({ usuario: "", senha: "", papel: "Aplicação" });
  const [show, setShow] = useState(false);
  useEffect(() => setContas(listContas()), []);
  const me = getUser()?.usuario;
  const save = (c: Conta[]) => { saveContas(c); setContas(c); };
  const upd = (i: number, p: Partial<Conta>) => save(contas.map((c, j) => (j === i ? { ...c, ...p } : c)));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Usuários</h1>
      <form
        className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const usuario = n.usuario.trim().toLowerCase();
          if (!usuario || !n.senha) { toast.error("Preencha usuário e senha"); return; }
          if (contas.some((c) => c.usuario === usuario)) { toast.error("Esse usuário já existe"); return; }
          save([...contas, { ...n, usuario }]);
          setN({ usuario: "", senha: "", papel: "Aplicação" });
          toast.success("Usuário criado");
        }}
      >
        <input className="input" placeholder="Usuário" value={n.usuario} onChange={(e) => setN({ ...n, usuario: e.target.value })} />
        <input className="input" placeholder="Senha" value={n.senha} onChange={(e) => setN({ ...n, senha: e.target.value })} />
        <select className="input" value={n.papel} onChange={(e) => setN({ ...n, papel: e.target.value as Conta["papel"] })}>
          <option>Médico</option><option>Secretária</option><option>Aplicação</option>
        </select>
        <button className="btn-primary"><UserPlus className="h-4 w-4" /> Adicionar</button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="flex justify-end p-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Mostrar senhas
          </label>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y bg-muted text-left text-muted-foreground">
            <tr><th className="p-3">Usuário</th><th className="p-3">Senha</th><th className="p-3">Acesso</th><th /></tr>
          </thead>
          <tbody>
            {contas.map((c, i) => (
              <tr key={c.usuario} className="border-b last:border-0">
                <td className="p-3 font-medium">{c.usuario}</td>
                <td className="p-3"><input className="input" type={show ? "text" : "password"} value={c.senha} onChange={(e) => upd(i, { senha: e.target.value })} /></td>
                <td className="p-3">
                  <select className="input" value={c.papel} disabled={c.usuario === me} onChange={(e) => upd(i, { papel: e.target.value as Conta["papel"] })}>
                    <option>Médico</option><option>Secretária</option><option>Aplicação</option>
                  </select>
                </td>
                <td className="p-3 text-right">
                  {c.usuario !== me && (
                    <button aria-label="Excluir usuário" className="rounded-md p-2 text-destructive hover:bg-accent"
                      onClick={() => { if (confirm(`Excluir ${c.usuario}?`)) save(contas.filter((_, j) => j !== i)); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Médico e Secretária têm acesso total (incluindo Financeiro). Aplicação só gerencia pacientes e agendamentos.</p>
    </div>
  );
}
