import { motion } from 'framer-motion';
import { Bot, Image as ImageIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Message } from './types';
import ReactMarkdown from 'react-markdown';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isTool
              ? 'bg-muted/50 border border-border'
              : 'bg-card border border-border'
        )}
      >
        {/* Role indicator for non-user messages */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {isTool ? (
              <ImageIcon className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Bot className="h-3 w-3 text-primary" />
            )}
            <span className="text-xs text-muted-foreground">
              {isTool ? 'Screenshot' : 'Agent'}
            </span>
          </div>
        )}

        {/* Message content */}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:text-foreground prose-p:text-foreground">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {/* Screenshots */}
        {message.attachments?.map((attachment, i) => (
          <div key={i} className="mt-2">
            <img
              src={attachment.data}
              alt="Screenshot"
              className="rounded-lg max-w-full max-h-64 object-contain border border-border"
            />
          </div>
        ))}

        {/* Timestamp */}
        <p
          className={cn(
            'text-xs mt-1.5',
            isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.div>
  );
}
