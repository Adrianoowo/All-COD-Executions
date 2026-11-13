/**
 * itemshop.d.ts
 * TypeScript type definitions for the itemshop.gg Item Shop API.
 * Reference: https://itemshop.gg/developers
 */

export interface ItemShopRarity {
  name: string;
  color: string;
}

export interface ItemShopPrice {
  /** COD Points amount, or null if no number (e.g. Included / Platform Store) */
  amount: number | null;
  /** Label such as "Included", "Platform store", or null */
  label: string | null;
  /** Currency name like "COD Points", "VP", or ISO code "USD" */
  currency: string;
  /** URL to currency icon image */
  currencyIcon: string | null;
  /** Regular non-discounted price if on sale */
  regular: number | null;
}

export interface ItemShopImages {
  card: string | null;
  render: string | null;
}

export interface ItemShopAvailability {
  from: string | null;
  until: string | null;
  untilLabel: string | null;
}

export interface ItemShopPaint {
  name: string;
  color: string;
}

export interface ItemShopBundleContent {
  name: string;
  type: string;
  rarity: ItemShopRarity | null;
  image: string | null;
  quantity: number;
  itemKey: string | null;
  paint: ItemShopPaint | null;
}

export interface ItemShopItem {
  id: string;
  itemKey: string;
  name: string;
  type: string;
  rarity: ItemShopRarity | null;
  price: ItemShopPrice;
  images: ItemShopImages;
  badge: string | null;
  availability: ItemShopAvailability;
  bundle: string | null;
  contents: ItemShopBundleContent[];
  soldOut: boolean;
  sourceUrl: string | null;
  paint: ItemShopPaint | null;
}

export interface ItemShopSection {
  title: string;
  upcoming: boolean;
  endsAt: string | null;
  items: ItemShopItem[];
}

export interface ItemShopData {
  game: string;
  shopDate: string;
  updatedAt: string;
  expiresAt: string | null;
  stale: boolean;
  itemCount: number;
  /** Ready-made composite pictures of the shop */
  images: string[];
  sections: ItemShopSection[];
}

export interface ItemShopAttribution {
  text: string;
  url: string;
}

export interface ItemShopMeta {
  generatedAt: string;
  attribution: ItemShopAttribution;
  docs: string;
  terms: string;
}

export interface ItemShopResponse {
  data: ItemShopData;
  meta: ItemShopMeta;
}

export interface ItemShopErrorDetails {
  code: 'key_required' | 'invalid_key' | 'unknown_game' | 'not_recorded' | 'unknown_item' | 'rate_limited' | 'shop_unavailable' | string;
  message: string;
}

export interface ItemShopErrorResponse {
  error: ItemShopErrorDetails;
}

export interface GameCurrency {
  name: string;
  icon: string | null;
}

export interface GameReset {
  hourUtc: number;
  minuteUtc: number;
  weekday: number | null;
  timeZone: string | null;
}

export interface GameInfo {
  slug: string;
  name: string;
  url: string;
  shopUrl: string;
  currency: GameCurrency;
  reset: GameReset | null;
  historyUrl: string;
  historyFrom: string | null;
  itemHistory: boolean;
}

export interface GamesResponse {
  data: GameInfo[];
  meta: ItemShopMeta;
}

export interface RotationInfo {
  fingerprint: string;
  changedAt: string;
}

export interface RotationsResponse {
  data: Record<string, RotationInfo>;
  meta: ItemShopMeta;
}

export interface HistoryDatesResponse {
  data: string[];
  meta: ItemShopMeta;
}

export interface HistoryShopData extends ItemShopData {
  exact: boolean;
}

export interface HistoryShopResponse {
  data: HistoryShopData;
  meta: ItemShopMeta;
}

export interface FinisherShopEntry {
  finisherName: string;
  bundleName: string;
  bundleId: string;
  bundleItemKey: string;
  finisherItemKey: string | null;
  finisherImage: string | null;
  bundleCardImage: string | null;
  rarity: ItemShopRarity | null;
  price: ItemShopPrice;
  sectionTitle: string;
  sourceUrl: string | null;
  availability: ItemShopAvailability;
}
