import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, List, Plus, LogOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getUser, logout, type User } from "@/lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const u = getUser();
    if (!u) nav({ to: "/" }); else setUser(u);
  }, [nav]);
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
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-6 py-4">
          <span className="font-semibold">Sistema de Agendamentos</span>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm leading-tight">
              <div className="font-medium capitalize">{user.usuario}</div>
              <div className="text-xs text-muted-foreground">{user.papel}</div>
            </div>
            <button aria-label="Sair" onClick={() => { logout(); nav({ to: "/" }); }} className="rounded-md p-2 text-muted-foreground hover:bg-accent">
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
