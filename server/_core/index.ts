import "dotenv/config";
import express from "express";
import { createServer } from "http";
import type { Request } from "express";
import { bootstrapInitialAdmin, seedLocalTestAccounts } from "../localStore";
import { ensureCatalogIsCurrent, markLocalOrderPaymentPaid } from "../db";
import { parsePaidCheckoutEvent, verifyPayMongoWebhook } from "../payments";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  await bootstrapInitialAdmin();
  await seedLocalTestAccounts();
  if (process.env.DATABASE_URL) await ensureCatalogIsCurrent();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(
    express.json({
      limit: "50mb",
      verify: (req, _res, buffer) => {
        if ((req as Request).originalUrl === "/webhooks/paymongo") {
          (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        }
      },
    })
  );
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/webhooks/paymongo", async (req, res, next) => {
    if (!process.env.PAYMONGO_WEBHOOK_SECRET) {
      res
        .status(503)
        .json({ error: "PayMongo webhook verification is not configured" });
      return;
    }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (
      !rawBody ||
      !verifyPayMongoWebhook(rawBody, req.header("paymongo-signature"))
    ) {
      res.status(401).json({ error: "Invalid PayMongo webhook signature" });
      return;
    }
    const event = parsePaidCheckoutEvent(req.body);
    if (event) {
      const orderId = Number(event.referenceNumber.replace(/^ORDER-/, ""));
      if (!Number.isSafeInteger(orderId) || orderId < 1) {
        console.warn(
          "[Payments] Received a paid event without a valid order reference"
        );
      } else {
        try {
          if (!(await markLocalOrderPaymentPaid(orderId, event.sessionId))) {
            console.warn(
              "[Payments] Paid event did not match a pending checkout session",
              orderId
            );
          }
        } catch (error) {
          next(error);
          return;
        }
      }
    }
    res.sendStatus(200);
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res
      .set("Cache-Control", "no-store")
      .type("application/javascript")
      .send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT");
  server.on("error", error => {
    console.error("Server failed:", error.message);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () =>
    console.log(`Server listening on port ${port}`)
  );
}

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
