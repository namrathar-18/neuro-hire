import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Send, Sparkles, Mic, MicOff, Volume2, VolumeX, Video, VideoOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startInterview, interviewTurn, analyzeFrame } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/interview/$applicationId")({
  head: () => ({ meta: [{ title: "AI Interview · NeuroHire AI" }] }),
  component: InterviewPage,
});

function InterviewPage() {
  const { applicationId } = Route.useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [ttsOn, setTtsOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [listening, setListening] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recogRef = useRef<any>(null);
  const speakStartRef = useRef<number>(0);
  const aiSpokeAtRef = useRef<number>(Date.now());
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const startFn = useServerFn(startInterview);
  const turnFn = useServerFn(interviewTurn);
  const analyzeFn = useServerFn(analyzeFrame);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const frameTimerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { sessionId } = await startFn({ data: { applicationId } });
        setSessionId(sessionId);
        await refresh(sessionId);
      } catch (e: any) {
        toast.error(e.message);
      }
    })();
  }, [applicationId]);

  // Speak new assistant messages when TTS is on
  useEffect(() => {
    if (!ttsOn || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    const id = String(last.id);
    if (spokenIdsRef.current.has(id)) return;
    spokenIdsRef.current.add(id);
    const u = new SpeechSynthesisUtterance(last.content);
    u.rate = 1.05;
    u.onend = () => { aiSpokeAtRef.current = Date.now(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    aiSpokeAtRef.current = Date.now();
  }, [messages, ttsOn]);

  // Camera lifecycle
  useEffect(() => {
    if (!videoOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((s) => {
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      // Sample a frame every 10s for AI confidence analysis
      frameTimerRef.current = window.setInterval(() => {
        if (!sessionId || !videoRef.current || done) return;
        const v = videoRef.current;
        if (!v.videoWidth) return;
        const c = document.createElement("canvas");
        c.width = 320; c.height = Math.round((v.videoHeight / v.videoWidth) * 320);
        const ctx = c.getContext("2d"); if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", 0.6);
        analyzeFn({ data: { sessionId, imageDataUrl: data } }).catch(() => {});
      }, 10000);
    }).catch(() => { toast.error("Camera permission denied"); setVideoOn(false); });
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (frameTimerRef.current) { clearInterval(frameTimerRef.current); frameTimerRef.current = null; }
    };
  }, [videoOn, sessionId, done]);

  function startListening() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { startServerRecording(); return; }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    let finalText = "";
    speakStartRef.current = Date.now();
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      setInput((finalText + interim).trim());
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  }
  function stopListening() {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop();
    } else {
      recogRef.current?.stop();
    }
    setListening(false);
  }

  async function startServerRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      audioChunksRef.current = [];
      speakStartRef.current = Date.now();
      rec.ondataavailable = (e) => { if (e.data.size) audioChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("file", blob, "recording.webm");
        try {
          toast.info("Transcribing…");
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (!r.ok) throw new Error(await r.text());
          const { text } = await r.json();
          setInput((prev) => (prev ? prev + " " : "") + (text ?? ""));
        } catch (e: any) {
          toast.error("Transcription failed");
        }
      };
      mediaRecRef.current = rec;
      rec.start();
      setListening(true);
      toast.info("Recording… tap stop when done");
    } catch {
      toast.error("Microphone permission denied");
    }
  }

  async function refresh(sid: string) {
    const [{ data: msgs }, { data: sess }] = await Promise.all([
      supabase.from("interview_messages").select("*").eq("session_id", sid).order("created_at"),
      supabase.from("interview_sessions").select("*").eq("id", sid).maybeSingle(),
    ]);
    setMessages(msgs ?? []);
    setSession(sess);
    setDone(sess?.status === "complete");
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
  }

  async function send() {
    if (!sessionId || !input.trim() || busy) return;
    const answer = input.trim();
    const now = Date.now();
    const duration_ms = speakStartRef.current ? now - speakStartRef.current : undefined;
    const latency_ms = aiSpokeAtRef.current ? Math.max(0, (speakStartRef.current || now) - aiSpokeAtRef.current) : undefined;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: Math.random(), role: "user", content: answer }]);
    try {
      await turnFn({ data: { sessionId, answer, metadata: { duration_ms, latency_ms, mode: voiceMode ? "voice" : "text" } } });
      await refresh(sessionId);
      speakStartRef.current = 0;
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
          <Brain className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold">AI Interview</h1>
          <p className="text-xs text-muted-foreground">{done ? "Interview complete" : "In progress · 6 questions"}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={voiceMode ? "default" : "outline"} onClick={() => setVoiceMode((v) => !v)}>
            {voiceMode ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}<span className="ml-1 hidden sm:inline">Voice</span>
          </Button>
          <Button size="sm" variant={ttsOn ? "default" : "outline"} onClick={() => { setTtsOn((v) => !v); window.speechSynthesis?.cancel(); }}>
            {ttsOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant={videoOn ? "default" : "outline"} onClick={() => setVideoOn((v) => !v)}>
            {videoOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {videoOn && (
        <video ref={videoRef} autoPlay muted playsInline className="mb-3 h-32 w-44 rounded-lg border border-border object-cover" />
      )}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card/40 p-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground">AI is thinking…</div>}
      </div>

      {done && session?.scores ? (
        <Scorecard scores={session.scores} />
      ) : (
        <div className="mt-4 flex gap-2">
          <Textarea value={input} onChange={(e) => { if (!speakStartRef.current) speakStartRef.current = Date.now(); setInput(e.target.value); }} placeholder={voiceMode ? "Tap the mic and speak…" : "Type your answer…"} rows={3} disabled={busy}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
          <div className="flex flex-col gap-2">
            {voiceMode && (
              <Button onClick={listening ? stopListening : startListening} variant={listening ? "destructive" : "outline"} disabled={busy}>
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            <Button onClick={send} disabled={busy || !input.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Scorecard({ scores }: { scores: any }) {
  const dims = [
    { k: "technical", label: "Technical" },
    { k: "communication", label: "Communication" },
    { k: "culture_fit", label: "Culture fit" },
    { k: "problem_solving", label: "Problem solving" },
  ];
  return (
    <div className="mt-4 rounded-2xl border border-primary/40 bg-card/60 p-6" style={{ boxShadow: "var(--shadow-glow)" }}>
      <div className="mb-4 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Your scorecard</h2></div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {dims.map((d) => (
          <div key={d.k}>
            <div className="text-3xl font-bold text-primary">{Math.round(scores[d.k])}</div>
            <div className="text-xs text-muted-foreground">{d.label}</div>
          </div>
        ))}
        <div>
          <div className="text-3xl font-bold">{Math.round(scores.overall)}</div>
          <div className="text-xs text-muted-foreground">Overall</div>
        </div>
      </div>
      {scores.summary && <p className="mt-4 text-sm text-muted-foreground">{scores.summary}</p>}
      <div className="mt-3 text-sm"><span className="font-medium">Recommendation:</span> <span className="text-primary">{scores.recommendation}</span></div>
    </div>
  );
}