# Property ChatBot

A Next.js chatbot that allows users to query a property database using natural language. Powered by Groq API and Supabase.

## Features

- 🤖 Natural language queries about properties
- 🔍 Property lookup, location filtering, and aggregations
- 📊 Paginated results (5 per page with "Load More")
- 🔐 Supabase authentication with RLS
- 💬 Conversation history and management
- ⚡ Single Groq prompt for parsing and response generation
- 🎯 Smart fallback with 70% fuzzy matching on zero results
- 📱 Responsive design for Vercel deployment

## Tech Stack

- **Frontend**: Next.js 15, React 18, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase PostgreSQL
- **AI/LLM**: Groq API (Mixtral 8x7B)
- **Deployment**: Vercel

## Setup

### 1. Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Groq API
GROQ_API_KEY=your_groq_api_key

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2. Database Setup

Run the SQL schema from your Supabase project:

```sql
-- Properties table
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  address text,
  created_at timestamptz default now()
);

-- Conversations table
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  property_id uuid references properties(id),
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_conversations_user_id on conversations(user_id);
create index if not exists idx_conversations_property_id on conversations(property_id);
create index if not exists idx_messages_conversation_id on messages(conversation_id);
create index if not exists idx_properties_slug on properties(slug);

-- RLS Policies
alter table properties enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Main chat API endpoint
│   ├── auth/
│   │   └── login/
│   │       └── page.tsx          # Login page
│   ├── chat/
│   │   └── page.tsx              # Chat interface
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home redirect
│   └── globals.css               # Global styles
├── lib/
│   ├── ai/
│   │   ├── groq.ts              # Groq API integration & parsing
│   │   └── query-executor.ts    # Query execution & fallback logic
│   └── supabase/
│       ├── client.ts             # Supabase client initialization
│       └── schema.ts             # Schema discovery & caching
└── components/                   # React components (optional)
```

## Query Types

### 1. Property Lookup
**Example**: "Tell me about Ocean View" or "What's the WiFi at Beachfront?"
- Searches by property name/slug
- Extracts info types requested
- Returns property details

### 2. Location Filter
**Example**: "Show me properties in New Jersey" or "Properties in Manhattan?"
- Filters by city/state from address field
- Returns paginated results (5 per page)
- "Load More" button for additional results

### 3. Aggregation
**Example**: "Who has the most properties?" or "How many owners?"
- Counts unique owners, areas, total properties
- Returns statistics

### 4. Metadata
**Example**: "What information do you have?"
- Lists available columns in properties table
- Helps users understand queryable fields

## Adding New Property Columns

1. Add the column to your Supabase `properties` table:
   ```sql
   ALTER TABLE properties ADD COLUMN rent_price INTEGER;
   ALTER TABLE properties ADD COLUMN pool BOOLEAN;
   ALTER TABLE properties ADD COLUMN hot_tub BOOLEAN;
   -- etc.
   ```

2. The chatbot automatically discovers new columns and includes them in:
   - Schema cache (reloaded on app restart)
   - Groq prompt context
   - Query execution

No code changes needed! The system is fully extensible.

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### 3. Set Environment Variables

In Vercel Dashboard → Project Settings → Environment Variables:
- Add all variables from `.env.local.example`

### 4. Database Sync

Ensure RLS policies in Supabase allow:
- Public read on properties
- User reads/writes on conversations & messages scoped to user_id

## API Endpoints

### POST `/api/chat`

Send a message and get a response from the chatbot.

**Request**:
```json
{
  "message": "Show me properties in New Jersey",
  "conversationId": "uuid",
  "offset": 0
}
```

**Response**:
```json
{
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "Found 5 properties...",
    "metadata": {
      "intent": "location_filter",
      "has_more": true,
      "current_offset": 0,
      "total_results": 5
    }
  },
  "hasMore": true,
  "currentOffset": 0
}
```

## Troubleshooting

### Groq API Errors
- Verify `GROQ_API_KEY` is set correctly
- Check Groq API quotas and rate limits

### Supabase Connection Issues
- Verify connection strings are correct
- Check RLS policies allow your auth user
- Ensure `SUPABASE_SERVICE_ROLE_KEY` has admin access

### Schema Not Updating
- Schema is cached at startup
- Restart dev server after adding new columns
- Or call `invalidateSchemaCache()` from a manual endpoint

## Future Enhancements

- [ ] Multi-turn conversation context with previous messages
- [ ] Fine-tuning on property-specific question patterns
- [ ] Support for more complex filters (price range, date range)
- [ ] Message streaming with real-time updates
- [ ] Admin dashboard for managing properties
- [ ] Analytics on user queries and property popularity

## License

MIT
