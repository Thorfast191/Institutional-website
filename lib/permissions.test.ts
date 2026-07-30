import { describe, it, expect } from "vitest";
import { dashboardPathForRole, isPathAllowedForRole } from "@/lib/permissions";

describe("dashboardPathForRole", () => {
  it("maps each role to its own dashboard path", () => {
    expect(dashboardPathForRole("ADMIN")).toBe("/admin");
    expect(dashboardPathForRole("MANAGER")).toBe("/manager");
    expect(dashboardPathForRole("TEACHER")).toBe("/teacher");
    expect(dashboardPathForRole("STUDENT")).toBe("/student");
  });
});

describe("isPathAllowedForRole", () => {
  it("allows a role into its own dashboard subtree", () => {
    expect(isPathAllowedForRole("/admin/users", "ADMIN")).toBe(true);
    expect(isPathAllowedForRole("/student/grades", "STUDENT")).toBe(true);
  });

  it("blocks a role from another role's dashboard", () => {
    expect(isPathAllowedForRole("/admin/users", "STUDENT")).toBe(false);
    expect(isPathAllowedForRole("/manager/fees", "TEACHER")).toBe(false);
  });

  it("does not treat a sibling path with the same string prefix as a match", () => {
    expect(isPathAllowedForRole("/administration", "ADMIN")).toBe(false);
  });
});

import { requireRole } from "@/lib/permissions";
import { vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

describe("requireRole", () => {
  it("returns the session when the role is allowed", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "ADMIN" },
      expires: "",
    } as never);

    const session = await requireRole(["ADMIN"]);
    expect(session.user.role).toBe("ADMIN");
  });

  it("throws when the session has no user", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(requireRole(["ADMIN"])).rejects.toThrow("Unauthorized");
  });

  it("throws when the role is not in the allowed list", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", role: "STUDENT" },
      expires: "",
    } as never);
    await expect(requireRole(["ADMIN", "MANAGER"])).rejects.toThrow("Unauthorized");
  });
});
