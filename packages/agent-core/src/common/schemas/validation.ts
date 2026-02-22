import { z } from 'zod';

const taskInputAttachmentTypeSchema = z.enum(['image', 'text', 'document', 'other']);

export const taskInputAttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  type: taskInputAttachmentTypeSchema,
  size: z.number().nonnegative(),
});

export const taskConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  taskId: z.string().optional(),
  workingDirectory: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  systemPromptAppend: z.string().optional(),
  outputSchema: z.record(z.any()).optional(),
  sessionId: z.string().optional(),
  chrome: z.boolean().optional(),
  attachments: z.array(taskInputAttachmentSchema).max(5).optional(),
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
  payload: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue: z.ZodIssue) => issue.message).join('; ');
    throw new Error(`Invalid payload: ${message}`);
  }
  return result.data;
}
