import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");

        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(raw) as any;
        const tx = event?.data ?? {};
        const reference = tx.reference as string | undefined;
        const meta = tx.metadata ?? {};

        if (!reference) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        if (event.event === "charge.success") {
          await admin
            .from("payments")
            .update({
              status: "success",
              raw: tx,
              paid_at: tx.paid_at ?? new Date().toISOString(),
            })
            .eq("reference", reference);

          const profileId = meta.profile_id as string | undefined;
          const plan = (meta.plan as string) ?? "plus";
          const cycle = (meta.billing_cycle as string) ?? "monthly";

          if (meta.kind === "tip" && profileId && meta.recipient_id) {
            const { data: existing } = await admin
              .from("tips")
              .select("id")
              .eq("from_user_id", profileId)
              .eq("to_user_id", meta.recipient_id)
              .eq("amount", meta.tip_usd)
              .eq("message", `${meta.note ?? ""}`)
              .limit(1);
            if (!existing?.length) {
              await admin.from("tips").insert({
                from_user_id: profileId,
                to_user_id: meta.recipient_id,
                amount: meta.tip_usd,
                message: meta.note ?? "",
                post_id: meta.post_id ?? null,
              });
            }
            return new Response("ok");
          }

          if (profileId) {
            await admin.from("profiles").update({ plan }).eq("id", profileId);
            await admin.from("subscriptions").upsert(
              {
                user_id: profileId,
                plan,
                billing_cycle: cycle,
                status: "active",
                provider: "paystack",
                renews_at: new Date(
                  Date.now() + (cycle === "annual" ? 365 : 30) * 86400000,
                ).toISOString(),
              },
              { onConflict: "user_id" },
            );
          }
        } else if (
          event.event === "charge.failed" ||
          event.event === "invoice.payment_failed"
        ) {
          await admin
            .from("payments")
            .update({ status: "failed", raw: tx })
            .eq("reference", reference);
        }

        return new Response("ok");
      },
    },
  },
});
