# Hotel locations and departments

A Business contains hotel Locations. Each Location has its own rooms, guests, reservations, payment labels, roles and optional Departments. Country and currency remain business settings shared by its hotels.

## Using the app

- Settings → Hotel locations → Add hotel location opens a wide three-step modal (hotel details, operation preset, preferences), then creates the branch and switches to it. The timezone field opens a searchable modal shared with onboarding. The sidebar's Current hotel selector switches among accessible branches.
- Settings → Departments → Add department creates a department within the selected hotel. Edit controls its name, inventory/sales capability flags and invoice heading/prefix. Disable preserves settings and staff assignments; Reactivate restores it. Delete unused is available only for departments without any staff assignment history.
- The business owner can use a hotel's Manage access button to grant existing business users access, choose a hotel-specific role and allow either all departments or only assigned ones.
- Department Staff access assigns active hotel members as staff or department managers. Hotel roles control permission to change department settings; the department role records the member's responsibility within the team.

Owners have access to all active hotels in their business. Hotel Admin roles have all permissions within their hotel. Other roles require departments:manage to manage department settings and locations:create to create a hotel. Those permissions are installed by the migration and included in the Prisma seed catalogue. Hotel membership administration is owner-only.

## Data and access model

Session.activeLocationId selects the hotel for a signed-in session. User.locationId remains the default and is not overwritten by switching. Middleware resolves the persisted user, active membership and hotel-specific role for each request. Stale cached authentication fields cannot grant access to a different hotel. If selected access is revoked or a hotel is disabled, the middleware selects an accessible fallback, or resolves an empty scope when none exists. The interface then blocks the workspace if there is no active hotel.

UserLocation.roleId references a role in the same hotel through a composite foreign key. Existing users' roles are backfilled at their default hotel. New signups and accepted invitations also create role-bearing memberships. UserDepartment requires a matching UserLocation and Department location through composite foreign keys. allDepartments grants broad department visibility; otherwise staff see only active assigned departments. Management roles can view disabled departments for reactivation.

Management mutations send X-Location-Id. A stale management form receives 409 if another tab changed the session's hotel. Switching fully navigates to the dashboard to clear mounted hotel-specific state. Session selection is shared by tabs using that login cookie; independent sign-ins have independent selections.

Location creation atomically creates default roles, grants its creator Admin access, creates a walk-in guest and payment labels, and seeds only the selected department preset. An active business-wide subscription's maxLocations limit is checked, serialized per business. No subscription cap is invented when no business-wide subscription exists.

Onboarding presets are starting choices, not restrictions: reservations_only creates no departments, reservations_bar creates Bar, full_service creates Main Store, Bar and Restaurant. Reservations remain hotel-level. The three-step form submits all details together and completes only after the transaction commits.

## Deployment and validation

Apply the pending migrations using `npx prisma migrate deploy`, then `npx prisma generate`. Migrations were prepared, not applied, by this task. Existing hotels receive no departments automatically. Current roles and default locations are retained.

From backend run:

```sh
npm run build
node --import tsx --test tests/workspace.test.ts tests/onboarding-schema.test.ts tests/cloud-services.test.ts
```

Tests use mocked persistence and cloud services. A live database migration and live multi-user smoke test remain deployment checks.

The inventory/sales flags and invoice fields configure department capabilities. Product prices, stock balances, transfers, sales and rendered department invoices remain separate features. Future operational tables must reference departments with Restrict deletion and validate active department access. Disable endpoints must then check zero stock and no pending transfers before allowing deactivation. Today there are no department inventory or sales records to clear.

Timezone is saved as hotel configuration; converting every existing booking/report timestamp to that timezone is separate work. Logos are uploaded to Cloudflare R2; the database stores only their public URL and key. See the backend README for R2 and AWS SES configuration.
