async function catalogView(root) {
  const parts = await api.get('/parts');
  renderCatalog(root, parts);
}

function renderCatalog(root, parts) {
  root.innerHTML = `
    <h1>Parts Catalog</h1>
    <div class="panel">
      <input id="catalog-search" placeholder="Search by name or library…" style="width:100%" />
    </div>

    <div class="panel">
      <h2>Add a part</h2>
      <form id="new-part-form" class="row">
        <input name="name" placeholder="Name" required style="flex:2" />
        <select name="category" required>
          <option value="sensor">sensor</option>
          <option value="actuator">actuator</option>
          <option value="display">display</option>
          <option value="driver">driver</option>
          <option value="passive">passive</option>
          <option value="power">power</option>
        </select>
        <select name="interface" required>
          <option value="digital">digital</option>
          <option value="analog">analog</option>
          <option value="i2c">i2c</option>
          <option value="spi">spi</option>
          <option value="pwm">pwm</option>
          <option value="uart">uart</option>
        </select>
        <input name="library" placeholder="Python library (or leave blank)" style="flex:1" />
        <label class="small row" style="gap:4px"><input type="checkbox" name="requiresAdc" /> requires ADC</label>
        <button type="submit">Add part</button>
      </form>
    </div>

    <table>
      <thead>
        <tr><th>Name</th><th>Category</th><th>Interface</th><th>Library</th><th>Owned</th><th>In kit</th><th></th></tr>
      </thead>
      <tbody id="parts-tbody">
        ${parts.map(partRow).join('')}
      </tbody>
    </table>
  `;

  el('#catalog-search', root).addEventListener('input', async (e) => {
    const q = e.target.value.trim();
    const filtered = q ? await api.get(`/parts?q=${encodeURIComponent(q)}`) : await api.get('/parts');
    el('#parts-tbody', root).innerHTML = filtered.map(partRow).join('');
    bindDeleteButtons(root);
  });

  el('#new-part-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await api.post('/parts', {
        name: form.name.value.trim(),
        category: form.category.value,
        interface: form.interface.value,
        library: form.library.value.trim() || null,
        requiresAdc: form.requiresAdc.checked,
      });
      toast('Part added');
      const refreshed = await api.get('/parts');
      renderCatalog(root, refreshed);
    } catch (err) {
      toast(err.message, true);
    }
  });

  bindDeleteButtons(root);
}

function bindDeleteButtons(root) {
  elAll('[data-delete-part]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this part from the catalog?')) return;
      try {
        await api.del(`/parts/${btn.dataset.deletePart}`);
        btn.closest('tr').remove();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

function partRow(p) {
  return `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${escapeHtml(p.interface)}</td>
      <td class="muted">${p.library ? escapeHtml(p.library) : '<em>not set</em>'}</td>
      <td>${p.ownedQty}</td>
      <td class="muted small">${escapeHtml(p.inKit || '')}</td>
      <td><button class="secondary" data-delete-part="${p.id}">Remove</button></td>
    </tr>
  `;
}

window.catalogView = catalogView;
