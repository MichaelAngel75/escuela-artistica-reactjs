import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import SignaturesPage from "@/pages/signatures";
import TemplatesPage from "@/pages/templates";
import GeneratePage from "@/pages/generate";
import UsersPage from "@/pages/users";
import ConfigurationPage from "@/pages/configuration";
import NotFound from "@/pages/not-found";
import { useAppStore } from "@/lib/store";
import { useAuth } from "./hooks/useAuth";
import { AppBootstrap } from "./pages/AppBootstrap";


function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Checking authentication…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      
      <Route path="/dashboard">
        {() => <PrivateRoute component={Dashboard} />}
      </Route>
      <Route path="/signatures">
        {() => <PrivateRoute component={SignaturesPage} />}
      </Route>
      <Route path="/templates">
        {() => <PrivateRoute component={TemplatesPage} />}
      </Route>
      <Route path="/generate">
        {() => <PrivateRoute component={GeneratePage} />}
      </Route>
      <Route path="/users">
        {() => <PrivateRoute component={UsersPage} />}
      </Route>
      <Route path="/configuration">
        {() => <PrivateRoute component={ConfigurationPage} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrap />
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
