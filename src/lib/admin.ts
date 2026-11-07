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
    .select("id, username, role, clinic_id, active, permissions")
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

export const getMyManagedPermissions = createServerFn({ method: "GET" }).handler(async () => {
  const { profile } = await getAdminContext();
  return {
    userId: profile.id as string,
    role: profile.role as Role,
    permissions: (profile.permissions ?? {}) as UserPermissions,
  };
});

export const listManagedUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { admin, profile } = await getAdminContext();
  let query = admin.from("profiles").select("id, username, role, active, clinic_id, created_at");
  if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id);
  const { data: profiles, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // Dados auxiliares não podem impedir a lista de usuários de aparecer.
  // A consulta principal de profiles é suficiente para exibir e administrar os acessos.
  const [{ data: authUsers, error: authUsersError }, { data: clinics }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("clinics").select("id, name"),
  ]);
  if (authUsersError) {
    throw new Error("Falha na autenticação administrativa do Supabase. Verifique se SUPABASE_SERVICE_ROLE_KEY contém a chave service_role do mesmo projeto Supabase usado pelo sistema. Detalhe: " + authUsersError.message);
  }
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

const createClinicSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cnpj: z.string().trim().max(18).optional().default(""),
  email: z.string().trim().email().optional().or(z.literal("")).default(""),
  phone: z.string().trim().max(40).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  logo_url: z.string().trim().url().optional().or(z.literal("")).default(""),
});
export const createManagedClinic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createClinicSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    if (profile.role !== "suporte") throw new Error("Somente Suporte pode cadastrar consultórios.");
    const { data: clinic, error } = await admin.from("clinics")
      .insert({
        name: data.name.trim(),
        cnpj: data.cnpj.replace(/\\D/g, "") || null,
        email: data.email.trim().toLowerCase() || null,
        phone: data.phone.trim() || null,
        address: data.address.trim() || null,
        logo_url: data.logo_url.trim() || null,
      }).select("id, name").single();
    if (error || !clinic) throw new Error(error?.message ?? "Não foi possível cadastrar o consultório.");
    return clinic;
  });

const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
  role: z.enum(["medico", "secretaria", "aplicacao"]),
  clinicId: z.string().uuid().optional(),
});

export const createManagedUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile } = await getAdminContext();
    let clinicId = profile.clinic_id as string | null;

    if (profile.role === "suporte") {
      if (!data.clinicId) throw new Error("Selecione o consultório ao qual este usuário será vinculado.");
      const { data: clinic, error: clinicError } = await admin.from("clinics")
        .select("id").eq("id", data.clinicId).maybeSingle();
      if (clinicError) throw new Error(clinicError.message);
      if (!clinic) throw new Error("O consultório selecionado não existe.");
      clinicId = clinic.id as string;
    } else if (!clinicId) {
      throw new Error("Sua conta não está vinculada a um consultório.");
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

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().max(128).optional().default(""),
  role: z.enum(["medico", "secretaria", "aplicacao"]),
  active: z.boolean(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())),
});

export const updateManagedUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    if (data.userId === userId) throw new Error("Por segurança, não altere sua própria conta por esta tela.");

    let query = admin.from("profiles").select("id, role, clinic_id").eq("id", data.userId);
    if (profile.role !== "suporte") {
      query = query.eq("clinic_id", profile.clinic_id).neq("role", "suporte");
    }
    const { data: target, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!target || target.role === "suporte") throw new Error("Usuário não encontrado ou sem permissão para edição.");

    const allowedAreas = new Set<string>(permissionAreas);
    const allowedActions = new Set<string>(permissionActions);
    for (const [area, actions] of Object.entries(data.permissions)) {
      if (!allowedAreas.has(area)) throw new Error("Área de permissão inválida.");
      for (const [action, enabled] of Object.entries(actions)) {
        if (!allowedActions.has(action) || typeof enabled !== "boolean") throw new Error("Ação de permissão inválida.");
      }
    }
    const normalized: UserPermissions = {};
    for (const area of permissionAreas) {
      normalized[area] = {};
      for (const action of permissionActions) normalized[area][action] = data.permissions[area]?.[action] === true;
    }

    const authUpdates: { email?: string; email_confirm?: boolean; password?: string } = {};
    if (data.email.trim().toLowerCase() !== "") authUpdates.email = data.email.trim().toLowerCase();
    authUpdates.email_confirm = true;
    if (data.password.trim()) {
      if (data.password.length < 12) throw new Error("A nova senha deve ter pelo menos 12 caracteres.");
      authUpdates.password = data.password;
    }
    const { error: authUpdateError } = await admin.auth.admin.updateUserById(target.id, authUpdates);
    if (authUpdateError) throw new Error("Não foi possível atualizar e-mail/senha: " + authUpdateError.message);

    const { error: profileError } = await admin.from("profiles").update({
      username: data.username.trim(),
      role: data.role,
      active: data.active,
      permissions: normalized,
    }).eq("id", target.id);
    if (profileError) throw new Error("E-mail/senha atualizados, mas os dados do perfil não foram salvos: " + profileError.message);

    return { success: true };
  });

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });
export const setManagedUserActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => activeSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    if (data.userId === userId) throw new Error("Você não pode bloquear sua própria conta.");
    let query = admin.from("profiles").update({ active: data.active }).eq("id", data.userId);
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).neq("role", "suporte");
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
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).neq("role", "suporte");
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
    if (profile.role !== "suporte") query = query.eq("clinic_id", profile.clinic_id).neq("role", "suporte");
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


const deleteUserSchema = z.object({ userId: z.string().uuid() });
export const deleteManagedUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deleteUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    if (data.userId === userId) throw new Error("Você não pode excluir sua própria conta.");
    if (profile.role !== "suporte" && profile.permissions?.users?.delete !== true) {
      throw new Error("Sua conta não tem permissão para excluir usuários.");
    }

    let query = admin.from("profiles").select("id, role, clinic_id").eq("id", data.userId);
    if (profile.role !== "suporte") {
      query = query.eq("clinic_id", profile.clinic_id).neq("role", "suporte");
    }
    const { data: target, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!target || target.role === "suporte") throw new Error("Usuário não encontrado ou sem permissão para exclusão.");

    const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
    if (deleteError) throw new Error("Não foi possível excluir a conta: " + deleteError.message);
    return { success: true };
  });

const deleteClinicSchema = z.object({
  clinicId: z.string().uuid(),
  adminUsername: z.string().trim().min(2).max(80),
  adminPassword: z.string().min(1).max(128),
  confirmClinicName: z.string().trim().min(2).max(120),
});
export const deleteManagedClinic = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deleteClinicSchema.parse(input))
  .handler(async ({ data }) => {
    const { admin, profile, userId } = await getAdminContext();
    if (profile.role !== "suporte") throw new Error("Somente Suporte pode excluir consultórios.");

    const { data: authAccount, error: authAccountError } = await admin.auth.admin.getUserById(userId);
    if (authAccountError || !authAccount.user?.email) {
      throw new Error("Não foi possível validar a conta administrativa. Entre novamente.");
    }
    // Aceita o nome de usuário do perfil ou o e-mail da própria conta autenticada.
    // A autorização continua vinculada ao ID da sessão e à role Suporte.
    const suppliedIdentity = data.adminUsername.trim().toLowerCase();
    const metadata = authAccount.user.user_metadata ?? {};
    const validIdentities = [
      profile.username,
      authAccount.user.email,
      typeof metadata.username === "string" ? metadata.username : "",
      typeof metadata.user_name === "string" ? metadata.user_name : "",
    ].map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
    if (!validIdentities.includes(suppliedIdentity)) {
      throw new Error("Informe o nome de usuário cadastrado ou o e-mail da conta Suporte conectada.");
    }
    const url = process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new Error("A chave pública do Supabase não está configurada no servidor para validar a senha.");
    }
    const verificationClient = createSupabaseClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error: passwordError } = await verificationClient.auth.signInWithPassword({
      email: authAccount.user.email,
      password: data.adminPassword,
    });
    if (passwordError) throw new Error("Senha do administrador incorreta. Nenhuma exclusão foi realizada.");

    const { data: clinic, error: clinicError } = await admin.from("clinics")
      .select("id, name").eq("id", data.clinicId).maybeSingle();
    if (clinicError) throw new Error(clinicError.message);
    if (!clinic) throw new Error("Consultório não encontrado.");
    if (data.confirmClinicName !== clinic.name) {
      throw new Error("O nome digitado não corresponde exatamente ao consultório. Nenhuma exclusão foi realizada.");
    }

    const checks = await Promise.all([
      { label: "usuários", promise: admin.from("profiles").select("id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
      { label: "pacientes", promise: admin.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
      { label: "agendamentos", promise: admin.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
      { label: "evoluções", promise: admin.from("patient_weekly_progress").select("id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
      { label: "lançamentos financeiros", promise: admin.from("appointment_finances").select("appointment_id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
      { label: "prontuários", promise: admin.from("medical_records").select("id", { count: "exact", head: true }).eq("clinic_id", data.clinicId) },
    ].map(async ({ label, promise }) => ({ label, result: await promise })));
    const failed = checks.find(({ result }) => result.error);
    if (failed?.result.error) {
      const dbError = failed.result.error as { message?: string; details?: string; hint?: string; code?: string };
      const detail = [
        dbError.message,
        dbError.details,
        dbError.hint,
        dbError.code ? "Código: " + dbError.code : "",
      ].filter(Boolean).join(" | ") || JSON.stringify(failed.result.error) || "O Supabase não retornou detalhes do erro.";
      throw new Error("Falha ao verificar " + failed.label + ": " + detail);
    }
    const occupied = checks.map(({ label, result }) => ({ label, count: result.count ?? 0 }))
      .filter((item) => item.count > 0);
    if (occupied.length) {
      throw new Error("Este consultório ainda possui " + occupied.map((item) => item.count + " " + item.label).join(", ") + ". Remova ou transfira os dados necessários antes de excluir a clínica. Os registros clínicos não serão apagados automaticamente.");
    }

    const { error: deleteError } = await admin.from("clinics").delete().eq("id", data.clinicId);
    if (deleteError) throw new Error("Não foi possível excluir o consultório: " + deleteError.message);
    return { success: true, clinicName: clinic.name };
  });
