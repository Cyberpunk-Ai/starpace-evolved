import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Real tip earnings for the signed-in creator. */
export const getMyTipEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    const { data: me } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!me) return { total: 0, supporters: 0, recent: [] as any[] };

    const { data: tips } = await supabase
      .from("tips")
      .select("id, amount, message, created_at, from_user_id")
      .eq("to_user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = tips ?? [];
    const senderIds = [...new Set(rows.map((t: any) => t.from_user_id))];

    let names: Record<string, { display_name: string; username: string }> = {};
    if (senderIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", senderIds);
      names = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, { display_name: p.display_name, username: p.username }]),
      );
    }

    const { data: paid } = await supabase
      .from("payouts")
      .select("amount, status")
      .eq("user_id", me.id);

    const gross = rows.reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0);
    const withdrawn = (paid ?? [])
      .filter((p: any) => p.status !== "failed")
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    return {
      total: Math.round((gross - withdrawn) * 100) / 100,
      gross: Math.round(gross * 100) / 100,
      supporters: new Set(rows.map((t: any) => t.from_user_id)).size,
      recent: rows.slice(0, 8).map((t: any) => ({
        id: t.id,
        amount: Number(t.amount ?? 0),
        message: t.message ?? "",
        created_at: t.created_at,
        sender: names[t.from_user_id]?.display_name ?? "A supporter",
        senderUsername: names[t.from_user_id]?.username ?? "",
      })),
    };
  });

/** Requests a payout of the creator's available tip balance. */
export const requestTipPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    const { data: me } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!me) throw new Error("Profile not found");

    const { data: tips } = await supabase.from("tips").select("amount").eq("to_user_id", me.id);
    const { data: paid } = await supabase.from("payouts").select("amount, status").eq("user_id", me.id);

    const gross = (tips ?? []).reduce((s: number, t: any) => s + Number(t.amount ?? 0), 0);
    const withdrawn = (paid ?? [])
      .filter((p: any) => p.status !== "failed")
      .reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
    const available = Math.round((gross - withdrawn) * 100) / 100;

    if (available < 10) throw new Error("You need at least $10 in tips before requesting a payout.");

    const { data: settings } = await supabase
      .from("monetization_settings")
      .select("payout_method")
      .eq("user_id", me.id)
      .maybeSingle();

    const { error } = await supabase.from("payouts").insert({
      user_id: me.id,
      amount: available,
      method: settings?.payout_method ?? "bank",
      status: "pending",
    });
    if (error) throw new Error(error.message);

    return { amount: available };
  });
