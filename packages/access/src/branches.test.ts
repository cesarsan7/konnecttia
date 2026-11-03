import { describe, expect, it } from "vitest";
import {
  ALL_BRANCHES,
  branchFilter,
  buildAccessContext,
  canAccessBranch,
  canGrantBranches,
} from "./authorize";
import { PLAN, PLAN_MODULES } from "./modules";
import { ROLE_TEMPLATE, ROLE_TEMPLATE_PERMISSIONS } from "./permissions";

const base = {
  restauranteId: 3,
  contractedModules: PLAN_MODULES[PLAN.Premium],
  rolePermissions: [ROLE_TEMPLATE_PERMISSIONS[ROLE_TEMPLATE.Staff]],
};
const owner = buildAccessContext(base);
const cajeroPlaya = buildAccessContext({ ...base, branchIds: [2] });

describe("alcance por locales", () => {
  it("sin locales asignados, acceso a todos", () => {
    expect(owner.branchScope).toBe(ALL_BRANCHES);
    expect(canAccessBranch(owner, 7)).toBe(true);
    expect(branchFilter(owner)).toBeNull();
    expect(branchFilter(owner, 7)).toEqual([7]);
  });

  it("un cajero solo ve su local", () => {
    expect(canAccessBranch(cajeroPlaya, 2)).toBe(true);
    expect(canAccessBranch(cajeroPlaya, 1)).toBe(false);
    expect(canAccessBranch(cajeroPlaya, null)).toBe(false);
    expect(branchFilter(cajeroPlaya)).toEqual([2]);
    expect(branchFilter(cajeroPlaya, 1)).toEqual([]);
  });

  it("no se puede ampliar el alcance al asignar locales", () => {
    expect(canGrantBranches(owner, [])).toBe(true);
    expect(canGrantBranches(cajeroPlaya, [2])).toBe(true);
    expect(canGrantBranches(cajeroPlaya, [])).toBe(false);
    expect(canGrantBranches(cajeroPlaya, [1, 2])).toBe(false);
  });
});
