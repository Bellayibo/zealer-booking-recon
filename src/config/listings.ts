export interface Listing {
  code: string;
  alias: string;            // Substring matched against Booking.com property name
  cleaningFee: number;      // AUD
  cleaningFeeTo: "host" | "owner";
  managementFeeRate: number; // e.g. 0.20 = 20%
  address: string;          // Full property address for owner statement
  ownerName: string;        // Owner name for owner statement
}

export const LISTINGS: Listing[] = [
  // Lower North Shore
  { code: "1-24",   alias: "Mosman Hideaway w Waterview",  cleaningFee: 230, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "1/24 Wolseley Street Mosman NSW 2088",            ownerName: "Zerong Chen" },
  { code: "2-1",    alias: "Harbour Grove Sanctuary",       cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.11, address: "2/1 Bariston Avenue Cremorne NSW 2090",            ownerName: "Shuna Liu" },
  { code: "4-12",   alias: "Balmoral & Beyond",             cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "4/12 Clifford Street Mosman NSW 2088",             ownerName: "Hoi Ling Tsoi" },
  { code: "4-122",  alias: "Oasis Retreat by Cremorne",     cleaningFee: 130, cleaningFeeTo: "host",  managementFeeRate: 0.18, address: "4/122 Milsons Point Avenue Milsons Point NSW 2090", ownerName: "" },
  { code: "6-40",   alias: "Platform & Parklands",          cleaningFee: 130, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "6/40 Humphreys Road Kirribilli NSW 2061",           ownerName: "" },
  { code: "118A",   alias: "Harbour & Heritage",            cleaningFee: 180, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "5/118A Kirribilli Avenue Kirribilli NSW 2061",      ownerName: "CK Ng" },
  { code: "7-108",  alias: "Harbour View Lookout",          cleaningFee: 190, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "7/108 Ben Boyd Road Neutral Bay NSW 2089",          ownerName: "" },
  { code: "10-25",  alias: "Harbour Bridge View",           cleaningFee: 180, cleaningFeeTo: "owner", managementFeeRate: 0.17, address: "10/25 Lavender Street Milsons Point NSW 2061",      ownerName: "" },
  // Haymarket / CBD
  { code: "517",    alias: "The Interlink",                 cleaningFee: 220, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "Unit 517/317 Castlereagh St, Haymarket NSW 2000",   ownerName: "" },
  { code: "550",    alias: "The Elegance,",                 cleaningFee: 220, cleaningFeeTo: "host",  managementFeeRate: 0.13, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "550A",   alias: "The Elegance One",              cleaningFee: 160, cleaningFeeTo: "host",  managementFeeRate: 0.13, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "550B",   alias: "The Elegance Studio",           cleaningFee: 140, cleaningFeeTo: "host",  managementFeeRate: 0.13, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "563A",   alias: "Skyline & City Pulse",          cleaningFee: 160, cleaningFeeTo: "host",  managementFeeRate: 0.13, address: "317/321 Castlereagh Street 563A, Haymarket NSW 2000", ownerName: "" },
  { code: "579",    alias: "The Arcadia in",                cleaningFee: 220, cleaningFeeTo: "host",  managementFeeRate: 0.17, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "579A",   alias: "The Arcadia One",               cleaningFee: 170, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "579B",   alias: "The Arcadia Studio",            cleaningFee: 135, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "317/321 Castlereagh St, Haymarket NSW 2000",        ownerName: "" },
  { code: "620",    alias: "The Relaxation",                cleaningFee: 240, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "317-321 Castlereagh Street 620, Haymarket NSW 2000", ownerName: "" },
  // Ultimo
  { code: "Ultimo", alias: "City Fringe & Creative Vibe",   cleaningFee: 210, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "5 West End Lane, Ultimo NSW 2007",                  ownerName: "" },
  // Additional Lower North Shore
  { code: "12-35",  alias: "Ocean Horizon Escape",          cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.11, address: "35 Moruben Road Unit 12, Mosman NSW 2088",          ownerName: "" },
  { code: "2-40",   alias: "Modern Private Oasis",          cleaningFee: 140, cleaningFeeTo: "owner", managementFeeRate: 0.20, address: "2/40 Brightmore Street, Cremorne NSW 2090",         ownerName: "" },
  { code: "38-2",   alias: "Mosman Highland",               cleaningFee: 140, cleaningFeeTo: "host",  managementFeeRate: 0.13, address: "38/2 Clifford St, Mosman NSW 2088",                 ownerName: "" },
  // Upper North Shore
  { code: "42Carr", alias: "Grand Garden Living",           cleaningFee: 200, cleaningFeeTo: "host",  managementFeeRate: 0.20, address: "42 Carrington Road, Wahroonga NSW 2076",            ownerName: "" },
];

/** Case-insensitive substring match: booking.com property name must contain listing alias */
export function findListingByPropertyName(propertyName: string): Listing | undefined {
  const normalized = propertyName.toLowerCase();
  return LISTINGS.find((l) => normalized.includes(l.alias.toLowerCase()));
}
