# Transaction Flow Diagram

```mermaid
flowchart TD
    A[User initiates action] --> B{Has wallet?}
    B -->|No| C[Show connect wallet]
    B -->|Yes| D{Has SOL?}
    C --> E[Wallet connected]
    E --> D
    D -->|No| F[Show gasless option]
    D -->|Yes| G[Build transaction]
    F --> G
    G --> H[Simulate transaction]
    H --> I{Simulation successful?}
    I -->|No| J[Show error with fix]
    J --> G
    I -->|Yes| K[Show transaction preview]
    K --> L{User confirms?}
    L -->|No| M[Cancel]
    L -->|Yes| N[Sign transaction]
    N --> O[Submit to network]
    O --> P{Transaction confirmed?}
    P -->|No| Q[Show error with retry]
    Q --> N
    P -->|Yes| R[Show success state]
    R --> S[Suggest next action]
```

## Flow Descriptions

### Wallet Connection
- Check if user has wallet installed
- If no, show connect wallet prompt
- If yes, check SOL balance

### Gasless Path
- If user has no SOL, offer gasless sponsorship
- Validate user is within rate limit
- Build transaction with fee payer proxy

### Transaction Simulation
- Simulate transaction before signing
- Show preview of what will change
- Display any errors before user signs

### Signing and Confirmation
- User signs transaction with wallet
- Submit to network with priority fee
- Monitor confirmation status
- Show success or error with retry option

### Success State
- Display what changed (balance, NFT, position)
- Provide link to transaction on explorer
- Suggest natural next action
