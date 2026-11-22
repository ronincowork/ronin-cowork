# Behaviours

How an Agent works: guidance it follows. One Markdown file per behaviour; the file name
(no `.md`) is its id. Facts are in `../facts/`, tools in `../tools/`; the header and how the
brief is built are in [tools_readme.md](../tools/tools_readme.md#the-header).

A behaviour is a foundation. The person's custom-foundation, `~/ronin/custom/behaviours/<id>.md`,
replaces the stock one of that id whole, or adds one: the three places and the one rule are in
[stock_readme.md](../stock_readme.md#three-places-each-with-one-meaning).

A behaviour never lists its tools: a tool names the behaviours it serves (`serves:`), and the
brief lists it under each. A behaviour may name a tool in its guidance.
