import { z } from 'zod'

export const levelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'business'])
export const entryTypeSchema = z.enum(['word', 'phrasal', 'idiom', 'collocation'])
export const registerSchema = z.enum(['neutral', 'formal', 'informal', 'slang', 'technical'])

export const exampleSchema = z.object({
  en: z.string().min(3),
  ko: z.string().min(1),
})

export const senseSchema = z.object({
  pos: z.string().min(1),
  context: z.string().min(1),
  meaningKo: z.string().min(1),
  meaningEn: z.string().min(1),
  register: registerSchema.optional(),
  examples: z.array(exampleSchema).min(1).max(6),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  note: z.string().optional(),
})

export const entrySchema = z.object({
  id: z.string().regex(/^[biaz]-[wpic]-[a-z0-9-]+$/, 'id 형식: b-w-run / i-p-put-off / a-i-... / z-w-...'),
  headword: z.string().min(1),
  type: entryTypeSchema,
  level: levelSchema,
  ipa: z.string().optional(),
  forms: z.array(z.string()).optional(),
  senses: z.array(senseSchema).min(1).max(8),
  tags: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
})

export const entriesSchema = z.array(entrySchema)

export const grammarExampleSchema = z.object({
  en: z.string().min(1),
  ko: z.string().min(1),
  wrong: z.string().optional(),
})

export const grammarSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  examples: z.array(grammarExampleSchema),
})

export const grammarTopicSchema = z.object({
  id: z.string().regex(/^g-[a-z0-9-]+$/),
  title: z.string().min(1),
  titleKo: z.string().min(1),
  level: levelSchema,
  category: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(grammarSectionSchema).min(1),
  pitfalls: z.array(z.string()).optional(),
})

export const grammarTopicsSchema = z.array(grammarTopicSchema)

export const LEVEL_PREFIX = { beginner: 'b', intermediate: 'i', advanced: 'a', business: 'z' } as const
export const TYPE_PREFIX = { word: 'w', phrasal: 'p', idiom: 'i', collocation: 'c' } as const
