import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, Panel } from "@/components/social/AppShell";
import { PostCard } from "@/components/social/PostCard";
import { DefaultRail } from "@/components/social/RightRail";
import { getPostById } from "@/lib/api-client";
import type { Post } from "@/lib/types";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({
    meta: [
      { title: "Post — Spaces" },
      {
        name: "description",
        content: "Read this post on Spaces, join the conversation, and follow the creator.",
      },
      { property: "og:title", content: "Post — Spaces" },
      {
        property: "og:description",
        content: "Read this post on Spaces, join the conversation, and follow the creator.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPostById(postId)
      .then((p) => {
        if (active) setPost(p);
      })
      .catch(() => {
        if (active) setPost(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId]);

  return (
    <AppShell title="Post" right={<DefaultRail />}>
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          to="/feed"
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-foreground/5"
        >
          <ArrowLeft className="h-4 w-4" /> Back to feed
        </Link>

        {loading ? (
          <Panel className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </Panel>
        ) : post ? (
          <PostCard post={post} />
        ) : (
          <Panel className="space-y-2 py-14 text-center">
            <p className="font-bold">This post isn't available</p>
            <p className="text-sm text-muted-foreground">
              It may have been deleted or hidden by its author.
            </p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
