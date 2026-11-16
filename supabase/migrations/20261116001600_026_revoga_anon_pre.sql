-- Pedir pré-avaliação e ver a situação são só para quem está logado na clínica
revoke execute on function public.request_pre_assessment(uuid, text), public.pre_assessment_status(uuid) from anon;
