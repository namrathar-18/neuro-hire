import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles, type AppRole } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Briefcase, Users, FileCheck, Sparkles, UserCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · NeuroHire AI" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const { roles, loading } = useMyRoles();

  if (loading) return <Shell><div className="text-muted-foreground">Loading…</div></Shell>;
  if (roles.length === 0) return <RoleOnboarding />;

  const isRecruiter = roles.includes("recruiter");
  return isRecruiter ? <RecruiterDashboard userId={user!.id} /> : <CandidateDashboard userId={user!.id} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl p-8">{children}</div>;
}

function RoleOnboarding() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<AppRole | null>(null);

  async function pick(role: AppRole) {
    if (!user) return;
    setBusy(role);
    const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role });
    setBusy(null);
    if (error) return toast.error(error.message);
    window.location.href = "/dashboard";
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl pt-12 text-center">
        <Sparkles className="mx-auto mb-4 h-10 w-10 text-primary" />
        <h1 className="text-3xl font-bold">How will you use NeuroHire?</h1>
        <p className="mt-2 text-muted-foreground">Pick one to get started — you can change this later.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <button onClick={() => pick("candidate")} disabled={busy !== null} className="rounded-2xl border border-border bg-card/60 p-8 text-left transition hover:border-primary/50">
            <UserCircle2 className="mb-3 h-8 w-8 text-primary" />
            <h3 className="text-lg font-semibold">I'm a candidate</h3>
            <p className="mt-1 text-sm text-muted-foreground">Apply to jobs, upload your resume, and chat with the AI interviewer.</p>
          </button>
          <button onClick={() => pick("recruiter")} disabled={busy !== null} className="rounded-2xl border border-border bg-card/60 p-8 text-left transition hover:border-primary/50">
            <Building2 className="mb-3 h-8 w-8 text-primary" />
            <h3 className="text-lg font-semibold">I'm a recruiter</h3>
            <p className="mt-1 text-sm text-muted-foreground">Post jobs, view ranked applicants, and review AI interview scorecards.</p>
          </button>
        </div>
      </div>
    </Shell>
  );
}

function CandidateDashboard({ userId }: { userId: string }) {
  const [stats, setStats] = useState({ applications: 0, interviews: 0, openJobs: 0 });

  useEffect(() => {
    (async () => {
      const [{ count: apps }, { count: jobs }, { data: interviewed }] = await Promise.all([
        supabase.from("applications").select("id", { count: "exact", head: true }).eq("candidate_id", userId),
        supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("applications").select("id, status").eq("candidate_id", userId).eq("status", "interviewed"),
      ]);
      setStats({ applications: apps ?? 0, interviews: interviewed?.length ?? 0, openJobs: jobs ?? 0 });
    })();
  }, [userId]);

  return (
    <Shell>
      <h1 className="text-3xl font-bold">Welcome back</h1>
      <p className="text-muted-foreground">Your application activity at a glance.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat icon={Briefcase} label="Open jobs" value={stats.openJobs} />
        <Stat icon={FileCheck} label="Your applications" value={stats.applications} />
        <Stat icon={Sparkles} label="Interviews completed" value={stats.interviews} />
      </div>
      <div className="mt-8 flex gap-3">
        <Button asChild><Link to="/jobs">Browse jobs</Link></Button>
        <Button asChild variant="outline"><Link to="/applications">My applications</Link></Button>
      </div>
    </Shell>
  );
}

function RecruiterDashboard({ userId }: { userId: string }) {
  const [stats, setStats] = useState({ jobs: 0, applicants: 0, interviewed: 0 });
  useEffect(() => {
    (async () => {
      const { data: jobs } = await supabase.from("jobs").select("id").eq("recruiter_id", userId);
      const jobIds = (jobs ?? []).map((j) => j.id);
      const apps = jobIds.length
        ? (await supabase.from("applications").select("id, status").in("job_id", jobIds)).data ?? []
        : [];
      setStats({
        jobs: jobs?.length ?? 0,
        applicants: apps.length,
        interviewed: apps.filter((a) => a.status === "interviewed").length,
      });
    })();
  }, [userId]);

  return (
    <Shell>
      <h1 className="text-3xl font-bold">Recruiter dashboard</h1>
      <p className="text-muted-foreground">Your active hiring pipeline.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Stat icon={Briefcase} label="Active jobs" value={stats.jobs} />
        <Stat icon={Users} label="Total applicants" value={stats.applicants} />
        <Stat icon={FileCheck} label="Interviewed" value={stats.interviewed} />
      </div>
      <div className="mt-8 flex gap-3">
        <Button asChild><Link to="/recruiter/jobs/new">Post a new job</Link></Button>
        <Button asChild variant="outline"><Link to="/jobs">View jobs</Link></Button>
      </div>
    </Shell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur" style={{ boxShadow: "var(--shadow-card)" }}>
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}