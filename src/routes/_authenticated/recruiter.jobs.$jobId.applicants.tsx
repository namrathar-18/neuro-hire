import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recruiter/jobs/$jobId/applicants")({
  head: () => ({ meta: [{ title: "Applicants · NeuroHire AI" }] }),
  component: Applicants,
});

function Applicants() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<any>(null);
  const [apps, setApps] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle().then(({ data }) => setJob(data));
    load();
  }, [jobId]);

  function load() {
    supabase.from("applications").select("*, profiles!applications_candidate_id_fkey(full_name)").eq("job_id", jobId)
      .then(({ data }) => {
        const sorted = (data ?? []).slice().sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
        setApps(sorted);
      });
  }

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("applications").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(status); load(); }
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <Link to="/jobs/$jobId" params={{ jobId }} className="text-sm text-muted-foreground hover:underline">← Back to job</Link>
      <h1 className="mt-2 text-3xl font-bold">{job?.title}</h1>
      <p className="text-muted-foreground">{apps.length} applicant{apps.length === 1 ? "" : "s"}, ranked by AI score</p>

      <div className="mt-8 grid gap-3">
        {apps.length === 0 && <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">No applicants yet.</div>}
        {apps.map((a, i) => (
          <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card/60 p-5 transition hover:border-primary/50">
            <Link to="/recruiter/applications/$appId" params={{ appId: a.id }} className="flex flex-1 items-center gap-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-semibold">{i + 1}</div>
              <div>
                <div className="font-semibold">{a.profiles?.full_name ?? "Candidate"}</div>
                <div className="text-xs text-muted-foreground">Skill match: {a.skill_match_score ?? "—"}% · {a.status}</div>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              {a.overall_score != null && <div className="text-right"><div className="text-2xl font-bold text-primary">{Math.round(a.overall_score)}</div><div className="text-xs text-muted-foreground">overall</div></div>}
              <Badge variant={a.recommendation === "strong_hire" || a.recommendation === "hire" ? "default" : "secondary"}>{a.recommendation ?? a.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "shortlisted")}>Shortlist</Button>
              <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "rejected")}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}