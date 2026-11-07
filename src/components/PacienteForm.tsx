import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPatientPhotoUrl, uploadPatientPhoto } from "@/lib/supabase/data";

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
  const [fotoPreview, setFotoPreview] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const set = (k: keyof PacienteValues) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    let active = true;
    if (!initial.foto) {
      setFotoPreview("");
      return;
    }
    if (initial.foto.startsWith("blob:") || initial.foto.startsWith("data:") || initial.foto.startsWith("http")) {
      setFotoPreview(initial.foto);
      return;
    }
    getPatientPhotoUrl(initial.foto).then((url) => {
      if (active) setFotoPreview(url);
    }).catch(() => {
      if (active) setFotoPreview("");
    });
    return () => { active = false; };
  }, [initial.foto]);

  const onFoto = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Envie uma foto JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("A foto deve ter no máximo 2 MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const path = await uploadPatientPhoto(file);
      setF((p) => ({ ...p, foto: path }));
      setFotoPreview(URL.createObjectURL(file));
      toast.success("Foto enviada com segurança.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (uploadingPhoto) {
          toast.error("Aguarde o envio da foto terminar.");
          return;
        }
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
              {fotoPreview && (
                <div className="flex items-center gap-3">
                  <img src={fotoPreview} alt="Foto atual do paciente" className="h-16 w-16 rounded-full object-cover" />
                  <button type="button" onClick={() => { setF((p) => ({ ...p, foto: "" })); setFotoPreview(""); }} className="btn-ghost border text-destructive">Remover foto</button>
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" disabled={uploadingPhoto} onChange={(e) => void onFoto(e.target.files?.[0])} />
              <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP; máximo 2 MB. {uploadingPhoto ? "Enviando…" : ""}</p>
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
        <button disabled={uploadingPhoto} className="btn-primary"><Save className="h-4 w-4" /> {uploadingPhoto ? "Enviando foto…" : submitLabel}</button>
      </div>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}</label>;
}
