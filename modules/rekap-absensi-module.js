/**
 * Project: Robopanda Client (Public/Student)
 * File: modules/rekap-absensi-module.js
 * Version: 1.0 - Rekap Absensi Sekolah (Tampil-saja, Tanpa Export)
 *
 * Description:
 *  Laporan absensi & pembelajaran & materi/silabus terajarkan per kelas,
 *  mengikuti semester & tahun ajaran aktif, dibuka dari Gallery Module
 *  melalui dynamic import agar kinerja modul yang ada tidak terganggu.
 *
 * Catatan: Hanya menampilkan data sesuai yang ada di database (read-only).
 *  Tidak ada agregasi/ringkasan, tidak ada fitur export/cetak.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------
// STATE
// ---------------------------------------------------------------
let app = {
    userProfile: null,      // profil dari user_profiles (role mapping)
    onBack: null,           // callback kembali ke gallery
    activeClass: null,      // { id, name, jadwal, level, schoolName }
    students: [],           // [{ id, name, grade }] siswa kelas aktif
    pertemuanList: [],      // [{ id, tanggal, judul, uraian }] urut ascending
    attendance: [],         // baris attendance (semua pertemuan) untuk kelas ini
    activeTab: 'absensi'    // tab yang sedang tampil
};

// ---------------------------------------------------------------
// 1. INITIALIZATION
// ---------------------------------------------------------------
export async function init(canvas, opts = {}) {
    app.userProfile = opts.userProfile || { role: 'guest' };
    app.onBack = opts.onBack || null;
    app.activeClass = null;
    app.pertemuanList = [];
    app.activeTab = 'absensi';

    injectStyles();

    canvas.innerHTML = `
        <div class="rk-container">
            <div class="rk-top">
                <h2>📋 Rekapitulasi Absensi</h2>
                <button id="rk-back" class="rk-btn rk-btn-ghost"><i class="fa-solid fa-arrow-left"></i> Kembali</button>
            </div>

            <section class="rk-card rk-search">
                <div class="rk-filter-grid">
                    <div class="rk-field">
                        <label>Tahun Ajaran</label>
                        <select id="rk-year" class="rk-input"></select>
                    </div>
                    <div class="rk-field">
                        <label>Semester</label>
                        <select id="rk-semester" class="rk-input"></select>
                    </div>
                    <div class="rk-field">
                        <label>Pilih Kelas</label>
                        <select id="rk-class" class="rk-input"></select>
                    </div>
                    <div class="rk-field rk-field-btn">
                        <button id="rk-load" class="rk-btn rk-btn-primary" style="width:100%;">
                            <i class="fa-solid fa-magnifying-glass"></i> TAMPILKAN
                        </button>
                    </div>
                </div>
            </section>

            <div class="rk-card rk-report-header" id="rk-report-header" style="display:none; text-align:center;">
                <h2 id="rk-school" style="font-family:'Fredoka One', cursive; color:#4d97ff; margin:0; font-size:1.2rem;">-</h2>
                <div class="rk-meta" id="rk-meta-year"></div>
                <div class="rk-meta rk-meta-bold" id="rk-meta-class"></div>
            </div>

            <div class="rk-card rk-control" id="rk-control" style="display:none;">
                <div class="rk-tabs">
                    <button class="rk-tab active" id="rk-tab-absensi">Absensi</button>
                    <button class="rk-tab" id="rk-tab-pembelajaran">Pembelajaran</button>
                    <button class="rk-tab" id="rk-tab-materi">Silabus/Materi Terajarkan</button>
                </div>
                <div class="rk-range">
                    <label>Rentang:</label>
                    <select id="rk-range-start" class="rk-input-mini"></select>
                    <span>s/d</span>
                    <select id="rk-range-end" class="rk-input-mini"></select>
                </div>
            </div>

            <section class="rk-section" id="rk-section-absensi" style="display:none;">
                <table class="rk-table" id="rk-table-absensi"></table>
            </section>
            <section class="rk-section" id="rk-section-pembelajaran" style="display:none;">
                <table class="rk-table" id="rk-table-pembelajaran"></table>
            </section>
            <section class="rk-section" id="rk-section-materi" style="display:none;">
                <table class="rk-table" id="rk-table-materi"></table>
            </section>
        </div>`;

    setupEvents();
    await loadAcademicYears();
}

// ---------------------------------------------------------------
// 2. DROPDOWN CHAIN (Tahun Ajaran -> Semester -> Kelas)
// ---------------------------------------------------------------
async function loadAcademicYears() {
    const sel = document.getElementById('rk-year');
    const { data, error } = await supabase
        .from('academic_years')
        .select('id, year, is_active')
        .order('year', { ascending: false });

    if (error) return alert('Gagal memuat tahun ajaran: ' + error.message);

    sel.innerHTML = (data || []).map(y =>
        `<option value="${y.id}" ${y.is_active ? 'selected' : ''}>${escapeHtml(y.year)}${y.is_active ? ' (Aktif)' : ''}</option>`
    ).join('');

    await isiDropdownSemester();
}

async function isiDropdownSemester() {
    const yid = document.getElementById('rk-year').value;
    const selSem = document.getElementById('rk-semester');
    selSem.innerHTML = '';
    document.getElementById('rk-class').innerHTML = '';
    hideReport(); // laporan lama ikut disembunyikan

    if (!yid) return;

    const { data, error } = await supabase
        .from('semesters')
        .select('id, name, is_active')
        .eq('academic_year_id', yid)
        .order('name');

    if (error) return alert('Gagal memuat semester: ' + error.message);

    selSem.innerHTML = (data || []).map(s =>
        `<option value="${s.id}" ${s.is_active ? 'selected' : ''}>${escapeHtml(s.name)}${s.is_active ? ' (Aktif)' : ''}</option>`
    ).join('');

    await isiDropdownKelas();
}

async function isiDropdownKelas() {
    const sid = document.getElementById('rk-semester').value;
    const selClass = document.getElementById('rk-class');
    selClass.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>';

    if (!sid) return;

    let query = supabase
        .from('classes')
        .select('id, name, jadwal, level, schools(name)')
        .eq('semester_id', sid)
        .order('name');

    // Role PIC dibatasi ke sekolahnya (mapping user_profiles)
    if (app.userProfile.role === 'pic' && app.userProfile.school_id) {
        query = query.eq('school_id', app.userProfile.school_id);
    }

    const { data, error } = await query;
    if (error) return alert('Gagal memuat kelas: ' + error.message);

    selClass.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' +
        (data || []).map(c =>
            `<option value="${c.id}" data-name="${escapeHtml(c.name)}" data-jadwal="${escapeHtml(c.jadwal || '')}" data-level="${escapeHtml(c.level || '')}" data-school="${escapeHtml(c.schools?.name || '')}">
                ${escapeHtml(c.name)}${c.schools?.name ? ' (' + escapeHtml(c.schools.name) + ')' : ''}
            </option>`
        ).join('');

    hideReport();
}

// ---------------------------------------------------------------
// 3. TAMPILKAN (muat header + rentang pertemuan + tab aktif)
// ---------------------------------------------------------------
async function handleLoadRekap() {
    const selClass = document.getElementById('rk-class');
    const cls = selClass.value;
    if (!cls) return alert('Pilih kelas dulu.');

    const opt = selClass.selectedOptions[0];
    app.activeClass = {
        id: cls,
        name: opt.dataset.name || '',
        jadwal: opt.dataset.jadwal || '',
        level: opt.dataset.level || '',
        schoolName: opt.dataset.school || ''
    };

    fillReportHeader();
    document.getElementById('rk-range-start').innerHTML = '<option value="-1">Memuat...</option>';
    document.getElementById('rk-range-end').innerHTML = '<option value="-1">Memuat...</option>';
    await loadClassData();

    // Default ke tab Absensi
    app.activeTab = 'absensi';
    showSection('rk-section-absensi');
    updateActiveBtn('rk-tab-absensi');
    renderAbsensiWorksheet();
}

// Muat semua data kelas sekaligus (siswa, pertemuan, absensi) lalu render di client
async function loadClassData() {
    const [rStudents, rPert, rAtt] = await Promise.all([
        supabase.from('students').select('id, name, grade').eq('class_id', app.activeClass.id).eq('is_active', true).order('name'),
        supabase.from('pertemuan_kelas').select('id, tanggal, materi(title, description, detail)').eq('class_id', app.activeClass.id).order('tanggal', { ascending: true }),
        supabase.from('attendance').select('id, status, sikap, fokus, achievement, student_id, pertemuan_id, student:student_id(name, grade), pertemuan:pertemuan_id!inner(tanggal, materi:materi_id(title))').eq('pertemuan.class_id', app.activeClass.id)
    ]);

    if (rStudents.error) return alert('Gagal memuat siswa: ' + rStudents.error.message);
    if (rPert.error) return alert('Gagal memuat pertemuan: ' + rPert.error.message);
    if (rAtt.error) return alert('Gagal memuat absensi: ' + rAtt.error.message);

    app.students = (rStudents.data || []).map(s => ({ id: s.id, name: s.name || '', grade: s.grade || '' }));
    app.pertemuanList = (rPert.data || []).map(p => ({
        id: p.id,
        tanggal: p.tanggal,
        judul: p.materi?.title || '(tanpa judul)',
        uraian: (p.materi?.description || p.materi?.detail || '').trim()
    }));
    app.attendance = rAtt.data || [];

    // Gabungkan siswa yang tercatat di absensi tapi tidak ada di daftar aktif
    const seen = new Map(app.students.map(s => [s.id, s]));
    app.attendance.forEach(r => {
        if (r.student && !seen.has(r.student_id)) {
            seen.set(r.student_id, { id: r.student_id, name: r.student.name || '', grade: r.student.grade || '' });
        }
    });
    app.students = [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));

    populateRange();
}

function fillReportHeader() {
    const yearOpt = document.getElementById('rk-year').selectedOptions[0];
    const semOpt = document.getElementById('rk-semester').selectedOptions[0];

    document.getElementById('rk-school').textContent = app.activeClass.schoolName || 'Sekolah';
    document.getElementById('rk-meta-year').textContent =
        `${yearOpt ? yearOpt.textContent : '-'}  |  ${semOpt ? semOpt.textContent : '-'}`;
    document.getElementById('rk-meta-class').textContent =
        `Kelas ${app.activeClass.name}  |  Jadwal: ${app.activeClass.jadwal || '-'}`;

    document.getElementById('rk-report-header').style.display = 'block';
    document.getElementById('rk-control').style.display = 'block';
}

function hideReport() {
    document.getElementById('rk-report-header').style.display = 'none';
    document.getElementById('rk-control').style.display = 'none';
    ['rk-section-absensi', 'rk-section-pembelajaran', 'rk-section-materi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    app.students = [];
    app.pertemuanList = [];
    app.attendance = [];
}

// ---------------------------------------------------------------
// 4. RENTANG PERTEMUAN (select awal s/d akhir)
// ---------------------------------------------------------------
function populateRange() {
    const opts = '<option value="-1">Semua</option>' +
        app.pertemuanList.map((p, i) =>
            `<option value="${i}">${fmtDate(p.tanggal)} • ${escapeHtml(p.judul)}</option>`
        ).join('');

    document.getElementById('rk-range-start').innerHTML = opts;
    document.getElementById('rk-range-end').innerHTML = opts;
}

// Mengembalikan daftar pertemuan dalam rentang yang dipilih (Semua jika -1/-1)
function getRangePertemuanList() {
    const start = parseInt(document.getElementById('rk-range-start').value, 10);
    const end = parseInt(document.getElementById('rk-range-end').value, 10);

    if (start === -1 && end === -1) return app.pertemuanList.slice();

    let i0 = start === -1 ? 0 : start;
    let i1 = end === -1 ? app.pertemuanList.length - 1 : end;
    if (i1 < i0) { const t = i0; i0 = i1; i1 = t; }

    return app.pertemuanList.slice(i0, i1 + 1);
}

// ---------------------------------------------------------------
// 5. TAB ABSENSI (data attendance sesuai database, apa adanya)
// ---------------------------------------------------------------
async function loadRekapAbsensi() {
    const table = document.getElementById('rk-table-absensi');
    const ids = getRangePertemuanIds();

    let query = supabase
        .from('attendance')
        .select('id, tanggal, status, sikap, fokus, achievement, student:student_id(name, grade), pertemuan:pertemuan_id!inner(tanggal, materi:materi_id(title))')
        .eq('pertemuan.class_id', app.activeClass.id)
        .order('tanggal', { ascending: true });

    if (ids) query = query.in('pertemuan_id', ids);

    const { data, error } = await query;
    if (error) return alert('Gagal memuat data absensi: ' + error.message);

    const rows = (data || []).slice().sort((a, b) =>
        (a.tanggal + '').localeCompare(b.tanggal + '') ||
        String(a.student?.name || '').localeCompare(String(b.student?.name || ''))
    );

    if (!rows.length) {
        table.innerHTML = `<thead><tr><th>Absensi</th></tr></thead>
            <tbody><tr><td class="rk-empty">Belum ada data absensi untuk kelas/rentang ini.</td></tr></tbody>`;
        return;
    }

    table.innerHTML = `<thead><tr>
        <th width="40">No</th>
        <th>Tanggal</th>
        <th>Nama Siswa</th>
        <th>Materi</th>
        <th width="70">Status</th>
        <th width="70">Sikap</th>
        <th width="70">Fokus</th>
        <th>Keterangan</th>
    </tr></thead><tbody>` +
        rows.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td style="white-space:nowrap;">${escapeHtml(fmtDateLong(r.tanggal))}</td>
            <td>${escapeHtml(r.student?.name || '-')}${r.student?.grade ? ' <span class="rk-tag">' + escapeHtml(r.student.grade) + '</span>' : ''}</td>
            <td>${escapeHtml(r.pertemuan?.materi?.title || '-')}</td>
            <td class="rk-center">${escapeHtml(r.status ?? '-')}</td>
            <td class="rk-center">${escapeHtml(r.sikap ?? '-')}</td>
            <td class="rk-center">${escapeHtml(r.fokus ?? '-')}</td>
            <td>${escapeHtml(r.achievement || '-')}</td>
        </tr>`).join('') + `</tbody>`;
}

// ---------------------------------------------------------------
// 6. TAB PEMBELAJARAN (evaluasi sikap/fokus per catatan, apa adanya)
// ---------------------------------------------------------------
async function loadRekapPembelajaran() {
    const table = document.getElementById('rk-table-pembelajaran');
    const ids = getRangePertemuanIds();

    let query = supabase
        .from('attendance')
        .select('id, tanggal, status, sikap, fokus, achievement, student:student_id(name, grade), pertemuan:pertemuan_id!inner(tanggal, materi:materi_id(title))')
        .eq('pertemuan.class_id', app.activeClass.id)
        .order('tanggal', { ascending: true });

    if (ids) query = query.in('pertemuan_id', ids);

    const { data, error } = await query;
    if (error) return alert('Gagal memuat data pembelajaran: ' + error.message);

    const rows = (data || []).slice().sort((a, b) =>
        String(a.student?.name || '').localeCompare(String(b.student?.name || '')) ||
        (a.tanggal + '').localeCompare(b.tanggal + '')
    );

    if (!rows.length) {
        table.innerHTML = `<thead><tr><th>Pembelajaran</th></tr></thead>
            <tbody><tr><td class="rk-empty">Belum ada data pembelajaran untuk kelas/rentang ini.</td></tr></tbody>`;
        return;
    }

    table.innerHTML = `<thead><tr>
        <th width="40">No</th>
        <th>Nama Siswa</th>
        <th>Tanggal</th>
        <th>Materi</th>
        <th width="70">Sikap</th>
        <th width="70">Fokus</th>
        <th>Keterangan</th>
    </tr></thead><tbody>` +
        rows.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(r.student?.name || '-')}${r.student?.grade ? ' <span class="rk-tag">' + escapeHtml(r.student.grade) + '</span>' : ''}</td>
            <td style="white-space:nowrap;">${escapeHtml(fmtDateLong(r.tanggal))}</td>
            <td>${escapeHtml(r.pertemuan?.materi?.title || '-')}</td>
            <td class="rk-center">${escapeHtml(r.sikap ?? '-')}</td>
            <td class="rk-center">${escapeHtml(r.fokus ?? '-')}</td>
            <td>${escapeHtml(r.achievement || '-')}</td>
        </tr>`).join('') + `</tbody>`;
}

// ---------------------------------------------------------------
// 7. TAB SILABUS / MATERI TERAJARKAN (satu baris per pertemuan)
// ---------------------------------------------------------------
async function loadRekapMateri() {
    const table = document.getElementById('rk-table-materi');
    const ids = getRangePertemuanIds();

    if (!app.pertemuanList.length) {
        table.innerHTML = `<thead><tr><th>Materi</th></tr></thead>
            <tbody><tr><td class="rk-empty">Belum ada pertemuan yang tercatat.</td></tr></tbody>`;
        return;
    }

    // Jika rentang dipilih, ambil potongan daftar pertemuan
    let pSlice = app.pertemuanList;
    if (ids) pSlice = app.pertemuanList.filter(p => ids.includes(p.id));

    if (!pSlice.length) {
        table.innerHTML = `<thead><tr><th>Materi</th></tr></thead>
            <tbody><tr><td class="rk-empty">Belum ada materi yang tercatat dalam rentang ini.</td></tr></tbody>`;
        return;
    }

    const { data: pertemuan, error } = await supabase
        .from('pertemuan_kelas')
        .select('id, tanggal, materi_id, materi(title, description, detail)')
        .in('id', pSlice.map(p => p.id));

    if (error) return alert('Gagal memuat data: ' + error.message);

    const rows = (pertemuan || []).map(p => ({
        id: p.id,
        tanggal: p.tanggal,
        judul: p.materi?.title || '(tanpa judul)',
        uraian: (p.materi?.description || p.materi?.detail || '').trim()
    }));
    rows.sort((a, b) => pSlice.findIndex(x => x.id === a.id) - pSlice.findIndex(x => x.id === b.id));

    table.innerHTML = `<thead><tr>
        <th width="40">No</th>
        <th style="text-align:left;">Tgl</th>
        <th style="text-align:left;">Nama Materi</th>
        <th style="text-align:left;">Uraian singkat</th>
    </tr></thead><tbody>` +
        rows.map((r, i) => `<tr>
            <td>${i + 1}</td>
            <td style="white-space:nowrap;">${escapeHtml(fmtDateLong(r.tanggal))}</td>
            <td>${escapeHtml(r.judul)}</td>
            <td>${escapeHtml(r.uraian) || '-'}</td>
        </tr>`).join('') + `</tbody>`;
}

// ---------------------------------------------------------------
// 8. UTILS & EVENTS
// ---------------------------------------------------------------
function fmtDate(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function fmtDateLong(d) {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function showSection(id) {
    ['rk-section-absensi', 'rk-section-pembelajaran', 'rk-section-materi'].forEach(sid => {
        const el = document.getElementById(sid);
        if (el) el.style.display = (sid === id) ? 'block' : 'none';
    });
}

function updateActiveBtn(btnId) {
    document.querySelectorAll('.rk-tab').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.add('active');
}

function setupEvents() {
    document.getElementById('rk-back').addEventListener('click', () => {
        if (typeof app.onBack === 'function') app.onBack();
        else if (window.loadModule) window.loadModule('gallery-module');
    });

    document.getElementById('rk-year').addEventListener('change', isiDropdownSemester);
    document.getElementById('rk-semester').addEventListener('change', isiDropdownKelas);
    document.getElementById('rk-load').addEventListener('click', handleLoadRekap);

    document.getElementById('rk-tab-absensi').addEventListener('click', async () => {
        app.activeTab = 'absensi';
        updateActiveBtn('rk-tab-absensi');
        showSection('rk-section-absensi');
        await loadRekapAbsensi();
    });
    document.getElementById('rk-tab-pembelajaran').addEventListener('click', async () => {
        app.activeTab = 'pembelajaran';
        updateActiveBtn('rk-tab-pembelajaran');
        showSection('rk-section-pembelajaran');
        await loadRekapPembelajaran();
    });
    document.getElementById('rk-tab-materi').addEventListener('click', async () => {
        app.activeTab = 'materi';
        updateActiveBtn('rk-tab-materi');
        showSection('rk-section-materi');
        await loadRekapMateri();
    });

    // Rentang berubah -> muat ulang tab aktif (jika laporan sedang tampil)
    const reloadActiveTab = async () => {
        if (!app.activeClass) return;
        if (app.activeTab === 'absensi') await loadRekapAbsensi();
        else if (app.activeTab === 'pembelajaran') await loadRekapPembelajaran();
        else if (app.activeTab === 'materi') await loadRekapMateri();
    };
    document.getElementById('rk-range-start').addEventListener('change', reloadActiveTab);
    document.getElementById('rk-range-end').addEventListener('change', reloadActiveTab);
}

// ---------------------------------------------------------------
// 9. STYLES (scoped rk- agar tidak bertabrakan dengan modul lain)
// ---------------------------------------------------------------
function injectStyles() {
    if (document.getElementById('rk-css')) return;
    const s = document.createElement('style');
    s.id = 'rk-css';
    s.textContent = `
        .rk-container { max-width: 1000px; margin: 0 auto; padding: 12px; font-family: inherit; color: #1e293b; }
        .rk-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
        .rk-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
        .rk-top h2 { margin: 0; font-size: 1.15rem; color: #0f172a; }
        .rk-btn { border: none; border-radius: 10px; padding: 8px 16px; font-size: .8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .rk-btn-ghost { background: #f1f5f9; color: #334155; }
        .rk-btn-ghost:hover { background: #e2e8f0; }
        .rk-btn-primary { background: #2ecc71; color: #fff; box-shadow: 0 4px 10px rgba(46,204,113,.3); padding: 9px 16px; }
        .rk-btn-primary:hover { background: #27ae60; }
        .rk-filter-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: end; }
        .rk-field label { display: block; font-size: .72rem; font-weight: 700; color: #475569; margin-bottom: 3px; }
        .rk-input { width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: .82rem; background: #fff; outline: none; }
        .rk-meta { font-size: .85rem; color: #555; margin-top: 4px; }
        .rk-meta-bold { font-weight: 700; color: #334155; }
        .rk-control { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; }
        .rk-tabs { display: flex; gap: 10px; flex-wrap: wrap; }
        .rk-tab { padding: 7px 14px; font-size: .8rem; font-weight: 700; color: #94a3b8; background: none; border: none; border-radius: 8px; cursor: pointer; }
        .rk-tab.active { color: #fff; background: #2ecc71; box-shadow: 0 3px 8px rgba(46,204,113,.35); }
        .rk-range { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: .78rem; color: #475569; }
        .rk-input-mini { padding: 6px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: .78rem; max-width: 220px; background: #fff; }
        .rk-section { overflow-x: auto; }
        .rk-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; font-size: .8rem; }
        .rk-table th, .rk-table td { border: 1px solid #e2e8f0; padding: 7px 9px; text-align: center; }
        .rk-table th { background: #f8fafc; color: #334155; font-weight: 700; }
        .rk-table td { text-align: left; }
        .rk-table td.rk-center { text-align: center; }
        .rk-tag { display: inline-block; background: #eef2ff; color: #4f46e5; font-size: .68rem; font-weight: 700; padding: 1px 6px; border-radius: 999px; margin-left: 4px; }
        .rk-empty { padding: 24px; text-align: center; color: #94a3b8; }
        @media (max-width: 720px) {
            .rk-control { flex-direction: column; align-items: stretch; }
            .rk-range { justify-content: flex-start; }
        }
    `;
    document.head.appendChild(s);
}