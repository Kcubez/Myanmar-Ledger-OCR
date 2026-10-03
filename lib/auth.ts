import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
  },
  // Accounts are provisioned through the authenticated admin plugin only.
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          const ctx = context as {
            path?: unknown;
            headers?: unknown;
            session?: { user?: { role?: unknown } };
            context?: { session?: { user?: { role?: unknown } } };
          } | null | undefined;
          const role = ctx?.session?.user?.role ?? ctx?.context?.session?.user?.role;
          const path = typeof ctx?.path === "string" ? ctx.path : "";
          if (role === "admin" && path === "/admin/create-user") return;
          return false;
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRole: "admin",
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session every 24h
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min cache
    },
  },
});

export type Session = typeof auth.$Infer.Session;
