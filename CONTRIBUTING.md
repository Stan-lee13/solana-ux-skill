# Contributing to Solana UX Skill

Thank you for your interest in contributing to the Solana UX Skill! This skill is part of the Solana AI Kit and focuses on production-ready UX patterns for Solana dApps.

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/Stan-lee13/solana-ux-skill.git
cd solana-ux-skill
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test
```

## What We're Looking For

We welcome contributions that:

- **Add new UX patterns** for Solana dApps (wallet states, error handling, mobile UX, etc.)
- **Improve existing patterns** with better code examples or edge case coverage
- **Add test coverage** for existing patterns
- **Fix bugs** in code examples or documentation
- **Improve documentation** clarity and completeness

## Contribution Guidelines

### Adding New Patterns

1. Create a new sub-skill file in `skill/` directory
2. Follow the existing structure:
   - Clear problem statement
   - Production TypeScript code examples
   - Edge cases and error handling
   - Real Solana-specific context (not generic web patterns)
3. Update `skill/SKILL.md` routing table
4. Add corresponding tests in `tests/`
5. Add diagram in `diagrams/` if applicable

### Adding Tests

- Use Vitest for unit tests
- Test state transitions, edge cases, and error conditions
- Follow existing test patterns in `tests/` directory
- Ensure tests are independent and fast

### Documentation Style

- Code-first, minimal prose
- Surface tradeoffs and edge cases
- Use Solana-specific terminology (not generic)
- Include real code, not scaffolds
- Reference relevant Solana programs or SDKs

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit with clear message
6. Push to your fork
7. Submit a pull request

## Code Review Criteria

- **Solana-specific**: Is this pattern genuinely Solana-specific or generic web UX?
- **Production-ready**: Does the code work in production, not just in theory?
- **Complete**: Are edge cases covered? Error handling included?
- **Tested**: Are there tests for the new pattern?
- **Documented**: Is the documentation clear and actionable?

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
