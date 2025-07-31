#!/bin/bash

# Vercel Environment Variables Setup Script
cd apps/web/client

echo "🔧 Setting up Vercel environment variables..."

# Note: You need to replace localhost URLs with your production Supabase instance
echo "⚠️  IMPORTANT: Update these URLs to your production Supabase instance!"

# Supabase (Update these to your production instance)
echo "http://127.0.0.1:54321" | vercel env add NEXT_PUBLIC_SUPABASE_URL production development preview
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production development preview
echo "postgresql://postgres:postgres@127.0.0.1:54322/postgres" | vercel env add SUPABASE_DATABASE_URL production development preview

# API Keys
echo "csb_v1_kL-4QbBVBQaISj2N__NmnnPDRCiQHwJ4MC2vm8GVsik" | vercel env add CSB_API_KEY production development preview
echo "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" | vercel env add ANTHROPIC_API_KEY production development preview
echo "sk-sfZ5AdpiROLUk8zvKBqnEBqnEBqCcidYP_NtF7I9DIUQoYhlhb02" | vercel env add MORPH_API_KEY production development preview
echo "7nfkdJBBGqZAN8kGccHrRs-AZM6dv86XusP9tNUgVR9xdFwkMNbswcEsDJkggGLZBdQ" | vercel env add FREESTYLE_API_KEY production development preview

# Optional empty keys
echo "" | vercel env add RELACE_API_KEY production development preview

echo "✅ Environment variables setup complete!"
echo "🚀 Now run: vercel --prod"