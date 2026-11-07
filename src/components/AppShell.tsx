import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, List, Plus, LogOut, Wallet, Users, Moon, Sun, Palette, LayoutDashboard, ContactRound, FileText, ChartNoAxesCombined, Settings, ReceiptText, Activity } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUser, hasOfflineSession, logout } from "@/lib/auth";
import { listManagedClinics } from "@/lib/admin";
import { type User } from "@/lib/store";
import { CORES, getTheme, setTheme, type Theme } from "@/lib/theme";

export function AppShell({ children, adminOnly, medicoOnly }: { children: ReactNode; adminOnly?: boolean; medicoOnly?: boolean }) {
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [theme, setT] = useState<Theme>({ dark: false, hue: 262 });
  const [paleta, setPaleta] = useState(false);
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState("");

  useEffect(() => {
    let active = true;
    setT(getTheme());

    const checkUser = async () => {
      const current = await getCurrentUser();
      if (!active) return;
      if (!current) {
        setUser(null);
        nav({ to: "/" });
      } else if ((adminOnly && current.papel !== "Suporte" && current.permissions?.finance?.view !== true) || (medicoOnly && current.papel !== "Médico" && current.papel !== "Suporte")) {
        nav({ to: "/agendamentos" });
      } else {
        setUser(current);
        if (current.papel === "Suporte" && !hasOfflineSession()) {
          try {
            const available = await listManagedClinics();
            if (!active) return;
            setClinics(available as { id: string; name: string }[]);
            const stored = window.localStorage.getItem("storbem-support-clinic-id") || "";
            const validStored = available.some((clinic) => clinic.id === stored);
            const next = validStored ? stored : (available[0]?.id ?? "");
            setSelectedClinicId(next);
            if (next) window.localStorage.setItem("storbem-support-clinic-id", next);
          } catch (error) {
            console.warn("Não foi possível carregar a lista de consultórios.", error);
          }
        }
      }
    };

    void checkUser();
    const refreshSupportClinics = () => {
      const selected = window.localStorage.getItem("storbem-support-clinic-id") || "";
      setSelectedClinicId(selected);
      void listManagedClinics().then((available) => {
        if (!active) return;
        setClinics(available as { id: string; name: string }[]);
        if (!available.some((clinic) => clinic.id === selected) && available[0]) {
          setSelectedClinicId(available[0].id);
          window.localStorage.setItem("storbem-support-clinic-id", available[0].id);
        }
      }).catch((error) => console.warn("Não foi possível atualizar os consultórios.", error));
    };
    window.addEventListener("storbem-clinics-updated", refreshSupportClinics);
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (!active) return;
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        if (!session) {
          if (hasOfflineSession()) { void checkUser(); return; }
          setUser(null);
          nav({ to: "/" });
        } else {
          void Promise.resolve().then(checkUser);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      active = false;
      window.removeEventListener("storbem-clinics-updated", refreshSupportClinics);
      unsubscribe?.();
    };
  }, [nav, adminOnly, medicoOnly]);

  const change = (t: Theme) => { setT(t); setTheme(t); };
  const can = (area: string, action = "view") => user?.papel === "Suporte" || user?.papel === "Médico" || user?.permissions?.[area]?.[action] === true;
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-muted">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-6 text-lg font-semibold">
          <CalendarDays className="h-5 w-5" /> Dr. Ricardo
        </div>
        <nav className="flex flex-col gap-1 px-3 text-sm">
          {can("dashboard") && <Link to="/dashboard" className="nav-item" activeProps={{ className: "nav-item-active" }}><LayoutDashboard className="h-4 w-4" /> Painel inicial</Link>}
          {can("appointments") && <>
            <Link to="/agendamentos" activeOptions={{ exact: true }} className="nav-item" activeProps={{ className: "nav-item-active" }}>
              <List className="h-4 w-4" /> Agendamentos
            </Link>
            {can("appointments", "create") && <Link to="/agendamentos/novo" className="nav-item" activeProps={{ className: "nav-item-active" }}>
              <Plus className="h-4 w-4" /> Novo Agendamento
            </Link>}
          </>}
          {can("clinical_progress") && <Link to="/evolucao" className="nav-item" activeProps={{ className: "nav-item-active" }}><Activity className="h-4 w-4" /> Evolução</Link>}
          {can("medical_records") && <Link to="/prontuarios" className="nav-item" activeProps={{ className: "nav-item-active" }}><FileText className="h-4 w-4" /> Prontuários</Link>}
          {can("patients") && <Link to="/pacientes" className="nav-item" activeProps={{ className: "nav-item-active" }}><ContactRound className="h-4 w-4" /> Pacientes</Link>}
          {can("receipts") && can("finance") && <Link to="/recibos" className="nav-item" activeProps={{ className: "nav-item-active" }}><ReceiptText className="h-4 w-4" /> Recibos</Link>}
          {can("reports") && <Link to="/relatorios" className="nav-item" activeProps={{ className: "nav-item-active" }}><ChartNoAxesCombined className="h-4 w-4" /> Relatórios</Link>}
          {can("settings") && <Link to="/configuracoes" className="nav-item" activeProps={{ className: "nav-item-active" }}><Settings className="h-4 w-4" /> Configurações</Link>}
          {can("finance") && <Link to="/financeiro" className="nav-item" activeProps={{ className: "nav-item-active" }}>
            <Wallet className="h-4 w-4" /> Financeiro
          </Link>}
          {can("users", "view") && <Link to="/usuarios" className="nav-item" activeProps={{ className: "nav-item-active" }}>
            <Users className="h-4 w-4" /> Usuários
          </Link>}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-6 py-4">
          <span className="font-semibold">Sistema de Agendamentos</span>
          <div className="flex items-center gap-2">
            {user.papel === "Suporte" && clinics.length > 0 && <label className="hidden items-center gap-2 text-xs sm:flex">
              <span className="text-muted-foreground">Consultório</span>
              <select aria-label="Consultório ativo" className="input max-w-48 py-1 text-xs" value={selectedClinicId} onChange={(event) => {
                const value = event.target.value;
                setSelectedClinicId(value);
                window.localStorage.setItem("storbem-support-clinic-id", value);
                window.location.reload();
              }}>
                {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
              </select>
            </label>}
            <div className="relative">
              <button aria-label="Cor do site" onClick={() => setPaleta(!paleta)} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
                <Palette className="h-4 w-4" />
              </button>
              {paleta && (
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border bg-popover p-3 shadow-lg">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Cor do site</p>
                  <div className="grid grid-cols-4 gap-2">
                    {CORES.map((c) => (
                      <button key={c.hue} title={c.nome} aria-label={c.nome}
                        onClick={() => change({ ...theme, hue: c.hue })}
                        className={`h-8 w-8 rounded-full border-2 ${theme.hue === c.hue ? "border-foreground" : "border-transparent"}`}
                        style={{ background: `oklch(0.55 0.2 ${c.hue})` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button aria-label={theme.dark ? "Modo claro" : "Modo noturno"} onClick={() => change({ ...theme, dark: !theme.dark })} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              {theme.dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="text-right text-sm leading-tight">
              <div className="font-medium capitalize">{user.usuario}</div>
              <div className="text-xs text-muted-foreground">{user.papel}</div>
            </div>
            <button aria-label="Sair" onClick={async () => { await logout(); nav({ to: "/" }); }} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
        <footer className="pb-4 text-center text-xs text-muted-foreground">Storbem © 2026</footer>
      </div>
    </div>
  );
}
