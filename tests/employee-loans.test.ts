import assert from "node:assert/strict";
import test from "node:test";
import {
  canSeeEmployeeLoans,
  employeeLoanFilterFor,
  employeeLoanWhere,
  excludeEmployeeLoanWhere
} from "../lib/employee-loans";

// Who may see staff loans is a rule that is easy to weaken by accident, so the shape of the
// filter is pinned here. The database is not touched: Admin short-circuits inside
// canAccessFunction before any query, which is the one path that can be checked hermetically.

test("the rule is the loan product, not the branch", () => {
  // An earlier version also required the loan to sit at ALC HO, which let staff loans booked
  // at other branches through. If this assertion grows a branch clause, that bug is back.
  assert.deepEqual(employeeLoanWhere(), { loanProduct: { contains: "EMPLOYEE" } });
  assert.deepEqual(excludeEmployeeLoanWhere(), { NOT: { loanProduct: { contains: "EMPLOYEE" } } });
});

test("Admin is not filtered", async () => {
  const filter = await employeeLoanFilterFor({ role: "ADMIN", privilegeTemplateId: null });
  assert.deepEqual(filter, {}, "an empty filter is what lets every loan through");
  assert.equal(await canSeeEmployeeLoans({ role: "ADMIN", privilegeTemplateId: null }), true);
});

test("an empty filter is never how a restricted viewer is expressed", () => {
  // Guards the calling convention: {} means "see everything". A restricted viewer must get a
  // NOT, so a site that spreads the filter into a where clause cannot silently open up.
  assert.notDeepEqual(excludeEmployeeLoanWhere(), {});
});
