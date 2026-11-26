/**
 * THE GATEWAY RELAY — in a hosted office a Codex launch on the Ronin Gateway model service goes
 * through Services' relay (`ronin_models`), so the office's house token stays in Ronin's process.
 * The part hands Core one function at load; Core calls it at process start, a restore included
 * (src/model-service-launch.ts). Self-hosted, nothing registers and no launch needs it.
 */
export type GatewayRelay = (argv: string[], person: string) => string[];
let relay: GatewayRelay | undefined;
export const setGatewayRelay = (wrap: GatewayRelay): void => { relay = wrap; };
export const gatewayRelay = (): GatewayRelay | undefined => relay;
