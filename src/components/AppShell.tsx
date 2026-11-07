import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, List, Plus, LogOut, Wallet, Users, Moon, Sun, Palette } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentUser, logout } from "@/lib/auth";
import { isAdmin, type User } from "@/lib/store";
import { CORES, getTheme, setTheme, type Theme } from "@/lib/theme";

export function AppShell({ children, adminOnly, medicoOnly }: { children: ReactNode; adminOnly?: boolean; medicoOnly?: boolean }) {
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [theme, setT] = useState<Theme>({ dark: false, hue: 262 });
  const [paleta, setPaleta] = useState(false);

  useEffect(() => {
    let active = true;
    setT(getTheme());

    const checkUser = async () => {
      const current = await getCurrentUser();
      if (!active) return;
      if (!current) {
        setUser(null);
        nav({ to: "/" });
      } else if ((adminOnly && !isAdmin(current)) || (medicoOnly && current.papel !== "Médico")) {
        nav({ to: "/agendamentos" });
      } else {
        setUser(current);
      }
    };

    void checkUser();
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/supabase/client").then(({ createClient }) => {
      if (!active) return;
      const { data } = createClient().auth.onAuthStateChange((_event, session) => {
        if (!session) {
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
      unsubscribe?.();
    };
  }, [nav, adminOnly, medicoOnly]);

  const change = (t: Theme) => { setT(t); setTheme(t); };
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-muted">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-6 text-lg font-semibold">
          <CalendarDays className="h-5 w-5" /> Dr. Ricardo
        </div>
        <nav className="flex flex-col gap-1 px-3 text-sm">
          <Link to="/agendamentos" activeOptions={{ exact: true }} className="nav-item" activeProps={{ className: "nav-item-active" }}>
            <List className="h-4 w-4" /> Agendamentos
          </Link>
          <Link to="/agendamentos/novo" className="nav-item" activeProps={{ className: "nav-item-active" }}>
            <Plus className="h-4 w-4" /> Novo Agendamento
          </Link>
          {isAdmin(user) && (
            <Link to="/financeiro" className="nav-item" activeProps={{ className: "nav-item-active" }}>
              <Wallet className="h-4 w-4" /> Financeiro
            </Link>
          )}
          {user.papel === "Médico" && (
            <Link to="/usuarios" className="nav-item" activeProps={{ className: "nav-item-active" }}>
              <Users className="h-4 w-4" /> Usuários
            </Link>
          )}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-6 py-4">
          <span className="font-semibold">Sistema de Agendamentos</span>
          <div className="flex items-center gap-2">
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
