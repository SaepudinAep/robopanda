/**
 * Project: Robopanda Client (Public/Student)
 * File: modules/gallery-module.js
 * Version: 6.4 - Final (30% Logo + Instagram Link)
 * Format: Plain Text (Anti-Crash Optimized)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from '../assets/js/config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- 1. CONFIGURATION ---
const LOGO_B64 = 'aHR0cHM6Ly9yZXMuY2xvdWRpbmFyeS5jb20vZG1tNmF2dHhkL2ltYWdlL3VwbG9hZC9Sb2JvcGFuZGEtRWR1Y2F0aW9uX3p3eDBibS5wbmc=';

const CONFIG = {
    // [BRANDING 30% SOLID]
    // w_0.30   : Logo Besar (30% dari lebar foto)
    // o_100    : Solid/Jelas (Tidak transparan)
    // e_shadow:50 : Bayangan agar logo 'pop-up'
    WATERMARK: `l_fetch:${LOGO_B64}/e_shadow:50,fl_layer_apply,g_south_east,x_30,y_30,w_0.30,o_100`,
    
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

// --- 2. INITIALIZATION ---
export async function init(container, profileFromIndex) {
    userProfile = profileFromIndex || { role: 'guest' };
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
        return ` Project Keren: ${robotName}\n\nLihat nih hasil karya belajar hari ini! Seru banget merakit dan memprogram robot sendiri. \n\nPenasaran sama robot lainnya? Cek Instagram kami:\n https://instagram.com/robopandarobotic\n\n#Robopanda #CodingAnak #RobotikaIndonesia`;
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
    classSelect.innerHTML = '<option disabled selected>Memuat...</option>';

    const table = currentContext === 'school' ? 'classes' : 'class_private';
    const selectStr = currentContext === 'school' ? 'id, name, schools(name)' : 'id, name, group_id';
    
    let query = supabase.from(table).select(selectStr);
    if (userProfile.role === 'pic') {
        const col = currentContext === 'school' ? 'school_id' : 'group_id';
        const val = currentContext === 'school' ? userProfile.school_id : userProfile.group_id;
        query = query.eq(col, val);
    }

    const { data } = await query.order('name');
    if (data) {
        classSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelas --</option>' + 
            data.map(c => `<option value="${c.id}">${c.name} ${c.schools?.name ? `(${c.schools.name})` : ''}</option>`).join('');
    }
}

async function loadSessions() {
    const sessionSelect = document.getElementById('session-select');
    const isSchool = currentContext === 'school';
    const table = isSchool ? 'pertemuan_kelas' : 'pertemuan_private';
    const selectStr = isSchool ? 'id, tanggal, materi(title)' : 'id, tanggal, pertemuan_ke, materi_private(judul)';

    const { data } = await supabase.from(table).select(selectStr).eq('class_id', activeClassId).order('tanggal', { ascending: false });
    
    if (data) {
        sessionSelect.innerHTML = '<option value="" disabled selected>-- Pilih Topik --</option>' + 
            data.map(s => {
                const date = new Date(s.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const title = isSchool ? (s.materi?.title || 'Kegiatan') : (s.materi_private?.judul || `Sesi ${s.pertemuan_ke}`);
                return `<option value="${s.id}">${date} : ${title}</option>`;
            }).join('');
    }
}

async function loadGalleryContent() {
    const col = currentContext === 'school' ? 'pertemuan_id' : 'pertemuan_private_id';
    
    const { data } = await supabase.from('gallery_contents')
        .select('*')
        .eq(col, activeSessionId)
        .eq('is_published', true)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

    rawGalleryData = data || [];
    renderGalleryGrid();
    
    const dlBtn = document.getElementById('btn-download-all');
    if(dlBtn) dlBtn.style.display = (rawGalleryData.length > 0) ? 'inline-flex' : 'none';
}

// --- 5. RENDERERS ---
function renderGalleryGrid() {
    const grid = document.getElementById('ug-grid');
    const filtered = rawGalleryData.filter(item => 
        activeTab === 'youtube' ? item.media_type === 'youtube' : item.media_type !== 'youtube'
    );

    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">Belum ada dokumentasi.</div>';
        return;
    }

    grid.innerHTML = filtered.map((item, index) => {
        return `
            <div class="ug-card" onclick="window.openSwipeGallery(${index})">
                <img src="${utils.getTransformUrl(item.file_url, 'GRID', false)}" loading="lazy" onerror="this.src='${CONFIG.PLACEHOLDER}'">
                ${item.media_type === 'youtube' ? '<div class="yt-icon"><i class="fa-brands fa-youtube"></i></div>' : ''}
                <div class="ug-caption">${utils.getSystemCaption(index)}</div>
            </div>`;
    }).join('');
}

// --- 6. SWIPE GALLERY ---
window.openSwipeGallery = (startIndex) => {
    const lb = document.getElementById('lightbox');
    const content = document.getElementById('lb-content');
    const clickedItem = rawGalleryData[startIndex];

    lb.style.display = 'flex';

    if (clickedItem.media_type === 'youtube') {
        const embedUrl = clickedItem.file_url.replace('watch?v=', 'embed/');
        content.innerHTML = `
            <button class="lb-close-btn" onclick="window.closeLightboxManual()">&times;</button>
            <div class="lb-inner"><iframe src="${embedUrl}" frameborder="0" allowfullscreen></iframe></div>`;
        return;
    }

    const slideData = rawGalleryData.filter(item => item.media_type !== 'youtube');
    const initialSlideIdx = slideData.findIndex(d => d.id === clickedItem.id);
    const socialText = utils.getSocialCaption();

    content.innerHTML = `
        <button class="lb-close-btn" onclick="window.closeLightboxManual()">&times;</button>
        <div class="ug-slider-container">
            ${slideData.map((item, idx) => {
                const previewImg = utils.getTransformUrl(item.file_url, 'MODAL', true);
                const hdImg = utils.getTransformUrl(item.file_url, 'HD', true);

                return `
                    <div class="ug-slide" id="slide-${idx}">
                        ${item.media_type === 'video' 
                            ? `<video src="${item.file_url}" controls></video>` 
                            : `<img src="${previewImg}" onerror="this.src='${CONFIG.PLACEHOLDER}'">`}
                        
                        <div class="lb-controls">
                            <button class="btn-share-smart" onclick="window.handleSmartShare('${hdImg}', \`${socialText}\`)">
                                <i class="fa-brands fa-whatsapp"></i> Share ke Medsos
                            </button>
                            <button onclick="window.handleDownload('${hdImg}', 'Robopanda_Foto')" class="btn-dl-simple">
                                <i class="fa-solid fa-download"></i> Simpan HD
                            </button>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;

    setTimeout(() => {
        const target = document.getElementById(`slide-${initialSlideIdx}`);
        if (target) target.scrollIntoView();
    }, 100);
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

        for (let i = 0; i < photos.length; i++) {
            const item = photos[i];
            const url = utils.getTransformUrl(item.file_url, 'HD', true); 
            const filename = `Foto_${i+1}.jpg`;
            const imgBlob = await fetch(url).then(r => r.blob());
            folder.file(filename, imgBlob);
        }

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

window.closeLightboxManual = () => { document.getElementById('lightbox').style.display = 'none'; };

window.switchGalleryContext = (ctx) => {
    currentContext = ctx;
    activeClassId = activeSessionId = null;
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

// --- 8. UI LAYOUT & STYLES ---
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
        .ug-container { padding: 8px; max-width: 1000px; margin: 0 auto; font-family: 'Poppins', sans-serif; }
        .ug-nav-switcher { display: flex; gap: 5px; margin-bottom: 10px; }
        .nav-btn { flex: 1; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.8rem; font-weight: bold; background: white; outline: none; }
        .nav-btn.active { background: #4d97ff; color: white; border-color: #4d97ff; }
        .ug-filters { display: flex; gap: 8px; background: white; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 10px; }
        .filter-group { flex: 1; }
        .filter-group label { display: block; font-size: 0.6rem; color: #94a3b8; font-weight: bold; }
        .filter-group select { width: 100%; padding: 6px; border-radius: 5px; border: 1px solid #cbd5e1; font-size: 0.8rem; outline: none; }
        .ug-tabs { display: flex; gap: 10px; margin-bottom: 10px; }
        .tab-link { padding: 8px; font-size: 0.8rem; font-weight: bold; color: #94a3b8; border: none; background: none; cursor: pointer; }
        .tab-link.active { color: #4d97ff; border-bottom: 2px solid #4d97ff; }
        .ug-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
        @media (min-width: 900px) { .ug-grid { grid-template-columns: repeat(6, 1fr); } }
        .ug-card { background: white; border-radius: 6px; overflow: hidden; border: 1px solid #e2e8f0; position: relative; }
        .ug-card img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; }
        .ug-caption { padding: 4px; font-size: 0.5rem; color: #64748b; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .lightbox-overlay { position: fixed; inset: 0; background: black; display: none; z-index: 9999; align-items: center; justify-content: center; }
        .lb-close-btn { position: absolute; top: 20px; right: 20px; font-size: 2.5rem; color: white; background: none; border: none; z-index: 10001; cursor: pointer; }
        
        .ug-slider-container { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; width: 100%; height: 100vh; -webkit-overflow-scrolling: touch; }
        .ug-slider-container::-webkit-scrollbar { display: none; }
        .ug-slide { min-width: 100%; height: 100%; scroll-snap-align: start; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px; box-sizing: border-box; }
        .ug-slide img, .ug-slide video { max-width: 100%; max-height: 70vh; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        
        .lb-controls { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 20px; width: 100%; }
        .btn-share-smart { padding: 12px 30px; border-radius: 30px; border: none; background: #25D366; color: white; font-weight: bold; font-size: 1rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(37,211,102,0.4); }
        .btn-dl-simple { background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; }
        .btn-zip { background: #3b82f6; color: white; border: none; padding: 8px 20px; border-radius: 8px; font-weight: bold; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        
        .yt-icon { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 2rem; opacity: 0.8; pointer-events: none; }
        .empty-state { grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8; font-size: 0.8rem; }
    `;
    document.head.appendChild(s);
}