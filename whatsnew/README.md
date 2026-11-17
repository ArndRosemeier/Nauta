# What's new: one note per change

The game's version starts at 0.001 and goes up by 0.001 with every build that lands on `main` (Arnd 2026-11-17). The
"What's new" button in the game shows every version and what it brought. Nobody writes a number: the build counts
the commits on `main` (tools/version/version.ts), so threads merging side by side never collide.

**Every change that lands on `main` adds one note here**, in the same commit or pull request:

- One new file, `whatsnew/<package>-<what>.txt`, for example `whatsnew/N1.1-waves.txt` or `whatsnew/fix-look-drag.txt`.
  Never edit, rename or reuse another change's file; a later fix gets its own note.
- One to three short lines, each shown as a point, written for Arnd playing on the iPad: what he can now see, do or
  hear, and how to try it (`?probe`, a drag, a key). Plain sentences, no code names, no Markdown.
- A change he cannot notice still gets a line, saying so plainly ("Behind the scenes: tests run faster.").
- The note gets the version of the build that adds it. Write no number and no date in it.

Land a change as **one commit** on `main` (squash the pull request): every commit on `main` that changes the game is
one build and one version, so a pull request merged as five commits would take five numbers.

Pushes that change only `docs/`, `README.md` or `CLAUDE.md` are no build: they do not deploy and get no number.
A build without a note shows its commit's subject in the history instead, so a forgotten note is visible there.
