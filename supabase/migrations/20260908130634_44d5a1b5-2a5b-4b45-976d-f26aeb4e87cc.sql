CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read reactions in own conversations" ON public.message_reactions
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND (c.user_a = public.current_profile_id() OR c.user_b = public.current_profile_id())
  )
);

CREATE POLICY "add own reactions" ON public.message_reactions
FOR INSERT TO authenticated WITH CHECK (
  user_id = public.current_profile_id()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id
      AND (c.user_a = public.current_profile_id() OR c.user_b = public.current_profile_id())
  )
);

CREATE POLICY "remove own reactions" ON public.message_reactions
FOR DELETE TO authenticated USING (user_id = public.current_profile_id());

CREATE INDEX message_reactions_message_idx ON public.message_reactions(message_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;