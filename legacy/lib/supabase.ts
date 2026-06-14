import { createClient } from '@supabase/supabase-js';

// Reads Vite-configured environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing. Please configure them in your .env file.'
  );
}

import { generateFingerprint } from './deviceFingerprint';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Track session registration to avoid concurrent duplicate inserts
let isRegisteringSession = false;

// Listen to auth state changes to manage user_sessions in DB
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    if (isRegisteringSession) return;
    isRegisteringSession = true;
    try {
      const fingerprint = await generateFingerprint();
      const userAgent = navigator.userAgent;

      // Attempt to get IP and geo info, failing gracefully if offline or blocked
      let ip = null;
      let city = null;
      let country = null;
      try {
        const geoRes = await fetch('https://ipapi.co/json/');
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          ip = geoData.ip;
          city = geoData.city;
          country = geoData.country_name || geoData.country;
        }
      } catch (e) {
        console.warn('Geo IP lookup failed, proceeding without location details:', e);
      }

      // Check if active session already exists for this user and device
      const { data: existing, error: queryError } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('device_fingerprint', fingerprint)
        .is('revoked_at', null)
        .limit(1);

      if (queryError) throw queryError;

      if (!existing || existing.length === 0) {
        // Create new active session record
        await supabase.from('user_sessions').insert({
          user_id: session.user.id,
          ip_address: ip,
          user_agent: userAgent,
          device_fingerprint: fingerprint,
          city: city,
          country: country,
          is_current: true,
          last_active_at: new Date().toISOString()
        });
      } else {
        // Update last active time for the existing session
        await supabase
          .from('user_sessions')
          .update({ 
            last_active_at: new Date().toISOString(),
            ip_address: ip || undefined,
            city: city || undefined,
            country: country || undefined
          })
          .eq('id', existing[0].id);
      }
    } catch (err) {
      console.error('Failed to log active session in database:', err);
    } finally {
      isRegisteringSession = false;
    }
  }
});

