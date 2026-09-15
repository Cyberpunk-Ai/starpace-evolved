import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Heart,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Building2,
  Smartphone,
  Settings2,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useMonetization, type PayoutBank, type PayoutMethod } from "@/lib/monetization-state";
import { usePlan, openUpgradeModal } from "@/lib/plan-state";
import { Avatar } from "@/components/social/Avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  paid: "text-emerald-600 dark:text-emerald-400",
  pending: "text-amber-600 dark:text-amber-400",
  processing: "text-amber-600 dark:text-amber-400",
  failed: "text-rose-600 dark:text-rose-400",
  reversed: "text-rose-600 dark:text-rose-400",
};

export function MonetizationHub() {
  const { isPlus, isPro } = usePlan();
  const {
    loading,
    totalEarnings,
    pendingBalance,
    currency,
    tipsReceived,
    payouts,
    destination,
    settings,
    requestPayout,
    saveDestination,
    loadBanks,
    checkPayout,
    refresh,
  } = useMonetization();

  const [tab, setTab] = useState<"destination" | "settings">("destination");
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [payoutProcessing, setPayoutProcessing] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  // Destination form — sent straight to the payment provider, never stored here.
  const [method, setMethod] = useState<PayoutMethod>("bank");
  const [banks, setBanks] = useState<PayoutBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBanksLoading(true);
    loadBanks()
      .then((list) => {
        if (!cancelled) setBanks(list);
      })
      .catch(() => {
        if (!cancelled) setBanks([]);
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadBanks]);

  const options = useMemo(
    () => banks.filter((b) => (method === "mobile_money" ? b.isMobileMoney : !b.isMobileMoney)),
    [banks, method],
  );

  const money = (value: number) =>
    `${currency === "USD" ? "$" : `${currency} `}${value.toFixed(2)}`;

  async function handleSaveDestination(e: React.FormEvent) {
    e.preventDefault();
    const bank = options.find((b) => b.code === bankCode);
    if (!bank || !accountNumber.trim() || !accountName.trim()) {
      toast.error("Please complete all withdrawal details.");
      return;
    }
    setSaving(true);
    try {
      await saveDestination({
        method,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        bankCode: bank.code,
        bankName: bank.name,
      });
      setAccountNumber("");
      toast.success("Withdrawal destination verified.");
    } catch (err: any) {
      toast.error(err?.message || "We couldn't verify those details.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayoutSubmit() {
    if (pendingBalance <= 0) {
      toast.error("No balance available to withdraw.");
      return;
    }
    setPayoutProcessing(true);
    try {
      const record: any = await requestPayout();
      setIsPayoutModalOpen(false);
      toast.success(
        record?.amount ? `Withdrawal of ${money(Number(record.amount))} started.` : "Withdrawal started.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Withdrawal could not be started.");
    } finally {
      setPayoutProcessing(false);
    }
  }

  async function handleCheck(reference: string | null) {
    if (!reference) return;
    setChecking(reference);
    try {
      await checkPayout(reference);
      toast.success("Status refreshed.");
    } catch {
      toast.error("Could not refresh that withdrawal yet.");
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Earnings & withdrawals</h2>
          <p className="text-xs text-muted-foreground">
            Tips and payouts are processed end-to-end by the payment provider.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-bold transition-colors hover:bg-muted"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </button>
          {isPlus && (
            <button
              onClick={() => setIsPayoutModalOpen(true)}
              disabled={pendingBalance <= 0 || !destination}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2 text-xs font-bold text-white shadow-soft transition-all hover:brightness-105 disabled:opacity-50"
            >
              <DollarSign className="h-3.5 w-3.5" /> Withdraw
            </button>
          )}
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2 rounded-3xl border border-border/80 bg-card p-5 shadow-soft">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Total earned
          </span>
          <span className="block text-3xl font-black">{money(totalEarnings)}</span>
          <p className="text-[0.7rem] text-muted-foreground">All tips received, all time</p>
        </div>

        <div className="space-y-2 rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-soft">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Available to withdraw
          </span>
          <span className="block text-3xl font-black text-emerald-700 dark:text-emerald-300">
            {money(pendingBalance)}
          </span>
          <p className="text-[0.7rem] text-muted-foreground">
            {destination
              ? `To ${destination.bankName} •••• ${destination.accountNumberLast4}`
              : "Add a withdrawal destination to cash out"}
          </p>
        </div>

        <div className="space-y-2 rounded-3xl border border-border/80 bg-card p-5 shadow-soft">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Platform fee
          </span>
          <span className="block text-2xl font-black">{isPro ? "0%" : "5%"}</span>
          <p className="text-[0.7rem] text-muted-foreground">
            {isPro ? "Pro — you keep 100%" : "Upgrade to Pro to keep 100%"}
          </p>
        </div>
      </div>

      {/* Destination + settings */}
      <div className="space-y-5 rounded-3xl border border-border/80 bg-card p-5 shadow-soft md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black">
              <ShieldCheck className="h-4 w-4 text-brand" /> Withdrawal destination
            </h3>
            <p className="text-xs text-muted-foreground">
              Details go straight to the payment provider — only the last four digits are kept here.
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-foreground/5 p-1">
            {(["destination", "settings"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                  tab === key
                    ? "border border-border bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key === "destination" ? (
                  <>
                    <Building2 className="h-3.5 w-3.5" /> Destination
                  </>
                ) : (
                  <>
                    <Settings2 className="h-3.5 w-3.5" /> Tip settings
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === "destination" && (
          <div className="space-y-4">
            {destination ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {destination.method === "mobile_money" ? (
                      <Smartphone className="h-4 w-4" />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold">{destination.bankName}</h4>
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {destination.accountName} · •••• {destination.accountNumberLast4}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-muted-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>No withdrawal destination yet. Add one below to cash out your tips.</span>
              </div>
            )}

            <form onSubmit={handleSaveDestination} className="space-y-4">
              <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-foreground/5 p-1">
                {(
                  [
                    { key: "bank" as const, label: "Bank account", icon: Building2 },
                    { key: "mobile_money" as const, label: "Mobile money", icon: Smartphone },
                  ]
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMethod(key);
                      setBankCode("");
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                      method === key
                        ? "border border-border bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                    {method === "mobile_money" ? "Provider" : "Bank"}
                  </label>
                  <select
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    disabled={banksLoading}
                    className="w-full rounded-xl border border-border/80 bg-foreground/5 px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand"
                    required
                  >
                    <option value="">{banksLoading ? "Loading…" : "Select…"}</option>
                    {options.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                    {method === "mobile_money" ? "Phone number" : "Account number"}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-foreground/5 px-3.5 py-2 font-mono text-xs font-semibold outline-none focus:border-brand"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                    Account name
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-foreground/5 px-3.5 py-2 text-xs font-semibold outline-none focus:border-brand"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-muted-foreground">
                  We never store full account numbers or card details.
                </p>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2 text-xs font-bold text-background shadow-soft transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Verify & save
                </button>
              </div>
            </form>
          </div>
        )}

        {tab === "settings" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Minimum tip
              </span>
              <p className="mt-1 text-lg font-black">{money(settings.minimumTip)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] p-4">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Tips</span>
              <p className="mt-1 text-lg font-black">
                {settings.tipsEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="space-y-4 rounded-3xl border border-border/80 bg-card p-5 shadow-soft md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
            <h3 className="text-base font-bold">Tips received</h3>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {tipsReceived.length} total
          </span>
        </div>

        {tipsReceived.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No tips yet — they'll appear here as supporters send them.
          </p>
        ) : (
          <div className="custom-scrollbar max-h-[260px] divide-y divide-border/60 overflow-y-auto pr-1">
            {tipsReceived.map((tip) => (
              <div key={tip.id} className="flex items-start justify-between gap-3 py-3.5">
                <div className="flex items-start gap-3">
                  <Avatar name={tip.senderName} src={tip.senderAvatar} className="mt-0.5 h-10 w-10 text-xs" />
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{tip.senderName}</span>
                      <span className="text-xs text-muted-foreground">@{tip.senderUsername}</span>
                      <span className="text-xs text-muted-foreground">· {tip.timestamp}</span>
                    </div>
                    {tip.message && (
                      <p className="mt-1 rounded-xl border border-border/40 bg-muted/30 px-2.5 py-1 text-xs italic text-foreground/90">
                        {tip.message}
                      </p>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-base font-black text-emerald-600 dark:text-emerald-400">
                  +{money(tip.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Withdrawals */}
      <div className="space-y-3 rounded-3xl border border-border/80 bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Withdrawal history</h3>
          <span className="text-xs text-muted-foreground">{payouts.length} total</span>
        </div>

        {payouts.length === 0 ? (
          <p className="py-5 text-center text-xs text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <div className="custom-scrollbar max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {payouts.map((po) => (
              <div
                key={po.id}
                className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/20 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{po.destination || po.method}</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {po.date}
                    {po.failureReason ? ` · ${po.failureReason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <span className="text-sm font-bold">{money(po.amount)}</span>
                    <p
                      className={cn(
                        "text-[0.65rem] font-bold capitalize",
                        statusTone[po.status] ?? "text-muted-foreground",
                      )}
                    >
                      {po.status}
                    </p>
                  </div>
                  {["pending", "processing"].includes(po.status) && po.reference && (
                    <button
                      onClick={() => void handleCheck(po.reference)}
                      className="rounded-full border border-border p-1.5 transition-colors hover:bg-muted"
                      title="Refresh status"
                    >
                      <RefreshCw
                        className={cn("h-3 w-3", checking === po.reference && "animate-spin")}
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isPlus && (
        <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-pink-500/10 to-transparent p-6 sm:flex-row">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Lock className="h-4 w-4 text-violet-500" />
              <h4 className="text-sm font-black">Monetization needs Plus or Pro</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Turn on tips across your profile and posts, then withdraw straight to your account.
            </p>
          </div>
          <button
            onClick={() => openUpgradeModal("Creator Monetization Tools")}
            className="whitespace-nowrap rounded-full bg-gradient-to-r from-brand to-brand-pink px-5 py-2.5 text-xs font-bold text-white shadow-soft transition-all hover:brightness-105"
          >
            Upgrade to Plus
          </button>
        </div>
      )}

      {isPayoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200 animate-in fade-in"
          onClick={() => setIsPayoutModalOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-5 rounded-3xl border border-border/80 bg-card p-6 shadow-2xl duration-200 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black">Confirm withdrawal</h3>

            <div className="space-y-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Amount
              </span>
              <div className="text-3xl font-black text-emerald-700 dark:text-emerald-300">
                {money(pendingBalance)}
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                {destination
                  ? `${destination.bankName} •••• ${destination.accountNumberLast4}`
                  : "No destination saved"}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setIsPayoutModalOpen(false)}
                className="flex-1 rounded-2xl border border-border py-2.5 text-xs font-bold transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={payoutProcessing || !destination}
                onClick={() => void handlePayoutSubmit()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-2.5 text-xs font-bold text-white shadow-soft transition-all hover:brightness-105 disabled:opacity-50"
              >
                {payoutProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Withdraw now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
