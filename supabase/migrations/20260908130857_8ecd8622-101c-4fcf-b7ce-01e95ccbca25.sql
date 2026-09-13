CREATE POLICY "messages_sender_delete" ON public.messages
FOR DELETE TO authenticated
USING (sender_id = public.current_profile_id());

GRANT DELETE ON public.messages TO authenticated;