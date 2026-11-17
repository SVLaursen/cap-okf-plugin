// Which bundle a request reads (ADR-0010, shared rules): the bundle is looked up by the request's
// tenant and locale, so per-tenant (extensibility) or per-locale bundles can come later without
// changing any channel. In release 0.2 every key gets the same bundle, loaded once.
import type { BundleSource } from "../bundle/source";

/** What a bundle is looked up by: the request's tenant and locale, from cds.context. */
export interface BundleKey {
  tenant?: string;
  locale?: string;
}

/** The bundles a running app serves, one per key. */
export interface Bundles {
  forKey(key: BundleKey): Promise<BundleSource>;
}

/** One bundle for every key (release 0.2), loaded on first use and then kept. */
export function oneBundleForEveryKey(load: () => Promise<BundleSource>): Bundles {
  let bundle: Promise<BundleSource> | undefined;
  return {
    // The key is part of the interface already, so channels pass it; this version ignores it.
    forKey: () => (bundle ??= load()),
  };
}
