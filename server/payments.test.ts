import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHostedCheckout,
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

  it("creates PayMongo checkout sessions for only the selected enabled method", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_example");
    vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "webhook-test-secret");
    vi.stubEnv("PAYMONGO_MODE", "test");
    vi.stubEnv("PAYMONGO_PAYMENT_METHOD_TYPES", "card,gcash,qrph");
    vi.stubEnv("PUBLIC_APP_URL", "https://leaflore.example");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "cs_test_1",
            attributes: {
              checkout_url: "https://checkout.paymongo.com/cs_test_1",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createHostedCheckout({
        orderId: 42,
        amountCents: 89800,
        email: "reader@example.test",
        paymentMethod: "gcash",
      })
    ).resolves.toEqual({
      sessionId: "cs_test_1",
      checkoutUrl: "https://checkout.paymongo.com/cs_test_1",
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.data.attributes.payment_method_types).toEqual(["gcash"]);
    expect(requestBody.data.attributes.success_url).toBe(
      "https://leaflore.example/order-success/42?payment=return"
    );
  });

  it("does not start a checkout for a method disabled in merchant settings", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_example");
    vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "webhook-test-secret");
    vi.stubEnv("PAYMONGO_MODE", "test");
    vi.stubEnv("PAYMONGO_PAYMENT_METHOD_TYPES", "card");
    vi.stubEnv("PUBLIC_APP_URL", "https://leaflore.example");

    await expect(
      createHostedCheckout({
        orderId: 42,
        amountCents: 89800,
        email: "reader@example.test",
        paymentMethod: "gcash",
      })
    ).rejects.toThrow("not enabled");
  });
});
