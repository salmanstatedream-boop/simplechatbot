# Customization Guide

## Common Customizations & How-To

This guide shows how to extend and customize the chatbot for your needs.

---

## 1. Adding New Property Columns

### Example: Add Amenities

#### Step 1: Add Column to Supabase

```sql
-- Add new columns for amenities
ALTER TABLE properties ADD COLUMN rent_price INTEGER;
ALTER TABLE properties ADD COLUMN pool BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN hot_tub BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN gym BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN parking BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN cleaner BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN handyman BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN camera BOOLEAN DEFAULT false;

-- Update existing records
UPDATE properties SET pool = true WHERE name LIKE '%Beach%';
UPDATE properties SET hot_tub = true WHERE name LIKE '%Luxury%';
```

#### Step 2: Restart Dev Server

```bash
npm run dev
```

**That's it!** The chatbot auto-discovers these columns.

#### Step 3: Users Can Now Ask

- "Which properties have a pool?"
- "Show me properties with a hot tub"
- "What properties have WiFi and gym?"
- "Cheapest rental under $2000?"

---

## 2. Modifying Groq Prompt for Better Parsing

### File: `src/lib/ai/groq.ts`

Current few-shot examples are basic. Make them more sophisticated:

```typescript
// Add more examples for your specific use case
const systemPrompt = `
...existing prompt...

Examples:
1. User: "What is the WiFi status at Beachfront Villa?"
   Intent: property_lookup, Extract: property_name="Beachfront Villa", info_type=["wifi"]

2. User: "Show me all properties in New York"
   Intent: location_filter, Extract: location={state="New York"}

3. User: "Who has the most properties?"
   Intent: aggregation, Extract: aggregation_type="owner_count"

4. User: "Which properties have a pool AND WiFi?"
   Intent: property_lookup, Extract: filters=[{field: "pool", value: true}, {field: "wifi", value: true}]

5. User: "Properties in Manhattan under $3000/month?"
   Intent: location_filter + price filter
   Extract: location={city: "Manhattan"}, filters=[{field: "rent_price", value: {lt: 3000}}]
`;
```

### Testing Groq Response

Add this debug endpoint:

```typescript
// src/app/api/debug/groq/route.ts
import { parseAndGenerateResponse } from "@/lib/ai/groq";
import { getPropertiesSchema, generateSchemaDocumentation } from "@/lib/supabase/schema";

export async function POST(request: NextRequest) {
  const { message } = await request.json();
  
  const schema = await getPropertiesSchema();
  const schemaDoc = generateSchemaDocumentation(schema);
  
  const result = await parseAndGenerateResponse(message, schemaDoc);
  
  return NextResponse.json({ result, message }, { status: 200 });
}
```

Test with:
```bash
curl -X POST http://localhost:3000/api/debug/groq \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me properties in New Jersey"}'
```

---

## 3. Changing Response Format

### Currently: Markdown Tables

File: `src/app/api/chat/route.ts`

#### Function: `formatPropertiesTable()`

Current output:
```
| Name | Address | Owner |
| - | - | - |
| Beachfront Villa | ... | John Smith |
```

#### Option A: JSON Response

```typescript
function formatPropertiesAsJSON(properties: any[]): string {
  const json = JSON.stringify(properties, null, 2);
  return `\`\`\`json\n${json}\n\`\`\``;
}
```

#### Option B: Detailed Cards

```typescript
function formatPropertiesAsCards(properties: any[]): string {
  return properties.map(p => `
**${p.name}**
- Address: ${p.address}
- Owner: ${p.owner}
- WiFi: ${p.wifi ? '✓' : '✗'}
- Area: ${p.area}
  `).join('\n\n');
}
```

#### Option C: CSV Export

```typescript
function formatPropertiesAsCSV(properties: any[]): string {
  const headers = Object.keys(properties[0] || {}).join(',');
  const rows = properties.map(p => Object.values(p).join(',')).join('\n');
  return `\`\`\`csv\n${headers}\n${rows}\n\`\`\``;
}
```

---

## 4. Custom Query Types

### Add: "Price Range Filter"

#### Step 1: Update Groq Prompt

```typescript
// In groq.ts - add to systemPrompt
Query Types:
- Price Range: "Properties under $3000", "Between $2000-$5000"
  Extract: filters={rent_price: {min: 2000, max: 5000}}
```

#### Step 2: Extend Query Executor

```typescript
// In query-executor.ts
export async function executePropertyQuery(
  filters: QueryFilters,
  offset = 0,
  limit = 5
): Promise<QueryResult> {
  let query = supabase.from("properties").select("*");
  
  // ... existing filters ...
  
  // NEW: Price range filter
  if (filters.price_range?.min) {
    query = query.gte("rent_price", filters.price_range.min);
  }
  if (filters.price_range?.max) {
    query = query.lte("rent_price", filters.price_range.max);
  }
  
  // ... rest of function ...
}
```

---

## 5. Adding Analytics/Logging

### Track User Queries

```typescript
// src/lib/analytics.ts
export async function logQuery(
  userId: string,
  intent: string,
  message: string,
  resultCount: number
) {
  const supabase = createSupabaseServerClient();
  
  await supabase.from("query_logs").insert({
    user_id: userId,
    intent,
    message,
    result_count: resultCount,
    created_at: new Date().toISOString(),
  });
}
```

### Use in API Route

```typescript
// In api/chat/route.ts
import { logQuery } from "@/lib/analytics";

// After executing query:
await logQuery(user.id, parsedQuery.intent, message, allResults.length);
```

---

## 6. Custom Styling

### Change Color Scheme

File: `tailwind.config.ts`

```typescript
const config: Config = {
  theme: {
    extend: {
      colors: {
        primary: "#your-color",
        secondary: "#your-color",
      },
    },
  },
};
```

### Update in Components

```typescript
// Before: bg-indigo-600
// After:  bg-primary

// In src/app/chat/page.tsx
<button className="bg-primary hover:bg-primary/90">
  Send
</button>
```

---

## 7. Add Conversation Templates

### Quick Starters

```typescript
// Add to chat/page.tsx
const quickStarts = [
  "Show me properties in New Jersey",
  "What properties have WiFi?",
  "Who has the most properties?",
  "What information do you have?",
];

// In render:
{messages.length === 0 && (
  <div className="grid grid-cols-2 gap-2">
    {quickStarts.map((start) => (
      <button
        onClick={() => setInput(start)}
        className="p-3 bg-gray-100 hover:bg-gray-200 rounded text-sm text-left"
      >
        {start}
      </button>
    ))}
  </div>
)}
```

---

## 8. Implement Message Streaming

### Real-time Token Streaming

```typescript
// src/app/api/chat/route.ts
export async function POST(request: NextRequest) {
  // ... setup ...
  
  // Instead of waiting for full response:
  // Use streaming with ReadableStream
  
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start(controller) {
      // Send tokens as they arrive from Groq
      groqResponse.onToken((token) => {
        controller.enqueue(encoder.encode(token));
      });
    },
  });
  
  return new Response(readableStream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
```

---

## 9. Add User Preferences

### Remember Settings

```typescript
// src/lib/supabase/schema.ts
export async function getUserPreferences(userId: string) {
  const supabase = createSupabaseServerClient();
  
  const { data } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();
  
  return data || getDefaultPreferences();
}

export function getDefaultPreferences() {
  return {
    results_per_page: 5,
    show_table: true,
    theme: "light",
    sort_by: "name",
  };
}
```

---

## 10. Integrate with External APIs

### Example: Weather API

```typescript
// src/lib/external/weather.ts
export async function getWeatherForProperty(address: string) {
  const response = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${address}`
  );
  const data = await response.json();
  return data;
}
```

### Use in Response

```typescript
// In api/chat/route.ts
if (allResults.length > 0) {
  const weather = await getWeatherForProperty(allResults[0].address);
  responseText += `\n\n**Current Weather**: ${weather.current.temp_c}°C`;
}
```

---

## 11. Add Admin Dashboard

### Create Admin Panel

```typescript
// src/app/admin/page.tsx
import { getPropertiesSchema } from "@/lib/supabase/schema";
import { createSupabaseServerClient } from "@/lib/supabase/client";

export default async function AdminDashboard() {
  const supabase = createSupabaseServerClient();
  
  const schema = await getPropertiesSchema();
  const { data: stats } = await supabase
    .from("properties")
    .select("*");
  
  return (
    <div className="p-8">
      <h1>Admin Dashboard</h1>
      <p>Total properties: {stats?.length}</p>
      <p>Available columns: {schema.length}</p>
      {/* Add more admin features */}
    </div>
  );
}
```

---

## 12. Performance Optimizations

### Add Redis Caching

```typescript
// src/lib/cache.ts
import redis from "redis";

const client = redis.createClient();

export async function getCachedSchema() {
  const cached = await client.get("properties:schema");
  if (cached) return JSON.parse(cached);
  
  const schema = await getPropertiesSchema();
  await client.setex("properties:schema", 3600, JSON.stringify(schema));
  
  return schema;
}
```

### Implement Query Results Cache

```typescript
// Cache frequent queries
export async function getCachedQuery(query: string) {
  const key = `query:${hash(query)}`;
  const cached = await client.get(key);
  if (cached) return JSON.parse(cached);
  
  const results = await executeQuery(query);
  await client.setex(key, 300, JSON.stringify(results)); // 5 min TTL
  
  return results;
}
```

---

## 13. A/B Testing Prompts

### Compare Two Groq Prompts

```typescript
// src/lib/ai/variants.ts
export const promptVariants = {
  v1: `... current prompt ...`,
  v2: `... experimental prompt ...`,
};

export function selectPrompt(userId: string): string {
  // 50/50 split
  return userId.charCodeAt(0) % 2 === 0 ? promptVariants.v1 : promptVariants.v2;
}
```

### Track Performance

```typescript
// Log which variant was used
await logQuery(userId, intent, message, results.length, {
  prompt_variant: variant,
});
```

---

## 14. Multi-Language Support

### Add i18n

```typescript
// src/lib/i18n.ts
const translations = {
  en: {
    "not_found": "No properties found",
    "searching": "Searching...",
  },
  es: {
    "not_found": "No se encontraron propiedades",
    "searching": "Buscando...",
  },
};

export function t(key: string, lang = "en") {
  return translations[lang]?.[key] || key;
}
```

---

## 15. Database Migration Guide

### Add New Features

```sql
-- Add rating system
ALTER TABLE properties ADD COLUMN rating FLOAT DEFAULT 0;
ALTER TABLE properties ADD COLUMN reviews_count INTEGER DEFAULT 0;

-- Create reviews table
CREATE TABLE property_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  rating FLOAT,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Restart dev server to pick up new columns
```

---

## Quick Reference: Most Common Customizations

| Need | File | Function | Change |
|------|------|----------|--------|
| Add column | Supabase | N/A | ALTER TABLE |
| Change Groq logic | `groq.ts` | `systemPrompt` | Edit prompt text |
| Change response format | `api/chat/route.ts` | `formatPropertiesTable()` | Modify format |
| Change colors | `tailwind.config.ts` | `theme.colors` | Add custom colors |
| Add logging | `api/chat/route.ts` | Main POST | Add logger call |
| Add UI components | `chat/page.tsx` | `return` | Add JSX |
| Change animations | `globals.css` | N/A | Modify @layer directives |
| Add API endpoint | `app/api/*/route.ts` | N/A | Create new file |

---

**Need help?** Check ARCHITECTURE.md for system design details! 🔧
