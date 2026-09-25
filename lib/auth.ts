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
    requireEmailVerification: false,
  },
  // Closed system — no public signup. User creation is allowed only for:
  // (a) the /api/setup internal call (first admin): no user exists yet AND the
  //     call carries no HTTP headers and no session. Public requests always
  //     have headers, so a stranger can never satisfy this — even at count 0.
  //     (Internal auth.api calls always run in endpoint context with `path`
  //     set, so path alone cannot distinguish; headers-absence can.)
  // (b) admin-provisioned accounts (/api/admin/users): admin session or path.
  // Anything else → false → creation aborted (400). Fail-closed by design.
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
          const isFirstUser = (await prisma.user.count()) === 0;
          const hasHeaders = ctx?.headers != null;
          const role = ctx?.session?.user?.role ?? ctx?.context?.session?.user?.role;
          const path = typeof ctx?.path === "string" ? ctx.path : "";
          if (isFirstUser && !hasHeaders) return;
          if (role === "admin" || path.includes("/admin/")) return;
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
