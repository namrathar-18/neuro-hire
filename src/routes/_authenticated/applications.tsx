import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({ meta: [{ title: "My applications · NeuroHire AI" }] }),
  component: Apps,
});

function Apps() {
  const { user } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from("applications").select("*, jobs(title, company)").eq("candidate_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setApps(data ?? []));
  }, [user]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-bold">My applications</h1>
      <div className="mt-8 grid gap-3">
        {apps.length === 0 && <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">No applications yet. <Link to="/jobs" className="text-primary underline">Browse jobs</Link></div>}
        {apps.map((a) => (
          <Link key={a.id} to="/interview/$applicationId" params={{ applicationId: a.id }} className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-5 transition hover:border-primary/50">
            <div>
              <div className="font-semibold">{a.jobs?.title}</div>
              <div className="text-sm text-muted-foreground">{a.jobs?.company}</div>
            </div>
            <div className="flex items-center gap-3">
              {a.overall_score != null && <div className="text-right"><div className="text-2xl font-bold text-primary">{Math.round(a.overall_score)}</div><div className="text-xs text-muted-foreground">score</div></div>}
              <Badge variant={a.status === "interviewed" ? "default" : "secondary"}>{a.status}</Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}