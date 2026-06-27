import type { TFn } from "@/lib/i18n";

export const REQUEST_TYPES = ["business_trip", "expense", "leave"] as const;
export const REQUEST_STATUSES = ["draft", "submitted", "pending_approval", "approved", "rejected", "cancelled", "paid", "closed"] as const;
export const EXPENSE_CATEGORIES = ["fuel", "parking", "taxi", "hotel", "meals", "customer_meeting", "office_admin", "business_trip", "other"] as const;
export const LEAVE_TYPES = ["annual", "sick", "unpaid", "emergency", "other"] as const;
export const TRAVEL_TYPES = ["domestic", "international"] as const;
export const TRANSPORT_TYPES = ["flight", "car", "bus", "train", "other"] as const;

// Categories that require a receipt by default.
export const RECEIPT_REQUIRED = new Set(["fuel", "hotel", "meals", "taxi"]);

export const RSTATUS_STYLE: Record<string, string> = {
  draft: "bg-cream-deep text-muted",
  submitted: "bg-sky-50 text-sky-700",
  pending_approval: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-roshen-red/10 text-roshen-red",
  cancelled: "bg-cream-deep text-muted",
  paid: "bg-emerald-50 text-emerald-700",
  closed: "bg-cream-deep text-muted",
};

export type Opt = { value: string; label: string };
export const typeOpts = (t: TFn): Opt[] => REQUEST_TYPES.map((k) => ({ value: k, label: t(`rtype.${k}`) }));
export const statusReqOpts = (t: TFn): Opt[] => REQUEST_STATUSES.map((k) => ({ value: k, label: t(`rstatus.${k}`) }));
export const expenseCatOpts = (t: TFn): Opt[] => EXPENSE_CATEGORIES.map((k) => ({ value: k, label: t(`ecat.${k}`) }));
export const leaveTypeOpts = (t: TFn): Opt[] => LEAVE_TYPES.map((k) => ({ value: k, label: t(`ltype.${k}`) }));
export const travelTypeOpts = (t: TFn): Opt[] => TRAVEL_TYPES.map((k) => ({ value: k, label: t(`ttype.${k}`) }));
export const transportOpts = (t: TFn): Opt[] => TRANSPORT_TYPES.map((k) => ({ value: k, label: t(`ttran.${k}`) }));

export const money = (v: unknown, currency = "SAR") => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}` : "—";
};
