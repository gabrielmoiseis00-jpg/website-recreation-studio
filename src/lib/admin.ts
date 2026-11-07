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
    .select("id, role, clinic_id, active, permissions")
    .eq("id", auth.user.id)
    .single();
  if (error || !profile || !profile.active) throw new Error("Perfil ativo não encontrado.");

  if (profile.role !== "suporte" && profile.role !== "medico") {
    throw new Error("Somente Suporte ou Médico pode gerenciar usuários.");
  }
  if (profile.role === "medico" && (profile.permissions as Record<string, Record<string, boolean>> | null)?.users?.manage !== true) {
    throw new Error("Seu usuário não tem permissão para gerenciar outros usuários.");
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
  if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).in("role", ["secretaria", "aplicacao"]);
  const { data: profiles, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // Dados auxiliares não podem impedir a lista de usuários de aparecer.
  // A consulta principal de profiles é suficiente para exibir e administrar os acessos.
  const [{ data: authUsers }, { data: clinics }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("clinics").select("id, name"),
  ]);
  const emailById = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]));
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


export const listManagedClinics = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, profile } = await getAdminContext();
  if (profile.role !== "suporte") throw new Error("Somente Suporte pode consultar todos os consultórios.");
  const { data, error } = await admin.from("clinics").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

const createClinicSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const createManagedClinic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createClinicSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    if (profile.role !== "suporte") throw new Error("Somente Suporte pode cadastrar consultórios.");
    const { data: clinic, error } = await admin.from("clinics")
      .insert({ name: data.name.trim() }).select("id, name").single();
    if (error || !clinic) throw new Error(error?.message ?? "Não foi possível cadastrar o consultório.");
    return clinic;
  });

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
  role: z.enum(["medico", "secretaria", "aplicacao"]),
});

export const createManagedUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    let clinicId = profile.clinic_id as string | null;

    if (profile.role === "suporte") {
      const { data: clinics, error: clinicsError } = await admin.from("clinics").select("id");
      if (clinicsError) throw new Error(clinicsError.message);
      if (!clinics || clinics.length !== 1) {
        throw new Error("A Clínica Storbem precisa ser a única unidade cadastrada para este sistema.");
      }
      clinicId = clinics[0].id;
      const { error: renameError } = await admin.from("clinics")
        .update({ name: "Clínica Storbem" }).eq("id", clinicId);
      if (renameError) throw new Error(renameError.message);
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
      throw new Error(profileError.message);
    }

    return { success: true };
  });

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });
export const setManagedUserActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => activeSchema.parse(input))
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

const permissionAreas = [
  "dashboard", "appointments", "patients", "medical_records", "clinical_progress",
  "finance", "reports", "receipts", "users", "settings",
] as const;
const permissionActions = ["view", "create", "edit", "delete", "manage"] as const;
export type UserPermissions = Record<string, Record<string, boolean>>;

export const getManagedUserPermissions = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    let query = admin.from("profiles").select("id, role, clinic_id, permissions").eq("id", data.userId);
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).in("role", ["secretaria", "aplicacao"]);
    const { data: target, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!target || target.role === "suporte") throw new Error("Usuário não encontrado ou sem permissão.");
    return (target.permissions ?? {}) as UserPermissions;
  });

const permissionSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});
export const setManagedUserPermissions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => permissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    let query = admin.from("profiles").select("id, role, clinic_id").eq("id", data.userId);
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).in("role", ["secretaria", "aplicacao"]);
    const { data: target, error: targetError } = await query.maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target || target.role === "suporte" || target.id === userId) {
      throw new Error("Você não pode alterar as permissões deste usuário.");
    }

    const allowedAreas = new Set<string>(permissionAreas);
    const allowedActions = new Set<string>(permissionActions);
    for (const [area, actions] of Object.entries(data.permissions)) {
      if (!allowedAreas.has(area)) throw new Error("Área de permissão inválida.");
      for (const [action, enabled] of Object.entries(actions)) {
        if (!allowedActions.has(action) || typeof enabled !== "boolean") throw new Error("Ação de permissão inválida.");
        if (profile.role !== "suporte" && enabled && !(
          profile.role === "medico" && target.clinic_id === profile.clinic_id
        )) throw new Error("Você não pode conceder uma permissão que não administra.");
      }
    }
    const normalized: UserPermissions = {};
    for (const area of permissionAreas) {
      normalized[area] = {};
      for (const action of permissionActions) normalized[area][action] = data.permissions[area]?.[action] === true;
    }
    const { error } = await admin.from("profiles").update({ permissions: normalized }).eq("id", target.id);
    if (error) throw new Error(error.message);
    return { success: true };
  });
