import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
import type { AuthenticatedUser } from "./_core/context";
import {
  getLocalSessionCookieOptions,
  getSessionCookieOptions,
} from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import {
  cancelLocalOrder,
  completeLocalSandboxPayment,
  createEmployee,
  createLocalSession,
  createLocalUser,
  createConversation,
  deleteLocalSession,
  getLocalSessionUser,
  getOrderForUser,
  loginLocalUser,
  listConversations,
  listOrders,
  listTransactions,
  replyToConversation,
  setConversationStatus,
  setOrderStatus,
  attachCheckoutSession,
  type LocalUser,
} from "./localStore";
import { assertPaymentsConfigured, createHostedCheckout } from "./payments";
import { CHECKOUT_PAYMENT_METHODS } from "../shared/payments";
import {
  addToCart,
  clearCart,
  createOrder,
  getCatalogBook,
  getStoreState,
  listCatalog,
  removeFromCart,
  setCartQuantity,
  toggleWishlist,
} from "./db";

const sessionId = z.string().min(16).max(128);
const bookId = z.string().min(1).max(64);
const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(10).max(128);

function assertLocalUser(user: AuthenticatedUser | null): LocalUser {
  if (!user || !user.openId.startsWith("local_")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires a local account",
    });
  }
  return user as LocalUser;
}

function setLocalSession(
  ctx: {
    req: Parameters<typeof getLocalSessionCookieOptions>[0];
    res: { cookie: (name: string, value: string, options: object) => unknown };
  },
  userId: number
) {
  const session = createLocalSession(userId);
  ctx.res.cookie(COOKIE_NAME, session.token, {
    ...getLocalSessionCookieOptions(ctx.req),
    maxAge: session.maxAge,
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    register: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(120),
          email: emailSchema,
          password: passwordSchema,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await createLocalUser({ ...input, role: "user" });
        setLocalSession(ctx, user.id);
        return user;
      }),
    login: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          password: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await loginLocalUser(input.email, input.password);
        if (!user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Email or password is incorrect",
          });
        setLocalSession(ctx, user.id);
        const redirectTo =
          user.role === "admin"
            ? "/admin"
            : user.role === "employee"
              ? "/employee"
              : "/";
        return { user, redirectTo };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[
        COOKIE_NAME
      ];
      if (token) deleteLocalSession(token);
      const cookieOptions = token
        ? getLocalSessionCookieOptions(ctx.req)
        : getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    createEmployee: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(120),
          email: emailSchema,
          password: z.string().min(12).max(128),
        })
      )
      .mutation(({ ctx, input }) => {
        assertLocalUser(ctx.user);
        return createEmployee(input);
      }),
  }),
  support: router({
    list: protectedProcedure.query(({ ctx }) =>
      listConversations(assertLocalUser(ctx.user))
    ),
    create: protectedProcedure
      .input(
        z.object({
          channel: z.enum(["system", "books"]),
          subject: z.string().trim().min(3).max(160),
          message: z.string().trim().min(1).max(4000),
        })
      )
      .mutation(({ ctx, input }) =>
        createConversation(
          assertLocalUser(ctx.user),
          input.channel,
          input.subject,
          input.message
        )
      ),
    reply: protectedProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          message: z.string().trim().min(1).max(4000),
        })
      )
      .mutation(({ ctx, input }) =>
        replyToConversation(
          assertLocalUser(ctx.user),
          input.conversationId,
          input.message
        )
      ),
    setStatus: protectedProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          status: z.enum(["open", "resolved"]),
        })
      )
      .mutation(({ ctx, input }) => {
        setConversationStatus(
          assertLocalUser(ctx.user),
          input.conversationId,
          input.status
        );
        return { success: true };
      }),
  }),
  commerce: router({
    orders: protectedProcedure.query(({ ctx }) =>
      listOrders(assertLocalUser(ctx.user))
    ),
    transactions: protectedProcedure.query(({ ctx }) =>
      listTransactions(assertLocalUser(ctx.user))
    ),
    order: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ ctx, input }) => {
        const order = getOrderForUser(input.id, assertLocalUser(ctx.user));
        if (!order)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        return order;
      }),
    setOrderStatus: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          status: z.enum(["paid", "fulfilled", "cancelled"]),
        })
      )
      .mutation(({ ctx, input }) => {
        assertLocalUser(ctx.user);
        setOrderStatus(input.id, input.status);
        return { success: true };
      }),
  }),
  catalog: router({
    list: publicProcedure.query(() => listCatalog()),
    get: publicProcedure
      .input(z.object({ id: bookId }))
      .query(({ input }) => getCatalogBook(input.id)),
  }),
  store: router({
    state: publicProcedure
      .input(z.object({ sessionId }))
      .query(({ input }) => getStoreState(input.sessionId)),
    toggleWishlist: publicProcedure
      .input(z.object({ sessionId, bookId }))
      .mutation(({ input }) => toggleWishlist(input.sessionId, input.bookId)),
    addToCart: publicProcedure
      .input(
        z.object({
          sessionId,
          bookId,
          quantity: z.number().int().min(1).max(20).default(1),
        })
      )
      .mutation(({ input }) =>
        addToCart(input.sessionId, input.bookId, input.quantity)
      ),
    setCartQuantity: publicProcedure
      .input(
        z.object({
          sessionId,
          bookId,
          quantity: z.number().int().min(0).max(20),
        })
      )
      .mutation(({ input }) =>
        setCartQuantity(input.sessionId, input.bookId, input.quantity)
      ),
    removeFromCart: publicProcedure
      .input(z.object({ sessionId, bookId }))
      .mutation(({ input }) => removeFromCart(input.sessionId, input.bookId)),
  }),
  checkout: router({
    createOrder: protectedProcedure
      .input(
        z.object({
          sessionId,
          firstName: z.string().trim().min(1).max(120),
          lastName: z.string().trim().min(1).max(120),
          email: z.string().email().max(320),
          address: z.string().trim().min(3).max(255),
          city: z.string().trim().min(2).max(120),
          postcode: z
            .string()
            .trim()
            .regex(/^\d{4}$/, "Enter a 4-digit Philippine postal code"),
          paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = assertLocalUser(ctx.user);
        if (user.role !== "user") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only customer accounts can place orders",
          });
        }
        let orderId: number | undefined;
        let checkoutSessionCreated = false;
        try {
          if (
            input.paymentMethod === "sandbox" &&
            process.env.NODE_ENV !== "development"
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Direct Sandbox Test is available only in development",
            });
          }
          const onlinePaymentMethod =
            input.paymentMethod === "sandbox" ? null : input.paymentMethod;
          const useLocalPayment =
            onlinePaymentMethod === null ||
            (!process.env.PAYMONGO_SECRET_KEY &&
              process.env.NODE_ENV === "development");
          if (!useLocalPayment) assertPaymentsConfigured();
          const order = await createOrder({
            ...input,
            userId: user.id,
            email: user.email,
          });
          orderId = order.orderId;
          if (useLocalPayment) {
            if (!completeLocalSandboxPayment(orderId)) {
              throw new Error("Could not complete the local test payment");
            }
            await clearCart(input.sessionId);
            return {
              ...order,
              checkoutUrl: null,
              simulated: true,
              estimatedDelivery: estimateDelivery(orderId, user),
            };
          }
          if (!onlinePaymentMethod) {
            throw new Error("An online payment method is required");
          }
          const checkout = await createHostedCheckout({
            orderId,
            amountCents: order.totalCents,
            email: user.email,
            paymentMethod: onlinePaymentMethod,
          });
          attachCheckoutSession(
            orderId,
            checkout.sessionId,
            checkout.checkoutUrl
          );
          checkoutSessionCreated = true;
          await clearCart(input.sessionId);
          return {
            ...order,
            checkoutUrl: checkout.checkoutUrl,
            simulated: false,
            estimatedDelivery: estimateDelivery(orderId, user),
          };
        } catch (error) {
          if (orderId && !checkoutSessionCreated) cancelLocalOrder(orderId);
          if (
            error instanceof Error &&
            (error.message === "Your cart is empty" ||
              error.message.startsWith("Payments are not configured") ||
              error.message.startsWith("Set ") ||
              error.message.startsWith("PAYMONGO_") ||
              error.message.includes(
                "is not enabled in PAYMONGO_PAYMENT_METHOD_TYPES"
              ))
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error.message,
            });
          }
          throw error;
        }
      }),
  }),
});

function estimateDelivery(
  orderId: number,
  user: NonNullable<Awaited<ReturnType<typeof getLocalSessionUser>>>
) {
  const order = getOrderForUser(orderId, user);
  return order?.estimatedDelivery ?? "";
}

export type AppRouter = typeof appRouter;
