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
      "bookings:payments:receive",
      "bookings:print",
      "guests:view",
      "guests:create",
      "reports:view:bookings",
      "reports:view:occupancy",
    ],
  },
  {
    name: "Housekeeping",
    isAdmin: false,
    permissions: [
      "rooms:view",
      "rooms:status:update",
    ],
  },
  {
    name: "Cashier",
    isAdmin: false,
    permissions: ["sales:pos"],
  },
  {
    name: "Inventory",
    isAdmin: false,
    permissions: ["products:view", "products:manage"],
  },
  {
    name: "Finance",
    isAdmin: false,
    permissions: ["dashboard:view", "dashboard:revenue:view", "reports:view:bookings", "reports:view:payments"],
  },
];
