# RAM HQ script

`Code.gs` and `Portal.gs` are the Apps Script attached to **PY28 RAM HQ**. `Code.gs` receives submissions from the admissions site (referral, interest form, application), gives each student a BRYC ID, and keeps MASTER up to date. `Portal.gs` runs the family portal: accounts, households, saved drafts, status, decision release, emails, and follow-up forms.

## What it does

1. The site sends a submission. The script saves it to the matching raw tab (REFERRALS_RAW, INQUIRIES_RAW, or APPLICATIONS_RAW) and answers right away, so families aren't kept waiting.
   The rest happens in a background job (`processPending`) that runs every 15 minutes. To run it right away, use **RAM HQ → Process new submissions now** in the sheet's menu bar.
2. It matches the student to an existing BRYC ID (same name plus the same student or guardian email or phone) or creates a new one in ID_REGISTRY. Same name and school without matching contact info is flagged as a possible duplicate instead.
3. It creates or updates the student's MASTER row. Applications outrank inquiries, and inquiries outrank referrals, when answers differ. The first recruitment source is always kept.
4. It sets Current RAM Status and Next Action. A Next Action typed by staff is never overwritten.
5. When someone changes Decision, Onboarding, or Income Verification in MASTER, it recalculates status and fills in Decision Date.

Uploaded documents go to a private Drive folder. The sheet stores a link.

The public forms can only add submissions. The portal returns data only to a signed-in family, and only for their own household: every request carries a Firebase sign-in token that the script checks with Google before doing anything.

## Install or update (about 15 minutes)

1. **Upload folder.** In BRYC's Google Drive, create a folder such as `PY28 Application Uploads`. Share it only with admissions staff. Open it and copy the ID from the address bar (the part after `/folders/`).
2. **Paste the script.** Open PY28 RAM HQ, go to **Extensions → Apps Script**, replace everything in `Code.gs` with this file's contents, and click **Save**.
3. **Set the folder.** In Apps Script, open **Project Settings** (gear icon). Under **Script Properties**, add `UPLOAD_FOLDER_ID` with the folder ID from step 1.
4. **Deploy.** Click **Deploy → New deployment**, choose **Web app**, and set:
   - Execute as: **Me (forrest@thebryc.org)**
   - Who has access: **Anyone**

   Click **Deploy**, approve the permissions, and copy the **Web app URL**.
5. **Connect the site.** Put that URL in `portal-config.js` as `submitUrl`. Until then, every form stays in preview mode.

If "Anyone" isn't offered in step 4, BRYC's Google Workspace admin has to allow web apps to accept outside users.

6. **Start the background job.** In the Apps Script editor, choose `setupTriggers` from the function menu next to **Run**, click **Run**, and approve the permissions. Without it, submissions save but never get a BRYC ID or reach MASTER.

**Changing how often it runs:** near a deadline you may want faster updates. In `Code.gs`, change `processEveryMinutes` (Google allows 1, 5, 10, 15, or 30), save, and run `setupTriggers` again.

**Updating later:** paste the new code, then go to **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.

If a submission can't be processed, its BRYC ID cell says **NEEDS REVIEW**. Fix the row, clear that cell, and the next run picks it up (or use **RAM HQ → Process new submissions now**).

The old `onFormSubmit` trigger can stay. It does nothing unless a Google Form is linked to one of the raw tabs.

## Family portal

Families create an account at `#account`, enter their household once, and start an application for each student. Drafts save as they type. After submitting, they see the status in their portal and get an email at each step.

**How a student moves through it**

| Stage | What sets it | Family sees | Email |
| --- | --- | --- | --- |
| Started | Family saves a draft | Application started | None |
| Submitted | Family submits | Application received | "We received {name}'s BRYC application" |
| Under review | You set Application Status to Under review | Under review | "{name}'s application is under review" |
| Decision | You check **Decision Released** in MASTER | The decision (LISTS → Family Sees) | "A decision is ready". It never states the decision; they read it in the portal. |
| Next steps | Decision is Admitted | Onboarding, transportation, and income verification (only if Income Verification Required = Yes) | "One more step: income verification" when it's required |

**Emails go out right away.** A decision, review, or income request email sends the moment you change Decision, Decision Released, Application Status, or Income Verification Required in MASTER. (This needs the edit trigger that `setupTriggers` installs; run it once after updating the script.) Every portal form sends a confirmation the moment it's submitted, and the interest form's thank-you sends on arrival. The 15-minute background job is now only a backup. If a family already finished onboarding before the decision email went out, that email is skipped.

Emails go to the account email, the household guardian email, and the guardian email on the application (no duplicates). They're sent from your account as **BRYC Admissions** with replies going to admissions@thebryc.org. Each one is logged in **EMAIL_LOG**; **Family Notified** in MASTER records the last one sent, so nothing is sent twice. Status emails go out with the 15-minute background job.

**Follow-up forms** are switched on in `Portal.gs` under `PORTAL.tasks`. Income verification is on. Onboarding and transportation are built but set to `open: false` until their questions are final; families see "Opens soon." To open one, change it to `open: true`, save, and deploy a new version. If a family declines admission in onboarding, MASTER's Decision becomes Declined automatically.

**Income verification is once per household.** Families see "Verify household income" when **Income Verification Required** is Yes in MASTER. One request email goes to the household, one submission covers every student who needs it (listed in the **Students** column on INCOME_RAW), and a review updates every sibling in MASTER. The fee is one per household: it sits on the row of the student whose form was submitted, and siblings show Fee Status "Household fee on PY28-...." Their parent/guardian contact is prefilled to confirm. They pick a document (IRS Form 1040 is preferred) and get upload instructions for that document. Families never see a fee. Documents stay in the private income folder; nothing is deleted.

To review, open INCOME_RAW and fill in the student's row:
- **Verified AGI**, then **Verification Result** = Verified. The script fills in Verified By, Verified Date, and **Participation Fee** (under $110,000: $0; $110,000–$160,000: $250; $160,001–$210,000: $350; $210,001 and up: $500). Type a different fee in Participation Fee first to override the scale. MASTER gets Income Verification Status = Verified, Participation Fee, and **Fee Status**. A $0 family gets a "verification is complete" email. A family with a fee gets no automatic email: Fee Status is "To confirm" and Next Action is "Confirm Participation Fee." After you talk with them, change Fee Status (for example Confirmed, Paid, or Waived) and the Next Action clears.
- **Verification Result** = Needs follow-up, plus a **Note to Family**. The family gets your note by email, and the form reopens in their portal. Their new upload is saved as a new row.
**Family Notified** on INCOME_RAW records what was sent, so nothing is sent twice. These run the moment you edit (the same trigger as MASTER) and again with the 15-minute job.

**Transportation opens after onboarding.** It starts from the onboarding answers (student, grade, school, parent/guardian contact), so families confirm those and then say whether their student will ride. Riders read the rules and the Authorization to Transport (dated for their program year, e.g. August 1, 2027 – July 31, 2028), agree, and sign. The **Transportation Route** column on the SCHOOLS tab (Yes/No) controls which schools show "BRYC runs a route from your school." Every school can request transportation; one without a route is logged as a request. TRANSPORTATION_RAW gets the answers plus **School Has Route** and **Authorization Period**, and MASTER's **Transportation** column shows "Riding from …", "Requested route from …", or "Not riding."

**Onboarding is six short steps** (Accept, Student, Home and school, Family, Health, Sign), like the application. School district and parish come from the **SCHOOLS** tab in RAM HQ (School, School District, School Parish). Add or fix a school there and the form uses it on the next load, no code change. A school that isn't on the tab asks the family for its district and parish.

**Onboarding starts from what we already know.** When the form opens, it fills in the student, address, school, parents/guardians, language, and income range from the household and the application. Each of those sections shows as a short summary with an Edit button, so families only read and confirm it. A section opens on its own if a required answer is missing. New questions (birthday, T-shirt size, health, permissions, signature) are the only ones left blank. ONBOARDING_RAW gets every answer, plus **Changed From Application**, which lists the columns the family corrected or filled in so staff know what to update in MASTER. Missing ONBOARDING_RAW columns are added automatically the first time a family submits.

**Open program years** are listed in both `PORTAL.openProgramYears` (Portal.gs) and `openProgramYears` (portal-config.js). Keep them the same.

### Portal setup (one time)

1. **Firebase sign-in.** In the [Firebase console](https://console.firebase.google.com/) for `bryc-recruitment`, go to **Authentication → Sign-in method**, add **Email/Password**, and turn it on (leave "Email link" off). Then go to **Authentication → Settings → Authorized domains** and make sure `thebryc.github.io` is listed.
2. **Email sender name (optional).** In **Authentication → Templates**, edit the email verification and password reset templates. Set the sender name to BRYC Admissions and the reply-to to admissions@thebryc.org.
3. **Add Portal.gs.** In Apps Script, click **+ → Script**, name it `Portal`, paste in `Portal.gs`, and save. Replace `Code.gs` with the new version too.
4. **Income documents folder (recommended).** Create a Drive folder for income documents that only you and approved staff can open. Add its ID as the script property `INCOME_FOLDER_ID`. Without it, income documents go to the regular upload folder.
5. **List the script's permissions.** In Apps Script, open **Project Settings** (gear icon) and check **Show "appsscript.json" manifest file in editor**. Open `appsscript.json` and make sure it has this `oauthScopes` list (keep the other settings as they are):

   ```json
   "oauthScopes": [
     "https://www.googleapis.com/auth/spreadsheets",
     "https://www.googleapis.com/auth/drive",
     "https://www.googleapis.com/auth/script.external_request",
     "https://www.googleapis.com/auth/script.send_mail",
     "https://www.googleapis.com/auth/script.scriptapp",
     "https://www.googleapis.com/auth/script.container.ui"
   ],
   ```

   Then run any function from the editor and approve every permission Google lists. Without `script.external_request`, every portal request fails with "Something went wrong on our end," and the execution log says *You do not have permission to call UrlFetchApp.fetch*.
6. **Deploy a new version.** **Deploy → Manage deployments → pencil → Version: New version → Deploy.** Google will ask you to approve two new permissions: sending email as you, and connecting to an external service (that's the sign-in check). The URL stays the same.

## Get more info (interest form)

The interest form has its own page (`#inquire`) and needs no account. Students or parents can fill it out. Only the student's name, school, grade, and how they heard about BRYC are required, plus at least one phone number or email for the student or a parent or guardian. Guardian details are optional because younger students often don't know them.

When an interest form is processed (within 15 minutes), the family gets a "Thanks for your interest in BRYC" email at the student and guardian emails they gave. It's logged in EMAIL_LOG.

**Information sheet:** in Apps Script, open **Project Settings → Script Properties** and add `INFO_SHEET_URL` with a link to the sheet. A Google Drive file shared as "Anyone with the link can view" works, and so does a page on thebryc.org. The email's button then opens the sheet. To change the sheet later, update the property; no code change or new deployment is needed. Without the property, the email points families to the application instead.

## Tests

`test/code.test.mjs` and `test/portal.test.mjs` run the scripts against an in-memory copy of RAM HQ's headers:

```
cd apps-script/test && node --test
```

`tests/e2e` runs the full family journey in a browser against the same in-memory sheets. See its README.
