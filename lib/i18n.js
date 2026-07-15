// Lightweight shared translation dictionary — covers the primary member
// journey (nav, search, gym detail, login/register, checkout, profile) on
// both platforms. Not exhaustive of every string in the app; the owner
// portal and secondary screens stay English-only for now. Deliberately a
// plain key->string lookup (no framework) so it works identically in
// Next.js and React Native without adding a new dependency.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const STRINGS = {
  en: {
    // Nav / chrome
    findGym: 'Find a Gym',
    wallet: 'Wallet',
    login: 'Log In',
    logout: 'Log Out',
    register: 'Register',
    ownerConsole: 'Owner Console',
    forGymOwners: 'For Gym Owners',

    // Gyms search page
    findGymTitle: 'Find a Gym',
    searchPlaceholder: 'Search by name, location, or description...',
    aiMatchmakerTitle: 'AI Matchmaker — tell us your goal',
    aiMatchmakerPlaceholder: 'e.g. "build leg strength for sprinting, budget under $50/mo"',
    findMyGym: 'Find my gym',
    searching: 'Searching...',
    clear: 'Clear',
    allClasses: 'All classes',
    minMonthly: 'Min monthly $',
    maxMonthly: 'Max monthly $',
    nearestFirst: 'Nearest first',
    topRated: 'Top rated',
    cheapestFirst: 'Cheapest first',
    openNowOnly: 'Show only gyms open right now',
    list: 'List',
    map: 'Map',
    noGymsMatch: 'No gyms match your filters',
    tryWidening: 'Try widening your search or clearing a filter.',
    gymsFound: 'gyms found near you',
    gymFound: 'gym found near you',

    // Gym detail
    backToAllGyms: '← Back to all gyms',
    accessPasses: 'Access Passes',
    membershipPlans: 'Membership Plans',
    equipment: 'Equipment',
    memberReviews: 'Member Reviews',
    visitWebsite: 'Visit website ↗',
    buyPass: 'Buy Pass',
    processing: 'Processing...',
    openNow: 'Open Now',
    closed: 'Closed',
    verified: 'VERIFIED',
    featured: 'FEATURED',
    claimListing: 'Are you the owner of this gym? Claim this listing →',
    shareMatch: 'Share this match',

    // Auth
    username: 'Username',
    password: 'Password',
    confirmPassword: 'Confirm password',
    createAccount: 'Create Account',
    alreadyHaveAccount: 'Already have an account?',
    dontHaveAccount: "Don't have an account?",
    continueAsGuest: 'Continue as guest',
    guestCheckoutHint: "No account needed — we'll just need your name and email.",
    fullName: 'Full name',
    email: 'Email',

    // Profile / streak
    profile: 'Profile',
    dayStreak: 'day streak',
    totalVisits: 'Total visits',
    longestStreak: 'Longest streak',
    streakAtRisk: "Don't lose your streak — check in today!",

    // Checkout
    checkout: 'Checkout',
    payWithCard: 'Pay with card',
    demoMode: 'Demo mode',
  },
  es: {
    findGym: 'Buscar un Gimnasio',
    wallet: 'Billetera',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    register: 'Registrarse',
    ownerConsole: 'Panel del Propietario',
    forGymOwners: 'Para Propietarios de Gimnasios',

    findGymTitle: 'Buscar un Gimnasio',
    searchPlaceholder: 'Busca por nombre, ubicación o descripción...',
    aiMatchmakerTitle: 'Emparejador con IA — cuéntanos tu objetivo',
    aiMatchmakerPlaceholder: 'ej. "fortalecer piernas para correr, presupuesto bajo $50/mes"',
    findMyGym: 'Buscar mi gimnasio',
    searching: 'Buscando...',
    clear: 'Limpiar',
    allClasses: 'Todas las clases',
    minMonthly: 'Mínimo mensual $',
    maxMonthly: 'Máximo mensual $',
    nearestFirst: 'Más cercano primero',
    topRated: 'Mejor calificados',
    cheapestFirst: 'Más económico primero',
    openNowOnly: 'Mostrar solo gimnasios abiertos ahora',
    list: 'Lista',
    map: 'Mapa',
    noGymsMatch: 'Ningún gimnasio coincide con tus filtros',
    tryWidening: 'Intenta ampliar tu búsqueda o quitar un filtro.',
    gymsFound: 'gimnasios encontrados cerca de ti',
    gymFound: 'gimnasio encontrado cerca de ti',

    backToAllGyms: '← Volver a todos los gimnasios',
    accessPasses: 'Pases de Acceso',
    membershipPlans: 'Planes de Membresía',
    equipment: 'Equipamiento',
    memberReviews: 'Reseñas de Miembros',
    visitWebsite: 'Visitar sitio web ↗',
    buyPass: 'Comprar Pase',
    processing: 'Procesando...',
    openNow: 'Abierto Ahora',
    closed: 'Cerrado',
    verified: 'VERIFICADO',
    featured: 'DESTACADO',
    claimListing: '¿Eres el propietario de este gimnasio? Reclama este listado →',
    shareMatch: 'Compartir esta coincidencia',

    username: 'Usuario',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
    createAccount: 'Crear Cuenta',
    alreadyHaveAccount: '¿Ya tienes una cuenta?',
    dontHaveAccount: '¿No tienes una cuenta?',
    continueAsGuest: 'Continuar como invitado',
    guestCheckoutHint: 'No necesitas cuenta — solo tu nombre y correo electrónico.',
    fullName: 'Nombre completo',
    email: 'Correo electrónico',

    profile: 'Perfil',
    dayStreak: 'días seguidos',
    totalVisits: 'Visitas totales',
    longestStreak: 'Racha más larga',
    streakAtRisk: '¡No pierdas tu racha — regístrate hoy!',

    checkout: 'Pagar',
    payWithCard: 'Pagar con tarjeta',
    demoMode: 'Modo demo',
  },
};

export function t(key, lang = 'en') {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

export function getStrings(lang = 'en') {
  return { ...STRINGS.en, ...(STRINGS[lang] || {}) };
}
