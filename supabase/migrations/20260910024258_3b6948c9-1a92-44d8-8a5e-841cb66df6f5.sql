DELETE FROM public.post_impressions a
USING public.post_impressions b
WHERE a.user_id IS NOT NULL
  AND a.user_id = b.user_id
  AND a.post_id = b.post_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS post_impressions_unique_viewer
  ON public.post_impressions (post_id, user_id)
  WHERE user_id IS NOT NULL;

UPDATE public.posts p
SET view_count = (SELECT count(*) FROM public.post_impressions i WHERE i.post_id = p.id);