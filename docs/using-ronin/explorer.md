# Explorer

Explorer is your machine's file browser, inside Ronin. It opens at your home folder and lets you
view, move, rename, delete, upload, download and edit files. It reads and writes as you.

Explorer is there when Ronin finds Python 3 on the machine as it starts. Ronin does not ship
Python. Without it, Explorer does not appear and nothing else changes. Every Ronin Cloud office has
Python, so Cloud always has Explorer.

## Where it is

On Ronin Home, open the **Workspaces** door. Explorer is in tilespace 2, and its card is in the
Workspaces selector. Press or drag the card to open it in another tilespace.
Drop another card or stone on Explorer's tilespace to replace it. Files dragged in from your
desktop upload into the open folder instead.

## Explorer and Workspaces

Explorer does not add folders to a Workspace: a Workspace's page has its own folder list for that
([Workspaces](workspaces.md)). As a shortcut, you can drag a folder out of Explorer onto a
Workspace's page to add it.

Every address in Explorer is `/files/` followed by the folder's place under your home folder:
`/files/projects/site/` is `~/projects/site/`.

## Who can open it

Only you. Explorer is behind Ronin's own sign-in, and nothing outside Ronin can reach it.

It does no work in the background. It keeps no search index, never scans your home folder, and
makes no thumbnails. While it waits it costs about 60 MB of memory and no processing time.

Explorer wears Ronin's colours and follows Ronin's light or dark mode and your skin as you change them.

Explorer is [copyparty](https://github.com/9001/copyparty), restyled for Ronin with the parts Ronin
does not use hidden. How it is wired: [Files](../architecture/files.md).
