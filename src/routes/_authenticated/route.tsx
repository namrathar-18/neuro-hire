import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles, useAuth } from "@/lib/use-auth";
import { Brain, LogOut, LayoutDashboard, Briefcase, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user } = useAuth();
  const { roles, loading } = useMyRoles();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // No role yet → onboarding
  if (!loading && roles.length === 0) {
    return <Outlet />;
  }

  const isRecruiter = roles.includes("recruiter");

  return (
    <div className="min-h-screen flex" style={{ background: "var(--gradient-hero)" }}>
      <aside className="w-60 shrink-0 border-r border-border bg-sidebar/60 p-4 backdrop-blur">
        <Link to="/dashboard" className="mb-8 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">NeuroHire</span>
        </Link>
        <nav className="space-y-1 text-sm">
          <NavLink to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</NavLink>
          <NavLink to="/jobs" icon={<Briefcase className="h-4 w-4" />}>Jobs</NavLink>
          {!isRecruiter && <NavLink to="/applications" icon={<FileText className="h-4 w-4" />}>My Applications</NavLink>}
          {isRecruiter && <NavLink to="/recruiter/jobs/new" icon={<Plus className="h-4 w-4" />}>Post a Job</NavLink>}
        </nav>
        <div className="absolute bottom-4 left-4 right-auto w-52">
          <div className="mb-2 truncate text-xs text-muted-foreground">{user?.email}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start"><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-foreground" }}>
      {icon}{children}
    </Link>
  );
}