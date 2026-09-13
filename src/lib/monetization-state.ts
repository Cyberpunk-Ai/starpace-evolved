/**
 * Creator earnings state. Everything here comes from the backend — balances are
 * derived from real recorded tips and real payouts, and withdrawals go through
 * the payment provider. No local seeding, no cached fake ledger.
 */
import { useCallback, useEffect, useState } from "react";

import { signedInProfileId } from "@/lib/remote-store";
import { sendTipApi } from "@/lib/api-client";
import {
  getEarnings,
  listPayoutBanks,
  refreshPayoutStatus,
  requestPayout as requestPayoutApi,
  savePayoutDestination,
} from "@/lib/payouts.functions";

/** Withdrawal rails supported by the payment provider. */
export type PayoutMethod = "bank" | "mobile_money";

export interface PayoutDestination {
  method: PayoutMethod;
  accountName: string;
  accountNumberLast4: string;
  bankCode: string;
  bankName: string;
  recipientCode?: string | null;
  currency?: string;
  verifiedAt?: string;
}

export interface TipRecord {
  id: string;
  senderName: string;
  senderUsername: string;
  senderAvatar?: string;
  amount: number;
  message?: string;
  timestamp: string;
}

export interface PayoutRecord {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  destination: string | null;
  failureReason: string | null;
  date: string;
}

export interface MonetizationSettings {
  minimumTip: number;
  tipsEnabled: boolean;
}

export interface SendTipInput {
  recipientUsername: string;
  amount: number;
  message?: string;
  senderName: string;
  senderUsername: string;
  senderAvatar?: string;
  postId?: string;
  spaceId?: string;
}

export interface PayoutBank {
  name: string;
  code: string;
  type: string;
  isMobileMoney: boolean;
}

interface MonetizationState {
  loading: boolean;
  totalEarnings: number;
  pendingBalance: number;
  currency: string;
  tipsReceived: TipRecord[];
  payouts: PayoutRecord[];
  activePayoutMethod: PayoutMethod;
  destination: PayoutDestination | null;
  settings: MonetizationSettings;
}

const EMPTY: MonetizationState = {
  loading: true,
  totalEarnings: 0,
  pendingBalance: 0,
  currency: "KES",
  tipsReceived: [],
  payouts: [],
  activePayoutMethod: "bank",
  destination: null,
  settings: { minimumTip: 1, tipsEnabled: true },
};

let state: MonetizationState = EMPTY;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

function publish(next: MonetizationState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export async function refreshMonetization() {
  if (!signedInProfileId()) {
    publish({ ...EMPTY, loading: false });
    return;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const data = await getEarnings();
      const paystack = (data.settings?.paystack ?? {}) as Partial<PayoutDestination>;
      publish({
        loading: false,
        totalEarnings: data.totalEarnings,
        pendingBalance: data.pendingBalance,
        currency: data.currency,
        tipsReceived: data.tips.map((t) => ({
          id: t.id,
          senderName: t.senderName,
          senderUsername: t.senderUsername,
          senderAvatar: t.senderAvatar,
          amount: t.amount,
          message: t.message || undefined,
          timestamp: new Date(t.createdAt).toLocaleString(),
        })),
        payouts: data.payouts.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          status: p.status,
          reference: p.reference,
          destination: p.destination,
          failureReason: p.failureReason,
          date: new Date(p.createdAt).toLocaleDateString(),
        })),
        activePayoutMethod: (data.settings?.payoutMethod ?? "bank") as PayoutMethod,
        destination: paystack?.recipientCode ? (paystack as PayoutDestination) : null,
        settings: {
          minimumTip: data.settings?.minimumTip ?? 1,
          tipsEnabled: data.settings?.tipsEnabled ?? true,
        },
      });
    } catch {
      publish({ ...state, loading: false });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Read-only balance for small surfaces such as the profile tip button. */
export function useCreatorBalance() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    const sync = () => setSnapshot({ ...state });
    listeners.add(sync);
    sync();
    void refreshMonetization();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return {
    loading: snapshot.loading,
    totalEarnings: snapshot.totalEarnings,
    pendingBalance: snapshot.pendingBalance,
  };
}

export function useMonetization() {
  const [snapshot, setSnapshot] = useState<MonetizationState>(state);

  useEffect(() => {
    const sync = () => setSnapshot({ ...state });
    listeners.add(sync);
    sync();
    void refreshMonetization();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const sendTip = useCallback(async (input: SendTipInput) => {
    await sendTipApi({
      recipientUsername: input.recipientUsername,
      amount: input.amount,
      message: input.message,
      postId: input.postId,
      spaceId: input.spaceId,
    });
    await refreshMonetization();
  }, []);

  const requestPayout = useCallback(async (amount?: number) => {
    const result = await requestPayoutApi({ data: { amount } });
    await refreshMonetization();
    return result;
  }, []);

  const saveDestination = useCallback(
    async (input: {
      method: PayoutMethod;
      accountName: string;
      accountNumber: string;
      bankCode: string;
      bankName: string;
    }) => {
      const details = await savePayoutDestination({ data: input });
      await refreshMonetization();
      return details;
    },
    [],
  );

  const loadBanks = useCallback(async (): Promise<PayoutBank[]> => {
    return (await listPayoutBanks()) as PayoutBank[];
  }, []);

  const checkPayout = useCallback(async (reference: string) => {
    const result = await refreshPayoutStatus({ data: { reference } });
    await refreshMonetization();
    return result;
  }, []);

  return {
    ...snapshot,
    sendTip,
    requestPayout,
    saveDestination,
    loadBanks,
    checkPayout,
    refresh: refreshMonetization,
  };
}
