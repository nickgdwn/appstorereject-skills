<!--
This file is managed by appstorereject-scan. The skill won't overwrite your
edits, but the canonical version lives in the skill repo. Delete this file
to get the latest version on your next scan.
-->

# .appstorereject/

This directory is managed by the [App Store Reject](https://appstorereject.com) scan skill (`appstorereject-scan`).

## Files

- `memory.md` — answers to the App Store Connect Notes Q&A. **Contains test reviewer credentials in plaintext.**
- `README.md` — this file.

## Safety

- This entire directory is `.gitignore`'d by default — `memory.md` is never committed.
- File permissions are `600` (owner read/write only).
- If your project lives in a cloud-synced directory (iCloud Drive, Dropbox, OneDrive), credentials in `memory.md` will sync to that cloud. Move the project out of synced storage if that's a concern.

## Editing

You can edit `memory.md` by hand. The skill preserves your edits (well-formed YAML in the frontmatter) on the next scan. The body section gets overwritten each scan — don't make manual edits there.

## Removing

Delete the directory entirely. The skill will re-create it on your next scan and re-prompt for the answers.
