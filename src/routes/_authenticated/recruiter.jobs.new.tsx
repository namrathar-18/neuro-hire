import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useMyRoles } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recruiter/jobs/new")({
  head: () => ({ meta: [{ title: "Post a job · NeuroHire AI" }] }),
  component: NewJob,
});

function NewJob() {
  const { user } = useAuth();
  const { roles } = useMyRoles();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", company: "", location: "", employment_type: "Full-time", description: "", requirements: "", skills: "" });
  const [busy, setBusy] = useState(false);

  if (!roles.includes("recruiter")) return <div className="p-8 text-muted-foreground">Only recruiters can post jobs.</div>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
    const { data, error } = await supabase.from("jobs").insert({
      recruiter_id: user.id, title: form.title, company: form.company, location: form.location,
      employment_type: form.employment_type, description: form.description, requirements: form.requirements, skills,
    }).select("id").single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Job posted!");
    navigate({ to: "/recruiter/jobs/$jobId/applicants", params: { jobId: data!.id } });
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">Post a new job</h1>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title"><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Company"><Input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          <Field label="Employment type"><Input value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} /></Field>
        </div>
        <Field label="Skills (comma-separated)"><Input placeholder="React, Node.js, PostgreSQL" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
        <Field label="Description"><Textarea required rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Requirements"><Textarea rows={4} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Posting…" : "Post job"}</Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}