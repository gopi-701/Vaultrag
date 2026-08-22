import "server-only";

import jwt from "jsonwebtoken";

import type { UnsignedUserClaims } from "./claims";

const TOKEN_TTL = "15m";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export function signToken(claims: UnsignedUserClaims): string {
  return jwt.sign(claims, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL,
  });
}
