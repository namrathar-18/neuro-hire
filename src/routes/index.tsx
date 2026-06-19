import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Brain, Sparkles, Zap, BarChart3, Mic, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NeuroHire AI — Autonomous Recruitment OS" },
      { name: "description", content: "AI-powered platform that screens resumes, interviews candidates, and ranks applicants in minutes." },
      { property: "og:title", content: "NeuroHire AI" },
      { property: "og:description", content: "Your autonomous AI recruiter. Screen, interview, and rank in minutes." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen text-foreground" style={{ background: "var(--gradient-hero)" }}>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">NeuroHire AI</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
          <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6">
        <section className="py-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Autonomous Recruitment Operating System
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
            Your AI recruiter that <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>never sleeps</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            NeuroHire parses resumes, conducts AI interviews, scores candidates across technical, communication and culture fit — then ranks every applicant for you.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="px-8" style={{ background: "var(--gradient-primary)", color: "oklch(0.16 0.02 270)" }}>
              <Link to="/auth">Start hiring smarter</Link>
            </Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">Apply as a candidate</Link></Button>
          </div>
        </section>

        <section className="grid gap-6 pb-24 md:grid-cols-3">
          {[
            { icon: Search, title: "Resume Intelligence", desc: "AI extracts skills, experience, projects and ranks against job requirements with embedding-based matching." },
            { icon: Mic, title: "AI Interview Agent", desc: "Conversational AI conducts adaptive interviews — generating probing follow-ups based on real-time answers." },
            { icon: BarChart3, title: "Scorecards & Ranking", desc: "Quantified scores across technical depth, communication, and problem-solving with hire/no-hire recommendations." },
            { icon: Brain, title: "Built on LLMs", desc: "Powered by Google Gemini for fast, accurate reasoning over every applicant in your pipeline." },
            { icon: Zap, title: "Hours → Minutes", desc: "Screen 1,000 candidates in the time it took to read 10. Your team focuses only on the top of the funnel." },
            { icon: Sparkles, title: "Dual Portals", desc: "Candidates apply and self-interview. Recruiters post jobs and watch ranked shortlists fill themselves." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur transition hover:border-primary/40" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-secondary">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        NeuroHire AI · Built with autonomous AI agents
      </footer>
    </div>
  );
}
