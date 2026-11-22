# Jira bridge
- **seed:** Jira holds this Campaign's work items and Ronin keeps them in step: work them with `item`, never Jira itself.
- **when:** integration:jira
- **depth:** full
- **order:** 25

This Campaign's work items are paired with a Jira space. Ronin keeps both sides in step: what
Jira assigns arrives as an item, and what you do to an item goes back to Jira.

- Work items only with `item`. Don't call Jira's API, open Jira or look for its key: Ronin holds
  the pairing, and the owner sets it on the Jira panel.
- An item's id is its Jira key (`KAN-480`); every id it has had still finds it.
- A change made in Jira reaches you as a notice naming the item ("KAN-27: a comment from
  jira:x"). Read the item, and answer on the item.
- When Jira and an item disagree, say so on the item and to the person you work for; don't
  fix Jira by hand.
