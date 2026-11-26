# Hotelkeepa backend

## Configuration

Use `.env.example` for the backend settings. Keep secrets in the backend environment or deployment secret store.

### Cloudflare R2 logos

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` and `R2_PUBLIC_BASE_URL`. `R2_ENDPOINT` can override the default account endpoint for jurisdiction-specific buckets. Use R2 S3 API credentials with object write/delete access to the asset bucket. R2 credentials are separate from the AWS credentials used for SES.

Enable a public HTTPS custom domain for the logo assets and use it as `R2_PUBLIC_BASE_URL`; the authenticated R2 API endpoint is not a public image URL. Uploads go through the backend, so browser-to-R2 CORS configuration is not required for this onboarding flow.

Object layout:

```text
logo/<businessId>-<business-name-slug>/logofolder/<unique-id>.<png|jpg|webp>
```

Example: `logo/550e8400-e29b-41d4-a716-446655440000-metclan-hotel/logofolder/<unique-id>.png`.

The business ID is read from the authenticated owner's persisted record; the name is sanitized from onboarding. The database stores the public URL and object key, not image bytes. Each attempt gets a unique object key. If the database transaction fails, the backend attempts to remove that attempt's upload; cleanup failures are logged. Logos are optional and limited to 200 KB PNG, JPEG or WebP files. Existing objects are not renamed automatically if a hotel's name changes.

### AWS SES email

Set `AWS_REGION` and `SES_FROM_EMAIL`, using a sender identity verified in that SES region. Optional settings: `SES_REPLY_TO_EMAIL` and `SES_CONFIGURATION_SET`.

The AWS SDK uses its standard credential chain. Use an IAM role in deployment, or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` for temporary credentials). The identity needs SES send-email permission. SES sandbox accounts can send only to permitted verified recipients until production access is enabled.

Welcome emails after email signup, password reset emails, verification emails, invitations and invitation resends use the same SES API transport. Future messages should call `sendEmail` from `src/lib/email.service.ts`. No SMTP/Postmark fallback is used. Email verification remains optional, as before.

Welcome email failure is logged without invalidating an already-created account; there is no durable email retry queue yet. Other mail failures propagate to their callers. Tests mock SES and do not deliver messages.

## Database and validation

Apply migrations through the normal deployment process:

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
node --import tsx --test tests/bulk-room.test.ts tests/workspace.test.ts tests/onboarding-schema.test.ts tests/cloud-services.test.ts
```

The R2 logo-key migration is additive. The implementation has not applied migrations or changed cloud infrastructure. Live R2 uploads and SES deliveries require configuration and a subsequent live smoke test.

Service references: [Cloudflare R2 with AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) and [Amazon SES sending email](https://docs.aws.amazon.com/ses/latest/dg/send-email-api.html).

## Hotels and departments

Open Settings → Hotel locations to create a hotel and switch to it, or use the sidebar hotel selector. Owners can grant existing business users hotel-specific roles through Manage access. Settings → Departments supports creating, editing, staff assignment, disabling/reactivating and deleting unused departments in the selected hotel. See [the access model and deployment notes](prisma/DEPARTMENTS.md).

## Bulk room creation

The Create Room modal has Create room and Create bulk rooms tabs. Bulk creation accepts an inclusive numeric range, one room type, an optional shared floor and a shared status. Leading zeros are preserved; batches are limited to 500 rooms.

`POST /api/v1/rooms/bulk` requires rooms:create and uses the selected hotel from the authenticated session. The request includes startNumber/endNumber as strings, roomTypeId, optional floor and status. The room type must belong to that hotel. Any existing room number returns 409 with conflicts and cancels the entire batch. The transactional createMany also rejects concurrent unique-key conflicts. No schema migration is needed for this endpoint.

### Hotel subscription checkout

Set `BACHS_API_KEY` and `BACHS_WEBHOOK_SECRET` on the backend. Register
`https://<api-host>/api/v1/webhooks/bachs` in the Bachs Developer Portal for
`collection.succeeded`. Use the signing secret for that endpoint. Use the
matching sandbox or live endpoint and key, and enable the NGN and USD checkout
methods on the Bachs account. Set `FRONTEND_URL` to the app's public origin.

Apply Prisma migrations before starting the updated backend. Business owners and
hotel admins can buy an annual term from Settings → Subscription. A confirmed
checkout grants one year to the selected hotel. Renewal is manual.

Owner signups send verification email through the existing Amazon SES
configuration. An unverified owner can request another link from the sign-in
screen. Signup and resends share a limit of three verification emails per
one-hour window, with at least 60 seconds between sends. Staff verify their
address by accepting the emailed invitation.

After building the backend, run `npm run billing:reminders` daily from the
backend directory with the same database, frontend URL and SES configuration
as the API. It sends a renewal reminder during the last 30 days of a term
when a renewal has yet to be purchased.


Run `npm run billing:retention` daily from the same backend deployment, with one
scheduled instance. `npm run billing:retention -- --dry-run` counts candidates
without sending mail or deleting data. Hotels qualify after 180 days without
authenticated activity. Active trials, active or scheduled paid terms, and
unresolved Bachs checkouts are excluded. Deletion waits at least 30 days after
the owner warning is successfully sent. Opening that hotel
again resets its inactivity clock. Business accounts are removed with the last
hotel, while other hotels under the business retain their data and accounts.
The first hotel starts its 72-hour trial when the owner completes onboarding.
