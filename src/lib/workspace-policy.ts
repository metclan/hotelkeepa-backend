export type LocationPrincipal = { id: string; businessId: string | null; isOwner: boolean };
export type AccessibleLocation = { id: string; businessId: string; isActive: boolean; isDeleted: boolean };
export type LocationMembership = { userId: string; locationId: string; isActive: boolean; roleId: string | null; allDepartments: boolean };

export function canAccessLocation(user: LocationPrincipal, location: AccessibleLocation | null, membership: LocationMembership | null) {
  if (!location || !location.isActive || location.isDeleted || !user.businessId || location.businessId !== user.businessId) return false;
  return user.isOwner || !!(membership?.isActive && membership.userId === user.id && membership.locationId === location.id);
}

export function canManageDepartments(isOwner: boolean, isAdmin: boolean, permissions: string[]) {
  return isOwner || isAdmin || permissions.includes("departments:manage");
}
