/* part of the ronin-cowork client — see js/README.md */

/** Read the optional compact label and continuation from the stored title. */
export function splitItemTitle(title) {
  const delimiter = title.indexOf(': ');
  if (delimiter < 0) return { shortTitle: title, longTitle: '' };
  const shortTitle = title.slice(0, delimiter).trim();
  const longTitle = title.slice(delimiter + 2).trim();
  return shortTitle && longTitle ? { shortTitle, longTitle } : { shortTitle: title, longTitle: '' };
}
