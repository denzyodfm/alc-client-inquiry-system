// Which team leader a user can be tied to follows their privilege, not their role:
// Remedial Officers are organised by area, Loan Officers by branch. Everyone else may
// carry both. Names are compared loosely so a renamed template keeps working.
export function privilegeAssignmentRules(privilegeName?: string | null) {
  const name = (privilegeName ?? "").trim().toLowerCase();
  return {
    allowsAreaTeamLeader: name !== "loan officer",
    allowsBranchTeamLeader: name !== "remedial officer"
  };
}
