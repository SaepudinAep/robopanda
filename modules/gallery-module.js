/**
 * Project: Robopanda Client (Public/Student)
 * File: modules/gallery-module.js
 * Version: 4.7 - Fix Private Watermark (Text Base) & Optimize Modal Image Size
 * Format: Plain Text (Huawei T10s Anti-Crash)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- STATE MANAGEMENT ---
let userProfile = null;
let currentContext = 'school'; 
let activeClassId = null;      
let activeSessionId = null;    
let activeTab = 'media';       
let rawGalleryData = []; 

// --- 1. INITIALIZATION ---
export async function init(container, profileFromIndex) {
    userProfile = profileFromIndex || { role: 'guest' };
    injectStyles();
    
    if (['super_admin', 'teacher', 'pic'].includes(userProfile.role)) {
        currentContext = 'school';
    } else {
        if (userProfile.class_id) currentContext = 'school';
        else if (userProfile.class_private_id) currentContext = 'private';
    }

    renderLayout(container);
    await loadClassesOrGroups(); 
}

// --- 2. LOGGING & UTILS ---
async function recordActivity(type, metadata = {}) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from('activity_logs').insert([{
            user_id: session?.user?.id || null,
            activity_type: type,
            metadata: metadata
        }]);
    } catch (err) { console.error("Log Error:", err); }
}

function getFormattedCaption(index) {
    const select = document.getElementById('session-select');
    if (!select || select.selectedIndex === 0) return `robopanda_img_${index + 1}`;
    
    const sessionText = select.options[select.selectedIndex].text;
    const parts = sessionText.split(' : ');
    
    const rawDate = parts[0] || 'date';
    const cleanDate = rawDate.replace(/\s/g, '');
    
    const rawMateri = parts[1] || 'materi';
    const cleanMateri = rawMateri.replace(/\s/g, '');
    
    const noUrut = (index + 1).toString().padStart(2, '0');
    
    return `robopanda_${cleanDate}_${cleanMateri}_${noUrut}`;
}

// --- 3. SECURITY & DATA ---
async function loadClassesOrGroups() {
    const classSelect = document.getElementById('class-select');
    const wrapper = document.getElementById('class-filter-wrapper');
    if (!classSelect) return;

    if (userProfile.role === 'student') {
        wrapper.style.display = 'none'; 
        activeClassId = currentContext === 'school' ? userProfile.class_id : userProfile.class_private_id;
        if (activeClassId) await loadSessions();
        else document.getElementById('ug-grid').innerHTML = '<div class="empty-state">Akses tidak ditemukan.</div>';
        return;
    }

    wrapper.style.display = 'block';
    classSelect.innerHTML = '<option disabled selected>Memuat...</option>';

    let query = currentContext === 'school' 
        ? supabase.from('classes').select('id, name, schools(name)') 
        : supabase.from('class_private').select('id, name, group_id');

    if (userProfile.role === 'pic') {
        const filterCol = currentContext === 'school' ? 'school_id' : 'group_id';
        const filterVal = currentContext === 'school' ? userProfile.school_id : userProfile.group_id;
        query = query.eq(filterCol, filterVal);
    }

    const { data } = await query.order('name');
    if (data && data.length > 0) {
        classSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
            data.map(c => {
                const label = currentContext === 'school' 
                    ? `${c.name} (${c.schools?.name || 'Umum'})` 
                    : c.name;
                return `<option value="${c.id}">${label}</option>`;
            }).join('');
    }
}

async function loadSessions() {
    const sessionSelect = document.getElementById('session-select');
    let query = currentContext === 'school' 
        ? supabase.from('pertemuan_kelas').select('id, tanggal, materi(title)').eq('class_id', activeClassId)
        : supabase.from('pertemuan_private').select('id, tanggal, pertemuan_ke, materi_private(judul)').eq('class_id', activeClassId);

    const { data } = await query.order('tanggal', { ascending: false });
    if (data && data.length > 0) {
        sessionSelect.innerHTML = '<option value="" disabled selected>-- Pilih Topik --</option>' + 
            data.map(s => {
                const dateStr = new Date(s.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const title = currentContext === 'school' ? (s.materi?.title || 'Kegiatan') : (s.materi_private?.judul || `Sesi ${s.pertemuan_ke}`);
                return `<option value="${s.id}">${dateStr} : ${title}</option>`;
            }).join('');
    }
}

async function loadGalleryContent() {
    const targetCol = currentContext === 'school' ? 'pertemuan_id' : 'pertemuan_private_id';

    let query = supabase.from('gallery_contents')
        .select('*')
        .eq(targetCol, activeSessionId)
        .order('created_at', { ascending: true });

    if (userProfile.role === 'student' || userProfile.role === 'guest') {
        query = query.eq('is_published', true).eq('is_deleted', false);
    }
    const { data } = await query;
    rawGalleryData = data || [];
    renderGalleryGrid();
}

// --- 4. RENDERER (MINI GRID) ---
function renderGalleryGrid() {
    const grid = document.getElementById('ug-grid');
    const filtered = rawGalleryData.filter(item => (activeTab === 'youtube' ? item.media_type === 'youtube' : item.media_type !== 'youtube'));

    if (filtered.length === 0) { grid.innerHTML = '<div class="empty-state">Belum ada konten.</div>'; return; }

    grid.innerHTML = filtered.map((item, index) => {
        let thumb = item.file_url;
        const captionAuto = getFormattedCaption(index);
        
        // Grid tetap menggunakan thumbnail kecil 250px
        if (item.media_type === 'image') thumb = item.file_url.replace('/upload/', '/upload/w_250,q_auto,f_auto/');
        else if (item.media_type === 'youtube') thumb = `https://img.youtube.com/vi/${urlToId(item.file_url)}/mqdefault.jpg`;

        return `
            <div class="ug-card" onclick="window.openSwipeGallery(${index})">
                <img src="${thumb}" loading="lazy" onerror="this.src='https://placehold.co/250x250?text=Error+Image'">
                ${item.media_type === 'youtube' ? '<div class="yt-icon"><i class="fa-brands fa-youtube"></i></div>' : ''}
                <div class="ug-caption">${captionAuto}</div>
            </div>`;
    }).join('');
}

// --- 5. SWIPE GALLERY (MODAL) ---
window.openSwipeGallery = (startIndex) => {
    const lb = document.getElementById('lightbox');
    const content = document.getElementById('lb-content');
    lb.style.display = 'flex';

    const slideData = rawGalleryData.filter(item => item.media_type !== 'youtube');
    
    if (rawGalleryData[startIndex].media_type === 'youtube') {
        const url = rawGalleryData[startIndex].file_url;
        content.innerHTML = `
            <button class="lb-close-btn" onclick="window.closeLightboxManual()">&times;</button>
            <div class="lb-inner"><iframe src="${url.replace('watch?v=', 'embed/')}" frameborder="0" allowfullscreen></iframe></div>`;
        return;
    }

    const currentItem = rawGalleryData[startIndex];
    const newIdx = slideData.findIndex(d => d.id === currentItem.id);

    content.innerHTML = `
        <button class="lb-close-btn" onclick="window.closeLightboxManual()">&times;</button>
        <div class="ug-slider-container">
            ${slideData.map((item, idx) => {
                const caption = getFormattedCaption(idx);
                
                // UPDATE PENTING: Watermark Teks untuk Private & Optimasi Ukuran
                // Menggunakan Font Montserrat, Bold, Ukuran 30, Putih, Opacity 70% di Pojok Kanan Bawah
                const watermark = currentContext === 'school' 
                    ? 'l_text:Arial_35_bold:Robopanda,g_south_east,x_20,y_20,co_white,o_50' 
                    : 'l_text:Montserrat_30_bold:Robopanda%20Education,g_south_east,x_20,y_20,co_white,o_70';

                // UPDATE PENTING: Mengurangi ukuran ke w_800 dan kualitas q_auto:eco agar ringan di tablet
                const finalImg = item.file_url.replace('/upload/', `/upload/w_800,q_auto:eco,f_auto,${watermark}/`);

                return `
                    <div class="ug-slide" id="slide-${idx}">
                        ${item.media_type === 'video' ? `<video src="${item.file_url}" controls></video>` : `<img src="${finalImg}" onerror="this.src='https://placehold.co/800x600?text=Gagal+Memuat+Gambar'; this.style.objectFit='contain';">`}
                        <div class="lb-controls">
                            <span class="slide-label">${caption}</span>
                            <div style="display:flex; gap:10px;">
                                <button onclick="window.handleShare('${caption}', '${finalImg}')"><i class="fa-solid fa-share-nodes"></i></button>
                                <button onclick="window.handleDownload('${finalImg}', '${caption}')" class="btn-dl"><i class="fa-solid fa-download"></i></button>
                            </div>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;

    setTimeout(() => {
        const target = document.getElementById(`slide-${newIdx}`);
        if (target) target.scrollIntoView();
    }, 100);
};

// --- 6. ACTIONS ---
window.handleDownload = async (url, filename) => {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = `${filename}.jpg`;
        a.click();
        await recordActivity('download', { file: filename, context: currentContext });
    } catch (e) { alert("Gagal download. Coba lagi."); }
};

window.handleShare = async (title, url) => {
    if (navigator.share) {
        try { 
            await navigator.share({ title: 'Robopanda', text: title, url: url });
            await recordActivity('share', { title: title, context: currentContext });
        } catch (e) {}
    } else {
        navigator.clipboard.writeText(url);
        alert("Link disalin ke clipboard!");
    }
};

window.closeLightboxManual = () => {
    document.getElementById('lightbox').style.display = 'none';
};

window.switchGalleryContext = (ctx) => {
    currentContext = ctx;
    activeClassId = null;
    activeSessionId = null;
    loadClassesOrGroups();
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.innerText.toLowerCase().includes(ctx)));
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

function urlToId(url) { const m = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/); return m ? m[1] : ''; }

function renderLayout(container) {
    const role = userProfile.role;
    const canSeeSchool = ['super_admin', 'teacher', 'pic'].includes(role) || userProfile.class_id;
    const canSeePrivate = ['super_admin', 'teacher'].includes(role) || userProfile.class_private_id;

    container.innerHTML = `
        <div class="ug-container">
            <div class="ug-nav-switcher">
                ${canSeeSchool ? `<button class="nav-btn ${currentContext === 'school' ? 'active' : ''}" onclick="window.switchGalleryContext('school')">Sekolah</button>` : ''}
                ${canSeePrivate ? `<button class="nav-btn ${currentContext === 'private' ? 'active' : ''}" onclick="window.switchGalleryContext('private')">Private</button>` : ''}
            </div>
            <div class="ug-filters">
                <div class="filter-group" id="class-filter-wrapper" style="display:none;"><label>Kelas</label><select id="class-select" onchange="window.handleClassChange(this.value)"></select></div>
                <div class="filter-group"><label>Materi</label><select id="session-select" onchange="window.handleSessionChange(this.value)"></select></div>
            </div>
            <div class="ug-tabs" id="content-tabs" style="display:none;">
                <button class="tab-link active" id="tab-media" onclick="window.switchTab('media')">Gallery</button>
                <button class="tab-link" id="tab-youtube" onclick="window.switchTab('youtube')">Materi</button>
            </div>
            <div id="ug-grid" class="ug-grid"></div>
        </div>
        <div id="lightbox" class="lightbox-overlay"><div id="lb-content" style="width:100%; height:100%;"></div></div>`;
}

function injectStyles() {
    if (document.getElementById('ug-css')) return;
    const s = document.createElement('style');
    s.id = 'ug-css';
    s.textContent = `
        .ug-container { padding: 8px; max-width: 1000px; margin: 0 auto; font-family: 'Poppins', sans-serif; }
        .ug-nav-switcher { display: flex; gap: 5px; margin-bottom: 10px; }
        .nav-btn { flex: 1; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.8rem; font-weight: bold; background: white; }
        .nav-btn.active { background: #4d97ff; color: white; border-color: #4d97ff; }
        .ug-filters { display: flex; gap: 8px; background: white; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 10px; }
        .filter-group { flex: 1; }
        .filter-group label { display: block; font-size: 0.6rem; color: #94a3b8; font-weight: bold; }
        .filter-group select { width: 100%; padding: 6px; border-radius: 5px; border: 1px solid #cbd5e1; font-size: 0.8rem; }
        .ug-tabs { display: flex; gap: 10px; margin-bottom: 10px; }
        .tab-link { padding: 8px; font-size: 0.8rem; font-weight: bold; color: #94a3b8; border: none; background: none; }
        .tab-link.active { color: #4d97ff; border-bottom: 2px solid #4d97ff; }
        .ug-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
        @media (min-width: 900px) { .ug-grid { grid-template-columns: repeat(6, 1fr); } }
        .ug-card { background: white; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; min-height: 100px; background: #f0f0f0; }
        .ug-card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; }
        .ug-caption { padding: 4px; font-size: 0.5rem; color: #64748b; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lightbox-overlay { position: fixed; inset: 0; background: black; display: none; z-index: 9999; }
        .lb-close-btn { position: absolute; top: 20px; right: 20px; font-size: 2.5rem; color: white; background: none; border: none; z-index: 10001; cursor: pointer; }
        .ug-slider-container { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; width: 100%; height: 100vh; }
        .ug-slider-container::-webkit-scrollbar { display: none; }
        .ug-slide { min-width: 100%; height: 100%; scroll-snap-align: start; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; }
        .ug-slide img, .ug-slide video { max-width: 100%; max-height: 75vh; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .lb-controls { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 15px; width: 100%; }
        .slide-label { color: #cbd5e1; font-size: 0.75rem; font-family: monospace; }
        .lb-controls button { padding: 12px 25px; border-radius: 30px; border: none; background: #3b82f6; color: white; font-weight: bold; cursor: pointer; }
        .lb-controls .btn-dl { background: #10b981; }
        .yt-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 2rem; opacity: 0.8; }
    `;
    document.head.appendChild(s);
}