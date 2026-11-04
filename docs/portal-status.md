# BRYC admissions portal: status and plan

Last updated November 4, 2026.

## Live now
- **Public site** (thebryc.github.io/recruitment): home page, FAQs, the application, an interest form for the whole household, and a referral form. About BRYC links to thebryc.org/what-drives-us/ in a new tab. Shareable links: `#apply`, `#refer`, `#faq`.
- **Submissions go to PY28 RAM HQ** (Google Sheet) through the Apps Script web app in `apps-script/Code.gs`. Setup and update steps: `apps-script/README.md`.
  - The web app saves the raw row and answers right away, so families see the thank-you instantly.
  - A background job (`processPending`) runs every 15 minutes. It assigns BRYC IDs (ID_REGISTRY), matches students across forms, and updates MASTER. Staff can run it now from the sheet's **RAM HQ** menu.
  - Uploads (report cards, transcripts, ACT reports) go to the private Drive folder **PY28 Application Uploads**.
- **Access:** RAM HQ and the uploads folder are restricted. Only Forrest can change Application Status and Decision.
- **Cost:** $0. Firebase free plan (staff sign-in only), Apps Script and Drive through Google Workspace.

## Decisions
- Free tools only. No Firebase paid plan, no Google Forms.
- PY28 RAM HQ is the system of record. Raw tabs hold one column per site question; MASTER holds one row per student.
- Form ranks when answers differ: application (3) > inquiry (2) > referral (1). The first recruitment source is always kept.
- Staff-typed Next Actions are never overwritten by the script.
- Gender: Female, Male, Non-binary, Prefer not to say (optional on every form).

## Next
1. **Site theme.** Forrest is collecting example sites. Goal: easy for a first-time visitor to use.
2. **Staff access.** Add RAM staff to RAM HQ (Editors) and the uploads folder (Viewers).
3. **Family accounts and status** (later phase). Families sign in, see application status, and complete next steps. Must stay free, likely Firebase Auth on the free plan with RAM HQ as the source of statuses.
4. **Onboarding** (ONBOARDING_RAW) and **income verification** (INCOME_RAW). Redesign when built. For income verification, keep only the AGI result and delete the 1040 after review.

## Open questions
- School list: is "McKanstry Prepatory School" spelled correctly? Are "EBR Virtual K–12" and "East Baton Rouge Virtual Academy" the same school?
