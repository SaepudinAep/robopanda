/**
 * Project: Timeline Kegiatan Siswa (Public View)
 * Layout: Masonry Grid (Pinterest Style) - Optimized for Vertical Photos
 * Access: Read Only. Student (Auto Class), Admin (Select Class).
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// State
let targetClassId = null;
let userRole = null;
let currentMonth = new Date().getMonth() + 1; // 1-12
let currentYear = new Date().getFullYear();

// ==========================================
// 1. INITIALIZATION & ROLE CHECK
// ==========================================
export async function init(canvas) {
    injectStyles();
    canvas.innerHTML = `
        <div class="tl-container fade-in">
            <div class="tl-header">
                <div class="header-titles">
                    <h2 id="page-title">Galeri Kegiatan</h2>
                    <span id="page-subtitle">Memuat data...</span>
                </div>
                
                <div class="header-controls">
                    <div id="admin-class-wrapper" style="display:none;">
                        <select id="admin-class-select" class="control-select">
                            <option value="" disabled selected>Pilih Kelas</option>
                        </select>
                    </div>

                    <select id="filter-month" class="control-select">
                        <option value="all">Semua Bulan</option>
                        <option value="1">Januari</option>
                        <option value="2">Februari</option>
                        <option value="3">Maret</option>
                        <option value="4">April</option>
                        <option value="5">Mei</option>
                        <option value="6">Juni</option>
                        <option value="7">Juli</option>
                        <option value="8">Agustus</option>
                        <option value="9">September</option>
                        <option value="10">Oktober</option>
                        <option value="11">November</option>
                        <option value="12">Desember</option>
                    </select>
                </div>
            </div>

            <div id="masonry-grid" class="masonry-grid">
                <div class="loading-state">
                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                    <p>Sedang menyusun kenangan...</p>
                </div>
            </div>
        </div>

        <div id="lightbox" class="lightbox-overlay" onclick="closeLightbox(event)">
            <span class="close-lightbox">&times;</span>
            
            <div class="lb-content">
                <img id="lb-img" src="" style="display:none;">
                <div id="lb-video" style="display:none;"></div>
                
                <div class="lb-info-bar">
                    <div class="lb-text">
                        <h4 id="lb-topic">Topik Kegiatan</h4>
                        <span id="lb-date">Tanggal</span>
                    </div>
                    <div class="lb-actions">
                        <a id="lb-download" href="#" target="_blank" class="btn-download" download>
                            <i class="fa-solid fa-download"></i> Simpan
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    bindEvents();
    await determineContext();
}

// ==========================================
// 2. CONTEXT LOGIC (SIAPA YANG LOGIN?)
// ==========================================
async function determineContext() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
        showError("Anda harus login.");
        return;
    }

    // Cek Profile
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, class_id, classes(name)')
        .eq('id', user.id)
        .single();

    userRole = profile?.role || 'student';

    if (userRole === 'student' || userRole === 'parent') {
        // --- SKENARIO SISWA/ORTU ---
        if (!profile.class_id) {
            showError("Akun Anda belum terhubung dengan kelas manapun. Hubungi Admin.");
            return;
        }
        targetClassId = profile.class_id;
        document.getElementById('page-subtitle').innerText = `Kelas ${profile.classes?.name || ''}`;
        
        // Auto set filter bulan ke bulan sekarang
        document.getElementById('filter-month').value = currentMonth;
        loadGallery();

    } else {
        // --- SKENARIO ADMIN/GURU ---
        document.getElementById('admin-class-wrapper').style.display = 'block';
        document.getElementById('page-subtitle').innerText = "Mode Preview Admin";
        await loadClassesForAdmin();
    }
}

async function loadClassesForAdmin() {
    const select = document.getElementById('admin-class-select');
    const { data: classes } = await supabase
        .from('classes')
        .select('id, name')
        .order('name');

    if (classes) {
        select.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
            classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        // Kalau admin sebelumnya sudah pilih kelas di galeri-sekolah, auto select
        const lastClass = localStorage.getItem('activeClassId');
        if (lastClass) {
            select.value = lastClass;
            targetClassId = lastClass;
            loadGallery();
        }
    }

    select.onchange = (e) => {
        targetClassId = e.target.value;
        loadGallery();
    };
}

// ==========================================
// 3. LOAD DATA & RENDER MASONRY
// ==========================================
async function loadGallery() {
    if (!targetClassId) return;

    const grid = document.getElementById('masonry-grid');
    grid.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>`;

    const selectedMonth = document.getElementById('filter-month').value;

    // QUERY: Join gallery -> pertemuan -> materi
    // Filter Wajib: is_published = true
    let query = supabase
        .from('gallery_contents')
        .select(`
            *,
            pertemuan:pertemuan_kelas (
                tanggal,
                materi (title)
            )
        `)
        .eq('class_id', targetClassId)
        .eq('is_published', true) // HARGA MATI
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

    const { data: photos, error } = await query;

    if (error) {
        showError(error.message);
        return;
    }

    // Filter Bulan di Client Side (Supabase filter date agak tricky, lebih cepat di JS untuk data < 1000)
    let filteredPhotos = photos;
    if (selectedMonth !== 'all') {
        filteredPhotos = photos.filter(p => {
            const d = new Date(p.pertemuan?.tanggal);
            return (d.getMonth() + 1) == selectedMonth;
        });
    }

    if (filteredPhotos.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <img src="https://img.icons8.com/clouds/100/null/photos.png"/>
                <h3>Belum ada dokumentasi</h3>
                <p>Guru belum mempublish foto untuk periode ini.</p>
            </div>`;
        return;
    }

    renderMasonry(filteredPhotos, grid);
}

function renderMasonry(photos, container) {
    container.innerHTML = photos.map(p => {
        const dateObj = new Date(p.pertemuan?.tanggal);
        const dateStr = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const topic = p.pertemuan?.materi?.title || 'Kegiatan Rutin';
        
        let mediaHtml = '';
        let clickAction = '';
        let badgeType = '';

        if (p.media_type === 'youtube') {
            const vidId = getYoutubeId(p.file_url);
            const thumb = `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;
            mediaHtml = `<img src="${thumb}" loading="lazy" alt="${topic}">`;
            badgeType = `<div class="type-badge"><i class="fa-brands fa-youtube"></i></div>`;
            clickAction = `openLightbox('youtube', '${p.file_url}', '${topic}', '${dateStr}')`;
        } else if (p.media_type === 'video') {
            const thumb = p.file_url.replace('.mp4', '.jpg').replace('/upload/', '/upload/w_400,q_auto,f_auto/');
            mediaHtml = `<img src="${thumb}" loading="lazy" alt="${topic}">`;
            badgeType = `<div class="type-badge"><i class="fa-solid fa-play"></i></div>`;
            clickAction = `openLightbox('video', '${p.file_url}', '${topic}', '${dateStr}')`;
        } else {
            // Optimasi gambar vertikal
            const thumb = p.file_url.replace('/upload/', '/upload/w_500,q_auto,f_auto/');
            mediaHtml = `<img src="${thumb}" loading="lazy" alt="${topic}">`;
            clickAction = `openLightbox('image', '${p.file_url}', '${topic}', '${dateStr}')`;
        }

        return `
            <div class="masonry-item fade-in" onclick="${clickAction}">
                <div class="m-content">
                    ${mediaHtml}
                    ${badgeType}
                    <div class="m-overlay">
                        <span class="m-date">${dateStr}</span>
                        <span class="m-topic">${topic}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. LIGHTBOX & DOWNLOAD
// ==========================================
window.openLightbox = (type, url, topic, date) => {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lb-img');
    const vid = document.getElementById('lb-video');
    const dlBtn = document.getElementById('lb-download');

    document.getElementById('lb-topic').innerText = topic;
    document.getElementById('lb-date').innerText = date;
    
    lb.style.display = 'flex';
    img.style.display = 'none';
    vid.style.display = 'none';
    vid.innerHTML = '';

    if (type === 'image') {
        img.src = url;
        img.style.display = 'block';
        dlBtn.href = url.replace('/upload/', '/upload/fl_attachment/'); // Force Download Cloudinary
        dlBtn.style.display = 'flex';
    } else if (type === 'video') {
        vid.style.display = 'block';
        vid.innerHTML = `<video controls autoplay style="max-width:100%; max-height:100%"><source src="${url}"></video>`;
        dlBtn.href = url.replace('/upload/', '/upload/fl_attachment/');
        dlBtn.style.display = 'flex';
    } else if (type === 'youtube') {
        vid.style.display = 'block';
        vid.innerHTML = `<iframe width="100%" height="100%" src="${url}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
        dlBtn.style.display = 'none'; // YouTube gabisa didownload direct
    }
};

window.closeLightbox = (e) => {
    if (e.target.id === 'lightbox' || e.target.classList.contains('close-lightbox')) {
        document.getElementById('lightbox').style.display = 'none';
        document.getElementById('lb-video').innerHTML = '';
    }
};

// ==========================================
// 5. UTILS & STYLES (MASONRY CSS)
// ==========================================
function bindEvents() {
    document.getElementById('filter-month').onchange = () => loadGallery();
}

function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function showError(msg) {
    document.getElementById('masonry-grid').innerHTML = `<div class="error-msg">${msg}</div>`;
}

function injectStyles() {
    if (document.getElementById('tl-css')) return;
    const s = document.createElement('style');
    s.id = 'tl-css';
    s.textContent = `
        .tl-container { padding: 20px; max-width: 1200px; margin: 0 auto; font-family: 'Poppins', sans-serif; }
        
        /* HEADER */
        .tl-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 30px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; flex-wrap: wrap; gap: 15px; }
        #page-title { margin: 0; font-size: 1.8rem; color: #1e293b; font-weight: 800; }
        #page-subtitle { color: #64748b; font-size: 1rem; }
        
        .header-controls { display: flex; gap: 10px; }
        .control-select { padding: 10px 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; font-weight: 600; color: #334155; cursor: pointer; }

        /* MASONRY GRID (PURE CSS MAGIC) */
        .masonry-grid { column-count: 4; column-gap: 15px; }
        
        .masonry-item { break-inside: avoid; margin-bottom: 15px; position: relative; cursor: pointer; border-radius: 16px; overflow: hidden; transition: transform 0.3s; background: #000; }
        .masonry-item:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
        
        .m-content { position: relative; width: 100%; }
        .m-content img { width: 100%; height: auto; display: block; }
        
        /* HOVER OVERLAY INFO */
        .m-overlay { position: absolute; bottom: 0; left: 0; width: 100%; padding: 20px 15px 15px; background: linear-gradient(to top, rgba(0,0,0,0.8), transparent); color: white; display: flex; flex-direction: column; opacity: 1; transition: 0.3s; }
        .m-date { font-size: 0.75rem; font-weight: 400; opacity: 0.9; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 1px; }
        .m-topic { font-size: 0.95rem; font-weight: 700; line-height: 1.2; }
        
        .type-badge { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); border: 1px solid rgba(255,255,255,0.3); }

        /* STATES */
        .loading-state, .empty-state { text-align: center; padding: 50px; color: #94a3b8; width: 100%; grid-column: 1 / -1; }
        .empty-state img { width: 80px; opacity: 0.5; margin-bottom: 15px; }
        .error-msg { background: #fee2e2; color: #dc2626; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; }

        /* LIGHTBOX */
        .lightbox-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.95); display: none; justify-content: center; align-items: center; z-index: 10000; }
        .lb-content { position: relative; max-width: 90%; max-height: 90vh; display: flex; flex-direction: column; align-items: center; }
        .lb-content img { max-height: 80vh; max-width: 100%; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .lb-content video, .lb-content iframe { width: 80vw; height: 45vw; max-width: 1000px; max-height: 560px; border-radius: 8px; }

        .lb-info-bar { width: 100%; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
        .lb-text h4 { margin: 0; font-size: 1.1rem; }
        .lb-text span { font-size: 0.85rem; opacity: 0.7; }
        
        .btn-download { background: white; color: #0f172a; padding: 10px 20px; border-radius: 30px; text-decoration: none; font-weight: 700; display: flex; gap: 8px; align-items: center; transition: 0.2s; }
        .btn-download:hover { background: #e2e8f0; transform: scale(1.05); }
        
        .close-lightbox { position: absolute; top: 20px; right: 30px; color: white; font-size: 3rem; cursor: pointer; opacity: 0.6; transition: 0.2s; }
        .close-lightbox:hover { opacity: 1; transform: rotate(90deg); }

        .fade-in { animation: fadeIn 0.6s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        /* RESPONSIVE */
        @media (max-width: 1024px) { .masonry-grid { column-count: 3; } }
        @media (max-width: 768px) { 
            .masonry-grid { column-count: 2; column-gap: 10px; } 
            .tl-header { flex-direction: column; align-items: flex-start; }
            .header-controls { width: 100%; }
            .control-select { flex: 1; }
            .btn-download span { display: none; } /* Icon only di HP */
        }
    `;
    document.head.appendChild(s);
}