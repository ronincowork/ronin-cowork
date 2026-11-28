/* part of the ronin-cowork client — see js/README.md */
/**
 * A HOSTED OFFICE (owner, 13 Nov 2026; KAN-475): Cowork running inside an office_unit on an
 * office_park. The server reads the office record once at start (src/office-record.ts) and the
 * page says so in <html data-hosted>. A hosted office shows no account, billing, lease
 * or machine settings: they live in the Business Lounge at Ronin HQ, which Home
 * links to where Settings sits. Self-hosted Cowork is unchanged. A link, never account code.
 */
export const HOSTED = document.documentElement.dataset.hosted === 'on';
export const BUSINESS_LOUNGE = 'https://hq.roninhosted.com/';
/** Sign out (KAN-983; the contract is hosted_lounge_build's, w1154): the office's own OAuth2 Proxy clears its
 *  cookie and lands on HQ's sign-in page with signed_out=1. A plain link; Cowork writes no sign-out code. */
export const SIGN_OUT = '/oauth2/sign_out?rd=https%3A%2F%2Fhq.roninhosted.com%2F%3Fsigned_out%3D1';
