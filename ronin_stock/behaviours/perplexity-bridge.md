# Perplexity bridge
- **seed:** Perplexity does web research with cited answers: `api call perplexity POST /chat/completions --json '{…}'`, Ronin holding its key.
- **when:** integration:perplexity
- **depth:** full
- **order:** 27

Use Perplexity for a question the web answers, when you need its sources.

- `--json '{"model": "sonar", "messages": [{"role": "user", "content": "<question>"}]}'`;
  `sonar-pro` for a harder question. The answer carries its citations. No key yet: the call says
  so; ask with `secret ask perplexity-api-key --for "Perplexity API key"`.
- Return the sources with the answer; say when an answer rests on one source.
- Each call costs the owner money: ask one good question rather than many small ones.
