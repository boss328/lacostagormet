/**
 * Placeholder Unsplash URLs used for hero / story / category tiles until
 * Jeff commissions a product shoot or provides owned imagery.
 *
 * When real photography lands:
 *   - Upload to Supabase Storage
 *   - For categories, populate categories.image_url and remove the map entry
 *   - For hero/story, swap the constants here
 *
 * All URLs include `?w=...&auto=format&fit=crop&q=80` so Unsplash returns a
 * reasonable bytesize. `next/image` serves them through its own optimiser.
 */

type PlaceholderImage = { src: string; alt: string };

// Keyed by top-level category slug (see categories table, parent_id IS NULL).
export const CATEGORY_IMAGES: Record<string, PlaceholderImage> = {
  'teas-and-chai': {
    src: 'https://images.unsplash.com/photo-1597318236876-9b1f6f5e3a2d?w=1200&auto=format&fit=crop&q=80',
    alt: 'Loose chai tea with spices on warm linen',
  },
  'cocoa': {
    src: 'https://images.unsplash.com/photo-1542990253-0b8be8040f3a?w=1200&auto=format&fit=crop&q=80',
    alt: 'Cocoa powder in a ceramic bowl',
  },
  'frappes': {
    src: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=1200&auto=format&fit=crop&q=80',
    alt: 'Iced blended coffee frappé in a tall glass',
  },
  'oatmeal-and-grains': {
    src: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=1200&auto=format&fit=crop&q=80',
    alt: 'Warm oatmeal bowl with fruit',
  },
  'smoothie-bases': {
    src: 'https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=1200&auto=format&fit=crop&q=80',
    alt: 'Fruit smoothie in a glass with berries',
  },
  'syrups-and-sauces': {
    src: 'https://images.unsplash.com/photo-1600689987013-efeeff1d0d0e?w=1200&auto=format&fit=crop&q=80',
    alt: 'Amber syrup poured from a glass bottle',
  },
};

export const HERO_IMAGE: PlaceholderImage = {
  src: 'https://images.unsplash.com/photo-1542441851-43d3b44f36c4?w=1200&auto=format&fit=crop&q=80',
  alt: 'Ceramic cup of steaming chai on warm wood',
};

export const STORY_IMAGE: PlaceholderImage = {
  src: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=1200&auto=format&fit=crop&q=80',
  alt: 'Café counter in warm natural light',
};
