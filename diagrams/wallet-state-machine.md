# Wallet State Machine Diagram

```mermaid
stateDiagram-v2
    [*] --> undetected: Wallet not installed
    undetected --> no-wallet: Wallet installed
    no-wallet --> disconnected: User has wallet
    disconnected --> connecting: User clicks connect
    connecting --> connected: Connection successful
    connecting --> disconnected: Connection failed
    connected --> wrong-network: Network mismatch
    connected --> session-expired: Session timeout
    connected --> disconnecting: User clicks disconnect
    wrong-network --> connected: Network switched
    session-expired --> connected: Silent reconnect
    disconnecting --> disconnected: Disconnect complete
    disconnecting --> [*]: App closed
```

## State Descriptions

| State | Description | UX Pattern |
|-------|-------------|------------|
| `undetected` | No wallet extension detected | Install wallet prompt |
| `no-wallet` | Wallet installed but not connected | Connect button |
| `disconnected` | Wallet available but not connected | Connect button |
| `connecting` | Connection in progress | Loading spinner |
| `connected` | Wallet connected on correct network | Show address, balance |
| `wrong-network` | Connected but on wrong network | Network switcher banner |
| `session-expired` | Auth token expired | Silent reconnect prompt |
| `disconnecting` | Disconnect in progress | Loading state |

## Transition Triggers

- **undetected → no-wallet**: User installs wallet extension
- **no-wallet → disconnected**: User has wallet but hasn't connected
- **disconnected → connecting**: User clicks "Connect Wallet" button
- **connecting → connected**: Wallet adapter successfully connects
- **connecting → disconnected**: Connection fails (user declined, timeout)
- **connected → wrong-network**: Wallet connected to wrong cluster (testnet vs mainnet)
- **connected → session-expired**: Auth token expires (MWA) or session timeout
- **connected → disconnecting**: User clicks "Disconnect" button
- **wrong-network → connected**: User switches to correct network
- **session-expired → connected**: Silent reconnect succeeds (MWA auth_token persistence)
- **disconnecting → disconnected**: Disconnect completes successfully
