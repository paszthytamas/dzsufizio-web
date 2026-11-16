export function rotateTeam(root) {
  const grid = root.querySelector('[data-rotate]');
  if (!grid || grid.children.length < 2) return;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const date = Object.fromEntries(formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const days = Math.floor(Date.UTC(+date.year, +date.month - 1, +date.day) / 86_400_000);
  const shift = days % grid.children.length;
  for (let i = 0; i < shift; i++) grid.append(grid.firstElementChild);
}
