import { z } from "zod";
import {
  MAX_CANDIDATES,
  MAX_DOMAIN_CHARS,
  MAX_NOTE_CHARS,
  MAX_TITLE_CHARS,
} from "@/lib/crypto/tokenize";
import { uuidSchema } from "@/lib/http/schemas";

export const searchCandidateSchema = z.object({
  token: z
    .string()
    .regex(/^t_[A-Za-z0-9_-]{22}$/, "Invalid candidate token"),
  title: z.string().max(MAX_TITLE_CHARS),
  note: z.string().max(MAX_NOTE_CHARS).optional(),
  domain: z.string().max(MAX_DOMAIN_CHARS).optional(),
});

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  mode: z.enum(["local", "cloud"]),
  providerId: uuidSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
  candidates: z.array(searchCandidateSchema).min(1).max(MAX_CANDIDATES),
});

export type SearchRequestBody = z.infer<typeof searchRequestSchema>;
