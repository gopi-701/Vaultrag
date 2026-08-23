import "server-only";

import jwt from "jsonwebtoken";

import {
  UserClaimsSchema,
  type VerifiedUserClaims,
} from "./claims";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export function verifyToken(token: string): VerifiedUserClaims {
  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });
  const claims = UserClaimsSchema.parse(decoded);

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new jwt.TokenExpiredError("jwt expired", new Date(claims.exp * 1000));
  }

  // The private brand has no runtime representation. This assertion remains
  // inside the authentication module and follows signature, algorithm, schema,
  // and expiration verification above.
  return claims as VerifiedUserClaims;
}
