import { createSupabaseServerClient } from "./client";

export interface ColumnMetadata {
  name: string;
  displayName: string;
  type: string;
  description: string;
}

let cachedSchema: ColumnMetadata[] | null = null;

export async function getPropertiesSchema(): Promise<ColumnMetadata[]> {
  if (cachedSchema) {
    return cachedSchema;
  }

  try {
    const supabase = createSupabaseServerClient();

    // Get schema information from information_schema
    const { data, error } = await supabase.rpc("get_column_info", {
      p_table_name: "properties",
      p_schema: "public",
    });

    if (error) {
      console.warn("Failed to fetch schema via RPC, using static schema");
      cachedSchema = getStaticPropertiesSchema();
      return cachedSchema as ColumnMetadata[];
    }

    // Map database columns to metadata
    cachedSchema = (data || [])
      .map((col: any) => ({
        name: col.column_name,
        displayName: col.column_name.replace(/_/g, " "),
        type: col.data_type,
        description: `Property ${col.column_name.replace(/_/g, " ")}`,
      }))
      .sort((a: ColumnMetadata, b: ColumnMetadata) =>
        a.name.localeCompare(b.name)
      );

    return cachedSchema as ColumnMetadata[];
  } catch (error) {
    console.error("Error fetching schema:", error);
    cachedSchema = getStaticPropertiesSchema();
    return cachedSchema as ColumnMetadata[];
  }
}

export function getStaticPropertiesSchema(): ColumnMetadata[] {
  return [
    {
      name: "id",
      displayName: "ID",
      type: "uuid",
      description: "Unique property identifier",
    },
    {
      name: "name",
      displayName: "Name",
      type: "text",
      description: "Property name",
    },
    {
      name: "slug",
      displayName: "Slug",
      type: "text",
      description: "URL-friendly property slug",
    },
    {
      name: "address",
      displayName: "Address",
      type: "text",
      description: "Property street address",
    },
    {
      name: "created_at",
      displayName: "Created At",
      type: "timestamptz",
      description: "When the property was added",
    },
    {
      name: "wifi",
      displayName: "WiFi",
      type: "boolean",
      description: "WiFi availability",
    },
    {
      name: "area",
      displayName: "Area",
      type: "text",
      description: "Property area or region",
    },
    {
      name: "owner",
      displayName: "Owner",
      type: "text",
      description: "Property owner name",
    },
  ];
}

// Generate schema documentation for Groq prompt
export function generateSchemaDocumentation(schema: ColumnMetadata[]): string {
  const columns = schema
    .map(
      (col) =>
        `- ${col.name} (${col.type}): ${col.description}`
    )
    .join("\n");

  return `Available property columns:
${columns}

Note: These are the columns you can query. When the user asks for information like wifi availability, area, or owner, map these to the available columns.`;
}

// Invalidate cache when needed
export function invalidateSchemaCache(): void {
  cachedSchema = null;
}
