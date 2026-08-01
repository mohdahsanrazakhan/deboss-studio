# Gallery submission setup (for the site owner)

This lets visitors request that one of their own saved "Sets" gets added to the public gallery. It needs two free third-party accounts, both created and controlled by you (not the developer). This app has no backend, so everything runs directly from the visitor's browser to these two services.

Until every value below is filled in, the feature stays safely switched off: the "Request to post" button and the navbar "Create" button simply don't appear.

## 1. EmailJS (sends the verification code and the final submission email to you)

1. Create a free account at EmailJS.
2. Add one **Email Service** (connect your own inbox, e.g. Gmail). Note its **Service ID**.
3. Find your **Public Key** under Account → API Keys.

You need **two Email Templates**. They go to different people, so pay close attention to each one's "To Email" setting.

### Template 1: OTP (verification code), sent to the visitor

- **To Email**: set this to `{{to_email}}` (dynamic, filled in per request from the browser), not your own address.
- Body must include `{{otp_code}}` somewhere. The code is valid for 15 minutes.
- Since the visitor never gets a second email from this feature, it's worth using this one email to also reassure them what happens next.
- Example body:

  ```
  Hello,

  Thank you for submitting your unique set for publication in our gallery.

  Use the code below to verify your email address:

  {{otp_code}}

  This code is valid for 15 minutes. Once verified, your submission will be reviewed, and if it qualifies, it'll be added to the gallery.

  If you didn't request this, simply ignore this email.

  Thank you,
  Text Deboss Studio
  ```

- Note its **Template ID**, this is `NEXT_PUBLIC_EMAILJS_OTP_TEMPLATE_ID`.

### Template 2: Notification, sent to you (the owner)

- **To Email**: set this to your own address directly (a fixed value, not a variable). This is never sent from the browser.
- Available variables: `{{display_name}}`, `{{from_email}}`, `{{description}}`, `{{set_name}}`, `{{state_json}}`, `{{thumbnail}}`, `{{source_kind}}`.
- `{{thumbnail}}` is a raw base64 image string, not a picture by itself. If you want it to actually render as an image in the email, use EmailJS's HTML/rich editor mode and place it as `<img src="{{thumbnail}}" />` rather than plain text; in Plain Content mode it just prints as a long garbled string.
- Example body:

  ```
  Hi,

  A new gallery submission has been received.

  Submission details
  Display Name: {{display_name}}
  Email: {{from_email}}
  Set Name: {{set_name}}
  Description: {{description}}
  Source Type: {{source_kind}}

  Thumbnail:
  {{thumbnail}}

  State data:
  {{state_json}}

  Please review it and, if it qualifies, add it to the gallery.
  ```

- Note its **Template ID**, this is `NEXT_PUBLIC_EMAILJS_NOTIFY_TEMPLATE_ID`.

You now have 4 values: public key, service ID, OTP template ID, notify template ID.

## 2. Google Sheets (logs every submission as a row)

1. Create a new Google Sheet. Add a header row: `Timestamp | Display Name | Email | Description | Set Name | State JSON | Thumbnail | Source`.
2. Open **Extensions → Apps Script** from the Sheet's menu, delete the placeholder code, and paste this:

   ```javascript
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     var data = JSON.parse(e.postData.contents);
     sheet.appendRow([
       data.timestamp,
       data.displayName,
       data.email,
       data.description,
       data.setName,
       data.stateJson,
       data.thumbnail,
       data.sourceKind,
     ]);
     return ContentService.createTextOutput("OK");
   }
   ```

3. Click **Deploy → New deployment**, choose type **Web app**. Set "Execute as" to yourself and "Who has access" to **Anyone**. Deploy, and authorize the requested permissions.

   You will see a **"Google hasn't verified this app"** warning during authorization. This is normal and expected for a personal script like this one; Google's verification review only applies to apps requesting access on behalf of OTHER people's accounts. Here, the "developer" shown is your own Google account, the script only touches your own Sheet, and nothing about your Gmail or account gets exposed to anyone else. Click **Advanced → Go to (your project name) (unsafe)**, then **Allow**, to continue.

4. Copy the resulting **Web app URL** (ends in `/exec`).

## 3. Add the values to your environment

In your deployment's environment variables (or a local `.env.local` for testing), set:

```
NEXT_PUBLIC_EMAILJS_PUBLIC_KEY=...
NEXT_PUBLIC_EMAILJS_SERVICE_ID=...
NEXT_PUBLIC_EMAILJS_OTP_TEMPLATE_ID=...
NEXT_PUBLIC_EMAILJS_NOTIFY_TEMPLATE_ID=...
NEXT_PUBLIC_GALLERY_SHEET_WEBAPP_URL=...
```

Redeploy. Both entry points (a saved Set's "Request to post" icon, and the navbar's "Create" button) will now appear.

## Notes

- These are `NEXT_PUBLIC_*` values by necessity (no backend to hide them behind). That's expected and safe by EmailJS's own design (its public key is meant to be used client-side), and the Apps Script URL is a public endpoint you deploy yourself, not a secret credential.
- The verification code sent to visitors is "friction, not fortress": it confirms the visitor typed a real, reachable email address, not a cryptographic guarantee (see `docs/SECURITY.md`'s accepted risks). Every submission still lands in your inbox and spreadsheet for manual review before you ever add it to the real gallery; that review is the actual quality/spam backstop.
- EmailJS's free tier has a monthly send cap shared between verification codes and real submissions; watch your usage if this gets popular.
