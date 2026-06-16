type PermissionGroup = {
  name: string;
  code: string;
  description: string;
  permissions: Permission[];
}[];
type Permission = {
  name: string;
  code: string;
};
export const permissionGroups: PermissionGroup = [
  // Dashboard
  {
    name: "Dashboard",
    code: "dashboard",
    description: "View dashboard statistics and overview",
    permissions: [
      {
        name: "View Dashboard",
        code: "dashboard:view",
      },
    ],
  },
  {
    name: "Rooms",
    code: "rooms",
    description: "Create and edit rooms",
    permissions: [
      {
        name: "View Rooms",
        code: "rooms:view",
      },
      {
        name: "Create Rooms",
        code: "rooms:create",
      },
      {
        name: "Edit Rooms",
        code: "rooms:edit",
      },
      {
        name: "Delete Rooms",
        code: "rooms:delete",
      },
    ],
  },
  {
    name: "Room Types",
    code: "room:types",
    description: "Create and edit room types",
    permissions: [
      {
        name: "View Room types",
        code: "room:types:view",
      },
      {
        name: "Create Rooms Types",
        code: "room:types:create",
      },
      {
        name: "Edit Rooms Types",
        code: "room:types:edit",
      },
      {
        name: "Delete Room Types",
        code: "room:types:delete",
      },
    ],
  },
  {
    name: "Bookings",
    code: "bookings",
    description: "Manage Bookings & Reservations",
    permissions: [
      {
        name: "View Bookings",
        code: "bookings:view",
      },
      {
        name: "Create Bookings",
        code: "bookings:create",
      },
      {
        name: "Edit Bookings",
        code: "bookings:edit",
      },
      {
        name: "Print Bookings",
        code: "bookings:print",
      },
      {
        name: "Delete Bookings",
        code: "bookings:delete",
      },
    ],
  },
  {
    name: "Guests",
    code: "guests",
    description: "Manage guests",
    permissions: [
      {
        name: "View Guest",
        code: "guests:view",
      },
      {
        name: "Create Guest",
        code: "guests:create",
      },
      {
        name: "Edit Guest",
        code: "guests:edit",
      },
      {
        name: "Delete Guest",
        code: "guests:delete",
      },
    ],
  },
  {
    name: "Users Management",
    code: "users",
    description: "Manage users and invitations",
    permissions: [
      {
        name: "View Users",
        code: "users:view",
      },
      {
        name: "Invite Users",
        code: "users:invite",
      },
      {
        name: "Modify Users",
        code: "users:modify",
      },
      {
        name: "Delete Users",
        code: "users:delete",
      },
    ],
  },
  {
    name: "Roles Management",
    code: "roles",
    description: "Manage roles & permissions",
    permissions: [
      {
        name: "View Roles",
        code: "roles:view",
      },
      {
        name: "Create Roles",
        code: "roles:create",
      },
      {
        name: "Edit Roles",
        code: "roles:edit",
      },
      {
        name: "Delete Roles",
        code: "roles:delete",
      },
    ],
  },
  {
    name: "Reports",
    code: "reports",
    description: "Run reports and analytics",
    permissions: [
      {
        name: "View Booking Reports",
        code: "reports:view:bookings",
      },
      {
        name: "View Payment Reports",
        code: "reports:view:payments",
      },
      {
        name: "View Occupancy Reports",
        code: "reports:view:occupancy",
      },
    ],
  },
];
