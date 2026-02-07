/**
 * Project: Robopanda Client (Public/Student)
 * File: assets/js/index.js
 * Version: 4.3 - Manual Stable with Activity Logging
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { supabaseUrl, supabaseKey } from './config.js';

const supabase = createClient(supabaseUrl, supabaseKey);

// --- 1. STATE MANAGEMENT ---
let currentUser = null;
let userProfile = { role: 'guest' }; // Standar main.js
let currentActiveModule = 'explorer-module';

// --- 2. INISIALISASI ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("  Robopanda Foundation: Active.");

    // Ambil sesi login saat start
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    
    if (currentUser) {
        const { data } = await supabase.from('user_profiles').select('*').eq('id', currentUser.id).single();
        if (data) userProfile = data;
    }

    // Render komponen awal
    await fetchPublicMenus();
    updateAuthUI();
    
    // Load modul default (Explorer)
    loadModule('explorer-module'); 
    
    setupAuthListeners();

    // Listener Pasif: Hanya menangani logout
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            window.location.reload(); 
        }
    });
});

// --- 3. ACTIVITY LOGGING UTILITY ---
async function recordActivity(type, metadata = {}) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;

        // Kirim data ke tabel activity_logs
        await supabase.from('activity_logs').insert([{
            user_id: userId,
            activity_type: type,
            metadata: metadata
        }]);
    } catch (err) {
        console.error("Logging Error:", err);
    }
}

// --- 4. SEKTOR MENU (FILTER LOGIC) ---
async function fetchPublicMenus() {
    try {
        const { data: catData } = await supabase.from('menu_categories').select('id').eq('category_key', 'homepage').single();
        if (!catData) return;

        const { data: allMenus } = await supabase.from('app_menus').select('*').eq('category', catData.id).eq('is_active', true).order('order_index');

        if (allMenus) {
            const filtered = allMenus.filter(menu => {
                let allowed = [];
                try {
                    allowed = typeof menu.allowed_roles === 'string' ? JSON.parse(menu.allowed_roles) : menu.allowed_roles;
                } catch(e) { allowed = []; }

                // Jika role kosong, tampilkan untuk publik
                if (!allowed || allowed.length === 0) return true;

                // Cek kecocokan role profil
                return Array.isArray(allowed) && allowed.includes(userProfile.role);
            });

            renderNavbar(filtered);
        }
    } catch (err) {
        console.error("Fetch Menu Error:", err);
    }
}

function renderNavbar(menus) {
    const nav = document.getElementById('main-nav-categories');
    if (!nav) return;

    nav.innerHTML = menus.map(m => `
        <button class="tab-item ${currentActiveModule === m.route ? 'active' : ''}" 
                id="btn-nav-${m.route}"
                onclick="window.loadModule('${m.route}')">
            ${m.title}
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

        // Inject profile ke modul
        if (module.initExplorer) {
            await module.initExplorer(contentArea, userProfile);
        } else if (module.init) {
            await module.init(contentArea, userProfile);
        }
        
        // Update penanda aktif
        document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-nav-${name}`);
        if (btn) btn.classList.add('active');

    } catch (err) {
        contentArea.innerHTML = `<div style="padding:50px; text-align:center; color:#ef4444;">Modul tidak tersedia.</div>`;
    }
}

// --- 6. AUTH UI & ACTIONS ---
function updateAuthUI() {
    const authArea = document.getElementById('auth-area');
    if (!authArea) return;

    if (currentUser && userProfile.role !== 'guest') {
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
                // Catat log logout sebelum keluar (Opsional)
                await recordActivity('logout', { email: currentUser.email });
                await supabase.auth.signOut();
            }
        };
    } else {
        authArea.innerHTML = `<button class="btn-login-trigger" id="btn-show-login">Login Siswa</button>`;
        const btnShow = document.getElementById('btn-show-login');
        if (btnShow) btnShow.onclick = () => document.getElementById('modal-login').style.display = 'flex';
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-do-login');
    
    if (!email || !password) return alert("Lengkapi email & password!");
    
    btn.disabled = true;
    btn.innerText = "Memproses...";
    
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) { 
        alert(error.message); 
        btn.disabled = false; 
        btn.innerText = "Masuk Sekarang";
    } else {
        // CATAT LOG LOGIN
        await recordActivity('login', { email: email });
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