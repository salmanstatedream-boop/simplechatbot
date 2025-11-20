import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  getPropertiesSchema,
  generateSchemaDocumentation,
} from "@/lib/supabase/schema";
import { parseAndGenerateResponse } from "@/lib/ai/groq";
import {
  getPropertiesWithFallback,
  getAggregationData,
} from "@/lib/ai/query-executor";

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const { message, conversationId, offset = 0, guestId } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Missing message" },
        { status: 400 }
      );
    }

    // Get user session or allow guest mode
    const supabase = createSupabaseServerClient();
    let user: any = null;
    let userId: string = guestId || "guest-test-" + Date.now();

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        user = authUser;
        userId = authUser.id;
      }
    } catch {
      // Allow guest mode for testing
      console.log("No authenticated user, using guest mode");
    }

    // Generate or use provided conversation ID
    let finalConversationId = conversationId;
    if (!finalConversationId) {
      finalConversationId = "conv-" + Date.now() + "-" + Math.random().toString(36).substring(7);
    }

    // Save user message to database (optional - may fail if not authenticated)
    try {
      await supabase.from("messages").insert({
        conversation_id: finalConversationId,
        role: "user",
        content: message,
      });
    } catch (error) {
      console.log("Message save skipped (guest mode or auth issue)");
    }

    // Get schema for context
    const schema = await getPropertiesSchema();
    const schemaDocumentation = generateSchemaDocumentation(schema);

    // Parse query with Groq (single batched prompt)
    const parsedQuery = await parseAndGenerateResponse(
      message,
      schemaDocumentation
    );

    let responseText = parsedQuery.response_text;
    let allResults: any[] = [];
    let hasMore = false;

    // Execute query based on intent
    if (parsedQuery.intent === "property_lookup") {
      const result = await getPropertiesWithFallback(
        parsedQuery.filters,
        offset,
        5
      );
      allResults = result.properties;
      hasMore = offset + 5 < result.total;

      if (allResults.length === 0) {
        responseText =
          "I couldn't find any properties matching your query. Could you please rephrase? Or I can help you explore what properties are available.";
      } else {
        responseText = `Found ${result.total} property/properties. Showing ${Math.min(5, allResults.length)} of ${result.total}.`;
      }
    } else if (parsedQuery.intent === "location_filter") {
      const result = await getPropertiesWithFallback(
        parsedQuery.filters,
        offset,
        5
      );
      allResults = result.properties;
      hasMore = offset + 5 < result.total;

      if (allResults.length === 0) {
        responseText = `No properties found in that location. Would you like to see all available properties or search by a different location?`;
      } else {
        responseText = `Found ${result.total} properties in that location. Showing ${Math.min(5, allResults.length)} of ${result.total}.`;
      }
    } else if (parsedQuery.intent === "aggregation") {
      const aggregationType =
        parsedQuery.filters.info_type?.[0] || "total_properties";
      const aggregationResult = await getAggregationData(aggregationType);

      if (aggregationResult) {
        if (
          aggregationResult.type === "owner_with_most_properties" ||
          aggregationResult.name
        ) {
          responseText = `${aggregationResult.name} has the most properties with ${aggregationResult.count} properties.`;
        } else {
          responseText = `There are ${aggregationResult.count} ${aggregationType.replace(/_/g, " ")}.`;
        }
      }
    } else if (parsedQuery.intent === "metadata") {
      responseText = `I have information about ${schema.length} property attributes including: ${schema
        .map((s) => s.displayName)
        .join(", ")}. You can ask me about any property or get information like locations, owners, and amenities.`;
    }

    // Format results as markdown table
    let formattedResults = "";
    if (allResults.length > 0) {
      formattedResults = formatPropertiesTable(allResults);
    }

    // Save assistant message with pagination metadata (optional - may fail if not authenticated)
    let messageData: any = null;
    try {
      const { data, error: assistantError } = await supabase
        .from("messages")
        .insert({
          conversation_id: finalConversationId,
          role: "assistant",
          content: `${responseText}\n\n${formattedResults}`.trim(),
          metadata: {
            intent: parsedQuery.intent,
            full_results_data: allResults,
            has_more: hasMore,
            current_offset: offset,
            total_results: allResults.length,
          },
        })
        .select()
        .single();

      if (assistantError) {
        console.log("Message save skipped (guest mode or auth issue)");
      } else {
        messageData = data;
      }
    } catch (error) {
      console.log("Message save skipped (guest mode or auth issue)");
    }

    return NextResponse.json({
      message: messageData,
      response: `${responseText}\n\n${formattedResults}`.trim(),
      hasMore,
      currentOffset: offset,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function formatPropertiesTable(properties: any[]): string {
  if (!properties || properties.length === 0) {
    return "";
  }

  // Extract only key columns: name, address, owner
  const headers = ["Name", "Address", "Owner"];
  const rows = properties.map((p) => [
    p.name || "-",
    p.address || "-",
    p.owner || "-",
  ]);

  // Create markdown table
  let table = `| ${headers.join(" | ")} |\n`;
  table += `| ${headers.map(() => "-").join(" | ")} |\n`;
  rows.forEach((row) => {
    table += `| ${row.join(" | ")} |\n`;
  });

  return table;
}
