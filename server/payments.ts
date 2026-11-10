import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const checkoutResponseSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    attributes: z.object({
      checkout_url: z.string().url(),
    }),
  }),
});

const webhookSchema = z.object({
  data: z.object({
    type: z.string(),
    data: z.object({
      id: z.string(),
      attributes: z.object({
        reference_number: z.string().optional(),
      }),
    }),
  }),
});

export function getPaymentMethods(
  value = process.env.PAYMONGO_PAYMENT_METHOD_TYPES
) {
  const allowed = new Set([
    "card",
    "gcash",
    "qrph",
    "grab_pay",
    "paymaya",
    "billease",
  ]);
  const methods = (value ?? "card,gcash,qrph")
    .split(",")
    .map(method => method.trim().toLowerCase())
    .filter((method, index, list) => method && list.indexOf(method) === index);
  if (methods.length === 0 || methods.some(method => !allowed.has(method))) {
    throw new Error(
      "PAYMONGO_PAYMENT_METHOD_TYPES contains an unsupported or empty payment method"
    );
  }
  return methods;
}

function getPublicAppUrl() {
  const value =
    process.env.PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production"
      ? ""
      : `http://localhost:${process.env.PORT ?? "3000"}`);
  if (!value)
    throw new Error("Set PUBLIC_APP_URL to the public base URL of this app");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "PUBLIC_APP_URL must be an http or https URL without credentials"
    );
  }
  return url.origin;
}

export function assertPaymentsConfigured() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  const mode = process.env.PAYMONGO_MODE ?? "test";
  if (mode !== "test" && mode !== "live")
    throw new Error("PAYMONGO_MODE must be test or live");
  if (!secretKey)
    throw new Error(
      "Payments are not configured. Add a PayMongo test secret key to PAYMONGO_SECRET_KEY."
    );
  if (!secretKey.startsWith(`sk_${mode}_`)) {
    throw new Error(
      `PAYMONGO_SECRET_KEY must be a PayMongo ${mode} secret key`
    );
  }
  if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
    throw new Error(
      "Set PAYMONGO_WEBHOOK_SECRET so successful payments can be verified"
    );
  }
  getPaymentMethods();
  getPublicAppUrl();
  return secretKey;
}

export async function createHostedCheckout(input: {
  orderId: number;
  amountCents: number;
  email: string;
}) {
  const secretKey = assertPaymentsConfigured();
  const baseUrl = getPublicAppUrl();
  const response = await fetch(
    "https://api.paymongo.com/v2/checkout_sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `codex-geeked order #${input.orderId}`,
                amount: input.amountCents,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: getPaymentMethods(),
            success_url: `${baseUrl}/?payment=return&order=${input.orderId}`,
            cancel_url: `${baseUrl}/?payment=cancel&order=${input.orderId}`,
            reference_number: `ORDER-${input.orderId}`,
            send_email_receipt: true,
            billing: { email: input.email },
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) {
    const body = await response.text();
    console.error(
      "[Payments] PayMongo checkout creation failed",
      response.status,
      body.slice(0, 1000)
    );
    throw new Error(
      "PayMongo could not start checkout. Check the payment methods enabled for your account and try again."
    );
  }
  const result = checkoutResponseSchema.safeParse(await response.json());
  if (!result.success)
    throw new Error("PayMongo returned an invalid checkout response");
  const checkoutUrl = new URL(result.data.data.attributes.checkout_url);
  if (
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.paymongo.com"
  ) {
    throw new Error("PayMongo returned an unexpected checkout URL");
  }
  return {
    sessionId: result.data.data.id,
    checkoutUrl: checkoutUrl.toString(),
  };
}

export function verifyPayMongoWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined
) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) throw new Error("PAYMONGO_WEBHOOK_SECRET is not configured");
  if (!signatureHeader) return false;
  const fields = Object.fromEntries(
    signatureHeader.split(",").map(field => {
      const separator = field.indexOf("=");
      return separator > 0
        ? [field.slice(0, separator).trim(), field.slice(separator + 1).trim()]
        : ["", ""];
    })
  );
  const timestamp = fields.t;
  const received = process.env.PAYMONGO_MODE === "live" ? fields.li : fields.te;
  if (!timestamp || !received || !/^\d+$/.test(timestamp)) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(received, "hex");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parsePaidCheckoutEvent(payload: unknown) {
  const parsed = webhookSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.data.type !== "checkout_session.payment.paid"
  )
    return null;
  return {
    sessionId: parsed.data.data.data.id,
    referenceNumber: parsed.data.data.data.attributes.reference_number ?? "",
  };
}
