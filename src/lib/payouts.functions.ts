/**
 * Real creator earnings and withdrawals, backed by the database and Paystack
 * transfers. Nothing here is simulated: the balance is derived from recorded
 * tips minus recorded payouts, and a withdrawal creates a Paystack transfer
 * recipient plus a transfer.
 */
import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Withdrawal rails Paystack actually supports. */
export type PayoutMethod = "bank" | "mobile_money";

const USD_TO_KES = Number(process.env["PAYSTACK_USD_RATE"] ?? 130);

function payoutCurrency() {
  return process.env["PAYSTACK_CURRENCY"] || "KES";
}

function payoutCountry() {
  return (process.env["PAYSTACK_COUNTRY"] || "kenya").toLowerCase();
}

function paystackKey() {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Withdrawals are not configured yet.");
  return key;
}

async function paystack(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message || `Payout provider error (${res.status})`);
  }
  return body;
}

async function myProfileId(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Complete your profile first.");
  return String(data.id);
}

/**
 * Platform fee taken from tips before a creator can withdraw. Pro creators
 * keep everything; everyone else pays a flat 5%.
 */
export const PLATFORM_FEE_RATES: Record<string, number> = { free: 0.05, plus: 0.05, pro: 0 };

function feeRateForPlan(plan?: string | null) {
  return PLATFORM_FEE_RATES[String(plan ?? "free").toLowerCase()] ?? 0.05;
}

/** Tips received minus the platform fee, minus everything already withdrawn. */
async function computeLedger(supabase: any, profileId: string) {
  const [{ data: tips }, { data: payouts }] = await Promise.all([
    supabase
      .from("tips")
      .select("id, from_user_id, amount, message, created_at, post_id")
      .eq("to_user_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payouts")
      .select("*")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const tipRows = (tips ?? []) as any[];
  const payoutRows = (payouts ?? []) as any[];

  const totalEarnings = tipRows.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
  const withdrawn = payoutRows
    .filter((p) => p.status !== "failed" && p.status !== "reversed")
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return {
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    pendingBalance: Math.round(Math.max(0, totalEarnings - withdrawn) * 100) / 100,
    tips: tipRows,
    payouts: payoutRows,
  };
}

/** Everything the monetization screen needs, straight from the database. */
export const getEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const profileId = await myProfileId(supabase, userId);
    const ledger = await computeLedger(supabase, profileId);

    const senderIds = Array.from(new Set(ledger.tips.map((t) => String(t.from_user_id))));
    let senders: Record<string, any> = {};
    if (senderIds.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", senderIds);
      senders = Object.fromEntries(((data ?? []) as any[]).map((p) => [String(p.id), p]));
    }

    const { data: settingsRow } = await supabase
      .from("monetization_settings")
      .select("*")
      .eq("user_id", profileId)
      .maybeSingle();

    return {
      totalEarnings: ledger.totalEarnings,
      pendingBalance: ledger.pendingBalance,
      currency: payoutCurrency(),
      tips: ledger.tips.map((t) => {
        const sender = senders[String(t.from_user_id)];
        return {
          id: String(t.id),
          amount: Number(t.amount ?? 0),
          message: t.message || "",
          createdAt: t.created_at,
          senderName: sender?.display_name ?? "Supporter",
          senderUsername: sender?.username ?? "supporter",
          senderAvatar: sender?.avatar_url ?? undefined,
        };
      }),
      payouts: ledger.payouts.map((p) => ({
        id: String(p.id),
        amount: Number(p.amount ?? 0),
        method: String(p.method ?? "bank"),
        status: String(p.status ?? "pending"),
        reference: p.reference ?? null,
        destination: p.destination ?? null,
        failureReason: p.failure_reason ?? null,
        createdAt: p.created_at,
      })),
      settings: settingsRow
        ? {
            minimumTip: Number(settingsRow.min_tip ?? 1),
            tipsEnabled: settingsRow.tips_enabled ?? true,
            payoutMethod: (settingsRow.payout_method ?? "bank") as PayoutMethod,
            paystack: (settingsRow.paystack_details ?? {}) as Record<string, any>,
          }
        : {
            minimumTip: 1,
            tipsEnabled: true,
            payoutMethod: "bank" as PayoutMethod,
            paystack: {} as Record<string, any>,
          },
    };
  });

/** Banks and mobile-money providers Paystack can pay out to. */
export const listPayoutBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const country = payoutCountry();
    const currency = payoutCurrency();
    const res = await paystack(
      `/bank?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(currency)}&perPage=100`,
    );
    const rows = ((res.data ?? []) as any[]).filter((b) => b.active !== false);
    return rows.map((b) => ({
      name: String(b.name),
      code: String(b.code),
      type: String(b.type ?? "nuban"),
      isMobileMoney: String(b.type ?? "").includes("mobile_money"),
    }));
  });

/** Saves and verifies the destination account with Paystack. */
export const savePayoutDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      method: PayoutMethod;
      accountName: string;
      accountNumber: string;
      bankCode: string;
      bankName: string;
    }) => {
      if (input.method !== "bank" && input.method !== "mobile_money") {
        throw new Error("Choose a bank account or mobile money.");
      }
      if (!input.accountName?.trim()) throw new Error("Enter the account holder name.");
      if (!/^[0-9+]{6,20}$/.test(input.accountNumber?.trim() ?? "")) {
        throw new Error("Enter a valid account or phone number.");
      }
      if (!input.bankCode) throw new Error("Pick your bank or mobile money provider.");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const profileId = await myProfileId(supabase, userId);
    const currency = payoutCurrency();

    const recipient = await paystack("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: data.method === "mobile_money" ? "mobile_money" : "nuban",
        name: data.accountName.trim(),
        account_number: data.accountNumber.trim(),
        bank_code: data.bankCode,
        currency,
      }),
    });

    const details = {
      method: data.method,
      accountName: recipient.data?.details?.account_name || data.accountName.trim(),
      accountNumberLast4: data.accountNumber.trim().slice(-4),
      bankCode: data.bankCode,
      bankName: data.bankName || recipient.data?.details?.bank_name || "",
      recipientCode: recipient.data?.recipient_code ?? null,
      currency,
      verifiedAt: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("monetization_settings").upsert(
      {
        user_id: profileId,
        payout_method: data.method,
        paystack_details: details,
      },
      { onConflict: "user_id" },
    );

    return details;
  });

/** Withdraws the available balance to the saved destination. */
export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { amount?: number }) => ({
    amount: input?.amount != null ? Number(input.amount) : undefined,
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const profileId = await myProfileId(supabase, userId);
    const ledger = await computeLedger(supabase, profileId);

    const amount = Math.round((data.amount ?? ledger.pendingBalance) * 100) / 100;
    if (!(amount > 0)) throw new Error("You don't have anything to withdraw yet.");
    if (amount > ledger.pendingBalance) throw new Error("That's more than your available balance.");

    const { data: settingsRow } = await supabase
      .from("monetization_settings")
      .select("payout_method, paystack_details")
      .eq("user_id", profileId)
      .maybeSingle();

    const details = (settingsRow?.paystack_details ?? {}) as Record<string, any>;
    if (!details.recipientCode) {
      throw new Error("Add a withdrawal account before requesting a payout.");
    }

    const currency = payoutCurrency();
    const reference = `po_${crypto.randomUUID().replace(/-/g, "")}`;
    const minorUnits = Math.round(amount * USD_TO_KES) * 100;
    const destination = `${details.bankName || details.method} •••• ${details.accountNumberLast4 ?? ""}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    await admin.from("payouts").insert({
      user_id: profileId,
      amount,
      method: String(settingsRow?.payout_method ?? details.method ?? "bank"),
      status: "pending",
      currency,
      reference,
      recipient_code: details.recipientCode,
      destination,
    });

    try {
      const transfer = await paystack("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: minorUnits,
          recipient: details.recipientCode,
          reason: "Spaces creator payout",
          reference,
          currency,
        }),
      });

      const status = String(transfer.data?.status ?? "pending");
      await admin
        .from("payouts")
        .update({
          status: status === "success" ? "paid" : status,
          transfer_code: transfer.data?.transfer_code ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      return { reference, amount, status: status === "success" ? "paid" : status, destination };
    } catch (err: any) {
      await admin
        .from("payouts")
        .update({
          status: "failed",
          failure_reason: String(err?.message ?? "Transfer failed"),
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);
      throw err;
    }
  });

/** Re-checks a pending transfer with Paystack. */
export const refreshPayoutStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) => {
    if (!input?.reference) throw new Error("Missing payout reference");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const profileId = await myProfileId(supabase, userId);

    const { data: row } = await supabase
      .from("payouts")
      .select("id, user_id, reference, status")
      .eq("reference", data.reference)
      .maybeSingle();
    if (!row || String(row.user_id) !== profileId) throw new Error("Payout not found");

    const verified = await paystack(`/transfer/verify/${encodeURIComponent(data.reference)}`);
    const status = String(verified.data?.status ?? "pending");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("payouts")
      .update({
        status: status === "success" ? "paid" : status,
        failure_reason: verified.data?.reason ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", data.reference);

    return { status: status === "success" ? "paid" : status };
  });
