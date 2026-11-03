export type Status = "agendado" | "confirmado" | "concluido" | "cancelado";
export type Med = { nome: string; tomou: "sim" | "nao" | ""; data: string };
export type Semana = { meds: Med[]; obs: string };
export type Agendamento = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  foto?: string;
  data: string;
  horario: string;
  obs: string;
  status: Status;
  semanas: Semana[];
};
export type User = { usuario: string; papel: "Médico" | "Secretária" };

const USERS: Record<string, { senha: string; papel: User["papel"] }> = {
  medico: { senha: "medico123", papel: "Médico" },
  secretaria: { senha: "secretaria123", papel: "Secretária" },
};

const KEY = "agend_data";
const UKEY = "agend_user";

export function login(usuario: string, senha: string): User | null {
  const u = USERS[usuario.trim().toLowerCase()];
  if (!u || u.senha !== senha) return null;
  const user = { usuario: usuario.trim().toLowerCase(), papel: u.papel };
  localStorage.setItem(UKEY, JSON.stringify(user));
  return user;
}
export const logout = () => localStorage.removeItem(UKEY);
export function getUser(): User | null {
  try { return JSON.parse(localStorage.getItem(UKEY) || "null"); } catch { return null; }
}
export function list(): Agendamento[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function saveAll(a: Agendamento[]) { localStorage.setItem(KEY, JSON.stringify(a)); }
export const get = (id: string) => list().find((a) => a.id === id);
export function upsert(a: Agendamento) {
  const all = list();
  const i = all.findIndex((x) => x.id === a.id);
  if (i >= 0) all[i] = a; else all.push(a);
  saveAll(all);
}
export const remove = (id: string) => saveAll(list().filter((a) => a.id !== id));
export const emptySemanas = (): Semana[] =>
  Array.from({ length: 4 }, () => ({ meds: [{ nome: "", tomou: "", data: "" }], obs: "" }));

export function exportExcel(rows: Agendamento[]) {
  const head = ["Paciente", "Telefone", "E-mail", "Data", "Horário", "Status", "Observações"];
  const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows.map((r) => [r.nome, r.telefone, r.email, fmtDate(r.data), r.horario, r.status, r.obs])]
    .map((l) => l.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "agendamentos.csv";
  a.click();
}
export const fmtDate = (d: string) => (d ? d.split("-").reverse().join("/") : "");
