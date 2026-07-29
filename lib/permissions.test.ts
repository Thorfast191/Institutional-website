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
