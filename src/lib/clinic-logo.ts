import { createClient } from "@/lib/supabase/client";

const BUCKET = "clinic-logos";
const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadClinicLogo(file: File, clinicId: string): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Escolha uma imagem PNG, JPG, WEBP ou SVG.");
  }
  if (file.size > MAX_LOGO_SIZE) {
    throw new Error("O logotipo deve ter no máximo 2 MB.");
  }
  const extensionByType: Record<string, string> = {
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg",
  };
  const path = `${clinicId}/${crypto.randomUUID()}.${extensionByType[file.type]}`;
  const { data, error } = await createClient().storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (error) throw new Error("Não foi possível enviar o logotipo: " + error.message);
  return createClient().storage.from(BUCKET).getPublicUrl(data.path).data.publicUrl;
}
