/* part of the ronin-cowork client — see js/README.md */

/**
 * HOW TALL THE APPLICATION IS.
 *
 * `100dvh` is the LAYOUT viewport, and on iOS that is not what you can see.
 *
 *  - It does not shrink for the on-screen keyboard at all. The app stayed full height with
 *    its bottom behind the keys, so reaching the bottom of a work surface meant panning the
 *    whole page, and anything pinned to the bottom sat under the keyboard.
 *  - It drifts as Safari's address bar collapses and expands, so the same screen is
 *    sometimes a little too short and sometimes a little too long.
 *
 * `visualViewport` is the only thing that knows how much is actually visible — the composer
 * already learned this the hard way and measured it for itself. One custom property, set
 * from it here, is the height the whole application is measured against, so the browser's
 * visible area really does decide the size of the surfaces painted in it.
 *
 * On a desk the visual and layout viewports are the same, so this changes nothing there.
 * No surface check, no branch: one measurement everywhere, and the platform that needs it
 * is simply the one where the two numbers differ.
 */
export function trackAppHeight() {
  const set = () => {
    const vv = window.visualViewport;
    const height = Math.round(vv?.height || window.innerHeight);
    // A zero arrives while a tab is being restored; keeping the last good height stops the
    // application collapsing to nothing and laying itself out again on the way back.
    if (height > 0) document.documentElement.style.setProperty('--app-h', `${height}px`);
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.visualViewport?.addEventListener('scroll', set);
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
  return set;
}
