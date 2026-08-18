"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      role="status"
      aria-label="Echo is typing"
      className="flex items-end gap-2"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl px-3 py-2 shadow-sm",
          className
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-current"
              animate={{ scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
