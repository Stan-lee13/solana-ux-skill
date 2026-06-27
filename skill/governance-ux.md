# Governance UX for Solana DAOs

Governance is the most complex UX layer in Solana. Users must understand proposals, voting power, delegation, timelocks, and execution — all while managing risk and understanding the impact of their decisions.

This sub-skill covers how to design, implement, and verify governance UX that drives participation without overwhelming users.

Use it when building:

- Proposal voting interfaces
- Proposal creation flows
- Token delegation systems
- Governance dashboard
- Realms or custom DAO implementations
- Multi-sig voting interfaces
- Governance Blinks/Actions

## Core Principle

Governance UX must balance two opposing forces:

1. **Simplicity** — Make it easy for casual holders to participate
2. **Transparency** — Show enough detail for power users to make informed decisions

Good Solana governance UX uses progressive disclosure: simple defaults with optional depth.

## The Governance State Machine

Governance has more states than typical transactions:

```typescript
export type GovernanceState =
  | "idle"
  | "loading-proposals"
  | "proposals-loaded"
  | "voting"
  | "vote-cast"
  | "vote-confirming"
  | "vote-confirmed"
  | "creating-proposal"
  | "proposal-created"
  | "executing"
  | "executed"
  | "relaying"
  | "relayed"
  | "finalized"
  | "failed"
  | "expired";
```

## Proposal Display Patterns

### Proposal Card Component

```tsx
// components/ProposalCard.tsx
interface ProposalCardProps {
  proposal: {
    id: string;
    title: string;
    description: string;
    state: "draft" | "voting" | "executing" | "completed" | "defeated";
    forVotes: number;
    againstVotes: number;
    totalVotes: number;
    endsAt: Date;
    hasVoted: boolean;
    userVote?: "for" | "against";
    canExecute: boolean;
  };
}

export function ProposalCard({ proposal }: ProposalCardProps) {
  const forPercentage = (proposal.forVotes / proposal.totalVotes) * 100;
  const againstPercentage = (proposal.againstVotes / proposal.totalVotes) * 100;
  const timeRemaining = getTimeRemaining(proposal.endsAt);

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">{proposal.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {proposal.description}
          </p>
        </div>
        <ProposalStateBadge state={proposal.state} />
      </div>

      {/* Vote progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-green-600">For {forPercentage.toFixed(1)}%</span>
          <span className="text-red-600">Against {againstPercentage.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden flex">
          <div 
            className="bg-green-500" 
            style={{ width: `${forPercentage}%` }}
          />
          <div 
            className="bg-red-500" 
            style={{ width: `${againstPercentage}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{proposal.forVotes.toLocaleString()} votes</span>
          <span>{proposal.againstVotes.toLocaleString()} votes</span>
        </div>
      </div>

      {/* Time remaining */}
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-4 w-4" />
        <span className="text-muted-foreground">
          {timeRemaining.days > 0 && `${timeRemaining.days}d `}
          {timeRemaining.hours}h remaining
        </span>
      </div>

      {/* User action */}
      {proposal.hasVoted ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-muted-foreground">
            You voted {proposal.userVote}
          </span>
        </div>
      ) : proposal.state === "voting" ? (
        <div className="flex gap-2">
          <VoteButton proposalId={proposal.id} vote="for" />
          <VoteButton proposalId={proposal.id} vote="against" />
        </div>
      ) : proposal.canExecute ? (
        <ExecuteButton proposalId={proposal.id} />
      ) : null}
    </div>
  );
}
```

### Proposal State Badge

```tsx
// components/ProposalStateBadge.tsx
const STATE_CONFIG = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-700" },
  voting: { label: "Voting", color: "bg-blue-100 text-blue-700" },
  executing: { label: "Executing", color: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Passed", color: "bg-green-100 text-green-700" },
  defeated: { label: "Defeated", color: "bg-red-100 text-red-700" },
};

export function ProposalStateBadge({ state }: { state: keyof typeof STATE_CONFIG }) {
  const config = STATE_CONFIG[state];
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}
```

## Voting UX Patterns

### Vote Confirmation Dialog

```tsx
// components/VoteDialog.tsx
export function VoteDialog({ 
  proposal, 
  vote, 
  onConfirm 
}: { 
  proposal: Proposal;
  vote: "for" | "against";
  onConfirm: () => void;
}) {
  const { publicKey } = useWallet();
  const [votingPower, setVotingPower] = useState<bigint>(0n);

  useEffect(() => {
    if (!publicKey) return;
    // Fetch user's voting power
    getVotingPower(publicKey, proposal.governance).then(setVotingPower);
  }, [publicKey, proposal.governance]);

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm your vote</DialogTitle>
          <DialogDescription>
            You are voting {vote} on "{proposal.title}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Your voting power</span>
            <span className="font-semibold">{formatNumber(votingPower)} votes</span>
          </div>

          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Your vote</span>
            <span className={`font-semibold ${vote === "for" ? "text-green-600" : "text-red-600"}`}>
              {vote.toUpperCase()}
            </span>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Vote is final</AlertTitle>
            <AlertDescription>
              Once cast, your vote cannot be changed. Make sure you've read the proposal carefully.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onConfirm(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(true)}>
            Confirm vote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Vote Transaction Hook

```typescript
// hooks/useVote.ts
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";

export function useVote() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const castVote = async (
    proposal: PublicKey,
    vote: "for" | "against"
  ): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error("Wallet not connected");
    }

    // Build vote transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: publicKey,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
    });

    // Add vote instruction (implementation depends on governance program)
    const voteInstruction = createVoteInstruction({
      proposal,
      voter: publicKey,
      vote: vote === "for" ? 1 : 0,
    });

    tx.add(voteInstruction);

    // Sign and send
    const signed = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    return signature;
  };

  return { castVote };
}
```

## Delegation UX

### Delegation Flow

```tsx
// components/DelegateDialog.tsx
export function DelegateDialog() {
  const { publicKey } = useWallet();
  const [delegatee, setDelegatee] = useState("");
  const [isDelegating, setIsDelegating] = useState(false);

  const handleDelegate = async () => {
    if (!publicKey || !delegatee) return;

    setIsDelegating(true);
    try {
      const signature = await delegateVotingPower(publicKey, new PublicKey(delegatee));
      toast.success("Delegation successful", {
        description: `Your voting power is now delegated to ${delegatee.slice(0, 8)}...`,
      });
    } catch (error) {
      toast.error("Delegation failed", {
        description: parseTransactionError(error),
      });
    } finally {
      setIsDelegating(false);
    }
  };

  return (
    <Dialog>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delegate your voting power</DialogTitle>
          <DialogDescription>
            Transfer your voting rights to another address without transferring ownership.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="delegatee">Delegate to address</Label>
            <Input
              id="delegatee"
              placeholder="Enter Solana address"
              value={delegatee}
              onChange={(e) => setDelegatee(e.target.value)}
            />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>What is delegation?</AlertTitle>
            <AlertDescription>
              Delegation lets you assign your voting power to a trusted representative.
              You retain ownership of your tokens, but they vote according to your delegate's choices.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleDelegate}
            disabled={!delegatee || isDelegating}
          >
            {isDelegating ? "Delegating..." : "Delegate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### Revoke Delegation

```typescript
// hooks/useRevokeDelegation.ts
export function useRevokeDelegation() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const revoke = async (): Promise<string> => {
    if (!publicKey || !signTransaction) {
      throw new Error("Wallet not connected");
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: publicKey,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
    });

    // Add revoke instruction
    const revokeInstruction = createRevokeInstruction({
      owner: publicKey,
    });

    tx.add(revokeInstruction);

    const signed = await signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize());

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    return signature;
  };

  return { revoke };
}
```

## Proposal Creation UX

### Proposal Form

```tsx
// components/CreateProposalForm.tsx
export function CreateProposalForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const signature = await createProposal({
        title,
        description,
        instructions: JSON.parse(instructions),
      });
      toast.success("Proposal created", {
        description: "Your proposal is now open for voting.",
      });
    } catch (error) {
      toast.error("Failed to create proposal", {
        description: parseTransactionError(error),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Proposal title</Label>
        <Input
          id="title"
          placeholder="Clear, concise title for your proposal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Explain what this proposal does and why it matters"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions (JSON)</Label>
        <Textarea
          id="instructions"
          placeholder='[{"programId": "...", "accounts": [...], "data": "..."}]'
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={8}
          required
        />
        <p className="text-xs text-muted-foreground">
          The on-chain instructions that will execute if this proposal passes.
        </p>
      </div>

      <Button type="submit" disabled={isCreating}>
        {isCreating ? "Creating proposal..." : "Create proposal"}
      </Button>
    </form>
  );
}
```

### Proposal Preview

```tsx
// components/ProposalPreview.tsx
export function ProposalPreview({ proposal }: { proposal: DraftProposal }) {
  return (
    <div className="border rounded-lg p-6 space-y-4 bg-muted/30">
      <h3 className="font-semibold">Preview</h3>
      
      <div className="space-y-2">
        <Label>Title</Label>
        <p className="text-sm">{proposal.title}</p>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <p className="text-sm whitespace-pre-wrap">{proposal.description}</p>
      </div>

      <div className="space-y-2">
        <Label>Instructions</Label>
        <pre className="text-xs bg-background p-3 rounded overflow-auto">
          {JSON.stringify(proposal.instructions, null, 2)}
        </pre>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Review carefully</AlertTitle>
        <AlertDescription>
          Once submitted, this proposal cannot be edited. Make sure all details are correct.
        </AlertDescription>
      </Alert>
    </div>
  );
}
```

## Governance Dashboard

### Voting Power Display

```tsx
// components/VotingPowerCard.tsx
export function VotingPowerCard() {
  const { publicKey } = useWallet();
  const [votingPower, setVotingPower] = useState<bigint>(0n);
  const [delegatee, setDelegatee] = useState<PublicKey | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    Promise.all([
      getVotingPower(publicKey),
      getDelegatee(publicKey),
    ]).then(([power, del]) => {
      setVotingPower(power);
      setDelegatee(del);
    });
  }, [publicKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your voting power</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold">
          {formatNumber(votingPower)} votes
        </div>

        {delegatee ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>Delegated to {delegatee.toBase58().slice(0, 8)}...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Self-delegated</span>
          </div>
        )}

        <div className="flex gap-2">
          {delegatee ? (
            <RevokeButton />
          ) : (
            <DelegateButton />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Active Proposals List

```tsx
// components/ActiveProposals.tsx
export function ActiveProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveProposals().then((data) => {
      setProposals(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <ProposalSkeleton />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Active proposals</h2>
      {proposals.length === 0 ? (
        <EmptyState
          title="No active proposals"
          description="There are no proposals currently open for voting."
        />
      ) : (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Governance Blinks

### Vote Action

```typescript
// app/api/actions/vote/route.ts
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import { PublicKey, Transaction } from "@solana/web3.js";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal");

  if (!proposalId) {
    return Response.json(
      { message: "Proposal ID required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const proposal = await getProposal(proposalId);

  const payload: ActionGetResponse = {
    icon: "https://yourdapp.com/governance-icon.png",
    title: `Vote on: ${proposal.title}`,
    description: `Vote ${proposal.forCount} for, ${proposal.againstCount} against. Ends at ${new Date(proposal.endsAt).toLocaleDateString()}.`,
    label: "Cast your vote",
    links: {
      actions: [
        {
          label: "Vote for",
          href: `/api/actions/vote?proposal=${proposalId}&vote=for`,
        },
        {
          label: "Vote against",
          href: `/api/actions/vote?proposal=${proposalId}&vote=against`,
        },
      ],
    },
  };

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function POST(req: Request) {
  const body: ActionPostRequest = await req.json();
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal");
  const vote = searchParams.get("vote");

  if (!proposalId || !vote) {
    return Response.json(
      { message: "Proposal ID and vote required" },
      { status: 400, headers: ACTIONS_CORS_HEADERS }
    );
  }

  const voter = new PublicKey(body.account);
  const proposal = new PublicKey(proposalId);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: voter,
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  });

  const voteInstruction = createVoteInstruction({
    proposal,
    voter,
    vote: vote === "for" ? 1 : 0,
  });

  tx.add(voteInstruction);

  const payload: ActionPostResponse = await createPostResponse({
    fields: {
      transaction: tx,
      message: `Voting ${vote} on proposal ${proposalId.slice(0, 8)}...`,
    },
  });

  return Response.json(payload, { headers: ACTIONS_CORS_HEADERS });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { headers: ACTIONS_CORS_HEADERS });
}
```

## Governance Error Handling

### Common Governance Errors

```typescript
const GOVERNANCE_ERROR_COPY = {
  AlreadyVoted: {
    title: "Already voted",
    body: "You have already cast a vote on this proposal. Votes cannot be changed.",
    retryable: false,
  },
  ProposalNotVoting: {
    title: "Proposal not voting",
    body: "This proposal is not currently open for voting.",
    retryable: false,
  },
  InsufficientVotingPower: {
    title: "No voting power",
    body: "You need governance tokens to vote on proposals.",
    retryable: false,
  },
  ProposalExpired: {
    title: "Proposal expired",
    body: "The voting period for this proposal has ended.",
    retryable: false,
  },
  NotProposer: {
    title: "Not authorized",
    body: "Only token holders with sufficient voting power can create proposals.",
    retryable: false,
  },
};

export function parseGovernanceError(error: unknown): ParsedTransactionError {
  const message = String((error as { message?: unknown })?.message ?? error);

  for (const [key, value] of Object.entries(GOVERNANCE_ERROR_COPY)) {
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

  return parseTransactionError(error); // Fallback to general parser
}
```

## Governance Analytics

### Track Participation

```typescript
// lib/governanceAnalytics.ts
export async function trackGovernanceEvent(event: {
  type: "view_proposal" | "vote_cast" | "proposal_created" | "delegation_changed";
  proposalId?: string;
  wallet?: string;
  vote?: "for" | "against";
}) {
  await fetch(process.env.ANALYTICS_WEBHOOK!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    }),
  }).catch(console.error);
}

// Usage in vote handler:
await trackGovernanceEvent({
  type: "vote_cast",
  proposalId: proposal.id,
  wallet: publicKey.toBase58(),
  vote: "for",
});
```

## Governance UX Best Practices

### Progressive Disclosure

Show simple summary first, details on demand:

```tsx
// components/ProposalDetails.tsx
export function ProposalDetails({ proposal }: { proposal: Proposal }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => setShowDetails(!showDetails)}
      >
        {showDetails ? "Hide details" : "Show details"}
      </Button>

      {showDetails && (
        <div className="mt-4 space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Full description</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {proposal.fullDescription}
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Execution instructions</h4>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto">
              {JSON.stringify(proposal.instructions, null, 2)}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Voting breakdown</h4>
            <VotingBreakdown proposal={proposal} />
          </div>
        </div>
      )}
    </div>
  );
}
```

### Mobile-First Governance

Ensure governance works on mobile:

```tsx
// components/MobileProposalCard.tsx
export function MobileProposalCard({ proposal }: { proposal: Proposal }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-base line-clamp-2">{proposal.title}</h3>
        <ProposalStateBadge state={proposal.state} />
      </div>

      {/* Compact vote bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
        <div 
          className="bg-green-500" 
          style={{ width: `${(proposal.forVotes / proposal.totalVotes) * 100}%` }}
        />
        <div 
          className="bg-red-500" 
          style={{ width: `${(proposal.againstVotes / proposal.totalVotes) * 100}%` }}
        />
      </div>

      {/* Touch-friendly vote buttons */}
      <div className="grid grid-cols-2 gap-2">
        <VoteButton proposalId={proposal.id} vote="for" size="lg" />
        <VoteButton proposalId={proposal.id} vote="against" size="lg" />
      </div>
    </div>
  );
}
```

## Governance Security Considerations

### Proposal Validation

```typescript
// lib/proposalValidation.ts
export function validateProposalInstructions(instructions: any[]): boolean {
  // Whitelist allowed programs
  const ALLOWED_PROGRAMS = [
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // System Program
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // SPL Token
    // Add your program IDs
  ];

  for (const ix of instructions) {
    if (!ALLOWED_PROGRAMS.includes(ix.programId)) {
      return false;
    }
  }

  return true;
}
```

### Timelock Awareness

```typescript
// components/TimelockWarning.tsx
export function TimelockWarning({ timelock }: { timelock: number }) {
  const hours = timelock / 3600;

  return (
    <Alert>
      <Clock className="h-4 w-4" />
      <AlertTitle>Timelock in effect</AlertTitle>
      <AlertDescription>
        This proposal has a {hours} hour timelock. Even after passing,
        execution will be delayed for security purposes.
      </AlertDescription>
    </Alert>
  );
}
```

## Update SKILL.md routing table

This file covers: `governance-ux.md`

Load when:
- Building or auditing governance interfaces
- Designing proposal voting flows
- Implementing delegation systems
- Creating governance dashboards
- Building governance Blinks/Actions
- Debugging low governance participation
