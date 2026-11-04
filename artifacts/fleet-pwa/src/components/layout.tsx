import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTripRequests } from "@/hooks/use-trip-requests";
import { 
  isHeadOfTeamsRole, 
  isManagerRole, 
  isSecurityRole, 
  getRoleDisplayName 
} from "@/lib/roles";
import { LanguageToggle } from "./language-toggle";
import { 
  LayoutDashboard, ClipboardCheck, Fuel, Wrench, Car, Users,
  CalendarDays, DollarSign, LogOut, MapPin, ListTodo, Shield, Send, BarChart3, Bell,
  ChevronDown, PlusCircle, Clock, CheckCircle2, ListOrdered
} from "lucide-react";
import { Button } from "./ui/button";
import { NotificationBell } from "./notification-bell";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [location] = useLocation();
  const [currentHash, setCurrentHash] = useState(() => typeof window !== "undefined" ? window.location.hash : "");

  const { requests = [] } = useTripRequests();

  useEffect(() => {
    const handleHash = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  if (!user) return <>{children}</>;

  const isManager = isManagerRole(user.role);
  const isSecurity = isSecurityRole(user.role);
  const isHeadOfTeams = isHeadOfTeamsRole(user.role);

  const waitingCount = requests.filter(r => r.status === "waiting" && (r.requesterId === user.id || isManager)).length;
  const assignedCount = requests.filter(r => r.status === "assigned" && (r.requesterId === user.id || isManager)).length;
  const totalMyCount = requests.filter(r => r.requesterId === user.id || isManager).length;

  const driverNav = [
    { href: "/", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/checklist", label: t("checklist"), icon: ClipboardCheck },
    { href: "/fuel", label: t("fuel"), icon: Fuel },
    { href: "/repairs", label: t("repairs"), icon: Wrench },
    { href: "/maintenance", label: t("maintenance"), icon: CalendarDays },
    { href: "/alerts", label: t("alerts"), icon: Bell },
    { href: "/gate-tv", label: t("gateTv"), icon: Shield },
  ];

  const securityNav = [
    { href: "/security-gate", label: t("securityGate"), icon: Shield },
    { href: "/checklist", label: t("checklist"), icon: ClipboardCheck },
    { href: "/alerts", label: t("alerts"), icon: Bell },
    { href: "/gate-tv", label: t("gateTv"), icon: Shield },
  ];

  const headOfTeamsNav = [
    { href: "/trip-requests", label: "Trip Requests", icon: Send },
  ];

  const managerNav = [
    { href: "/manager", label: "Admin", icon: LayoutDashboard },
    { href: "/reports", label: "Fuel Reports", icon: BarChart3 },
    { href: "/manager#vehicles", label: t("vehicles"), icon: Car },
    { href: "/manager#drivers", label: t("drivers"), icon: Users },
    { href: "/manager#drivers-shift", label: "Shifts", icon: CalendarDays },
    { href: "/maintenance", label: t("maintenance"), icon: CalendarDays },
    { href: "/manager#repairs", label: t("repairs"), icon: Wrench },
    { href: "/alerts", label: t("alerts"), icon: Bell },
    { href: "/manager#gps", label: "GPS Map", icon: MapPin },
    { href: "/manager#tasks", label: t("tasks"), icon: ListTodo },
    { href: "/manager#trip-requests", label: "Trip Requests", icon: Send },
    { href: "/gate-tv", label: t("gateTv"), icon: Shield },
    { href: "/security-gate", label: t("securityGate"), icon: Shield },
  ];

  const nav = isManager
    ? managerNav 
    : isSecurity 
    ? securityNav 
    : isHeadOfTeams
    ? headOfTeamsNav 
    : driverNav;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background text-foreground">
      {/* Sidebar for md+ */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="w-5 h-5" />
            <span className="font-bold tracking-tight uppercase">FLEET<span className="text-foreground">OPS</span></span>
          </div>
          {isManager && <NotificationBell />}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {isHeadOfTeams ? (
            // Dedicated Head of Teams View: ONLY Trip Requests, Auto-expanded & Highlighted
            <div className="space-y-3 pt-1">
              <div className="px-2 pb-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Transport Dispatch
                </p>
              </div>

              {/* Main Auto-expanded Trip Requests Card */}
              <div className="rounded-2xl border border-primary/40 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent p-3 shadow-lg shadow-primary/10 space-y-3">
                <Link
                  href="/trip-requests"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/25 transition-all hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center shrink-0 border border-white/20">
                      <Send className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold tracking-tight flex items-center gap-1.5 leading-none">
                        Trip Requests
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      </p>
                      <p className="text-[10px] font-medium text-white/80 mt-0.5">
                        Team Portal
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-primary-foreground/80" />
                </Link>

                {/* Auto-expanded sub-actions */}
                <div className="space-y-1 pl-1">
                  <Link
                    href="/trip-requests#new-form"
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-foreground hover:bg-primary/15 hover:text-primary transition-colors border border-border/40 bg-card/60"
                  >
                    <span className="flex items-center gap-2">
                      <PlusCircle className="w-3.5 h-3.5 text-primary" />
                      New Request
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      4-Box
                    </span>
                  </Link>

                  <Link
                    href="/trip-requests#waiting"
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-amber-500/15 hover:text-amber-400 transition-colors border border-border/30 bg-card/40"
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      Pending Dispatch
                    </span>
                    {waitingCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        {waitingCount}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/trip-requests#assigned"
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors border border-border/30 bg-card/40"
                  >
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Driver Assigned
                    </span>
                    {assignedCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {assignedCount}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/trip-requests#all"
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <ListOrdered className="w-3.5 h-3.5" />
                      All Requests
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {totalMyCount}
                    </span>
                  </Link>
                </div>
              </div>

              {/* Real-time Fleet Link Status Notice */}
              <div className="bg-secondary/40 border border-border/60 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 text-foreground font-semibold text-[11px] uppercase tracking-wide">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  Direct Fleet Link
                </div>
                <p className="text-[11px] leading-relaxed">
                  Requests are instantly notified to Fleet Manager to dispatch free drivers and vehicles.
                </p>
              </div>
            </div>
          ) : isManager ? (
            // Manager: links with hash routing
            <>
              <Link href="/manager" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${location === "/manager" && (!currentHash || currentHash === "#overview") ? "bg-primary text-primary-foreground" : "hover:bg-sidebar-accent text-sidebar-foreground"}`}>
                <LayoutDashboard className="w-4 h-4" />
                Admin Dashboard
              </Link>
              <div className="pt-2 pb-1 px-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quick Links</p>
              </div>
              {[
                { label: "Vehicles", icon: Car, href: "/manager#vehicles" },
                { label: "Drivers", icon: Users, href: "/manager#drivers" },
                { label: "Drivers Shift", icon: CalendarDays, href: "/manager#drivers-shift" },
                { label: "Repairs", icon: Wrench, href: "/manager#repairs" },
                { label: "Costs", icon: DollarSign, href: "/manager#costs" },
                { label: "GPS Map", icon: MapPin, href: "/manager#gps" },
                { label: "Tasks", icon: ListTodo, href: "/manager#tasks" },
                { label: "Trip Requests", icon: Send, href: "/manager#trip-requests" },
              ].map(({ label, icon: Icon, href }) => {
                const isActive = location === "/manager" && currentHash === `#${href.split("#")[1]}`;
                return (
                  <Link key={label} href={href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors font-medium ${isActive ? "bg-primary/15 text-primary" : "hover:bg-sidebar-accent text-sidebar-foreground"}`}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </>
          ) : (
            // Regular driver or security
            nav.map(item => (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${location === item.href ? "bg-primary text-primary-foreground font-medium" : "hover:bg-sidebar-accent text-sidebar-foreground"}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))
          )}
        </nav>

        {/* User Card & Controls at Bottom of Sidebar */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate text-foreground">{user.name}</span>
              <span className="text-xs text-primary font-bold">
                {getRoleDisplayName(user.role)}
              </span>
            </div>
          </div>
          <div className="pt-1">
            <LanguageToggle className="w-full justify-center" />
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground hover:text-foreground text-sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            {t("logout")}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-24 md:pb-6 overflow-y-auto min-h-screen">
        {/* Top bar for mobile only */}
        <div className="md:hidden flex items-center justify-between p-3 border-b border-border bg-card sticky top-0 z-40">
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="w-4 h-4" />
            <span className="font-bold tracking-tight uppercase text-sm">FLEET<span className="text-foreground">OPS</span></span>
            {isHeadOfTeams && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase ml-1">
                Head of Teams
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {isManager && <NotificationBell />}
            <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-muted-foreground">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {children}
      </main>

      {/* Bottom Nav for mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar/95 backdrop-blur-md border-t border-sidebar-border flex items-center justify-around p-2 pb-safe z-50 shadow-2xl">
        {isHeadOfTeams ? (
          // Mobile Head of Teams: Dedicated, high-contrast, responsive bottom navigation
          <div className="w-full flex items-center justify-between gap-2.5 px-2 py-1 max-w-lg mx-auto">
            <Link
              href="/trip-requests"
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl font-bold text-xs border transition-all ${
                location === "/trip-requests" && (!currentHash || currentHash === "#all" || currentHash === "#waiting" || currentHash === "#assigned")
                  ? "bg-secondary text-foreground border-border shadow-sm"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <ListOrdered className="w-4 h-4 text-primary" />
              <span>My Requests</span>
              {waitingCount > 0 ? (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {waitingCount}
                </span>
              ) : totalMyCount > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                  {totalMyCount}
                </span>
              ) : null}
            </Link>

            <Link
              href="/trip-requests#new-form"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-bold text-xs shadow-lg shadow-primary/25 border border-primary/40 active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">New Request</span>
            </Link>
          </div>
        ) : isManager ? (
          // Manager mobile: key admin links
          <>
            <Link href="/manager" className={`flex flex-col items-center p-2 rounded-xl min-w-[52px] ${location === "/manager" && (!currentHash || currentHash === "#overview") ? "text-primary" : "text-muted-foreground"}`}>
              <LayoutDashboard className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">Admin</span>
            </Link>
            <Link href="/manager#vehicles" className={`flex flex-col items-center p-2 rounded-xl min-w-[52px] ${location === "/manager" && currentHash === "#vehicles" ? "text-primary" : "text-muted-foreground"}`}>
              <Car className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">Vehicles</span>
            </Link>
            <Link href="/manager#repairs" className={`flex flex-col items-center p-2 rounded-xl min-w-[52px] ${location === "/manager" && currentHash === "#repairs" ? "text-primary" : "text-muted-foreground"}`}>
              <Wrench className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">Repairs</span>
            </Link>
            <Link href="/manager#tasks" className={`flex flex-col items-center p-2 rounded-xl min-w-[52px] ${location === "/manager" && currentHash === "#tasks" ? "text-primary" : "text-muted-foreground"}`}>
              <ListTodo className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">Tasks</span>
            </Link>
            <Link href="/manager#trip-requests" className={`flex flex-col items-center p-2 rounded-xl min-w-[52px] ${location === "/manager" && currentHash === "#trip-requests" ? "text-primary" : "text-muted-foreground"}`}>
              <Send className="w-5 h-5 mb-0.5" />
              <span className="text-[9px] font-medium">Trips</span>
            </Link>
          </>
        ) : (
          // Driver / Security mobile bottom links
          nav.map(item => (
            <Link key={item.href} href={item.href} className={`flex flex-col items-center p-2 rounded-xl min-w-[56px] ${location === item.href ? "text-primary font-bold" : "text-muted-foreground"}`}>
              <item.icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          ))
        )}
      </nav>
    </div>
  );
}
