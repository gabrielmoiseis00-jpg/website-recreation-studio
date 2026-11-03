import { Save } from "lucide-react";
import { useState } from "react";

export type PacienteValues = {
  nome: string;
  telefone: string;
  email: string;
  foto: string;
  data: string;
  horario: string;
  obs: string;
};

export function PacienteForm({
  initial,
  submitLabel = "Salvar",
  onSubmit,
  onCancel,
}: {
  initial: PacienteValues;
  submitLabel?: string;
  onSubmit: (v: PacienteValues) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<PacienteValues>(initial);
  const set = (k: keyof PacienteValues) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const onFoto = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setF((p) => ({ ...p, foto: String(r.result) }));
    r.readAsDataURL(file);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f);
      }}
      className="rounded-xl border bg-card p-6"
    >
      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-semibold">Dados do Paciente</h2>
          <Field label="Nome Completo *"><input required className="input" placeholder="Nome completo do paciente" value={f.nome} onChange={set("nome")} /></Field>
          <Field label="Telefone (WhatsApp) *"><input required className="input" placeholder="(00) 00000-0000" value={f.telefone} onChange={set("telefone")} /></Field>
          <Field label="E-mail *"><input required type="email" className="input" placeholder="email@exemplo.com" value={f.email} onChange={set("email")} /></Field>
          <Field label="Foto do Paciente (opcional)">
            <div className="space-y-2">
              {f.foto && (
                <div className="flex items-center gap-3">
                  <img src={f.foto} alt="Foto atual do paciente" className="h-16 w-16 rounded-full object-cover" />
                  <button type="button" onClick={() => setF((p) => ({ ...p, foto: "" }))} className="btn-ghost border text-destructive">Remover foto</button>
                </div>
              )}
              <input type="file" accept="image/*" className="text-sm" onChange={(e) => onFoto(e.target.files?.[0])} />
            </div>
          </Field>
        </section>
        <section className="space-y-4">
          <h2 className="font-semibold">Dados da Consulta</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data *"><input required type="date" className="input" value={f.data} onChange={set("data")} /></Field>
            <Field label="Horário *"><input required type="time" className="input" value={f.horario} onChange={set("horario")} /></Field>
          </div>
          <Field label="Observações"><textarea rows={4} className="input" placeholder="Anote informações adicionais sobre a consulta..." value={f.obs} onChange={set("obs")} /></Field>
        </section>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancelar</button>
        <button className="btn-primary"><Save className="h-4 w-4" /> {submitLabel}</button>
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}</label>;
}
