import { env } from '@/env';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    try {
        const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
        const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
        
        const supabase = createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            request.cookies.set(name, value),
                        );
                        supabaseResponse = NextResponse.next({
                            request,
                        });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options),
                        );
                    },
                },
            },
        );

        // refreshing the auth token
        await supabase.auth.getUser();
        return supabaseResponse;
    } catch (error) {
        console.error('Middleware error:', error);
        // Return response without auth processing if there's an error
        return supabaseResponse;
    }
}
