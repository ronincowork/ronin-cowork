# ronin-help
- **seed:** the longer document on a topic, or a Ronin word
- **when:**
- **depth:** seed
- **serves:**
- **order:** 90

Reach for this when a brief's short version is not enough: `ronin-help` lists the topics,
`ronin-help <topic>` prints the user doc the Help workbench shows for it,
`ronin-help <brief>` prints a brief by its file name (`ronin-help working-at-a-desk`), the
owner's copy over stock, and `ronin-help <word>` finds a Ronin word in the KOTOBA glossary.
People and Agents read the same pages.

## Usage

`ronin-help` lists Help's topics, the four must-reads first; `ronin-help <topic>` prints that user doc whole; `ronin-help <word>` prints the word's row or section in the KOTOBA glossary. Topics are Help's own list (`public/js/help-outline.js`), read from the install; no server. Exit 2 = more than one argument, 3 = no topic or word matches.
