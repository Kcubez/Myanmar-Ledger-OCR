import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    // Create the user via Better Auth (hashes password, creates Account link).
    const newAdminResponse = await auth.api.signUpEmail({
      body: { email, password, name },
      asResponse: true,
    });

    if (!newAdminResponse.ok) {
      throw new Error("Failed to create admin user account.");
    }

    // Elevate ONLY if this is still the only user — the recount inside the
    // transaction closes the race where two concurrent setups could both pass.
    const elevated = await prisma.$transaction(async (tx) => {
      const total = await tx.user.count();
      if (total !== 1) {
        await tx.user.delete({ where: { email } });
        return false;
      }
      await tx.user.update({ where: { email }, data: { role: "admin" } });
      return true;
    });

    if (!elevated) {
      return NextResponse.json(
        { message: "Setup is already locked. Admin already exists." },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, message: "Initial admin created!" });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create initial admin" },
      { status: 500 },
    );
  }
}
