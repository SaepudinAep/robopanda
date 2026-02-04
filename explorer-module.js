import { supabase } from "./config.js";

// --- State Management (Tetap Asli) ---
let allLevels = [];

/**
 * 🎬 FUNGSI UTAMA (ENTRY POINT)
 * Diselaraskan untuk sistem modular index.js
 */
export async function init(container, userProfile) {
    // Memanggil fungsi utama Bapak
    await initExplorer(container);
    
    // Kirim log sederhana untuk memastikan data profil sampai (Opsional)
    if (userProfile) console.log("Explorer dimuat untuk siswa:", userProfile.name);
}

export async function initExplorer(container) {
    // 1. Injeksi Struktur HTML (100% Persis Kode Bapak)
    container.innerHTML = `
        <div class="explorer-controls" style="position: sticky; top: 0; z-index: 100; background: var(--gray-50); padding: 10px 0;">
            <div class="search-box" style="margin-bottom: 15px; width: 100%; max-width: 600px; margin-inline: auto;">
                <input type="text" id="searchMateri" placeholder="Cari misi robotik..." style="width: 100%;" />
                <span class="search-btn">🔍</span>
            </div>
            <nav class="level-tabs" id="levelTabs">
                <button class="tab-item active" data-level="all">Semua</button>
            </nav>
        </div>

        <section class="feed-section" id="live-missions-wrapper">
            <div class="section-header">
                <h2>🚀 Misi Aktif <span class="badge-live">LIVE</span></h2>
                <p>Materi yang sedang dipelajari di kelas saat ini</p>
            </div>
            <div class="horizontal-scroll" id="live-missions-list"></div>
        </section>

        <div id="level-rows-container"></div>

        <div class="modal-overlay" id="modal-explorer">
            <div class="modal-content">
                <button class="btn-close-modal" id="closeModal">&times; Tutup</button>
                <div class="modal-hero">
                    <img id="modal-image" src="" alt="Project Image" />
                    <img id="modal-watermark" src="https://res.cloudinary.com/dmm6avtxd/image/upload/Robopanda-Education_zwx0bm.png" class="modal-watermark" alt="Watermark" />
                    <div class="modal-overlay-info">
                        <span class="badge-level" id="modal-level">LEVEL</span>
                        <h2 id="modal-title" class="modal-title"></h2>
                        <span class="date-info" id="modal-date"></span>
                    </div>
                </div>
                <div class="modal-body">
                    <div class="content-block"><h3>Ringkasan Misi</h3><p id="modal-description"></p></div>
                    <div class="content-block"><h3>Rencana Pembelajaran</h3><div id="modal-detail" class="detail-text"></div></div>
                </div>
            </div>
        </div>
    `;

    // 2. Inisialisasi Logic (Tetap Asli)
    setupEventListeners();
    await loadInitialData();
}

// =========================================
// 🟢 LOGIKA INTERNAL (TIDAK ADA PERUBAHAN FITUR)
// =========================================

async function loadInitialData() {
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

    list.innerHTML = items.map(item => {
        const tgl = new Date(item.tanggal).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        const showWatermark = ["Robotic"].includes(item.level_kode);

        const mediaDisplay = item.image_url ? `
            <img src="${item.image_url}" class="card-img-main" loading="lazy" alt="${item.title}">
            ${showWatermark ? `<img src="https://res.cloudinary.com/dmm6avtxd/image/upload/Robopanda-Education_zwx0bm.png" class="card-watermark" alt="Robopanda Watermark">` : ""}
        ` : `<div class="card-icon-fallback">${getIconByLevel(item.level_kode)}</div>`;

        return `
            <div class="materi-card" onclick="openModalExplorer('${item.id}', '${item.tanggal}', '${item.source}')">
                <div class="card-image">${mediaDisplay}</div>
                <div class="card-content">
                    <span class="level-badge">${item.level_kode} <strong> | ${item.title}</strong></span>
                    <small> 📅 ${tgl} | ${item.source === "private" ? "🏠" : "🏫"}</small>
                </div>
            </div>`;
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

    for (const lvl of allLevels) {
        const [resSekolah, resPrivate] = await Promise.all([
            supabase.from("pertemuan_kelas").select("tanggal, materi:materi_id!inner(id, title, description, image_url, level_id, levels!inner(kode))").eq("materi.level_id", lvl.id).order("tanggal", { ascending: false }).limit(15),
            supabase.from("pertemuan_private").select("tanggal, materi:materi_id!inner(id, judul, deskripsi, image_url, level_id, levels!inner(kode))").eq("materi.level_id", lvl.id).order("tanggal", { ascending: false }).limit(15),
        ]);
        const combined = [...(resSekolah.data || []).map(i => standardizeData(i, "sekolah")), ...(resPrivate.data || []).map(i => standardizeData(i, "private"))]
            .filter(Boolean).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

        const unique = []; const map = new Map();
        combined.forEach(item => { if (!map.has(item.id)) { map.set(item.id, true); unique.push(item); } });

        if (unique.length > 0) {
            const rowHtml = `
                <section class="feed-section" id="row-${lvl.kode}">
                    <div class="section-header"><h2>${getIconByLevel(lvl.kode)} ${lvl.kode} Recent History</h2></div>
                    <div class="horizontal-scroll" id="list-${lvl.id}" data-level-row="${lvl.kode}"></div>
                </section>`;
            container.insertAdjacentHTML("beforeend", rowHtml);
            renderCards(unique, `list-${lvl.id}`);
        }
    }
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
            const list = s.querySelector("[data-level-row]");
            if (list) { list.classList.add("horizontal-scroll"); list.classList.remove("grid-layout"); }
        });
    } else {
        if (liveWrapper) liveWrapper.style.display = "none";
        allSections.forEach(s => {
            if (s.id === `row-${kode}`) {
                s.style.display = "block";
                const list = s.querySelector("[data-level-row]");
                if (list) { list.classList.remove("horizontal-scroll"); list.classList.add("grid-layout"); }
            } else { s.style.display = "none"; }
        });
    }
}

function setupEventListeners() {
    // 1. Search Logic
    const searchInput = document.getElementById("searchMateri");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll(".materi-card").forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? "block" : "none";
            });
        });
    }

    // 2. Modal Logic (Safety Fix: Menghindari Global window.onclick)
    const modal = document.getElementById("modal-explorer");
    const closeBtn = document.getElementById("closeModal");
    
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.classList.remove("active");
            document.body.style.overflow = "auto";
        };
    }

    // Mengganti window.onclick menjadi listener pada elemen modal saja
    modal.addEventListener('click', (e) => {
        if (e.target.id === "modal-explorer") {
            modal.classList.remove("active");
            document.body.style.overflow = "auto";
        }
    });
}

// Tetap global agar onclick di HTML string kartu bisa memanggilnya
window.openModalExplorer = async (materiId, tanggal, source) => {
    const modal = document.getElementById("modal-explorer");
    const table = source === "private" ? "materi_private" : "materi";
    const { data } = await supabase.from(table).select("*, levels(kode)").eq("id", materiId).single();
    if (!data) return;

    const levelKode = data.levels?.kode || "ROBOTIC";
    document.getElementById("modal-image").src = optimizeCloudinary(data.image_url);
    document.getElementById("modal-watermark").style.display = levelKode === "Robotic" ? "block" : "none";
    document.getElementById("modal-title").textContent = data.judul || data.title;
    document.getElementById("modal-level").textContent = levelKode;
    document.getElementById("modal-date").textContent = new Date(tanggal).toLocaleDateString("id-ID", { day:'numeric', month:'long', year:'numeric' });
    document.getElementById("modal-description").textContent = data.deskripsi || data.description || "";
    document.getElementById("modal-detail").textContent = data.detail || "";

    modal.classList.add("active");
    document.body.style.overflow = "hidden";
};