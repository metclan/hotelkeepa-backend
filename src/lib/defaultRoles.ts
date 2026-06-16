export const DEFAULT_ROLES = [
  {
    name: "Admin",
    isAdmin: true,
    permissions: [],
  },
  {
    name: "Receptionist",
    isAdmin: false,
    permissions: [
      "dashboard:view",
      "rooms:view",
      "room:types:view",
      "bookings:view",
      "bookings:create",
      "bookings:edit",
      "bookings:print",
      "guests:view",
      "guests:create",
      "guests:edit",
      "reports:view:bookings",
      "reports:view:occupancy",
    ],
  },
  {
    name: "Housekeeping",
    isAdmin: false,
    permissions: [
      "rooms:view",
      "rooms:edit", // only edit to update room status
    ],
  },
];
