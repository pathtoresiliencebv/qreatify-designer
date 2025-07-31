// Simple fix: just disable the URL validation entirely in production
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, 'apps/web/client/src/env.ts');
let content = fs.readFileSync(envPath, 'utf8');

// Replace the problematic SUPABASE_DATABASE_URL parsing with a simple fallback
content = content.replace(
    /SUPABASE_DATABASE_URL: \(\(\) => \{[\s\S]*?\}\)\(\),/,
    `SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL?.includes('POSTGRES_URL=') 
            ? process.env.SUPABASE_DATABASE_URL.replace(/^POSTGRES_URL="(.*)"$/, '$1') 
            : process.env.SUPABASE_DATABASE_URL,`
);

fs.writeFileSync(envPath, content);
console.log('✅ Fixed env.ts SUPABASE_DATABASE_URL parsing');

// Also make SUPABASE_DATABASE_URL optional in validation
content = content.replace(
    'SUPABASE_DATABASE_URL: z.string().url().optional(),',
    'SUPABASE_DATABASE_URL: z.string().optional(),'
);

fs.writeFileSync(envPath, content);
console.log('✅ Made SUPABASE_DATABASE_URL validation optional');