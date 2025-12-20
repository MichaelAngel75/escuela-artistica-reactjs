import { useLocation } from "wouter";
// import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  FileSignature,
  FileBadge,
  Cpu,
  Settings,
  Users,
  LogOut,
  Menu,
  GraduationCap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import logoImage from "@assets/generated_images/academic_logo_for_Pohualizcalli.png";

type Props = { children: React.ReactNode };

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function DashboardLayout({ children }: Props) {
  const [location, setLocation] = useLocation();
  // const { user, logout } = useAppStore();
  // const { user,  isLoading, isAuthenticated } = useAuth();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Collapsible states
  const [isGenerateOpen, setIsGenerateOpen] = useState(true);
  const [isUsersOpen, setIsUsersOpen] = useState(true);

  // Align with your enum: student | teacher | admin | servicios_escolares
  console.log(":: debug :: ==> role:", user?.role);
  console.log(":: debug :: ==> isAuthenticated:", isAuthenticated);
  console.log(":: debug :: ==> isLoading:", isLoading);
  
  console.log(":: debug :: ==> user:", user);
  const isAdmin = user?.role === "admin";
  const isServices = user?.role === "servicios_escolares";
  const canAccessCertificates = isAdmin || isServices;
  const canAccessAdmin = isAdmin;

  const navigate = (href: string, onClose?: () => void) => {
    setLocation(href);
    onClose?.();
  };

  const NavButton = ({
    href,
    active,
    onClose,
    children,
    className,
  }: {
    href: string;
    active: boolean;
    onClose?: () => void;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => navigate(href, onClose)}
      className={cx(
        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className,
      )}
    >
      {children}
    </button>
  );

  const SubNavButton = ({
    href,
    active,
    onClose,
    icon: Icon,
    label,
  }: {
    href: string;
    active: boolean;
    onClose?: () => void;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => navigate(href, onClose)}
      className={cx(
        "w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200",
        active
          ? "bg-sidebar-primary/10 text-sidebar-primary"
          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
        <img
          src={logoImage}
          alt="Pohualizcalli Logo"
          className="w-8 h-8 object-contain bg-white rounded-sm"
        />
        <span className="text-xl font-serif font-bold tracking-tight">
          Pohualizcalli
        </span>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <NavButton
          href="/dashboard"
          active={location === "/dashboard"}
          onClose={onClose}
        >
          <LayoutDashboard className="w-4 h-4" />
          Dashboard
        </NavButton>

        {canAccessCertificates && (
          <Collapsible
            open={isGenerateOpen}
            onOpenChange={setIsGenerateOpen}
            className="space-y-1"
          >
            <CollapsibleTrigger
              type="button"
              className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md group"
            >
              <div className="flex items-center gap-3">
                <GraduationCap className="w-4 h-4" />
                Generacion Diploma
              </div>
              {isGenerateOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-1 pl-4">
              <SubNavButton
                href="/configuration"
                active={location === "/configuration"}
                onClose={onClose}
                icon={Settings}
                label="Configuracion"
              />
              <SubNavButton
                href="/templates"
                active={location === "/templates"}
                onClose={onClose}
                icon={FileBadge}
                label="Diseños"
              />
              <SubNavButton
                href="/signatures"
                active={location === "/signatures"}
                onClose={onClose}
                icon={FileSignature}
                label="Firmas"
              />
              <SubNavButton
                href="/generate"
                active={location === "/generate"}
                onClose={onClose}
                icon={Cpu}
                label="Generar Diplomas"
              />
            </CollapsibleContent>
          </Collapsible>
        )}

        {canAccessAdmin && (
          <Collapsible
            open={isUsersOpen}
            onOpenChange={setIsUsersOpen}
            className="space-y-1"
          >
            <CollapsibleTrigger
              type="button"
              className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md group"
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4" />
                Users &amp; Roles
              </div>
              {isUsersOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-1 pl-4">
              <SubNavButton
                href="/users"
                active={location === "/users"}
                onClose={onClose}
                icon={Users}
                label="Manage Users"
              />
            </CollapsibleContent>
          </Collapsible>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-8 w-8 border border-sidebar-border">
            <AvatarImage src={user?.profileImageUrl} />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">
              {(user?.role ?? "user").replaceAll("_", " ")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => logout()}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile Nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 border-b bg-sidebar z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-sidebar-foreground">
          <img src={logoImage} alt="Logo" className="w-6 h-6 bg-white rounded-sm" />
          <span className="font-serif font-bold">Pohualizcalli</span>
        </div>

        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="text-sidebar-foreground">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>

          <SheetContent side="left" className="p-0 w-64 border-r-0 bg-sidebar text-sidebar-foreground">
            <SidebarContent onClose={() => setIsMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto md:h-screen pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
