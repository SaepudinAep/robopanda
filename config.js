// config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabaseUrl = 'https://aedtrwpomswdqxarvsrg.supabase.co';
export const supabaseKey = 'sb_publishable_QXwMaSw5_11T2BpcWetm2A_hTgZeAsf';
export const supabase = createClient(supabaseUrl, supabaseKey);

// Tambahkan settingan Cloudinary di sini
export const cloudinaryConfig = {
    cloudName: 'dmm6avtxd',
    uploadPreset: 'robopanda-preset',
    // URL otomatis mengikuti cloudName di atas
    get uploadUrl() {
        return `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
    }
};

///https://aedtrwpomswdqxarvsrg.supabase.co/functions/v1/add-user