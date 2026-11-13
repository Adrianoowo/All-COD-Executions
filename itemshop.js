/**
 * itemshop.js
 * Client library and store data integration for itemshop.gg Item Shop API.
 * Full reference: https://itemshop.gg/developers
 *
 * Attribution required by terms:
 * Wherever the data is shown, a visible link "Data from itemshop.gg" linking to
 * meta.attribution.url must be displayed.
 */

(function (global) {
  'use strict';

  /**
   * @typedef {Object} ItemShopRarity
   * @property {string} name
   * @property {string} color
   */

  /**
   * @typedef {Object} ItemShopPrice
   * @property {number|null} amount
   * @property {string|null} label
   * @property {string} currency
   * @property {string|null} currencyIcon
   * @property {number|null} regular
   */

  /**
   * @typedef {Object} ItemShopImages
   * @property {string|null} card
   * @property {string|null} render
   */

  /**
   * @typedef {Object} ItemShopAvailability
   * @property {string|null} from
   * @property {string|null} until
   * @property {string|null} untilLabel
   */

  /**
   * @typedef {Object} ItemShopBundleContent
   * @property {string} name
   * @property {string} type
   * @property {ItemShopRarity|null} rarity
   * @property {string|null} image
   * @property {number} quantity
   * @property {string|null} itemKey
   * @property {{ name: string, color: string }|null} [paint]
   */

  /**
   * @typedef {Object} ItemShopItem
   * @property {string} id
   * @property {string} itemKey
   * @property {string} name
   * @property {string} type
   * @property {ItemShopRarity|null} rarity
   * @property {ItemShopPrice} price
   * @property {ItemShopImages} images
   * @property {string|null} badge
   * @property {ItemShopAvailability} availability
   * @property {string|null} bundle
   * @property {ItemShopBundleContent[]} contents
   * @property {boolean} soldOut
   * @property {string|null} sourceUrl
   * @property {{ name: string, color: string }|null} paint
   */

  /**
   * @typedef {Object} ItemShopSection
   * @property {string} title
   * @property {boolean} upcoming
   * @property {string|null} endsAt
   * @property {ItemShopItem[]} items
   */

  /**
   * @typedef {Object} ItemShopData
   * @property {string} game
   * @property {string} shopDate
   * @property {string} updatedAt
   * @property {string|null} expiresAt
   * @property {boolean} stale
   * @property {number} itemCount
   * @property {string[]} images
   * @property {ItemShopSection[]} sections
   */

  /**
   * @typedef {Object} ItemShopMeta
   * @property {string} generatedAt
   * @property {{ text: string, url: string }} attribution
   * @property {string} docs
   * @property {string} terms
   */

  /**
   * @typedef {Object} ItemShopResponse
   * @property {ItemShopData} data
   * @property {ItemShopMeta} meta
   */

  /**
   * @typedef {Object} FinisherShopEntry
   * @property {string} finisherName
   * @property {string} bundleName
   * @property {string} bundleId
   * @property {string} bundleItemKey
   * @property {string|null} finisherItemKey
   * @property {string|null} finisherImage
   * @property {string|null} bundleCardImage
   * @property {ItemShopRarity|null} rarity
   * @property {ItemShopPrice} price
   * @property {string} sectionTitle
   * @property {string|null} sourceUrl
   * @property {ItemShopAvailability} availability
   */

  const API_BASE_URL = 'https://itemshop.gg/api/v1';
  const DEFAULT_GAME = 'call-of-duty';
  const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes as recommended by API docs

  class ItemShopClient {
    /**
     * @param {Object} [options]
     * @param {string} [options.apiKey] - Optional API key for keyed endpoints
     * @param {string} [options.game='call-of-duty'] - Target game slug
     * @param {string} [options.userAgent] - Client identifier
     * @param {Storage} [options.storage] - Storage interface (defaults to localStorage)
     */
    constructor(options = {}) {
      this.apiKey = options.apiKey || (typeof process !== 'undefined' && process.env && process.env.ITEMSHOP_API_KEY) || null;
      this.game = options.game || DEFAULT_GAME;
      this.userAgent = options.userAgent || 'All-COD-Executions/1.0 (https://github.com/Adrianoowo/All-COD-Executions)';
      this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      this.cachePrefix = 'itemshop_cache_';
      this.rateLimit = {
        limit: 30,
        retryAfter: 0,
        rateLimitedUntil: 0
      };
    }

    /**
     * Normalize string for fuzzy matching (removes symbols, lowercases)
     * @param {string} str
     * @returns {string}
     */
    static normalizeKey(str) {
      if (!str) return '';
      return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Infer the game key (e.g. MW4, BO7, BO6, MWIII, MWII, MW, CW, VG) from store section title.
     * @param {string} sectionTitle
     * @returns {string|null}
     */
    static inferGameFromSection(sectionTitle) {
      if (!sectionTitle) return null;
      const s = String(sectionTitle).toLowerCase();
      if (s.includes('modern warfare 4') || s.includes('mw4')) return 'MW4';
      if (s.includes('black ops 7') || s.includes('bo7')) return 'BO7';
      if (s.includes('black ops 6') || s.includes('bo6')) return 'BO6';
      if (s.includes('modern warfare iii') || s.includes('mwiii') || s.includes('mw3')) return 'MWIII';
      if (s.includes('modern warfare ii') || s.includes('mwii') || s.includes('mw2')) return 'MWII';
      if (s.includes('vanguard') || s.includes('vg')) return 'VG';
      if (s.includes('cold war') || s.includes('bocw') || s.includes('cw')) return 'CW';
      if (s.includes('modern warfare') || s.includes('mw2019')) return 'MW';
      return null;
    }

    /**
     * Format a price from ItemShopPrice into user-friendly text
     * @param {ItemShopPrice} price
     * @returns {string}
     */
    static formatPrice(price) {
      if (!price) return 'Unknown';
      if (typeof price.amount === 'number') {
        if (price.amount === 0) return 'Free';
        if (price.currency === 'COD Points') return `${price.amount.toLocaleString()} CP`;
        return `${price.amount.toLocaleString()} ${price.currency}`;
      }
      if (price.label) return price.label;
      return 'Unknown';
    }

    /**
     * Retrieve headers for API requests
     * @param {string|null} etag
     * @returns {HeadersInit}
     */
    _buildHeaders(etag = null) {
      const headers = {
        'Accept': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      if (etag) {
        headers['If-None-Match'] = etag;
      }

      // Only set User-Agent in server/Node.js environments.
      // In browsers, custom headers like X-Client trigger CORS preflight failures on itemshop.gg.
      if (typeof window === 'undefined') {
        headers['User-Agent'] = this.userAgent;
      }

      return headers;
    }

    /**
     * Read from local storage cache
     * @private
     * @param {string} key
     */
    _getCache(key) {
      if (!this.storage) return null;
      try {
        const raw = this.storage.getItem(this.cachePrefix + key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    }

    /**
     * Write to local storage cache
     * @private
     * @param {string} key
     * @param {any} data
     * @param {string|null} etag
     */
    _setCache(key, data, etag = null) {
      if (!this.storage) return;
      try {
        const entry = {
          data,
          etag,
          timestamp: Date.now()
        };
        this.storage.setItem(this.cachePrefix + key, JSON.stringify(entry));
      } catch (err) {
        // Handle storage quota issues gracefully
      }
    }

    /**
     * Generic fetch method with ETag caching, 304 handling, and rate-limit backoff
     * @param {string} endpoint
     * @param {Object} [opts]
     * @param {boolean} [opts.requiresKey=false]
     * @param {boolean} [opts.forceRefresh=false]
     * @returns {Promise<any>}
     */
    async _request(endpoint, opts = {}) {
      const requiresKey = !!opts.requiresKey;
      const forceRefresh = !!opts.forceRefresh;
      const cacheKey = endpoint.replace(/[^a-zA-Z0-9_]/g, '_');

      if (requiresKey && !this.apiKey) {
        throw new Error(
          `API key required for endpoint "${endpoint}". Obtain a free key at https://itemshop.gg/account#api and set ITEMSHOP_API_KEY.`
        );
      }

      // Check client-side rate limit backoff
      const now = Date.now();
      if (this.rateLimit.rateLimitedUntil > now) {
        const waitSec = Math.ceil((this.rateLimit.rateLimitedUntil - now) / 1000);
        throw new Error(`Rate limit active. Please wait ${waitSec}s before retrying.`);
      }

      // Check cache validity (2 minutes TTL)
      const cached = this._getCache(cacheKey);
      if (!forceRefresh && cached && cached.timestamp && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
      }

      const url = `${API_BASE_URL}${endpoint}`;
      const headers = this._buildHeaders(cached ? cached.etag : null);

      let response;
      try {
        response = await fetch(url, { method: 'GET', headers });
      } catch (networkErr) {
        // If network error happens (e.g. adblocker), attempt CORS proxy in browser
        if (typeof window !== 'undefined') {
          try {
            console.warn(`[itemshop.gg] Direct fetch failed, attempting proxy fallback...`);
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            response = await fetch(proxyUrl);
          } catch (proxyErr) {
            if (cached && cached.data) {
              console.warn(`[itemshop.gg] Proxy fetch also failed, using cached store data:`, proxyErr);
              return cached.data;
            }
            throw networkErr;
          }
        } else if (cached && cached.data) {
          return cached.data;
        } else {
          throw networkErr;
        }
      }

      // Track rate limit headers
      const rateLimitHeader = response.headers.get('x-ratelimit-limit');
      if (rateLimitHeader) {
        this.rateLimit.limit = parseInt(rateLimitHeader, 10) || 30;
      }

      // Handle 304 Not Modified
      if (response.status === 304) {
        if (cached && cached.data) {
          // Refresh cache timestamp so it's good for another 2 minutes
          this._setCache(cacheKey, cached.data, cached.etag);
          return cached.data;
        }
      }

      // Handle 429 Rate Limited
      if (response.status === 429) {
        const retryAfterSec = parseInt(response.headers.get('retry-after') || '60', 10);
        this.rateLimit.rateLimitedUntil = Date.now() + (retryAfterSec * 1000);
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (_) {}
        const msg = (errorData && errorData.error && errorData.error.message) || `Rate limit exceeded. Retry after ${retryAfterSec}s.`;
        const err = new Error(msg);
        err.code = 'rate_limited';
        err.retryAfter = retryAfterSec;
        throw err;
      }

      // Handle other non-200 responses
      if (!response.ok) {
        let errJson = null;
        try {
          errJson = await response.json();
        } catch (_) {}
        const code = (errJson && errJson.error && errJson.error.code) || `HTTP_${response.status}`;
        const message = (errJson && errJson.error && errJson.error.message) || `Request failed with status ${response.status}`;
        const error = new Error(`[itemshop.gg] ${code}: ${message}`);
        error.code = code;
        error.status = response.status;
        throw error;
      }

      const json = await response.json();
      const etag = response.headers.get('etag');

      // Cache valid JSON response
      this._setCache(cacheKey, json, etag);
      return json;
    }

    /**
     * Get the live shop for Call of Duty (or configured game)
     * Public endpoint: no key required (up to 30 req/min).
     * @param {string} [game]
     * @param {Object} [opts]
     * @returns {Promise<ItemShopResponse>}
     */
    async getShop(game = this.game, opts = {}) {
      return this._request(`/shop/${encodeURIComponent(game)}`, {
        requiresKey: false,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Get rotation fingerprints for all games
     * Public endpoint: no key required.
     * @param {Object} [opts]
     * @returns {Promise<{ data: Record<string, { fingerprint: string, changedAt: string }>, meta: ItemShopMeta }>}
     */
    async getRotations(opts = {}) {
      return this._request(`/rotations`, {
        requiresKey: false,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Get all supported games and their metadata
     * Public endpoint: no key required.
     * @param {Object} [opts]
     * @returns {Promise<{ data: Array<any>, meta: ItemShopMeta }>}
     */
    async getGames(opts = {}) {
      return this._request(`/games`, {
        requiresKey: false,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Get history of dates when a game's shop changed
     * Requires API key.
     * @param {string} [game]
     * @param {Object} [opts]
     * @returns {Promise<{ data: string[], meta: ItemShopMeta }>}
     */
    async getHistoryDates(game = this.game, opts = {}) {
      return this._request(`/history/${encodeURIComponent(game)}`, {
        requiresKey: true,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Get historical shop for a specific date (YYYY-MM-DD UTC)
     * Requires API key.
     * @param {string} date - 'YYYY-MM-DD'
     * @param {string} [game]
     * @param {Object} [opts]
     * @returns {Promise<ItemShopResponse>}
     */
    async getHistoryShop(date, game = this.game, opts = {}) {
      return this._request(`/history/${encodeURIComponent(game)}/${encodeURIComponent(date)}`, {
        requiresKey: true,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Get item details and shop history
     * Requires API key.
     * @param {string} itemKey
     * @param {string} [game]
     * @param {Object} [opts]
     * @returns {Promise<any>}
     */
    async getItem(itemKey, game = this.game, opts = {}) {
      return this._request(`/items/${encodeURIComponent(game)}/${encodeURIComponent(itemKey)}`, {
        requiresKey: true,
        forceRefresh: opts.forceRefresh
      });
    }

    /**
     * Parse Call of Duty shop data and extract all Finishing Moves
     * Matches items or contents with type containing "Finishing Move" or "Execution"
     * @param {ItemShopResponse|ItemShopData} shop
     * @returns {{
     *   finishers: FinisherShopEntry[],
     *   byName: Map<string, FinisherShopEntry>,
     *   byBundle: Map<string, FinisherShopEntry[]>
     * }}
     */
    parseFinishingMoves(shop) {
      const data = shop && shop.data ? shop.data : shop;
      const sections = (data && data.sections) || [];

      /** @type {FinisherShopEntry[]} */
      const finishers = [];
      /** @type {Map<string, FinisherShopEntry[]>} */
      const byName = new Map();
      /** @type {Map<string, FinisherShopEntry[]>} */
      const byBundle = new Map();

      for (const section of sections) {
        const items = section.items || [];
        for (const item of items) {
          const bundleName = item.name || '';
          const bundleNorm = ItemShopClient.normalizeKey(bundleName);
          const bundleCardImage = (item.images && item.images.card) || null;
          const bundleId = item.id || '';
          const bundleItemKey = item.itemKey || '';
          const contents = item.contents || [];

          // 1. Direct item is a Finishing Move
          const isDirectFinisher = /finishing move|execution|finisher/i.test(item.type || '');
          if (isDirectFinisher) {
            /** @type {FinisherShopEntry} */
            const entry = {
              finisherName: item.name,
              bundleName: item.bundle || item.name,
              bundleId,
              bundleItemKey,
              finisherItemKey: item.itemKey,
              finisherImage: (item.images && (item.images.card || item.images.render)) || null,
              bundleCardImage,
              rarity: item.rarity,
              price: item.price,
              sectionTitle: section.title,
              sourceUrl: item.sourceUrl,
              availability: item.availability
            };
            finishers.push(entry);
            const k = ItemShopClient.normalizeKey(item.name);
            if (!byName.has(k)) byName.set(k, []);
            byName.get(k).push(entry);

            const bKey = ItemShopClient.normalizeKey(entry.bundleName);
            if (!byBundle.has(bKey)) byBundle.set(bKey, []);
            byBundle.get(bKey).push(entry);
          }

          // 2. Bundle contents include Finishing Moves
          for (const content of contents) {
            const isContentFinisher = /finishing move|execution|finisher/i.test(content.type || '') ||
                                      /finishing move|execution/i.test(content.name || '');
            if (isContentFinisher) {
              /** @type {FinisherShopEntry} */
              const entry = {
                finisherName: content.name,
                bundleName: bundleName,
                bundleId,
                bundleItemKey,
                finisherItemKey: content.itemKey || null,
                finisherImage: content.image || null,
                bundleCardImage,
                rarity: content.rarity || item.rarity,
                price: item.price,
                sectionTitle: section.title,
                sourceUrl: item.sourceUrl,
                availability: item.availability
              };
              finishers.push(entry);
              const fNorm = ItemShopClient.normalizeKey(content.name);
              if (!byName.has(fNorm)) byName.set(fNorm, []);
              byName.get(fNorm).push(entry);

              if (bundleNorm) {
                if (!byBundle.has(bundleNorm)) byBundle.set(bundleNorm, []);
                byBundle.get(bundleNorm).push(entry);
              }
            }
          }
        }
      }

      return { finishers, byName, byBundle };
    }

    /**
     * Check if a specific execution is in the parsed shop data
     * @param {Object} execution - Database execution item
     * @param {Map<string, FinisherShopEntry|FinisherShopEntry[]>} byNameMap
     * @param {Map<string, FinisherShopEntry[]>} [byBundleMap]
     * @returns {FinisherShopEntry|null}
     */
    findFinisherInShop(execution, byNameMap, byBundleMap) {
      if (!execution || !byNameMap) return null;

      const execGame = (execution.game || '').toUpperCase();
      const isBaseMove = /base operator|unlocked with|base game|default move/i.test(execution.bundle || '');
      const execBundleNorm = ItemShopClient.normalizeKey(execution.bundle || '');

      function isCandidateCompatible(c) {
        if (!c) return false;
        const secGame = ItemShopClient.inferGameFromSection(c.sectionTitle);
        if (execGame && secGame && execGame !== secGame) return false;
        if (isBaseMove && c.price && c.price.amount > 0) return false;
        return true;
      }

      function pickBest(candidates) {
        if (!candidates) return null;
        const list = Array.isArray(candidates) ? candidates : [candidates];
        const compatible = list.filter(isCandidateCompatible);
        if (compatible.length === 0) return null;
        if (execBundleNorm) {
          const bundleMatch = compatible.find(c => ItemShopClient.normalizeKey(c.bundleName) === execBundleNorm);
          if (bundleMatch) return bundleMatch;
        }
        return compatible[0];
      }

      // 1. Match by clean execution name
      const nameKey = ItemShopClient.normalizeKey(execution.name);
      if (nameKey && byNameMap.has(nameKey)) {
        const match = pickBest(byNameMap.get(nameKey));
        if (match) return match;
      }

      // 2. Match by clean_name property
      if (execution.clean_name) {
        const cleanKey = ItemShopClient.normalizeKey(execution.clean_name);
        if (cleanKey && byNameMap.has(cleanKey)) {
          const match = pickBest(byNameMap.get(cleanKey));
          if (match) return match;
        }
      }

      // 3. Match by aliases
      if (Array.isArray(execution.aliases)) {
        for (const alias of execution.aliases) {
          const aliasKey = ItemShopClient.normalizeKey(alias);
          if (aliasKey && byNameMap.has(aliasKey)) {
            const match = pickBest(byNameMap.get(aliasKey));
            if (match) return match;
          }
        }
      }

      // 4. Match by bundle name if bundle matches
      if (byBundleMap && execBundleNorm && byBundleMap.has(execBundleNorm)) {
        const bEntries = byBundleMap.get(execBundleNorm).filter(isCandidateCompatible);
        if (bEntries.length > 0) {
          for (const entry of bEntries) {
            if (ItemShopClient.normalizeKey(entry.finisherName) === nameKey) {
              return entry;
            }
          }
          return bEntries[0];
        }
      }

      return null;
    }

    /**
     * Standard attribution metadata helper
     * Required by itemshop.gg API terms
     * @param {ItemShopMeta} [meta]
     * @returns {{ text: string, url: string, termsUrl: string }}
     */
    static getAttribution(meta) {
      const url = (meta && meta.attribution && meta.attribution.url) || 'https://itemshop.gg/call-of-duty';
      const text = (meta && meta.attribution && meta.attribution.text) || 'Data from itemshop.gg';
      const termsUrl = (meta && meta.terms) || 'https://itemshop.gg/terms#api';
      return { text, url, termsUrl };
    }
  }

  // Export for browser and node
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ItemShopClient };
  } else {
    global.ItemShopClient = ItemShopClient;
  }
})(typeof window !== 'undefined' ? window : globalThis);
