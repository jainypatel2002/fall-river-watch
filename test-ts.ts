import { createClient } from "@supabase/supabase-js";

const client = createClient("url", "key");

async function test(payload: unknown) {
    // Try upserting with unknown
    await client.from("test_table").upsert({
        key: "key",
        payload,
    });
}
