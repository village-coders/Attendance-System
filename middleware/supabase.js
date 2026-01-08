const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function uploadToSupabase(file, playerId) {
  try {
    const fileExt = path.extname(file.originalname);
    const fileName = `player-${playerId || Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    const filePath = `players/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('player-images') // Your Supabase bucket name
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });

    if (error) {
      throw error;
    }else{
      console.log('Supabase upload successful:', data);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('player-images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (error) {
    console.error('Supabase upload error:', error);
    throw error;
  }
}


async function deleteFromSupabase(imageUrl) {
  try {
    if (!imageUrl) return;
    
    // Extract file path from URL
    const url = new URL(imageUrl);
    const filePath = url.pathname.split('/storage/v1/object/public/player-images/')[1];
    
    if (filePath) {
      const { error } = await supabase.storage
        .from('player-images')
        .remove([filePath]);
      
      if (error) {
        console.error('Supabase delete error:', error);
      }
    }
  } catch (error) {
    console.error('Error deleting from Supabase:', error);
  }
}

module.exports = {
  uploadToSupabase,
  deleteFromSupabase
};