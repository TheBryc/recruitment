# RAM HQ script

`Code.gs` is the Apps Script attached to **PY28 RAM HQ**. It receives submissions from the admissions site (referral, interest form, application), gives each student a BRYC ID, and keeps MASTER up to date.

## What it does

1. The site sends a submission. The script saves it to the matching raw tab (REFERRALS_RAW, INQUIRIES_RAW, or APPLICATIONS_RAW) and answers right away, so families aren't kept waiting.
   The rest happens in a background job (`processPending`) that runs every minute.
2. It matches the student to an existing BRYC ID (same name plus the same student or guardian email or phone) or creates a new one in ID_REGISTRY. Same name and school without matching contact info is flagged as a possible duplicate instead.
3. It creates or updates the student's MASTER row. Applications outrank inquiries, and inquiries outrank referrals, when answers differ. The first recruitment source is always kept.
4. It sets Current RAM Status and Next Action. A Next Action typed by staff is never overwritten.
5. When someone changes Decision, Onboarding, or Income Verification in MASTER, it recalculates status and fills in Decision Date.

Uploaded documents go to a private Drive folder. The sheet stores a link.

The web app can only add submissions. It has no way to read or return data from RAM HQ.

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

6. **Start the background job.** In the Apps Script editor, choose `setupTriggers` from the function menu next to **Run**, click **Run**, and approve the permissions. Do this once. Without it, submissions save but never get a BRYC ID or reach MASTER.

**Updating later:** paste the new code, then go to **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.

If a submission can't be processed, its BRYC ID cell says **NEEDS REVIEW**. Fix the row, clear that cell, and the job picks it up within a minute.

The old `onFormSubmit` trigger can stay. It does nothing unless a Google Form is linked to one of the raw tabs.

## Tests

`test/code.test.mjs` runs the script against an in-memory copy of RAM HQ's headers:

```
cd apps-script/test && node --test code.test.mjs
```
