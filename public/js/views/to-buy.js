async function toBuyView(root) {
  const { items } = await api.get('/to-buy');

  root.innerHTML = `
    <h1>To Buy</h1>
    ${items.length ? '' : '<p class="muted">Nothing on your buy list — parts marked "needs purchase" on a project will show up here.</p>'}
    <table>
      <thead>
        <tr><th>Part</th><th>Project</th><th>Price</th><th>Link</th></tr>
      </thead>
      <tbody>
        ${items.map(toBuyRow).join('')}
      </tbody>
    </table>
  `;
}

function toBuyRow(item) {
  const price = item.priced ? `$${Number(item.estPrice).toFixed(2)}` : '<span class="muted">not yet priced</span>';
  const link = item.sourceUrl
    ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">source</a>`
    : '<span class="muted">no link saved</span>';
  return `
    <tr>
      <td>${escapeHtml(item.partName)}</td>
      <td><a href="#/project/${item.projectId}">${escapeHtml(item.projectName)}</a></td>
      <td>${price}</td>
      <td>${link}</td>
    </tr>
  `;
}

window.toBuyView = toBuyView;
