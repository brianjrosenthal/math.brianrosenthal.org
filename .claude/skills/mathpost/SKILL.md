---
description: Make a printable math worksheet (PDF with answer key) and publish it as a post on math.brianrosenthal.org. Optionally say what skill it should practise.
argument-hint: "[skill, e.g. multiplying fractions practice]"
disable-model-invocation: true
---

Make and publish a worksheet post for math.brianrosenthal.org, now.

## What the user asked this worksheet to be about

> $ARGUMENTS

If the line above is empty, the user named no subject: choose one as the brief describes.

If it has text, that is the skill to practise. Copy the user's text word for word into `requested`.

The person who typed this command is asking you to publish to the public site. That is the authorisation; do not ask for confirmation before publishing. The care goes into the problems and into checking the answers, not into a final "are you sure".

All commands run from the repository root.

## 1. Get the briefing

```
node scripts/mathpost.mjs brief
```

It updates the repository, then prints your brief: what the site is for, how to choose and build a worksheet, how to check it, the earlier posts (so this one differs from them), and the two file formats. Read all of it and follow it.

## 2. Write the worksheet and the write-up

Write `.run/worksheet.html` and `.run/post.md` as the brief describes. Compute every answer in the key with code before going on, as the brief requires, and fix any that differ.

## 3. Make the PDF and look at it

```
node scripts/mathpost.mjs render
```

It writes `.run/worksheet.pdf`. Read that file and look at every page. If anything is cut off, crowded, wrongly numbered or not displaying correctly, fix `worksheet.html` and render again.

## 4. Publish

```
node scripts/mathpost.mjs publish --model <the model ID you are running as>
```

This checks the draft, saves the post and the PDF, builds the site locally, commits, pushes to GitHub, and waits for GitHub Actions to build and deploy the site.

- **If it prints "Problems:"**, nothing was published. Fix exactly those points and run the command again. Give up after three failed attempts and tell the user what is still wrong.
- **If it says the site did not build**, nothing was published. Read the error; if the cause is in your draft, fix it and run the command again.
- **If it says the post was pushed but not confirmed live**, the post is committed and pushed. Do not rewrite it or publish again. Report the link to the GitHub Actions run it printed.

## 5. Report

Tell the user, briefly: the title and level, what the worksheet covers and how many problems and pages it has, the link the publish command printed, and anything they should know (for example, the level you chose, or how you made it differ from an earlier worksheet).

## Limits

Change only the files in `.run/`. Do not edit published posts, the prompt or the code, and do not run git yourself: the publish command does all of that.
