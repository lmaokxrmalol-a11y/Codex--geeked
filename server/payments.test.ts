import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPaymentMethods,
  parsePaidCheckoutEvent,
  verifyPayMongoWebhook,
} from "./payments";

afterEach(() => vi.unstubAllEnvs());

describe("PayMongo checkout helpers", () => {
  it("defaults to card, GCash, and QR Ph and rejects unknown methods", () => {
    expect(getPaymentMethods()).toEqual(["card", "gcash", "qrph"]);
    expect(getPaymentMethods("card,gcash,card")).toEqual(["card", "gcash"]);
    expect(() => getPaymentMethods("card,unknown")).toThrow("unsupported");
  });

  it("accepts only signed paid checkout events with a reference number", () => {
    const raw = Buffer.from(
      '{"data":{"type":"checkout_session.payment.paid"}}'
    );
    const signature = createHmac("sha256", "webhook-test-secret")
      .update(`1234567890.${raw.toString()}`)
      .digest("hex");
    vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "webhook-test-secret");
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_example");
    expect(
      verifyPayMongoWebhook(raw, `t=1234567890,te=${signature},li=ignored`)
    ).toBe(true);
    expect(verifyPayMongoWebhook(raw, "t=1234567890,te=00,li=ignored")).toBe(
      false
    );
    expect(
      parsePaidCheckoutEvent({
        data: {
          type: "checkout_session.payment.paid",
          data: {
            id: "cs_test_1",
            attributes: { reference_number: "ORDER-42" },
          },
        },
      })
    ).toEqual({ sessionId: "cs_test_1", referenceNumber: "ORDER-42" });
    expect(
      parsePaidCheckoutEvent({ data: { type: "payment.failed" } })
    ).toBeNull();
  });
});
