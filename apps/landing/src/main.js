// Point the buttons at the deployed app and dashboard (see .env.example).
const urls = {
  app: import.meta.env.VITE_APP_URL,
  dashboard: import.meta.env.VITE_DASHBOARD_URL,
};
for (const a of document.querySelectorAll('a[data-link]')) {
  const url = urls[a.dataset.link];
  if (url) a.href = url;
}

// The phone tour: one list beside one pane. Without JavaScript the list
// still reads and the pane shows the first screen.
const shot = document.getElementById('tour-shot');
const items = [...document.querySelectorAll('.tour__item')];
for (const item of items) {
  item.addEventListener('click', () => {
    for (const other of items) other.setAttribute('aria-pressed', String(other === item));
    shot.src = item.dataset.shot;
    shot.alt = item.dataset.alt;
  });
}
