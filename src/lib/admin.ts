import { createServerFn } from "@tanstack/react-start";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient as createSessionClient } from "@/lib/supabase/server";

type Role = "suporte" | "medico" | "secretaria" | "aplicacao";

async function getAdminContext() {
  const sessionClient = createSessionClient();
  const { data: auth, error: authError } = await sessionClient.auth.getUser();
  if (authError || !auth.user) throw new Error("Sessão expirada. Entre novamente.");

  const { data: profile, error } = await sessionClient
    .from("profiles")
    .select("id, role, clinic_id, active")
    .eq("id", auth.user.id)
    .single();
  if (error || !profile || !profile.active) throw new Error("Perfil ativo não encontrado.");

  if (profile.role !== "suporte" && profile.role !== "medico") {
    throw new Error("Somente Suporte ou Médico pode gerenciar usuários.");
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.VITE_SUPABASE_URL;
  if (!serviceKey || !url) {
    throw new Error("O administrador do sistema precisa configurar SUPABASE_SERVICE_ROLE_KEY no ambiente seguro do servidor.");
  }

  const admin = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { admin, profile, userId: auth.user.id };
}

export const listManagedUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, profile } = await getAdminContext();
  let query = admin.from("profiles").select("id, username, role, active, clinic_id, created_at");
  if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id);
  const { data: profiles, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw new Error(usersError.message);
  const { data: clinics, error: clinicsError } = await admin.from("clinics").select("id, name");
  if (clinicsError) throw new Error(clinicsError.message);
  const emailById = new Map(authUsers.users.map((user) => [user.id, user.email ?? ""]));
  const clinicNameById = new Map((clinics ?? []).map((clinic) => [clinic.id, clinic.name]));
  return (profiles ?? []).map((item) => ({
    id: item.id,
    username: item.username,
    email: emailById.get(item.id) ?? "",
    role: item.role as Role,
    active: item.active,
    clinicId: item.clinic_id,
    clinicName: item.clinic_id ? clinicNameById.get(item.clinic_id) ?? "Consultório" : "Acesso geral",
    createdAt: item.created_at,
  }));
});

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
  role: z.enum(["medico", "secretaria", "aplicacao"]),
  clinicName: z.string().trim().min(2).max(120).optional(),
});

export const createManagedUser = createServerFn({ method: "POST" })
  .inputValidator(createUserSchema)
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    let clinicId = profile.clinic_id as string | null;

    if (profile.role === "suporte") {
      if (data.role !== "medico" || !data.clinicName) {
        throw new Error("Suporte deve cadastrar um médico e informar o nome do consultório.");
      }
      const { data: clinic, error: clinicError } = await admin
        .from("clinics").insert({ name: data.clinicName }).select("id").single();
      if (clinicError || !clinic) throw new Error(clinicError?.message ?? "Não foi possível criar o consultório.");
      clinicId = clinic.id;
    } else if (data.role === "medico") {
      throw new Error("Somente Suporte pode cadastrar outro médico/consultório.");
    }

    if (!clinicId) throw new Error("Sua conta não está vinculada a um consultório.");

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      if (profile.role === "suporte") await admin.from("clinics").delete().eq("id", clinicId);
      throw new Error(createError?.message ?? "Não foi possível criar a conta.");
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      username: data.username.trim(),
      role: data.role,
      active: true,
      clinic_id: clinicId,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      if (profile.role === "suporte") await admin.from("clinics").delete().eq("id", clinicId);
      throw new Error(profileError.message);
    }

    return { success: true };
  });

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });
export const setManagedUserActive = createServerFn({ method: "POST" })
  .inputValidator(activeSchema)
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    if (data.userId === userId) throw new Error("Você não pode bloquear sua própria conta.");
    let query = admin.from("profiles").update({ active: data.active }).eq("id", data.userId);
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id);
    const { data: changed, error } = await query.select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!changed) throw new Error("Usuário não encontrado ou sem permissão.");
    return { success: true };
  });
