# 🚀 Vercel Deployment Guide

## ⚠️ Belangrijke Configuratie Stappen

### 1. **Supabase Productie Setup**
Je lokale environment gebruikt localhost URLs. Voor Vercel deployment heb je nodig:

```bash
# Vervang in Vercel dashboard of via CLI:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

### 2. **Environment Variables Setup**
Ga naar [Vercel Dashboard](https://vercel.com/dashboard) → je project → Settings → Environment Variables:

**Required Variables:**
```bash
# Supabase (PRODUCTIE URLS!)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_DATABASE_URL=your-production-db-url

# API Keys (deze zijn al correct)
CSB_API_KEY=csb_v1_kL-4QbBVBQaISj2N__NmnnPDRCiQHwJ4MC2vm8GVsik
ANTHROPIC_API_KEY=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
MORPH_API_KEY=sk-sfZ5AdpiROLUk8zvKBqnEBqCcidYP_NtF7I9DIUQoYhlhb02
FREESTYLE_API_KEY=7nfkdJBBGqZAN8kGccHrRs-AZM6dv86XusP9tNUgVR9xdFwkMNbswcEsDJkggGLZBdQ

# Optional
RELACE_API_KEY=
NEXT_PUBLIC_SITE_URL=https://your-vercel-app.vercel.app
```

### 3. **Deployment Commands**
```bash
# From apps/web/client directory:
cd apps/web/client

# Deploy to production:
vercel --prod

# Or redeploy existing:
vercel redeploy --prod
```

### 4. **Huidige Deployment Status**
- ✅ Project gekoppeld aan Vercel
- ✅ URL: https://client-7b4qtrdq3-jasons-projects-3108a48b.vercel.app
- ❌ Failed - Environment variabelen ontbreken
- ❌ Localhost URLs werken niet in productie

## 🔧 **Quick Fix Commands**

Via Vercel CLI (vervang URLs met jouw productie Supabase):
```bash
cd apps/web/client

# Set production Supabase URL
vercel env add NEXT_PUBLIC_SUPABASE_URL
# Enter: https://your-project.supabase.co

# Set production anon key  
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# Enter: your-production-anon-key

# Set other required vars...
vercel env add FREESTYLE_API_KEY
# Enter: 7nfkdJBBGqZAN8kGccHrRs-AZM6dv86XusP9tNUgVR9xdFwkMNbswcEsDJkggGLZBdQ

# Redeploy
vercel --prod
```

## 📋 **Volgende Stappen**

1. **Setup Supabase Cloud** (als je dat nog niet hebt)
2. **Update environment variables** in Vercel dashboard
3. **Redeploy** de applicatie
4. **Test** de Freestyle.sh integratie in productie

---

**Current Status:** Deployment failed due to missing/incorrect environment variables
**Action Needed:** Update Supabase URLs to production instance