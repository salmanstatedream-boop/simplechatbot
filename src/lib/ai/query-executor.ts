import { createSupabaseServerClient } from "../supabase/client";
import Fuse from "fuse.js";

export interface QueryResult {
  properties: any[];
  total: number;
  offset: number;
  limit: number;
}

export interface QueryFilters {
  property_name?: string;
  location?: {
    city?: string;
    state?: string;
  };
  info_type?: string[];
}

export async function executePropertyQuery(
  filters: QueryFilters,
  offset = 0,
  limit = 5
): Promise<QueryResult> {
  const supabase = createSupabaseServerClient();

  try {
    let query = supabase.from("properties").select("*");

    // Apply filters
    if (filters.property_name) {
      query = query.or(
        `name.ilike.%${filters.property_name}%,slug.ilike.%${filters.property_name}%`
      );
    }

    if (filters.location?.state) {
      query = query.ilike("address", `%${filters.location.state}%`);
    }

    if (filters.location?.city) {
      query = query.ilike("address", `%${filters.location.city}%`);
    }

    // Get total count
    const { count } = await supabase
      .from("properties")
      .select("*", { count: "exact", head: true });

    // Get paginated results
    const { data, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error("Database query error:", error);
      return { properties: [], total: 0, offset, limit };
    }

    return {
      properties: data || [],
      total: count || 0,
      offset,
      limit,
    };
  } catch (error) {
    console.error("Error executing property query:", error);
    return { properties: [], total: 0, offset, limit };
  }
}

export async function getPropertiesWithFallback(
  filters: QueryFilters,
  offset = 0,
  limit = 5
): Promise<QueryResult> {
  const result = await executePropertyQuery(filters, offset, limit);

  // If no results and property_name was searched, try fuzzy matching with 70% threshold
  if (result.properties.length === 0 && filters.property_name) {
    return await fuzzyPropertySearch(filters.property_name, offset, limit);
  }

  return result;
}

async function fuzzyPropertySearch(
  searchTerm: string,
  offset = 0,
  limit = 5
): Promise<QueryResult> {
  const supabase = createSupabaseServerClient();

  try {
    const { data, error, count } = await supabase
      .from("properties")
      .select("*", { count: "exact" })
      .limit(100); // Fetch more to search locally

    if (error || !data) {
      return { properties: [], total: 0, offset, limit };
    }

    // Fuzzy search with 70% threshold
    const fuse = new Fuse(data, {
      keys: ["name", "address"],
      threshold: 0.3, // 70% similarity
      includeScore: true,
    });

    const results = fuse.search(searchTerm).map((result: any) => result.item);

    // Apply pagination to fuzzy results
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      properties: paginatedResults,
      total: results.length,
      offset,
      limit,
    };
  } catch (error) {
    console.error("Error in fuzzy search:", error);
    return { properties: [], total: 0, offset, limit };
  }
}

export async function getAggregationData(aggregationType: string): Promise<any> {
  const supabase = createSupabaseServerClient();

  try {
    const { data, error } = await supabase.from("properties").select("*");

    if (error || !data) {
      return null;
    }

    switch (aggregationType) {
      case "owner_count":
        const owners = new Set(data.map((p: any) => p.owner).filter(Boolean));
        return {
          type: "owner_count",
          count: owners.size,
          owners: Array.from(owners),
        };

      case "area_count":
        const areas = new Set(data.map((p: any) => p.area).filter(Boolean));
        return {
          type: "area_count",
          count: areas.size,
          areas: Array.from(areas),
        };

      case "owner_with_most_properties":
        const ownerMap = new Map<string, number>();
        data.forEach((p: any) => {
          if (p.owner) {
            ownerMap.set(p.owner, (ownerMap.get(p.owner) || 0) + 1);
          }
        });
        let maxOwner = { name: "", count: 0 };
        ownerMap.forEach((count, owner) => {
          if (count > maxOwner.count) {
            maxOwner = { name: owner, count };
          }
        });
        return maxOwner;

      case "total_properties":
        return { type: "total_properties", count: data.length };

      default:
        return null;
    }
  } catch (error) {
    console.error("Error fetching aggregation data:", error);
    return null;
  }
}
