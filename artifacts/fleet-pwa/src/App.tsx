import { useEffect } from "react";
import { InstallGuard } from "@/components/install-guard";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { ManagerGuard } from "@/components/manager-guard";
import { Login } from "@/pages/login";
import { DriverDashboard } from "@/pages/driver-dashboard";
import { ChecklistPage } from "@/pages/checklist";
import { FuelLogPage } from "@/pages/fuel-log";
import { DriverRepairsPage } from "@/pages/driver-repairs";
import { ManagerDashboard } from "@/pages/manager-dashboard";
import { VehiclesPage } from "@/pages/vehicles";
import { DriversManagerPage } from "@/pages/drivers-manager";
import { SchedulePage } from "@/pages/schedule";
import { RepairsManagerPage } from "@/pages/repairs-manager";
import { CostsPage } from "@/pages/costs";
import { ProofViewerPage } from "@/pages/proof-viewer";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { supabase } from "@/lib/supabase";

import { 
  isHeadOfTeamsRole, 
  isManagerRole, 
  isSecurityRole, 
  isDriverRole, 
  cleanRoleString 
} from "@/lib/roles";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // 30s cache freshness
      gcTime: 300_000,
      refetchOnWindowFocus: true,
    },
  },
});

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType; allowedRoles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
      return;
    }
    if (!isLoading && user && allowedRoles) {
      const isRoleAllowed = allowedRoles.some(r => {
        if (r === "manager" || r === "admin") return isManagerRole(user.role);
        if (r === "head_of_teams" || r === "team_leader" || r === "team_head") return isHeadOfTeamsRole(user.role);
        if (r === "security") return isSecurityRole(user.role);
        if (r === "driver") return isDriverRole(user.role);
        return cleanRoleString(user.role) === cleanRoleString(r);
      });

      if (!isRoleAllowed) {
        if (isManagerRole(user.role)) {
          setLocation("/manager");
        } else if (isHeadOfTeamsRole(user.role)) {
          setLocation("/trip-requests");
        } else if (isSecurityRole(user.role)) {
          setLocation("/security-gate");
        } else {
          setLocation("/");
        }
      }
    }
  }, [user, isLoading, setLocation, allowedRoles]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return null;
  if (allowedRoles) {
    const isRoleAllowed = allowedRoles.some(r => {
      if (r === "manager" || r === "admin") return isManagerRole(user.role);
      if (r === "head_of_teams" || r === "team_leader" || r === "team_head") return isHeadOfTeamsRole(user.role);
      if (r === "security") return isSecurityRole(user.role);
      if (r === "driver") return isDriverRole(user.role);
      return cleanRoleString(user.role) === cleanRoleString(r);
    });
    if (!isRoleAllowed) return null;
  }
  return <Component />;
}

function RootRoute() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/login");
    if (!isLoading && user) {
      if (isManagerRole(user.role)) setLocation("/manager");
      else if (isSecurityRole(user.role)) setLocation("/security-gate");
      else if (isHeadOfTeamsRole(user.role)) setLocation("/trip-requests");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return null;
  if (isHeadOfTeamsRole(user.role)) {
    return <TripRequestsPage />;
  }
  return <DriverDashboard />;
}

function ManagerRoute() {
  return (
    <ManagerGuard>
      <ManagerDashboard />
    </ManagerGuard>
  );
}

import { SecurityGatePage } from "@/pages/security-gate";
import { GateTvPage } from "@/pages/gate-tv";
import { MaintenancePage } from "@/pages/maintenance";
import { AlertsPage } from "@/pages/alerts";
import { FuelReportsPage } from "@/pages/reports-fuel";
import { TripRequestsPage } from "@/pages/trip-requests";

import { ExportFuelPage } from "@/pages/export-fuel-page";
import { DbBackupPage } from "@/pages/db-backup-page";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/gate-tv" component={GateTvPage} />
      <Route path="/proof-viewer" component={ProofViewerPage} />
      <Route path="/api/export-fuel" component={ExportFuelPage} />
      <Route path="/dbbackup" component={DbBackupPage} />
      <Layout>
        <Switch>
          <Route path="/" component={RootRoute} />
          <Route path="/checklist" component={() => <ProtectedRoute component={ChecklistPage} allowedRoles={["driver", "manager", "admin", "security"]} />} />
          <Route path="/fuel" component={() => <ProtectedRoute component={FuelLogPage} allowedRoles={["driver", "manager", "admin"]} />} />
          <Route path="/repairs" component={() => <ProtectedRoute component={DriverRepairsPage} allowedRoles={["driver", "manager", "admin"]} />} />
          <Route path="/security-gate" component={() => <ProtectedRoute component={SecurityGatePage} allowedRoles={["security", "manager", "admin"]} />} />
          <Route path="/maintenance" component={() => <ProtectedRoute component={MaintenancePage} allowedRoles={["manager", "admin", "driver"]} />} />
          <Route path="/alerts" component={() => <ProtectedRoute component={AlertsPage} allowedRoles={["manager", "admin", "driver", "security", "team_leader", "head_of_teams", "team_head"]} />} />
          <Route path="/reports" component={() => <ProtectedRoute component={FuelReportsPage} allowedRoles={["manager", "admin"]} />} />
          <Route path="/trip-requests" component={() => <ProtectedRoute component={TripRequestsPage} allowedRoles={["team_leader", "head_of_teams", "team_head", "manager", "admin"]} />} />

          {/* Manager - guarded by ProtectedRoute & ManagerGuard */}
          <Route path="/manager" component={() => <ProtectedRoute component={ManagerRoute} allowedRoles={["manager", "admin"]} />} />
          <Route path="/vehicles" component={() => <ManagerGuard><ProtectedRoute component={VehiclesPage} allowedRoles={["manager", "admin"]} /></ManagerGuard>} />
          <Route path="/drivers" component={() => <ManagerGuard><ProtectedRoute component={DriversManagerPage} allowedRoles={["manager", "admin"]} /></ManagerGuard>} />
          <Route path="/schedule" component={() => <ManagerGuard><ProtectedRoute component={MaintenancePage} allowedRoles={["manager", "admin"]} /></ManagerGuard>} />
          <Route path="/repairs-manager" component={() => <ManagerGuard><ProtectedRoute component={RepairsManagerPage} allowedRoles={["manager", "admin"]} /></ManagerGuard>} />
          <Route path="/costs" component={() => <ManagerGuard><ProtectedRoute component={CostsPage} allowedRoles={["manager", "admin"]} /></ManagerGuard>} />

          <Route component={NotFound} />
        </Switch>
      </Layout>
    </Switch>
  );
}

function RealtimeSyncListener() {
  useRealtimeSync();
  return null;
}

import { GlobalTaskNotificationListener } from "@/components/global-task-notification-listener";

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");


    queryClient.prefetchQuery({
      queryKey: ["checklists"],
      queryFn: async () => (await supabase.from("checklists").select("*").order("submitted_at", { ascending: false })).data,
    });
    queryClient.prefetchQuery({
      queryKey: ["fuel_logs"],
      queryFn: async () => (await supabase.from("fuel_logs").select("*").order("date", { ascending: false })).data,
    });
    queryClient.prefetchQuery({
      queryKey: ["repairs"],
      queryFn: async () => (await supabase.from("repair_requests").select("*").order("created_at", { ascending: false })).data,
    });
    queryClient.prefetchQuery({
      queryKey: ["costs"],
      queryFn: async () => (await supabase.from("cost_entries").select("*").order("date", { ascending: false })).data,
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <RealtimeSyncListener />
        <TooltipProvider>
          <AuthProvider>
            <GlobalTaskNotificationListener />
            <InstallGuard>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </InstallGuard>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
