/**
 * THE COUNTING SOCKET — SWITCH, made real in code (`docs/kyokai.md`).
 *
 * Core routes announce house facts here — `count('dial.set', { dial })` — and by
 * default nothing listens: that is the free build, permanently. At boot the assembler
 * (`src/index.ts`) wires the counting service's sink in; with no counting service there
 * is nobody to wire, `setCountSink` is never called, and every `count()` is a no-op.
 * A handler therefore names no counting function anywhere in the core — `check-kyokai`
 * holds it to that.
 *
 * The boundary keeps SOROBAN's one hardening promise (`docs/soroban.md`): counting
 * never breaks a request. `count()` swallows everything; the sink wraps each event in
 * `probe()` on its own side, so a broken counter is a recorded fault with a site name,
 * never a 500 — the socket stays a dumb wire and owns no opinion.
 */
export type CountFields = Record<string, string | number | null | undefined>;
export type CountSink = (event: string, fields: CountFields) => void;

let sink: CountSink | null = null;

/** Announce a fact. Free build: no-op. Never throws, whatever the sink does. */
export function count(event: string, fields: CountFields = {}): void {
  if (!sink) return;
  try {
    sink(event, fields);
  } catch {
    /* the sink's own probe() records faults; a broken sink must cost the route nothing */
  }
}

/** @service — the counting service's sink, wired once by the assembler.
 * Boot wiring, called once by the assembler when the counting service is present. */
export function setCountSink(fn: CountSink): void {
  sink = fn;
}
