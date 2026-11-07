import { createClient } from "@/lib/supabase/client";
import type { User } from "@/lib/store";
import { lockOfflineVault, prepareOfflineVault, readOfflineRecord, saveOfflineRecord, unlockOfflineVault } from "@/lib/offline-vault";

let offlineUser: User | null = null;
let offlineUserId: string | null = null;
let vaultSessionUser: User | null = null;
let vaultSessionUserId: string | null = null;

type Profile = {
  username: string;
  role: "suporte" | "medico" | "secretaria" | "aplicacao";
  active: boolean;
  clinic_id: string | null;
  permissions: Record<string, Record<string, boolean>> | null;
};

function toUser(profile: Profile): User {
  const papel = {
    suporte: "Suporte",
    medico: "Médico",
    secretaria: "Secretária",
    aplicacao: "Aplicação",
  } as const;

  return { usuario: profile.username, papel: papel[profile.role], clinicId: profile.clinic_id ?? undefined, permissions: profile.permissions ?? {} };
}

export async function login(email: string, password: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();

  // Offline access is allowed only when the browser explicitly reports no
  // network. A server-side credential rejection must never fall back to an
  // old locally cached password.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const userId = await unlockOfflineVault(normalizedEmail, password);
    const cachedUser = await readOfflineRecord<User>(userId, "profile", "current");
    if (!cachedUser) {
      lockOfflineVault(userId);
      throw new Error("Este dispositivo ainda não possui um perfil salvo para acesso offline. Entre online primeiro.");
    }
    offlineUser = cachedUser;
    offlineUserId = userId;
    vaultSessionUser = cachedUser;
    vaultSessionUserId = userId;
    return cachedUser;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) throw new Error("E-mail ou senha inválidos.");

  const user = await getCurrentUser();
  if (!user) {
    await supabase.auth.signOut();
    throw new Error("Usuário sem perfil ativo. Solicite ao administrador a liberação do acesso.");
  }

  offlineUser = null;
  offlineUserId = null;
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user) {
    try {
      await prepareOfflineVault(normalizedEmail, authData.user.id, password);
      await saveOfflineRecord(authData.user.id, "profile", "current", user);
      vaultSessionUser = user;
      vaultSessionUserId = authData.user.id;
      try {
        const dataLayer = await import("@/lib/supabase/data");
        const result = await dataLayer.syncOfflineChanges();
        if (result.synced > 0) console.info(`Sincronização offline: ${result.synced} alteração(ões), ${result.pending} pendente(s).`);
      } catch (syncError) {
        console.warn("Há alterações offline aguardando sincronização.", syncError);
      }
    } catch (vaultError) {
      // Online login must continue working if this browser cannot provide
      // secure local storage. Offline availability will remain disabled.
      console.warn("Não foi possível preparar o acesso offline neste dispositivo.", vaultError);
    }
  }

  return user;
}

