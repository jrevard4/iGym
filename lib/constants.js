// Constants shared between mobile app and (future) web client.
// Keep this file free of React Native / browser-specific imports
// so it can be imported from a Next.js server component too.

export const CLASS_TYPES = ['Yoga', 'HIIT', 'Cycling', 'Pilates', 'Boxing', 'Zumba'];

export const EQUIP_CATEGORIES = ['Machine', 'Cable', 'Free Weight', 'Cardio'];

export const AMENITIES = [
  'Parking', 'Showers', 'Lockers', 'Sauna', 'Pool', 'Free WiFi',
  'Personal Training', 'Group Classes', '24/7 Access', 'Wheelchair Accessible', 'Childcare',
];

export const MUSCLE_GROUPS = [
  'Full Body', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core', 'Cardio',
];

export const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

// Sun-first to match JS Date#getDay() (0 = Sunday) used throughout the class
// schedule/booking logic in lib/helpers.js.
export const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Sections of the public gym page an owner can independently show/hide via
// gym.pageSettings — key matches the pageSettings property, default is what
// a gym with no pageSettings on file (i.e. every gym before this feature)
// falls back to, so nothing changes for existing listings until an owner
// opts in. Core commerce/trust sections (passes, reviews) aren't included
// here on purpose — hiding those would undermine marketplace integrity.
export const PAGE_SECTIONS = [
  { key: 'showEquipment', label: 'Equipment list', default: true },
  { key: 'showClasses', label: 'Classes offered', default: true },
  { key: 'showAmenities', label: 'Amenities', default: true },
  { key: 'showWorkoutGenerator', label: 'AI Workout Generator', default: true },
  { key: 'showSimilarGyms', label: '"You might also like" (other gyms)', default: true },
];

export const PLATFORM_FEE_RATE = 0.12;       // 12% taken from each pass sale
export const MEMBER_PREMIUM_PRICE = 4.99;    // Monthly member premium

export const PLAN_TIERS = {
  free: {
    name: 'Free Listing', price: 0, color: '#8E8E93', emoji: '⚪',
    features: ['Basic gym profile', 'Map listing', 'Up to 5 equipment items', 'Member reviews visible'],
    limits: { equipment: 5, passTypes: 0, aiFeatures: false, analytics: false, featured: false, trainers: false },
  },
  basic: {
    name: 'Basic', price: 49, color: '#007AFF', emoji: '🔵',
    features: ['Full equipment inventory', 'Unlimited pass tiers', 'Front desk QR scanner', 'Trainer roster', 'Basic analytics'],
    limits: { equipment: 9999, passTypes: 10, aiFeatures: false, analytics: 'basic', featured: false, trainers: true },
  },
  pro: {
    name: 'Pro', price: 99, color: '#FF9500', emoji: '⭐',
    features: ['Everything in Basic', 'AI Equipment Identifier', 'AI Web Search', 'Full revenue analytics', 'Featured placement in search', 'Equipment manufacturer links', 'Referral dashboard'],
    limits: { equipment: 9999, passTypes: 9999, aiFeatures: true, analytics: 'full', featured: true, trainers: true },
  },
};

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

export const DEFAULT_LOCATION = { latitude: 39.9612, longitude: -82.9988 };

// Every gym currently on iGym was researched within ~50 miles of Columbus,
// OH (see lib/gyms-seed.js) — searching a city or using "near me" from
// somewhere outside that radius should honestly show "no gyms found" rather
// than silently listing every Columbus-area gym at a 500-mile distance.
export const MAX_SEARCH_RADIUS_MILES = 50;

export const PRESET_PASSES = [
  { label: '1-Day Pass',     price: '15',  type: 'TIME',  value: '1'  },
  { label: '1-Week Trial',   price: '30',  type: 'TIME',  value: '7'  },
  { label: '1-Month Access', price: '60',  type: 'TIME',  value: '30' },
  { label: '10-Class Pack',  price: '120', type: 'PUNCH', value: '10' },
];

// Starter templates for gym-defined recurring membership tiers (Planet Fitness
// "Classic vs Black Card" style) — owners can freely edit label/price/features.
export const PRESET_MEMBERSHIPS = [
  {
    label: 'Basic Membership', price: '15', type: 'MEMBERSHIP', value: '30',
    features: ['Access to this location', 'Standard equipment', 'Free fitness assessment'],
  },
  {
    label: 'Black Card Membership', price: '25', type: 'MEMBERSHIP', value: '30',
    features: ['Access to all locations', 'Bring a guest for free', 'HydroMassage & tanning', 'Half off drinks & snacks'],
  },
];

// Manufacturer website URLs for the "Don't see your equipment?" link
export const BRAND_WEBSITES = {
  'Rogue Fitness':   { url: 'https://www.roguefitness.com/brands/rogue',                         label: 'Browse All Rogue Equipment' },
  'Life Fitness':    { url: 'https://www.lifefitness.com/en-us/catalog',                         label: 'Browse Life Fitness Catalog' },
  'Hammer Strength': { url: 'https://shop.lifefitness.com/collections/hammer-strength',          label: 'Browse Hammer Strength' },
  'Precor':          { url: 'https://www.precor.com/en-us/commercial/products',                  label: 'Browse Precor Products' },
  'Matrix Fitness':  { url: 'https://www.matrixfitness.com/en/cardio',                           label: 'Browse Matrix Fitness' },
  'Peloton':         { url: 'https://www.onepeloton.com/commercial',                             label: 'Browse Peloton Commercial' },
  'Concept2':        { url: 'https://www.concept2.com/products',                                 label: 'Browse Concept2 Products' },
  'StairMaster':     { url: 'https://www.stairmaster.com/products',                              label: 'Browse StairMaster' },
  'Technogym':       { url: 'https://www.technogym.com/en-US/fitness-equipment/',                label: 'Browse Technogym Equipment' },
  'Cybex':           { url: 'https://www.lifefitness.com/en-us/catalog/strength-training/cybex', label: 'Browse Cybex Equipment' },
};

// Anthropic model used for AI features
export const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
