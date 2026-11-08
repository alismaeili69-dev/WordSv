# WordSv privacy notice

WordSv works without an account. Everything you do is then stored only on your own device.

## If you sign in with Google

To back up your progress and use it on several devices, you can sign in with your Google account. WordSv then stores:

- your Google account name and email address, and a user ID
- your learning progress: the words you have added, their review schedule, your settings, words you created yourself, and a daily count of reviews

This data is stored in Google Firebase (Authentication and Cloud Firestore, EU location). It is used only to sync your progress between your devices. It is not shared, sold or used for advertising, and WordSv uses no analytics or tracking.

Only you can read or change your data. The database rules (`firestore.rules`) allow each signed-in user access to their own record only.

## Moments and friends (optional)

If you pick a username in the Moments tab:

- your **username, avatar emoji** and simple stats (streak, number of words, reviews this week) are visible to other signed-in WordSv users who look you up or are your friends;
- friend requests and friendships store both usernames;
- a **moment** you share (word, translation, sentences, note, style) is visible only to the people who were your friends when you posted it, together with their reactions and who has seen it. Moments disappear after 24 hours and are deleted from the database the next time you open the app.

Your email address is never shown to other users.

## Deleting your data

In the app: **Settings → Account & sync → Delete my account and data**. This removes your progress, username, profile, friendships and moments from the cloud and deletes your WordSv sign-in account. Progress on the device itself is removed with **Settings → Backup → Reset everything**.

Questions: open an issue in this repository.
