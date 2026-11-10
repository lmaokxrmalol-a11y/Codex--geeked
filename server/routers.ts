import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { addToCart, createOrder, getCatalogBook, getStoreState, listCatalog, removeFromCart, setCartQuantity, toggleWishlist } from "./db";

const sessionId = z.string().min(16).max(128);
const bookId = z.string().min(1).max(64);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  catalog: router({
    list: publicProcedure.query(() => listCatalog()),
    get: publicProcedure.input(z.object({ id: bookId })).query(({ input }) => getCatalogBook(input.id)),
  }),
  store: router({
    state: publicProcedure.input(z.object({ sessionId })).query(({ input }) => getStoreState(input.sessionId)),
    toggleWishlist: publicProcedure.input(z.object({ sessionId, bookId })).mutation(({ input }) => toggleWishlist(input.sessionId, input.bookId)),
    addToCart: publicProcedure.input(z.object({ sessionId, bookId, quantity: z.number().int().min(1).max(20).default(1) })).mutation(({ input }) => addToCart(input.sessionId, input.bookId, input.quantity)),
    setCartQuantity: publicProcedure.input(z.object({ sessionId, bookId, quantity: z.number().int().min(0).max(20) })).mutation(({ input }) => setCartQuantity(input.sessionId, input.bookId, input.quantity)),
    removeFromCart: publicProcedure.input(z.object({ sessionId, bookId })).mutation(({ input }) => removeFromCart(input.sessionId, input.bookId)),
  }),
  checkout: router({
    createOrder: publicProcedure.input(z.object({
      sessionId,
      firstName: z.string().trim().min(1).max(120),
      lastName: z.string().trim().min(1).max(120),
      email: z.string().email().max(320),
      address: z.string().trim().min(3).max(255),
      city: z.string().trim().min(2).max(120),
      postcode: z.string().trim().min(2).max(32),
    })).mutation(async ({ input }) => {
      try {
        return await createOrder(input);
      } catch (error) {
        if (error instanceof Error && error.message === "Your reading stack is empty") {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
