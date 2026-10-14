"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export function TypingIndicator({ className, label = "Echo is typing" }: { className?: string; label?: string }) {
  // Kit request D2: the dots loop in JS, which the CSS reduced-motion rule cannot stop.
  const still = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      role="status"
      aria-label={label}
      className="flex items-end gap-2"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-card px-3 py-2",
          className
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-current"
              animate={still ? { opacity: 0.6 } : { scale: [1, 1.3, 1], opacity: [0.3, 1, 0.3] }}
              transition={still ? { duration: 0 } : { duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
