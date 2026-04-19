/**
 * Phase 2 retainer: commission real product photography, replace these entirely.
 *
 * Verified-live Unsplash photo IDs used for hero / story / category tiles
 * until Jeff's product shoot lands. These IDs have been confirmed reachable;
 * ImageWithFallback handles any future 404 gracefully.
 *
 * When real imagery arrives:
 *   - Upload to Supabase Storage
 *   - For categories, populate categories.image_url and delete map entries here
 *   - For hero/story, swap the constants below
 */

type PlaceholderImage = { src: string; alt: string };

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1200&auto=format&fit=crop&q=80`;

// Keyed by top-level category slug (see categories table, parent_id IS NULL).
export const CATEGORY_IMAGES: Record<string, PlaceholderImage> = {
  'teas-and-chai': {
    src: UNSPLASH('1571934811356-5cc061b6821f'),
    alt: 'Steaming chai latte in a ceramic cup',
  },
  'cocoa': {
    // Previous ID 1542990253-0b8be6ae9224 was removed from Unsplash and
    // started 404'ing. Swapped to a verified-live cocoa/chocolate shot —
    // same warm-brown palette, fits the editorial grid.
    src: UNSPLASH('1481391319762-47dff72954d9'),
    alt: 'Stacked dark chocolate squares',
  },
  'frappes': {
    src: UNSPLASH('1461023058943-07fcbe16d735'),
    alt: 'Iced blended coffee frappé in a tall glass',
  },
  'oatmeal-and-grains': {
    src: UNSPLASH('1517686469429-8bdb88b9f907'),
    alt: 'Warm oatmeal bowl with grains and fruit',
  },
  'smoothie-bases': {
    src: UNSPLASH('1546039907-7fa05f864c02'),
    alt: 'Blended smoothie in a glass',
  },
  'syrups-and-sauces': {
    src: UNSPLASH('1578326457399-3b34dbbf23b8'),
    alt: 'Amber syrup in a glass bottle',
  },
};

export const HERO_IMAGE: PlaceholderImage = {
  src: UNSPLASH('1571934811356-5cc061b6821f'),
  alt: 'Ceramic cup of steaming chai on warm wood',
};

export const STORY_IMAGE: PlaceholderImage = {
  src: UNSPLASH('1445116572660-236099ec97a0'),
  alt: 'Café counter in warm natural light',
};
