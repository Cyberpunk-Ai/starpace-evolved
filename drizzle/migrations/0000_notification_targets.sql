ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'profile';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_id text;

CREATE OR REPLACE FUNCTION public.notify_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE recipient text; actor text; ntype text; nbody text; ttype text; tid text;
BEGIN
  IF TG_TABLE_NAME = 'follows' THEN
    recipient := NEW.target_id; actor := NEW.follower_id; ntype := 'follow'; nbody := 'started following you';
    ttype := 'profile'; tid := NEW.follower_id;
  ELSIF TG_TABLE_NAME = 'tips' THEN
    recipient := NEW.to_user_id; actor := NEW.from_user_id; ntype := 'tip';
    nbody := 'sent you a tip of ' || NEW.amount::text;
    IF NEW.post_id IS NOT NULL THEN ttype := 'post'; tid := NEW.post_id;
    ELSE ttype := 'profile'; tid := NEW.from_user_id; END IF;
  ELSE
    SELECT user_id INTO recipient FROM public.posts WHERE id = NEW.post_id;
    actor := NEW.user_id;
    ntype := CASE TG_TABLE_NAME WHEN 'likes' THEN 'like' WHEN 'comments' THEN 'comment' ELSE 'repost' END;
    nbody := CASE TG_TABLE_NAME
      WHEN 'likes' THEN 'liked your post'
      WHEN 'comments' THEN 'commented on your post'
      ELSE 'reposted your post' END;
    ttype := 'post'; tid := NEW.post_id;
  END IF;
  IF recipient IS NULL OR recipient = actor THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (recipient_id, actor_id, type, body, read, target_type, target_id)
  VALUES (recipient, actor, ntype, nbody, false, ttype, tid);
  RETURN NULL;
END; $function$;