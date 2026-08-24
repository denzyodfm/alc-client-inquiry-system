export function branchIdentityScope(branchIds: number[] | null) {
  return branchIds === null ? {} : branchIds.length ? { id: { in: branchIds } } : { id: -1 };
}

export function branchRecordScope(branchIds: number[] | null) {
  return branchIds === null ? {} : branchIds.length ? { branchId: { in: branchIds } } : { branchId: -1 };
}
