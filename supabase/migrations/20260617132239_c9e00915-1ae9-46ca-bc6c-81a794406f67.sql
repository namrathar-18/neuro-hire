
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;

DROP POLICY "candidates update own apps" ON public.applications;
CREATE POLICY "candidates update own apps" ON public.applications FOR UPDATE TO authenticated
  USING (auth.uid() = candidate_id OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid()))
  WITH CHECK (auth.uid() = candidate_id OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.recruiter_id = auth.uid()));

DROP POLICY "candidate update own session" ON public.interview_sessions;
CREATE POLICY "candidate update own session" ON public.interview_sessions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.candidate_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.candidate_id = auth.uid()));
