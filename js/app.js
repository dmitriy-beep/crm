// ── SPA Router ──────────────────────────────────────────────────────────────
const app = document.getElementById('app');

function navigate(path, pushState = true) {
    if (pushState) history.pushState(null, '', path);
    route(path);
}

window.addEventListener('popstate', () => route(location.pathname + location.search));

document.addEventListener('click', e => {
    const a = e.target.closest('a[data-page], a[href^="/"]');
    if (a && a.href && a.href.startsWith(location.origin) && !a.hasAttribute('download')) {
        e.preventDefault();
        navigate(a.getAttribute('href'));
    }
});

// Highlight active nav
function setActiveNav(page) {
    document.querySelectorAll('.topbar nav a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '/' + page || (page === '' && a.getAttribute('href') === '/'));
    });
}

function route(path) {
    const url = new URL(path, location.origin);
    const p = url.pathname;
    const params = url.searchParams;

    if (p === '/' || p === '') { setActiveNav(''); renderDashboard(); }
    else if (p === '/buyers' && !params.has('id')) { setActiveNav('buyers'); renderBuyersList(params); }
    else if (p === '/buyers/new') { setActiveNav('buyers'); renderBuyerForm(); }
    else if (p.match(/^\/buyers\/(\d+)\/edit$/)) { setActiveNav('buyers'); renderBuyerForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/buyers\/(\d+)$/)) { setActiveNav('buyers'); renderBuyerDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/properties') { setActiveNav('properties'); renderPropertiesList(params); }
    else if (p === '/properties/new') { setActiveNav('properties'); renderPropertyForm(); }
    else if (p.match(/^\/properties\/(\d+)\/edit$/)) { setActiveNav('properties'); renderPropertyForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/properties\/(\d+)$/)) { setActiveNav('properties'); renderPropertyDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/contacts') { setActiveNav('contacts'); renderContactsList(params); }
    else if (p === '/contacts/new') { setActiveNav('contacts'); renderContactForm(); }
    else if (p.match(/^\/contacts\/(\d+)\/edit$/)) { setActiveNav('contacts'); renderContactForm(p.match(/(\d+)/)[1]); }
    else if (p.match(/^\/contacts\/(\d+)$/)) { setActiveNav('contacts'); renderContactDetail(p.match(/(\d+)/)[1]); }
    else if (p === '/activities') { setActiveNav('activities'); renderActivitiesList(params); }
    else if (p === '/activities/new') { setActiveNav('activities'); renderActivityForm(params); }
    else { app.innerHTML = '<div class="card">Page not found.</div>'; }
}

// ── Dashboard ───────────────────────────────────────────────────────────────
async function renderDashboard() {
    app.innerHTML = '<div class="loading">Loading dashboard…</div>';
    const todayStr = today();

    const [{ data: buyers }, { data: properties }, { data: contacts }, { data: activities }] = await Promise.all([
        db.from('buyers').select('*'),
        db.from('properties').select('*'),
        db.from('contacts').select('*'),
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20)
    ]);

    // Follow-ups
    const followups = [];
    (buyers || []).filter(b => b.next_followup && b.next_followup <= todayStr).forEach(b => {
        followups.push({ type: 'buyer', id: b.id, name: b.name, date: b.next_followup, overdue: b.next_followup < todayStr, url: `/buyers/${b.id}` });
    });
    (contacts || []).filter(c => c.next_followup && c.next_followup <= todayStr).forEach(c => {
        followups.push({ type: 'contact', id: c.id, name: c.name, date: c.next_followup, overdue: c.next_followup < todayStr, url: `/contacts/${c.id}` });
    });
    followups.sort((a, b) => a.date.localeCompare(b.date));

    // Counts
    const buyerCounts = {};
    (buyers || []).forEach(b => { buyerCounts[b.status] = (buyerCounts[b.status] || 0) + 1; });
    const propCounts = {};
    (properties || []).forEach(p => { propCounts[p.status] = (propCounts[p.status] || 0) + 1; });

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const weeklyCount = (activities || []).filter(a => a.created_at >= weekAgo).length;

    // Resolve contact names for activities
    const buyerMap = Object.fromEntries((buyers || []).map(b => [b.id, b.name]));
    const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c.name]));

    app.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="label">Follow-ups Due</div><div class="value" style="color:${followups.length > 0 ? 'var(--red)' : 'var(--green)'}">${followups.length}</div><div class="sub">today or overdue</div></div>
      <div class="stat"><div class="label">Active Buyers</div><div class="value">${(buyers || []).length}</div><div class="sub">${Object.entries(buyerCounts).map(([s,c]) => `${s.replace(/_/g,' ')}: ${c}`).join(', ')}</div></div>
      <div class="stat"><div class="label">Properties</div><div class="value">${(properties || []).length}</div><div class="sub">${Object.entries(propCounts).map(([s,c]) => `${s.replace(/_/g,' ')}: ${c}`).join(', ')}</div></div>
      <div class="stat"><div class="label">Activities This Week</div><div class="value">${weeklyCount}</div><div class="sub">logged</div></div>
    </div>

    ${followups.length ? `<div class="card"><h2>Follow-ups Due</h2><table>
      <tr><th>Type</th><th>Name</th><th>Due</th><th>Action</th></tr>
      ${followups.map(f => `<tr>
        <td>${badge(f.type, f.type === 'buyer' ? 'blue' : 'orange')}</td>
        <td><a href="${f.url}">${f.name}</a></td>
        <td>${f.date}${f.overdue ? ' ' + badge('overdue', 'red') : ''}</td>
        <td><a href="/activities/new?contact_type=${f.type}&contact_id=${f.id}" class="btn btn-sm">Log Activity</a></td>
      </tr>`).join('')}
    </table></div>` : ''}

    <div class="card"><h2>Recent Activity</h2><table>
      <tr><th>When</th><th>Type</th><th>Who</th><th>Description</th><th>Follow-up</th></tr>
      ${(activities || []).map(a => {
        let name = '';
        if (a.contact_type === 'buyer') name = buyerMap[a.contact_id] || '';
        else name = contactMap[a.contact_id] || '';
        return `<tr>
          <td class="text-muted text-sm">${(a.created_at || '').slice(0, 16)}</td>
          <td>${badge(a.contact_type, 'gray')} ${badge(a.activity_type, 'blue')}</td>
          <td>${name}</td>
          <td>${(a.description || '').slice(0, 80)}${(a.description || '').length > 80 ? '…' : ''}</td>
          <td>${a.followup_needed ? badge(a.followup_date || 'TBD', 'yellow') : ''}</td>
        </tr>`;
      }).join('')}
    </table></div>`;
}

// ── Buyers List ─────────────────────────────────────────────────────────────
async function renderBuyersList(params) {
    app.innerHTML = '<div class="loading">Loading buyers…</div>';
    let query = db.from('buyers').select('*').order('name');

    const { data: buyers, error } = await query;
    let filtered = buyers || [];

    const search = params?.get('search');
    const status = params?.get('status');
    const strategy = params?.get('strategy');
    const zip = params?.get('zip');

    if (search) filtered = filtered.filter(b => (b.name + ' ' + b.email).toLowerCase().includes(search.toLowerCase()));
    if (status) filtered = filtered.filter(b => b.status === status);
    if (strategy) filtered = filtered.filter(b => b.strategy === strategy);
    if (zip) filtered = filtered.filter(b => (b.zip_codes || '').includes(zip));

    // Sort by status priority
    const so = { verified_active: 0, engaged: 1, criteria_collected: 2, contacted: 3, new: 4, inactive: 5 };
    filtered.sort((a, b) => (so[a.status] || 5) - (so[b.status] || 5));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Buyers</h1>
      <div class="flex gap-2">
        <button class="btn btn-sm" onclick="exportBuyers()">Export CSV</button>
        <a href="/buyers/new" class="btn btn-sm btn-primary">+ Add Buyer</a>
      </div>
    </div>
    <div class="filters">
      <input type="text" id="f-search" placeholder="Search name/email…" value="${search || ''}">
      <select id="f-status"><option value="">All Status</option>${['new','contacted','criteria_collected','engaged','verified_active','inactive'].map(s => `<option value="${s}" ${status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <select id="f-strategy"><option value="">All Strategies</option>${['flip','brrrr','rental_hold','wholesale'].map(s => `<option value="${s}" ${strategy===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <input type="text" id="f-zip" placeholder="Zip" value="${zip || ''}" style="width:100px;">
      <button class="btn btn-sm" onclick="filterBuyers()">Filter</button>
      <a href="/buyers" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Name</th><th>Status</th><th>Strategy</th><th>Price Range</th><th>Zips</th><th>Condition</th><th>Funding</th><th>POF</th><th>Deals</th><th>Next F/U</th><th></th></tr>
      ${filtered.map(b => `<tr>
        <td><a href="/buyers/${b.id}"><strong>${b.name}</strong></a>${b.entity_name ? `<br><span class="text-muted text-sm">${b.entity_name}</span>` : ''}</td>
        <td>${badge(b.status, buyerStatusColor(b.status))}</td>
        <td>${(b.strategy || '').replace(/_/g,' ')}</td>
        <td class="money">${fmt(b.min_price)} – ${fmt(b.max_price)}</td>
        <td class="text-sm">${b.zip_codes || ''}</td>
        <td>${(b.condition_tolerance || '').replace(/_/g,' ')}</td>
        <td>${(b.funding_method || '').replace(/_/g,' ')}</td>
        <td>${b.proof_of_funds_verified ? badge('✓','green') : badge('–','gray')}</td>
        <td>${b.deals_last_12_months}</td>
        <td class="text-sm">${b.next_followup || ''}</td>
        <td style="white-space:nowrap;"><a href="/buyers/${b.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteBuyer(${b.id})">Del</button></td>
      </tr>`).join('')}
      ${filtered.length === 0 ? '<tr><td colspan="11" class="text-muted" style="text-align:center;padding:24px;">No buyers found.</td></tr>' : ''}
    </table></div>`;

    window._buyersData = buyers;
}

window.filterBuyers = () => {
    const params = new URLSearchParams();
    const s = document.getElementById('f-search').value; if (s) params.set('search', s);
    const st = document.getElementById('f-status').value; if (st) params.set('status', st);
    const str = document.getElementById('f-strategy').value; if (str) params.set('strategy', str);
    const z = document.getElementById('f-zip').value; if (z) params.set('zip', z);
    navigate('/buyers' + (params.toString() ? '?' + params.toString() : ''));
};

window.exportBuyers = async () => {
    const { data } = await db.from('buyers').select('*').order('name');
    if (data) exportCSV(data, 'buyers.csv');
};

// ── Buyer Form ──────────────────────────────────────────────────────────────
async function renderBuyerForm(id) {
    let buyer = null;
    if (id) {
        const { data } = await db.from('buyers').select('*').eq('id', id).single();
        buyer = data;
    }
    const v = (field) => buyer ? (buyer[field] ?? '') : '';
    const sel = (field, val) => buyer && buyer[field] === val ? 'selected' : '';
    const chk = (field) => buyer && buyer[field] ? 'checked' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id ? 'Edit' : 'Add New'} Buyer</h1>
    <form class="card" id="buyerForm">
      <div class="form-grid">
        <div class="form-group"><label>Name *</label><input type="text" name="name" value="${v('name')}" required></div>
        <div class="form-group"><label>Entity Name</label><input type="text" name="entity_name" value="${v('entity_name')}"></div>
        <div class="form-group"><label>Phone</label><input type="text" name="phone" value="${v('phone')}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${v('email')}"></div>
        <div class="form-group"><label>Source</label><select name="source">${['public_records','meetup','referral','online','other'].map(s=>`<option value="${s}" ${sel('source',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Preferred Contact</label><select name="preferred_contact">${['call','text','email'].map(s=>`<option value="${s}" ${sel('preferred_contact',s)}>${s}</option>`).join('')}</select></div>
        <div class="form-group full"><label>Target Zip Codes (comma-separated)</label><input type="text" name="zip_codes" value="${v('zip_codes')}" placeholder="95747,95678,95677"></div>
        <div class="form-group"><label>Min Price ($)</label><input type="number" name="min_price" value="${v('min_price')}"></div>
        <div class="form-group"><label>Max Price ($)</label><input type="number" name="max_price" value="${v('max_price')}"></div>
        <div class="form-group"><label>Property Types (comma-separated)</label><input type="text" name="property_types" value="${v('property_types')}" placeholder="sfr,multi,land,condo"></div>
        <div class="form-group"><label>Condition Tolerance</label><select name="condition_tolerance">${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${sel('condition_tolerance',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Strategy</label><select name="strategy">${['flip','brrrr','rental_hold','wholesale'].map(s=>`<option value="${s}" ${sel('strategy',s)}>${s === 'brrrr' ? 'BRRRR' : s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Funding Method</label><select name="funding_method">${['cash','hard_money','conventional','private_money'].map(s=>`<option value="${s}" ${sel('funding_method',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Deals (12mo)</label><input type="number" name="deals_last_12_months" value="${v('deals_last_12_months') || 0}"></div>
        <div class="form-group"><label>Status</label><select name="status">${['new','contacted','criteria_collected','engaged','verified_active','inactive'].map(s=>`<option value="${s}" ${sel('status',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Next Follow-up</label><input type="date" name="next_followup" value="${v('next_followup')}"></div>
        <div class="form-group"><label>Last Contacted</label><input type="date" name="last_contacted" value="${v('last_contacted')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="proof_of_funds_verified" ${chk('proof_of_funds_verified')}> Proof of Funds Verified</label></div>
        <div class="form-group full"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary" data-action="save">Save</button>
        <button type="button" class="btn" onclick="saveBuyer('save_add')">Save & Add Another</button>
        <a href="/buyers" class="btn">Cancel</a>
        ${id ? `<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteBuyer(${id})">Delete</button>` : ''}
      </div>
    </form>`;

    document.getElementById('buyerForm').addEventListener('submit', e => { e.preventDefault(); saveBuyer('save'); });
    window._editBuyerId = id || null;
}

window.saveBuyer = async (action) => {
    const form = document.getElementById('buyerForm');
    const fd = new FormData(form);
    const data = {
        name: fd.get('name'), entity_name: fd.get('entity_name') || null,
        phone: fd.get('phone') || null, email: fd.get('email') || null,
        source: fd.get('source'), zip_codes: fd.get('zip_codes') || null,
        min_price: fd.get('min_price') ? parseInt(fd.get('min_price')) : null,
        max_price: fd.get('max_price') ? parseInt(fd.get('max_price')) : null,
        property_types: fd.get('property_types') || null,
        condition_tolerance: fd.get('condition_tolerance'),
        strategy: fd.get('strategy'), funding_method: fd.get('funding_method'),
        proof_of_funds_verified: form.querySelector('[name=proof_of_funds_verified]').checked,
        deals_last_12_months: parseInt(fd.get('deals_last_12_months')) || 0,
        preferred_contact: fd.get('preferred_contact'),
        status: fd.get('status'), notes: fd.get('notes') || null,
        last_contacted: fd.get('last_contacted') || null,
        next_followup: fd.get('next_followup') || null,
    };

    const id = window._editBuyerId;
    let result;
    if (id) {
        result = await db.from('buyers').update(data).eq('id', id);
    } else {
        result = await db.from('buyers').insert(data);
    }

    if (result.error) { flash(result.error.message, 'error'); return; }
    flash(id ? 'Buyer updated' : 'Buyer added');
    if (action === 'save_add') navigate('/buyers/new');
    else navigate(id ? `/buyers/${id}` : '/buyers');
};

window.deleteBuyer = async (id) => {
    if (!confirm('Delete this buyer?')) return;
    await db.from('activity_log').delete().eq('contact_type', 'buyer').eq('contact_id', id);
    await db.from('buyers').delete().eq('id', id);
    flash('Buyer deleted');
    navigate('/buyers');
};

// ── Buyer Detail ────────────────────────────────────────────────────────────
async function renderBuyerDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: buyer }, { data: allProps }, { data: activities }] = await Promise.all([
        db.from('buyers').select('*').eq('id', id).single(),
        db.from('properties').select('*'),
        db.from('activity_log').select('*').eq('contact_type', 'buyer').eq('contact_id', id).order('created_at', { ascending: false })
    ]);

    if (!buyer) { flash('Buyer not found', 'error'); navigate('/buyers'); return; }
    const matches = getMatchingProperties(buyer, allProps || []);

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${buyer.name}</h1>${buyer.entity_name ? `<div class="text-muted">${buyer.entity_name}</div>` : ''}</div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=buyer&contact_id=${buyer.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/buyers/${buyer.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Phone</div><div class="value">${buyer.phone || '—'}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${buyer.email || '—'}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${badge(buyer.status, buyerStatusColor(buyer.status))}</div></div>
      <div class="field"><div class="label">Source</div><div class="value">${(buyer.source||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Strategy</div><div class="value">${buyer.strategy === 'brrrr' ? 'BRRRR' : (buyer.strategy||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Funding</div><div class="value">${(buyer.funding_method||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Price Range</div><div class="value money">${fmt(buyer.min_price)} – ${fmt(buyer.max_price)}</div></div>
      <div class="field"><div class="label">Target Zips</div><div class="value">${buyer.zip_codes || '—'}</div></div>
      <div class="field"><div class="label">Property Types</div><div class="value">${buyer.property_types || '—'}</div></div>
      <div class="field"><div class="label">Condition Tolerance</div><div class="value">${(buyer.condition_tolerance||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">POF Verified</div><div class="value">${buyer.proof_of_funds_verified ? '✓ Yes' : '✗ No'}</div></div>
      <div class="field"><div class="label">Deals (12mo)</div><div class="value">${buyer.deals_last_12_months}</div></div>
    </div>
    ${buyer.notes ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${buyer.notes}</div></div>` : ''}
    </div>

    <div class="section-title">Matching Properties (${matches.length})</div>
    ${matches.length ? `<div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Address</th><th>Price</th><th>MAO</th><th>Spread</th><th>DOM</th><th>Type</th><th>Condition</th><th>Status</th></tr>
      ${matches.map(p => {
        const spread = (p.mao || 0) - (p.list_price || 0);
        return `<tr>
          <td><a href="/properties/${p.id}"><strong>${p.address}</strong></a><br><span class="text-muted text-sm">${p.city} ${p.zip_code}</span></td>
          <td class="money">${fmt(p.list_price)}</td><td class="money">${fmt(p.mao)}</td>
          <td class="money ${spread >= 0 ? 'money-green' : 'money-red'}">${fmt(spread)}</td>
          <td>${p.dom || '—'}${p.dom > 60 ? ' 🔥' : ''}</td>
          <td>${(p.property_type||'').toUpperCase()}</td>
          <td>${(p.condition_estimate||'').replace(/_/g,' ')}</td>
          <td>${badge(p.status, propStatusColor(p.status))}</td>
        </tr>`;
      }).join('')}
    </table></div>` : '<div class="card text-muted">No matching properties found.</div>'}

    <div class="section-title">Activity Log</div>
    ${(activities||[]).length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${activities.map(a => `<tr>
        <td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td>
        <td>${badge(a.activity_type, 'blue')}</td>
        <td>${a.description||''}</td>
        <td>${a.followup_needed ? badge(a.followup_date||'TBD','yellow') : ''}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Properties List ─────────────────────────────────────────────────────────
async function renderPropertiesList(params) {
    app.innerHTML = '<div class="loading">Loading properties…</div>';
    const [{ data: properties }, { data: allBuyers }] = await Promise.all([
        db.from('properties').select('*').order('created_at', { ascending: false }),
        db.from('buyers').select('*')
    ]);

    let filtered = properties || [];
    const search = params?.get('search');
    const status = params?.get('status');
    const condition = params?.get('condition');
    const zip = params?.get('zip');
    const maxPrice = params?.get('max_price');
    const minDom = params?.get('min_dom');

    if (search) filtered = filtered.filter(p => (p.address||'').toLowerCase().includes(search.toLowerCase()));
    if (status) filtered = filtered.filter(p => p.status === status);
    if (condition) filtered = filtered.filter(p => p.condition_estimate === condition);
    if (zip) filtered = filtered.filter(p => p.zip_code === zip);
    if (maxPrice) filtered = filtered.filter(p => (p.list_price||0) <= parseInt(maxPrice));
    if (minDom) filtered = filtered.filter(p => (p.dom||0) >= parseInt(minDom));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Properties</h1>
      <div class="flex gap-2">
        <button class="btn btn-sm" onclick="exportProperties()">Export CSV</button>
        <a href="/properties/new" class="btn btn-sm btn-primary">+ Add Property</a>
      </div>
    </div>
    <div class="filters">
      <input type="text" id="fp-search" placeholder="Search address…" value="${search||''}">
      <select id="fp-status"><option value="">All Status</option>${['identified','analyzed','agent_contacted','offer_submitted','under_contract','closed','dead'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <select id="fp-condition"><option value="">All Condition</option>${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${condition===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <input type="text" id="fp-zip" placeholder="Zip" value="${zip||''}" style="width:80px;">
      <input type="number" id="fp-maxprice" placeholder="Max price" value="${maxPrice||''}" style="width:120px;">
      <input type="number" id="fp-mindom" placeholder="Min DOM" value="${minDom||''}" style="width:80px;">
      <button class="btn btn-sm" onclick="filterProps()">Filter</button>
      <a href="/properties" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Address</th><th>Price</th><th>MAO</th><th>Spread</th><th>DOM</th><th>Beds/Ba</th><th>Sqft</th><th>Type</th><th>Cond</th><th>ADU</th><th>Status</th><th>Matches</th><th></th></tr>
      ${filtered.map(p => {
        const spread = (p.mao||0) - (p.list_price||0);
        const matchCount = getMatchingBuyers(p, allBuyers||[]).length;
        return `<tr>
          <td><a href="/properties/${p.id}"><strong>${p.address}</strong></a><br><span class="text-muted text-sm">${p.city||''} ${p.zip_code||''}</span></td>
          <td class="money">${fmt(p.list_price)}</td><td class="money">${fmt(p.mao)}</td>
          <td class="money ${spread>=0?'money-green':'money-red'}">${fmt(spread)}</td>
          <td>${p.dom||'—'}${p.dom>60?' 🔥':''}</td>
          <td>${p.beds}/${p.baths}</td><td>${(p.sqft||0).toLocaleString()}</td>
          <td>${(p.property_type||'').toUpperCase()}</td>
          <td>${(p.condition_estimate||'').replace(/_/g,' ')}</td>
          <td>${p.adu_potential ? badge('ADU','green') : ''}</td>
          <td>${badge(p.status, propStatusColor(p.status))}</td>
          <td>${badge(matchCount, 'blue')}</td>
          <td style="white-space:nowrap;"><a href="/properties/${p.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteProperty(${p.id})">Del</button></td>
        </tr>`;
      }).join('')}
      ${filtered.length===0?'<tr><td colspan="13" class="text-muted" style="text-align:center;padding:24px;">No properties found.</td></tr>':''}
    </table></div>`;
}

window.filterProps = () => {
    const params = new URLSearchParams();
    const v = (id) => document.getElementById(id).value;
    if (v('fp-search')) params.set('search', v('fp-search'));
    if (v('fp-status')) params.set('status', v('fp-status'));
    if (v('fp-condition')) params.set('condition', v('fp-condition'));
    if (v('fp-zip')) params.set('zip', v('fp-zip'));
    if (v('fp-maxprice')) params.set('max_price', v('fp-maxprice'));
    if (v('fp-mindom')) params.set('min_dom', v('fp-mindom'));
    navigate('/properties' + (params.toString() ? '?' + params : ''));
};

window.exportProperties = async () => {
    const { data } = await db.from('properties').select('*');
    if (data) exportCSV(data, 'properties.csv');
};

// ── Property Form ───────────────────────────────────────────────────────────
async function renderPropertyForm(id) {
    let prop = null;
    if (id) {
        const { data } = await db.from('properties').select('*').eq('id', id).single();
        prop = data;
    }
    const v = (f) => prop ? (prop[f] ?? '') : '';
    const sel = (f, val) => prop && prop[f] === val ? 'selected' : '';
    const chk = (f) => prop && prop[f] ? 'checked' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id ? 'Edit' : 'Add New'} Property</h1>
    <form class="card" id="propForm">
      <div class="form-grid">
        <div class="form-group"><label>Address *</label><input type="text" name="address" value="${v('address')}" required></div>
        <div class="form-group"><label>City</label><input type="text" name="city" value="${v('city')}"></div>
        <div class="form-group"><label>Zip Code</label><input type="text" name="zip_code" value="${v('zip_code')}"></div>
        <div class="form-group"><label>Source</label><select name="source">${['mls','redfin','off_market','driving','referral'].map(s=>`<option value="${s}" ${sel('source',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>List Price ($)</label><input type="number" name="list_price" value="${v('list_price')}"></div>
        <div class="form-group"><label>Original List Price ($)</label><input type="number" name="original_list_price" value="${v('original_list_price')}"></div>
        <div class="form-group"><label>Days on Market</label><input type="number" name="dom" value="${v('dom')}"></div>
        <div class="form-group"><label>Price Reductions</label><input type="number" name="price_reductions" value="${v('price_reductions')||0}"></div>
        <div class="form-group"><label>Beds</label><input type="number" name="beds" value="${v('beds')}"></div>
        <div class="form-group"><label>Baths</label><input type="number" name="baths" value="${v('baths')}" step="0.5"></div>
        <div class="form-group"><label>Sqft</label><input type="number" name="sqft" value="${v('sqft')}"></div>
        <div class="form-group"><label>Lot Sqft</label><input type="number" name="lot_sqft" value="${v('lot_sqft')}" id="lot_sqft"></div>
        <div class="form-group"><label>Year Built</label><input type="number" name="year_built" value="${v('year_built')}"></div>
        <div class="form-group"><label>Property Type</label><select name="property_type" id="property_type">${['sfr','multi','land','condo'].map(s=>`<option value="${s}" ${sel('property_type',s)}>${s.toUpperCase()}</option>`).join('')}</select></div>
        <div class="form-group"><label>Condition</label><select name="condition_estimate">${['turnkey','cosmetic','medium_rehab','full_gut'].map(s=>`<option value="${s}" ${sel('condition_estimate',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Status</label><select name="status">${['identified','analyzed','agent_contacted','offer_submitted','under_contract','closed','dead'].map(s=>`<option value="${s}" ${sel('status',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
      </div>
      <div class="section-title" style="margin-top:16px;">Deal Analysis</div>
      <div class="form-grid">
        <div class="form-group"><label>ARV ($)</label><input type="number" name="arv" id="arv" value="${v('arv')}" oninput="calcMAO()"></div>
        <div class="form-group"><label>Rehab Low ($)</label><input type="number" name="rehab_estimate_low" value="${v('rehab_estimate_low')}"></div>
        <div class="form-group"><label>Rehab High ($)</label><input type="number" name="rehab_estimate_high" id="rehab_high" value="${v('rehab_estimate_high')}" oninput="calcMAO()"></div>
        <div class="form-group"><label>MAO (auto: ARV×0.70 − Rehab High)</label><input type="number" name="mao" id="mao" value="${v('mao')}" readonly style="background:var(--bg);font-weight:700;color:var(--green);"></div>
        <div class="form-group"><label>Est. Monthly Rent ($)</label><input type="number" name="estimated_monthly_rent" value="${v('estimated_monthly_rent')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="adu_potential" id="adu_chk" ${chk('adu_potential')}> ADU Potential</label></div>
        <div class="form-group full"><label>Comp Addresses</label><textarea name="comp_addresses">${v('comp_addresses')}</textarea></div>
      </div>
      <div class="section-title">Listing Agent</div>
      <div class="form-grid">
        <div class="form-group"><label>Agent Name</label><input type="text" name="listing_agent_name" value="${v('listing_agent_name')}"></div>
        <div class="form-group"><label>Agent Phone</label><input type="text" name="listing_agent_phone" value="${v('listing_agent_phone')}"></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="listing_agent_contacted" ${chk('listing_agent_contacted')}> Agent Contacted</label></div>
      </div>
      <div class="form-group" style="margin-top:12px;"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveProperty('save_add')">Save & Add Another</button>
        <a href="/properties" class="btn">Cancel</a>
        ${id ? `<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteProperty(${id})">Delete</button>` : ''}
      </div>
    </form>`;

    document.getElementById('propForm').addEventListener('submit', e => { e.preventDefault(); saveProperty('save'); });
    window._editPropId = id || null;

    // Wire up ADU auto-check
    document.getElementById('lot_sqft').addEventListener('input', autoADU);
    document.getElementById('property_type').addEventListener('change', autoADU);
    calcMAO();
}

window.calcMAO = () => {
    const arv = parseInt(document.getElementById('arv')?.value) || 0;
    const rehab = parseInt(document.getElementById('rehab_high')?.value) || 0;
    if (arv > 0) document.getElementById('mao').value = Math.round(arv * 0.70 - rehab);
};

function autoADU() {
    const lot = parseInt(document.getElementById('lot_sqft')?.value) || 0;
    const ptype = document.getElementById('property_type')?.value;
    document.getElementById('adu_chk').checked = (lot > 5000 && ptype === 'sfr');
}

window.saveProperty = async (action) => {
    const form = document.getElementById('propForm');
    const fd = new FormData(form);
    const int = (k) => fd.get(k) ? parseInt(fd.get(k)) : null;
    const float = (k) => fd.get(k) ? parseFloat(fd.get(k)) : null;
    const arv = int('arv');
    const rehab_high = int('rehab_estimate_high');
    const lot_sqft = int('lot_sqft');
    const ptype = fd.get('property_type');

    const data = {
        address: fd.get('address'), city: fd.get('city') || null, zip_code: fd.get('zip_code') || null,
        list_price: int('list_price'), original_list_price: int('original_list_price'),
        dom: int('dom'), price_reductions: int('price_reductions') || 0,
        beds: int('beds'), baths: float('baths'), sqft: int('sqft'), lot_sqft,
        year_built: int('year_built'), property_type: ptype,
        condition_estimate: fd.get('condition_estimate'),
        arv, rehab_estimate_low: int('rehab_estimate_low'), rehab_estimate_high: rehab_high,
        mao: (arv && rehab_high != null) ? Math.round(arv * 0.70 - rehab_high) : null,
        estimated_monthly_rent: int('estimated_monthly_rent'),
        adu_potential: form.querySelector('[name=adu_potential]').checked || (lot_sqft > 5000 && ptype === 'sfr'),
        comp_addresses: fd.get('comp_addresses') || null,
        listing_agent_name: fd.get('listing_agent_name') || null,
        listing_agent_phone: fd.get('listing_agent_phone') || null,
        listing_agent_contacted: form.querySelector('[name=listing_agent_contacted]').checked,
        source: fd.get('source'), status: fd.get('status'), notes: fd.get('notes') || null,
    };

    const id = window._editPropId;
    const result = id
        ? await db.from('properties').update(data).eq('id', id)
        : await db.from('properties').insert(data);

    if (result.error) { flash(result.error.message, 'error'); return; }
    flash(id ? 'Property updated' : 'Property added');
    if (action === 'save_add') navigate('/properties/new');
    else navigate(id ? `/properties/${id}` : '/properties');
};

window.deleteProperty = async (id) => {
    if (!confirm('Delete this property?')) return;
    await db.from('properties').delete().eq('id', id);
    flash('Property deleted');
    navigate('/properties');
};

// ── Property Detail ─────────────────────────────────────────────────────────
async function renderPropertyDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: prop }, { data: allBuyers }, { data: activities }] = await Promise.all([
        db.from('properties').select('*').eq('id', id).single(),
        db.from('buyers').select('*'),
        db.from('activity_log').select('*').order('created_at', { ascending: false })
    ]);

    if (!prop) { flash('Property not found', 'error'); navigate('/properties'); return; }
    const matches = getMatchingBuyers(prop, allBuyers || []);
    const propActivities = (activities||[]).filter(a =>
        (a.description||'').includes(prop.address) ||
        (a.contact_type === 'listing_agent' && prop.listing_agent_name)
    );
    const spread = (prop.mao||0) - (prop.list_price||0);

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${prop.address}</h1><div class="text-muted">${prop.city||''} ${prop.zip_code||''}</div></div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=listing_agent&property_id=${prop.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/properties/${prop.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">List Price</div><div class="value money">${fmt(prop.list_price)}</div>${prop.original_list_price && prop.original_list_price !== prop.list_price ? `<div class="sub">was ${fmt(prop.original_list_price)} (${prop.price_reductions} reduction${prop.price_reductions!==1?'s':''})</div>` : ''}</div>
      <div class="stat"><div class="label">MAO</div><div class="value money" style="color:var(--green)">${fmt(prop.mao)}</div><div class="sub">ARV ${fmt(prop.arv)} × 70% − ${fmt(prop.rehab_estimate_high)}</div></div>
      <div class="stat"><div class="label">Spread</div><div class="value money ${spread>=0?'money-green':'money-red'}">${fmt(spread)}</div><div class="sub">${spread>=0?'below MAO ✓':'above MAO'}</div></div>
      <div class="stat"><div class="label">DOM</div><div class="value">${prop.dom||'—'}</div><div class="sub">${prop.dom>90?'very motivated 🔥🔥':prop.dom>60?'likely motivated 🔥':prop.dom>30?'moderate':'fresh'}</div></div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Type</div><div class="value">${(prop.property_type||'').toUpperCase()}</div></div>
      <div class="field"><div class="label">Condition</div><div class="value">${(prop.condition_estimate||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Beds/Baths</div><div class="value">${prop.beds} bd / ${prop.baths} ba</div></div>
      <div class="field"><div class="label">Sqft</div><div class="value">${(prop.sqft||0).toLocaleString()}</div></div>
      <div class="field"><div class="label">Lot</div><div class="value">${(prop.lot_sqft||0).toLocaleString()} sqft${prop.adu_potential ? ' '+badge('ADU Potential','green') : ''}</div></div>
      <div class="field"><div class="label">Year Built</div><div class="value">${prop.year_built||'—'}</div></div>
      <div class="field"><div class="label">Rehab Range</div><div class="value money">${fmt(prop.rehab_estimate_low)} – ${fmt(prop.rehab_estimate_high)}</div></div>
      <div class="field"><div class="label">Est. Rent</div><div class="value money">${prop.estimated_monthly_rent ? fmt(prop.estimated_monthly_rent)+'/mo' : '—'}</div></div>
      <div class="field"><div class="label">Source</div><div class="value">${(prop.source||'').replace(/_/g,' ')}</div></div>
      <div class="field"><div class="label">Status</div><div class="value">${badge(prop.status, propStatusColor(prop.status))}</div></div>
    </div>
    ${prop.notes ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${prop.notes}</div></div>` : ''}
    </div>
    ${prop.listing_agent_name ? `<div class="card"><h2>Listing Agent</h2><div class="detail-grid">
      <div class="field"><div class="label">Name</div><div class="value">${prop.listing_agent_name}</div></div>
      <div class="field"><div class="label">Phone</div><div class="value">${prop.listing_agent_phone||'—'}</div></div>
      <div class="field"><div class="label">Contacted</div><div class="value">${prop.listing_agent_contacted?'✓ Yes':'✗ Not yet'}</div></div>
    </div></div>` : ''}

    <div class="section-title">Matching Buyers (${matches.length})</div>
    ${matches.length ? `<div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Name</th><th>Strategy</th><th>Funding</th><th>Price Range</th><th>Condition</th><th>POF</th><th>Deals</th><th>Status</th><th>Contact</th></tr>
      ${matches.map(b => `<tr>
        <td><a href="/buyers/${b.id}"><strong>${b.name}</strong></a>${b.entity_name?'<br><span class="text-muted text-sm">'+b.entity_name+'</span>':''}</td>
        <td>${b.strategy==='brrrr'?'BRRRR':(b.strategy||'').replace(/_/g,' ')}</td>
        <td>${(b.funding_method||'').replace(/_/g,' ')}</td>
        <td class="money">${fmt(b.min_price)}–${fmt(b.max_price)}</td>
        <td>${(b.condition_tolerance||'').replace(/_/g,' ')}</td>
        <td>${b.proof_of_funds_verified?badge('✓','green'):'–'}</td>
        <td>${b.deals_last_12_months}</td>
        <td>${badge(b.status, buyerStatusColor(b.status))}</td>
        <td>${(b.preferred_contact||'')+': '+(b.phone||b.email||'—')}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No matching buyers found.</div>'}

    <div class="section-title">Activity Log</div>
    ${propActivities.length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${propActivities.map(a => `<tr>
        <td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td>
        <td>${badge(a.activity_type,'blue')}</td>
        <td>${a.description||''}</td>
        <td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td>
      </tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Contacts List ───────────────────────────────────────────────────────────
async function renderContactsList(params) {
    app.innerHTML = '<div class="loading">Loading contacts…</div>';
    const { data: contacts } = await db.from('contacts').select('*').order('name');
    let filtered = contacts || [];
    const search = params?.get('search');
    const role = params?.get('role');
    if (search) filtered = filtered.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (role) filtered = filtered.filter(c => c.role === role);

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Contacts</h1>
      <div class="flex gap-2">
        <button class="btn btn-sm" onclick="exportContacts()">Export CSV</button>
        <a href="/contacts/new" class="btn btn-sm btn-primary">+ Add Contact</a>
      </div>
    </div>
    <div class="filters">
      <input type="text" id="fc-search" placeholder="Search name…" value="${search||''}">
      <select id="fc-role"><option value="">All Roles</option>${['listing_agent','contractor','attorney','property_manager','title_company','other'].map(s=>`<option value="${s}" ${role===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <button class="btn btn-sm" onclick="filterContacts()">Filter</button>
      <a href="/contacts" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>Name</th><th>Role</th><th>Company</th><th>Phone</th><th>Email</th><th>Next F/U</th><th></th></tr>
      ${filtered.map(c => `<tr>
        <td><a href="/contacts/${c.id}"><strong>${c.name}</strong></a></td>
        <td>${badge(c.role,'orange')}</td><td>${c.company||'—'}</td>
        <td>${c.phone||'—'}</td><td>${c.email||'—'}</td>
        <td>${c.next_followup||'—'}</td>
        <td style="white-space:nowrap;"><a href="/contacts/${c.id}/edit" class="btn btn-sm">Edit</a> <button class="btn btn-sm btn-danger" onclick="deleteContact(${c.id})">Del</button></td>
      </tr>`).join('')}
      ${filtered.length===0?'<tr><td colspan="7" class="text-muted" style="text-align:center;padding:24px;">No contacts.</td></tr>':''}
    </table></div>`;
}

window.filterContacts = () => {
    const params = new URLSearchParams();
    if (document.getElementById('fc-search').value) params.set('search', document.getElementById('fc-search').value);
    if (document.getElementById('fc-role').value) params.set('role', document.getElementById('fc-role').value);
    navigate('/contacts' + (params.toString() ? '?' + params : ''));
};
window.exportContacts = async () => {
    const { data } = await db.from('contacts').select('*');
    if (data) exportCSV(data, 'contacts.csv');
};

// ── Contact Form ────────────────────────────────────────────────────────────
async function renderContactForm(id) {
    let contact = null;
    if (id) { const { data } = await db.from('contacts').select('*').eq('id', id).single(); contact = data; }
    const v = (f) => contact ? (contact[f] ?? '') : '';
    const sel = (f, val) => contact && contact[f] === val ? 'selected' : '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">${id?'Edit':'Add New'} Contact</h1>
    <form class="card" id="contactForm">
      <div class="form-grid">
        <div class="form-group"><label>Name *</label><input type="text" name="name" value="${v('name')}" required></div>
        <div class="form-group"><label>Role</label><select name="role">${['listing_agent','contractor','attorney','property_manager','title_company','other'].map(s=>`<option value="${s}" ${sel('role',s)}>${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Phone</label><input type="text" name="phone" value="${v('phone')}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" value="${v('email')}"></div>
        <div class="form-group"><label>Company</label><input type="text" name="company" value="${v('company')}"></div>
        <div class="form-group"><label>Next Follow-up</label><input type="date" name="next_followup" value="${v('next_followup')}"></div>
        <div class="form-group"><label>Last Contacted</label><input type="date" name="last_contacted" value="${v('last_contacted')}"></div>
        <div class="form-group full"><label>Notes</label><textarea name="notes">${v('notes')}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveContact('save_add')">Save & Add Another</button>
        <a href="/contacts" class="btn">Cancel</a>
        ${id?`<button type="button" class="btn btn-danger" style="margin-left:auto;" onclick="deleteContact(${id})">Delete</button>`:''}
      </div>
    </form>`;
    document.getElementById('contactForm').addEventListener('submit', e => { e.preventDefault(); saveContact('save'); });
    window._editContactId = id || null;
}

window.saveContact = async (action) => {
    const fd = new FormData(document.getElementById('contactForm'));
    const data = { name: fd.get('name'), phone: fd.get('phone')||null, email: fd.get('email')||null, role: fd.get('role'), company: fd.get('company')||null, notes: fd.get('notes')||null, last_contacted: fd.get('last_contacted')||null, next_followup: fd.get('next_followup')||null };
    const id = window._editContactId;
    const result = id ? await db.from('contacts').update(data).eq('id', id) : await db.from('contacts').insert(data);
    if (result.error) { flash(result.error.message, 'error'); return; }
    flash(id ? 'Contact updated' : 'Contact added');
    if (action === 'save_add') navigate('/contacts/new');
    else navigate(id ? `/contacts/${id}` : '/contacts');
};

window.deleteContact = async (id) => {
    if (!confirm('Delete?')) return;
    await db.from('contacts').delete().eq('id', id);
    flash('Contact deleted'); navigate('/contacts');
};

// ── Contact Detail ──────────────────────────────────────────────────────────
async function renderContactDetail(id) {
    app.innerHTML = '<div class="loading">Loading…</div>';
    const [{ data: contact }, { data: activities }] = await Promise.all([
        db.from('contacts').select('*').eq('id', id).single(),
        db.from('activity_log').select('*').in('contact_type', ['listing_agent','other']).eq('contact_id', id).order('created_at', { ascending: false })
    ]);
    if (!contact) { flash('Contact not found','error'); navigate('/contacts'); return; }

    app.innerHTML = `
    <div class="detail-header">
      <div><h1>${contact.name}</h1><div class="text-muted">${badge(contact.role,'orange')} ${contact.company?'— '+contact.company:''}</div></div>
      <div class="flex gap-2">
        <a href="/activities/new?contact_type=listing_agent&contact_id=${contact.id}" class="btn btn-sm btn-primary">+ Log Activity</a>
        <a href="/contacts/${contact.id}/edit" class="btn btn-sm">Edit</a>
      </div>
    </div>
    <div class="card"><div class="detail-grid">
      <div class="field"><div class="label">Phone</div><div class="value">${contact.phone||'—'}</div></div>
      <div class="field"><div class="label">Email</div><div class="value">${contact.email||'—'}</div></div>
      <div class="field"><div class="label">Next Follow-up</div><div class="value">${contact.next_followup||'—'}</div></div>
      <div class="field"><div class="label">Last Contacted</div><div class="value">${contact.last_contacted||'—'}</div></div>
    </div>
    ${contact.notes?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div class="label text-sm">NOTES</div><div>${contact.notes}</div></div>`:''}
    </div>
    <div class="section-title">Activity Log</div>
    ${(activities||[]).length ? `<div class="card" style="padding:0;"><table>
      <tr><th>Date</th><th>Type</th><th>Description</th><th>Follow-up</th></tr>
      ${activities.map(a=>`<tr><td class="text-sm text-muted">${(a.created_at||'').slice(0,16)}</td><td>${badge(a.activity_type,'blue')}</td><td>${a.description||''}</td><td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td></tr>`).join('')}
    </table></div>` : '<div class="card text-muted">No activity logged yet.</div>'}`;
}

// ── Activities List ─────────────────────────────────────────────────────────
async function renderActivitiesList(params) {
    app.innerHTML = '<div class="loading">Loading activities…</div>';
    const [{ data: activities }, { data: buyers }, { data: contacts }] = await Promise.all([
        db.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
        db.from('buyers').select('id,name'),
        db.from('contacts').select('id,name')
    ]);

    let filtered = activities || [];
    const ct = params?.get('contact_type');
    const at = params?.get('activity_type');
    if (ct) filtered = filtered.filter(a => a.contact_type === ct);
    if (at) filtered = filtered.filter(a => a.activity_type === at);

    const bMap = Object.fromEntries((buyers||[]).map(b=>[b.id,b.name]));
    const cMap = Object.fromEntries((contacts||[]).map(c=>[c.id,c.name]));

    app.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <h1 style="font-size:20px;font-weight:700;">Activity Log</h1>
      <a href="/activities/new" class="btn btn-sm btn-primary">+ Log Activity</a>
    </div>
    <div class="filters">
      <select id="fa-ct"><option value="">All Types</option>${['buyer','listing_agent','seller','other'].map(s=>`<option value="${s}" ${ct===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <select id="fa-at"><option value="">All Activities</option>${['call','text','email','meeting','offer_submitted','offer_accepted','offer_rejected','note'].map(s=>`<option value="${s}" ${at===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}</select>
      <button class="btn btn-sm" onclick="filterActs()">Filter</button>
      <a href="/activities" class="btn btn-sm">Clear</a>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><table>
      <tr><th>When</th><th>Type</th><th>Who</th><th>Activity</th><th>Description</th><th>Follow-up</th></tr>
      ${filtered.map(a => {
        let name = '', url = '#';
        if (a.contact_type==='buyer') { name = bMap[a.contact_id]||''; url = `/buyers/${a.contact_id}`; }
        else { name = cMap[a.contact_id]||''; url = `/contacts/${a.contact_id}`; }
        return `<tr>
          <td class="text-sm text-muted" style="white-space:nowrap;">${(a.created_at||'').slice(0,16)}</td>
          <td>${badge(a.contact_type,'gray')}</td>
          <td>${name?`<a href="${url}">${name}</a>`:'—'}</td>
          <td>${badge(a.activity_type,'blue')}</td>
          <td>${a.description||''}</td>
          <td>${a.followup_needed?badge(a.followup_date||'TBD','yellow'):''}</td>
        </tr>`;
      }).join('')}
      ${filtered.length===0?'<tr><td colspan="6" class="text-muted" style="text-align:center;padding:24px;">No activities.</td></tr>':''}
    </table></div>`;
}

window.filterActs = () => {
    const params = new URLSearchParams();
    if (document.getElementById('fa-ct').value) params.set('contact_type', document.getElementById('fa-ct').value);
    if (document.getElementById('fa-at').value) params.set('activity_type', document.getElementById('fa-at').value);
    navigate('/activities' + (params.toString() ? '?' + params : ''));
};

// ── Activity Form ───────────────────────────────────────────────────────────
async function renderActivityForm(params) {
    const [{ data: buyers }, { data: contacts }] = await Promise.all([
        db.from('buyers').select('id,name').order('name'),
        db.from('contacts').select('id,name,role').order('name')
    ]);

    const preType = params?.get('contact_type') || '';
    const preId = params?.get('contact_id') || '';

    app.innerHTML = `
    <h1 style="font-size:20px;font-weight:700;margin-bottom:16px;">Log Activity</h1>
    <form class="card" id="actForm">
      <div class="form-grid">
        <div class="form-group"><label>Contact Type *</label>
          <select name="contact_type" id="act_ct" onchange="updateActContacts()" required>
            <option value="">Select…</option>
            <option value="buyer" ${preType==='buyer'?'selected':''}>Buyer</option>
            <option value="listing_agent" ${preType==='listing_agent'?'selected':''}>Listing Agent</option>
            <option value="seller" ${preType==='seller'?'selected':''}>Seller</option>
            <option value="other" ${preType==='other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="form-group"><label>Contact *</label><select name="contact_id" id="act_cid" required><option value="">Select type first…</option></select></div>
        <div class="form-group"><label>Activity Type *</label><select name="activity_type">${['call','text','email','meeting','offer_submitted','offer_accepted','offer_rejected','note'].map(s=>`<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="form-group"><label>Follow-up Date</label><input type="date" name="followup_date"></div>
        <div class="form-group full"><label>Description *</label><textarea name="description" required placeholder="What happened?"></textarea></div>
        <div class="form-group"><label style="display:inline-flex;align-items:center;gap:6px;text-transform:none;font-size:13px;"><input type="checkbox" name="followup_needed"> Follow-up Needed</label></div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">Save</button>
        <button type="button" class="btn" onclick="saveActivity('save_add')">Save & Log Another</button>
        <a href="/activities" class="btn">Cancel</a>
      </div>
    </form>`;

    window._actBuyers = buyers || [];
    window._actContacts = contacts || [];
    window._actPreId = preId;

    if (preType) updateActContacts();
    document.getElementById('actForm').addEventListener('submit', e => { e.preventDefault(); saveActivity('save'); });
}

window.updateActContacts = () => {
    const type = document.getElementById('act_ct').value;
    const sel = document.getElementById('act_cid');
    sel.innerHTML = '<option value="">Select…</option>';
    let list = [];
    if (type === 'buyer') list = window._actBuyers.map(b => ({ id: b.id, name: b.name }));
    else list = window._actContacts.map(c => ({ id: c.id, name: `${c.name} (${(c.role||'').replace(/_/g,' ')})` }));
    list.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (String(c.id) === window._actPreId) opt.selected = true;
        sel.appendChild(opt);
    });
};

window.saveActivity = async (action) => {
    const form = document.getElementById('actForm');
    const fd = new FormData(form);
    const data = {
        contact_type: fd.get('contact_type'),
        contact_id: parseInt(fd.get('contact_id')),
        activity_type: fd.get('activity_type'),
        description: fd.get('description') || null,
        followup_needed: form.querySelector('[name=followup_needed]').checked,
        followup_date: fd.get('followup_date') || null,
    };

    const result = await db.from('activity_log').insert(data);
    if (result.error) { flash(result.error.message, 'error'); return; }

    // Update last_contacted on the contact
    const todayStr = today();
    if (data.contact_type === 'buyer') {
        const upd = { last_contacted: todayStr };
        if (data.followup_needed && data.followup_date) upd.next_followup = data.followup_date;
        await db.from('buyers').update(upd).eq('id', data.contact_id);
    } else if (['listing_agent', 'other'].includes(data.contact_type)) {
        const upd = { last_contacted: todayStr };
        if (data.followup_needed && data.followup_date) upd.next_followup = data.followup_date;
        await db.from('contacts').update(upd).eq('id', data.contact_id);
    }

    flash('Activity logged');
    if (action === 'save_add') navigate('/activities/new');
    else navigate('/activities');
};

// ── Init ────────────────────────────────────────────────────────────────────
(async () => {
    if (await checkAuth()) {
        route(location.pathname + location.search);
    }
})();
