export function canAccessLocation(user, location, membership) {
    if (!location || !location.isActive || location.isDeleted || !user.businessId || location.businessId !== user.businessId)
        return false;
    return user.isOwner || !!(membership?.isActive && membership.userId === user.id && membership.locationId === location.id);
}
export function canManageDepartments(isOwner, isAdmin, permissions) {
    return isOwner || isAdmin || permissions.includes("departments:manage");
}
