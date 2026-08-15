async function projectsView(root) {
  const projects = await api.get('/projects');

  root.innerHTML = `
    <h1>Projects</h1>

    <div class="panel">
      <h2>New project</h2>
      <form id="new-project-form" class="row">
        <input name="name" placeholder="Project name" required style="flex:2" />
        <input name="boardModel" placeholder="Board model (e.g. Pi 4)" style="flex:1" />
        <button type="submit">Create</button>
      </form>
    </div>

    <div class="grid-list" id="project-list">
      ${projects.length ? projects.map(projectCard).join('') : '<p class="muted">No projects yet — create one above.</p>'}
    </div>
  `;

  el('#new-project-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    if (!name) return;
    try {
      const project = await api.post('/projects', { name, boardModel: form.boardModel.value.trim() || null });
      window.location.hash = `#/project/${project.id}`;
    } catch (err) {
      toast(err.message, true);
    }
  });

  elAll('.card[data-project-id]', root).forEach((card) => {
    card.addEventListener('click', () => {
      window.location.hash = `#/project/${card.dataset.projectId}`;
    });
  });
}

function projectCard(p) {
  return `
    <div class="card" data-project-id="${p.id}">
      <div class="row-between">
        <div>
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-sub">${escapeHtml(p.boardModel || 'no board set')} · updated ${new Date(p.updatedAt).toLocaleDateString()}</div>
        </div>
        <span class="badge status-${p.status}">${p.status}</span>
      </div>
    </div>
  `;
}

window.projectsView = projectsView;
