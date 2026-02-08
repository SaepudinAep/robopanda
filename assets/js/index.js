/**
 * Project: Robopanda Client
 * File: assets/js/index.js
 * Version: 6.1 - Fixed Filter Logic (Admin sees Guest Menus)
 * Format: Plain Text (Huawei T10s Optimized)
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from './config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- 1. STATE MANAGEMENT ---
let currentUser = null;
// Ambil role asli dari localStorage jika ada (misal: super_admin), jika tidak default guest
let userProfile = { 
    role: localStorage.getItem('user_role') || 'guest' 
}; 
let currentActiveModule = 'explorer-module';

// --- 2. DATA DARURAT (HARDCODED) ---
// Agar Navbar muncul 0 detik tanpa nunggu database
const STATIC_MENUS = [
    { title: 'Home', route: 'explorer-module', icon_class: 'fa-solid fa-house', allowed_roles: '["guest"]' },
    { title: 'Tools', route: 'tools', icon_class: 'fa-solid fa-gamepad', allowed_roles: '["guest"]' }
];

// --- 3. INISIALISASI ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("System: Starting with role ->", userProfile.role);

    // LANGKAH 1: RENDER LANGSUNG (Pakai Data Darurat)
    // Kita render dulu agar layar tidak blank.
    renderNavbar(STATIC_MENUS); 
    
    // LANGKAH 2: LOAD MODUL UTAMA
    loadModule('explorer-module');

    // LANGKAH 3: AMBIL MENU LIVE DARI DB (Update jika ada perubahan)
    await fetchPublicMenus();

    // LANGKAH 4: CEK SESI USER DI BACKGROUND
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
        currentUser = session.user;
        const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', currentUser.id).single();
        if (profile) {
            userProfile = profile;
            localStorage.setItem('user_role', profile.role); // Simpan role asli
            
            // Render ulang menu dengan role baru (Admin akan tetap melihat menu Guest + Menu Admin)
            await fetchPublicMenus();
            updateAuthUI(true);
        }
    } else {
        localStorage.setItem('user_role', 'guest');
        updateAuthUI(false);
    }

    setupAuthListeners();
});

// --- 4. LOGIKA FILTER MENU (PERBAIKAN UTAMA) ---
async function fetchPublicMenus() {
    try {
        const { data: catData } = await supabase.from('menu_categories').select('id').eq('category_key', 'homepage').single();
        if (!catData) return;

        const { data: allMenus } = await supabase.from('app_menus')
            .select('*')
            .eq('category', catData.id)
            .eq('is_active', true)
            .order('order_index');

        if (allMenus) {
            renderNavbar(allMenus);
        }
    } catch (err) {
        console.error("Menu Fetch Error (Using Static):", err);
    }
}

function renderNavbar(menus) {
    const nav = document.getElementById('main-nav-categories');
    if (!nav) return;

    // --- FILTER LOGIC ---
    const filtered = menus.filter(menu => {
        let allowed = [];
        try {
            // Normalisasi data JSON
            allowed = typeof menu.allowed_roles === 'string' ? JSON.parse(menu.allowed_roles) : menu.allowed_roles;
        } catch(e) { allowed = []; }

        // RULE 1: JIKA MENU UNTUK 'GUEST', MAKA SEMUA ORANG BOLEH LIHAT
        // (Termasuk Admin, Guru, dll). Ini kunci agar Home/Tools tidak hilang.
        if (allowed.includes('guest')) return true;

        // RULE 2: JIKA TIDAK, CEK APAKAH ROLE USER ADA DI DAFTAR IZIN
        // (Misal: Menu Admin Panel hanya untuk super_admin)
        if (allowed.includes(userProfile.role)) return true;

        return false;
    });

    // Render HTML
    nav.innerHTML = filtered.map(m => `
        <button class="tab-item ${currentActiveModule === m.route ? 'active' : ''}" 
                id="btn-nav-${m.route}"
                onclick="window.loadModule('${m.route}')">
            <i class="${m.icon_class || ''}"></i> ${m.title}
        </button>
    `).join('');
}

// --- 5. MODULE LOADER ---
async function loadModule(name) {
    currentActiveModule = name; 
    const contentArea = document.getElementById('app-content');
    if (!contentArea) return;

    contentArea.innerHTML = `<div style="text-align:center; padding:100px; color:#94a3b8;"><i class="fa-solid fa-spinner fa-spin"></i></div>`;

    try {
        const module = await import(`../../modules/${name}.js?v=${Date.now()}`);
        contentArea.innerHTML = ''; 

        if (module.initExplorer) {
            await module.initExplorer(contentArea, userProfile);
        } else if (module.init) {
            await module.init(contentArea, userProfile);
        }
        
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-nav-${name}`);
        if (btn) btn.classList.add('active');

    } catch (err) {
        contentArea.innerHTML = `<div style="padding:50px; text-align:center; color:#ef4444;">Modul tidak tersedia.</div>`;
    }
}

// --- 6. AUTH UI ---
function updateAuthUI(isLoggedIn) {
    const authArea = document.getElementById('auth-area');
    if (!authArea) return;

    if (isLoggedIn) {
        authArea.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="text-align:right">
                    <div style="font-size:0.8rem; font-weight:bold; color:#3b82f6;">${userProfile.name || 'User'}</div>
                    <div style="font-size:0.6rem; color:#64748b; text-transform:uppercase;">${userProfile.role}</div>
                </div>
                <button id="btn-logout-action" class="btn-login-trigger" style="background:#ef4444;">Logout</button>
            </div>`;
        
        document.getElementById('btn-logout-action').onclick = async () => {
            if(confirm("Yakin ingin keluar?")) {
                await supabase.auth.signOut();
                localStorage.setItem('user_role', 'guest'); // Reset ke guest
                window.location.reload(); 
            }
        };
    } else {
        authArea.innerHTML = `<button class="btn-login-trigger" id="btn-show-login">Login Siswa</button>`;
        const btnShow = document.getElementById('btn-show-login');
        if (btnShow) btnShow.onclick = () => document.getElementById('modal-login').style.display = 'flex';
    }
}

// --- 7. EVENT LISTENERS ---
async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-do-login');
    
    if (!email || !password) return alert("Lengkapi data!");
    
    btn.disabled = true;
    btn.innerText = "Memproses...";
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { 
        alert(error.message); 
        btn.disabled = false; 
        btn.innerText = "Masuk Sekarang";
    } else {
        window.location.reload(); 
    }
}

function setupAuthListeners() {
    const btn = document.getElementById('btn-do-login');
    if (btn) btn.onclick = handleLogin;
    const close = document.getElementById('btn-close-login');
    if (close) close.onclick = () => document.getElementById('modal-login').style.display = 'none';
}

window.loadModule = loadModule;