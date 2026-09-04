// utils.js - Shared utilities for Robopanda modules
// Digunakan bersama oleh index.js dan seluruh modul untuk mencegah XSS
// saat merender data dinamis (dari database) ke innerHTML.

export function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}