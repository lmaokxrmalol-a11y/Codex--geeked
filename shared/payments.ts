export const ONLINE_PAYMENT_METHODS = ["gcash", "card", "qrph"] as const;
export const CHECKOUT_PAYMENT_METHODS = [
  ...ONLINE_PAYMENT_METHODS,
  "sandbox",
] as const;

export type OnlinePaymentMethod = (typeof ONLINE_PAYMENT_METHODS)[number];
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
  gcash: "GCash",
  card: "Credit / Debit Card",
  qrph: "QR Ph",
  sandbox: "Direct Sandbox Test",
};
