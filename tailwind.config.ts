import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ─── Brand Colors ──────────────────────────────────────────────
      // UPDATE THESE if you have official brand guidelines for The Project SKIN.
      // Current palette is designed for "Sage + Rebel" brand positioning.
      colors: {
        // Shadcn semantic tokens — read from CSS variables in globals.css
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Backgrounds
        skin: {
          base: "#FFFFFF",       // store --color-paper — page background
          muted: "#F2EDE8",      // warm off-white — card backgrounds
          border: "#E8E0D8",     // warm border
        },
        // Brand primary — Sage (science, calm, expertise)
        sage: {
          50:  "#EEF5F1",
          100: "#D5E8DC",
          200: "#A8CDB6",
          300: "#78B090",
          400: "#4E9370",
          500: "#3D6B52",        // ← primary brand color
          600: "#2E5240",
          700: "#1F3A2D",
          800: "#12231B",
          900: "#070F0C",
        },
        // Echo teal — the digital twin's authoritative color, reused for the
        // glass redesign's primary accent. (The 3D twin components that also
        // pulled from this palette were removed in bcf071b.)
        echo: {
          light: "#5DCAA5",
          mid: "#1D9E75",
          deep: "#0F6E56",
          darkest: "#04342C",
        },
        // Sub-score gauge accents — semantic, used only for their own fill.
        subscore: {
          breakouts: "#D4537E",
          redness: "#D85A30",
          texture: "#1D9E75",
          hydration: "#378ADD",
        },
        // Brand accent — Rebel (confidence, warmth, India)
        rebel: {
          50:  "#FEF2EF",
          100: "#FCD9D1",
          200: "#F8B0A0",
          300: "#F2856D",
          400: "#EC5F42",
          500: "#E84830",        // ← accent / CTA color
          600: "#C0341E",
          700: "#8F2315",
          800: "#5E140C",
          900: "#300805",
        },
        // Semantic — Confidence labels (used on scan results, recommendations)
        confidence: {
          high:   "#2D7A50",     // green
          medium: "#D97706",     // amber
          low:    "#DC2626",     // red
          bg: {
            high:   "#ECFDF5",
            medium: "#FFFBEB",
            low:    "#FEF2F2",
          },
        },
        // Semantic — Status
        status: {
          success: "#16A34A",
          warning: "#D97706",
          error:   "#DC2626",
          info:    "#2563EB",
        },
        // Results-dashboard tokens (SkinCheckDashboard.tsx, EchoTwin.tsx) —
        // previously referenced as `bg-canvas`/`bg-surface`/`text-text`
        // without being defined anywhere, so they generated zero CSS
        // (AUDIT.md S0-2). Values match the raw hex already used ad hoc
        // for the same roles elsewhere in this feature (EchoPage.tsx,
        // SkinCheckFlow.tsx, the inputs/* components), not a new palette.
        // G03 (docs/design/system.md): mapped to the Shopify store theme, so
        // every screen that already uses these names takes the store's look.
        canvas:  "#F5F3EE",  // store --color-linen (cards, panels)
        surface: "#FFFFFF",  // store --color-paper
        text:    "#2C2C2A",  // store --color-ink

        // Restrained accent for the Skin Check quiz + results redesign
        // (PART 4 of the redesign brief) — small selected-state touches
        // only (a filled chip, an underline), never a large fill. Not the
        // same as `rebel`/`confidence` above, which belong to the older
        // marketing-home palette this feature no longer draws from.
        // G03: the old mauve accent now maps to the store's forest/mist, the
        // one accent that passes contrast for text (system.md §2).
        // G03 part 1 (2026-10-06): the live site's theme green #1f473e.
        blush: {
          DEFAULT: "#1F473E",
          soft: "#E4E9E8",
        },
        // The store theme by role (docs/design/system.md §0-2; sources:
        // docs/design/brand-source-root.css and the computed styles read from
        // the live site, docs/design/live-styles-2026-10-06.json). `error` is
        // the one value not from the store.
        brand: {
          paper: "#FFFFFF",
          linen: "#F5F3EE",
          linen2: "#EEEAE5",
          line: "#DDD8CE",
          ink: "#2C2C2A",
          muted: "#6B6862",
          // Live site: theme-color and the main pill button (.ps-button) are #1f473e.
          action: "#1F473E",
          "action-hover": "#17362F",
          forest: "#1F473E",
          // #1f473e at 12% on white: the live site's rgba(31,71,62,.12) lines.
          mist: "#E4E9E8",
          // Live small uppercase labels (eyebrows, actives) keep the older green.
          eyebrow: "#0F6E56",
          // Live section titles and product card borders.
          title: "#111111",
          "card-line": "#ECE8E1",
          accent: "#B98783",
          "accent-soft": "#F3E9E7",
          taupe: "#B7A58F",
          error: "#B42318",
        },
      },

      // ─── Typography ────────────────────────────────────────────────
      fontFamily: {
        // Store theme: Bai Jamjuree headings, Plus Jakarta Sans body (system.md §3).
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body:    ["var(--font-jakarta)", "system-ui", "sans-serif"],
        mono:    ["var(--font-mono)", "monospace"],
      },

      // ─── Type Scale ────────────────────────────────────────────────
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        xs:    ["0.75rem",  { lineHeight: "1rem" }],
        sm:    ["0.875rem", { lineHeight: "1.25rem" }],
        base:  ["1rem",     { lineHeight: "1.5rem" }],
        lg:    ["1.125rem", { lineHeight: "1.75rem" }],
        xl:    ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem",   { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem",  { lineHeight: "2.5rem" }],
        "5xl": ["3rem",     { lineHeight: "1.15" }],
        // Same gap as the color tokens above (AUDIT.md S0-2) — body/label
        // sizes the results dashboard already assumed existed.
        body:  ["1.0625rem", { lineHeight: "1.5rem" }],   // matches EchoBubble's message copy
        label: ["0.8125rem", { lineHeight: "1.125rem" }], // matches ProgressHeader's uppercase label size
      },

      // ─── Letter spacing ────────────────────────────────────────────
      letterSpacing: {
        // `tracking-label` — same gap as the color/fontSize tokens above
        // (AUDIT.md S0-2). Matches the `tracking-[0.12em]` value already
        // used ad hoc for uppercase labels in ProgressHeader.tsx/EchoPage.tsx.
        label: "0.12em",
      },

      // ─── Spacing ───────────────────────────────────────────────────
      spacing: {
        "safe-top":    "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left":   "env(safe-area-inset-left)",
        "safe-right":  "env(safe-area-inset-right)",
      },

      // ─── Border Radius ─────────────────────────────────────────────
      borderRadius: {
        "2xs": "0.125rem",
        xs:    "0.25rem",
        sm:    "0.375rem",
        DEFAULT: "0.5rem",
        md:    "0.625rem",
        lg:    "0.75rem",
        xl:    "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        card:  "1rem",
        pill:  "9999px",
        media: "1.25rem", // photo-frame corners — same radius as rounded-2xl, used consistently for cards elsewhere
      },

      // ─── Animation ─────────────────────────────────────────────────
      transitionDuration: {
        instant: "100ms",
        fast:    "150ms",
        base:    "200ms",
        slow:    "350ms",
        reveal:  "500ms",
      },
      transitionTimingFunction: {
        "spring-out": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "ease-out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },

      // ─── Shadows ───────────────────────────────────────────────────
      boxShadow: {
        card:      "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "card-md": "0 4px 12px 0 rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04)",
        "card-lg": "0 8px 24px 0 rgba(0,0,0,0.10), 0 4px 8px -4px rgba(0,0,0,0.06)",
        inner:     "inset 0 1px 3px 0 rgba(0,0,0,0.08)",
      },

      // ─── Screens ───────────────────────────────────────────────────
      screens: {
        xs:  "390px",   // iPhone 14 Pro — primary target
        sm:  "640px",
        md:  "768px",
        lg:  "1024px",
        xl:  "1280px",
        "2xl": "1536px",
      },

      // ─── Z-Index ───────────────────────────────────────────────────
      zIndex: {
        behind: "-1",
        base:   "0",
        raised: "10",
        overlay: "20",
        modal:   "30",
        toast:   "40",
        top:     "50",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
