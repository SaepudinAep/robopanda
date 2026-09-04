/**
 * Project: Robopanda Client (Public/Student)
 * File: modules/gallery-module.js
 * Version: 6.4 - Final (30% Logo + Instagram Link)
 * Format: Plain Text (Anti-Crash Optimized)
 */

import { supabase } from '../assets/js/config.js';
import { escapeHtml } from '../assets/js/utils.js';

// Client Supabase singleton dibagikan dari config.js

// --- 1. CONFIGURATION ---
const LOGO_B64 = 'aHR0cHM6Ly9yZXMuY2xvdWRpbmFyeS5jb20vZG1tNmF2dHhkL2ltYWdlL3VwbG9hZC9Sb2JvcGFuZGEtRWR1Y2F0aW9uX3p3eDBibS5wbmc=';

const CONFIG = {
    // [BRANDING 45% SOLID]
    // w_0.45   : Logo Besar (45% dari lebar foto)
    // o_100    : Solid/Jelas (Tidak transparan)
    // e_shadow:50 : Bayangan agar logo 'pop-up'
    WATERMARK: `l_fetch:${LOGO_B64}/e_shadow:50,fl_layer_apply,g_south_east,x_30,y_30,w_0.45,o_100`,
    
    TRANSFORM: {
        GRID: 'w_250,q_auto,f_auto',       // Thumbnail (Polos, Ringan)
        MODAL: 'w_800,q_auto:eco,f_auto',  // Preview (Logo 30% Proporsional)
        HD: 'w_1280,q_auto,f_auto'         // Download (Logo 30% Proporsional)
    },
    PLACEHOLDER: 'https://placehold.co/800x600?text=Gagal+Memuat'
};

let userProfile = null;
let currentContext = 'school'; 
let activeClassId = null;      
let activeSessionId = null;    
let activeTab = 'media';       
let rawGalleryData = []; 
let rekapContainer = null;  // referensi container untuk modul Rekap Absensi 

// [SEMESTER] Dropdown semester terdaftar: daftar kelas wajib mengikuti semester terpilih.
let gallerySemesters = [];     // cache semester dari tabel semesters {id, name, is_active}
let activeSemesterId = null;   // semester terpilih pada filter Gallery

// --- 2. INITIALIZATION ---
export async function init(container, profileFromIndex) {
    userProfile = profileFromIndex || { role: 'guest' };
    rekapContainer = container; // simpan referensi untuk modul rekap
    injectStyles();
    injectJSZip(); 
    
    const privilegedRoles = ['super_admin', 'teacher', 'pic'];
    if (privilegedRoles.includes(userProfile.role)) {
        currentContext = 'school';
    } else {
        currentContext = userProfile.class_private_id && !userProfile.class_id ? 'private' : 'school';
    }

    renderLayout(container);
    await loadClassesOrGroups(); 
}

// --- 3. UTILITIES ---
const utils = {
    urlToId: (url) => {
        const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        return m ? m[1] : '';
    },
    getTransformUrl: (url, type = 'GRID', withWatermark = false) => {
        if (!url.includes('cloudinary.com')) return url;
        const transform = CONFIG.TRANSFORM[type];
        
        // Logika: Thumbnail (GRID) SELALU polos. Modal/HD pakai Watermark.
        const wm = (withWatermark && type !== 'GRID') ? `,${CONFIG.WATERMARK}` : '';
        
        return url.replace('/upload/', `/upload/${transform}${wm}/`);
    },
    getSystemCaption: (index) => {
        const select = document.getElementById('session-select');
        if (!select || select.selectedIndex === 0) return `robopanda_img_${index + 1}`;
        const [rawDate, rawMateri] = select.options[select.selectedIndex].text.split(' : ');
        return `robopanda_${(rawDate||'').trim()}_${(rawMateri||'').trim()}_${index + 1}`;
    },
    getSocialCaption: () => {
        const select = document.getElementById('session-select');
        let robotName = "Robot Keren";
        if (select && select.selectedIndex > 0) {
            const parts = select.options[select.selectedIndex].text.split(' : ');
            if (parts.length > 1) robotName = parts[1].trim();
        }
        // [UPDATE] Link Instagram ditambahkan di sini
        return `🤖 Project Keren: ${robotName}\n\nLihat nih hasil karya belajar hari ini! Seru banget merakit dan memprogram robot sendiri. 🎉\n\nPenasaran sama robot lainnya? Cek Instagram kami:\n📸 https://instagram.com/robopandarobotic\n\n#Robopanda #CodingAnak #RobotikaIndonesia`;
    }
};

// --- 4. DATA FETCHING ---
async function loadClassesOrGroups() {
    const classSelect = document.getElementById('class-select');
    const wrapper = document.getElementById('class-filter-wrapper');
    if (!classSelect) return;

    if (userProfile.role === 'student') {
        wrapper.style.display = 'none';
        activeClassId = currentContext === 'school' ? userProfile.class_id : userProfile.class_private_id;
        if (activeClassId) await loadSessions();
        return;
    }

    wrapper.style.display = 'block';
    await ensureSemesterFilterVisible(); // [SEMESTER] dropdown semester siap (default: semester aktif) sebelum kelas diisi
    classSelect.innerHTML = '<option disabled selected>Memuat...</option>';

    const table = currentContext === 'school' ? 'classes' : 'class_private';
    const selectStr = currentContext === 'school' ? 'id, name, schools(name)' : 'id, name, group_id';
    
    let query = supabase.from(table).select(selectStr);
    // [SEMESTER] kelas disaring mengikuti semester terpilih (hanya tabel classes yang terikat semester)
    if (currentContext === 'school' && activeSemesterId) query = query.eq('semester_id', activeSemesterId);
    if (userProfile.role === 'pic') {
        const col = currentContext === 'school' ? 'school_id' : 'group_id';
        const val = currentContext === 'school' ? userProfile.school_id : userProfile.group_id;
        query = query.eq(col, val);
    }

    const { data } = await query.order('name');
    if (data) {
        classSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
            data.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.schools?.name ? ` (${escapeHtml(c.schools.name)})` : ''}</option>`).join('');
    }
}

// --- 4a. FILTER SEMESTER TERDAFTAR (semester aktif selalu urut paling atas) ---
async function loadSemesterOptions() {
    const { data, error } = await supabase.from('semesters').select('id, name, is_active');
    if (error || !data) {
        console.warn('[Gallery] Gagal memuat semester:', error?.message || 'tidak ada data');
        gallerySemesters = [];
        renderSemesterOptions();
        return;
    }
    gallerySemesters = data;
    // [UX] Default: langsung pilih semester aktif agar user tidak perlu memilih ulang
    if (!activeSemesterId) {
        const aktif = gallerySemesters.find(s => s.is_active === true);
        if (aktif) activeSemesterId = aktif.id;
    }
    renderSemesterOptions();
}

function renderSemesterOptions() {
    const semSelect = document.getElementById('semester-select');
    if (!semSelect) return;
    if (!gallerySemesters.length) {
        semSelect.innerHTML = '<option value="" disabled selected>-- Semester tidak tersedia --</option>';
        return;
    }
    // [UX] Semester aktif urut PALING ATAS semua, sisanya urut nama (Semester 1 -> Semester 2)
    const sorted = [...gallerySemesters].sort((a, b) =>
        (b.is_active === true) - (a.is_active === true) ||
        String(a.name).localeCompare(String(b.name))
    );
    semSelect.innerHTML = '<option value="" disabled ' + (activeSemesterId ? '' : 'selected') + '>-- Pilih Semester --</option>' +
        sorted.map(s => `<option value="${s.id}" ${s.id === activeSemesterId ? 'selected' : ''}>${escapeHtml(s.name)}${s.is_active ? ' (Aktif)' : ''}</option>`).join('');
}

async function ensureSemesterFilterVisible() {
    const semWrapper = document.getElementById('semester-filter-wrapper');
    if (!semWrapper) return;
    if (currentContext !== 'school') { semWrapper.style.display = 'none'; return; } // kelas privat tidak terikat semester
    semWrapper.style.display = 'block';
    if (!gallerySemesters.length) await loadSemesterOptions();
    else renderSemesterOptions();
}

window.handleSemesterChange = (id) => {
    activeSemesterId = id || null;
    renderSemesterOptions();
    if (userProfile.role !== 'student') loadClassesOrGroups(); // isi ulang daftar kelas sesuai semester terpilih
};

async function loadSessions() {
    const sessionSelect = document.getElementById('session-select');
    if (!sessionSelect) return;
    const isSchool = currentContext === 'school';
    const table = isSchool ? 'pertemuan_kelas' : 'pertemuan_private';
    const selectStr = isSchool ? 'id, tanggal, materi_id, materi:materi_id(title)' : 'id, tanggal, pertemuan_ke, materi_id, materi_private:materi_id(judul)';

    const { data } = await supabase.from(table).select(selectStr).eq('class_id', activeClassId).order('tanggal', { ascending: false });
    
    if (data && data.length > 0) {
        sessionSelect.innerHTML = '<option value="" disabled>-- Pilih Topik --</option>' + 
            data.map(s => {
                const date = new Date(s.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const title = isSchool ? (s.materi?.title || 'Kegiatan') : (s.materi_private?.judul || `Sesi ${s.pertemuan_ke}`);
                return `<option value="${s.id}" data-materi-id="${s.materi_id || ''}" data-date="${s.tanggal}">${date} : ${escapeHtml(title)}</option>`;
            }).join('');
        
        // Auto-pilih sesi terbaru agar tidak perlu klik 2x
        sessionSelect.selectedIndex = 1;
        window.handleSessionChange(sessionSelect.value);
    } else {
        sessionSelect.innerHTML = '<option value="" disabled selected>Belum ada sesi</option>';
        const tabs = document.getElementById('content-tabs');
        if (tabs) tabs.style.display = 'none';
        const grid = document.getElementById('ug-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="ug-empty-emoji" aria-hidden="true">📭</div>
                    <p>Belum ada dokumentasi sesi untuk kelas ini.</p>
                </div>`;
        }
        const dlBtn = document.getElementById('btn-download-all');
        if (dlBtn) dlBtn.style.display = 'none';
    }
}

async function loadGalleryContent() {
    const grid = document.getElementById('ug-grid');
    const dlBtn = document.getElementById('btn-download-all');
    if (!grid) return;

    // 1. Loading skeleton sebelum fetch (P2)
    grid.innerHTML = Array.from({ length: 12 }, () =>
        '<div class="ug-skeleton"></div>'
    ).join('');

    const col = currentContext === 'school' ? 'pertemuan_id' : 'pertemuan_private_id';

    // 2. Fetch dengan penanganan error
    try {
        const { data, error } = await supabase.from('gallery_contents')
            .select('*')
            .eq(col, activeSessionId)
            .eq('is_published', true)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });

        if (error) throw error;

        rawGalleryData = data || [];
    } catch (err) {
        console.error("Gagal memuat galeri:", err);
        rawGalleryData = [];
        grid.innerHTML = `
            <div class="empty-state ug-error-state">
                <div class="ug-empty-emoji" aria-hidden="true">😵</div>
                <p>Gagal memuat dokumentasi. Periksa koneksi kamu.</p>
                <button class="btn-retry" onclick="window.retryGallery()">Coba Lagi</button>
            </div>`;
        if (dlBtn) dlBtn.style.display = 'none';
        return;
    }

    renderGalleryGrid();

    if (dlBtn) dlBtn.style.display = (rawGalleryData.length > 0) ? 'inline-flex' : 'none';
}

// Retry saat gagal memuat galeri
window.retryGallery = () => { loadGalleryContent(); };

// --- 5. RENDERERS ---
function renderGalleryGrid() {
    const grid = document.getElementById('ug-grid');
    const filtered = rawGalleryData.filter(item => 
        activeTab === 'youtube' ? item.media_type === 'youtube' : item.media_type !== 'youtube'
    );

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="ug-empty-emoji" aria-hidden="true">📭</div>
                <p>Belum ada dokumentasi untuk topik ini.</p>
            </div>`;
        return;
    }

    grid.innerHTML = filtered.map((item, index) => {
        return `
            <div class="ug-card" role="button" tabindex="0"
                 aria-label="Buka foto ${index + 1}"
                 onclick="window.openSwipeGallery(${index})"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSwipeGallery(${index});}">
                <img src="${utils.getTransformUrl(item.file_url, 'GRID', false)}" loading="lazy" alt="Dokumentasi ${index + 1}" onerror="this.src='${CONFIG.PLACEHOLDER}'">
                ${item.media_type === 'youtube' ? '<div class="yt-icon"><i class="fa-brands fa-youtube"></i></div>' : ''}
                <div class="ug-caption">${escapeHtml(utils.getSystemCaption(index))}</div>
            </div>`;
    }).join('');
}

// --- 6. SWIPE GALLERY ---
// [FIX] Esc menutup lightbox + scroll halaman belakang dikunci saat terbuka
let lbEscBound = false;
function ensureLightboxKeyboard() {
    if (lbEscBound) return;
    lbEscBound = true;
    document.addEventListener('keydown', (e) => {
        const box = document.getElementById('lightbox');
        if (!box || box.style.display !== 'flex') return;
        if (e.key === 'Escape') { window.closeLightboxManual(); }
        else if (e.key === 'ArrowRight') { window.moveLightbox(1); }
        else if (e.key === 'ArrowLeft') { window.moveLightbox(-1); }
        else if (e.key === 'Tab') { trapLightboxFocus(e); }
    });
}

// --- 6. SWIPE GALLERY (Instagram-style: single-slide + prev/next) ---
let lbSlides = [];      // data slide non-youtube yang sedang terbuka
let lbCurrent = -1;     // indeks slide aktif
let lbLastFocused = null; // mengembalikan fokus yang dibuka sebelum lightbox

function lbFocusables() {
    const box = document.getElementById('lightbox');
    if (!box) return [];
    return [...box.querySelectorAll('button, [href], iframe, video')].filter(el => el.offsetParent !== null);
}

function trapLightboxFocus(e) {
    const f = lbFocusables();
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function igMediaHTML(item) {
    return item.media_type === 'video'
        ? `<video src="${item.file_url}" controls></video>`
        : `<img src="${utils.getTransformUrl(item.file_url, 'MODAL', true)}" alt="Foto Dokumentasi" onerror="this.src='${CONFIG.PLACEHOLDER}'">`;
}

function renderLightboxSlide(i) {
    const item = lbSlides[i];
    if (!item) return;
    lbCurrent = i;

    const hdImg = utils.getTransformUrl(item.file_url, 'HD', true);
    const socialText = utils.getSocialCaption();

    const mediaEl = document.getElementById('lb-media');
    const controlsEl = document.getElementById('lb-controls');
    const counterEl = document.getElementById('lb-counter');
    const prevBtn = document.getElementById('lb-prev');
    const nextBtn = document.getElementById('lb-next');

    if (mediaEl) mediaEl.innerHTML = igMediaHTML(item);
    if (controlsEl) controlsEl.innerHTML = `
            <button class="btn-share-smart" onclick="window.handleSmartShare('${hdImg}', \`${socialText}\`)">
                <i class="fa-brands fa-whatsapp"></i> Share ke Medsos
            </button>
            <button onclick="window.handleDownload('${hdImg}', 'Robopanda_Foto')" class="btn-dl-simple">
                <i class="fa-solid fa-download"></i> Simpan HD
            </button>`;
    if (counterEl) counterEl.textContent = `${i + 1} / ${lbSlides.length}`;
    if (prevBtn) prevBtn.style.display = (i === 0) ? 'none' : 'flex';
    if (nextBtn) nextBtn.style.display = (i === lbSlides.length - 1) ? 'none' : 'flex';

    // Preload slide berikutnya agar perpindahan lebih cepat (P3)
    const nextItem = lbSlides[i + 1];
    if (nextItem && nextItem.media_type !== 'video') {
        const pre = new Image();
        pre.src = utils.getTransformUrl(nextItem.file_url, 'MODAL', true);
    }
}

window.moveLightbox = (dir) => {
    if (!lbSlides.length) return;
    const next = lbCurrent + dir;
    if (next < 0 || next >= lbSlides.length) return;
    renderLightboxSlide(next);
};

window.openSwipeGallery = (startIndex) => {
    const lb = document.getElementById('lightbox');
    const content = document.getElementById('lb-content');
    const clickedItem = rawGalleryData[startIndex];
    if (!lb || !content || !clickedItem) return;

    ensureLightboxKeyboard();
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    lbLastFocused = document.activeElement;

    if (clickedItem.media_type === 'youtube') {
        // [FIX] urlToId menangani watch?v=, youtu.be, embed, dan shorts sekaligus
        const videoId = utils.urlToId(clickedItem.file_url);
        const embedUrl = videoId
            ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
            : clickedItem.file_url;
        content.innerHTML = `
            <button class="lb-close-btn" onclick="window.closeLightboxManual()" aria-label="Tutup video">&times;</button>
            <div class="lb-inner"><iframe src="${embedUrl}" frameborder="0" allowfullscreen title="Video Materi"></iframe></div>`;
        const ytClose = content.querySelector('.lb-close-btn');
        if (ytClose) ytClose.focus();
        return;
    }

    lbSlides = rawGalleryData.filter(item => item.media_type !== 'youtube');
    if (!lbSlides.length) return;

    const startIdx = Math.max(0, lbSlides.findIndex(d => d.id === clickedItem.id));

    content.innerHTML = `
        <div class="ug-ig-layout">
            <button class="lb-close-btn" onclick="window.closeLightboxManual()" aria-label="Tutup">&times;</button>
            <div class="ug-ig-top">
                <span class="ug-ig-counter" id="lb-counter"></span>
            </div>
            <button class="lb-arrow lb-prev" id="lb-prev" onclick="window.moveLightbox(-1)" aria-label="Sebelumnya" aria-hidden="false">&#8249;</button>
            <div class="ug-ig-stage">
                <div class="ug-ig-media" id="lb-media"></div>
                <div class="lb-controls-ig" id="lb-controls"></div>
            </div>
            <button class="lb-arrow lb-next" id="lb-next" onclick="window.moveLightbox(1)" aria-label="Berikutnya" aria-hidden="false">&#8250;</button>
        </div>`;

    renderLightboxSlide(startIdx >= 0 ? startIdx : 0);
    const lbClose = content.querySelector('.lb-close-btn');
    if (lbClose) lbClose.focus();
};

// --- 7. ACTIONS ---

window.downloadAllPhotos = async () => {
    if(!window.JSZip) { alert("Library ZIP belum siap. Tunggu sebentar."); return; }
    
    const btn = document.getElementById('btn-download-all');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Membungkus...';

    try {
        const selClass = document.getElementById('class-select');
        const selSess = document.getElementById('session-select');
        
        let folderName = "Dokumentasi_Robopanda";
        if(selClass && selSess) {
            const txtClass = selClass.options[selClass.selectedIndex]?.text || "Kelas";
            const txtSess = selSess.options[selSess.selectedIndex]?.text || "Sesi";
            const cleanClass = txtClass.replace(/[^a-zA-Z0-9]/g, '');
            const cleanSess = txtSess.replace(/[^a-zA-Z0-9]/g, '');
            folderName = `${cleanClass}_${cleanSess}`;
        }

        const zip = new JSZip();
        const folder = zip.folder(folderName);
        const photos = rawGalleryData.filter(i => i.media_type !== 'youtube');

        if(photos.length === 0) throw new Error("Tidak ada foto.");

        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menyiapkan unduhan...';

        // Unduh paralel terbatas (3 sekaligus) + progres (P4)
        const CONCURRENCY = 3;
        let done = 0;
        const queue = photos.map((item, idx) => async () => {
            const url = utils.getTransformUrl(item.file_url, 'HD', true);
            const imgBlob = await fetch(url).then(r => r.blob());
            folder.file(`Foto_${idx + 1}.jpg`, imgBlob);
            done++;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Mengunduh ${done}/${photos.length}...`;
        });
        const pool = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
            while (queue.length) { const tj = queue.shift(); await tj(); }
        });
        await Promise.all(pool);

        btn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Membungkus ZIP...';
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${folderName}.zip`;
        a.click();

    } catch (err) {
        alert("Gagal membuat ZIP: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Download Album (ZIP)';
    }
};

window.handleSmartShare = async (imageUrl, captionText) => {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], "robopanda_moment.jpg", { type: "image/jpeg" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Robopanda Moment',
                text: captionText
            });
        } else {
            alert("Fitur Share Gambar hanya support di HP (Android/iOS). Link disalin.");
            navigator.clipboard.writeText(imageUrl + '\n\n' + captionText);
        }
    } catch (err) { console.error("Share error:", err); }
};

window.handleDownload = async (url, filename) => {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `${filename}.jpg`;
        a.click();
    } catch (e) { alert("Gagal download."); }
};

window.closeLightboxManual = () => {
    const lb = document.getElementById('lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
    if (lbLastFocused && lbLastFocused.focus) lbLastFocused.focus();
    lbLastFocused = null;
};

window.switchGalleryContext = (ctx) => {
    currentContext = ctx;
    activeClassId = activeSessionId = null;
    loadClassesOrGroups();
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.ctx === ctx));
};

window.handleClassChange = (id) => { activeClassId = id; loadSessions(); };

window.handleSessionChange = (id) => { 
    activeSessionId = id; 
    document.getElementById('content-tabs').style.display = 'flex';
    loadGalleryContent(); 
};

window.switchTab = (tab) => {
    activeTab = tab;
    document.querySelectorAll('.tab-link').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));
    renderGalleryGrid();
};

// --- Rekap Absensi (Dynamic Import, modul terpisah agar gallery tetap ringan) ---
// Gunakan versi rilis statis (bukan Date.now) agar file bisa di-cache browser.
const REKAP_MODULE_VERSION = '1.0';
window.openRekapModule = async () => {
    if (!rekapContainer) return;
    rekapContainer.innerHTML = `
        <div style="padding:60px; text-align:center; color:#94a3b8;">
            <i class="fa-solid fa-spinner fa-spin"></i> Memuat Rekap Absensi...
        </div>`;

    try {
        const mod = await import(`./rekap-absensi-module.js?v=${REKAP_MODULE_VERSION}`);
        await mod.init(rekapContainer, {
            userProfile,
            initialClassId: activeClassId, // [INTEGRASI] Teruskan kelas aktif agar langsung terbuka
            onBack: () => {
                // Kembali: render ulang layout gallery seperti semula
                if (rekapContainer) init(rekapContainer, userProfile);
            }
        });
    } catch (err) {
        console.error('Gagal memuat modul rekap:', err);
        rekapContainer.innerHTML = `
            <div style="padding:50px; text-align:center; color:#ef4444;">
                Modul Rekap Absensi gagal dimuat.
            </div>`;
    }
};

window.openExplorerForCurrentSession = () => {
    const sessionSelect = document.getElementById('session-select');
    if (!sessionSelect || sessionSelect.selectedIndex < 0) return;
    const opt = sessionSelect.selectedOptions[0];
    const materiId = opt?.dataset?.materiId;
    const date = opt?.dataset?.date;
    if (materiId && window.openModalExplorer) {
        window.openModalExplorer(materiId, date, currentContext === 'school' ? 'sekolah' : 'private');
    } else {
        alert("Detail misi untuk sesi ini belum tersedia di kurikulum.");
    }
};

// --- 8. UI LAYOUT & STYLES ---
function renderLayout(container) {
    const role = userProfile.role;
    const privilegedRoles = ['super_admin', 'teacher', 'pic'];
    const canSeeSchool = ['super_admin', 'teacher', 'pic'].includes(role) || userProfile.class_id;
    const canSeePrivate = ['super_admin', 'teacher'].includes(role) || userProfile.class_private_id;

    container.innerHTML = `
        <div class="ug-container">
            <div class="ug-nav-switcher">
                ${canSeeSchool ? `<button class="nav-btn ${currentContext === 'school' ? 'active' : ''}" data-ctx="school" onclick="window.switchGalleryContext('school')">Sekolah</button>` : ''}
                ${canSeePrivate ? `<button class="nav-btn ${currentContext === 'private' ? 'active' : ''}" data-ctx="private" onclick="window.switchGalleryContext('private')">Private</button>` : ''}
            </div>
            ${privilegedRoles.includes(role) ? `
            <div class="ug-rekap-row">
                <button id="btn-open-rekap" class="btn-rekap" onclick="window.openRekapModule()">
                    <i class="fa-solid fa-clipboard-list"></i> Rekap Absensi Kelas Ini
                </button>
            </div>` : ''}
            
            <div class="ug-filters">
                <div class="filter-group" id="semester-filter-wrapper" style="display:none;"><label>Semester</label><select id="semester-select" onchange="window.handleSemesterChange(this.value)"></select></div>
                <div class="filter-group" id="class-filter-wrapper" style="display:none;"><label>Kelas</label><select id="class-select" onchange="window.handleClassChange(this.value)"></select></div>
                <div class="filter-group">
                    <label>Materi / Sesi</label>
                    <div style="display:flex; gap:5px;">
                        <select id="session-select" style="flex:1;" onchange="window.handleSessionChange(this.value)"></select>
                        <button id="btn-view-materi-info" onclick="window.openExplorerForCurrentSession()" title="Lihat Detail Misi Explorer" class="btn-info-mini">
                            <i class="fa-solid fa-circle-info"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div id="bulk-action-area" style="margin-bottom:15px; text-align:right;">
                <button id="btn-download-all" onclick="window.downloadAllPhotos()" style="display:none;" class="btn-zip">
                    <i class="fa-solid fa-file-zipper"></i> Download Album (ZIP)
                </button>
            </div>

            <div class="ug-tabs" id="content-tabs" style="display:none;">
                <button class="tab-link active" id="tab-media" onclick="window.switchTab('media')">Gallery</button>
                <button class="tab-link" id="tab-youtube" onclick="window.switchTab('youtube')">Materi</button>
            </div>
            <div id="ug-grid" class="ug-grid"></div>
        </div>
        <div id="lightbox" class="lightbox-overlay"><div id="lb-content" style="width:100%; height:100%;"></div></div>`;
}

function injectJSZip() {
    if(window.JSZip) return;
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    document.head.appendChild(script);
}

function injectStyles() {
    if (document.getElementById('ug-css')) return;
    const s = document.createElement('style');
    s.id = 'ug-css';
    s.textContent = `
        .ug-container { padding: 8px; max-width: 1000px; margin: 0 auto; font-family: inherit; }
        .ug-nav-switcher { display: flex; gap: 5px; margin-bottom: 10px; }
        .nav-btn { flex: 1; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.8rem; font-weight: bold; background: white; outline: none; }
        .nav-btn.active { background: #2ecc71; color: white; border-color: #27ae60; box-shadow: 0 4px 12px rgba(46,204,113,.35); }
        .ug-rekap-row { margin-bottom: 10px; text-align: right; }
        .btn-rekap { background: linear-gradient(135deg,#2ecc71,#27ae60); color: white; border: none; padding: 9px 18px; border-radius: 999px; font-weight: bold; font-size: 0.8rem; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 4px 12px rgba(46,204,113,.35); transition: transform .15s; }
        .btn-rekap:hover { transform: translateY(-2px); }
        .btn-info-mini { padding: 6px 10px; border: 1px solid #c8e6c9; border-radius: 5px; background: #f0fdf4; cursor: pointer; font-size: 0.8rem; color: #27ae60; transition: all .15s; }
        .btn-info-mini:hover { background: #d1fae5; }
        .ug-filters { display: flex; gap: 8px; background: white; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 10px; }
        .filter-group { flex: 1; }
        .filter-group label { display: block; font-size: 0.75rem; color: #475569; font-weight: 700; margin-bottom: 3px; }
        .filter-group select { width: 100%; padding: 6px; border-radius: 5px; border: 1px solid #cbd5e1; font-size: 0.8rem; outline: none; }
        .ug-tabs { display: flex; gap: 10px; margin-bottom: 10px; }
        .tab-link { padding: 8px; font-size: 0.8rem; font-weight: bold; color: #94a3b8; border: none; background: none; cursor: pointer; }
        .tab-link.active { color: #27ae60; border-bottom: 2px solid #2ecc71; }
        .ug-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
        @media (min-width: 900px) { .ug-grid { grid-template-columns: repeat(6, 1fr); } }
        .ug-card { background: white; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; position: relative; transition: transform .15s, box-shadow .15s; }
        .ug-card:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(0,0,0,.12); }
        .ug-card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; }
        .ug-caption { padding: 6px; font-size: 0.75rem; color: #475569; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ug-skeleton { aspect-ratio: 1/1; background: linear-gradient(90deg,#eef2f7 25%,#f7f9fc 50%,#eef2f7 75%); background-size: 200% 100%; border-radius: 6px; animation: ugShimmer 1.4s ease-in-out infinite; }
        @keyframes ugShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .ug-empty-emoji { font-size: 2.4rem; margin-bottom: 8px; }
        .btn-retry { margin-top: 10px; padding: 8px 22px; border: none; border-radius: 999px; background: #2ecc71; color: #fff; font-weight: 700; font-size: .85rem; cursor: pointer; box-shadow: 0 4px 10px rgba(46,204,113,.3); }
        .ug-error-state { padding: 40px 16px; }
        
        .lightbox-overlay { position: fixed; inset: 0; background: black; display: none; z-index: 9999; align-items: center; justify-content: center; }
        .lb-close-btn { position: absolute; top: 20px; right: 20px; font-size: 2.5rem; color: white; background: none; border: none; z-index: 10001; cursor: pointer; }

        /* Instagram-style single-slide lightbox */
        .ug-ig-layout { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .ug-ig-top { position: absolute; top: 0; left: 0; right: 0; display: flex; justify-content: center; padding: 16px; z-index: 5; pointer-events: none; }
        .ug-ig-counter { background: rgba(255,255,255,0.14); color: white; font-size: 0.85rem; font-weight: bold; letter-spacing: 0.5px; padding: 6px 16px; border-radius: 999px; backdrop-filter: blur(6px); }
        .ug-ig-stage { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; width: 100%; max-width: 92vw; height: 100%; }
        .ug-ig-media { display: flex; align-items: center; justify-content: center; min-height: 0; }
        .ug-ig-media img, .ug-ig-media video { max-width: 100%; max-height: 72vh; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); object-fit: contain; background: #000; }
        .lb-controls-ig { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; flex-shrink: 0; }
        .lb-arrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 10; width: 52px; height: 52px; border-radius: 50%; border: none; background: rgba(255,255,255,0.14); color: white; font-size: 2rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: background 0.2s ease; }
        .lb-arrow:hover { background: rgba(255,255,255,0.3); }
        .lb-prev { left: 16px; }
        .lb-next { right: 16px; }
        @media (max-width: 640px) {
            .lb-arrow { width: 42px; height: 42px; font-size: 1.6rem; }
            .lb-prev { left: 8px; }
            .lb-next { right: 8px; }
            .ug-ig-media img, .ug-ig-media video { max-height: 62vh; }
        }
        
        .btn-share-smart { padding: 12px 30px; border-radius: 30px; border: none; background: #25D366; color: white; font-weight: bold; font-size: 1rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(37,211,102,0.4); }
        .btn-dl-simple { background: none; border: 1px solid rgba(255,255,255,0.4); color: white; padding: 8px 18px; border-radius: 999px; cursor: pointer; font-size: 0.8rem; }
        .btn-zip { background: linear-gradient(135deg,#2ecc71,#27ae60); color: white; border: none; padding: 9px 22px; border-radius: 999px; font-weight: bold; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 6px 14px rgba(46,204,113,.35); transition: transform .15s; }
        .btn-zip:hover { transform: translateY(-2px); }
        
        .yt-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 2rem; opacity: 0.8; pointer-events: none; }
        .empty-state { grid-column: 1/-1; text-align: center; padding: 40px 16px; color: #94a3b8; font-size: 0.85rem; line-height: 1.5; }
        .lb-inner { position: relative; width: min(92vw, 900px); aspect-ratio: 16 / 9; }
        .lb-inner iframe { width: 100%; height: 100%; border: 0; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); background: #000; }
    `;
    document.head.appendChild(s);
}