/* Explorer follows Ronin (KAN-146): copyparty includes this through --js-browser (src/files.ts). The frame
 * shares Ronin's origin, so it reads the page around it: light or dark from <html data-theme>, which
 * becomes copyparty's flat light (3) or flat dark (2) theme, and Ronin's colours, skins included, which
 * become --ronin-* for files.css. It follows every change to either without a reload. */
(function () {
  var host = parent.document.documentElement;
  var tokens = ['surface', 'inset', 'line', 'line-2', 'fg', 'fg-strong', 'muted', 'accent', 'accent-2', 'accent-deep'];
  function follow() {
    var css = parent.getComputedStyle(host);
    for (var i = 0; i < tokens.length; i++) document.documentElement.style.setProperty('--ronin-' + tokens[i], css.getPropertyValue('--' + tokens[i]));
    var wantLight = host.dataset.theme === 'light';
    if (light !== wantLight) settheme.go(wantLight ? 3 : 2);
  }
  follow();
  new MutationObserver(follow).observe(host, { attributes: true });
  new MutationObserver(follow).observe(parent.document.head, { childList: true, subtree: true, characterData: true });
})();
