const SUPABASE_URL = 'https://cjkpcvvoqbkruzmexmam.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqa3BjdnZvcWJrcnV6bWV4bWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTAxMzcsImV4cCI6MjA4OTQ2NjEzN30.Unk_5PWrvTvwdPMMpAhFBXce8EunIqdUB7sFYaLb0xg';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Condition ranking for matching
const CONDITION_RANK = { turnkey: 1, cosmetic: 2, medium_rehab: 3, full_gut: 4 };

// Helper: format money
function fmt(n) {
    if (n == null) return '—';
    return '$' + Number(n).toLocaleString();
}

// Helper: format date nicely
function fmtDate(d) {
    if (!d) return '—';
    return d;
}

// Helper: badge HTML
function badge(text, color) {
    const colors = {
        green: 'badge-green', yellow: 'badge-yellow', red: 'badge-red',
        blue: 'badge-blue', gray: 'badge-gray', orange: 'badge-orange'
    };
    return `<span class="badge ${colors[color] || 'badge-gray'}">${(text || '').replace(/_/g, ' ')}</span>`;
}

// Helper: status badge color
function buyerStatusColor(s) {
    if (['verified_active', 'engaged'].includes(s)) return 'green';
    if (['contacted', 'criteria_collected'].includes(s)) return 'yellow';
    if (s === 'inactive') return 'gray';
    return 'blue';
}

function propStatusColor(s) {
    if (['under_contract', 'closed'].includes(s)) return 'green';
    if (s === 'offer_submitted') return 'yellow';
    if (s === 'dead') return 'red';
    return 'blue';
}

// Helper: get today as YYYY-MM-DD
function today() {
    return new Date().toISOString().slice(0, 10);
}

// Helper: show flash message
function flash(msg, type = 'success') {
    const div = document.createElement('div');
    div.className = `flash flash-${type}`;
    div.textContent = msg;
    const container = document.querySelector('.container');
    container.insertBefore(div, container.firstChild);
    setTimeout(() => div.remove(), 4000);
}

// Helper: CSV export
function exportCSV(data, filename) {
    if (!data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(','), ...data.map(r => keys.map(k => {
        let v = r[k] == null ? '' : String(r[k]);
        if (v.includes(',') || v.includes('"') || v.includes('\n')) v = '"' + v.replace(/"/g, '""') + '"';
        return v;
    }).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

// Matching logic
function getMatchingBuyers(property, buyers) {
    const propCondition = CONDITION_RANK[property.condition_estimate] || 99;
    const matches = [];

    for (const b of buyers) {
        if (b.status === 'inactive') continue;
        const buyerZips = (b.zip_codes || '').split(',').map(z => z.trim()).filter(Boolean);
        if (!buyerZips.includes(property.zip_code)) continue;

        const lp = property.list_price || 0;
        const mao = property.mao || lp;
        const checkPrice = Math.min(lp, mao || lp);
        const minP = b.min_price || 0;
        const maxP = b.max_price || 999999999;
        if (checkPrice < minP || checkPrice > maxP) {
            if (lp < minP || lp > maxP) continue;
        }

        const buyerTypes = (b.property_types || '').split(',').map(t => t.trim()).filter(Boolean);
        if (!buyerTypes.includes(property.property_type)) continue;

        const buyerTol = CONDITION_RANK[b.condition_tolerance] || 99;
        if (propCondition > buyerTol) continue;

        matches.push(b);
    }

    const statusOrder = { verified_active: 0, engaged: 1, criteria_collected: 2, contacted: 3, new: 4 };
    matches.sort((a, b) => (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5));
    return matches;
}

function getMatchingProperties(buyer, properties) {
    const buyerZips = (buyer.zip_codes || '').split(',').map(z => z.trim()).filter(Boolean);
    const buyerTypes = (buyer.property_types || '').split(',').map(t => t.trim()).filter(Boolean);
    const buyerTol = CONDITION_RANK[buyer.condition_tolerance] || 99;
    const matches = [];

    for (const p of properties) {
        if (['closed', 'dead'].includes(p.status)) continue;
        if (!buyerZips.includes(p.zip_code)) continue;

        const lp = p.list_price || 0;
        const mao = p.mao || lp;
        const checkPrice = Math.min(lp, mao || lp);
        const minP = buyer.min_price || 0;
        const maxP = buyer.max_price || 999999999;
        if (checkPrice < minP || checkPrice > maxP) {
            if (lp < minP || lp > maxP) continue;
        }

        if (!buyerTypes.includes(p.property_type)) continue;

        const propCond = CONDITION_RANK[p.condition_estimate] || 99;
        if (propCond > buyerTol) continue;

        matches.push(p);
    }

    matches.sort((a, b) => {
        const spreadA = (a.list_price || 0) - (a.mao || 999999999);
        const spreadB = (b.list_price || 0) - (b.mao || 999999999);
        if (spreadA !== spreadB) return spreadA - spreadB;
        return (b.dom || 0) - (a.dom || 0);
    });
    return matches;
}

// Simple auth gate — password stored in localStorage
const APP_PASSWORD = null; // Set to a string like 'mypassword123' to enable, or null to disable

function checkAuth() {
    if (!APP_PASSWORD) return true;
    const stored = localStorage.getItem('dealengine_auth');
    if (stored === APP_PASSWORD) return true;
    const pw = prompt('Enter password:');
    if (pw === APP_PASSWORD) {
        localStorage.setItem('dealengine_auth', pw);
        return true;
    }
    document.body.innerHTML = '<div style="padding:40px;color:#f87171;font-size:18px;">Access denied.</div>';
    return false;
}
