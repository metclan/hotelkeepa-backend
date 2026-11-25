import type { PrismaClient } from "../generated/prisma/client.js";
import { permissionGroups } from "./permissions.js";

export async function seedPermissions(prisma: PrismaClient) {
  await prisma.$transaction(async tx => {
    const existing = new Set((await tx.permission.findMany({ select: { code: true } })).map(permission => permission.code));
    for (const { code, name, description, permissions } of permissionGroups) {
      const group = await tx.permissionGroup.upsert({
        where: { code },
        update: { name, description },
        create: { code, name, description },
      });
      for (const permission of permissions) {
        const saved = await tx.permission.upsert({
          where: { code: permission.code },
          update: { name: permission.name, permissionGroupId: group.id },
          create: { ...permission, permissionGroupId: group.id },
        });
        if (existing.has(permission.code)) continue;
        const upgrade = permission.code === "rooms:status:update"
          ? { role: "Housekeeping", previous: "rooms:edit", replace: true }
          : permission.code === "bookings:payments:receive"
            ? { role: "Receptionist", previous: "bookings:edit", replace: false }
            : null;
        if (!upgrade) continue;
        const grants = await tx.rolePermission.findMany({
          where: { role: { name: upgrade.role, isAdmin: false }, permission: { code: upgrade.previous } },
          select: { id: true, roleId: true },
        });
        if (!grants.length) continue;
        await tx.rolePermission.createMany({
          data: grants.map(grant => ({ roleId: grant.roleId, permissionId: saved.id })),
          skipDuplicates: true,
        });
        if (upgrade.replace) await tx.rolePermission.deleteMany({ where: { id: { in: grants.map(grant => grant.id) } } });
      }
    }
  }, { timeout: 30_000 });
}
