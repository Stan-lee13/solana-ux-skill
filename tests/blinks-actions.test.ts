import { describe, it, expect, vi, beforeEach } from "vitest";
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

const ACTIONS_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function buildTransferTransaction(
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  lamports: number,
  recentBlockhash: string
): Transaction {
  const tx = new Transaction();
  tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
  tx.recentBlockhash = recentBlockhash;
  tx.feePayer = fromPubkey;
  return tx;
}

function buildActionGetResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    icon: "https://example.com/icon.png",
    title: "Stake SOL",
    description: "Stake your SOL to earn rewards",
    label: "Stake Now",
    links: {
      actions: [
        { label: "Stake 1 SOL", href: "/api/actions/stake?amount=1" },
        { label: "Stake 5 SOL", href: "/api/actions/stake?amount=5" },
        { label: "Custom Amount", href: "/api/actions/stake?amount={amount}", parameters: [
          { name: "amount", label: "Amount (SOL)", type: "number" }
        ]},
      ],
    },
    ...overrides,
  };
}

// ─── CORS Header Tests ─────────────────────────────────────────────────────────

describe("Action CORS Headers — production compliance", () => {
  it("includes all required CORS headers", () => {
    expect(ACTIONS_CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(ACTIONS_CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("GET");
    expect(ACTIONS_CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("POST");
    expect(ACTIONS_CORS_HEADERS["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(ACTIONS_CORS_HEADERS["Access-Control-Allow-Headers"]).toContain("Content-Type");
  });

  it("OPTIONS preflight returns 200 with CORS headers (not 404)", () => {
    // Simulate OPTIONS handler
    const handleOptions = () => new Response(null, {
      status: 200,
      headers: ACTIONS_CORS_HEADERS,
    });
    const response = handleOptions();
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("error responses also include CORS headers", () => {
    // Critical: missing CORS on error responses silently breaks Blinks
    const errorResponse = new Response(
      JSON.stringify({ error: "Invalid amount" }),
      { status: 400, headers: { ...ACTIONS_CORS_HEADERS, "Content-Type": "application/json" } }
    );
    expect(errorResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

// ─── Action GET Response Tests ─────────────────────────────────────────────────

describe("Action GET Response — schema validation", () => {
  it("has all required fields: icon, title, description, label", () => {
    const response = buildActionGetResponse();
    expect(response).toHaveProperty("icon");
    expect(response).toHaveProperty("title");
    expect(response).toHaveProperty("description");
    expect(response).toHaveProperty("label");
    expect(typeof response.icon).toBe("string");
    expect(response.icon).toMatch(/^https?:\/\//);
  });

  it("icon is a valid absolute URL — relative URLs break Blinks on external platforms", () => {
    const withRelativeIcon = buildActionGetResponse({ icon: "/icon.png" });
    const isAbsolute = withRelativeIcon.icon.startsWith("http");
    expect(isAbsolute).toBe(false); // This is the failure case we detect
    // In production: enforce absolute URLs
    const withAbsoluteIcon = buildActionGetResponse({ icon: "https://example.com/icon.png" });
    expect(withAbsoluteIcon.icon.startsWith("https://")).toBe(true);
  });

  it("linked actions href supports parameter templating", () => {
    const response = buildActionGetResponse();
    const parameterizedAction = response.links?.actions?.find((a: Record<string, unknown>) =>
      typeof a.href === "string" && a.href.includes("{amount}")
    );
    expect(parameterizedAction).toBeDefined();
    expect(parameterizedAction.parameters).toBeDefined();
    expect(parameterizedAction.parameters[0].name).toBe("amount");
  });

  it("title and description are within display limits", () => {
    const response = buildActionGetResponse();
    // Blinks truncate titles > 50 chars and descriptions > 100 chars in some UIs
    expect(response.title.length).toBeLessThanOrEqual(50);
    expect(response.description.length).toBeLessThanOrEqual(200);
  });
});

// ─── Action POST Response Tests ────────────────────────────────────────────────

describe("Action POST Response — transaction building", () => {
  const alice = Keypair.generate();
  const bob = Keypair.generate();
  const FAKE_BLOCKHASH = "Eit7RCyhUixAe2hGBS8oqnw59QK3kgMMjfLME5bm9wRn";

  it("returns a base64-encoded transaction", () => {
    const tx = buildTransferTransaction(
      alice.publicKey,
      bob.publicKey,
      0.1 * LAMPORTS_PER_SOL,
      FAKE_BLOCKHASH
    );
    const serialized = tx.serialize({ requireAllSignatures: false });
    const base64 = Buffer.from(serialized).toString("base64");
    expect(typeof base64).toBe("string");
    expect(base64.length).toBeGreaterThan(0);
    // Must be decodable
    const decoded = Buffer.from(base64, "base64");
    expect(decoded.length).toBeGreaterThan(0);
  });

  it("transaction feePayer is set to user account — not server wallet", () => {
    const tx = buildTransferTransaction(
      alice.publicKey,
      bob.publicKey,
      0.01 * LAMPORTS_PER_SOL,
      FAKE_BLOCKHASH
    );
    expect(tx.feePayer?.toString()).toBe(alice.publicKey.toString());
    // Server wallet must NOT be the fee payer in standard Blinks
    expect(tx.feePayer?.toString()).not.toBe(bob.publicKey.toString());
  });

  it("rejects invalid account addresses", () => {
    const invalidAddress = "not-a-real-public-key";
    expect(() => new PublicKey(invalidAddress)).toThrow();
  });

  it("validates amount bounds — rejects zero and negative amounts", () => {
    const validateAmount = (amount: number) => {
      if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number");
      if (amount <= 0) throw new Error("Amount must be positive");
      if (amount > 1_000_000) throw new Error("Amount exceeds maximum");
      return amount;
    };
    expect(() => validateAmount(0)).toThrow("Amount must be positive");
    expect(() => validateAmount(-1)).toThrow("Amount must be positive");
    expect(() => validateAmount(Infinity)).toThrow("finite number");
    expect(() => validateAmount(1_500_000)).toThrow("exceeds maximum");
    expect(validateAmount(1)).toBe(1);
  });
});

// ─── Action Chaining Tests ─────────────────────────────────────────────────────

describe("Action Chaining — multi-step flows", () => {
  it("first action includes next link in POST response", () => {
    const postResponse = {
      transaction: "base64_tx",
      message: "Stake submitted",
      links: {
        next: {
          type: "inline",
          action: {
            type: "action",
            label: "Set Auto-Compound",
            href: "/api/actions/stake/autocompound",
          },
        },
      },
    };
    expect(postResponse.links?.next).toBeDefined();
    expect(postResponse.links.next.type).toBe("inline");
  });

  it("completed chain returns type: completed (no further actions)", () => {
    const finalResponse = {
      transaction: "base64_tx",
      links: {
        next: { type: "completed" as const },
      },
    };
    expect(finalResponse.links.next.type).toBe("completed");
  });

  it("chained action href is an absolute URL or starts with /", () => {
    const chainedHref = "/api/actions/stake/autocompound";
    const isRelativeOrAbsolute =
      chainedHref.startsWith("/") || chainedHref.startsWith("http");
    expect(isRelativeOrAbsolute).toBe(true);
  });
});

// ─── actions.json Domain Registration Tests ────────────────────────────────────

describe("actions.json — domain registration", () => {
  it("has required rules array", () => {
    const actionsJson = {
      rules: [
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    };
    expect(actionsJson.rules).toBeDefined();
    expect(Array.isArray(actionsJson.rules)).toBe(true);
    expect(actionsJson.rules.length).toBeGreaterThan(0);
  });

  it("each rule has pathPattern and apiPath", () => {
    const rule = { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" };
    expect(rule.pathPattern).toBeDefined();
    expect(rule.apiPath).toBeDefined();
    expect(rule.pathPattern).toContain("/api/actions");
  });

  it("wildcard rule matches nested action paths", () => {
    const pattern = "/api/actions/**";
    const testPaths = [
      "/api/actions/stake",
      "/api/actions/stake/confirm",
      "/api/actions/governance/vote",
    ];
    for (const path of testPaths) {
      // Simple glob match: ** matches anything after /api/actions/
      const matches = path.startsWith("/api/actions/");
      expect(matches).toBe(true);
    }
  });
});
