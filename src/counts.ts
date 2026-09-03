export type CountFields = Record<string, string | number | null | undefined>;
export type CountSink = (event: string, fields: CountFields) => void;

let sink: CountSink | null = null;

export function count(event: string, fields: CountFields = {}): void {
  if (!sink) return;
  try {
    sink(event, fields);
  } catch {
  }
}

export function setCountSink(fn: CountSink): void {
  sink = fn;
}
