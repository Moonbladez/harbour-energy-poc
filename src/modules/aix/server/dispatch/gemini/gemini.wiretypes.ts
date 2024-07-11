import { z } from 'zod';

// PATHS

export const geminiModelsListPath = '/v1beta/models?pageSize=1000';
export const geminiModelsGenerateContentPath = '/v1beta/{model=models/*}:generateContent';
// see alt=sse on https://cloud.google.com/apis/docs/system-parameters#definitions
export const geminiModelsStreamGenerateContentPath = '/v1beta/{model=models/*}:streamGenerateContent?alt=sse';


//
// /v1/{model=models/*}:generateContent, /v1beta/{model=models/*}:streamGenerateContent
//

// Request

// The IANA standard MIME type of the source data. Examples: - image/png - image/jpeg
// For a complete list of supported types, see Supported file formats:
// https://ai.google.dev/gemini-api/docs/prompting_with_media?lang=node#supported_file_formats
/*const geminiBlobMimeTypeSchema = z.enum([
  // Image formats
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  // Audio formats
  'audio/wav',
  'audio/mp3',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  // Video formats
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
  // Plain text formats
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/x-javascript',
  'text/x-typescript',
  'application/x-typescript',
  'text/csv',
  'text/markdown',
  'text/x-python',
  'application/x-python-code',
  'application/json',
  'text/xml',
  'application/rtf',
  'text/rtf',
]);*/

const geminiContentPartSchema = z.union([
  // TextPart
  z.object({
    text: z.string(),
  }),

  // InlineDataPart (for raw media bytes)
  z.object({
    inlineData: z.object({
      // see geminiBlobMimeTypeSchema
      mimeType: z.string(), // The IANA standard MIME type of the source data.
      data: z.string(), // base64-encoded string
    }),
  }),

  // FunctionCall (predicted by the model)
  z.object({
    functionCall: z.object({
      name: z.string(),
      args: z.record(z.any()), // JSON object format
    }),
  }),

  // FunctionResponse (result of a FunctionCall)
  z.object({
    functionResponse: z.object({
      name: z.string(),
      response: z.record(z.any()), // Optional. JSON object format
    }),
  }),

  // FileData (URI based data)
  z.object({
    fileData: z.object({
      mimeType: z.string().optional(), // Optional. The IANA standard MIME type of the source data.
      fileUri: z.string(),
    }),
  }),
]);

const geminiToolSchema = z.object({
  codeExecution: z.object({}).optional(),
  functionDeclarations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any()).optional(), // Schema object format
  })).optional(),
});

const geminiToolConfigSchema = z.object({
  functionCallingConfig: z.object({
    mode: z.enum([
      /**
       * (default) The model decides to predict either a function call or a natural language response.
       */
      'AUTO',
      /**
       * The model is constrained to always predict a function call.
       * If allowed_function_names is provided, the model picks from the set of allowed functions.
       */
      'ANY',
      /**
       * The model behavior is the same as if you don't pass any function declarations.
       */
      'NONE',
    ]).optional(),
    allowedFunctionNames: z.array(z.string()).optional(),
  }).optional(),
});

const geminiHarmCategoryEnum = z.enum([
  'HARM_CATEGORY_UNSPECIFIED',
  'HARM_CATEGORY_DEROGATORY',
  'HARM_CATEGORY_TOXICITY',
  'HARM_CATEGORY_VIOLENCE',
  'HARM_CATEGORY_SEXUAL',
  'HARM_CATEGORY_MEDICAL',
  'HARM_CATEGORY_DANGEROUS',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
]);

export const geminiBlockSafetyLevelEnum = z.enum([
  'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
  'BLOCK_LOW_AND_ABOVE',
  'BLOCK_MEDIUM_AND_ABOVE',
  'BLOCK_ONLY_HIGH',
  'BLOCK_NONE',
]);

export type GeminiBlockSafetyLevel = z.infer<typeof geminiBlockSafetyLevelEnum>;

const geminiSafetySettingSchema = z.object({
  category: geminiHarmCategoryEnum,
  threshold: geminiBlockSafetyLevelEnum,
});

const geminiResponseMimeTypeEnum = z.enum([
  'text/plain',
  'application/json',
]);

const geminiGenerationConfigSchema = z.object({
  stopSequences: z.array(z.string()).optional(),
  responseMimeType: geminiResponseMimeTypeEnum.optional(), // defaults to 'text/plain'
  responseSchema: z.record(z.any()).optional(), // This is a simplified representation of the Schema object
  candidateCount: z.number().int().optional(),
  maxOutputTokens: z.number().int().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().int().optional(),
});

const geminiContentSchema = z.object({
  // Must be either 'user' or 'model'. Optional but must be set if there are multiple "Content" objects in the parent array.
  role: z.enum(['user', 'model']).optional(),
  // Ordered Parts that constitute a single message. Parts may have different MIME types.
  parts: z.array(geminiContentPartSchema),
});

const geminiSystemContentSchema = z.object({
  parts: z.array(z.object({
    text: z.string(),
  })),
});

export type GeminiContentSchema = z.infer<typeof geminiContentSchema>;

export type GeminiGenerateContentRequest = z.infer<typeof geminiGenerateContentRequestSchema>;
const geminiGenerateContentRequestSchema = z.object({
  contents: z.array(geminiContentSchema),
  tools: z.array(geminiToolSchema).optional(),
  toolConfig: geminiToolConfigSchema.optional(),
  safetySettings: z.array(geminiSafetySettingSchema).optional(),
  systemInstruction: geminiSystemContentSchema.optional(), // Note: should be 'contents' object, but since it's text-only, we cast it down with a custom definition
  generationConfig: geminiGenerationConfigSchema.optional(),
});


// Response

export function geminiHarmProbabilitySortFunction(a: { probability: string }, b: { probability: string }) {
  const order = ['NEGLIGIBLE', 'LOW', 'MEDIUM', 'HIGH'];
  return order.indexOf(a.probability) - order.indexOf(b.probability);
}


const geminiHarmProbabilityEnum = z.enum([
  'HARM_PROBABILITY_UNSPECIFIED',
  'NEGLIGIBLE',
  'LOW',
  'MEDIUM',
  'HIGH',
]);

const geminiFinishReasonEnum = z.enum([
  'FINISH_REASON_UNSPECIFIED',
  'STOP',
  'MAX_TOKENS',
  'SAFETY',
  'RECITATION',
  'OTHER',
]);

const geminiBlockReasonEnum = z.enum([
  'BLOCK_REASON_UNSPECIFIED',
  'SAFETY',
  'OTHER',
]);

export type GeminiSafetyRatings = z.infer<typeof geminiSafetyRatingsSchema>;
const geminiSafetyRatingsSchema = z.array(z.object({
  'category': geminiHarmCategoryEnum,
  'probability': geminiHarmProbabilityEnum,
  'blocked': z.boolean().optional(),
}));

/*const geminiGroundingAttributionSchema = z.object({
  sourceId: z.object({
    groundingPassage: z.object({
      passageId: z.string(),
      partIndex: z.number(),
    }).optional(),
    semanticRetrieverChunk: z.object({
      source: z.string(),
      chunk: z.string(),
    }).optional(),
  }),
  content: geminiContentSchema,
});*/

const geminiPromptFeedbackSchema = z.object({
  blockReason: geminiBlockReasonEnum.optional(),
  safetyRatings: geminiSafetyRatingsSchema.optional(),
});

const geminiUsageMetadataSchema = z.object({
  promptTokenCount: z.number(),
  cachedContentTokenCount: z.number().optional(),
  candidatesTokenCount: z.number(),
  totalTokenCount: z.number(),
});

export const geminiGeneratedContentResponseSchema = z.object({
  // either all requested candidates are returned or no candidates at all
  // no candidates are returned only if there was something wrong with the prompt (see promptFeedback)
  candidates: z.array(z.object({
    index: z.number(),
    content: geminiContentSchema.optional(), // this can be missing if the finishReason is not 'MAX_TOKENS'
    finishReason: geminiFinishReasonEnum.optional(),
    safetyRatings: geminiSafetyRatingsSchema.optional(), // undefined when finishReason is 'RECITATION'
    citationMetadata: z.object({
      startIndex: z.number().optional(),
      endIndex: z.number().optional(),
      uri: z.string().optional(),
      license: z.string().optional(),
    }).optional(),
    tokenCount: z.number().optional(),
    // groundingAttributions: z.array(geminiGroundingAttributionSchema).optional(), // This field is populated for GenerateAnswer calls.
  })),
  promptFeedback: geminiPromptFeedbackSchema.optional(), // only sent in the 1st chunk of a streaming response
  usageMetadata: geminiUsageMetadataSchema.optional(), // only use (sent?) at the end
});


//
// models.list = /v1beta/models
//

export type GeminiModelSchema = z.infer<typeof geminiModelSchema>;
const geminiModelSchema = z.object({
  name: z.string(),
  version: z.string(),
  displayName: z.string(),
  description: z.string(),
  inputTokenLimit: z.number().int().min(1),
  outputTokenLimit: z.number().int().min(1),
  supportedGenerationMethods: z.array(z.enum([
    'createCachedContent', // appeared on 2024-06-10, see https://github.com/enricoros/big-AGI/issues/565
    'countMessageTokens',
    'countTextTokens',
    'countTokens',
    'createTunedModel',
    'createTunedTextModel',
    'embedContent',
    'embedText',
    'generateAnswer',
    'generateContent',
    'generateMessage',
    'generateText',
  ])),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
});

export const geminiModelsListOutputSchema = z.object({
  models: z.array(geminiModelSchema),
});
