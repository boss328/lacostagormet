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
    // Previous ID 1481391319762-47dff72954d9 rendered as chocolate
    // truffles in a gift box — wrong for this category, which is hot
    // cocoa drink mix. Swapped to a mug of hot chocolate.
    src: UNSPLASH('1517578239113-b03992dcdd25'),
    alt: 'Mug of hot chocolate',
  },
  'frappes': {
    src: UNSPLASH('1461023058943-07fcbe16d735'),
    alt: 'Iced blended coffee frappé in a tall glass',
  },
  'oatmeal-and-grains': {
    // Previous ID 1484723091739-30a097e8f929 was rendering as French
    // toast with bananas and blueberries — not oatmeal. Swapped to an
    // Unsplash-confirmed oatmeal bowl (alt text on the Unsplash search
    // result explicitly reads "a bowl of oatmeal with fruit on top").
    src: UNSPLASH('1638813133218-4367bd8123f6'),
    alt: 'Bowl of oatmeal topped with fruit',
  },
  'smoothie-bases': {
    // Previous ID 1546039907-7fa05f864c02 was reading as hummus / grain
    // bowl, not a smoothie. Swapped to a colourful berry smoothie glass.
    src: UNSPLASH('1505252585461-04db1eb84625'),
    alt: 'Berry smoothie in a tall glass',
  },
  'syrups-and-sauces': {
    // Previous ID 1579954115545-a95591f28bfc rendered as a pink
    // strawberry smoothie — collided visually with the Smoothie Bases
    // tile. Swapped to flavoured-syrup bottles.
    src: UNSPLASH('1541167760496-1628856ab772'),
    alt: 'Flavoured syrup bottles',
  },
};

export const HERO_IMAGE: PlaceholderImage = {
  src: UNSPLASH('1571934811356-5cc061b6821f'),
  alt: 'Ceramic cup of steaming chai on warm wood',
};

export const STORY_IMAGE: PlaceholderImage = {
  // The Dispatch Desk section (HomeStory). Previous ID
  // 1559925393-8be0ec4767c8 was rendering as a European café
  // storefront with wrought iron + cobblestones — completely off-brand
  // for a US wholesale beverage supplier shipping from Carlsbad.
  // Swapped to a warehouse/shipping shelves shot to tie into the body
  // copy's "still shipping from California" line.
  src: UNSPLASH('1553413077-190dd305871c'),
  alt: 'Warehouse shelves lined with shipping boxes',
};
