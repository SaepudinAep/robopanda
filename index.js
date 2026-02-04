import { supabase } from "./config.js";

// --- 1. STATE MANAGEMENT ---
let currentUser = null;
let userProfile = null;
let publicMenus = [];
let currentActiveModule = 'explorer'; 

// --- 2. INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Robopanda Foundation: Active.");

    // Load Explorer langsung tanpa menunggu auth
    loadModule('explorer'); 
    fetchPublicMenus();
    setupAuthListeners();
    initAuthLogic(); 
});

// --- 3. LOGIKA AUTHENTICATION ---
async function initAuthLogic() {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    
    if (currentUser) await refreshUserProfile();
    updateAuthUI();

    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            await refreshUserProfile();
            updateAuthUI();
            renderNavbar(); 
        } 
        
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            updateAuthUI();
            renderNavbar(); 
            if (currentActiveModule === 'gallery') loadModule('explorer');
        }
    });
}

// =========================================
// 🟢 SEKTOR DATA (Ambil Isi Menu, Bukan Kategori)
// =========================================
async function fetchPublicMenus() {
    console.log("🔍 Mencari menu dengan kategori: 'homepage'...");

    const { data, error } = await supabase
        .from('app_menus')
        .select('*')
        .eq('category', 'homepage') // SUDAH DIPERBAIKI: pakai 'e' (homepage)
        .eq('is_active', true)
        .order('order_index', { ascending: true });

    if (error) {
        console.error("❌ Error Supabase:", error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.warn("⚠️ Data kosong! Pastikan kolom 'category' di DB tertulis 'homepage'");
    } else {
        publicMenus = data;
        console.log("✅ Berhasil memuat menu:", publicMenus);
        renderNavbar();
    }
}

function renderNavbar() {
    const nav = document.getElementById('main-nav-categories');
    if (!nav) return;

    nav.innerHTML = publicMenus.map(menu => {
        // Karena di database kolom 'route' isinya sudah 'explorer' atau 'gallery'
        const moduleKey = menu.route; 
        
        return `
            <button class="tab-item ${currentActiveModule === moduleKey ? 'active' : ''}" 
                    data-module="${moduleKey}">
                ${menu.title}
            </button>
        `;
    }).join('');

    nav.querySelectorAll('.tab-item').forEach(btn => {
        btn.onclick = () => {
            const mod = btn.dataset.module;
            if (mod === 'gallery' && !currentUser) {
                showLoginModal();
            } else {
                loadModule(mod);
                setActiveTab(btn);
            }
        };
    });
}

// =========================================
// 🟢 MODULE LOADER
// =========================================

async function loadModule(name) {
    currentActiveModule = name; 
    const contentArea = document.getElementById('app-content');
    if (!contentArea) return;

    contentArea.innerHTML = `<div style="text-align:center; padding:100px;">⏳ Menyiapkan ${name}...</div>`;

    try {
        // Memanggil file berdasarkan nama moduleKey (contoh: explorer-module.js)
        const module = await import(`./${name}-module.js`);
        
        if (module.initExplorer && name === 'explorer') {
            await module.initExplorer(contentArea, userProfile);
        } else if (module.init) {
            await module.init(contentArea, userProfile);
        }
    } catch (err) {
        console.error("Critical Error Load Modul:", err);
        contentArea.innerHTML = `<div style="padding:50px; text-align:center; color:red;">Gagal memuat modul ${name}.</div>`;
    }
}

// --- Fungsi Auth UI & Helpers Tetap Sama ---

async function refreshUserProfile() {
    if (!currentUser) return;
    const { data, error } = await supabase
        .from('user_profiles')
        .select('name, role, school_id, class_id, group_id, class_private_id')
        .eq('id', currentUser.id)
        .single();
    if (!error) userProfile = data;
}

function updateAuthUI() {
    const authArea = document.getElementById('auth-area');
    if (!authArea) return;
    if (currentUser && userProfile) {
        authArea.innerHTML = `
            <div class="user-badge" style="display:flex; align-items:center; gap:12px; border-left:1px solid #eee; padding-left:15px;">
                <div style="text-align:right">
                    <div style="font-size:0.8rem; font-weight:bold; color:var(--primary);">${userProfile.name}</div>
                    <div style="font-size:0.6rem; color:var(--gray-500); text-transform:uppercase;">${userProfile.role}</div>
                </div>
                <button id="btn-logout-action" class="btn-login-trigger" style="background:var(--accent-red); cursor:pointer;">Logout</button>
            </div>`;
        document.getElementById('btn-logout-action').onclick = () => supabase.auth.signOut();
    } else {
        authArea.innerHTML = `<button class="btn-login-trigger" id="btn-show-login" style="cursor:pointer;">Login Siswa</button>`;
        const btnShow = document.getElementById('btn-show-login');
        if (btnShow) btnShow.onclick = showLoginModal;
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-do-login');
    if (!email || !password) return alert("Data tidak lengkap!");
    btn.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { alert(error.message); btn.disabled = false; } else { hideLoginModal(); }
}

function setupAuthListeners() {
    const btn = document.getElementById('btn-do-login');
    if (btn) btn.onclick = handleLogin;
    const close = document.getElementById('btn-close-login');
    if (close) close.onclick = hideLoginModal;
}
function showLoginModal() { document.getElementById('modal-login').style.display = 'flex'; }
function hideLoginModal() { document.getElementById('modal-login').style.display = 'none'; }
function setActiveTab(btn) {
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}