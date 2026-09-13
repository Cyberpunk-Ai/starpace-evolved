import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { email?: string } =>
    typeof search['email'] === "string" ? { email: search['email'] as string } : {},
  head: () => ({
    meta: [
      { title: "Sign In or Join — Spaces" },
      {
        name: "description",
        content:
          "Create your Spaces account or sign back in to post, join live audio rooms, message creators and tip the people you follow.",
      },
      { property: "og:title", content: "Sign In or Join — Spaces" },
      { property: "og:description", content: "Create a Spaces account or sign in to post, chat and go live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { email: prefillEmail } = Route.useSearch();
  // Arriving from the landing page with an email means they meant to join.
  const [mode, setMode] = useState<"signin" | "signup">(prefillEmail ? "signup" : "signin");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);

  async function handleGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: displayName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setCheckInbox(true);
          toast.success("Almost there — confirm your email to finish signing up.");
          return;
        }
        toast.success("Account created — welcome to Spaces!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      }
      void navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }


  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl border border-border/80 bg-card p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-pink text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <h1 className="text-xl font-black">{mode === "signin" ? "Welcome back" : "Join Spaces"}</h1>
        </div>

        <div className="mb-5 flex rounded-2xl bg-muted/40 p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setCheckInbox(false);
              }}
              className={cn(
                "flex-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors",
                mode === m ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z"
            />
            <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1z" />
            <path
              fill="#EA4335"
              d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          OR
          <span className="h-px flex-1 bg-border" />
        </div>

        {checkInbox && (
          <div className="mb-4 rounded-2xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            We sent a confirmation link to <span className="font-bold text-foreground">{email}</span>.
            Open it to activate your account, then come back and sign in.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">

          {mode === "signup" && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="w-full rounded-2xl bg-foreground/5 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-2xl bg-foreground/5 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl bg-foreground/5 px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-pink py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
