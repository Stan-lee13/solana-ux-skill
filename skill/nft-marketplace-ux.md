# NFT Marketplace UX for Solana

NFT marketplaces have unique UX challenges: visual discovery, price discovery, bidding mechanics, royalty handling, and collection management. Users need to browse, discover, evaluate, and transact — all while understanding value, rarity, and ownership.

This sub-skill covers how to design, implement, and verify NFT marketplace UX that drives discovery and conversion.

Use it when building:

- NFT listing interfaces
- Marketplace browsing and discovery
- Bidding and auction systems
- Collection pages and filters
- NFT detail pages
- Offer management
- Portfolio and inventory views
- NFT Blinks/Actions for social sharing

## Core Principle

NFT marketplace UX must balance three competing needs:

1. **Discovery** — Help users find NFTs they care about
2. **Trust** — Show enough detail for confident purchasing decisions
3. **Speed** — Enable quick transactions without friction

Good Solana NFT UX uses visual-first design with progressive information disclosure.

## The Marketplace State Machine

```typescript
export type MarketplaceState =
  | "idle"
  | "browsing"
  | "viewing-nft"
  | "listing"
  | "listing-confirming"
  | "listed"
  | "buying"
  | "buying-confirming"
  | "bought"
  | "bidding"
  | "bid-placed"
  | "accepting-bid"
  | "bid-accepted"
  | "cancelling-listing"
  | "listing-cancelled"
  | "making-offer"
  | "offer-made"
  | "accepting-offer"
  | "offer-accepted"
  | "failed"
  | "expired";
```

## NFT Card Component

### Basic NFT Card

```tsx
// components/NFTCard.tsx
interface NFTCardProps {
  nft: {
    name: string;
    image: string;
    collection: string;
    price?: number;
    currency?: string;
    listed: boolean;
    rarity?: string;
    lastSale?: number;
  };
  onClick?: () => void;
}

export function NFTCard({ nft, onClick }: NFTCardProps) {
  return (
    <div 
      className="group border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="aspect-square relative">
        <img 
          src={nft.image} 
          alt={nft.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {nft.rarity && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 backdrop-blur rounded text-xs text-white">
            {nft.rarity}
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div>
          <h3 className="font-semibold text-sm truncate">{nft.name}</h3>
          <p className="text-xs text-muted-foreground">{nft.collection}</p>
        </div>

        {nft.listed && nft.price ? (
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Current price</span>
            <span className="font-semibold text-sm">
              {nft.price} {nft.currency || "SOL"}
            </span>
          </div>
        ) : nft.lastSale ? (
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Last sale</span>
            <span className="font-semibold text-sm">
              {nft.lastSale} SOL
            </span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Not listed</div>
        )}
      </div>
    </div>
  );
}
```

### NFT Card with Quick Actions

```tsx
// components/NFTCardWithActions.tsx
export function NFTCardWithActions({ nft, onBuy, onBid }: NFTCardProps & {
  onBuy?: () => void;
  onBid?: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div 
      className="group border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="aspect-square relative">
        <img 
          src={nft.image} 
          alt={nft.name}
          className="w-full h-full object-cover"
        />
        
        {showActions && nft.listed && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur flex items-center justify-center gap-2">
            {onBuy && (
              <Button size="sm" onClick={onBuy}>
                Buy now
              </Button>
            )}
            {onBid && (
              <Button size="sm" variant="outline" onClick={onBid}>
                Place bid
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Same content as basic card */}
    </div>
  );
}
```

## NFT Detail Page

### Full NFT Detail View

```tsx
// components/NFTDetail.tsx
export function NFTDetail({ nftId }: { nftId: string }) {
  const [nft, setNft] = useState<NFT | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"details" | "activity" | "bids">("details");

  useEffect(() => {
    getNFT(nftId).then((data) => {
      setNft(data);
      setLoading(false);
    });
  }, [nftId]);

  if (loading) return <NFTDetailSkeleton />;
  if (!nft) return <NFTNotFound />;

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* Image section */}
      <div className="space-y-4">
        <div className="aspect-square rounded-lg overflow-hidden border">
          <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
        </div>
        
        {/* Quick actions */}
        <div className="flex gap-2">
          {nft.listed ? (
            <>
              <BuyButton nft={nft} />
              <BidButton nft={nft} />
            </>
          ) : (
            <MakeOfferButton nft={nft} />
          )}
          <ShareButton nft={nft} />
        </div>
      </div>

      {/* Details section */}
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{nft.name}</h1>
          <p className="text-muted-foreground">{nft.collection}</p>
        </div>

        {/* Price */}
        {nft.listed && nft.price ? (
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground">Current price</p>
                  <p className="text-2xl font-bold">
                    {nft.price} {nft.currency || "SOL"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">USD value</p>
                  <p className="font-semibold">
                    ${formatUSD(nft.price * SOL_PRICE)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="bids">Bids</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <AttributeList attributes={nft.attributes} />
            <Description description={nft.description} />
            <CreatorInfo creator={nft.creator} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityHistory nftId={nft.id} />
          </TabsContent>

          <TabsContent value="bids">
            <BidList nftId={nft.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

### Attribute Display

```tsx
// components/AttributeList.tsx
export function AttributeList({ attributes }: { attributes: Attribute[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {attributes.map((attr) => (
        <div key={attr.trait_type} className="border rounded p-2 text-center">
          <p className="text-xs text-muted-foreground">{attr.trait_type}</p>
          <p className="font-semibold text-sm">{attr.value}</p>
          {attr.rarity && (
            <p className="text-xs text-muted-foreground">
              {attr.rarity}% have this
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Activity History

```tsx
// components/ActivityHistory.tsx
export function ActivityHistory({ nftId }: { nftId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    getActivityHistory(nftId).then(setActivities);
  }, [nftId]);

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-center gap-3 text-sm">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            {activity.type === "sale" && <DollarSign className="h-4 w-4" />}
            {activity.type === "list" && <Tag className="h-4 w-4" />}
            {activity.type === "bid" && <Gavel className="h-4 w-4" />}
            {activity.type === "transfer" && <ArrowRight className="h-4 w-4" />}
          </div>
          
          <div className="flex-1">
            <p className="font-medium">
              {activity.type === "sale" && "Sold"}
              {activity.type === "list" && "Listed"}
              {activity.type === "bid" && "Bid placed"}
              {activity.type === "transfer" && "Transferred"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(activity.timestamp)}
            </p>
          </div>

          {activity.price && (
            <div className="text-right">
              <p className="font-semibold">{activity.price} SOL</p>
              <p className="text-xs text-muted-foreground">
                ${formatUSD(activity.price * SOL_PRICE)}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Listing UX

### List NFT Dialog

```tsx
// components/ListNFTDialog.tsx
export function ListNFTDialog({ nft }: { nft: NFT }) {
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("7d");
  const [isListing, setIsListing] = useState(false);

  const handleList = async () => {
    setIsListing(true);
    try {
      const signature = await listNFT({
        nftMint: new PublicKey(nft.mint),
        price: parseFloat(price),
        duration: parseDuration(duration),
      });
      toast.success("NFT listed", {
        description: `Your NFT is now listed for ${price} SOL`,
      });
    } catch (error) {
      toast.error("Listing failed", {
        description: parseTransactionError(error),
      });
    } finally {
      setIsListing(false);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>List NFT for sale</DialogTitle>
          <DialogDescription>
            Set a price and duration to list {nft.name} on the marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <img src={nft.image} alt={nft.name} className="w-16 h-16 rounded object-cover" />
            <div>
              <p className="font-semibold">{nft.name}</p>
              <p className="text-sm text-muted-foreground">{nft.collection}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price (SOL)</Label>
            <Input
              id="price"
              type="number"
              step="0.001"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {price && (
              <p className="text-xs text-muted-foreground">
                ≈ ${formatUSD(parseFloat(price) * SOL_PRICE)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Listing duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">1 day</SelectItem>
                <SelectItem value="3d">3 days</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Listing fees</AlertTitle>
            <AlertDescription>
              A small marketplace fee will be deducted from the final sale price.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleList}
            disabled={!price || isListing}
          >
            {isListing ? "Listing..." : "List NFT"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Buying UX

### Buy Confirmation

```tsx
// components/BuyDialog.tsx
export function BuyDialog({ nft }: { nft: NFT }) {
  const { publicKey } = useWallet();
  const [isBuying, setIsBuying] = useState(false);

  const handleBuy = async () => {
    setIsBuying(true);
    try {
      const signature = await buyNFT({
        nftMint: new PublicKey(nft.mint),
        price: nft.price!,
        seller: new PublicKey(nft.seller),
      });
      toast.success("Purchase successful", {
        description: `You now own ${nft.name}`,
      });
    } catch (error) {
      toast.error("Purchase failed", {
        description: parseTransactionError(error),
      });
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm purchase</DialogTitle>
          <DialogDescription>
            You are about to buy {nft.name} for {nft.price} SOL
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <img src={nft.image} alt={nft.name} className="w-16 h-16 rounded object-cover" />
            <div>
              <p className="font-semibold">{nft.name}</p>
              <p className="text-sm text-muted-foreground">{nft.collection}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price</span>
              <span>{nft.price} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Marketplace fee</span>
              <span>{(nft.price * 0.02).toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Estimated network fee</span>
              <span>~0.00001 SOL</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{(nft.price * 1.02 + 0.00001).toFixed(6)} SOL</span>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Irreversible transaction</AlertTitle>
            <AlertDescription>
              Once confirmed, this purchase cannot be undone. Make sure you want to buy this NFT.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleBuy}
            disabled={isBuying}
          >
            {isBuying ? "Processing..." : "Confirm purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## Bidding UX

### Place Bid Dialog

```tsx
// components/PlaceBidDialog.tsx
export function PlaceBidDialog({ nft, currentBid }: { nft: NFT; currentBid?: number }) {
  const [bidAmount, setBidAmount] = useState(currentBid ? (currentBid * 1.05).toFixed(4) : "");
  const [isBidding, setIsBidding] = useState(false);

  const handleBid = async () => {
    setIsBidding(true);
    try {
      const signature = await placeBid({
        nftMint: new PublicKey(nft.mint),
        amount: parseFloat(bidAmount),
      });
      toast.success("Bid placed", {
        description: `Your bid of ${bidAmount} SOL has been placed`,
      });
    } catch (error) {
      toast.error("Bid failed", {
        description: parseTransactionError(error),
      });
    } finally {
      setIsBidding(false);
    }
  };

  const minBid = currentBid ? currentBid * 1.05 : 0.001;

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Place a bid</DialogTitle>
          <DialogDescription>
            Make an offer on {nft.name}. The seller can accept your bid at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <img src={nft.image} alt={nft.name} className="w-16 h-16 rounded object-cover" />
            <div>
              <p className="font-semibold">{nft.name}</p>
              <p className="text-sm text-muted-foreground">
                {currentBid ? `Current bid: ${currentBid} SOL` : "No bids yet"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bid">Your bid (SOL)</Label>
            <Input
              id="bid"
              type="number"
              step="0.001"
              min={minBid}
              placeholder={`Minimum: ${minBid.toFixed(4)} SOL`}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
            {bidAmount && (
              <p className="text-xs text-muted-foreground">
                ≈ ${formatUSD(parseFloat(bidAmount) * SOL_PRICE)}
              </p>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Bid requirements</AlertTitle>
            <AlertDescription>
              Your bid must be at least 5% higher than the current bid. 
              Your SOL will be escrowed until the seller accepts or the bid expires.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleBid}
            disabled={!bidAmount || parseFloat(bidAmount) < minBid || isBidding}
          >
            {isBidding ? "Placing bid..." : "Place bid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Bid Management

```tsx
// components/BidManager.tsx
export function BidManager({ nftId }: { nftId: string }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const { publicKey } = useWallet();

  useEffect(() => {
    getBids(nftId).then(setBids);
  }, [nftId]);

  const userBids = bids.filter(b => b.bidder === publicKey?.toBase58());

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Your bids</h3>
      
      {userBids.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't placed any bids on this NFT.</p>
      ) : (
        <div className="space-y-2">
          {userBids.map((bid) => (
            <div key={bid.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-semibold">{bid.amount} SOL</p>
                <p className="text-xs text-muted-foreground">
                  Placed {formatDate(bid.timestamp)}
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => cancelBid(bid.id)}
              >
                Cancel
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Collection Page

### Collection Header

```tsx
// components/CollectionHeader.tsx
export function CollectionHeader({ collection }: { collection: Collection }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <img 
          src={collection.image} 
          alt={collection.name}
          className="w-32 h-32 rounded-lg object-cover"
        />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{collection.name}</h1>
            <VerifiedBadge />
          </div>
          <p className="text-muted-foreground">{collection.description}</p>
          
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-semibold">{collection.floorPrice}</span>
              <span className="text-muted-foreground"> floor</span>
            </div>
            <div>
              <span className="font-semibold">{collection.totalVolume}</span>
              <span className="text-muted-foreground"> total volume</span>
            </div>
            <div>
              <span className="font-semibold">{collection.owners}</span>
              <span className="text-muted-foreground"> owners</span>
            </div>
            <div>
              <span className="font-semibold">{collection.items}</span>
              <span className="text-muted-foreground"> items</span>
            </div>
          </div>
        </div>
      </div>

      {/* Collection actions */}
      <div className="flex gap-2">
        <Button variant="outline">
          <Heart className="h-4 w-4 mr-2" />
          Favorite
        </Button>
        <Button variant="outline">
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </div>
    </div>
  );
}
```

### Collection Filters

```tsx
// components/CollectionFilters.tsx
export function CollectionFilters() {
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100]);
  const [sortBy, setSortBy] = useState("recently_listed");
  const [traits, setTraits] = useState<Record<string, string[]>>({});

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Price range (SOL)</Label>
        <Slider
          value={priceRange}
          onValueChange={setPriceRange}
          min={0}
          max={100}
          step={0.1}
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{priceRange[0]} SOL</span>
          <span>{priceRange[1]} SOL</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Sort by</Label>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recently_listed">Recently listed</SelectItem>
            <SelectItem value="price_low">Price: Low to high</SelectItem>
            <SelectItem value="price_high">Price: High to low</SelectItem>
            <SelectItem value="rarity">Rarity</SelectItem>
            <SelectItem value="recently_sold">Recently sold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Trait filters */}
      <div className="space-y-2">
        <Label>Traits</Label>
        <TraitSelector traits={traits} onChange={setTraits} />
      </div>
    </div>
  );
}
```

## Portfolio/Inventory View

### Inventory Grid

```tsx
// components/InventoryGrid.tsx
export function InventoryGrid() {
  const { publicKey } = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) return;
    getWalletNFTs(publicKey).then((data) => {
      setNfts(data);
      setLoading(false);
    });
  }, [publicKey]);

  if (loading) return <InventorySkeleton />;
  if (nfts.length === 0) return <EmptyInventory />;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {nfts.map((nft) => (
        <NFTCard key={nft.id} nft={nft} />
      ))}
    </div>
  );
}
```

### NFT Actions Menu

```tsx
// components/NFTActionsMenu.tsx
export function NFTActionsMenu({ nft }: { nft: NFT }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => listNFT(nft)}>
          List for sale
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => transferNFT(nft)}>
          Transfer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => burnNFT(nft)}>
          Burn
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => viewOnExplorer(nft)}>
          View on explorer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## NFT Blinks

### Share NFT Action

```typescript
// app/api/actions/share-nft/route.ts
import {
  ActionGetResponse,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import { PublicKey, Transaction } from "@solana/web3.js";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nftMint = searchParams.get("mint");

  if (!nftMint) {
    return Response.json(
      { message: "NFT mint address required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const nft = await getNFTByMint(nftMint);

  const payload: ActionGetResponse = {
    icon: nft.image,
    title: nft.name,
    description: `${nft.collection} - ${nft.description?.slice(0, 100)}...`,
    label: nft.listed ? `Buy for ${nft.price} SOL` : "View NFT",
    links: {
      actions: nft.listed
        ? [
            {
              label: "Buy now",
              href: `/api/actions/buy-nft?mint=${nftMint}`,
            },
          ]
        : [
            {
              label: "View on marketplace",
              href: `https://marketplace.com/nft/${nftMint}`,
            },
          ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  const body: ActionPostRequest = await req.json();
  const { searchParams } = new URL(req.url);
  const nftMint = searchParams.get("mint");

  if (!nftMint) {
    return Response.json(
      { message: "NFT mint address required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const nft = await getNFTByMint(nftMint);
  const buyer = new PublicKey(body.account);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: buyer,
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  });

  const buyInstruction = createBuyInstruction({
    nftMint: new PublicKey(nftMint),
    buyer,
    seller: new PublicKey(nft.seller),
    price: nft.price!,
  });

  tx.add(buyInstruction);

  const payload: ActionPostResponse = await createPostResponse({
    fields: {
      transaction: tx,
      message: `Buying ${nft.name} for ${nft.price} SOL`,
    },
  });

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```

## NFT Error Handling

### Common NFT Errors

```typescript
const NFT_ERROR_COPY = {
  NFTNotListed: {
    title: "NFT not listed",
    body: "This NFT is not currently listed for sale.",
    retryable: false,
  },
  NFTAlreadySold: {
    title: "NFT already sold",
    body: "This NFT was purchased by another user.",
    retryable: false,
  },
  InsufficientFunds: {
    title: "Insufficient funds",
    body: "Your wallet doesn't have enough SOL for this purchase.",
    retryable: false,
  },
  BidTooLow: {
    title: "Bid too low",
    body: "Your bid must be at least 5% higher than the current bid.",
    retryable: false,
  },
  NotOwner: {
    title: "Not the owner",
    body: "You don't own this NFT and cannot perform this action.",
    retryable: false,
  },
  ListingExpired: {
    title: "Listing expired",
    body: "This listing has expired and is no longer available.",
    retryable: false,
  },
};

export function parseNFTError(error: unknown): ParsedTransactionError {
  const message = String((error as { message?: unknown })?.message ?? error);

  for (const [key, value] of Object.entries(NFT_ERROR_COPY)) {
    if (message.includes(key)) {
      return {
        code: key,
        title: value.title,
        body: value.body,
        retryable: value.retryable,
        fundsMoved: "no",
      };
    }
  }

  return parseTransactionError(error);
}
```

## NFT Marketplace Best Practices

### Image Optimization

```typescript
// lib/imageOptimizer.ts
export function getOptimizedImageUrl(
  originalUrl: string,
  width: number = 400,
  format: "webp" | "jpg" | "png" = "webp"
): string {
  // Use CDN with image optimization
  const cdnUrl = new URL(originalUrl);
  cdnUrl.searchParams.set("w", width.toString());
  cdnUrl.searchParams.set("f", format);
  cdnUrl.searchParams.set("q", "80"); // Quality
  
  return cdnUrl.toString();
}

// Usage in components:
<img 
  src={getOptimizedImageUrl(nft.image, 400)} 
  alt={nft.name}
  loading="lazy"
/>
```

### Lazy Loading NFT Images

```tsx
// components/LazyNFTImage.tsx
export function LazyNFTImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="aspect-square bg-muted">
      {!loaded && !error && (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      
      {error ? (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.2s" }}
        />
      )}
    </div>
  );
}
```

### Price Formatting

```typescript
// lib/priceFormatter.ts
export function formatSOLPrice(price: number): string {
  if (price < 0.001) return `${(price * 1000).toFixed(2)} mSOL`;
  if (price < 1) return price.toFixed(4);
  if (price < 100) return price.toFixed(2);
  return price.toFixed(1);
}

export function formatUSDPrice(solPrice: number, solToUSD: number): string {
  const usd = solPrice * solToUSD;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 1000) return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString()}`;
}
```

## Mobile-First NFT Marketplace

### Mobile NFT Card

```tsx
// components/MobileNFTCard.tsx
export function MobileNFTCard({ nft }: { nft: NFT }) {
  return (
    <div className="flex gap-3 p-3 border rounded-lg">
      <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden">
        <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" />
      </div>
      
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-sm truncate">{nft.name}</h3>
        <p className="text-xs text-muted-foreground">{nft.collection}</p>
        
        {nft.listed && nft.price ? (
          <div className="mt-2">
            <p className="font-semibold text-sm">{formatSOLPrice(nft.price)} SOL</p>
            <Button size="sm" className="mt-1 w-full">
              Buy
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

## Update SKILL.md routing table

This file covers: `nft-marketplace-ux.md`

Load when:
- Building or auditing NFT marketplace interfaces
- Designing listing/buying/bidding flows
- Implementing collection pages and filters
- Creating portfolio/inventory views
- Building NFT Blinks/Actions
- Debugging low marketplace conversion
