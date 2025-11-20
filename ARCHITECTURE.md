# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Chat Page (src/app/chat/page.tsx)                  │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  • Message display with markdown table rendering    │  │
│  │  • Input field for natural language queries         │  │
│  │  • Conversation sidebar with history              │  │
│  │  • Client-side pagination (Load More button)       │  │
│  │  • Real-time connection to Supabase for updates   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Supabase Auth                                      │  │
│  │  • Session management                              │  │
│  │  • Guest mode support                              │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │ HTTP POST /api/chat
               ↓
┌─────────────────────────────────────────────────────────────┐
│         Backend (Next.js API Routes)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  POST /api/chat (src/app/api/chat/route.ts)        │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  1. Receive user message + conversationId           │  │
│  │  2. Save user message to messages table             │  │
│  │  3. Call schema discovery                           │  │
│  │  4. Call Groq for parsing + response               │  │
│  │  5. Execute query (or fallback)                     │  │
│  │  6. Format results as markdown table                │  │
│  │  7. Save assistant message with pagination metadata │  │
│  │  8. Return response + has_more flag                 │  │
│  └──────────────────────────────────────────────────────┘  │
│         │              │              │                     │
│         ↓              ↓              ↓                     │
│    ┌─────────┐   ┌─────────┐   ┌──────────────┐           │
│    │ Schema  │   │  Groq   │   │ Query        │           │
│    │Discover │   │ Engine  │   │ Executor     │           │
│    │(cache)  │   │(parse)  │   │(fallback)    │           │
│    └─────────┘   └─────────┘   └──────────────┘           │
└──────────────┬──────────┬───────────────┬───────────────────┘
               │          │               │
          HTTP │          │ REST API      │ Query execution
               ↓          ↓               ↓
┌──────────────────────────┐      ┌──────────────────────────┐
│   Groq API               │      │   Supabase PostgreSQL    │
│                          │      │                          │
│  Model:                  │      │  Tables:                 │
│  mixtral-8x7b-32768      │      │  • properties            │
│                          │      │  • conversations         │
│  Function:               │      │  • messages              │
│  • Parse intent          │      │  • auth.users (via RLS)  │
│  • Extract filters       │      │                          │
│  • Generate response     │      │  Features:               │
│  • Single batched call   │      │  • Row Level Security    │
│                          │      │  • Indexes for speed     │
│                          │      │  • Cascade delete        │
└──────────────────────────┘      └──────────────────────────┘
```

## Data Flow

### 1. User Sends Message
```
Frontend Input Box
    │ "Show me properties in New Jersey"
    ├─ Save to messages table (role: user)
    └─ POST /api/chat with conversationId
```

### 2. Parse Query (Groq)
```
Input: "Show me properties in New Jersey"
Groq System Prompt:
  - Schema documentation (auto-discovered columns)
  - Few-shot examples (property_lookup, location_filter, etc.)
  - Strict JSON output format
  
Output JSON:
{
  "intent": "location_filter",
  "filters": {
    "property_name": null,
    "location": { "state": "New Jersey" },
    "info_type": []
  },
  "response_text": "Let me find properties in New Jersey for you."
}
```

### 3. Execute Query
```
Query Builder:
  • Filter by address ILIKE %New Jersey%
  • ORDER BY name
  • LIMIT 5, OFFSET 0

Result:
[
  { id, name: "Beachfront Villa", address: "123 Ocean Ave, New Jersey", owner: "John Smith" },
  { ... },
  { ... },
  { ... },
  { ... }
]

Fallback (if zero results):
  • Fuzzy match on name (70% threshold)
  • Fuzzy match on address
  • Return similar properties as suggestions
```

### 4. Format Response
```
Response Text:
  "Found 5 properties in New Jersey. Showing 5 of 5."

Markdown Table:
  | Name | Address | Owner |
  | - | - | - |
  | Beachfront Villa | 123 Ocean Ave, New Jersey | John Smith |
  | ... |

Final Message:
  Found 5 properties in New Jersey. Showing 5 of 5.
  
  | Name | Address | Owner |
  | ...
```

### 5. Save & Return
```
Message Metadata:
{
  "intent": "location_filter",
  "full_results_data": [...all 5 properties],
  "has_more": false,  // 5 < total, so no pagination needed
  "current_offset": 0,
  "total_results": 5
}

Frontend receives:
{
  "message": { id, role: "assistant", content, metadata },
  "response": "Found 5 properties...",
  "hasMore": false,
  "currentOffset": 0
}
```

## Module Breakdown

### 1. `lib/supabase/schema.ts` - Dynamic Schema Discovery
- **Function**: `getPropertiesSchema()`
- **Cache**: In-memory, initialized at app startup
- **Auto-updates**: Add column → Restart server → Auto-included
- **Output**: `ColumnMetadata[]` with name, type, display name

### 2. `lib/ai/groq.ts` - Single-Prompt Engine
- **Function**: `parseAndGenerateResponse(userMessage, schemaDoc)`
- **System Prompt**: Includes schema + few-shot examples
- **Output**: `ParsedQuery` with intent, filters, response text
- **Error Handling**: Graceful fallback on parse error

### 3. `lib/ai/query-executor.ts` - Query Builder & Fallback
- **Functions**:
  - `executePropertyQuery()`: Builds & executes Supabase query
  - `getPropertiesWithFallback()`: Tries exact → fuzzy match
  - `fuzzyPropertySearch()`: 70% similarity threshold
  - `getAggregationData()`: Counts owners, areas, etc.
- **Pagination**: Limit 5, offset-based
- **Caching**: None (fresh query each time)

### 4. `src/app/api/chat/route.ts` - Main API Handler
- **Endpoint**: POST /api/chat
- **Auth**: Checks Supabase session
- **Flow**:
  1. Save user message
  2. Get schema
  3. Call Groq
  4. Execute query
  5. Format table
  6. Save assistant message
  7. Return response

### 5. `src/app/chat/page.tsx` - Frontend UI
- **State Management**: React hooks
- **Real-time**: Supabase subscriptions (optional)
- **Pagination**: Client-side (Load More button)
- **Markdown Rendering**: Built-in table parsing
- **Styling**: Tailwind CSS

## Query Types

### Type 1: Property Lookup
```
User: "Tell me about Beachfront Villa"
Groq: intent="property_lookup", property_name="Beachfront Villa"
Query: SELECT * FROM properties WHERE name ILIKE '%Beachfront Villa%' OR slug ILIKE '%beachfront-villa%'
Result: Single property details
```

### Type 2: Location Filter
```
User: "Properties in New Jersey"
Groq: intent="location_filter", location={state: "New Jersey"}
Query: SELECT * FROM properties WHERE address ILIKE '%New Jersey%' LIMIT 5
Result: First 5, with Load More button if more exist
```

### Type 3: Aggregation
```
User: "Who has the most properties?"
Groq: intent="aggregation", info_type=["owner_with_most_properties"]
Query: GROUP BY owner, COUNT(*)
Result: "John Smith has 2 properties"
```

### Type 4: Metadata
```
User: "What information do you have?"
Groq: intent="metadata"
Query: None (uses schema cache)
Result: "I have 8 attributes including name, address, owner, wifi, area, ..."
```

## Pagination Flow

### Initial Query
```
User: "Properties in New Jersey"
API receives: offset=0
Shows: First 5 results
Frontend: If total > 5, show "Load More" button
```

### Load More (Client-Side)
```
User clicks "Load More"
Frontend: Slice next 5 from metadata.full_results_data
Display: Properties 6-10
NO NEW GROQ CALL
NO NEW DATABASE QUERY
```

## Error Handling

```
Scenario 1: Groq Parsing Fails
├─ Catch JSON parse error
├─ Return intent="unknown"
└─ Response: "I couldn't understand. Could you rephrase?"

Scenario 2: Zero Results
├─ Try fuzzy matching (70% threshold)
├─ Return similar properties
└─ Response: "Found similar properties: ..."

Scenario 3: RLS Denies Access
├─ Verify user_id matches conversation owner
├─ Return 401 Unauthorized
└─ Frontend: Redirect to login

Scenario 4: Missing Environment Variable
├─ Throw error during build
├─ Developer must set .env.local
└─ Clear error message
```

## Scalability Considerations

### Current Limits
- **Groq API**: ~3500 requests/min (free tier), ~100 tokens/request
- **Supabase**: Depends on plan (free: 500K rows)
- **Pagination**: Client-side, max 100 results in memory
- **Fuzzy Search**: Only on zero results, ~100 properties max

### Optimization Paths
1. **Caching**: Redis for schema + popular queries
2. **Indexing**: Add more indexes on frequently filtered columns
3. **Full-Text Search**: Use Postgres FTS instead of fuzzy matching
4. **Streaming**: Stream Groq response tokens to frontend
5. **Batch Processing**: Aggregate multi-user queries

## Security

### Row Level Security (RLS)
```
Properties Table:
  • SELECT: Public (anyone can read)
  
Conversations Table:
  • SELECT: Only user_id = auth.uid()
  • INSERT: Only user_id = auth.uid()
  • UPDATE: Only user_id = auth.uid()
  
Messages Table:
  • SELECT: Only where conversation.user_id = auth.uid()
  • INSERT: Only where conversation.user_id = auth.uid()
```

### API Security
```
POST /api/chat:
  ✓ Checks auth.uid() exists
  ✓ Uses service role key for server operations
  ✓ RLS enforced on all queries
  ✓ No SQL injection (parameterized queries)
```

### Environment Variables
```
Public (exposed to browser):
  • NEXT_PUBLIC_SUPABASE_URL
  • NEXT_PUBLIC_SUPABASE_ANON_KEY
  • NEXT_PUBLIC_APP_URL

Private (server-only):
  • SUPABASE_SERVICE_ROLE_KEY (admin access)
  • GROQ_API_KEY (API key)
```

---

**Architecture is production-ready and fully extensible!** 🚀
