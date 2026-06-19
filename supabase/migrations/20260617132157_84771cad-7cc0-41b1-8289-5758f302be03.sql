
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  headline TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Roles
CREATE TYPE public.app_role AS ENUM ('candidate', 'recruiter');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Jobs
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  employment_type TEXT,
  description TEXT NOT NULL,
  requirements TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs viewable by authenticated" ON public.jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "recruiters insert own jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));
CREATE POLICY "recruiters update own jobs" ON public.jobs FOR UPDATE TO authenticated USING (auth.uid() = recruiter_id) WITH CHECK (auth.uid() = recruiter_id);
CREATE POLICY "recruiters delete own jobs" ON public.jobs FOR DELETE TO authenticated USING (auth.uid() = recruiter_id);
CREATE TRIGGER jobs_touch BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Applications
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_path TEXT,
  resume_text TEXT,
  parsed_resume JSONB,
  skill_match_score NUMERIC,
  overall_score NUMERIC,
  recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, candidate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates view own apps" ON public.applications FOR SELECT TO authenticated USING (auth.uid() = candidate_id OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid()));
CREATE POLICY "candidates insert own apps" ON public.applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "candidates update own apps" ON public.applications FOR UPDATE TO authenticated USING (auth.uid() = candidate_id OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid())) WITH CHECK (true);
CREATE TRIGGER apps_touch BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Interview sessions
CREATE TABLE public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  scores JSONB,
  summary TEXT,
  recommendation TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions visible to candidate or recruiter" ON public.interview_sessions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id WHERE a.id = application_id AND (a.candidate_id = auth.uid() OR j.recruiter_id = auth.uid()))
);
CREATE POLICY "candidate insert own session" ON public.interview_sessions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.candidate_id = auth.uid())
);
CREATE POLICY "candidate update own session" ON public.interview_sessions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.candidate_id = auth.uid())
) WITH CHECK (true);

-- Interview messages
CREATE TABLE public.interview_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_messages TO authenticated;
GRANT ALL ON public.interview_messages TO service_role;
ALTER TABLE public.interview_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages visible to candidate or recruiter" ON public.interview_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interview_sessions s JOIN public.applications a ON a.id = s.application_id JOIN public.jobs j ON j.id = a.job_id WHERE s.id = session_id AND (a.candidate_id = auth.uid() OR j.recruiter_id = auth.uid()))
);
CREATE POLICY "candidate insert messages" ON public.interview_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.interview_sessions s JOIN public.applications a ON a.id = s.application_id WHERE s.id = session_id AND a.candidate_id = auth.uid())
);

-- Resume storage policies (bucket created separately)
CREATE POLICY "candidates upload own resume" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "candidates read own resume" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'resumes' AND ((storage.foldername(name))[1] = auth.uid()::text OR EXISTS (SELECT 1 FROM public.applications a JOIN public.jobs j ON j.id = a.job_id WHERE a.resume_path = name AND j.recruiter_id = auth.uid())));
CREATE POLICY "candidates update own resume" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = auth.uid()::text);
