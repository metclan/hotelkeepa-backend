export const permissionGroups = [
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
    name: "Guests",
    code: "guests",
    description: "Manage guests",
    permissions: [
      {
        name: "View Guest",
        code: "guest:view",
      },
      {
        name: "Create Guest",
        code: "guest:create",
      },
      {
        name: "Edit Guest",
        code: "guest:edit",
      },
      {
        name: "Delete Guest",
        code: "guest:delete",
      },
    ],
  },
];
