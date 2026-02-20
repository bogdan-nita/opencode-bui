import { z } from "zod"

export const opencodeEventPartMetadataFilesSchema = z.object({
  filePath: z.string().optional(),
  relativePath: z.string().optional(),
  type: z.string().optional(),
})

export const opencodeEventPartMetadataSchema = z
  .object({
    files: z.array(opencodeEventPartMetadataFilesSchema).optional(),
  })
  .passthrough()
  .optional()

export const opencodeEventPartStateSchema = z
  .object({
    status: z.string().optional(),
    title: z.string().optional(),
    output: z.string().optional(),
    metadata: opencodeEventPartMetadataSchema,
  })
  .passthrough()
  .optional()

export const opencodeEventPartTokensSchema = z
  .object({
    total: z.number().optional(),
    input: z.number().optional(),
    output: z.number().optional(),
    reasoning: z.number().optional(),
  })
  .optional()

export const opencodeEventPartSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional(),
    tool: z.string().optional(),
    callID: z.string().optional(),
    state: opencodeEventPartStateSchema.optional(),
    reason: z.string().optional(),
    cost: z.number().optional(),
    tokens: opencodeEventPartTokensSchema.optional(),
  })
  .optional()

export const opencodeEventSchema = z.object({
  sessionID: z.string().optional(),
  type: z.string().optional(),
  part: opencodeEventPartSchema.optional(),
})

export type OpenCodeEvent = z.infer<typeof opencodeEventSchema>
export type OpenCodeEventPart = z.infer<typeof opencodeEventPartSchema>
