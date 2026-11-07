import { createClient } from "@/lib/supabase/client";
import type { User } from "@/lib/store";

type Profile = {
  username: string;
  role: "medico" | "secretaria" | "aplicacao";
  active: boolean;
};

function toUser(profile: Profile): User {
  const papel = {
    medico: "Médico",
    secretaria: "Secretária",
    aplicacao: "Aplicação",
  } as const;

  return { usuario: profile.username, papel: papel[profile.role] };
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
    throw new Error("Usuário sem perfil ativo. Solicite ao médico responsável a liberação do acesso.");
  }

  return user;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("username, role, active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return toUser(data as Profile);
}

export async function logout() {
  const { error } = await createClient().auth.signOut();
  if (error) throw error;
}
