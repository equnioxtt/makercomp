async function projectDetailView(root, projectId) {
  const [project, allParts, snippets] = await Promise.all([
    api.get(`/projects/${projectId}`),
    api.get('/parts'),
    api.get(`/snippets?projectId=${projectId}`),
  ]);

  renderProjectDetail(root, project, allParts, snippets);
}

function renderProjectDetail(root, project, allParts, snippets) {
  // Any catalog part can be assigned more than once (e.g. two identical
  // resistors on different pins), so the assign dropdown lists all parts,
  // not just ones not yet assigned to this project.
  const availableParts = allParts;

  root.innerHTML = `
    <a href="#/projects" class="muted small">&larr; All projects</a>
    <div class="row-between mt8">
      <h1 style="margin:0">${escapeHtml(project.name)}</h1>
      <button class="danger" id="delete-project">Delete project</button>
    </div>

    <div class="panel mt16">
      <div class="row">
        <label class="small muted">Board model
          <input id="board-model" value="${escapeHtml(project.boardModel || '')}" placeholder="e.g. Raspberry Pi 4" />
        </label>
        <label class="small muted">Status
          <select id="project-status">
            ${['planning', 'wiring', 'coded', 'deployed'].map((s) => `<option value="${s}" ${s === project.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <div id="warnings-panel">${renderWarnings(project.warnings)}</div>

    <div class="panel">
      <h2>Project Assistant</h2>
      <p class="small muted">Describe what you want to build — Gemini will suggest parts and pins from your catalog, and gaps it can't cover.</p>
      <textarea id="project-description" placeholder="e.g. A motion-activated light that beeps when it detects movement" style="width:100%">${escapeHtml(project.description || '')}</textarea>
      <div class="row mt8">
        <button id="suggest-parts-btn">Suggest parts &amp; pins</button>
      </div>
      <div id="suggest-parts-result" class="mt8"></div>
    </div>

    <div class="panel">
      <h2>Assigned parts</h2>
      ${project.parts.length ? renderPartsTable(project.parts) : '<p class="muted">No parts assigned yet.</p>'}

      <h3 class="mt16">Assign a part</h3>
      <form id="assign-part-form" class="row">
        <select name="partId" required style="flex:2">
          <option value="" disabled selected>Choose a part…</option>
          ${availableParts.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (owned ${p.ownedQty})</option>`).join('')}
        </select>
        <input name="gpioPin" placeholder="GPIO pin (e.g. GPIO17)" style="flex:1" />
        <select name="status">
          <option value="owned">owned</option>
          <option value="needs_purchase">needs purchase</option>
        </select>
        <button type="submit">Assign</button>
      </form>
      <input id="wiring-notes-new" placeholder="Wiring notes (optional)" style="width:100%; margin-top:8px" />
    </div>

    <div class="panel">
      <div class="row-between">
        <h2 style="margin:0">Compatibility review</h2>
        <button id="run-compat-review" class="secondary">Run Gemini review</button>
      </div>
      <div id="compat-review-results" class="mt8"></div>
    </div>

    <div class="panel">
      <div class="row-between">
        <h2 style="margin:0">Generated code</h2>
        <button id="generate-code-btn">Generate code</button>
      </div>
      <div id="generate-code-result" class="mt8"></div>
      <div id="snippets-list" class="mt16">${renderSnippets(snippets)}</div>
    </div>
  `;

  bindProjectDetailEvents(root, project);
}

function renderSuggestions(data) {
  const { approach, suggestions, gaps } = data;
  return `
    ${approach ? `<div class="notice info">${escapeHtml(approach)}</div>` : ''}
    ${suggestions.length ? `
      <div class="grid-list mt8">
        ${suggestions.map((s, i) => `
          <div class="card" style="cursor:default">
            <div class="row-between">
              <div>
                <div class="card-title">${escapeHtml(s.partName)} ${s.gpioPin ? `<span class="badge">${escapeHtml(s.gpioPin)}</span>` : ''}</div>
                <div class="card-sub">${escapeHtml(s.reason)}${s.ownedQty <= 0 ? ' · <span style="color:var(--warn)">not owned — will be marked needs purchase</span>' : ''}</div>
              </div>
              <button class="secondary" data-add-suggestion="${i}">Add</button>
            </div>
          </div>
        `).join('')}
      </div>
      <button class="secondary mt8" id="add-all-suggestions">Add all</button>
    ` : ''}
    ${gaps.length ? gaps.map((g) => `<div class="notice warn mt8">Not covered by your catalog: ${escapeHtml(g)}</div>`).join('') : ''}
  `;
}

function renderWarnings(warnings) {
  if (!warnings || !warnings.length) return '';
  return warnings.map((w) => `<div class="notice warn">${escapeHtml(w.message)}</div>`).join('');
}

function renderPartsTable(parts) {
  return `
    <table>
      <thead>
        <tr><th>Part</th><th>Pin</th><th>Wiring notes</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        ${parts.map((pp) => `
          <tr data-pp-id="${pp.id}">
            <td>
              ${escapeHtml(pp.name)}
              ${pp.requiresAdc ? '<span class="badge small">needs ADC</span>' : ''}
              <div class="muted small">${pp.library ? escapeHtml(pp.library) : 'library not set'}</div>
            </td>
            <td><input class="pp-pin" data-pp-id="${pp.id}" value="${escapeHtml(pp.gpioPin || '')}" placeholder="—" style="width:100px" /></td>
            <td><input class="pp-notes" data-pp-id="${pp.id}" value="${escapeHtml(pp.wiringNotes || '')}" placeholder="—" style="width:100%" /></td>
            <td>
              <select class="pp-status" data-pp-id="${pp.id}">
                <option value="owned" ${pp.status === 'owned' ? 'selected' : ''}>owned</option>
                <option value="needs_purchase" ${pp.status === 'needs_purchase' ? 'selected' : ''}>needs purchase</option>
              </select>
            </td>
            <td><button class="secondary" data-remove-pp="${pp.id}">Remove</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderSnippets(snippets) {
  if (!snippets.length) return '<p class="muted">No code generated yet.</p>';
  return snippets.map((s) => `
    <div class="panel" data-snippet-id="${s.id}">
      <div class="row-between">
        <span class="badge ${s.verified ? 'owned' : 'needs_purchase'}">${s.verified ? 'verified on hardware' : 'unverified'}</span>
        <span class="muted small">${new Date(s.createdAt).toLocaleString()}</span>
      </div>
      <p class="small mt8">${escapeHtml(s.summary || '')}</p>
      <pre class="snippet">${escapeHtml(s.code)}</pre>
      ${!s.verified ? `<button class="mt8" data-verify-snippet="${s.id}">Mark verified — I ran this on real hardware</button>` : ''}
    </div>
  `).join('');
}

function bindProjectDetailEvents(root, project) {
  el('#delete-project', root).addEventListener('click', async () => {
    if (!confirm(`Delete "${project.name}" and all its assigned parts and generated code? This cannot be undone.`)) return;
    try {
      await api.del(`/projects/${project.id}`);
      window.location.hash = '#/projects';
    } catch (err) {
      toast(err.message, true);
    }
  });

  el('#board-model', root).addEventListener('change', async (e) => {
    try {
      await api.patch(`/projects/${project.id}`, { boardModel: e.target.value.trim() || null });
      toast('Saved');
    } catch (err) {
      toast(err.message, true);
    }
  });

  el('#project-status', root).addEventListener('change', async (e) => {
    try {
      await api.patch(`/projects/${project.id}`, { status: e.target.value });
      toast('Status updated');
    } catch (err) {
      toast(err.message, true);
    }
  });

  el('#assign-part-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const wiringNotes = el('#wiring-notes-new', root).value.trim();
    try {
      await api.post('/project-parts', {
        projectId: project.id,
        partId: form.partId.value,
        gpioPin: form.gpioPin.value.trim() || null,
        wiringNotes: wiringNotes || null,
        status: form.status.value,
      });
      toast('Part assigned');
      await projectDetailView(root, project.id);
    } catch (err) {
      // Duplicate-pin hard error (409) or other validation error — surface it, don't fail silently.
      toast(err.message, true);
    }
  });

  elAll('[data-remove-pp]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.del(`/project-parts/${btn.dataset.removePp}`);
        await projectDetailView(root, project.id);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  elAll('.pp-pin', root).forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await api.patch(`/project-parts/${input.dataset.ppId}`, { gpioPin: input.value.trim() || null });
        toast('Pin updated');
        await projectDetailView(root, project.id);
      } catch (err) {
        toast(err.message, true);
        await projectDetailView(root, project.id); // revert to server state
      }
    });
  });

  elAll('.pp-notes', root).forEach((input) => {
    input.addEventListener('change', async () => {
      try {
        await api.patch(`/project-parts/${input.dataset.ppId}`, { wiringNotes: input.value.trim() || null });
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  elAll('.pp-status', root).forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await api.patch(`/project-parts/${select.dataset.ppId}`, { status: select.value });
        toast('Status updated');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  el('#project-description', root).addEventListener('change', async (e) => {
    try {
      await api.patch(`/projects/${project.id}`, { description: e.target.value.trim() || null });
    } catch (err) {
      toast(err.message, true);
    }
  });

  let lastSuggestions = [];

  async function addSuggestion(s) {
    await api.post('/project-parts', {
      projectId: project.id,
      partId: s.partId,
      gpioPin: s.gpioPin || null,
      status: s.ownedQty > 0 ? 'owned' : 'needs_purchase',
    });
  }

  el('#suggest-parts-btn', root).addEventListener('click', async () => {
    const btn = el('#suggest-parts-btn', root);
    const out = el('#suggest-parts-result', root);
    const description = el('#project-description', root).value.trim();
    if (!description) {
      toast('Describe what you want to build first', true);
      return;
    }
    btn.disabled = true;
    out.innerHTML = '<p class="muted">Asking Gemini for a parts plan…</p>';
    try {
      const data = await api.post('/suggest-parts', { projectId: project.id, description });
      lastSuggestions = data.suggestions;
      out.innerHTML = renderSuggestions(data);

      elAll('[data-add-suggestion]', root).forEach((addBtn) => {
        addBtn.addEventListener('click', async () => {
          const s = lastSuggestions[Number(addBtn.dataset.addSuggestion)];
          addBtn.disabled = true;
          try {
            await addSuggestion(s);
            toast(`${s.partName} added`);
            await projectDetailView(root, project.id);
          } catch (err) {
            toast(err.message, true);
            addBtn.disabled = false;
          }
        });
      });

      const addAllBtn = el('#add-all-suggestions', root);
      if (addAllBtn) {
        addAllBtn.addEventListener('click', async () => {
          addAllBtn.disabled = true;
          let added = 0;
          let failed = 0;
          for (const s of lastSuggestions) {
            try {
              await addSuggestion(s);
              added += 1;
            } catch {
              failed += 1;
            }
          }
          toast(`${added} part${added === 1 ? '' : 's'} added${failed ? `, ${failed} failed (check for pin conflicts)` : ''}`, failed > 0 && added === 0);
          await projectDetailView(root, project.id);
        });
      }
    } catch (err) {
      out.innerHTML = `<div class="notice err">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });

  el('#run-compat-review', root).addEventListener('click', async () => {
    const btn = el('#run-compat-review', root);
    const out = el('#compat-review-results', root);
    btn.disabled = true;
    out.innerHTML = '<p class="muted">Asking Gemini to review the parts list…</p>';
    try {
      const { notes } = await api.post('/compat-review', { projectId: project.id });
      out.innerHTML = notes.length
        ? notes.map((n) => `<div class="notice ${n.severity === 'issue' ? 'err' : n.severity === 'caution' ? 'warn' : 'info'}">${escapeHtml(n.message)}</div>`).join('')
        : '<div class="notice ok">No additional issues found.</div>';
    } catch (err) {
      out.innerHTML = `<div class="notice err">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });

  el('#generate-code-btn', root).addEventListener('click', async () => {
    const btn = el('#generate-code-btn', root);
    const out = el('#generate-code-result', root);
    btn.disabled = true;
    out.innerHTML = '<p class="muted">Generating code with Gemini…</p>';
    try {
      const snippet = await api.post('/generate-code', { projectId: project.id });
      out.innerHTML = snippet.unresolved && snippet.unresolved.length
        ? `<div class="notice warn">Skipped (missing library or pin): ${escapeHtml(snippet.unresolved.join(', '))}</div>`
        : '';
      await projectDetailView(root, project.id);
    } catch (err) {
      out.innerHTML = `<div class="notice err">${escapeHtml(err.message)}</div>`;
      btn.disabled = false;
    }
  });

  elAll('[data-verify-snippet]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.patch(`/snippets/${btn.dataset.verifySnippet}`, { verified: true });
        toast('Marked verified');
        await projectDetailView(root, project.id);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

window.projectDetailView = projectDetailView;
