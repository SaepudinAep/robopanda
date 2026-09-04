/**
 * Project: Robopanda Client (Public)
 * File: modules/kurikulum-module.js
 * Version: 2.0 - Modul Silabus & Kurikulum Standar Akademik (READ-ONLY)
 *
 * Description:
 *  Silabus & Peta Pembelajaran Robopanda dalam 3 Tab utama:
 *   1) Silabus     -> Format Dokumen Terstruktur per Level (Academic Syllabus Table),
 *                     menampilkan urutan Kit, Materi, Deskripsi, dan Target Achievement.
 *   2) Lesson Plan -> Detail lengkap per robot/materi (+ riwayat diajarkan).
 *   3) On Progress -> Riwayat pembelajaran kelas terbaru (Sekolah + Private).
 *
 *  Fitur Tambahan:
 *   - Quick Search: Pencarian cepat judul/materi di seluruh level.
 *   - Accordion Kit: Buka/tutup unit materi dalam dokumen silabus.
 *   - Print Friendly: Desain siap cetak / simpan ke PDF (Ctrl+P).
 *   - Skeleton Loader: Efek loading halus untuk pengalaman UX yang lebih baik.
 */

import { supabase } from '../assets/js/config.js';
import { escapeHtml } from '../assets/js/utils.js';

// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
let userProfile = { role: 'guest' };

let levelsList = [];      // { id, kode, detail, order_index }
let subLevelsList = [];   // { id, level_id, kode, name, kit_alat, description, is_active, order_index }
let materiSekolah = [];   // tabel "materi"
let materiPrivate = [];   // tabel "materi_private"
let achSekolah = [];      // achievement_sekolah
let achPrivate = [];      // achievement_private

let activeTab = 'silabus';         // 'silabus' | 'plan' | 'progress'
let searchQuery = '';              // Kata kunci pencarian
let collapsedKits = {};            // { [kitId]: boolean }

// Silabus & Lesson Plan selections
let silabusLevelId = null;
let planLevelId = null;
let planItemId = null;             // `${src}:${id}`
let planDetail = null;
let planHistory = [];
let planHistoryLoading = false;
let planHistoryError = false;

// On Progress
let progressRows = null;
let progressLoading = false;

// Access control & Strict Scope State
let showSchool = false;
let showPrivate = false;
let userAllowedLevelIds = null; // Set atau null (null = super_admin, semua level)
let userAllowedClassIds = null; // Set atau null (filter pertemuan per kelas)

// ==========================================
// 2. INITIALIZATION
// ==========================================
export async function init(canvas, profileFromIndex) {
    userProfile = profileFromIndex || { role: 'guest' };
    injectStyles();

    const role = userProfile.role || 'guest';
    // Tamu tanpa login tidak boleh melihat silabus kelas internal
    if (role === 'guest' || !userProfile.id) {
        canvas.innerHTML = `
            <div class="kur-container">
                <div class="kur-header">
                    <div class="kur-header-text">
                        <h2><i class="fa-solid fa-graduation-cap"></i> Silabus &amp; Kurikulum Robopanda</h2>
                        <p>Silabus terstruktur dan rencana pembelajaran siswa.</p>
                    </div>
                </div>
                <div class="kur-empty">
                    <i class="fa-solid fa-lock fa-3x" style="color:#2ecc71;"></i>
                    <p style="font-weight:700; color:#1e293b; font-size:1.1rem; margin:10px 0 4px;">Akses Silabus Terkunci</p>
                    <p style="color:#64748b; max-width:420px; margin:0 0 16px;">Silakan login dengan akun siswa, guru, atau sekolah Anda untuk melihat silabus resmi kelas Anda.</p>
                    <button class="kur-btn-print" onclick="const m=document.getElementById('modal-login');if(m)m.classList.add('active');"><i class="fa-solid fa-right-to-bracket"></i> Login Sekarang</button>
                </div>
            </div>`;
        return;
    }

    const scopeLabel = 'Peta pembelajaran terstruktur, lesson plan, dan riwayat kelas.';

    canvas.innerHTML = `
        <div class="kur-container">
            <div class="kur-header">
                <div class="kur-header-text">
                    <h2><i class="fa-solid fa-graduation-cap"></i> Silabus &amp; Kurikulum Robopanda</h2>
                    <p id="kur-scope-label">${scopeLabel}</p>
                </div>
                <div class="kur-header-actions">
                    <button class="kur-btn-print" data-action="kur-print" title="Cetak / Simpan PDF">
                        <i class="fa-solid fa-print"></i> <span>Cetak Silabus</span>
                    </button>
                </div>
            </div>

            <div class="kur-sticky-bar">
                <div class="kur-tabs" id="kur-tabs"></div>
                <div class="kur-search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="kur-search-input" placeholder="Cari materi, robot, atau topik..." value="${escapeHtml(searchQuery)}">
                    ${searchQuery ? `<button id="kur-search-clear"><i class="fa-solid fa-xmark"></i></button>` : ''}
                </div>
            </div>

            <div id="kur-content">
                ${loadingHTML()}
            </div>
        </div>`;

    const shell = canvas.querySelector('.kur-container');
    shell.addEventListener('click', (e) => handleModuleClick(e));

    const searchInput = canvas.querySelector('#kur-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            renderActiveTabContent();
        });
    }

    await bootstrap();
}

async function bootstrap() {
    const area = document.getElementById('kur-content');
    if (area) area.innerHTML = loadingHTML();
    try {
        await fetchCurriculum();
    } catch (err) {
        console.error('Kurikulum load error:', err);
        renderError('Gagal memuat data kurikulum. Periksa koneksi lalu coba lagi.');
        return;
    }
    await activateTab(activeTab);
}

function handleModuleClick(e) {
    const printBtn = e.target.closest('[data-action="kur-print"]');
    if (printBtn) { window.print(); return; }

    const tabBtn = e.target.closest('[data-action="kur-tab"]');
    if (tabBtn) { activateTab(tabBtn.dataset.tab); return; }

    const retryBtn = e.target.closest('[data-action="kur-retry"]');
    if (retryBtn) { bootstrap(); return; }

    const clearSearch = e.target.closest('#kur-search-clear');
    if (clearSearch) {
        searchQuery = '';
        const input = document.getElementById('kur-search-input');
        if (input) input.value = '';
        renderActiveTabContent();
        return;
    }

    // Toggle Kit Accordion in Silabus
    const kitHeader = e.target.closest('[data-action="toggle-kit"]');
    if (kitHeader) {
        const kitId = kitHeader.dataset.kitid;
        collapsedKits[kitId] = !collapsedKits[kitId];
        renderSilabus();
        return;
    }

    // Silabus Level Pill
    const lvBtn = e.target.closest('[data-action="slb-level"]');
    if (lvBtn) {
        silabusLevelId = lvBtn.dataset.id;
        renderSilabus();
        return;
    }

    // Lesson Plan Level Pill
    const plvBtn = e.target.closest('[data-action="plan-level"]');
    if (plvBtn) {
        planLevelId = plvBtn.dataset.id;
        planItemId = null;
        planDetail = null;
        planHistory = [];
        planHistoryError = false;
        renderPlan();
        return;
    }

    // Lesson Plan Item Select
    const itemBtn = e.target.closest('[data-action="plan-item"]');
    if (itemBtn) {
        selectPlanItem(itemBtn.dataset.src, itemBtn.dataset.id);
        return;
    }
}

async function activateTab(tab) {
    activeTab = tab;
    renderTabs();
    await renderActiveTabContent();
}

async function renderActiveTabContent() {
    if (activeTab === 'silabus') {
        ensureSilabusDefaults();
        renderSilabus();
    } else if (activeTab === 'plan') {
        ensurePlanDefaults();
        renderPlan();
    } else if (activeTab === 'progress') {
        if (!progressRows && !progressLoading) await loadProgress();
        renderProgress();
    }
}

function renderTabs() {
    const el = document.getElementById('kur-tabs');
    if (!el) return;
    const tabs = [
        { id: 'silabus', icon: 'fa-book-open-reader', label: 'Silabus Dokumen' },
        { id: 'plan', icon: 'fa-chalkboard-user', label: 'Lesson Plan' },
        { id: 'progress', icon: 'fa-timeline', label: 'On Progress' }
    ];
    el.innerHTML = tabs.map(t => `
        <button class="kur-tab ${activeTab === t.id ? 'active' : ''}" data-action="kur-tab" data-tab="${t.id}">
            <i class="fa-solid ${t.icon}"></i> ${t.label}
        </button>`).join('');
}

function loadingHTML() {
    return `
        <div class="kur-skeleton-wrap">
            <div class="kur-skeleton-header"></div>
            <div class="kur-skeleton-row"></div>
            <div class="kur-skeleton-row"></div>
            <div class="kur-skeleton-row"></div>
        </div>`;
}

function renderError(msg) {
    const area = document.getElementById('kur-content');
    if (!area) return;
    area.innerHTML = `
        <div class="kur-empty error">
            <i class="fa-solid fa-triangle-exclamation fa-2x"></i>
            <span>${escapeHtml(msg)}</span>
            <button class="kur-retry-btn" data-action="kur-retry"><i class="fa-solid fa-rotate-right"></i> Coba Lagi</button>
        </div>`;
}

// ==========================================
// 3. DATA FETCHING
// ==========================================
async function fetchCurriculum() {
    const [lv, sv, ms, mp, asx, ap] = await Promise.all([
        supabase.from('levels').select('id, kode, detail, order_index'),
        supabase.from('sub_levels').select('id, level_id, kode, name, kit_alat, description, is_active, order_index'),
        supabase.from('materi').select('id, title, description, detail, level_id, sub_level_id, order_index, created_at'),
        supabase.from('materi_private').select('id, judul, deskripsi, detail, level_id, sub_level_id, order_index, created_at'),
        supabase.from('achievement_sekolah').select('id, main_achievement, sub_achievement, sub_level_id'),
        supabase.from('achievement_private').select('id, main_achievement, sub_achievement, sub_level_id, materi_id')
    ]);

    const err = lv.error || sv.error || ms.error || mp.error || asx.error || ap.error;
    if (err) throw err;

    levelsList = lv.data || [];
    subLevelsList = sv.data || [];
    materiSekolah = ms.data || [];
    materiPrivate = mp.data || [];
    achSekolah = asx.data || [];
    achPrivate = ap.data || [];

    await resolveUserScope();
}

// -------------------------------------------------------------
// RESOLVE USER SCOPE & LEVEL ISOLATION
// -------------------------------------------------------------
async function resolveUserScope() {
    const role = userProfile?.role || 'guest';

    // 1. SUPER ADMIN: Memiliki hak akses penuh ke seluruh level & program
    if (role === 'super_admin') {
        showSchool = true;
        showPrivate = true;
        userAllowedLevelIds = null;
        userAllowedClassIds = null;
        updateScopeLabelHeader('Kurikulum Sekolah & Program Private (Super Admin Full Access)');
        return;
    }

    userAllowedLevelIds = new Set();
    userAllowedClassIds = new Set();

    // 2. PIC SEKOLAH: Hanya level & kelas yang terdaftar di sekolah miliknya
    if (role === 'pic' && userProfile.school_id) {
        showSchool = true;
        showPrivate = false;

        try {
            const { data: schoolClasses } = await supabase.from('classes')
                .select('id, name, level, sub_level_id')
                .eq('school_id', userProfile.school_id);

            (schoolClasses || []).forEach(c => {
                userAllowedClassIds.add(c.id);
                if (c.level) {
                    const match = levelsList.find(l => l.kode?.toLowerCase() === c.level.toLowerCase());
                    if (match) userAllowedLevelIds.add(match.id);
                }
                if (c.sub_level_id) {
                    const subObj = subLevelsList.find(s => s.id === c.sub_level_id);
                    if (subObj?.level_id) userAllowedLevelIds.add(subObj.level_id);
                }
            });
        } catch (err) {
            console.error('[Kurikulum] Gagal memuat kelas sekolah PIC:', err);
        }
    }

    // 3. GURU (TEACHER): Terikat pada level_id di profil
    else if (role === 'teacher') {
        if (userProfile.level_id) {
            userAllowedLevelIds.add(userProfile.level_id);
            const lvlObj = levelsList.find(l => l.id === userProfile.level_id);
            if (lvlObj?.kode === 'Terapi Wicara') {
                showSchool = false;
                showPrivate = true;
            } else if (lvlObj?.kode === 'Kiddy' || lvlObj?.kode === 'Beginner') {
                showSchool = true;
                showPrivate = false;
            } else {
                showSchool = true;
                showPrivate = true;
            }
        } else {
            showSchool = true;
            showPrivate = true;
        }
    }

    // 4. SISWA / AKUN KELAS TERIKAT
    else if (userProfile.class_id || userProfile.class_private_id) {
        if (userProfile.class_id) {
            showSchool = true;
            showPrivate = false;
            userAllowedClassIds.add(userProfile.class_id);
            try {
                const { data: cls } = await supabase.from('classes')
                    .select('id, level, sub_level_id')
                    .eq('id', userProfile.class_id)
                    .single();
                if (cls?.level) {
                    const match = levelsList.find(l => l.kode?.toLowerCase() === cls.level.toLowerCase());
                    if (match) userAllowedLevelIds.add(match.id);
                }
                if (cls?.sub_level_id) {
                    const subObj = subLevelsList.find(s => s.id === cls.sub_level_id);
                    if (subObj?.level_id) userAllowedLevelIds.add(subObj.level_id);
                }
            } catch (e) {}
        }
        if (userProfile.class_private_id) {
            showSchool = false;
            showPrivate = true;
            userAllowedClassIds.add(userProfile.class_private_id);
            try {
                const { data: cp } = await supabase.from('class_private')
                    .select('id, level, level_id, sub_level_id')
                    .eq('id', userProfile.class_private_id)
                    .single();
                if (cp?.level_id) userAllowedLevelIds.add(cp.level_id);
                else if (cp?.level) {
                    const match = levelsList.find(l => l.kode?.toLowerCase() === cp.level.toLowerCase());
                    if (match) userAllowedLevelIds.add(match.id);
                }
            } catch (e) {}
        }
    }

    // 5. PENYARINGAN KETAT: Level & Materi Lain Sembunyi Sepenuhnya
    if (userAllowedLevelIds && userAllowedLevelIds.size > 0) {
        levelsList = levelsList.filter(l => userAllowedLevelIds.has(l.id));
        subLevelsList = subLevelsList.filter(s => userAllowedLevelIds.has(s.level_id));
        materiSekolah = materiSekolah.filter(m => userAllowedLevelIds.has(m.level_id));
        materiPrivate = materiPrivate.filter(m => userAllowedLevelIds.has(m.level_id));
        achSekolah = achSekolah.filter(a => userAllowedLevelIds.has(a.level_id) || subLevelsList.some(s => s.id === a.sub_level_id));
        achPrivate = achPrivate.filter(a => userAllowedLevelIds.has(a.level_id) || subLevelsList.some(s => s.id === a.sub_level_id));
    }

    if (!showPrivate) { materiPrivate = []; achPrivate = []; }
    if (!showSchool) { materiSekolah = []; achSekolah = []; }

    const activeLevelsStr = levelsList.map(l => l.kode).join(', ') || 'Kelas Anda';
    updateScopeLabelHeader(`Silabus Khusus: ${activeLevelsStr} &bull; Peta pembelajaran terstruktur kelas Anda.`);
}

function updateScopeLabelHeader(text) {
    const lbl = document.getElementById('kur-scope-label');
    if (lbl) lbl.innerHTML = text;
}

// -------------------------------------------------------------
// PROGRESS & RIWAYAT (HANYA KELAS/LEVEL YANG DIIZINKAN)
// -------------------------------------------------------------
async function loadProgress() {
    progressLoading = true;
    renderProgress();

    const isSuperAdmin = userProfile?.role === 'super_admin';

    let schoolPromise = Promise.resolve({ data: [] });
    if (showSchool) {
        let q = supabase.from('pertemuan_kelas')
            .select('tanggal, class_id, materi:materi_id(id, title, level_id, levels(kode)), kelas:class_id(name)')
            .order('tanggal', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(60);

        if (!isSuperAdmin && userAllowedClassIds && userAllowedClassIds.size > 0) {
            q = q.in('class_id', Array.from(userAllowedClassIds));
        }
        schoolPromise = q;
    }

    let privatePromise = Promise.resolve({ data: [] });
    if (showPrivate) {
        let q = supabase.from('pertemuan_private')
            .select('tanggal, class_id, pertemuan_ke, materi:materi_id(id, judul, level_id, levels(kode)), kelas:class_id(name)')
            .order('tanggal', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(60);

        if (!isSuperAdmin && userAllowedClassIds && userAllowedClassIds.size > 0) {
            q = q.in('class_id', Array.from(userAllowedClassIds));
        }
        privatePromise = q;
    }

    const [ps, pp] = await Promise.all([schoolPromise, privatePromise]);

    let rows = [
        ...(ps.data || []).map(r => ({
            tanggal: r.tanggal,
            title: r.materi?.title || '',
            levelKode: r.materi?.levels?.kode || '',
            levelId: r.materi?.level_id || '',
            kelas: r.kelas?.name || '-',
            pertemuanKe: null,
            src: 'skl'
        })),
        ...(pp.data || []).map(r => ({
            tanggal: r.tanggal,
            title: r.materi?.judul || '',
            levelKode: r.materi?.levels?.kode || '',
            levelId: r.materi?.level_id || '',
            kelas: r.kelas?.name || '-',
            pertemuanKe: r.pertemuan_ke,
            src: 'prv'
        }))
    ].filter(r => r.title);

    // Kunci Level: Pertemuan dari level lain yang tidak diizinkan disembunyikan
    if (!isSuperAdmin && userAllowedLevelIds && userAllowedLevelIds.size > 0) {
        rows = rows.filter(r => userAllowedLevelIds.has(r.levelId));
    }

    rows.sort((a, b) =>
        String(b.tanggal || '').localeCompare(String(a.tanggal || '')) ||
        (b.pertemuanKe || 0) - (a.pertemuanKe || 0));

    progressRows = rows;
    progressLoading = false;
}

async function loadPlanHistory(item) {
    const key = item.src + ':' + item.id;
    const isSuperAdmin = userProfile?.role === 'super_admin';

    try {
        let schoolPromise = Promise.resolve({ data: [] });
        if (item.src === 'skl' && showSchool) {
            let q = supabase.from('pertemuan_kelas')
                .select('tanggal, class_id, kelas:class_id(name)')
                .eq('materi_id', item.id)
                .order('tanggal', { ascending: false })
                .limit(50);
            if (!isSuperAdmin && userAllowedClassIds && userAllowedClassIds.size > 0) {
                q = q.in('class_id', Array.from(userAllowedClassIds));
            }
            schoolPromise = q;
        }

        let privatePromise = Promise.resolve({ data: [] });
        if (item.src === 'prv' && showPrivate) {
            let q = supabase.from('pertemuan_private')
                .select('tanggal, class_id, pertemuan_ke, kelas:class_id(name)')
                .eq('materi_id', item.id)
                .order('tanggal', { ascending: false })
                .limit(50);
            if (!isSuperAdmin && userAllowedClassIds && userAllowedClassIds.size > 0) {
                q = q.in('class_id', Array.from(userAllowedClassIds));
            }
            privatePromise = q;
        }

        const [ps, pp] = await Promise.all([schoolPromise, privatePromise]);
        if (planItemId !== key) return;

        const rows = [
            ...(ps.data || []).map(r => ({ tanggal: r.tanggal, kelas: r.kelas?.name || '-', pertemuanKe: null, src: 'skl' })),
            ...(pp.data || []).map(r => ({ tanggal: r.tanggal, kelas: r.kelas?.name || '-', pertemuanKe: r.pertemuan_ke, src: 'prv' }))
        ].sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));

        planHistory = rows;
        planHistoryError = false;
    } catch (err) {
        console.error('Gagal memuat riwayat materi:', err);
        if (planItemId !== key) return;
        planHistory = [];
        planHistoryError = true;
    }
    planHistoryLoading = false;
    if (activeTab === 'plan') renderPlan();
}

// ==========================================
// 4. LOGIKA DATA & URUTAN
// ==========================================
const tieBreaker = (a, b) =>
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.title || '').localeCompare(String(b.title || ''));

function compareItems(a, b) {
    const ai = a.order_index, bi = b.order_index;
    if (ai == null && bi == null) return tieBreaker(a, b);
    if (ai == null) return 1;
    if (bi == null) return -1;
    return (ai - bi) || tieBreaker(a, b);
}

function toItem(row, src) {
    return {
        src,
        id: row.id,
        level_id: row.level_id,
        sub_level_id: row.sub_level_id,
        title: row.title || row.judul || '(tanpa judul)',
        desc: row.description || row.deskripsi || '',
        detail: row.detail || '',
        order_index: row.order_index,
        created_at: row.created_at
    };
}

const allMateri = () => [
    ...materiSekolah.map(r => toItem(r, 'skl')),
    ...materiPrivate.map(r => toItem(r, 'prv'))
];

function getSortedItems(subId) {
    if (String(subId).startsWith('uncat:')) {
        const lid = String(subId).slice(6);
        return allMateri().filter(m => m.sub_level_id == null && m.level_id === lid).sort(compareItems);
    }
    return allMateri().filter(m => m.sub_level_id === subId).sort(compareItems);
}

function getSortedLevels() {
    return levelsList
        .map(l => ({ id: l.id, title: l.kode || '(tanpa kode)', detail: l.detail || '', order_index: l.order_index, created_at: '', _ref: l }))
        .sort(compareItems);
}

function getSortedSubs(levelId) {
    const real = subLevelsList
        .filter(s => s.level_id === levelId)
        .map(s => ({ id: s.id, title: s.name || s.kode || '(tanpa nama)', order_index: s.order_index, created_at: '', _ref: s }))
        .sort(compareItems);

    const uncatCount = getSortedItems('uncat:' + levelId).length;
    if (uncatCount > 0) {
        real.push({ id: 'uncat:' + levelId, title: 'Belum Dikategorikan', order_index: null, created_at: '', _pseudo: true, _uncat: uncatCount });
    }
    return real;
}

const fmtDate = (tgl) => {
    if (!tgl) return '-';
    try {
        return new Date(String(tgl) + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(tgl); }
};

const srcBadge = (src) => (showSchool && showPrivate)
    ? `<span class="kur-badge ${src === 'skl' ? 'skl' : 'prv'}">${src === 'skl' ? 'Sekolah' : 'Private'}</span>`
    : '';

// ==========================================
// 5. RENDER: TAB SILABUS (Academic Standard Document View)
// ==========================================
function ensureSilabusDefaults() {
    const lvls = getSortedLevels();
    if (!lvls.length) { silabusLevelId = null; return; }
    if (!lvls.some(l => l.id === silabusLevelId)) {
        silabusLevelId = lvls[0].id;
    }
}

function renderSilabus() {
    const area = document.getElementById('kur-content');
    if (!area) return;

    const lvls = getSortedLevels();
    if (!lvls.length) {
        area.innerHTML = emptyBox('Belum ada level kurikulum terdaftar.');
        return;
    }

    if (!lvls.some(l => l.id === silabusLevelId)) silabusLevelId = lvls[0].id;
    const currentLvl = lvls.find(l => l.id === silabusLevelId);
    const subs = getSortedSubs(silabusLevelId);

    let totalItems = 0;
    subs.forEach(s => {
        totalItems += s._pseudo ? s._uncat : getSortedItems(s.id).length;
    });

    area.innerHTML = `
        <div class="kur-tabs-lvl">
            ${lvls.map(l => `
            <button class="kur-pill ${l.id === silabusLevelId ? 'active' : ''}" data-action="slb-level" data-id="${l.id}">
                <i class="fa-solid fa-layer-group"></i> ${escapeHtml(l.title)}
                <small>${getSortedSubs(l.id).reduce((acc, s) => acc + (s._pseudo ? s._uncat : getSortedItems(s.id).length), 0)} Topik</small>
            </button>`).join('')}
        </div>

        <div class="kur-syll-doc">
            <div class="kur-syll-doc-header">
                <div class="kur-syll-doc-title">
                    <h3>SILABUS PEMBELAJARAN: ${escapeHtml(currentLvl.title)}</h3>
                    ${currentLvl.detail ? `<p>${escapeHtml(currentLvl.detail)}</p>` : ''}
                </div>
                <div class="kur-syll-doc-meta">
                    <span class="kur-syll-chip"><i class="fa-solid fa-boxes-stacked"></i> ${subs.length} Modul / Kit</span>
                    <span class="kur-syll-chip"><i class="fa-solid fa-list-check"></i> ${totalItems} Topik Pembelajaran</span>
                </div>
            </div>

            ${subs.length === 0
                ? emptyBoxSmall('Belum ada modul atau kit pembelajaran pada level ini.')
                : subs.map((sub, sIdx) => renderSyllabusKitSection(sub, sIdx + 1)).join('')}
        </div>`;
}

function renderSyllabusKitSection(sub, kitNum) {
    let items = getSortedItems(sub.id);

    if (searchQuery) {
        items = items.filter(m =>
            m.title.toLowerCase().includes(searchQuery) ||
            m.desc.toLowerCase().includes(searchQuery) ||
            m.detail.toLowerCase().includes(searchQuery)
        );
    }

    const isCollapsed = !!collapsedKits[sub.id];
    const isPseudo = !!sub._pseudo;
    const ref = sub._ref || {};

    const asek = (!isPseudo && ref.id) ? achSekolah.filter(a => a.sub_level_id === ref.id) : [];
    const aprv = (!isPseudo && ref.id) ? achPrivate.filter(a => a.sub_level_id === ref.id) : [];

    return `
    <div class="kur-syll-kit-card ${isCollapsed ? 'collapsed' : ''}">
        <div class="kur-syll-kit-head" data-action="toggle-kit" data-kitid="${sub.id}">
            <div class="kur-syll-kit-info">
                <span class="kur-syll-kit-num">Modul ${kitNum}</span>
                <h4>${escapeHtml(sub.title)} ${ref.kode ? `<code>(${escapeHtml(ref.kode)})</code>` : ''}</h4>
                ${ref.kit_alat ? `<span class="kur-kit"><i class="fa-solid fa-toolbox"></i> Hardware: ${escapeHtml(ref.kit_alat)}</span>` : ''}
                ${isPseudo ? `<span class="kur-kit warn"><i class="fa-solid fa-triangle-exclamation"></i> Belum terikat ke Kit</span>` : ''}
            </div>
            <div class="kur-syll-kit-action">
                <span class="kur-syll-badge-count">${items.length} Topik</span>
                <i class="fa-solid fa-chevron-down kur-syll-arrow"></i>
            </div>
        </div>

        ${isCollapsed ? '' : `
        <div class="kur-syll-kit-body">
            ${ref.description ? `<div class="kur-syll-kit-desc"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(ref.description)}</div>` : ''}

            ${items.length === 0
                ? (searchQuery ? emptyBoxSmall('Tidak ada topik yang cocok dengan pencarian.') : emptyBoxSmall('Belum ada materi/topik pada modul ini.'))
                : `
                <div class="kur-table-responsive">
                    <table class="kur-syll-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">No</th>
                                <th>Topik Pembelajaran / Robot</th>
                                <th>Deskripsi &amp; Target Materi</th>
                                <th>Capaian (Achievement)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((item, iIdx) => {
                                const itemAsek = achSekolah.filter(a => a.sub_level_id === item.sub_level_id);
                                const itemAprv = achPrivate.filter(a => a.materi_id === item.id);
                                const allAch = [...itemAsek, ...itemAprv];

                                return `
                                <tr>
                                    <td class="text-center font-bold">${iIdx + 1}</td>
                                    <td>
                                        <div class="kur-syll-materi-title">${escapeHtml(item.title)}</div>
                                        ${srcBadge(item.src)}
                                    </td>
                                    <td>
                                        ${item.desc ? `<div class="kur-syll-desc">${escapeHtml(item.desc)}</div>` : ''}
                                        ${item.detail ? `<div class="kur-syll-detail-small">${escapeHtml(item.detail)}</div>` : ''}
                                    </td>
                                    <td>
                                        ${allAch.length === 0 ? `<span class="kur-text-muted">-</span>` : `
                                            <ul class="kur-ach-list">
                                                ${allAch.map(a => `<li><i class="fa-solid fa-circle-check"></i> <b>${escapeHtml(a.main_achievement || '')}</b> ${a.sub_achievement ? `<small>&rsaquo; ${escapeHtml(a.sub_achievement)}</small>` : ''}</li>`).join('')}
                                            </ul>`}
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`}

            ${(!isPseudo && (asek.length + aprv.length) > 0) ? `
            <div class="kur-syll-global-ach">
                <div class="kur-ach-title"><i class="fa-solid fa-trophy"></i> Capaian Utama Modul Ini</div>
                <div class="kur-ach-grid">
                    ${[...asek.map(a => achRow(a, 'skl')), ...aprv.map(a => achRow(a, 'prv'))].join('')}
                </div>
            </div>` : ''}
        </div>`}
    </div>`;
}

// ==========================================
// 6. RENDER: TAB LESSON PLAN
// ==========================================
function ensurePlanDefaults() {
    const lvls = getSortedLevels();
    if (!lvls.length) { planLevelId = null; planItemId = null; planDetail = null; return; }
    if (!lvls.some(l => l.id === planLevelId)) {
        planLevelId = lvls[0].id;
        planItemId = null;
        planDetail = null;
        planHistory = [];
    }
}

function getPlanItems() {
    let rows = [];
    getSortedSubs(planLevelId).forEach(s => {
        getSortedItems(s.id).forEach(m => rows.push(Object.assign({}, m, { kitName: s.title, kitPseudo: !!s._pseudo })));
    });

    if (searchQuery) {
        rows = rows.filter(m =>
            m.title.toLowerCase().includes(searchQuery) ||
            m.desc.toLowerCase().includes(searchQuery) ||
            m.kitName.toLowerCase().includes(searchQuery)
        );
    }
    return rows;
}

function selectPlanItem(src, id) {
    const item = getPlanItems().find(m => m.src === src && m.id === id);
    if (!item) return;
    planItemId = src + ':' + id;
    planDetail = item;
    planHistory = [];
    planHistoryError = false;
    planHistoryLoading = true;
    renderPlan();
    loadPlanHistory(item);
}

function renderPlan() {
    const area = document.getElementById('kur-content');
    if (!area) return;

    const lvls = getSortedLevels();
    if (!lvls.length) {
        area.innerHTML = emptyBox('Belum ada level kurikulum.');
        return;
    }

    const items = getPlanItems();

    area.innerHTML = `
        <div class="kur-tabs-lvl">
            ${lvls.map(l => `
            <button class="kur-pill ${l.id === planLevelId ? 'active' : ''}" data-action="plan-level" data-id="${l.id}">
                ${escapeHtml(l.title)}<small>${getSortedSubs(l.id).reduce((n, s) => n + (s._pseudo ? s._uncat : getSortedItems(s.id).length), 0)}</small>
            </button>`).join('')}
        </div>
        ${items.length === 0 ? emptyBox(searchQuery ? 'Tidak ada materi yang sesuai pencarian.' : 'Belum ada materi/robot pada level ini.') : `
        <div class="kur-plan-wrap">
            <ol class="kur-plan-list">
                ${items.map((m, i) => `
                <li>
                    <button class="kur-plan-row ${planItemId === (m.src + ':' + m.id) ? 'selected' : ''}"
                            data-action="plan-item" data-src="${m.src}" data-id="${m.id}">
                        <span class="kur-num">${i + 1}</span>
                        <span class="kur-plan-info">
                            <span class="kur-plan-title">${escapeHtml(m.title)}</span>
                            <span class="kur-plan-kit"><i class="fa-solid fa-toolbox"></i> ${escapeHtml(m.kitName)}</span>
                        </span>
                        ${srcBadge(m.src)}
                    </button>
                </li>`).join('')}
            </ol>
            <div class="kur-plan-detail">${renderPlanDetail()}</div>
        </div>`}`;
}

function renderPlanDetail() {
    if (!planDetail) {
        return `<div class="kur-empty small"><i class="fa-solid fa-hand-pointer fa-2x"></i> Pilih salah satu robot di daftar sebelah kiri untuk melihat Lesson Plan secara rinci.</div>`;
    }
    const m = planDetail;

    const asek = m.sub_level_id ? achSekolah.filter(a => a.sub_level_id === m.sub_level_id) : [];
    const aprv = achPrivate.filter(a => a.materi_id === m.id);

    return `
        <div class="kur-detail-head">
            <h3><i class="fa-solid fa-robot"></i> ${escapeHtml(m.title)}</h3>
            <div class="kur-detail-badges">
                ${srcBadge(m.src)}
                <span class="kur-kit"><i class="fa-solid fa-toolbox"></i> ${escapeHtml(m.kitName || '-')}</span>
            </div>
        </div>

        <div class="kur-detail-sec">
            <div class="kur-detail-label"><i class="fa-solid fa-file-lines"></i> Deskripsi &amp; Tujuan</div>
            ${m.desc ? `<div class="kur-pre">${escapeHtml(m.desc)}</div>` : `<div class="kur-empty small">Belum ada deskripsi.</div>`}
        </div>

        ${m.detail ? `
        <div class="kur-detail-sec">
            <div class="kur-detail-label"><i class="fa-solid fa-list-check"></i> Detail Pembelajaran</div>
            <div class="kur-pre">${escapeHtml(m.detail)}</div>
        </div>` : ''}

        <div class="kur-detail-sec">
            <div class="kur-detail-label"><i class="fa-solid fa-trophy"></i> Target Achievement</div>
            ${(asek.length + aprv.length) === 0
                ? `<div class="kur-empty small">Belum ada achievement terdaftar.</div>`
                : [
                    ...asek.map(a => achRow(a, 'skl')),
                    ...aprv.map(a => achRow(a, 'prv'))
                ].join('')}
        </div>

        <div class="kur-detail-sec">
            <div class="kur-detail-label"><i class="fa-solid fa-clock-rotate-left"></i> Riwayat Pertemuan</div>
            ${planHistoryLoading
                ? `<div class="kur-loading inline"><i class="fa-solid fa-circle-notch fa-spin"></i> Memuat riwayat...</div>`
                : planHistoryError
                    ? `<div class="kur-empty small">Gagal memuat riwayat.</div>`
                    : planHistory.length === 0
                        ? `<div class="kur-empty small">Belum pernah diajarkan pada kelas aktif.</div>`
                        : `<div class="kur-history">${planHistory.map(h => `
                            <div class="kur-history-row">
                                <span class="kur-dot ${h.src}"></span>
                                <span class="kur-history-date">${escapeHtml(fmtDate(h.tanggal))}</span>
                                ${h.pertemuanKe ? `<span class="kur-badge num">Pertemuan ${escapeHtml(h.pertemuanKe)}</span>` : ''}
                                <span class="kur-history-class"><i class="fa-solid fa-users"></i> ${escapeHtml(h.kelas)}</span>
                                ${srcBadge(h.src)}
                            </div>`).join('')}</div>`}
        </div>`;
}

function achRow(a, src) {
    return `
    <div class="kur-ach-row">
        <span class="kur-dot ${src}"></span>
        <div>
            <b>${escapeHtml(a.main_achievement || '-')}</b>
            ${a.sub_achievement ? `<small> &rsaquo; ${escapeHtml(a.sub_achievement)}</small>` : ''}
            ${srcBadge(src)}
        </div>
    </div>`;
}

// ==========================================
// 7. RENDER: TAB ON PROGRESS
// ==========================================
function renderProgress() {
    const area = document.getElementById('kur-content');
    if (!area) return;

    if (progressLoading || progressRows === null) {
        area.innerHTML = loadingHTML();
        return;
    }

    let rows = progressRows;
    if (searchQuery) {
        rows = rows.filter(r =>
            r.title.toLowerCase().includes(searchQuery) ||
            r.kelas.toLowerCase().includes(searchQuery) ||
            r.levelKode.toLowerCase().includes(searchQuery)
        );
    }

    if (rows.length === 0) {
        area.innerHTML = emptyBox(searchQuery ? 'Tidak ada riwayat yang cocok dengan pencarian.' : 'Belum ada riwayat pertemuan.');
        return;
    }

    const groups = [];
    rows.forEach(r => {
        let g = groups.find(x => x.tgl === r.tanggal);
        if (!g) { g = { tgl: r.tanggal, items: [] }; groups.push(g); }
        g.items.push(r);
    });

    area.innerHTML = `
        <div class="kur-progress-summary">
            <i class="fa-solid fa-bolt"></i> Menampilkan ${rows.length} pertemuan
            &bull; Tersebar di ${groups.length} hari kegiatan
        </div>
        ${groups.map(g => `
        <div class="kur-day">
            <div class="kur-day-head"><i class="fa-solid fa-calendar-day"></i> ${escapeHtml(fmtDate(g.tgl))}</div>
            ${g.items.map(r => `
            <div class="kur-day-row">
                <div class="kur-day-robot">
                    <i class="fa-solid fa-robot"></i>
                    <b>${escapeHtml(r.title)}</b>
                    ${r.levelKode ? `<span class="kur-badge lvl">${escapeHtml(r.levelKode)}</span>` : ''}
                </div>
                <div class="kur-day-meta">
                    ${srcBadge(r.src)}
                    ${r.pertemuanKe ? `<span class="kur-badge num">Pertemuan ke-${escapeHtml(r.pertemuanKe)}</span>` : ''}
                    <span class="kur-day-class"><i class="fa-solid fa-users"></i> ${escapeHtml(r.kelas)}</span>
                </div>
            </div>`).join('')}
        </div>`).join('')}`;
}

const emptyBox = (msg) => `<div class="kur-empty"><i class="fa-solid fa-folder-open fa-2x"></i> <span>${escapeHtml(msg)}</span></div>`;
const emptyBoxSmall = (msg) => `<div class="kur-empty small">${escapeHtml(msg)}</div>`;

// ==========================================
// 8. STYLES (Modern & Academic Theme)
// ==========================================
function injectStyles() {
    if (document.getElementById('kur-style')) return;
    const style = document.createElement('style');
    style.id = 'kur-style';
    style.textContent = `
        .kur-container { max-width: 1150px; margin: 0 auto; padding-bottom: 60px; animation: kurFade .3s ease; }
        @keyframes kurFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        .kur-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; background: #fff; padding: 18px 22px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,.03); }
        .kur-header-text h2 { margin: 0; font-family: 'Fredoka One', cursive; color: #1e293b; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
        .kur-header-text h2 i { color: #2ecc71; }
        .kur-header-text p { margin: 4px 0 0; color: #64748b; font-size: .88rem; }
        .kur-btn-print { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; padding: 9px 16px; border-radius: 10px; font-weight: 600; font-size: .85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: .2s; }
        .kur-btn-print:hover { background: #2ecc71; color: #fff; border-color: #2ecc71; box-shadow: 0 4px 12px rgba(46,204,113,.3); }

        .kur-sticky-bar { sticky: top; position: sticky; top: 10px; z-index: 20; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; padding: 10px 14px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,.05); }
        .kur-tabs { display: flex; gap: 6px; }
        .kur-tab { border: none; background: transparent; color: #64748b; padding: 9px 15px; font-weight: 700; font-size: .88rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 10px; transition: .2s; }
        .kur-tab:hover { color: #1e874b; background: #f1f5f9; }
        .kur-tab.active { color: #fff; background: #2ecc71; box-shadow: 0 4px 10px rgba(46,204,113,.3); }

        .kur-search-box { display: flex; align-items: center; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 6px 12px; min-width: 260px; transition: .2s; }
        .kur-search-box:focus-within { border-color: #2ecc71; background: #fff; box-shadow: 0 0 0 3px rgba(46,204,113,.15); }
        .kur-search-box i { color: #94a3b8; font-size: .85rem; }
        .kur-search-box input { border: none; background: transparent; outline: none; font-size: .85rem; color: #1e293b; width: 100%; }
        #kur-search-clear { border: none; background: transparent; color: #94a3b8; cursor: pointer; padding: 2px 4px; font-size: .8rem; }
        #kur-search-clear:hover { color: #ef4444; }

        /* Skeleton Loading */
        .kur-skeleton-wrap { background: #fff; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 14px; }
        .kur-skeleton-header { height: 28px; width: 40%; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
        .kur-skeleton-row { height: 50px; width: 100%; background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        .kur-empty { text-align: center; color: #94a3b8; padding: 40px 15px; display: flex; flex-direction: column; gap: 12px; align-items: center; font-size: .95rem; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; }
        .kur-empty.small { padding: 16px; font-size: .85rem; font-style: italic; border: none; background: transparent; }
        .kur-empty.error { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
        .kur-retry-btn { border: 1px solid #fecaca; background: #fff; color: #b91c1c; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 6px; }

        .kur-pill { border: 1px solid #e2e8f0; background: #fff; color: #475569; padding: 9px 16px; border-radius: 12px; font-weight: 700; font-size: .85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: .15s; }
        .kur-pill:hover { border-color: #a7f3d0; color: #1e874b; transform: translateY(-1px); }
        .kur-pill.active { background: #1e874b; border-color: #1e874b; color: #fff; box-shadow: 0 4px 12px rgba(30,135,75,.3); }
        .kur-pill small { background: rgba(0,0,0,.08); padding: 2px 8px; border-radius: 10px; font-size: .72rem; }
        .kur-pill.active small { background: rgba(255,255,255,.25); color: #fff; }

        .kur-tabs-lvl { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }

        /* Syllabus Document Styles */
        .kur-syll-doc { background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,.04); overflow: hidden; padding: 24px; }
        .kur-syll-doc-header { border-bottom: 2px solid #2ecc71; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
        .kur-syll-doc-title h3 { margin: 0; font-family: 'Fredoka One', cursive; color: #1e293b; font-size: 1.25rem; letter-spacing: .3px; }
        .kur-syll-doc-title p { margin: 4px 0 0; color: #64748b; font-size: .88rem; }
        .kur-syll-doc-meta { display: flex; gap: 8px; }
        .kur-syll-chip { background: #f1f5f9; color: #475569; font-size: .75rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; }

        /* Syllabus Kit Cards & Accordion */
        .kur-syll-kit-card { border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 18px; overflow: hidden; background: #fff; transition: .2s; }
        .kur-syll-kit-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,.03); }
        .kur-syll-kit-head { padding: 14px 18px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
        .kur-syll-kit-card.collapsed .kur-syll-kit-head { border-bottom: none; }
        .kur-syll-kit-info { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .kur-syll-kit-num { background: #2ecc71; color: #fff; font-size: .7rem; font-weight: 800; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; }
        .kur-syll-kit-info h4 { margin: 0; color: #1e293b; font-size: 1.05rem; font-weight: 700; }
        .kur-syll-kit-info code { background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-size: .75rem; }
        .kur-syll-kit-action { display: flex; align-items: center; gap: 10px; }
        .kur-syll-badge-count { background: #e2e8f0; color: #475569; font-weight: 700; font-size: .75rem; padding: 3px 10px; border-radius: 12px; }
        .kur-syll-arrow { transition: transform .2s ease; color: #64748b; }
        .kur-syll-kit-card.collapsed .kur-syll-arrow { transform: rotate(-90deg); }

        .kur-syll-kit-body { padding: 18px; }
        .kur-syll-kit-desc { background: #ecfdf5; border-left: 4px solid #2ecc71; padding: 8px 12px; color: #065f46; font-size: .85rem; border-radius: 0 8px 8px 0; margin-bottom: 14px; }

        /* Syllabus Table */
        .kur-table-responsive { overflow-x: auto; margin-bottom: 14px; }
        .kur-syll-table { width: 100%; border-collapse: collapse; text-align: left; font-size: .88rem; }
        .kur-syll-table th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 10px 12px; border-bottom: 2px solid #cbd5e1; font-size: .8rem; text-transform: uppercase; }
        .kur-syll-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; color: #334155; }
        .kur-syll-table tr:hover td { background: #f8fafc; }
        .kur-syll-materi-title { font-weight: 700; color: #1e293b; font-size: .92rem; margin-bottom: 4px; }
        .kur-syll-desc { color: #475569; font-size: .84rem; line-height: 1.4; }
        .kur-syll-detail-small { color: #64748b; font-size: .78rem; margin-top: 4px; background: #f8fafc; padding: 4px 8px; border-radius: 6px; }

        .kur-ach-list { list-style: none; margin: 0; padding: 0; }
        .kur-ach-list li { font-size: .8rem; color: #047857; margin-bottom: 4px; display: flex; align-items: flex-start; gap: 6px; }
        .kur-ach-list li i { color: #2ecc71; margin-top: 3px; font-size: .75rem; }

        .kur-syll-global-ach { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; margin-top: 12px; }
        .kur-ach-title { font-size: .78rem; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 8px; }
        .kur-ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px; }

        .kur-kit { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 3px 10px; border-radius: 20px; font-size: .75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
        .kur-kit.warn { background: #fffbeb; color: #b45309; border-color: #fcd34d; }

        .kur-badge { padding: 2px 8px; border-radius: 8px; font-size: .68rem; font-weight: 800; text-transform: uppercase; display: inline-block; }
        .kur-badge.skl { background: #dbeafe; color: #1e40af; }
        .kur-badge.prv { background: #fef3c7; color: #92400e; }
        .kur-badge.off { background: #fee2e2; color: #991b1b; }
        .kur-badge.lvl { background: #ecfdf5; color: #047857; }
        .kur-badge.num { background: #f1f5f9; color: #475569; text-transform: none; }

        .kur-ach-row { display: flex; align-items: flex-start; gap: 8px; font-size: .83rem; color: #334155; }
        .kur-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
        .kur-dot.skl { background: #3b82f6; }
        .kur-dot.prv { background: #f59e0b; }

        .kur-text-muted { color: #94a3b8; font-size: .8rem; }
        .text-center { text-align: center; }
        .font-bold { font-weight: 700; }

        /* Lesson Plan View */
        .kur-plan-wrap { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; align-items: start; }
        .kur-plan-list { list-style: none; margin: 0; padding: 0; max-height: 600px; overflow-y: auto; padding-right: 4px; }
        .kur-plan-row { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: .15s; }
        .kur-plan-row:hover { border-color: #a7f3d0; background: #f6fef9; }
        .kur-plan-row.selected { border-color: #1e874b; background: #ecfdf5; box-shadow: 0 2px 8px rgba(30,135,75,.15); }
        .kur-num { min-width: 26px; height: 26px; background: #f1f5f9; color: #475569; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .8rem; flex-shrink: 0; }
        .kur-plan-row.selected .kur-num { background: #1e874b; color: #fff; }
        .kur-plan-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .kur-plan-title { font-weight: 700; color: #1e293b; font-size: .9rem; }
        .kur-plan-kit { color: #64748b; font-size: .78rem; }

        .kur-plan-detail { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,.03); }
        .kur-detail-head { border-bottom: 2px solid #2ecc71; padding-bottom: 12px; margin-bottom: 16px; }
        .kur-detail-head h3 { margin: 0 0 6px; font-family: 'Fredoka One', cursive; color: #1e293b; font-size: 1.2rem; }
        .kur-detail-badges { display: flex; gap: 8px; flex-wrap: wrap; }

        .kur-detail-sec { margin-bottom: 16px; }
        .kur-detail-label { font-size: .8rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .kur-detail-label i { color: #2ecc71; }
        .kur-pre { background: #f8fafc; border: 1px solid #f1f5f9; padding: 10px 12px; border-radius: 10px; font-size: .88rem; color: #334155; white-space: pre-wrap; line-height: 1.45; }

        .kur-history { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
        .kur-history-row { display: flex; align-items: center; gap: 8px; font-size: .82rem; padding: 6px 10px; background: #f8fafc; border-radius: 8px; }
        .kur-history-date { font-weight: 700; color: #1e293b; }
        .kur-history-class { color: #64748b; }

        /* On Progress */
        .kur-progress-summary { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-weight: 700; font-size: .85rem; padding: 12px 16px; border-radius: 12px; margin-bottom: 16px; }
        .kur-day { margin-bottom: 20px; }
        .kur-day-head { font-weight: 700; color: #1e874b; font-size: .9rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
        .kur-day-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; transition: .15s; }
        .kur-day-row:hover { border-color: #a7f3d0; background: #f6fef9; }
        .kur-day-robot { display: flex; align-items: center; gap: 10px; font-size: .92rem; color: #1e293b; flex-wrap: wrap; }
        .kur-day-robot i { color: #2ecc71; }
        .kur-day-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .kur-day-class { color: #64748b; font-size: .82rem; }

        /* Print Styles */
        @media print {
            body { background: #fff !important; color: #000 !important; }
            .kur-header-actions, .kur-sticky-bar, .kur-tabs-lvl, .kur-syll-arrow { display: none !important; }
            .kur-syll-doc { border: none !important; box-shadow: none !important; padding: 0 !important; }
            .kur-syll-kit-card { border: 1px solid #ccc !important; break-inside: avoid; }
            .kur-syll-kit-card.collapsed .kur-syll-kit-body { display: block !important; }
            .kur-syll-table th { background: #eee !important; color: #000 !important; }
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            .kur-plan-wrap { grid-template-columns: 1fr; }
            .kur-sticky-bar { flex-direction: column; align-items: stretch; }
            .kur-search-box { min-width: 100%; }
            .kur-syll-doc-header { flex-direction: column; align-items: flex-start; }
            .kur-syll-table th, .kur-syll-table td { padding: 8px 6px; font-size: .8rem; }
        }
    `;
    document.head.appendChild(style);
}

