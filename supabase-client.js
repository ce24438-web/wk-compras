window.WK_SUPABASE_CONFIG = {
	url: 'https://pmsdrvirtbzvnvqlpwqm.supabase.co',
	anonKey: 'sb_publishable_p1cOasc5ejbZtfJbKWjWgg__iMvg-gP'
};

window.WK_SUPABASE_CLIENT = window.supabase
	? window.supabase.createClient(window.WK_SUPABASE_CONFIG.url, window.WK_SUPABASE_CONFIG.anonKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true
		}
	})
	: null;