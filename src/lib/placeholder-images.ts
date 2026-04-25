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
 *
 * April 2026: category restructure 6 → 5 —
 *   chai-tea, specialty-beverages, smoothies, oatmeal, protein-and-energy.
 */

type PlaceholderImage = { src: string; alt: string };

const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1200&auto=format&fit=crop&q=80`;

// Keyed by categories.slug. All IDs 200-verified and confirmed visually via
// Unsplash search alt-text scrapes (Apr 2026).
export const CATEGORY_IMAGES: Record<string, PlaceholderImage> = {
  'chai-tea': {
    src: UNSPLASH('1571934811356-5cc061b6821f'),
    alt: 'Steaming chai latte in a ceramic cup',
  },
  'specialty-beverages': {
    // Merged category (cocoa + frappés + syrups). Iced frappé glass reads
    // broadly as "coffee drink / specialty" — covers the combined scope.
    src: UNSPLASH('1461023058943-07fcbe16d735'),
    alt: 'Iced blended coffee frappé in a tall glass',
  },
  'smoothies': {
    src: UNSPLASH('1505252585461-04db1eb84625'),
    alt: 'Berry smoothie in a tall glass',
  },
  'oatmeal': {
    src: UNSPLASH('1638813133218-4367bd8123f6'),
    alt: 'Bowl of oatmeal topped with fruit',
  },
  'protein-and-energy': {
    // New category, no products yet. Picked from Unsplash's "protein-powder"
    // search — alt "a jar of protein powder next to a scoop of protein powder".
    src: UNSPLASH('1704650311190-7eeb9c4f6e11'),
    alt: 'Protein powder jar and scoop',
  },
};

export const HERO_IMAGE: PlaceholderImage = {
  src: UNSPLASH('1571934811356-5cc061b6821f'),
  alt: 'Ceramic cup of steaming chai on warm wood',
};

export const STORY_IMAGE: PlaceholderImage = {
  // The Dispatch Desk section (HomeStory).
  src: UNSPLASH('1553413077-190dd305871c'),
  alt: 'Warehouse shelves lined with shipping boxes',
};
