/**
 * Project: Explorer Module
 * Location: modules/explorer-module.js
 * Fix: Menambahkan inisialisasi client Supabase agar data bisa dimuat.
 */

// 1. IMPORT LIBRARY (WAJIB ADA)
import { supabase } from '../assets/js/config.js';
import { escapeHtml } from '../assets/js/utils.js';

// 2. Client Supabase singleton dibagikan dari config.js
//    (sebelumnya setiap modul membuat instance sendiri → boros memori/koneksi)

// --- State Management (Tetap Asli) ---
let allLevels = [];
// Cache data kartu yang sudah dimuat. Dipakai saat membuka modal agar
// deskripsi langsung muncul tanpa bergantung hasil query ulang yang bisa gagal.
const cardsCache = new Map();

/**
 * 🎬 FUNGSI UTAMA (ENTRY POINT)
 * Diselaraskan untuk sistem modular index.js
 */
export async function init(container, userProfile) {
    // Memanggil fungsi utama Bapak
    await initExplorer(container, userProfile);
    
    // Kirim log sederhana untuk memastikan data profil sampai (Opsional)
    if (userProfile) console.log("Explorer dimuat untuk siswa:", userProfile.name);
}

export async function initExplorer(container, userProfile) {
    // Sambutan personal jika sudah login
    const greetName = userProfile?.name
        ? `, ${escapeHtml(userProfile.name.split(' ')[0])}`
        : '';
    const greeting = userProfile?.name
        ? `Halo${greetName}! 👋`
        : 'Jelajahi Misi Robotik 🤖';

    // 1. Injeksi Struktur HTML
    container.innerHTML = `
        <div class="explorer-page-head">
            <span class="explorer-eyebrow">Robopanda Explorer</span>
            <h1 class="explorer-page-title">${greeting}</h1>
            <p>Pilih level favorit atau cari misi untuk lihat hasil karya kelas terbaru.</p>
        </div>

        <div class="explorer-controls">
            <div class="search-box">
                <input type="text" id="searchMateri" placeholder="Cari misi robotik..." aria-label="Cari misi robotik" />
                <span class="search-btn">🔍</span>
            </div>
            <nav class="level-tabs" id="levelTabs" aria-label="Filter level">
                <button class="tab-item active" data-level="all">Semua</button>
            </nav>
        </div>

        <section class="feed-section" id="live-missions-wrapper">
            <div class="section-header">
                <h2><span class="section-icon">🚀</span> Misi Aktif <span class="badge-live">LIVE</span></h2>
                <p>Materi yang sedang dipelajari di kelas saat ini</p>
            </div>
            <div class="horizontal-scroll" id="live-missions-list"></div>
        </section>

        <div id="level-rows-container"></div>

        <div class="modal-overlay" id="modal-explorer">
            <div class="modal-content">
                <button class="btn-close-modal" id="closeModal" aria-label="Tutup modal">&times;</button>
                <div class="modal-hero">
                    <img id="modal-image" src="https://placehold.co/800x600?text=Robopanda" alt="" aria-hidden="true" />
                    <img id="modal-watermark" src="https://res.cloudinary.com/dmm6avtxd/image/upload/Robopanda-Education_zwx0bm.png" class="modal-watermark" alt="" aria-hidden="true" />
                    <div class="modal-overlay-info">
                        <span class="badge-level" id="modal-level">LEVEL</span>
                        <h2 id="modal-title" class="modal-title"></h2>
                        <span class="date-info" id="modal-date"></span>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="content-block"><h3>Deskripsi Robot</h3><p id="modal-description" class="modal-description-text"></p></div>
                    <div class="content-block"><h3>Rencana Pembelajaran</h3><div id="modal-detail" class="detail-text"></div></div>
                    <div style="margin-top: 20px; text-align: center;">
                        <button id="btn-modal-to-gallery" class="btn-login-trigger" onclick="const m=document.getElementById('modal-explorer');if(m)m.classList.remove('active');document.body.style.overflow='';if(window.loadModule){window.loadModule('gallery-module');}">
                            <i class="fa-solid fa-camera"></i> Lihat Galeri Hasil Karya
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 2. Inisialisasi Logic
    setupEventListeners();
    showSkeletons();
    await loadInitialData();
}

// Skeleton saat memuat data
function showSkeletons() {
    const liveEl = document.getElementById("live-missions-list");
    if (liveEl) {
        liveEl.innerHTML = Array.from({ length: 4 }, (_, i) =>
            `<div class="skeleton-card" style="min-width:260px; height:300px; animation-delay:${i * 0.15}s;"></div>`
        ).join("");
    }
    const rows = document.getElementById("level-rows-container");
    if (rows) {
        rows.innerHTML = `<div class="keyformance-loading loading-placeholder" style="justify-content:center; padding: 40px;">Memuat kategori level…</div>`;
    }
}

// =========================================
// 🟢 LOGIKA INTERNAL (TIDAK ADA PERUBAHAN FITUR)
// =========================================

async function loadInitialData() {
    // Variable 'supabase' sekarang sudah dikenali berkat fix di baris 12
    const { data: levels } = await supabase.from("levels").select("*").order("kode");
    allLevels = levels || [];
    
    renderLevelTabs();
    await loadLiveMissions();
    await loadLevelRows();
}

function optimizeCloudinary(url) {
    if (!url || !url.includes("cloudinary")) return url;
    return url.replace("/upload/", "/upload/f_auto,q_auto/");
}

function standardizeData(rawItem, source) {
    const m = rawItem.materi;
    if (!m) return null;
    return {
        id: m.id,
        title: m.judul || m.title,
        description: m.deskripsi || m.description,
        detail: m.detail,
        image_url: optimizeCloudinary(m.image_url),
        level_kode: m.levels?.kode || "ROBOT",
        level_id: m.level_id,
        tanggal: rawItem.tanggal,
        source: source,
    };
}

function renderCards(items, containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;

    if (!items.length) {
        list.innerHTML = `<div class="empty-row"><span class="empty-emoji" aria-hidden="true">📭</span><p>Belum ada misi untuk kategori ini.</p></div>`;
        return;
    }

    // Simpan data kartu untuk modal (deskripsi pasti tersedia saat klik)
    items.forEach(it => { if (it?.id) cardsCache.set(it.id, it); });

    list.innerHTML = items.map(item => {
        const tgl = new Date(item.tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        const showWatermark = item.level_kode === "Robotic";
        const levelIcon = getIconByLevel(item.level_kode);
        const sourceIcon = item.source === "private" ? "🏠" : "🏫";
        const sourceLabel = item.source === "private" ? "Private" : "Sekolah";
        const title = escapeHtml(item.title);
        const levelKode = escapeHtml(item.level_kode);
        // Deskripsi singkat robot dari database (kolom deskripsi/description)
        const description = escapeHtml(item.description);
        const descHtml = description
            ? `<p class="card-desc">${description}</p>`
            : `<p class="card-desc card-desc-empty">Deskripsi robot sedang disiapkan.</p>`;

        const mediaDisplay = item.image_url ? `
            <img src="${escapeHtml(item.image_url)}" class="card-img-main" loading="lazy" alt="Ilustrasi ${title}"
                 onerror="this.src='https://placehold.co/400x400?text=' + encodeURIComponent('🤖')">
            ${showWatermark ? `<img src="https://res.cloudinary.com/dmm6avtxd/image/upload/Robopanda-Education_zwx0bm.png" class="card-watermark" alt="" aria-hidden="true">` : ""}
        ` : `<div class="card-icon-fallback">${levelIcon}</div>`;

        return `
            <article class="materi-card" role="button" tabindex="0"
                     data-id="${item.id}" data-tgl="${item.tanggal}" data-src="${item.source}"
                     aria-label="Buka misi ${title}"
                     onclick="openModalExplorer('${item.id}', '${item.tanggal}', '${item.source}')">
                <div class="card-image">${mediaDisplay}</div>
                <div class="card-content">
                    <div class="card-topline">
                        <span class="level-badge" data-level="${levelKode}">${levelIcon} ${levelKode}</span>
                    </div>
                    <h3 class="card-title">${title}</h3>
                    ${descHtml}
                    <div class="card-meta">
                        <span class="card-meta-item"><span class="ic" aria-hidden="true">${sourceIcon}</span> ${sourceLabel}</span>
                        <span class="card-meta-item"><span class="ic" aria-hidden="true">📅</span> ${tgl}</span>
                    </div>
                </div>
            </article>`;
    }).join("");
}

async function loadLiveMissions() {
    const [resSekolah, resPrivate] = await Promise.all([
        supabase.from("pertemuan_kelas").select("tanggal, materi:materi_id(id, title, description, image_url, level_id, levels(kode))").order("tanggal", { ascending: false }).limit(10),
        supabase.from("pertemuan_private").select("tanggal, materi:materi_id(id, judul, deskripsi, image_url, level_id, levels(kode))").order("tanggal", { ascending: false }).limit(10),
    ]);
    const combined = [...(resSekolah.data || []).map(i => standardizeData(i, "sekolah")), ...(resPrivate.data || []).map(i => standardizeData(i, "private"))]
        .filter(Boolean).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    
    const unique = []; const map = new Map();
    for (const item of combined) { if (!map.has(item.id)) { map.set(item.id, true); unique.push(item); } }

    renderCards(unique.slice(0, 8), "live-missions-list");
}

async function loadLevelRows() {
    const container = document.getElementById("level-rows-container");
    if (!container) return;
    container.innerHTML = "";

    // Jalankan semua level secara paralel (bukan waterfall serial)
    const results = await Promise.all(allLevels.map(async (lvl) => {
        const [resSekolah, resPrivate] = await Promise.all([
            supabase.from("pertemuan_kelas").select("tanggal, materi:materi_id!inner(id, title, description, image_url, level_id, levels!inner(kode))").eq("materi.level_id", lvl.id).order("tanggal", { ascending: false }).limit(15),
            supabase.from("pertemuan_private").select("tanggal, materi:materi_id!inner(id, judul, deskripsi, image_url, level_id, levels!inner(kode))").eq("materi.level_id", lvl.id).order("tanggal", { ascending: false }).limit(15),
        ]);
        const combined = [...(resSekolah.data || []).map(i => standardizeData(i, "sekolah")), ...(resPrivate.data || []).map(i => standardizeData(i, "private"))]
            .filter(Boolean).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

        const unique = []; const map = new Map();
        combined.forEach(item => { if (!map.has(item.id)) { map.set(item.id, true); unique.push(item); } });
        return { lvl, items: unique };
    }));

    results.forEach(({ lvl, items }) => {
        if (items.length > 0) {
            const lvlKode = escapeHtml(lvl.kode);
            const rowHtml = `
                <section class="feed-section" id="row-${lvlKode}">
                    <div class="section-header"><h2><span class="section-icon">${getIconByLevel(lvl.kode)}</span> ${lvlKode} <small>Recent History</small></h2></div>
                    <div class="horizontal-scroll" id="list-${lvl.id}" data-level-row="${lvlKode}"></div>
                </section>`;
            container.insertAdjacentHTML("beforeend", rowHtml);
            renderCards(items, `list-${lvl.id}`);
        }
    });
}

function getIconByLevel(kode) {
    const icons = { Kiddy: "🧩", Beginner: "⚙️", Robotic: "🤖", "Terapi Wicara": "🗣️" };
    return icons[kode] || "🚀";
}

function renderLevelTabs() {
    const tabsContainer = document.getElementById("levelTabs");
    allLevels.forEach(lvl => {
        const btn = document.createElement("button");
        btn.className = "tab-item";
        btn.textContent = lvl.kode;
        btn.onclick = (e) => filterByLevel(lvl.kode, e.target);
        tabsContainer.appendChild(btn);
    });
    const btnAll = tabsContainer.querySelector('[data-level="all"]');
    if (btnAll) btnAll.onclick = (e) => filterByLevel("all", e.target);
}

function filterByLevel(kode, btn) {
    document.querySelectorAll(".level-tabs .tab-item").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    const liveWrapper = document.getElementById("live-missions-wrapper");
    const allSections = document.querySelectorAll(".feed-section[id^='row-']");

    if (kode === "all") {
        if (liveWrapper) liveWrapper.style.display = "block";
        allSections.forEach(s => {
            s.style.display = "block";
            s.classList.remove("is-grid");
            const list = s.querySelector("[data-level-row]");
            if (list) { list.classList.add("horizontal-scroll"); list.classList.remove("grid-layout"); }
        });
    } else {
        if (liveWrapper) liveWrapper.style.display = "none";
        allSections.forEach(s => {
            if (s.id === `row-${kode}`) {
                s.style.display = "block";
                s.classList.add("is-grid"); // matikan fade-edge di grid
                const list = s.querySelector("[data-level-row]");
                if (list) { list.classList.remove("horizontal-scroll"); list.classList.add("grid-layout"); }
            } else { s.style.display = "none"; }
        });
    }
}

// Guard: bind keyboard handler HANYA sekali per sesi SPA.
// Sebelumnya listener document.keydown ditambahkan setiap init → menumpuk (memory leak).
let explorerKeyBound = false;

function closeExplorerModal() {
    const modal = document.getElementById("modal-explorer");
    if (modal) modal.classList.remove("active");
    document.body.style.overflow = "";
}

function bindExplorerKeyboard() {
    if (explorerKeyBound) return;
    explorerKeyBound = true;

    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById("modal-explorer");
        if (!modal) return;

        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeExplorerModal();
            return;
        }

        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.materi-card')) {
            const card = e.target.closest('.materi-card');
            if (card.dataset.id) {
                e.preventDefault();
                openModalExplorer(card.dataset.id, card.dataset.tgl, card.dataset.src);
            }
        }
    });
}

function setupEventListeners() {
    // 1. Search Logic + status hasil
    const searchInput = document.getElementById("searchMateri");

    function runSearch(q) {
        const cards = document.querySelectorAll(".materi-card");
        let shown = 0;
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const match = !q || text.includes(q);
            card.style.display = match ? "" : "none";
            if (match) shown++;
        });

        // Sembunyikan section yang sudah tidak punya kartu terlihat
        document.querySelectorAll(".feed-section").forEach(sec => {
            const firstCard = sec.querySelector(".materi-card");
            const visible = !firstCard || !![...sec.querySelectorAll(".materi-card")].find(c => c.style.display !== "none");
            sec.style.display = visible ? "" : "none";
        });

        const status = document.getElementById("search-status");
        if (status) {
            if (!q) { status.style.display = "none"; status.textContent = ""; }
            else {
                status.style.display = "block";
                status.textContent = shown === 0
                    ? "Tidak ada misi yang cocok. Coba kata lain. 🔍"
                    : `Menampilkan ${shown} misi yang cocok.`;
            }
        }
    }

    if (searchInput) {
        // placeholder status hasil pencarian di bawah controls
        const status = document.createElement("div");
        status.id = "search-status";
        status.className = "search-status";
        status.setAttribute("aria-live", "polite");
        status.style.display = "none";
        searchInput.closest(".explorer-controls")?.appendChild(status);

        searchInput.addEventListener("input", (e) => runSearch(e.target.value.trim().toLowerCase()));
    }

    // 2. Modal: tutup tombol, backdrop, Esc
    const modal = document.getElementById("modal-explorer");
    const closeBtn = document.getElementById("closeModal");

    if (closeBtn) closeBtn.onclick = closeExplorerModal;

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === "modal-explorer") closeExplorerModal();
        });
    }

    // 3. Keyboard support (Esc + kartu role=button) — bind sekali saja
    bindExplorerKeyboard();
}

// Tetap global agar onclick di HTML string kartu bisa memanggilnya
window.openModalExplorer = async (materiId, tanggal, source) => {
    const modal = document.getElementById("modal-explorer");
    const table = source === "private" ? "materi_private" : "materi";
    const fallbackImg = "https://placehold.co/800x600?text=Robopanda";

    // Data dari cache kartu — deskripsi yang sama dengan yang tampil di kartu
    // Sumber JAMINAN deskripsi muncul di modal meskipun query DB gagal.
    const cached = cardsCache.get(materiId) || null;

    let data = null;
    try {
        // 1) Coba query lengkap dengan join level (untuk badge modal)
        let res = await supabase.from(table).select("*, levels(kode)").eq("id", materiId).maybeSingle();
        // 2) Jika join/relasi gagal atau tidak menemukan, fallback ke query polos
        //    agar deskripsi tetap bisa diambil tanpa ketergantungan join.
        if (res.error || !res.data) {
            res = await supabase.from(table).select("*").eq("id", materiId).maybeSingle();
        }
        if (res.error) console.warn("[Explorer] Query materi gagal:", res.error);
        data = res.data;
    } catch (e) {
        console.warn("[Explorer] Gagal memuat data misi:", e);
        data = null;
    }

    // Gabungkan hasil DB dengan cache kartu:
    // nilai dari DB menang HANYA jika tidak null/kosong, sisanya pakai cache kartu
    // (data yang persis sama dengan yang tampil di kartu — deskripsi pasti muncul).
    const merged = { ...(cached || {}) };
    if (data) {
        for (const [k, v] of Object.entries(data)) {
            if (v !== null && v !== undefined && v !== "") merged[k] = v;
        }
    }

    const imgEl = document.getElementById("modal-image");
    if (imgEl) {
        imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = fallbackImg; };
        imgEl.src = merged.image_url ? optimizeCloudinary(merged.image_url) : fallbackImg;
    }

    const levelKode = merged.levels?.kode || merged.level_kode || "ROBOTIC";
    if (document.getElementById("modal-watermark")) {
        document.getElementById("modal-watermark").style.display = levelKode === "Robotic" ? "block" : "none";
    }
    if (document.getElementById("modal-title")) document.getElementById("modal-title").textContent = merged.judul || merged.title || "Tanpa judul";
    if (document.getElementById("modal-level")) document.getElementById("modal-level").textContent = levelKode;
    if (document.getElementById("modal-date")) {
        document.getElementById("modal-date").textContent = new Date(tanggal).toLocaleDateString("id-ID", { day:'numeric', month:'long', year:'numeric' });
    }
    // Deskripsi robot: kolom deskripsi (private) / description (sekolah);
    // cache kartu sudah menstandarkan keduanya ke field `description`.
    const descEl = document.getElementById("modal-description");
    if (descEl) descEl.textContent = merged.deskripsi || merged.description || "Belum ada deskripsi untuk robot ini.";
    if (document.getElementById("modal-detail")) document.getElementById("modal-detail").textContent = merged.detail || "Detail misi sedang disiapkan.";

    if (modal) modal.classList.add("active");
    document.body.style.overflow = "hidden";
    const closeBtn = document.getElementById("closeModal");
    if (closeBtn) closeBtn.focus();
};