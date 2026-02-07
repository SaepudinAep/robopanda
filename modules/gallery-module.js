/**
 * Project: Unified Gallery Module (Smart Gallery)
 * Features: Context Switcher (School/Private), Session Dropdown, Media Tabs
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE MANAGEMENT ---
let userProfile = null;
let currentContext = 'school'; // 'school' or 'private'
let activeClassId = null;      // ID Kelas atau ID Private Group
let activeSessionId = null;    // ID Pertemuan
let activeTab = 'media';       // 'media' or 'youtube'

// --- 1. INITIALIZATION ---
export async function init(container) {
    injectStyles();
    container.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Memuat Galeri...</div>`;

    await loadUserProfile();
    
    // Tentukan Default Context berdasarkan Profile
    if (userProfile.role === 'super_admin' || userProfile.role === 'teacher') {
        currentContext = 'school'; // Default Admin
    } else {
        // Jika Siswa, cek dia punya kelas sekolah atau private
        if (userProfile.class_id) currentContext = 'school';
        else if (userProfile.class_private_id) currentContext = 'private';
    }

    renderLayout(container);
    await loadClassesOrGroups(); // Load daftar kelas dulu
}

async function loadUserProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
    userProfile = data || { role: 'guest' };
}

// --- 2. RENDER LAYOUT UTAMA ---
function renderLayout(container) {
    // Cek visibilitas tombol Navigasi
    const showSchoolBtn = userProfile.role === 'super_admin' || userProfile.role === 'teacher' || userProfile.class_id;
    const showPrivateBtn = userProfile.role === 'super_admin' || userProfile.role === 'teacher' || userProfile.class_private_id;

    container.innerHTML = `
        <div class="ug-container fade-in">
            <div class="ug-nav-switcher">
                ${showSchoolBtn ? `
                    <button class="nav-btn ${currentContext === 'school' ? 'active' : ''}" onclick="window.switchGalleryContext('school')">
                        <i class="fa-solid fa-school"></i> Sekolah
                    </button>` : ''}
                
                ${showPrivateBtn ? `
                    <button class="nav-btn ${currentContext === 'private' ? 'active' : ''}" onclick="window.switchGalleryContext('private')">
                        <i class="fa-solid fa-user-group"></i> Private
                    </button>` : ''}
            </div>

            <div class="ug-filters">
                <div class="filter-group" id="class-filter-wrapper" style="display:none;">
                    <label>Pilih Kelas/Group:</label>
                    <div class="select-box">
                        <select id="class-select" onchange="window.handleClassChange(this.value)">
                            <option value="" disabled selected>Memuat...</option>
                        </select>
                        <i class="fa-solid fa-chevron-down"></i>
                    </div>
                </div>

                <div class="filter-group" style="flex:2;">
                    <label>Pilih Pertemuan/Topik:</label>
                    <div class="select-box">
                        <select id="session-select" onchange="window.handleSessionChange(this.value)">
                            <option value="" disabled selected>-- Pilih Topik Kegiatan --</option>
                        </select>
                        <i class="fa-solid fa-chevron-down"></i>
                    </div>
                </div>
            </div>

            <div class="ug-tabs" id="content-tabs" style="display:none;">
                <button class="tab-link active" id="tab-media" onclick="window.switchTab('media')">
                    <i class="fa-solid fa-images"></i> Foto & Video
                </button>
                <button class="tab-link" id="tab-youtube" onclick="window.switchTab('youtube')">
                    <i class="fa-brands fa-youtube"></i> Video Pembelajaran
                </button>
            </div>

            <div id="ug-grid" class="ug-grid">
                <div class="empty-state">
                    <i class="fa-solid fa-arrow-up"></i>
                    <p>Silakan pilih pertemuan di atas untuk melihat galeri.</p>
                </div>
            </div>
        </div>

        <div id="lightbox" class="lightbox-overlay" onclick="window.closeLightbox(event)">
            <span class="close-lightbox">&times;</span>
            <div class="lightbox-content">
                <img id="lb-img" style="display:none;">
                <div id="lb-vid" style="display:none;"></div>
            </div>
        </div>
    `;
}

// --- 3. LOGIC HANDLERS ---

// Ganti Konteks (Sekolah <-> Private)
window.switchGalleryContext = async (ctx) => {
    currentContext = ctx;
    activeClassId = null;
    activeSessionId = null;
    
    // Update UI Button
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active'); // Highlight tombol yang diklik

    // Reset Grid
    document.getElementById('ug-grid').innerHTML = '<div class="loading-state">Memuat Data...</div>';
    document.getElementById('content-tabs').style.display = 'none';

    await loadClassesOrGroups();
};

// Load Daftar Kelas (Tergantung Role)
async function loadClassesOrGroups() {
    const classSelect = document.getElementById('class-select');
    const wrapper = document.getElementById('class-filter-wrapper');
    const isAdmin = userProfile.role === 'super_admin' || userProfile.role === 'teacher' || userProfile.role === 'pic';

    // A. LOGIKA SISWA (Otomatis)
    if (!isAdmin) {
        wrapper.style.display = 'none'; // Sembunyikan dropdown kelas
        // Ambil ID langsung dari profil
        if (currentContext === 'school') activeClassId = userProfile.class_id;
        else activeClassId = userProfile.class_private_id;
        
        if(activeClassId) await loadSessions(); // Langsung load sesi
        else document.getElementById('ug-grid').innerHTML = '<div class="empty-state">Anda tidak terdaftar di kelas ini.</div>';
        return;
    }

    // B. LOGIKA ADMIN (Dropdown)
    wrapper.style.display = 'block';
    classSelect.innerHTML = '<option disabled selected>Memuat...</option>';

    let data = [];
    if (currentContext === 'school') {
        // Load Kelas Sekolah
        const res = await supabase.from('classes').select('id, name').order('name');
        data = res.data;
    } else {
        // Load Private Group/Class
        // Target: class_private
        const res = await supabase.from('class_private').select('id, name').order('name');
        data = res.data;
    }

    if (data && data.length > 0) {
        classSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
            data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } else {
        classSelect.innerHTML = '<option disabled>Data Kosong</option>';
    }
}

// Handle Perubahan Kelas (Admin)
window.handleClassChange = async (val) => {
    activeClassId = val;
    await loadSessions();
};

// Load Daftar Pertemuan (Dropdown Utama)
async function loadSessions() {
    const sessionSelect = document.getElementById('session-select');
    sessionSelect.innerHTML = '<option disabled selected>Memuat Jadwal...</option>';

    let query;
    // Logika Percabangan Tabel
    if (currentContext === 'school') {
        // Tabel: pertemuan_kelas
        query = supabase.from('pertemuan_kelas')
            .select('id, tanggal, materi(title)')
            .eq('class_id', activeClassId)
            .order('tanggal', { ascending: false });
    } else {
        // Tabel: pertemuan_private
        query = supabase.from('pertemuan_private')
            .select('id, tanggal, pertemuan_ke, materi_private(judul)')
            .eq('class_id', activeClassId)
            .order('tanggal', { ascending: false });
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
        sessionSelect.innerHTML = '<option disabled>Belum ada pertemuan</option>';
        return;
    }

    sessionSelect.innerHTML = '<option value="" disabled selected>-- Pilih Topik Kegiatan --</option>' + 
        data.map(s => {
            const dateStr = new Date(s.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            // Handle beda nama kolom (materi.title vs materi_private.judul)
            let title = '';
            if (currentContext === 'school') title = s.materi?.title || 'Kegiatan Rutin';
            else title = s.materi_private?.judul || `Pertemuan ke-${s.pertemuan_ke}`;
            
            return `<option value="${s.id}">${dateStr} : ${title}</option>`;
        }).join('');
}

// Handle Perubahan Sesi
window.handleSessionChange = async (val) => {
    activeSessionId = val;
    document.getElementById('content-tabs').style.display = 'flex'; // Munculkan Tab
    await loadGalleryContent();
};

// Ganti Tab (Media / Youtube)
window.switchTab = (tab) => {
    activeTab = tab;
    // Update UI Tab
    document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    // Reload Content (Client side filter actually better, but let's re-render)
    renderGalleryGrid();
};

// Variabel temp untuk menyimpan data galeri mentah
let rawGalleryData = [];

async function loadGalleryContent() {
    const grid = document.getElementById('ug-grid');
    grid.innerHTML = '<div class="loading-state">Mengambil Dokumentasi...</div>';

    // Query Gallery Contents
    // Asumsi: Kolom 'pertemuan_id' dipakai bersama untuk link ke sekolah/private
    // (Pastikan constraint DB mengizinkan ini, atau kolomnya UUID bebas)
    let query = supabase.from('gallery_contents')
        .select('*')
        .eq('pertemuan_id', activeSessionId)
        .order('created_at', { ascending: false });

    // Filter Role Siswa (Hanya Published)
    if (userProfile.role !== 'super_admin' && userProfile.role !== 'teacher') {
        query = query.eq('is_published', true).eq('is_deleted', false);
    }

    const { data, error } = await query;
    if (error) { grid.innerHTML = `<div class="empty-state">Error: ${error.message}</div>`; return; }
    
    rawGalleryData = data || [];
    renderGalleryGrid();
}

function renderGalleryGrid() {
    const grid = document.getElementById('ug-grid');
    
    // Filter Data Berdasarkan Tab Aktif
    const filtered = rawGalleryData.filter(item => {
        if (activeTab === 'youtube') return item.media_type === 'youtube';
        else return item.media_type !== 'youtube'; // image or video
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">Belum ada konten di kategori ini.</div>';
        return;
    }

    grid.innerHTML = filtered.map(item => {
        let thumb = item.file_url;
        let icon = '';
        let action = '';

        // Logic Thumbnail
        if (item.media_type === 'youtube') {
            const id = getYtId(item.file_url);
            thumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
            icon = '<i class="fa-brands fa-youtube" style="color:red; background:white; border-radius:50%; padding:5px;"></i>';
            action = `window.openLightbox('youtube', '${item.file_url}')`;
        } else if (item.media_type === 'video') {
            thumb = item.file_url.replace('.mp4', '.jpg').replace('/upload/', '/upload/w_400,q_auto,f_auto/');
            icon = '<i class="fa-solid fa-play" style="color:white;"></i>';
            action = `window.openLightbox('video', '${item.file_url}')`;
        } else {
            thumb = item.file_url.replace('/upload/', '/upload/w_400,q_auto,f_auto/');
            action = `window.openLightbox('image', '${item.file_url}')`;
        }

        return `
            <div class="ug-card fade-in" onclick="${action}">
                <div class="ug-thumb">
                    <img src="${thumb}" loading="lazy">
                    <div class="ug-icon-center">${icon}</div>
                </div>
            </div>
        `;
    }).join('');
}

// --- UTILS ---
window.closeLightbox = (e) => {
    if(e.target.id === 'lightbox' || e.target.classList.contains('close-lightbox')) {
        document.getElementById('lightbox').style.display = 'none';
        document.getElementById('lb-vid').innerHTML = '';
    }
};
window.openLightbox = (type, url) => {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lb-img');
    const vid = document.getElementById('lb-vid');
    lb.style.display = 'flex';
    
    if (type === 'image') {
        img.src = url; img.style.display = 'block'; vid.style.display = 'none';
    } else {
        img.style.display = 'none'; vid.style.display = 'block';
        vid.innerHTML = type === 'youtube' 
            ? `<iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>` 
            : `<video src="${url}" controls autoplay width="100%"></video>`;
    }
};

function getYtId(url) { const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/); return m && m[1].length==11 ? m[1] : null; }

function injectStyles() {
    if (document.getElementById('ug-css')) return;
    const s = document.createElement('style');
    s.id = 'ug-css';
    s.textContent = `
        .ug-container { padding: 20px; font-family: 'Poppins', sans-serif; max-width: 1000px; margin: 0 auto; min-height: 80vh; }
        
        /* NAV SWITCHER */
        .ug-nav-switcher { display: flex; justify-content: center; gap: 15px; margin-bottom: 25px; }
        .nav-btn { background: white; border: 1px solid #cbd5e1; padding: 12px 30px; border-radius: 50px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
        .nav-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; box-shadow: 0 4px 10px rgba(59,130,246,0.3); }
        .nav-btn:hover:not(.active) { background: #f1f5f9; }

        /* FILTERS */
        .ug-filters { display: flex; gap: 20px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-group { flex: 1; min-width: 200px; }
        .filter-group label { display: block; font-size: 0.85rem; color: #64748b; margin-bottom: 8px; font-weight: 600; }
        .select-box { position: relative; }
        .select-box select { width: 100%; padding: 12px 40px 12px 15px; border-radius: 10px; border: 1px solid #cbd5e1; appearance: none; font-size: 0.95rem; background: white; color: #334155; }
        .select-box i { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }

        /* TABS */
        .ug-tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 2px; }
        .tab-link { background: none; border: none; padding: 10px 20px; font-weight: 600; color: #94a3b8; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 8px; border-bottom: 3px solid transparent; margin-bottom: -4px; transition: 0.2s; }
        .tab-link.active { color: #3b82f6; border-bottom-color: #3b82f6; }
        .tab-link:hover { color: #1e293b; }

        /* GRID */
        .ug-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 15px; }
        .ug-card { background: black; border-radius: 12px; overflow: hidden; aspect-ratio: 1/1; cursor: pointer; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .ug-thumb { width: 100%; height: 100%; position: relative; }
        .ug-thumb img { width: 100%; height: 100%; object-fit: cover; transition: 0.3s; opacity: 0.9; }
        .ug-card:hover img { transform: scale(1.05); opacity: 1; }
        .ug-icon-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; z-index: 2; }

        /* UTILS */
        .loading-state, .empty-state { grid-column: 1/-1; text-align: center; padding: 50px; color: #94a3b8; font-weight: 500; }
        .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 2000; display: none; justify-content: center; align-items: center; }
        .lightbox-content { width: 90%; max-width: 1000px; max-height: 90vh; display: flex; justify-content: center; align-items: center; }
        .lightbox-content img, .lightbox-content video, .lightbox-content iframe { max-width: 100%; max-height: 80vh; border-radius: 8px; width: 100%; }
        .close-lightbox { position: absolute; top: 20px; right: 30px; color: white; font-size: 3rem; cursor: pointer; }
        .fade-in { animation: fadeIn 0.4s ease forwards; } @keyframes fadeIn { from {opacity:0; transform:translateY(10px);} to {opacity:1; transform:translateY(0);} }
        
        @media (max-width: 600px) {
            .ug-nav-switcher { flex-direction: row; }
            .ug-filters { flex-direction: column; gap: 10px; }
            .ug-grid { grid-template-columns: repeat(2, 1fr); }
        }
    `;
    document.head.appendChild(s);
}