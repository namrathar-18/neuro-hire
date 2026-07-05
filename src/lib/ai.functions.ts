import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { createAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";
const VISION_MODEL = "google/gemini-3-flash-preview";

function gateway() {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("Missing AI_GATEWAY_API_KEY");
  return createAiGatewayProvider(key);
}

/** Parse resume text into structured data and store on the application. */
export const parseResume = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid(), resumeText: z.string().min(20).max(60000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app, error: appErr } = await supabase
      .from("applications").select("id, candidate_id, job_id").eq("id", data.applicationId).maybeSingle();
    if (appErr || !app || app.candidate_id !== userId) throw new Error("Not allowed");

    const { data: job } = await supabase
      .from("jobs").select("title, description, requirements, skills").eq("id", app.job_id).maybeSingle();

    const parsed = await generateObject({
      model: gateway()(MODEL),
      schema: z.object({
        full_name: z.string().nullable(),
        email: z.string().nullable(),
        headline: z.string().nullable(),
        years_experience: z.number().nullable(),
        skills: z.array(z.string()),
        education: z.array(z.object({ school: z.string(), degree: z.string().nullable(), year: z.string().nullable() })),
        experience: z.array(z.object({ company: z.string(), role: z.string(), duration: z.string().nullable(), summary: z.string().nullable() })),
        projects: z.array(z.object({ name: z.string(), summary: z.string().nullable() })),
        certifications: z.array(z.string()),
      }),
      prompt: `Extract structured information from this resume. Be thorough but only include what's clearly present.\n\nRESUME:\n${data.resumeText}`,
    });

    // Skill match score
    const jobSkills = (job?.skills ?? []).map((s: string) => s.toLowerCase());
    const candSkills = parsed.object.skills.map((s) => s.toLowerCase());
    let matchScore = 0;
    if (jobSkills.length > 0) {
      const hits = jobSkills.filter((s: string) => candSkills.some((c: string) => c.includes(s) || s.includes(c))).length;
      matchScore = Math.round((hits / jobSkills.length) * 100);
    }

    await supabase.from("applications").update({
      parsed_resume: parsed.object,
      resume_text: data.resumeText,
      skill_match_score: matchScore,
    }).eq("id", data.applicationId);

    return { parsed: parsed.object, skill_match_score: matchScore };
  });

/** Start interview: create session + first question. */
export const startInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("applications").select("id, candidate_id, job_id, parsed_resume").eq("id", data.applicationId).maybeSingle();
    if (!app || app.candidate_id !== userId) throw new Error("Not allowed");

    // Idempotent: return existing
    const { data: existing } = await supabase.from("interview_sessions").select("id, status").eq("application_id", data.applicationId).maybeSingle();
    if (existing) return { sessionId: existing.id };

    const { data: job } = await supabase.from("jobs").select("title, description, requirements, skills").eq("id", app.job_id).maybeSingle();

    const { data: session, error } = await supabase.from("interview_sessions").insert({ application_id: data.applicationId, status: "in_progress" }).select("id").single();
    if (error || !session) throw error ?? new Error("Could not create session");

    const intro = `Hi! I'm NeuroHire, the AI recruiter for the ${job?.title ?? "this role"} position. I'll ask a few questions to understand your background and skills. Take your time. To start: tell me briefly about your most relevant experience for this role.`;
    await supabase.from("interview_messages").insert({ session_id: session.id, role: "assistant", content: intro });

    return { sessionId: session.id };
  });

/** Send candidate answer, get next AI question. */
export const interviewTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(),
    answer: z.string().min(1).max(8000),
    metadata: z.object({
      latency_ms: z.number().optional(),
      duration_ms: z.number().optional(),
      mode: z.enum(["text", "voice"]).optional(),
    }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase
      .from("interview_sessions").select("id, application_id, status").eq("id", data.sessionId).maybeSingle();
    if (!session) throw new Error("Session not found");
    if (session.status !== "in_progress") throw new Error("Interview is already complete");

    const { data: app } = await supabase.from("applications").select("candidate_id, job_id, parsed_resume").eq("id", session.application_id).maybeSingle();
    if (!app || app.candidate_id !== userId) throw new Error("Not allowed");
    const { data: job } = await supabase.from("jobs").select("title, description, requirements, skills").eq("id", app.job_id).maybeSingle();

    const words = data.answer.trim().split(/\s+/).filter(Boolean).length;
    const duration_s = data.metadata?.duration_ms ? data.metadata.duration_ms / 1000 : null;
    const wpm = duration_s && duration_s > 1 ? Math.round((words / duration_s) * 60) : null;
    await supabase.from("interview_messages").insert({
      session_id: session.id,
      role: "user",
      content: data.answer,
      metadata: { ...(data.metadata ?? {}), words, wpm },
    });

    const { data: history } = await supabase.from("interview_messages").select("role, content").eq("session_id", session.id).order("created_at");
    const turnCount = (history ?? []).filter((m) => m.role === "user").length;

    if (turnCount >= 6) {
      // Finalize
      const finalMsgs = history ?? [];
      const transcript = finalMsgs.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const result = await generateObject({
        model: gateway()(MODEL),
        schema: z.object({
          technical: z.number().min(0).max(100),
          communication: z.number().min(0).max(100),
          culture_fit: z.number().min(0).max(100),
          problem_solving: z.number().min(0).max(100),
          overall: z.number().min(0).max(100),
          recommendation: z.enum(["strong_hire", "hire", "maybe", "no_hire"]),
          summary: z.string(),
          strengths: z.array(z.string()),
          concerns: z.array(z.string()),
        }),
        prompt: `You are evaluating a candidate interview for: ${job?.title}\n\nJob description: ${job?.description}\n\nRequired skills: ${(job?.skills ?? []).join(", ")}\n\nResume summary: ${JSON.stringify(app.parsed_resume ?? {}).slice(0, 4000)}\n\nInterview transcript:\n${transcript}\n\nProvide rigorous, fair scoring 0-100 for each dimension and an overall recommendation.`,
      });

      const closing = `Thanks for chatting with me. I've completed your assessment — you can view your scorecard now. Good luck!`;
      await supabase.from("interview_messages").insert({ session_id: session.id, role: "assistant", content: closing });
      await supabase.from("interview_sessions").update({
        status: "complete",
        scores: result.object,
        summary: result.object.summary,
        recommendation: result.object.recommendation,
        completed_at: new Date().toISOString(),
      }).eq("id", session.id);
      await supabase.from("applications").update({
        overall_score: result.object.overall,
        recommendation: result.object.recommendation,
        status: "interviewed",
      }).eq("id", session.application_id);

      return { done: true, nextQuestion: closing };
    }

    const messagesForModel = [
      { role: "system" as const, content: `You are NeuroHire, an AI recruiter conducting a screening interview for "${job?.title}". The job requires: ${(job?.skills ?? []).join(", ")}. Ask ONE focused, probing follow-up question at a time based on the candidate's last answer. Mix technical depth, problem solving, and behavioral. Be conversational, concise (1-2 sentences). Never give the answer.` },
      ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const { text } = await generateText({ model: gateway()(MODEL), messages: messagesForModel });
    await supabase.from("interview_messages").insert({ session_id: session.id, role: "assistant", content: text });
    return { done: false, nextQuestion: text };
  });

/** Analyze a webcam frame for confidence / engagement during the interview. */
export const analyzeFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(),
    imageDataUrl: z.string().min(50).max(2_000_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session } = await supabase
      .from("interview_sessions").select("id, application_id, video_analysis").eq("id", data.sessionId).maybeSingle();
    if (!session) throw new Error("Session not found");
    const { data: app } = await supabase.from("applications").select("candidate_id").eq("id", session.application_id).maybeSingle();
    if (!app || app.candidate_id !== userId) throw new Error("Not allowed");

    const { object } = await generateObject({
      model: gateway()(VISION_MODEL),
      schema: z.object({
        confidence: z.number().min(0).max(100),
        eye_contact: z.number().min(0).max(100),
        engagement: z.number().min(0).max(100),
        notes: z.string(),
      }),
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "This is a webcam frame from a candidate during a video interview. Rate confidence, apparent eye contact with camera, and engagement on 0-100 scales. Be conservative. Return a 1-sentence note." },
          { type: "image", image: data.imageDataUrl },
        ],
      }],
    });

    const prev = (session.video_analysis ?? { samples: [] }) as { samples: any[] };
    const samples = [...(prev.samples ?? []), { ...object, at: Date.now() }];
    const avg = (k: "confidence" | "eye_contact" | "engagement") =>
      Math.round(samples.reduce((s, x) => s + (x[k] ?? 0), 0) / samples.length);
    const aggregate = {
      samples,
      avg_confidence: avg("confidence"),
      avg_eye_contact: avg("eye_contact"),
      avg_engagement: avg("engagement"),
    };
    await supabase.from("interview_sessions").update({ video_analysis: aggregate }).eq("id", session.id);
    return object;
  });