import { z } from 'zod';

const MAX_TASK_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const taskInputAttachmentSchema = z.object({
  name: z.string().min(1, 'Attachment name is required').max(512),
  path: z.string().min(1, 'Attachment path is required').max(4096),
  type: z.enum(['image', 'text', 'document', 'other']),
  size: z
    .number()
    .int()
    .nonnegative('Attachment size must be non-negative')
    .max(MAX_ATTACHMENT_SIZE_BYTES, 'Attachment exceeds 10 MB limit'),
  preview: z.string().max(12000).optional(),
});

export const taskConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  taskId: z.string().optional(),
  workingDirectory: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  systemPromptAppend: z.string().optional(),
  outputSchema: z.record(z.any()).optional(),
  sessionId: z.string().optional(),
  attachments: z.array(taskInputAttachmentSchema).max(MAX_TASK_ATTACHMENTS).optional(),
  chrome: z.boolean().optional(),
});

export const permissionResponseSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
  taskId: z.string().min(1, 'Task ID is required'),
  decision: z.enum(['allow', 'deny']),
  message: z.string().optional(),
  selectedOptions: z.array(z.string()).optional(),
  customText: z.string().optional(),
});

export const resumeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  existingTaskId: z.string().optional(),
  chrome: z.boolean().optional(),
});

export function validate<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown
): z.infer<TSchema> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue: z.ZodIssue) => issue.message).join('; ');
    throw new Error(`Invalid payload: ${message}`);
  }
  return result.data;
}
