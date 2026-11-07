import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();
  const access = await getCurrentAccess();
  const [patientsResult, appointmentsResult] = await Promise.all([
    supabase.from("patients").select("*"),
    supabase
      .from("appointments")
      .select("*")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true }),
  ]);

  throwIfError(patientsResult.error);
  throwIfError(appointmentsResult.error);

  const [progressResult, financesResult] = await Promise.all([
    can(access, "clinical_progress", "view") ? supabase.from("patient_weekly_progress").select("*") : Promise.resolve({ data: [], error: null }),
    can(access, "finance", "view") ? supabase.from("appointment_finances").select("*") : Promise.resolve({ data: [], error: null }),
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
    const current = progressByAppointment.get(row.appointment_id) ?? [];
    current.push(row);
    progressByAppointment.set(row.appointment_id, current);
  }
  const financeByAppointment = new Map(finances.map((row) => [row.appointment_id, row]));

  return appointments.flatMap((appointment) => {
    const patient = patientById.get(appointment.patient_id);
    if (!patient) return [];
    const finance = financeByAppointment.get(appointment.id);
    return [{
      id: appointment.id,
      nome: patient.full_name,
      telefone: patient.phone,
      email: patient.email,
      foto: patient.photo_path ?? undefined,
      data: appointment.appointment_date,
      horario: appointment.appointment_time.slice(0, 5),
      obs: appointment.notes,
      status: appointment.status,
      semanas: mapWeeks(progressByAppointment.get(appointment.id) ?? []),
      valor: finance ? Number(finance.amount) : undefined,
      pagStatus: finance?.payment_status,
      metodo: finance?.payment_method,
      comprovante: finance?.receipt_path ?? undefined,
      comprovanteNome: finance?.receipt_name ?? undefined,
      pagData: finance?.payment_date ?? undefined,
    }];
  });
}

export async function getAppointment(id: string): Promise<Agendamento | undefined> {
  const appointments = await listAppointments();
  return appointments.find((appointment) => appointment.id === id);
}

export async function upsertAppointment(appointment: Agendamento): Promise<void> {
  const supabase = createClient();

  const { data: existingAppointment, error: existingAppointmentError } = await supabase
    .from("appointments")
    .select("patient_id")
    .eq("id", appointment.id)
    .maybeSingle();
  throwIfError(existingAppointmentError);

  let patientId = (existingAppointment as { patient_id: string } | null)?.patient_id;
  if (!patientId) {
    const { data: matchingPatients, error: findPatientError } = await supabase
      .from("patients")
      .select("id")
      .eq("email", appointment.email)
      .limit(1);
    throwIfError(findPatientError);
    patientId = (matchingPatients?.[0] as { id: string } | undefined)?.id;
  }
  if (patientId) {
    const { error } = await supabase
      .from("patients")
      .update({
        full_name: appointment.nome,
        phone: appointment.telefone,
        email: appointment.email,
        photo_path: appointment.foto && !appointment.foto.startsWith("data:") ? appointment.foto : null,
      })
      .eq("id", patientId);
    throwIfError(error);
  } else {
    const { data, error } = await supabase
      .from("patients")
      .insert({
        full_name: appointment.nome,
        phone: appointment.telefone,
        email: appointment.email,
        photo_path: appointment.foto && !appointment.foto.startsWith("data:") ? appointment.foto : null,
      })
      .select("id")
      .single();
    throwIfError(error);
    patientId = (data as { id: string }).id;
  }

  const { error: appointmentError } = await supabase.from("appointments").upsert({
    id: appointment.id,
    patient_id: patientId,
    appointment_date: appointment.data,
    appointment_time: appointment.horario,
    notes: appointment.obs,
    status: appointment.status,
  });
  throwIfError(appointmentError);

  const role = await getCurrentRole();
  const progressRows = (can(access, "clinical_progress", "edit") || can(access, "clinical_progress", "create")) ? (appointment.semanas ?? []).slice(0, 4).map((week, index) => ({
    appointment_id: appointment.id,
    week_number: index + 1,
    medications: week.meds,
    observations: week.obs,
  })) : [];
  if (progressRows.length) {
    const { error } = await supabase
      .from("patient_weekly_progress")
      .upsert(progressRows, { onConflict: "appointment_id,week_number" });
    throwIfError(error);
  }

  const hasFinance = (can(access, "finance", "edit") || can(access, "finance", "create")) && (
    appointment.valor !== undefined ||
    appointment.pagStatus !== undefined ||
    appointment.metodo !== undefined ||
    appointment.pagData !== undefined ||
    appointment.comprovante !== undefined
  );

  if (hasFinance) {
    const { error } = await supabase.from("appointment_finances").upsert({
      appointment_id: appointment.id,
      amount: appointment.valor ?? 0,
      payment_status: appointment.pagStatus ?? "aguardando",
      payment_method: appointment.metodo ?? "",
      payment_date: appointment.pagData || null,
      receipt_path: appointment.comprovante ?? null,
      receipt_name: appointment.comprovanteNome ?? null,
    });
    throwIfError(error);
  }
}

export async function removeAppointment(id: string): Promise<void> {
  const { error } = await createClient().from("appointments").delete().eq("id", id);
  throwIfError(error);
}


async function getCurrentClinicId(): Promise<string> {
  const supabase = createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.");
  const { data, error } = await supabase.from("profiles")
    .select("clinic_id").eq("id", auth.user.id).single();
  throwIfError(error);
  if (!data?.clinic_id) throw new Error("Esta conta precisa selecionar um consultório antes de enviar arquivos.");
  return data.clinic_id as string;
}

const RECEIPTS_BUCKET = "appointment-receipts";

export async function uploadReceipt(appointmentId: string, file: File): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "file";
  const clinicId = await getCurrentClinicId();
  const path = `${clinicId}/${appointmentId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  throwIfError(error);
  return path;
}

export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await createClient().storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, 60);
  throwIfError(error);
  return data.signedUrl;
}

export async function deleteReceipt(path: string): Promise<void> {
  const { error } = await createClient().storage
    .from(RECEIPTS_BUCKET)
    .remove([path]);
  throwIfError(error);
}


const PATIENT_PHOTOS_BUCKET = "patient-photos";

export async function uploadPatientPhoto(file: File): Promise<string> {
  const supabase = createClient();
  const access = await getCurrentAccess();
  if (!can(access, "patients", "create") && !can(access, "patients", "edit")) throw new Error("Sem permissão para enviar fotos de pacientes.");
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
  const clinicId = await getCurrentClinicId();
  const path = `${clinicId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PATIENT_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  throwIfError(error);
  return path;
}

export async function getPatientPhotoUrl(path: string): Promise<string> {
  const { data, error } = await createClient().storage
    .from(PATIENT_PHOTOS_BUCKET)
    .createSignedUrl(path, 60);
  throwIfError(error);
  return data.signedUrl;
}
