import { createClient } from "@/lib/supabase/client";
import type { User } from "@/lib/store";

type Profile = {
  username: string;
  role: "suporte" | "medico" | "secretaria" | "aplicacao";
  active: boolean;
  clinic_id: string | null;
};

function toUser(profile: Profile): User {
  const papel = {
    suporte: "Suporte",
    medico: "Médico",
    secretaria: "Secretária",
    aplicacao: "Aplicação",
  } as const;

  return { usuario: profile.username, papel: papel[profile.role], clinicId: profile.clinic_id ?? undefined };
}

export async function login(email: string, password: string): Promise<User> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw new Error("E-mail ou senha inválidos.");

  const user = await getCurrentUser();
  if (!user) {
    await supabase.auth.signOut();
    throw new Error("Usuário sem perfil ativo. Solicite ao administrador a liberação do acesso.");
  }

  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("username, role, active, clinic_id")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return toUser(data as Profile);
}

export async function logout() {
  const { error } = await createClient().auth.signOut();
  if (error) throw error;
}
