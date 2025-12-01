import { Link, useLocation } from "wouter";
import { useAppStore } from "@/lib/store";
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
  ChevronRight
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import logoImage from "@assets/generated_images/academic_logo_for_poluazticali.png";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAppStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // Collapsible states
  const [isGenerateOpen, setIsGenerateOpen] = useState(true);
  const [isUsersOpen, setIsUsersOpen] = useState(true);

  const isAdmin = user?.role === 'sys_admin';
  const isServices = user?.role === 'servicios_escolares';
  
  const canAccessCertificates = isAdmin || isServices;
  const canAccessAdmin = isAdmin;

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border/50">
        <img src={logoImage} alt="Poluazticali Logo" className="w-8 h-8 object-contain bg-white rounded-sm" />
        <span className="text-xl font-serif font-bold tracking-tight">Poluazticali</span>
      </div>
      
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <Link href="/dashboard">
          <a 
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200
              ${location === '/dashboard' 
                ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md' 
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
            `}
            onClick={onClose}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </a>
        </Link>

        {canAccessCertificates && (
            <Collapsible open={isGenerateOpen} onOpenChange={setIsGenerateOpen} className="space-y-1">
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md group">
                    <div className="flex items-center gap-3">
                        <GraduationCap className="w-4 h-4" />
                        Generate Diplomas
                    </div>
                    {isGenerateOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pl-4">
                    {[
                        { label: 'Configuration', href: '/configuration', icon: Settings },
                        { label: 'Templates', href: '/templates', icon: FileBadge },
                        { label: 'Signatures', href: '/signatures', icon: FileSignature },
                        { label: 'Generate', href: '/generate', icon: Cpu },
                    ].map(item => (
                        <Link key={item.href} href={item.href}>
                            <a 
                                className={`
                                    flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200
                                    ${location === item.href 
                                        ? 'bg-sidebar-primary/10 text-sidebar-primary' 
                                        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}
                                `}
                                onClick={onClose}
                            >
                                <item.icon className="w-3.5 h-3.5" />
                                {item.label}
                            </a>
                        </Link>
                    ))}
                </CollapsibleContent>
            </Collapsible>
        )}

        {canAccessAdmin && (
            <Collapsible open={isUsersOpen} onOpenChange={setIsUsersOpen} className="space-y-1">
                <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md group">
                    <div className="flex items-center gap-3">
                        <Users className="w-4 h-4" />
                        Users & Roles
                    </div>
                    {isUsersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-1 pl-4">
                     <Link href="/users">
                        <a 
                            className={`
                                flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200
                                ${location === '/users' 
                                    ? 'bg-sidebar-primary/10 text-sidebar-primary' 
                                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'}
                            `}
                            onClick={onClose}
                        >
                            <Users className="w-3.5 h-3.5" />
                            Manage Users
                        </a>
                    </Link>
                </CollapsibleContent>
            </Collapsible>
        )}
      </nav>

      <div className="p-4 border-t border-sidebar-border/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <Avatar className="h-8 w-8 border border-sidebar-border">
            <AvatarImage src={user?.photoUrl} />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role.replace('_', ' ')}</p>
          </div>
        </div>
        <Button 
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
          <span className="font-serif font-bold">Poluazticali</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground">
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
