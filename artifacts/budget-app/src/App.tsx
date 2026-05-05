import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import NotFound from "@/pages/not-found";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AllocationBoard from "./pages/AllocationBoard";
import Requests from "./pages/Requests";
import NegotiationPanel from "./pages/NegotiationPanel";
import AdminPanel from "./pages/AdminPanel";
import AuditLogs from "./pages/AuditLogs";
import FinanceDashboard from "./pages/FinanceDashboard";
import LocationAdminDashboard from "./pages/LocationAdminDashboard";
import { useEffect } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({
  component: Component,
  requireFinance,
  requireLocationAdmin,
  requireElevated,
}: {
  component: React.ComponentType;
  requireFinance?: boolean;
  requireLocationAdmin?: boolean;
  requireElevated?: boolean;
}) {
  const { user, isFinanceManager, isLocationAdmin, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) { setLocation("/login"); return; }
    if (requireFinance && !isFinanceManager) { setLocation("/dashboard"); return; }
    if (requireLocationAdmin && !isLocationAdmin) { setLocation("/dashboard"); return; }
    if (requireElevated && !isAdmin) { setLocation("/dashboard"); return; }
  }, [user, isFinanceManager, isLocationAdmin, isAdmin, requireFinance, requireLocationAdmin, requireElevated, setLocation]);

  if (!user) return null;
  if (requireFinance && !isFinanceManager) return null;
  if (requireLocationAdmin && !isLocationAdmin) return null;
  if (requireElevated && !isAdmin) return null;
  return <Component />;
}

function RootRedirect() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(user ? "/dashboard" : "/login");
  }, [user, setLocation]);
  return null;
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/allocation">{() => <ProtectedRoute component={AllocationBoard} />}</Route>
      <Route path="/requests">{() => <ProtectedRoute component={Requests} />}</Route>
      <Route path="/negotiation/:id?">{() => <ProtectedRoute component={() => <NegotiationPanel />} />}</Route>
      <Route path="/finance">{() => <ProtectedRoute component={FinanceDashboard} requireFinance />}</Route>
      <Route path="/location-admin">{() => <ProtectedRoute component={LocationAdminDashboard} requireLocationAdmin />}</Route>
      <Route path="/admin">{() => <ProtectedRoute component={AdminPanel} requireElevated />}</Route>
      <Route path="/audit">{() => <ProtectedRoute component={AuditLogs} requireElevated />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SocketProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRouter />
            </WouterRouter>
            <Toaster />
          </SocketProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
