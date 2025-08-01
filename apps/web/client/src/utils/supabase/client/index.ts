import { env } from '@/env';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    // Create a supabase client on the browser with project's credentials
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
    
    return createBrowserClient(
        supabaseUrl,
        supabaseKey,
    );
}

export const getFileUrlFromStorage = (bucket: string, path: string) => {
    const supabase = createClient();
    const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

    return data.publicUrl;
};

export const uploadBlobToStorage = async (bucket: string, path: string, file: Blob, options: {
    upsert?: boolean;
    contentType?: string;
    cacheControl?: string;
}) => {
    const supabase = createClient();
    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, file, options);

    if (error) {
        console.error('Error uploading file:', error);
        return null;
    }

    return data;
};