# Loadedout Design System v2

## Philosophy
Mobile-first dark-themed fitness PWA. Native iOS aesthetic. Inline style architecture with JS token objects.

## Color Tokens
- `bg` #0A0A0F — app background
- `surface` #13131A — cards, sheets
- `elevated` #1C1C26 — elevated surfaces
- `elevated2` #22222E — deeper elevation
- `border` #2A2A38 — dividers
- `text` #F4F4F8 — primary text
- `textMuted` #8F8FA3 — secondary text
- `textDim` #5A5A6B — tertiary text
- `teal` #00E5C3 — primary accent
- `amber` #F5A623 — secondary accent
- `violet` #7C5CFC — tertiary accent
- `negative` #FF5C72 — errors/destructive

## Typography Scale
- hero: 28px / 700 / -0.5px
- h1: 23px / 800 / -0.6px
- h2: 17px / 700 / -0.3px
- h3: 15px / 600 / -0.1px
- body: 13px / 500 / 0
- caption: 11px / 600 / 0.5px uppercase
- micro: 9px / 600 / 0.4px uppercase

## Spacing Scale
- 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 7: 32px, 8: 40px, 9: 48px, 10: 64px

## Border Radius
- rCard: 16px
- rInput: 12px
- rChip: 8px

## Component Library

### Card
Background: surface or elevated. Border: 1px solid border. Radius: rCard.

### Chip
Height variants: sm(24), md(28), lg(34). Active state: solid accent color. Inactive: elevated + border.

### Badge
Small uppercase label with colored background at 13% opacity.

### Skeleton
Shimmer animation using linear-gradient background. Sizes: custom width/height. Circle variant for avatars.

### Modal
Centered dialog with backdrop blur. Max-width 340px. Fade-up animation.

### BottomSheet
Slide-up from bottom. Max-height 85vh. Drag handle indicator.

### Toast
Top-fixed banner with colored accent border. Auto-dismiss with close button.

### IllustratedEmptyState
Large icon container with radial gradient. Title + subtitle + optional action.

## Accessibility
- All interactive elements have focus states (teal outline)
- ARIA labels on icon-only buttons
- Color contrast ratios meet WCAG AA for text
- Loading states announced visually
- Error states use negative color + icon

## Animation Tokens
- lo-pulse: 1.2s ease-in-out infinite
- lo-fade-up: 0.3s ease forwards
- lo-slide-up: 0.25s cubic-bezier(0.32, 0.72, 0, 1)
- lo-skeleton: 1.4s shimmer loop
