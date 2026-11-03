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
  valor?: number;
  pagStatus?: PagStatus;
  metodo?: Metodo;
  comprovante?: string | undefined;
  comprovanteNome?: string | undefined;
  pagData?: string;
};
export type PagStatus = "pago" | "nao_pago" | "aguardando";
export type Metodo = "" | "pix" | "dinheiro" | "credito" | "debito" | "boleto" | "convenio" | "transferencia";
export const PAG_LABEL: Record<PagStatus, string> = { pago: "Pago", nao_pago: "Não pago", aguardando: "Aguardando" };
export const METODO_LABEL: Record<Metodo, string> = { "": "—", pix: "Pix", dinheiro: "Dinheiro", credito: "Cartão de crédito", debito: "Cartão de débito", boleto: "Boleto", convenio: "Convênio", transferencia: "Transferência" };
export const isAdmin = (u: User | null) => !!u && (u.papel === "Médico" || u.papel === "Secretária");
export type User = { usuario: string; papel: "Médico" | "Secretária" | "Aplicação" };

const USERS: Record<string, { senha: string; papel: User["papel"] }> = {
  medico: { senha: "medico123", papel: "Médico" },
  secretaria: { senha: "secretaria123", papel: "Secretária" },
  aplicacao: { senha: "aplicacao123", papel: "Aplicação" },
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

export const brl = (n = 0) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function exportFinanceiro(rows: Agendamento[]) {
  const head = ["Paciente", "Data consulta", "Valor", "Status", "Método", "Data pagamento", "Comprovante"];
  const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows.map((r) => [r.nome, fmtDate(r.data), (r.valor ?? 0).toFixed(2).replace(".", ","), PAG_LABEL[r.pagStatus ?? "aguardando"], METODO_LABEL[r.metodo ?? ""], fmtDate(r.pagData ?? ""), r.comprovante ? "Sim" : "Não"])]
    .map((l) => l.map(esc).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = "financeiro.csv";
  a.click();
}
