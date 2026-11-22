# P7 checkpoint 2, part 1: three palette options (choose one)

Each palette is applied to the real app (new light sidebar, FlowNest demo) on Home and Campaign review, in English and
Arabic: `palette-<n>-home-<lang>.png`, `palette-<n>-campaign-review-<lang>.png`. Regenerate with
`node docs/ui-audit/scripts/p7-palettes.mjs`. An AA contrast pass of every text on these 12 screens found
**0 failures** for all three (`contrast.json`).

The draft preview on Campaign review uses FlowNest's own brand colours (from its brand guide), not the app palette.

| | 1. Cobalt & apricot | 2. Deep teal & coral | 3. Violet & mint |
|---|---|---|---|
| Feel | clear, confident, classic SaaS | calm, grounded, quietly premium | modern, creative, warm |
| Brand (main buttons, links, active item) | `#1F4FD6` | `#0F6E68` | `#5B3FD9` |
| Brand dark (text on the tint, hover) | `#1A3FAE` | `#0B5550` | `#4A30B8` |
| Active background (tint) | `#EDF2FF` | `#E6F3F1` | `#F1EEFF` |
| Accent (once or twice per screen: the next-step edge, the highlighted problem) | `#E8833A` on `#FDF1E6` | `#E07A5F` on `#FCEDE8` | `#2FA37E` on `#E7F6F0` |
| Page background | `#F7F8FA` | `#F6F8F7` | `#F8F7FB` |
| Cards, sidebar | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Lines | `#E4E7EC` | `#E1E8E5` | `#E5E2EE` |
| Text | `#111827` | `#10201E` | `#17142B` |
| Secondary text | `#414A5A` / `#5B6474` | `#3C4C49` / `#566663` | `#454160` / `#5E5A78` |

Status colours, the same in all three: attention (amber) `#8A5100` on `#FFF4E0`; real problem (red) `#B42318` on
`#FDECEC`; success (green, with a check) `#0B7349` on `#E7F6EE`.

White text on each brand colour passes AA (4.5:1 or more); brand-dark text on its tint passes AA.
