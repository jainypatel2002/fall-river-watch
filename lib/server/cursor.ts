import { z } from "zod";

const cursorPayloadSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid()
});

export type TimestampCursor = z.infer<typeof cursorPayloadSchema>;

export function encodeTimestampCursor(payload: TimestampCursor) {
  const raw = JSON.stringify(payload);
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeTimestampCursor(cursor: string | null): TimestampCursor | null {
  if (!cursor) return null;

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return cursorPayloadSchema.parse(parsed);
  } catch {
    return null;
  }
}
