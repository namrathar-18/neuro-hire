import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recruiter/applications/$appId")({
  head: () => ({ meta: [{ title: "Applicant · NeuroHire AI" }] }),
  component: AppDetail,
});

function AppDetail() {
  const { appId } = Route.useParams();
  const [app, setApp] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string>("submitted");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase.from("applications").select("*, profiles!applications_candidate_id_fkey(full_name), jobs(title, company)").eq("id", appId).maybeSingle();
      setApp(a);
      setNotes(a?.recruiter_notes ?? "");
      setStatus(a?.status ?? "submitted");
      const { data: s } = await supabase.from("interview_sessions").select("*").eq("application_id", appId).maybeSingle();
      setSession(s);
      if (s) {
        const { data: m } = await supabase.from("interview_messages").select("*").eq("session_id", s.id).order("created_at");
        setMessages(m ?? []);
      }
    })();
  }, [appId]);

  if (!app) return <div className="p-8 text-muted-foreground">Loading…</div>;
  const parsed = app.parsed_resume ?? {};
  const scores = session?.scores ?? {};
  const video = session?.video_analysis ?? null;

  async function updateStatus(next: string) {
    setStatus(next);
    const { error } = await supabase.from("applications").update({ status: next }).eq("id", appId);
    if (error) toast.error(error.message); else toast.success(`Marked as ${next}`);
  }

  async function saveNotes() {
    setSavingNotes(true);
    const { error } = await supabase.from("applications").update({ recruiter_notes: notes }).eq("id", appId);
    setSavingNotes(false);
    if (error) toast.error(error.message); else toast.success("Notes saved");
  }

  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:block">
        <div>
          <div className="text-sm text-muted-foreground">{app.jobs?.title} · {app.jobs?.company}</div>
          <h1 className="text-3xl font-bold">{app.profiles?.full_name ?? "Candidate"}</h1>
          <div className="mt-2 flex gap-2"><Badge>{status}</Badge>{app.recommendation && <Badge variant="outline">{app.recommendation}</Badge>}</div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Select value={status} onValueChange={updateStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="interviewed">Interviewed</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print report</Button>
        </div>
      </div>

      {session?.scores && (
        <Card title="AI Scorecard">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
            {[["technical","Technical"],["communication","Communication"],["culture_fit","Culture fit"],["problem_solving","Problem solving"],["overall","Overall"]].map(([k,l]) => (
              <div key={k}><div className="text-3xl font-bold text-primary">{Math.round(scores[k] ?? 0)}</div><div className="text-xs text-muted-foreground">{l}</div></div>
            ))}
          </div>
          {scores.summary && <p className="mt-4 text-sm text-muted-foreground">{scores.summary}</p>}
          {scores.strengths?.length > 0 && <div className="mt-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Strengths</div><ul className="mt-1 list-disc pl-5 text-sm">{scores.strengths.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
          {scores.concerns?.length > 0 && <div className="mt-3"><div className="text-xs font-semibold uppercase text-muted-foreground">Concerns</div><ul className="mt-1 list-disc pl-5 text-sm">{scores.concerns.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
        </Card>
      )}

      {video && (
        <Card title="Video analysis">
          <div className="grid grid-cols-3 gap-6">
            <Metric label="Avg confidence" value={`${video.avg_confidence ?? 0}`} />
            <Metric label="Avg eye contact" value={`${video.avg_eye_contact ?? 0}`} />
            <Metric label="Avg engagement" value={`${video.avg_engagement ?? 0}`} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Based on {video.samples?.length ?? 0} webcam frames sampled during the interview.</div>
        </Card>
      )}

      <Card title="Parsed resume">
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div><div className="text-xs font-semibold uppercase text-muted-foreground">Skills</div><div className="mt-1 flex flex-wrap gap-1">{(parsed.skills ?? []).map((s:string)=><Badge key={s} variant="outline">{s}</Badge>)}</div></div>
          <div><div className="text-xs font-semibold uppercase text-muted-foreground">Experience</div>{(parsed.experience ?? []).map((e:any,i:number)=><div key={i} className="mt-1"><div className="font-medium">{e.role} · {e.company}</div><div className="text-xs text-muted-foreground">{e.duration}</div></div>)}</div>
          <div><div className="text-xs font-semibold uppercase text-muted-foreground">Education</div>{(parsed.education ?? []).map((e:any,i:number)=><div key={i} className="mt-1">{e.degree} · {e.school}</div>)}</div>
          <div><div className="text-xs font-semibold uppercase text-muted-foreground">Projects</div>{(parsed.projects ?? []).map((p:any,i:number)=><div key={i} className="mt-1"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.summary}</div></div>)}</div>
        </div>
      </Card>

      {messages.length > 0 && (
        <Card title="Interview replay">
          <Replay messages={messages} />
        </Card>
      )}

      <Card title="Recruiter notes (private)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Add notes about this candidate…" className="print:hidden" />
        <div className="hidden whitespace-pre-wrap text-sm print:block">{notes}</div>
        <Button onClick={saveNotes} disabled={savingNotes} className="mt-3 print:hidden">{savingNotes ? "Saving…" : "Save notes"}</Button>
      </Card>
    </div>
  );
}

function Replay({ messages }: { messages: any[] }) {
  const userMsgs = messages.filter((m) => m.role === "user");
  const wpms = userMsgs.map((m) => m.metadata?.wpm).filter((x: any) => typeof x === "number");
  const lats = userMsgs.map((m) => m.metadata?.latency_ms).filter((x: any) => typeof x === "number");
  const avgWpm = wpms.length ? Math.round(wpms.reduce((a: number, b: number) => a + b, 0) / wpms.length) : null;
  const avgLat = lats.length ? Math.round(lats.reduce((a: number, b: number) => a + b, 0) / lats.length / 1000) : null;
  const totalWords = userMsgs.reduce((s, m) => s + (m.metadata?.words ?? m.content.trim().split(/\s+/).length), 0);
  const start = messages[0] ? new Date(messages[0].created_at).getTime() : 0;
  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-4 rounded-xl border border-border bg-secondary/30 p-4">
        <Metric label="Avg speaking pace" value={avgWpm ? `${avgWpm} wpm` : "—"} />
        <Metric label="Avg response time" value={avgLat != null ? `${avgLat}s` : "—"} />
        <Metric label="Total words" value={String(totalWords)} />
      </div>
      <div className="space-y-3">
        {messages.map((m) => {
          const t = Math.max(0, Math.round((new Date(m.created_at).getTime() - start) / 1000));
          const mm = String(Math.floor(t / 60)).padStart(2, "0");
          const ss = String(t % 60).padStart(2, "0");
          return (
            <div key={m.id} className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-secondary" : "bg-card border border-border"}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-muted-foreground">{m.role === "user" ? "Candidate" : "AI"}</div>
                <div className="text-xs text-muted-foreground">{mm}:{ss}{m.metadata?.wpm ? ` · ${m.metadata.wpm} wpm` : ""}{m.metadata?.mode === "voice" ? " · 🎙" : ""}</div>
              </div>
              <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-2xl font-bold text-primary">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card/60 p-6" style={{ boxShadow: "var(--shadow-card)" }}><h2 className="mb-4 font-semibold">{title}</h2>{children}</div>;
}