import { env } from "@/env";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest } from "next/server";

export async function createClient(request: NextRequest) {
    // Create a server's supabase client with newly configured cookie,
    // which could be used to maintain user's session
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
    
    return createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
            },
        },
    );
}
