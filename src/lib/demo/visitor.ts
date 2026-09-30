import { createHash } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

/** The one method of `Headers` the visitor hash reads. */
export interface HeaderReader {
  get: (name: string) => string | null;
}

// Used only outside production, so local runs work without configuration.
const DEVELOPMENT_SALT = "clientdesk-development-salt";

/**
 * The salt for visitor hashes, or `null` when the demo must report itself as
 * not configured: production without `DEMO_VISITOR_SALT`. Without a secret
 * salt the hashes of the small IPv4 space could be reversed by brute force.
 */
export function resolveVisitorSalt({
  salt,
  isProduction,
}: {
  salt: string | undefined;
  isProduction: boolean;
}): string | null {
  if (salt) return salt;
  return isProduction ? null : DEVELOPMENT_SALT;
}

/**
 * The eight 16-bit groups of an IPv6 address, or null when `address` is not
 * one. Expands `::` and reads an embedded IPv4 tail (`::ffff:203.0.113.7`).
 */
function ipv6Groups(address: string): number[] | null {
  if (!isIPv6(address)) return null;

  // A zone id (`fe80::1%eth0`) is not part of the address.
  let text = address.toLowerCase().split("%")[0];
  const tail = text.slice(text.lastIndexOf(":") + 1);
  if (isIPv4(tail)) {
    const [a, b, c, d] = tail.split(".").map(Number);
    text = `${text.slice(0, text.lastIndexOf(":") + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const [head, rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest ? rest.split(":") : [];
  const missing = 8 - front.length - back.length;
  const groups = [...front, ...Array<string>(missing).fill("0"), ...back];
  return groups.map((group) => Number.parseInt(group, 16));
}

/**
 * What identifies a visitor for the limits. An IPv4 address counts as it is.
 * An IPv6 address counts as its /64 prefix: a visitor usually gets a whole
 * /64 from the provider and can pick any address in it, so hashing the full
 * address would let one visitor dodge the per-visitor limit by rotating the
 * low 64 bits. An IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) counts as the
 * IPv4 address. Anything else (not an address at all) is used as it is.
 */
function limitKey(address: string): string {
  const groups = ipv6Groups(address);
  if (groups === null) return address;

  const isMappedIpv4 =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isMappedIpv4) {
    return [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}

// Used when a request carries no address header at all. Every such visitor
// shares one hash and so one set of limits: a request with no address is
// rare (the platform sets one), and lumping them together is the cautious
// choice, because the alternative is no per-visitor limit for them.
const UNKNOWN_ADDRESS = "unknown";

function visitorAddress(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const real = headers.get("x-real-ip")?.trim();
  return real || UNKNOWN_ADDRESS;
}

/**
 * A salted sha256 of the visitor's address (IPv6 by its /64 prefix, see
 * `limitKey`): the first `x-forwarded-for` entry, then `x-real-ip`, then
 * "unknown". Only the hash is stored (in `demo_sandboxes.visitor_hash`),
 * never the address.
 */
export function hashVisitor(headers: HeaderReader, salt: string): string {
  return createHash("sha256")
    .update(`${salt}:${limitKey(visitorAddress(headers))}`)
    .digest("hex");
}
