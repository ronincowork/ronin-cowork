export const PRIMARY_DEVICE_ATTRIBUTES = '\x1b[?1;2c';
export const SECONDARY_DEVICE_ATTRIBUTES = '\x1b[>0;276;0c';

/**
 * tmux asks its attached terminal for DA1/DA2 and accepts the answers for only five
 * seconds. Detect those exact output-side queries as they stream from tmux and answer
 * on the local PTY immediately, before browser scheduling can delay the response.
 * The output itself is left byte-identical for xterm to parse and display.
 */
export class DeviceAttributesResponder {
  private state = 0;

  constructor(private readonly reply: (data: string) => void) {}

  feed(data: string): void {
    for (const byte of data) {
      if (this.state === 0) {
        this.state = byte === '\x1b' ? 1 : 0;
      } else if (this.state === 1) {
        this.state = byte === '[' ? 2 : byte === '\x1b' ? 1 : 0;
      } else if (this.state === 2) {
        if (byte === 'c') {
          this.reply(PRIMARY_DEVICE_ATTRIBUTES);
          this.state = 0;
        } else {
          this.state = byte === '>' ? 3 : byte === '\x1b' ? 1 : 0;
        }
      } else {
        if (byte === 'c') this.reply(SECONDARY_DEVICE_ATTRIBUTES);
        this.state = byte === '\x1b' ? 1 : 0;
      }
    }
  }
}
