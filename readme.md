# WorkReady SaaS v1.3

Static multi-file WorkReady application wired to the existing Supabase project.

## Deploy
Upload these files together to the root of `workready.frantech-solutions.com`:
- index.html
- styles.css
- app.js
- workready-logo.png

## Existing backend
Uses project `wxyuqqxhlbfzbtpomcco` and the current publishable key.

## Production items still requiring configuration
1. Add `https://workready.frantech-solutions.com/` to Supabase Auth Site URL and redirect allow list.
2. Configure custom SMTP for Supabase Auth email confirmations/password resets.
3. Connect transactional email delivery for WorkReady partner/contractor invitation emails.
4. Move full TIN collection/signature/PDF generation to a hardened tax-document workflow before collecting full SSN/EIN values.
5. Add carrier/payroll integrations only after the core partner onboarding loop is tested.

## v1.1 login fix
Successful authentication now opens the application immediately and displays explicit loading/retry errors if role/profile data cannot load.

## v1.2
Master Organizations, Location/Subaccounts, organization/location logo uploads, and branded organization headers are enabled.

## v1.2.1 hotfix
Requirement inserts now always send explicit boolean values for Additional Insured, Waiver of Subrogation, Primary & Noncontributory, and Corporate Locked, preventing null boolean constraint errors during contractor program creation.

## v1.3
Branded invitation queue, secure upload/online W-9 flow, and versioned electronic Independent Contractor Agreement signing are enabled.


## v1.5 favicon update
- Added WorkReady WR favicon in PNG and ICO formats.
- Added Apple touch icon.
- Added favicon and theme-color metadata to index.html.


## v1.6
- Replaced the temporary WR-circle favicon with a favicon cropped directly from the official WorkReady shield/check/WR logo.
- Added a dashboard-first experience for Platform Admin, Corporate Partner Admin, and Location/Subpartner Admin.
- Dashboard includes contractor totals, WorkReady/pending/action-required metrics, compliance overview, recent activity, and upcoming document expirations.
- Corporate partner dashboard rolls up child locations; location/subpartner dashboards remain scoped to their location via existing RLS.
- Updated portal styling to the light dashboard / navy sidebar direction approved in the design mockup.


## v1.7 — WorkReady Jobs
- Added Jobs to Platform Admin and Partner/Location dashboards.
- Added My Jobs to contractor accounts.
- Create one-time or recurring work orders with company/location, contractor, amount, dates, address, scope, and required completion checklist.
- Contractors can accept jobs, start work, check off required items, upload proof, communicate in a job thread, and submit completion.
- Partner/location admins can review completed jobs, approve them, or return them for revision.
- Approved jobs are marked Ready to Pay so a licensed payment-provider integration can be layered in without WorkReady holding funds.
- Dashboard now includes a Work Operations flow linking readiness to assigned work and payment approval.
- Favicon regenerated directly from the user's attached official WorkReady logo emblem.


## v1.8 — Native W-9 Request Workflow
- Partner/location admins can request a W-9 directly from any contractor roster row.
- Admins can pre-fill known legal business name, DBA, and mailing address information without collecting the contractor's SSN/EIN.
- WorkReady sends a branded W-9 request email through the existing transactional email queue.
- The email links the contractor back to an authenticated WorkReady W-9 request.
- Contractors can review pre-filled information, enter their own TIN, electronically certify/sign the W-9, or securely upload an existing signed W-9.
- Existing encrypted TIN handling remains in place; only the last four digits are displayed in normal records.
- W-9 requests automatically move from Requested to Completed when the online W-9 is submitted/verified or an existing W-9 is uploaded.
- Contractor roster now shows W-9 status: Not Requested, Requested, Uploaded, or Complete.
- Contractor dashboard surfaces outstanding W-9 requests as a priority action.


## v1.9 — Universal Platform Administration
- Adds a dedicated Platform Admin Center for universal administration across all WorkReady organizations and locations.
- Global account search and account-state filtering.
- Account profile editing, contact/address maintenance, and logo replacement.
- Account lifecycle controls: activate/restore, suspend, archive, and protected permanent deletion.
- Permanent deletion requires prior archive, exact-name confirmation, a reason, and a final confirmation.
- Partner user administration: invite, role changes, disable/restore access, remove membership, and revoke pending invitations.
- Account-level feature flags for staged rollout and enterprise packaging.
- Contractor relationship archive/restore controls.
- Privileged compliance/status overrides with documented reason and optional expiration.
- Override revocation.
- Dedicated admin audit log for privileged actions, preserved separately from normal activity history.
- Safe “admin scope” account management rather than customer identity impersonation.
- Adds backend RPCs and RLS for privileged admin operations.
- Fixes the organization-logo update ID typo found in the prior frontend.


## v2.0 — View As Client / Account Preview
- Platform Admin can click **View as Client** from the Admin Center, organization directory, location directory, or account-management screen.
- The application switches into the selected organization's or location's actual partner-facing navigation and dashboard scope.
- Corporate/master previews roll up the organization and its child locations exactly like a corporate admin view.
- Location previews stay scoped to that location.
- A persistent top banner clearly identifies the selected client and provides **Exit Client View**.
- Preview mode is intentionally read-only: forms and mutating actions are disabled while navigation remains available.
- Platform Admin remains authenticated as themselves; WorkReady does not impersonate a client user or write actions under a customer's identity.
- Exiting preview returns the platform admin to that account's Universal Admin management screen.


## v2.1 — Audited Support Action Mode
- Platform Admin can enter **Support Action Mode** for any organization or location.
- Entry requires a business/support reason before the session starts.
- WorkReady keeps the platform admin authenticated as themselves; it does not impersonate a client user.
- The app switches into the same client-facing partner experience, but unlike View as Client, changes are enabled.
- A persistent red/brown banner clearly identifies Support Action Mode and the client account being operated.
- Supported inserts, updates, and deletes on client-facing WorkReady tables are automatically written to the privileged admin audit trail while the session is active.
- Audit entries include the WorkReady platform admin actor, support session ID, target client account, table/entity, operation, timestamp, and the session reason.
- Support sessions have explicit start/end audit records.
- Active support mode is restored after a browser refresh using the still-active server-side support session.
- Sign out and Exit Support Mode close the server-side support session.
- Master/corporate support mode covers child locations in the same organizational hierarchy.
- Read-only **View as Client** remains available as the default troubleshooting option; Support Action Mode is the deliberate elevated option.


## v2.1.1 — Login Dashboard Hotfix
- Restores the `sidebarButton()` helper accidentally removed during the v2.1 Support Action Mode update.
- Fixes the post-login runtime error: `Can't find variable: sidebarButton`.
- No database migration is required for this hotfix.
