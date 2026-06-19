import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/jobs/")({
  head: () => ({ meta: [{ title: "Jobs · NeuroHire AI" }] }),
  component: JobsIndex,
});

function JobsIndex() {
  const [jobs, setJobs] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("jobs").select("*").eq("status", "open").order("created_at", { ascending: false })
      .then(({ data }) => setJobs(data ?? []));
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="text-3xl font-bold">Open jobs</h1>
      <p className="text-muted-foreground">Click any role to apply and start an AI interview.</p>
      <div className="mt-8 grid gap-4">
        {jobs.length === 0 && <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">No jobs posted yet.</div>}
        {jobs.map((j) => (
          <Link key={j.id} to="/jobs/$jobId" params={{ jobId: j.id }} className="rounded-2xl border border-border bg-card/60 p-6 transition hover:border-primary/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">{j.title}</h3>
                <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{j.company}</span>
                  {j.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>}
                  {j.employment_type && <Badge variant="secondary">{j.employment_type}</Badge>}
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{j.description}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(j.skills ?? []).slice(0, 6).map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}