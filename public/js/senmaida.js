/* Senmaida — the house horizon.
 *
 * Terraced paddies, cut from the nin mark's own geometry: mitred joins, square
 * caps, and a 2:1 chamfer on every diagonal. One contour in each cut is a
 * dead-flat bund running the full width.
 *
 * Two cuts, because ink spread over a wide page carries less weight than the
 * same ink in a column, and because a drawing scaled up stops matching the one
 * beside it. Each cut is drawn at its own natural size and cropped by
 * `preserveAspectRatio="xMidYMax slice"`, so a narrower host shows less field
 * rather than a squashed one. Never scale one cut to do the other's job.
 */

const CUTS = {
  /* A tile or workspace column, around 350 to 900 wide. */
  panel: {
    viewBox: '0 0 900 180',
    height: 180,
    body: '<g fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="miter" stroke-linecap="square">'
      + '<path d="M0 52H160L184 40H330L350 50H452L476 38H660L680 48H812L834 36H900" stroke-opacity=".1"/>'
      + '<path d="M0 78H70L102 62H228L248 72H360L386 59H580L604 71H772L798 58H900" stroke-opacity=".16"/>'
      + '<path d="M0 102H196L220 90H296L316 100H412L436 88H612L638 101H800L824 89H900" stroke-opacity=".23"/>'
      + '<path d="M0 124H900" stroke-opacity=".34"/>'
      + '<path d="M0 148H80L104 136H268L288 146H440L464 134H668L690 145H860L880 135H900" stroke-opacity=".28"/></g>'
      + '<path d="M0 168H128L144 160H396L414 169H700L720 159H900V180H0Z" fill="currentColor" fill-opacity=".11"/>'
      + '<path d="M0 168H128L144 160H396L414 169H700L720 159H900" fill="none" stroke="currentColor" stroke-width="1.25" stroke-opacity=".46" stroke-linejoin="miter" stroke-linecap="square"/>',
  },
  /* A full destination, around 1100 wide and up. Longer runs, deeper drops, and
     more ink, because the same weight spread this far reads as nothing. */
  page: {
    viewBox: '0 0 1800 290',
    height: 290,
    body: '<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter" stroke-linecap="square">'
      + '<path d="M0 74H240L296 46H560L604 68H840L900 38H1180L1232 62H1460L1516 34H1800" stroke-opacity=".22"/>'
      + '<path d="M0 118H120L184 86H430L478 110H690L750 80H1010L1064 104H1340L1400 76H1800" stroke-opacity=".3"/>'
      + '<path d="M0 158H360L412 130H570L618 152H830L888 124H1150L1204 148H1490L1548 120H1800" stroke-opacity=".4"/>'
      + '<path d="M0 196H1800" stroke-opacity=".52"/>'
      + '<path d="M0 232H180L236 206H520L572 228H860L916 200H1230L1284 224H1580L1636 198H1800" stroke-opacity=".44"/></g>'
      + '<path d="M0 262H280L332 240H800L856 264H1340L1396 238H1800V290H0Z" fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M0 262H280L332 240H800L856 264H1340L1396 238H1800" fill="none" stroke="currentColor" stroke-width="1.4" stroke-opacity=".6" stroke-linejoin="miter" stroke-linecap="square"/>',
  },
};

/* The nin mark itself, kept out of the drawing so a narrow host never shrinks
   it. Its host places it by percentage along the flat bund, at a fixed size. */
const HITO = '<g fill="currentColor">'
  + '<path d="M52.3 21.8c3.9-4.3 10.4-4.1 14.5-.5l3.8 3.4c2 1.8 2.1 4.4.5 6.7-5.4 7.8-8.7 15.8-12.1 23.7-6.1 14.4-15.7 24.7-29.4 32.7-3.7 2.2-7.4 1.4-8.8-1.6-1.2-2.6.4-5 3.7-7.4 11.2-8.1 19.1-17.7 24-29.2 3.8-9 6.8-17.1 5.1-22.4l-1.8-3c-.5-.8-.3-1.7.5-2.4z"/>'
  + '<path d="M54.2 50c2.8-2.5 6.3-2.1 9.3 1.2 9.9 11.1 19.8 20 32.2 27.2 3.7 2.1 4.6 5 2.2 7.4-1.8 1.8-5 2.5-9.2 1.8-13.2-2.4-24.7-12.4-36.3-25.8-3.7-4.2-2.9-8.6 1.8-11.8z"/></g>';

/** The horizon, as an <svg> pinned to the foot of a positioned host. */
export function createSenmaida(cut = 'panel', className = '') {
  const shape = CUTS[cut] || CUTS.panel;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('viewBox', shape.viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.cut = cut;
  svg.innerHTML = shape.body;
  return svg;
}

/** One figure on the ridge. Not for every host: a destination already carrying
    the mark elsewhere does not want a second one out in its field. */
export function createHito(className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '24 18 75 72');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = HITO;
  return svg;
}
