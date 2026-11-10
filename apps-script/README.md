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

Emails go to the account email, the household guardian email, and the guardian email on the application (no duplicates). They're sent from your account as **BRYC Admissions** with replies going to admissions@thebryc.org. Each one is logged in **EMAIL_LOG**; **Family Notified** in MASTER records the last one sent, so nothing is sent twice. Status emails go out with the 15-minute background job.

**Follow-up forms** are switched on in `Portal.gs` under `PORTAL.tasks`. Income verification is on. Onboarding and transportation are built but set to `open: false` until their questions are final; families see "Opens soon." To open one, change it to `open: true`, save, and deploy a new version. If a family declines admission in onboarding, MASTER's Decision becomes Declined automatically.

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
