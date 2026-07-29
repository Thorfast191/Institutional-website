// auth.config.test.ts
import { describe, it, expect } from "vitest";
import { jwtCallback, sessionCallback } from "@/auth.config";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";

describe("jwtCallback", () => {
  it("copies id and role from user onto the token at sign-in", () => {
    const token = {} as JWT;
    const user = { id: "user-1", role: "TEACHER" } as User;

    const result = jwtCallback({ token, user });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("TEACHER");
  });

  it("leaves an existing token unchanged when no user is passed", () => {
    const token = { id: "user-1", role: "TEACHER" } as JWT;

    const result = jwtCallback({ token });

    expect(result.id).toBe("user-1");
    expect(result.role).toBe("TEACHER");
  });
});

describe("sessionCallback", () => {
  it("copies id and role from the token onto session.user", () => {
    const session = { user: {}, expires: "" } as unknown as Session;
    const token = { id: "user-1", role: "ADMIN" } as JWT;

    const result = sessionCallback({ session, token });

    expect(result.user.id).toBe("user-1");
    expect(result.user.role).toBe("ADMIN");
  });
});
