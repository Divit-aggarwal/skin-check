# Kit requests (redesign lanes)

Lanes append here; the main session merges them in batches and marks each
row. Format: lane · what · why · screen · status.

| # | Lane | Request | Why / screen | Status |
|---|---|---|---|---|
| 1 | D echo | `ChatBubble`: 16px corners (`rounded-card`, tail corner `rounded-br-md` / `rounded-bl-md` kept) instead of `rounded-2xl` (20px), for both sides | Rule 10 (no 20px on touched screens); 19, also the opening on 18 | open |
| 2 | D echo | `TypingIndicator` (`components/primitives`): honour reduced motion itself (the dots loop in JS; framer ignores the CSS rule) and drop its own `rounded-2xl` | Rule 10; 18/19. EchoPage wraps itself in `MotionConfig reducedMotion="user"` and overrides the corner by class meanwhile | open |
