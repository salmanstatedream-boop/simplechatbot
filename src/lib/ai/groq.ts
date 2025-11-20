import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export interface ParsedQuery {
  intent: "property_lookup" | "location_filter" | "aggregation" | "metadata" | "unknown";
  filters: {
    property_name?: string;
    location?: {
      city?: string;
      state?: string;
    };
    info_type?: string[];
  };
  response_text: string;
  full_results_data: any[];
  needs_pagination: boolean;
}

export async function parseAndGenerateResponse(
  userMessage: string,
  schemaDocumentation: string
): Promise<ParsedQuery> {
  const systemPrompt = `You are a property database query assistant. Your job is to:
1. Parse user questions about properties
2. Extract query parameters (property names, locations, information types)
3. Generate a conversational response

${schemaDocumentation}

Query Types:
- Property Lookup: User asks about a specific property by name (e.g., "Tell me about Ocean View")
- Location Filter: User asks about properties in a location (e.g., "Show me properties in New Jersey")
- Aggregation: User asks for statistics (e.g., "Who has the most properties?", "How many owners are there?")
- Metadata: User asks what information is available (e.g., "What information do you have?")
- Unknown: You can't determine the intent

Examples:
1. User: "What is the WiFi status at Beachfront Villa?"
   Intent: property_lookup, Extract: property_name="Beachfront Villa", info_type=["wifi"]

2. User: "Show me all properties in New York"
   Intent: location_filter, Extract: location={state="New York"}

3. User: "Who has the most properties?"
   Intent: aggregation, Extract: aggregation_type="owner_count"

IMPORTANT: Return ONLY valid JSON with NO markdown code blocks or backticks. The response must be parseable as JSON.

Return JSON format:
{
  "intent": "property_lookup" | "location_filter" | "aggregation" | "metadata" | "unknown",
  "filters": {
    "property_name": "string or null",
    "location": {
      "city": "string or null",
      "state": "string or null"
    },
    "info_type": ["array", "of", "info", "types"]
  },
  "response_text": "Initial response to user (will be enhanced with data)",
  "full_results_data": [],
  "needs_pagination": false
}`;

  try {
    // Use Groq chat completion API
    const response = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${systemPrompt}\n\nUser message: "${userMessage}"`,
        },
      ],
    });

    const content =
      response.choices[0].message.content || "";

    // Remove markdown code blocks if present
    const jsonContent = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed: ParsedQuery = JSON.parse(jsonContent);
    return parsed;
  } catch (error) {
    console.error("Error parsing query with Groq:", error);
    return {
      intent: "unknown",
      filters: {
        property_name: undefined,
        location: { city: undefined, state: undefined },
        info_type: [],
      },
      response_text:
        "I couldn't understand your question. Could you please rephrase it?",
      full_results_data: [],
      needs_pagination: false,
    };
  }
}
