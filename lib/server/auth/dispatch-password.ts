import crypto from "node:crypto";
import { NextResponse } from "next/server";

export function isValidDispatchPassword(password: unknown): boolean {
  const expected = process.env.MANUAL_DISPATCH_PASSWORD;
  if (!expected || typeof password !== "string" || password.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));
}

export function invalidDispatchPasswordResponse() {
  return NextResponse.json({ error: "Senha de disparo inválida." }, { status: 403 });
}
