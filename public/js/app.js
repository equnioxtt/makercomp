const el = (sel, root = document) => root.querySelector(sel);
const elAll = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimer = null;
function toast(message, isError = false) {
  const node = el('#toast');
  node.textContent = message;
  node.classList.toggle('err', isError);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4000);
}

const app = el('#app');

const routes = {
  projects: () => window.projectsView(app),
  catalog: () => window.catalogView(app),
  'to-buy': () => window.toBuyView(app),
};

function currentRoute() {
  const hash = window.location.hash.replace(/^#\//, '');
  return hash || 'projects';
}

async function render() {
  const hash = currentRoute();
  const [base, param] = hash.split('/');

  elAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === base));

  app.innerHTML = '<p class="muted">Loading…</p>';
  try {
    if (base === 'project' && param) {
      await window.projectDetailView(app, param);
    } else if (routes[base]) {
      await routes[base]();
    } else {
      window.location.hash = '#/projects';
    }
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="notice err">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
