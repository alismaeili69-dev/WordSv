# WordSv privacy notice

WordSv works without an account. Everything you do is then stored only on your own device.

## If you sign in with Google

To back up your progress and use it on several devices, you can sign in with your Google account. WordSv then stores:

- your Google account name and email address, and a user ID
- your learning progress: the words you have added, their review schedule, your settings, words you created yourself, and a daily count of reviews

This data is stored in Google Firebase (Authentication and Cloud Firestore, EU location). It is used only to sync your progress between your devices. It is not shared, sold or used for advertising, and WordSv uses no analytics or tracking.

Only you can read or change your data. The database rules (`firestore.rules`) allow each signed-in user access to their own record only.

## Deleting your data

In the app: **Settings → Account & sync → Delete my account and data**. This removes your record from the cloud and deletes your WordSv sign-in account. Progress on the device itself is removed with **Settings → Backup → Reset everything**.

Questions: open an issue in this repository.
