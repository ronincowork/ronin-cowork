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
  let frame = 0;
  let settle = 0;
  const measure = () => {
    const vv = window.visualViewport;
    const height = Math.round(vv?.height || window.innerHeight);
    // A zero arrives while a tab is being restored; keeping the last good height stops the
    // application collapsing to nothing and laying itself out again on the way back.
    if (height > 0) document.documentElement.style.setProperty('--app-h', `${height}px`);
  };
  /**
   * NEVER TRUST THE LAST EVENT. iOS animates the keyboard away and reports the viewport
   * as it goes, so the final `resize` can carry a height from part-way through the
   * animation — and then nothing fires again. Measured once, the app stays that bit too
   * short and leaves a strip of dead space along the bottom that only a reload clears.
   *
   * So: measure now for the common case, again on the next frame, and again once things
   * have stopped moving. Three cheap reads of a number beat one that might be a lie.
   */
  const remeasure = () => {
    measure();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
    clearTimeout(settle);
    settle = setTimeout(measure, 300);
  };
  measure();
  window.visualViewport?.addEventListener('resize', remeasure);
  window.visualViewport?.addEventListener('scroll', remeasure);
  window.addEventListener('resize', remeasure);
  window.addEventListener('orientationchange', remeasure);
  // Leaving a text box is the keyboard going away, and it is not always followed by a
  // final viewport event of its own.
  document.addEventListener('focusout', remeasure);
  return remeasure;
}
