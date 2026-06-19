import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Briefcase, MapPin, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { parseResume } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/jobs/$jobId")({
  head: () => ({ meta: [{ title: "Job · NeuroHire AI" }] }),
  component: JobDetail,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const { roles } = useMyRoles();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [app, setApp] = useState<any>(null);
  const [resumeText, setResumeText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const parseFn = useServerFn(parseResume);

  useEffect(() => {
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle().then(({ data }) => setJob(data));
    if (user) {
      supabase.from("applications").select("*").eq("job_id", jobId).eq("candidate_id", user.id).maybeSingle()
        .then(({ data }) => setApp(data));
    }
  }, [jobId, user]);

  const isRecruiter = roles.includes("recruiter");
  const isOwnPosting = isRecruiter && job?.recruiter_id === user?.id;

  async function readFile(f: File): Promise<string> {
    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      try {
        toast.info("Extracting text from PDF…");
        const pdfjs: any = await import("pdfjs-dist");
        // Use worker from CDN matching installed version
        const workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = "";
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          out += tc.items.map((it: any) => it.str).join(" ") + "\n\n";
        }
        return out.trim();
      } catch (e: any) {
        toast.error("Could not read PDF — please paste your resume instead.");
        return "";
      }
    }
    return await f.text();
  }

  async function submit() {
    if (!user) return;
    if (resumeText.trim().length < 50) return toast.error("Paste your resume (at least 50 chars).");
    setBusy(true);
    try {
      // Upload resume text as a .txt file
      const path = `${user.id}/${jobId}-${Date.now()}.txt`;
      const { error: upErr } = await supabase.storage.from("resumes").upload(path, new Blob([resumeText], { type: "text/plain" }));
      if (upErr) throw upErr;

      const { data: newApp, error } = await supabase.from("applications")
        .insert({ job_id: jobId, candidate_id: user.id, resume_path: path, resume_text: resumeText, status: "submitted" })
        .select("*").single();
      if (error) throw error;

      toast.info("Parsing your resume with AI…");
      await parseFn({ data: { applicationId: newApp.id, resumeText } });
      toast.success("Application submitted!");
      navigate({ to: "/interview/$applicationId", params: { applicationId: newApp.id } });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to apply");
    } finally {
      setBusy(false);
    }
  }

  if (!job) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="rounded-2xl border border-border bg-card/60 p-8" style={{ boxShadow: "var(--shadow-card)" }}>
        <h1 className="text-3xl font-bold">{job.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{job.company}</span>
          {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
          {job.employment_type && <Badge variant="secondary">{job.employment_type}</Badge>}
        </div>
        <div className="mt-6 flex flex-wrap gap-1.5">
          {(job.skills ?? []).map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}
        </div>
        <h2 className="mt-8 mb-2 font-semibold">Description</h2>
        <p className="whitespace-pre-line text-sm text-muted-foreground">{job.description}</p>
        {job.requirements && (<>
          <h2 className="mt-6 mb-2 font-semibold">Requirements</h2>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{job.requirements}</p>
        </>)}
      </div>

      {isOwnPosting ? (
        <div className="mt-6 flex gap-3">
          <Button asChild><Link to="/recruiter/jobs/$jobId/applicants" params={{ jobId }}>View applicants</Link></Button>
        </div>
      ) : app ? (
        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-6">
          <p className="text-sm text-muted-foreground">You've applied to this role.</p>
          <Button asChild className="mt-3"><Link to="/interview/$applicationId" params={{ applicationId: app.id }}>{app.status === "interviewed" ? "View scorecard" : "Continue interview"}</Link></Button>
        </div>
      ) : !isRecruiter ? (
        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-6">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Apply with AI</h3>
          <p className="mb-3 text-sm text-muted-foreground">Paste your resume below. Our AI will parse skills, experience and projects, then run an interview.</p>
          <input type="file" ref={fileRef} accept=".txt,.md,.pdf,application/pdf" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            const text = await readFile(f);
            if (text) setResumeText(text);
          }} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="mb-3"><Upload className="mr-2 h-4 w-4" />Upload PDF or .txt</Button>
          <Textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} rows={12} placeholder="Paste your resume here…" />
          <Button onClick={submit} disabled={busy} className="mt-3 w-full">{busy ? "Submitting…" : "Apply & start AI interview"}</Button>
        </div>
      ) : null}
    </div>
  );
}