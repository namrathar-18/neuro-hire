ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS recruiter_notes TEXT;
ALTER TABLE public.interview_sessions ADD COLUMN IF NOT EXISTS video_analysis JSONB;