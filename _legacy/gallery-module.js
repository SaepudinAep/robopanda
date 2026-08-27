import { supabase } from "./config.js";

export async function init(container, userProfile) {
    // Area ini akan otomatis menerima data name, class_id, dan group_id siswa
    container.innerHTML = `
        <section class="feed-section">
            <div class="section-header">
                <h2>📸 Galeri Aktivitas ${userProfile?.name || ''}</h2>
            </div>
            <div id="gallery-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:15px;">
                </div>
        </section>
    `;
    
    // Logika filter foto berdasarkan profile.class_id atau profile.group_id
    console.log("Memuat galeri untuk kelas:", userProfile?.class_id);
}