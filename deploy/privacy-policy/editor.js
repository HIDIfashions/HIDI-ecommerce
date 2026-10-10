(() => {
  const api = '/api/hidi/privacy-policy/admin';
  const form = document.getElementById('policy-form');
  const controls = document.getElementById('controls');
  const status = document.getElementById('status');
  const approved = document.getElementById('approved');
  const publish = document.getElementById('publish');
  const fields = ['businessName', 'address', 'officerName', 'officerEmail', 'officerPhone', 'effectiveDate'];
  let state, dirty = false, busy = false;
  function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function updatePublish() { publish.disabled = busy || dirty || !approved.checked || !state || state.problems.length > 0; }
  function changed() { dirty = true; approved.checked = false; updatePublish(); message('Unsaved changes. Save the draft before previewing or publishing.'); }
  function sectionRow(section = { title: '', text: '' }) {
    const row = document.createElement('section'); row.className = 'section-row';
    const label = document.createElement('label'); label.textContent = 'Section heading';
    const title = document.createElement('input'); title.className = 'section-title'; title.maxLength = 150; title.required = true; title.value = section.title; label.append(title);
    const bodyLabel = document.createElement('label'); bodyLabel.textContent = 'Section text';
    const text = document.createElement('textarea'); text.className = 'section-text'; text.maxLength = 12000; text.rows = 7; text.required = true; text.value = section.text; bodyLabel.append(text);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove section'; remove.addEventListener('click', () => { row.remove(); changed(); });
    row.append(label, bodyLabel, remove); document.getElementById('sections').append(row);
  }
  function render(next) {
    state = next; dirty = false; approved.checked = false;
    for (const field of fields) form.elements[field].value = state.draft[field];
    document.getElementById('sections').replaceChildren(); state.draft.sections.forEach(sectionRow);
    document.getElementById('publication').textContent = state.published ? `Published version ${state.published.version} · Draft edits remain private until published` : 'Draft · Unpublished';
    const problems = document.getElementById('problems'); problems.replaceChildren();
    for (const problem of state.problems) { const li = document.createElement('li'); li.textContent = problem; problems.append(li); }
    const history = document.getElementById('history'); history.replaceChildren();
    if (!state.history.length) { const p = document.createElement('p'); p.textContent = 'No versions published.'; history.append(p); }
    for (const version of state.history) {
      const p = document.createElement('p'), link = document.createElement('a');
      link.href = `${api}/preview?version=${encodeURIComponent(version.id)}`; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = `Version ${version.version} · ${version.effectiveDate} · Published ${new Date(version.publishedAt).toLocaleString()}`; p.append(link); history.append(p);
    }
    controls.disabled = false; updatePublish();
  }
  async function call(body) {
    const response = await fetch(api, { credentials: 'same-origin', cache: 'no-store', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load privacy information');
    return result;
  }
  async function write(body, success) {
    if (busy) return;
    busy = true; controls.disabled = true; updatePublish(); message('Saving…');
    try { render(await call(body)); message(success); }
    catch (error) { message(error.message + (error.message.includes('another session') ? ' Your edits are still here; copy them before reloading.' : ''), true); }
    finally { busy = false; controls.disabled = false; updatePublish(); }
  }
  form.addEventListener('input', changed);
  approved.addEventListener('input', event => { event.stopPropagation(); updatePublish(); });
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!state || !form.reportValidity()) return;
    const draft = Object.fromEntries(fields.map(field => [field, form.elements[field].value]));
    draft.sections = [...document.querySelectorAll('.section-row')].map(row => ({ title: row.querySelector('.section-title').value, text: row.querySelector('.section-text').value }));
    write({ action: 'save', draft, etag: state.etag }, 'Draft saved privately. Review the remaining checks before publication.');
  });
  document.getElementById('add-section').addEventListener('click', () => { if (document.querySelectorAll('.section-row').length >= 20) return message('A policy can contain up to 20 sections.', true); sectionRow(); changed(); });
  document.getElementById('preview').addEventListener('click', () => { if (dirty) return message('Save your changes before previewing.', true); window.open(`${api}/preview`, '_blank', 'noopener'); });
  publish.addEventListener('click', () => { if (publish.disabled || !window.confirm('Publish the reviewed saved policy on the public HIDI website?')) return; write({ action: 'publish', approved: true, etag: state.etag }, 'Policy published. Both landing and shopping links now open the published policy.'); });
  call().then(next => { render(next); message('Owner verified. Your draft is ready to edit.'); }).catch(error => { message(error.message, true); const link = document.createElement('a'); link.href = '/admin/sign-in'; link.textContent = 'Staff sign in'; status.append(' · ', link); });
})();
