# Family Ledger

A private, modern personal & household finance management progressive web application. Track expenses, manage accounts and budgets, plan shopping trips with bilingual auto-categorization and supermarket promo matching, and analyze family spending.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide Icons, Recharts
- **Backend & Database**: Supabase (PostgreSQL with Row Level Security, Edge Functions)
- **Internationalization (i18n)**: English (UK) & Bulgarian (bg-BG) support with automatic date and category translations
- **AI Integrations**: Google Gemini API via Supabase Edge Functions for receipt parsing, shopping categorization, and spending analysis

## Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- npm

### Local Development

```sh
# Install dependencies
npm install

# Start the development server
npm run dev

# Run test suite
npm test

# Run linter
npm run lint

# Build for production
npm run build
```

## Deployment

### Frontend

The frontend is configured to build and deploy automatically to GitHub Pages via GitHub Actions upon push to the `main` branch.

### Backend (Supabase)

To link and deploy Supabase migrations and Edge Functions:

```sh
# 1. Link project
supabase link --project-ref YOUR_PROJECT_ID

# 2. Push database schema migrations
supabase db push

# 3. Deploy Edge Functions
supabase functions deploy
```

### AI Configuration

To enable AI features (receipt scanning, shopping item auto-categorization, spending analysis), set your Google Gemini API key in your Supabase Edge Function secrets:

```sh
supabase secrets set GEMINI_API_KEY=your_google_api_key_here
```
