import { createClient } from "@/lib/supabase/client";
import { getOfflineSessionInfo } from "@/lib/auth";
import { enqueueOfflineChange, listOfflineRecords, listOfflineQueue, removeOfflineQueueItem, deleteOfflineRecord, readOfflineRecord, saveOfflineRecord, updateOfflineQueueItem } from "@/lib/offline-vault";
import {
  emptySemanas,
  type Agendamento,
  type Med,
  type Semana,
} from "@/lib/store";

type PatientRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  photo_path: string | null;
};

type AppointmentRow = {
  id: string;
  patient_id: string;
  appointment_date: string;
  appointment_time: string;
  notes: string;
  status: Agendamento["status"];
};

type ProgressRow = {
  appointment_id: string;
  week_number: number;
  medications: Med[];
  observations: string;
};

type FinanceRow = {
  appointment_id: string;
  amount: number;
  payment_status: NonNullable<Agendamento["pagStatus"]>;
  payment_method: NonNullable<Agendamento["metodo"]>;
  payment_date: string | null;
  receipt_path: string | null;
  receipt_name: string | null;
};

function isOffline(): boolean { return typeof navigator !== "undefined" && !navigator.onLine; }
async function offlineContext() {
  const session = getOfflineSessionInfo();
  if (!session) throw new Error("Entre online neste dispositivo antes de usar o modo offline.");
  return session;
}

async function pendingEntityChanges(
  userId: string,
  entity: "patient" | "appointment" | "medical_record",
): Promise<{ upserts: Set<string>; deletes: Set<string> }> {
  const queue = await listOfflineQueue(userId);
  const upserts = new Set<string>();
  const deletes = new Set<string>();
  for (const item of queue) {
    if (item.entity !== entity) continue;
    const id = (item.payload as { id?: string }).id;
    if (!id) continue;
    if (item.operation === "delete") {
      upserts.delete(id);
      deletes.add(id);
    } else {
      deletes.delete(id);
      upserts.add(id);
    }
  }
  return { upserts, deletes };
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

type CurrentAccess = { role: "suporte" | "medico" | "secretaria" | "aplicacao"; permissions: Record<string, Record<string, boolean>> };
async function getCurrentAccess(): Promise<CurrentAccess> {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("role, active, permissions").eq("id", authData.user.id).single();
  throwIfError(error);
  const profile = data as { role: CurrentAccess["role"]; active: boolean; permissions: CurrentAccess["permissions"] | null };
  if (!profile.active) throw new Error("Seu usuário está inativo. Procure o administrador.");
  return { role: profile.role, permissions: profile.permissions ?? {} };
}
function can(access: CurrentAccess, area: string, action: string): boolean {
  return access.role === "suporte" || access.permissions[area]?.[action] === true;
}

function mapWeeks(rows: ProgressRow[]): Semana[] {
  const weeks = emptySemanas();
  for (const row of rows) {
    const index = row.week_number - 1;
    if (index < 0 || index > 3) continue;
    weeks[index] = {
      meds: Array.isArray(row.medications) ? row.medications : [],
      obs: row.observations ?? "",
    };
  }
  return weeks;
}

export async function listAppointments(): Promise<Agendamento[]> {
  if (isOffline()) {
    const session = await offlineContext();
    if (session.user.papel !== "Suporte" &&
        session.user.permissions?.appointments?.view !== true &&
        session.user.permissions?.clinical_progress?.view !== true &&
        session.user.permissions?.finance?.view !== true) {
      throw new Error("Você não tem permissão para visualizar consultas, evoluções ou financeiro.");
    }
    return (await listOfflineRecords<Agendamento>(session.userId, "appointments"))
      .map((item) => item.value)
      .sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));
  }

  const supabase = createClient();
  const access = await getCurrentAccess();
  const [patientsResult, appointmentsResult] = await Promise.all([
    supabase.from("patients").select("*"),
    supabase.from("appointments").select("*")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true }),
  ]);
  throwIfError(patientsResult.error);
  throwIfError(appointmentsResult.error);

  const [progressResult, financesResult] = await Promise.all([
    can(access, "clinical_progress", "view")
      ? supabase.from("patient_weekly_progress").select("*")
      : Promise.resolve({ data: [], error: null }),
    can(access, "finance", "view")
      ? supabase.from("appointment_finances").select("*")
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(progressResult.error);
  throwIfError(financesResult.error);

  const patients = (patientsResult.data ?? []) as unknown as PatientRow[];
  const appointments = (appointmentsResult.data ?? []) as unknown as AppointmentRow[];
  const progress = (progressResult.data ?? []) as unknown as ProgressRow[];
  const finances = (financesResult.data ?? []) as unknown as FinanceRow[];
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const progressByAppointment = new Map<string, ProgressRow[]>();
  for (const row of progress) {
    const rows = progressByAppointment.get(row.appointment_id) ?? [];
    rows.push(row);
    progressByAppointment.set(row.appointment_id, rows);
  }
  const financeByAppointment = new Map(finances.map((row) => [row.appointment_id, row]));

  const mapped: Agendamento[] = appointments.flatMap((appointment) => {
    const patient = patientById.get(appointment.patient_id);
    if (!patient) return [];
    const finance = financeByAppointment.get(appointment.id);
    return [{
      id: appointment.id, nome: patient.full_name, telefone: patient.phone, email: patient.email,
      foto: patient.photo_path ?? undefined, data: appointment.appointment_date,
      horario: appointment.appointment_time.slice(0, 5), obs: appointment.notes,
      status: appointment.status, semanas: mapWeeks(progressByAppointment.get(appointment.id) ?? []),
      valor: finance ? Number(finance.amount) : undefined, pagStatus: finance?.payment_status,
      metodo: finance?.payment_method, comprovante: finance?.receipt_path ?? undefined,
      comprovanteNome: finance?.receipt_name ?? undefined, pagData: finance?.payment_date ?? undefined,
    }];
  });

  const session = getOfflineSessionInfo();
  if (!session) return mapped;
  const pendingPatients = await pendingEntityChanges(session.userId, "patient");
  const cachedPatients = await listOfflineRecords<PatientRecord>(session.userId, "patients");
  const remotePatientIds = new Set(patients.map((patient) => patient.id));
  for (const cached of cachedPatients) {
    if (pendingPatients.deletes.has(cached.id) ||
        (!remotePatientIds.has(cached.id) && !pendingPatients.upserts.has(cached.id))) {
      await deleteOfflineRecord(session.userId, "patients", cached.id);
    }
  }
  for (const patient of patients) {
    if (pendingPatients.upserts.has(patient.id) || pendingPatients.deletes.has(patient.id)) continue;
    await saveOfflineRecord(session.userId, "patients", patient.id, {
      id: patient.id, nome: patient.full_name, telefone: patient.phone, email: patient.email,
      foto: patient.photo_path ?? undefined, criadoEm: new Date().toISOString(),
    });
  }

  const pendingAppointments = await pendingEntityChanges(session.userId, "appointment");
  const cachedAppointments = await listOfflineRecords<Agendamento>(session.userId, "appointments");
  const remoteAppointmentIds = new Set(mapped.map((appointment) => appointment.id));
  for (const cached of cachedAppointments) {
    if (pendingAppointments.deletes.has(cached.id) ||
        (!remoteAppointmentIds.has(cached.id) && !pendingAppointments.upserts.has(cached.id))) {
      await deleteOfflineRecord(session.userId, "appointments", cached.id);
    }
  }
  for (const appointment of mapped) {
    if (pendingAppointments.upserts.has(appointment.id) || pendingAppointments.deletes.has(appointment.id)) continue;
    await saveOfflineRecord(session.userId, "appointments", appointment.id, appointment);
  }
  const localPending = await listOfflineRecords<Agendamento>(session.userId, "appointments");
  const pendingById = new Map(localPending
    .filter((item) => pendingAppointments.upserts.has(item.id))
    .map((item) => [item.id, item.value]));
  const merged = new Map(mapped.map((appointment) => [appointment.id, appointment]));
  for (const id of pendingAppointments.deletes) merged.delete(id);
  for (const [id, appointment] of pendingById) merged.set(id, appointment);
  return [...merged.values()].sort((a, b) => a.data.localeCompare(b.data) || a.horario.localeCompare(b.horario));
}
export async function getAppointment(id: string): Promise<Agendamento | undefined> {
  const appointments = await listAppointments();
  return appointments.find((appointment) => appointment.id === id);
}

export async function upsertAppointment(appointment: Agendamento): Promise<void> {
  if (isOffline()) {
    const session = await offlineContext();
    const existing = await readOfflineRecord<Agendamento>(session.userId, "appointments", appointment.id);
    const action = existing ? "edit" : "create";
    const canEditAppointment = session.user.papel === "Suporte" || session.user.permissions?.appointments?.[action] === true;
    const canEditProgress = session.user.papel === "Suporte" || session.user.permissions?.clinical_progress?.[existing ? "edit" : "create"] === true;
    const canEditFinance = session.user.papel === "Suporte" || session.user.permissions?.finance?.[existing ? "edit" : "create"] === true;
    if (!canEditAppointment && !canEditProgress && !canEditFinance) throw new Error("Você não tem permissão para alterar este agendamento, evolução ou financeiro offline.");
    if (!appointment.nome.trim() || !appointment.telefone.trim() || !appointment.email.trim() || !appointment.data || !appointment.horario) throw new Error("Preencha os dados obrigatórios do paciente e do agendamento.");
    await saveOfflineRecord(session.userId, "appointments", appointment.id, appointment);
    await enqueueOfflineChange(session.userId, { entity: "appointment", operation: "upsert", payload: appointment });
    return;
  }
  const supabase = createClient();
  const access = await getCurrentAccess();
  const clinicId = await getCurrentClinicId();
  const { data: existingAppointment, error: existingAppointmentError } = await supabase.from("appointments")
    .select("patient_id").eq("id", appointment.id).maybeSingle();
  throwIfError(existingAppointmentError);
  const appointmentExists = !!existingAppointment;
  let patientId = (existingAppointment as { patient_id: string } | null)?.patient_id;

  if (!patientId) {
    const { data: matchingPatients, error: findPatientError } = await supabase.from("patients")
      .select("id").eq("email", appointment.email).limit(1);
    throwIfError(findPatientError);
    patientId = (matchingPatients?.[0] as { id: string } | undefined)?.id;
  }

  if (patientId && can(access, "patients", "edit")) {
    const { error } = await supabase.from("patients").update({
      full_name: appointment.nome, phone: appointment.telefone, email: appointment.email,
      photo_path: appointment.foto && !appointment.foto.startsWith("data:") ? appointment.foto : null,
    }).eq("id", patientId);
    throwIfError(error);
  } else if (!patientId) {
    if (!can(access, "patients", "create")) throw new Error("Você não tem permissão para cadastrar pacientes.");
    const { data, error } = await supabase.from("patients").insert({
      clinic_id: clinicId,
      full_name: appointment.nome, phone: appointment.telefone, email: appointment.email,
      photo_path: appointment.foto && !appointment.foto.startsWith("data:") ? appointment.foto : null,
    }).select("id").single();
    throwIfError(error);
    patientId = (data as { id: string }).id;
  }

  if (!patientId) throw new Error("Paciente não encontrado ou sem permissão para cadastrá-lo.");
  const appointmentAction = appointmentExists ? "edit" : "create";
  if (can(access, "appointments", appointmentAction)) {
    const { error } = await supabase.from("appointments").upsert({
      id: appointment.id, clinic_id: clinicId, patient_id: patientId, appointment_date: appointment.data,
      appointment_time: appointment.horario, notes: appointment.obs, status: appointment.status,
    });
    throwIfError(error);
  } else if (!can(access, "finance", "edit") && !can(access, "finance", "create") &&
             !can(access, "clinical_progress", "edit") && !can(access, "clinical_progress", "create")) {
    throw new Error("Você não tem permissão para alterar este agendamento.");
  }

  const progressRows = (can(access, "clinical_progress", "edit") || can(access, "clinical_progress", "create"))
    ? (appointment.semanas ?? []).slice(0, 4).map((week, index) => ({
        appointment_id: appointment.id, week_number: index + 1, medications: week.meds, observations: week.obs,
      })) : [];
  if (progressRows.length) {
    const { error } = await supabase.from("patient_weekly_progress").upsert(progressRows, { onConflict: "appointment_id,week_number" });
    throwIfError(error);
  }

  const hasFinance = (can(access, "finance", "edit") || can(access, "finance", "create")) && (
    appointment.valor !== undefined || appointment.pagStatus !== undefined || appointment.metodo !== undefined ||
    appointment.pagData !== undefined || appointment.comprovante !== undefined
  );
  if (hasFinance) {
    const { error } = await supabase.from("appointment_finances").upsert({
      appointment_id: appointment.id, amount: appointment.valor ?? 0,
      payment_status: appointment.pagStatus ?? "aguardando", payment_method: appointment.metodo ?? "",
      payment_date: appointment.pagData || null, receipt_path: appointment.comprovante ?? null,
      receipt_name: appointment.comprovanteNome ?? null,
    });
    throwIfError(error);
  }
}

export async function removeAppointment(id: string): Promise<void> {
  if (isOffline()) {
    const session = await offlineContext();
    if (session.user.papel !== "Suporte" && session.user.permissions?.appointments?.delete !== true) throw new Error("Você não tem permissão para excluir agendamentos.");
    await deleteOfflineRecord(session.userId, "appointments", id);
    await enqueueOfflineChange(session.userId, { entity: "appointment", operation: "delete", payload: { id } });
    return;
  }
  const access = await getCurrentAccess();
  if (!can(access, "appointments", "delete")) throw new Error("Você não tem permissão para excluir agendamentos.");
  const { error } = await createClient().from("appointments").delete().eq("id", id);
  throwIfError(error);
}


async function getCurrentClinicId(): Promise<string> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.");
  const { data, error } = await supabase.from("profiles")
    .select("clinic_id, role").eq("id", auth.user.id).single();
  throwIfError(error);
  if (data?.clinic_id) return data.clinic_id as string;

  if (data?.role === "suporte") {
    const selectedClinicId = typeof window !== "undefined"
      ? window.localStorage.getItem("storbem-support-clinic-id")
      : null;
    if (!selectedClinicId) {
      throw new Error("Selecione um consultório no cabeçalho antes de criar registros ou enviar arquivos.");
    }
    const { data: clinic, error: clinicError } = await supabase.from("clinics")
      .select("id").eq("id", selectedClinicId).maybeSingle();
    throwIfError(clinicError);
    if (!clinic) {
      window.localStorage.removeItem("storbem-support-clinic-id");
      throw new Error("O consultório selecionado não está disponível para esta conta. Selecione outro.");
    }
    return clinic.id as string;
  }
  throw new Error("Esta conta precisa estar vinculada a um consultório antes de enviar arquivos.");
}

const RECEIPTS_BUCKET = "appointment-receipts";

const OFFLINE_RECEIPT_PREFIX = "offline-receipt:";

type OfflineReceiptFile = {
  id: string;
  appointmentId: string;
  fileName: string;
  contentType: string;
  base64: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function uploadReceiptToCloud(appointmentId: string, file: File, stableId?: string): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "file";
  const clinicId = await getCurrentClinicId();
  const path = `${clinicId}/${appointmentId}/${stableId || crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: Boolean(stableId) });
  throwIfError(error);
  return path;
}

export async function uploadReceipt(appointmentId: string, file: File): Promise<string> {
  if (isOffline()) {
    const session = await offlineContext();
    const allowed = session.user.papel === "Suporte" || session.user.permissions?.finance?.create === true || session.user.permissions?.finance?.edit === true;
    if (!allowed) throw new Error("Você não tem permissão para anexar comprovantes offline.");
    const appointment = await readOfflineRecord<Agendamento>(session.userId, "appointments", appointmentId);
    if (!appointment) throw new Error("Agendamento não disponível neste dispositivo. Conecte-se para atualizar os dados.");
    const id = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved: OfflineReceiptFile = {
      id, appointmentId, fileName: file.name, contentType: file.type || "application/octet-stream",
      base64: bytesToBase64(bytes),
    };
    await saveOfflineRecord(session.userId, "receipt_files", id, saved);
    await enqueueOfflineChange(session.userId, { entity: "receipt", operation: "upload", payload: saved });
    return OFFLINE_RECEIPT_PREFIX + id;
  }
  const access = await getCurrentAccess();
  if (!can(access, "finance", "create") && !can(access, "finance", "edit")) throw new Error("Você não tem permissão para anexar comprovantes.");
  return uploadReceiptToCloud(appointmentId, file);
}

export async function getReceiptUrl(path: string): Promise<string> {
  if (path.startsWith(OFFLINE_RECEIPT_PREFIX)) {
    const session = getOfflineSessionInfo();
    if (!session) throw new Error("Entre na conta que salvou este comprovante neste dispositivo.");
    const id = path.slice(OFFLINE_RECEIPT_PREFIX.length);
    const saved = await readOfflineRecord<OfflineReceiptFile>(session.userId, "receipt_files", id);
    if (!saved) throw new Error("Comprovante local não encontrado. Conecte-se para sincronizar ou recuperar o arquivo.");
    return URL.createObjectURL(new Blob([base64ToBytes(saved.base64)], { type: saved.contentType }));
  }
  const { data, error } = await createClient().storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60);
  throwIfError(error);
  return data.signedUrl;
}

export async function deleteReceipt(path: string): Promise<void> {
  if (path.startsWith(OFFLINE_RECEIPT_PREFIX)) {
    const session = await offlineContext();
    if (session.user.papel !== "Suporte" && session.user.permissions?.finance?.delete !== true) {
      throw new Error("Você não tem permissão para remover comprovantes.");
    }
    const id = path.slice(OFFLINE_RECEIPT_PREFIX.length);
    const queue = await listOfflineQueue(session.userId);
    for (const item of queue) {
      if (item.entity === "receipt" && item.operation === "upload" &&
          (item.payload as OfflineReceiptFile).id === id) {
        await removeOfflineQueueItem(session.userId, item.id);
      }
    }
    await deleteOfflineRecord(session.userId, "receipt_files", id);
    return;
  }
  if (isOffline()) {
    const session = await offlineContext();
    const allowed = session.user.papel === "Suporte" || session.user.permissions?.finance?.delete === true;
    if (!allowed) throw new Error("Você não tem permissão para remover comprovantes offline.");
    await enqueueOfflineChange(session.userId, { entity: "receipt", operation: "delete", payload: { path } });
    return;
  }
  const access = await getCurrentAccess();
  if (!can(access, "finance", "delete")) throw new Error("Você não tem permissão para remover comprovantes.");
  const { error } = await createClient().storage.from(RECEIPTS_BUCKET).remove([path]);
  throwIfError(error);
}


const PATIENT_PHOTOS_BUCKET = "patient-photos";

async function uploadPatientPhotoToCloud(file: File, stableId?: string): Promise<string> {
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const clinicId = await getCurrentClinicId();
  const path = `${clinicId}/${stableId || crypto.randomUUID()}.${extension}`;
  const { error } = await createClient().storage.from(PATIENT_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: Boolean(stableId) });
  throwIfError(error);
  return path;
}

export async function uploadPatientPhoto(file: File): Promise<string> {
  if (isOffline()) {
    const session = await offlineContext();
    const allowed = session.user.papel === "Suporte" || session.user.permissions?.patients?.create === true || session.user.permissions?.patients?.edit === true;
    if (!allowed) throw new Error("Sem permissão para enviar fotos de pacientes offline.");
    const id = crypto.randomUUID();
    const saved = {
      id, fileName: file.name, contentType: file.type || "image/jpeg",
      base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    };
    await saveOfflineRecord(session.userId, "patient_photo_files", id, saved);
    await enqueueOfflineChange(session.userId, { entity: "patient_photo", operation: "upload", payload: saved });
    return "offline-patient-photo:" + id;
  }
  const access = await getCurrentAccess();
  if (!can(access, "patients", "create") && !can(access, "patients", "edit")) throw new Error("Sem permissão para enviar fotos de pacientes.");
  return uploadPatientPhotoToCloud(file);
}

export async function getPatientPhotoUrl(path: string): Promise<string> {
  if (path.startsWith("offline-patient-photo:")) {
    const session = getOfflineSessionInfo();
    if (!session) throw new Error("Entre na conta que salvou esta foto neste dispositivo.");
    const id = path.slice("offline-patient-photo:".length);
    const saved = await readOfflineRecord<{ base64: string; contentType: string }>(session.userId, "patient_photo_files", id);
    if (!saved) throw new Error("Foto local não encontrada.");
    return URL.createObjectURL(new Blob([base64ToBytes(saved.base64)], { type: saved.contentType }));
  }
  const { data, error } = await createClient().storage.from(PATIENT_PHOTOS_BUCKET).createSignedUrl(path, 60);
  throwIfError(error);
  return data.signedUrl;
}


export type PatientRecord = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  foto?: string;
  criadoEm: string;
};

export async function listPatients(): Promise<PatientRecord[]> {
  if (isOffline()) {
    const session = await offlineContext();
    if (session.user.papel !== "Suporte" && session.user.permissions?.patients?.view !== true && session.user.permissions?.medical_records?.view !== true) {
      throw new Error("Você não tem permissão para visualizar pacientes.");
    }
    return (await listOfflineRecords<PatientRecord>(session.userId, "patients"))
      .map((item) => item.value)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  const supabase = createClient();
  const access = await getCurrentAccess();
  if (!can(access, "patients", "view") && !can(access, "medical_records", "view")) {
    throw new Error("Você não tem permissão para visualizar pacientes.");
  }
  const { data, error } = await supabase.from("patients")
    .select("id, full_name, phone, email, photo_path, created_at")
    .order("full_name", { ascending: true });
  throwIfError(error);
  const patients: PatientRecord[] = (data ?? []).map((row) => ({
    id: row.id as string, nome: row.full_name as string, telefone: row.phone as string,
    email: row.email as string, foto: (row.photo_path as string | null) ?? undefined,
    criadoEm: row.created_at as string,
  }));

  const session = getOfflineSessionInfo();
  if (!session) return patients;
  const pending = await pendingEntityChanges(session.userId, "patient");
  const remoteIds = new Set(patients.map((patient) => patient.id));
  const cached = await listOfflineRecords<PatientRecord>(session.userId, "patients");
  for (const item of cached) {
    if (pending.deletes.has(item.id) || (!remoteIds.has(item.id) && !pending.upserts.has(item.id))) {
      await deleteOfflineRecord(session.userId, "patients", item.id);
    }
  }
  for (const patient of patients) {
    if (pending.upserts.has(patient.id) || pending.deletes.has(patient.id)) continue;
    await saveOfflineRecord(session.userId, "patients", patient.id, patient);
  }
  const localPending = await listOfflineRecords<PatientRecord>(session.userId, "patients");
  const pendingById = new Map(localPending
    .filter((item) => pending.upserts.has(item.id))
    .map((item) => [item.id, item.value]));
  const merged = new Map(patients.map((patient) => [patient.id, patient]));
  for (const id of pending.deletes) merged.delete(id);
  for (const [id, patient] of pendingById) merged.set(id, patient);
  return [...merged.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
export async function savePatient(patient: Omit<PatientRecord, "criadoEm"> & { __offlineNew?: boolean }): Promise<void> {
  if (isOffline()) {
    const session = await offlineContext();
    const existing = patient.id ? await readOfflineRecord<PatientRecord>(session.userId, "patients", patient.id) : undefined;
    const action = existing ? "edit" : "create";
    if (session.user.papel !== "Suporte" && session.user.permissions?.patients?.[action] !== true) throw new Error("Você não tem permissão para salvar pacientes.");
    const value: PatientRecord = { ...patient, id: patient.id || crypto.randomUUID(), nome: patient.nome.trim(), telefone: patient.telefone.trim(), email: patient.email.trim().toLowerCase(), criadoEm: new Date().toISOString() };
    if (!value.nome || !value.telefone || !value.email) throw new Error("Preencha nome, telefone e e-mail do paciente.");
    await saveOfflineRecord(session.userId, "patients", value.id, value);
    await enqueueOfflineChange(session.userId, { entity: "patient", operation: "upsert", payload: { ...value, __offlineNew: !existing } });
    return;
  }
  const supabase = createClient();
  const access = await getCurrentAccess();
  const isEditing = Boolean(patient.id) && patient.__offlineNew !== true;
  const action = isEditing ? "edit" : "create";
  if (!can(access, "patients", action)) {
    throw new Error(isEditing ? "Você não tem permissão para editar pacientes." : "Você não tem permissão para cadastrar pacientes.");
  }
  const values = {
    full_name: patient.nome.trim(),
    phone: patient.telefone.trim(),
    email: patient.email.trim().toLowerCase(),
    photo_path: patient.foto || null,
  };
  if (!values.full_name || !values.phone || !values.email) {
    throw new Error("Preencha nome, telefone e e-mail do paciente.");
  }
  if (isEditing) {
    const { error } = await supabase.from("patients").update(values).eq("id", patient.id);
    throwIfError(error);
    return;
  }
  const clinicId = await getCurrentClinicId();
  const { error } = await supabase.from("patients").insert({
    ...values,
    id: patient.id || crypto.randomUUID(),
    clinic_id: clinicId,
  });
  throwIfError(error);
}

export async function removePatient(id: string): Promise<void> {
  if (isOffline()) {
    const session = await offlineContext();
    if (session.user.papel !== "Suporte" && session.user.permissions?.patients?.delete !== true) throw new Error("Você não tem permissão para excluir pacientes.");
    await deleteOfflineRecord(session.userId, "patients", id);
    await enqueueOfflineChange(session.userId, { entity: "patient", operation: "delete", payload: { id } });
    return;
  }
  const access = await getCurrentAccess();
  if (!can(access, "patients", "delete")) throw new Error("Você não tem permissão para excluir pacientes.");
  const { error } = await createClient().from("patients").delete().eq("id", id);
  throwIfError(error);
}


export async function syncOfflineChanges(): Promise<{ synced: number; pending: number }> {
  if (isOffline()) throw new Error("Conecte-se à internet para sincronizar.");
  const { data: authData, error } = await createClient().auth.getUser();
  throwIfError(error);
  if (!authData.user) throw new Error("Entre novamente online para sincronizar as alterações pendentes.");
  const userId = authData.user.id;
  const queue = await listOfflineQueue(userId);
  let synced = 0;
  for (const item of queue) {
    try {
      if (item.entity === "patient_photo") {
        const payload = item.payload as { id: string; fileName: string; contentType: string; base64: string };
        const bytes = base64ToBytes(payload.base64);
        const file = new File([bytes], payload.fileName, { type: payload.contentType });
        const remotePath = await uploadPatientPhotoToCloud(file, payload.id);
        const localReference = "offline-patient-photo:" + payload.id;
        const pending = await listOfflineQueue(userId);
        for (const queued of pending) {
          if (queued.entity === "patient" && queued.operation === "upsert") {
            const patient = queued.payload as PatientRecord & { __offlineNew?: boolean };
            if (patient.foto === localReference) {
              patient.foto = remotePath;
              queued.payload = patient;
              await updateOfflineQueueItem(userId, queued);
              await saveOfflineRecord(userId, "patients", patient.id, patient);
              const inMemory = queue.find((entry) => entry.id === queued.id);
              if (inMemory) inMemory.payload = patient;
            }
          } else if (queued.entity === "appointment" && queued.operation === "upsert") {
            const appointment = queued.payload as Agendamento;
            if (appointment.foto === localReference) {
              appointment.foto = remotePath;
              queued.payload = appointment;
              await updateOfflineQueueItem(userId, queued);
              await saveOfflineRecord(userId, "appointments", appointment.id, appointment);
              const inMemory = queue.find((entry) => entry.id === queued.id);
              if (inMemory) inMemory.payload = appointment;
            }
          }
        }
        await deleteOfflineRecord(userId, "patient_photo_files", payload.id);
      } else if (item.entity === "receipt") {
        if (item.operation === "delete") {
          const payload = item.payload as { path: string };
          const { error: removeError } = await createClient().storage.from(RECEIPTS_BUCKET).remove([payload.path]);
          throwIfError(removeError);
        } else {
          const payload = item.payload as OfflineReceiptFile;
          const bytes = base64ToBytes(payload.base64);
          const file = new File([bytes], payload.fileName, { type: payload.contentType });
          const remotePath = await uploadReceiptToCloud(payload.appointmentId, file, payload.id);
          const localReference = OFFLINE_RECEIPT_PREFIX + payload.id;
          const pending = await listOfflineQueue(userId);
          for (const queued of pending) {
            if (queued.entity !== "appointment" || queued.operation !== "upsert") continue;
            const appointment = queued.payload as Agendamento;
            if (appointment.comprovante !== localReference) continue;
            const updatedAppointment = { ...appointment, comprovante: remotePath, comprovanteNome: payload.fileName };
            queued.payload = updatedAppointment;
            await updateOfflineQueueItem(userId, queued);
            await saveOfflineRecord(userId, "appointments", updatedAppointment.id, updatedAppointment);
            const inMemory = queue.find((entry) => entry.id === queued.id);
            if (inMemory) inMemory.payload = updatedAppointment;
          }
          await deleteOfflineRecord(userId, "receipt_files", payload.id);
        }
      } else if (item.entity === "patient") {
        const payload = item.payload as (PatientRecord & { __offlineNew?: boolean }) | { id: string };
        if (item.operation === "delete") await removePatient(payload.id);
        else await savePatient(payload as PatientRecord & { __offlineNew?: boolean });
      } else if (item.entity === "medical_record") {
        const payload = item.payload as MedicalRecord | { id: string };
        if (item.operation === "delete") await removeMedicalRecord(payload.id);
        else await saveMedicalRecord(payload as MedicalRecord & { __offlineNew?: boolean });
      } else {
        const payload = item.payload as Agendamento | { id: string };
        if (item.operation === "delete") await removeAppointment(payload.id);
        else await upsertAppointment(payload as Agendamento);
      }
      await removeOfflineQueueItem(userId, item.id);
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização.";
      await updateOfflineQueueItem(userId, { ...item, attempts: item.attempts + 1, lastError: message });
      break;
    }
  }
  return { synced, pending: (await listOfflineQueue(userId)).length };
}


let automaticSyncRunning = false;
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (automaticSyncRunning) return;
    automaticSyncRunning = true;
    void syncOfflineChanges()
      .then((result) => {
        if (result.synced > 0) console.info(`Sincronização automática concluída: ${result.synced} alteração(ões); ${result.pending} pendente(s).`);
      })
      .catch((error) => {
        // If this device was unlocked offline without a live Supabase session,
        // the encrypted queue remains intact and is retried on the next online login.
        console.info("A sincronização será retomada após entrar online.", error);
      })
      .finally(() => { automaticSyncRunning = false; });
  });
}

export type MedicalRecord = {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  content: string;
  createdAt: string;
};

function canUseMedicalRecords(user: { papel: string; permissions?: Record<string, Record<string, boolean>> }, action: string): boolean {
  return user.papel === "Suporte" || user.permissions?.medical_records?.[action] === true;
}

export async function listMedicalRecords(): Promise<MedicalRecord[]> {
  if (isOffline()) {
    const session = await offlineContext();
    if (!canUseMedicalRecords(session.user, "view")) throw new Error("Você não tem permissão para visualizar prontuários.");
    return (await listOfflineRecords<MedicalRecord>(session.userId, "medical_records"))
      .map((item) => item.value)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const supabase = createClient();
  const access = await getCurrentAccess();
  if (!can(access, "medical_records", "view")) throw new Error("Você não tem permissão para visualizar prontuários.");
  const { data, error } = await supabase
    .from("medical_records")
    .select("id, patient_id, title, content, created_at, patients(full_name)")
    .order("created_at", { ascending: false });
  throwIfError(error);

  const records = (data ?? []).map((row) => {
    const patient = row.patients as unknown as { full_name: string } | null;
    return {
      id: row.id as string,
      patientId: row.patient_id as string,
      patientName: patient?.full_name ?? "Paciente",
      title: row.title as string,
      content: row.content as string,
      createdAt: row.created_at as string,
    };
  });

  const session = getOfflineSessionInfo();
  if (session) {
    const remoteIds = new Set(records.map((record) => record.id));
    const pending = await pendingEntityChanges(session.userId, "medical_record");
    const cached = await listOfflineRecords<MedicalRecord>(session.userId, "medical_records");
    for (const item of cached) {
      if (pending.deletes.has(item.id) || (!remoteIds.has(item.id) && !pending.upserts.has(item.id))) {
        await deleteOfflineRecord(session.userId, "medical_records", item.id);
      }
    }
    for (const record of records) {
      if (pending.upserts.has(record.id) || pending.deletes.has(record.id)) continue;
      await saveOfflineRecord(session.userId, "medical_records", record.id, record);
    }
  }
    const localPending = await listOfflineRecords<MedicalRecord>(session.userId, "medical_records");
    const pendingById = new Map(localPending.filter((item) => pending.upserts.has(item.id)).map((item) => [item.id, item.value]));
    const merged = new Map(records.map((record) => [record.id, record]));
    for (const id of pending.deletes) merged.delete(id);
    for (const [id, record] of pendingById) merged.set(id, record);
    return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  return records;
}

export async function saveMedicalRecord(record: Pick<MedicalRecord, "id" | "patientId" | "title" | "content"> & { __offlineNew?: boolean }): Promise<void> {
  const title = record.title.trim();
  const content = record.content.trim();
  if (!record.patientId || !title || !content) {
    throw new Error("Selecione o paciente e preencha o título e o conteúdo do prontuário.");
  }

  if (isOffline()) {
    const session = await offlineContext();
    const existing = record.id ? await readOfflineRecord<MedicalRecord>(session.userId, "medical_records", record.id) : undefined;
    const action = existing ? "edit" : "create";
    if (!canUseMedicalRecords(session.user, action)) throw new Error("Você não tem permissão para salvar prontuários offline.");
    const patient = await readOfflineRecord<PatientRecord>(session.userId, "patients", record.patientId);
    if (!patient) throw new Error("Este paciente não está disponível no armazenamento offline. Conecte-se para atualizar a lista de pacientes.");
    const value: MedicalRecord = {
      id: record.id || crypto.randomUUID(),
      patientId: record.patientId,
      patientName: patient.nome,
      title,
      content,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    await saveOfflineRecord(session.userId, "medical_records", value.id, value);
    await enqueueOfflineChange(session.userId, { entity: "medical_record", operation: "upsert", payload: { ...value, __offlineNew: !existing } });
    return;
  }

  const supabase = createClient();
  const access = await getCurrentAccess();
  const isEditing = Boolean(record.id) && record.__offlineNew !== true;
  const action = isEditing ? "edit" : "create";
  if (!can(access, "medical_records", action)) throw new Error("Você não tem permissão para salvar prontuários.");
  const clinicId = await getCurrentClinicId();
  const id = record.id || crypto.randomUUID();
  if (isEditing) {
    const { error } = await supabase.from("medical_records")
      .update({ title, content })
      .eq("id", id);
    throwIfError(error);
    return;
  }
  const { error } = await supabase.from("medical_records").insert({
    id,
    clinic_id: clinicId,
    patient_id: record.patientId,
    title,
    content,
  });
  throwIfError(error);
}

export async function removeMedicalRecord(id: string): Promise<void> {
  if (isOffline()) {
    const session = await offlineContext();
    if (!canUseMedicalRecords(session.user, "delete")) throw new Error("Você não tem permissão para excluir prontuários offline.");
    await deleteOfflineRecord(session.userId, "medical_records", id);
    await enqueueOfflineChange(session.userId, { entity: "medical_record", operation: "delete", payload: { id } });
    return;
  }
  const access = await getCurrentAccess();
  if (!can(access, "medical_records", "delete")) throw new Error("Você não tem permissão para excluir prontuários.");
  const { error } = await createClient().from("medical_records").delete().eq("id", id);
  throwIfError(error);
}
