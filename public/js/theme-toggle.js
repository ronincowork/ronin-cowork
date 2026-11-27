/* part of the ronin-cowork client — see js/README.md */
/** The website's light/dark switch (ronin-site theme.js): a pill whose kaki dot steps
 *  auto → light → dark. Auto follows this office's Machine Settings theme; the choice
 *  is kept on this device in 'tmuxgrid.theme' (theme.js). */
const CHOICES = ['auto', 'light', 'dark'];
const label = (value) => `Theme: ${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const storedChoice = () => {
  try {
    const t = localStorage.getItem('tmuxgrid.theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch (_) {
    return 'auto';
  }
};

export function createThemeToggle() {
  const toggle = document.createElement('button');
  toggle.className = 'theme-switch';
  toggle.type = 'button';
  toggle.innerHTML = '<span class="theme-switch__track" aria-hidden="true"><i></i></span>';

  const paint = (value) => {
    toggle.dataset.themeChoice = value;
    toggle.title = label(value);
    toggle.setAttribute('aria-label', toggle.title);
  };
  toggle.addEventListener('click', () => {
    const next = CHOICES[(CHOICES.indexOf(toggle.dataset.themeChoice) + 1) % CHOICES.length];
    paint(next);
    // Ronin Home is also imported by the server-side shell contract. Keep the
    // browser-only theme module behind the owner's click instead of requiring a
    // window merely to describe the Home route.
    void import('./theme.js').then(({ setTheme }) => setTheme(next));
  });
  // Another tab moved the choice: show it here too (theme.js repaints the page).
  window.addEventListener('storage', (e) => { if (e.key === 'tmuxgrid.theme') paint(storedChoice()); });
  paint(storedChoice());
  return toggle;
}
