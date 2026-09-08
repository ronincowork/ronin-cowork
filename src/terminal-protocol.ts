export const PRIMARY_DEVICE_ATTRIBUTES = '\x1b[?1;2c';
export const SECONDARY_DEVICE_ATTRIBUTES = '\x1b[>0;276;0c';
const PRIMARY_QUERY = '\x1b[c';
const SECONDARY_QUERY = '\x1b[>c';
const ATTACH_QUERY_WINDOW_MS = 5_000;

/**
 * tmux asks its attached terminal for DA1/DA2 and accepts the answers for only five
 * seconds. Detect those exact output-side queries as they stream from tmux and answer
 * on the local PTY immediately, before browser scheduling can delay the response.
 * The output itself is left byte-identical for xterm to parse and display.
 */
export class DeviceAttributesResponder {
  private candidate = '';
  private primaryAnswered = false;
  private secondaryAnswered = false;
  private armed = true;
  private readonly deadline: number;

  constructor(
    private readonly reply: (data: string) => void,
    private readonly now: () => number = Date.now,
    windowMs = ATTACH_QUERY_WINDOW_MS,
  ) {
    this.deadline = now() + windowMs;
  }

  feed(data: string): void {
    if (!this.armed || this.now() >= this.deadline) {
      this.disarm();
      return;
    }
    for (const byte of data) {
      this.candidate += byte;
      if (this.candidate === PRIMARY_QUERY) this.answerPrimary();
      else if (this.candidate === SECONDARY_QUERY) this.answerSecondary();
      else if (!PRIMARY_QUERY.startsWith(this.candidate) && !SECONDARY_QUERY.startsWith(this.candidate)) {
        this.candidate = byte === '\x1b' ? '\x1b' : '';
      }
      if (!this.armed) return;
    }
  }

  private answerPrimary(): void {
    this.candidate = '';
    if (!this.primaryAnswered) {
      this.primaryAnswered = true;
      this.reply(PRIMARY_DEVICE_ATTRIBUTES);
    }
    this.finishIfComplete();
  }

  private answerSecondary(): void {
    this.candidate = '';
    if (!this.secondaryAnswered) {
      this.secondaryAnswered = true;
      this.reply(SECONDARY_DEVICE_ATTRIBUTES);
    }
    this.finishIfComplete();
  }

  private finishIfComplete(): void {
    if (this.primaryAnswered && this.secondaryAnswered) this.disarm();
  }

  private disarm(): void {
    this.armed = false;
    this.candidate = '';
  }
}
