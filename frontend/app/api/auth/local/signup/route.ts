/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth/users";
import { normalizeEmail, validateNewCredentialsInput } from "@/lib/auth/validation";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body || {};
    const normalizedEmail = normalizeEmail(email ?? "");
    const validationError = validateNewCredentialsInput(normalizedEmail, password ?? "");
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const user = await createUser(normalizedEmail, password);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e: any) {
    if (e.message === "UserExists") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message || "Signup failed" }, { status: 500 });
  }
}
