# Share a file with an Agent

On a remote machine a browser terminal cannot carry a pasted image or document across, so
the tile takes the file itself. Three ways in, all on the Agent's [tile](tile.md):

| How | What to do |
|---|---|
| **Drag** | Drag a file onto the tile. The tile outlines while you hover; the file uploads when you let go. No click needed. |
| **Paste** | Paste while the clipboard holds an image or a file (a screenshot, a copied file). Pasting text is unchanged. |
| **📎** | Press the paperclip in the tile header to choose a file: Finder on a computer, the photo library on a phone. On a phone or tablet it is in the メ menu. |

## Where it goes

- The file is saved in the Agent's own session folder, under `drop/`
  (`~/.ronin/sessions/<session>/drop/`), its name cleaned and a timestamp in front.
- Any type, up to **25 MB**. The upload uses the same browser login as the rest of Ronin.
- It appears on the Agent's **Docs** list. Images, PDFs and other non-text files open there
  as themselves.

## What the Agent sees

The file's full path is typed into the Agent's input **without pressing Enter**. Write
your prompt around it ("look at this screenshot and …") and send it yourself. Anything you
had half typed stays, with the path added after it.

## A work item, the same way

Drag a work item onto a tile: a card on the Trello view, a stone on Work Items, or a board
or item under a Team on Who. Its reference, the id and the title in square brackets
(`[w6 "Work items surface: Status / Board toggle"]`), is typed into the Agent's input without Enter, after anything you
had typed, so you ask about it around it. Nothing is saved: it is a reference, not a file.
Dragging an item within its own surface still moves it as before; only a drop on a tile
types the reference.

If the Agent is showing a question or a menu, the path is not typed, so it cannot choose
an option by accident; the notice gives you the path to use once the question is answered.
