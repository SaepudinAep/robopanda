/**
 * Project: Robopanda Client (Public/Student)
 * File: assets/js/index.js
 * Location: assets/js/
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from './config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- 1. STATE MANAGEMENT ---
let currentUser = null;
let userProfile = null;
let publicMenus = [];
let currentActiveModule = 'explorer-module'; // Default disesuaikan dengan nama file

// --- 2. INISIALISASI ---
document.addEventListener('DOMContentLoaded', () => {
    console.log(" Robopanda Foundation: Active.");

    // Pastikan nama ini sesuai nama file fisik (explorer-module.js)
    loadModule('explorer-module'); 
    
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
            fetchPublicMenus(); 
        } 
        
        if (event === 'SIGNED_OUT') {
            currentUser = null;
            userProfile = null;
            updateAuthUI();
            fetchPublicMenus(); 
            // Jika sedang di gallery, kembalikan ke explorer
            if (currentActiveModule === 'galeri-harian' || currentActiveModule === 'gallery') {
                loadModule('explorer-module');
            }
        }
    });
}

// =========================================
//  SEKTOR DATA
// =========================================
async function fetchPublicMenus() {
    try {
        // Ambil ID Kategori Homepage
        const { data: catData } = await supabase
            .from('menu_categories')
            .select('id')
            .eq('category_key', 'homepage')
            .single();

        if (!catData) return;

        // Ambil Menu
        const { data } = await supabase
            .from('app_menus')
            .select('*')
            .eq('category', catData.id) 
            .eq('is_active', true)
            .order('order_index', { ascending: true });

        publicMenus = data || [];
        renderNavbar();

    } catch (err) {
        console.error("System Error:", err);
    }
}

function renderNavbar() {
    const nav = document.getElementById('main-nav-categories');
    if (!nav) return;

    nav.innerHTML = publicMenus.map(menu => {
        // Cek Role
        let allowedRoles = [];
        try { allowedRoles = typeof menu.allowed_roles === 'string' ? JSON.parse(menu.allowed_roles) : menu.allowed_roles; } catch(e){}
        
        const isProtected = allowedRoles && allowedRoles.length > 0;
        if (isProtected) {
            if (!currentUser || !userProfile) return ''; // Hide jika belum login
            if (!allowedRoles.includes(userProfile.role)) return ''; // Hide jika role beda
        }

        return `
            <button class="tab-item ${currentActiveModule === menu.route ? 'active' : ''}" 
                    onclick="window.loadModule('${menu.route}')">
                ${menu.title}
            </button>
        `;
    }).join('');
}

// =========================================
//  MODULE LOADER (STRICT PATH)
// =========================================

async function loadModule(name) {
    currentActiveModule = name; 
    const contentArea = document.getElementById('app-content');
    if (!contentArea) return;

    contentArea.innerHTML = `<div style="text-align:center; padding:100px; color:#666;"><i class="fa-solid fa-spinner fa-spin"></i> Menyiapkan ${name}...</div>`;

    try {
        // [FIX STRICT] Hanya menambahkan .js
        // Pastikan parameter 'name' sesuai dengan nama file fisik (misal: 'explorer-module')
        const module = await import(`../../modules/${name}.js?t=${Date.now()}`);
        
        contentArea.innerHTML = ''; 

        // Deteksi fungsi init yang tersedia
        if (module.initExplorer) {
            await module.initExplorer(contentArea, userProfile);
        } else if (module.init) {
            await module.init(contentArea, userProfile);
        }
        
        // Update Active Tab UI
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));

    } catch (err) {
        console.error("Critical Error Load Modul:", err);
        contentArea.innerHTML = `
            <div style="padding:50px; text-align:center; color:red;">
                <h3>Gagal memuat modul ${name}</h3>
                <p>File tidak ditemukan: <code>modules/${name}.js</code></p>
            </div>`;
    }
}
window.loadModule = loadModule;

// --- Fungsi Auth UI & Helpers ---

async function refreshUserProfile() {
    if (!currentUser) return;
    const { data } = await supabase.from('user_profiles').select('*').eq('id', currentUser.id).single();
    userProfile = data;
}

function updateAuthUI() {
    const authArea = document.getElementById('auth-area');
    if (!authArea) return;
    if (currentUser && userProfile) {
        authArea.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="text-align:right">
                    <div style="font-size:0.8rem; font-weight:bold; color:#3b82f6;">${userProfile.name}</div>
                    <div style="font-size:0.6rem; color:#64748b; text-transform:uppercase;">${userProfile.role}</div>
                </div>
                <button id="btn-logout-action" class="btn-login-trigger" style="background:#ef4444;">Logout</button>
            </div>`;
        document.getElementById('btn-logout-action').onclick = async () => {
            await supabase.auth.signOut();
            window.location.reload();
        };
    } else {
        authArea.innerHTML = `<button class="btn-login-trigger" id="btn-show-login">Login Siswa</button>`;
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
    btn.innerText = "Memproses...";
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) { 
        alert(error.message); 
        btn.disabled = false; 
        btn.innerText = "Masuk Sekarang";
    } else { 
        hideLoginModal(); 
    }
}

function setupAuthListeners() {
    const btn = document.getElementById('btn-do-login');
    if (btn) btn.onclick = handleLogin;
    const close = document.getElementById('btn-close-login');
    if (close) close.onclick = hideLoginModal;
}

function showLoginModal() { 
    const modal = document.getElementById('modal-login');
    if(modal) modal.style.display = 'flex'; 
}

function hideLoginModal() { 
    const modal = document.getElementById('modal-login');
    if(modal) modal.style.display = 'none'; 
}