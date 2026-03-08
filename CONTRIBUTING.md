# Contributing to Council OS

Welcome! We're glad you're interested in contributing to Council OS. Whether it's a bug fix, new feature, documentation improvement, or feedback — every contribution matters.

## How to Contribute

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` for your changes:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Make your changes** following the guidelines below.
4. **Submit a pull request** back to the `main` branch.

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+ and pip (for the Python SDK)
- **Git**

### Getting Started

```bash
# Clone your fork
git clone https://github.com/<your-username>/council-sdk.git
cd council-sdk

# TypeScript SDK
cd typescript
npm install
npm run build
npm test

# Python SDK
cd ../python/council-sdk
pip install -e ".[dev]"
pytest
```

## Code Style

### TypeScript

- **ESLint** for linting, **Prettier** for formatting.
- Run `npm run lint` before committing.
- Run `npm run format` to auto-format.

### Python

- **ruff** for linting and formatting, **mypy** for type checking.
- Run `ruff check .` and `mypy .` before committing.

## Testing

All tests must pass before submitting a pull request.

```bash
# TypeScript
npm test

# Python
pytest
```

If you add a new feature, please include corresponding tests.

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add containment status endpoint to Python SDK
fix: correct trust score calculation in TypeScript SDK
docs: update getting started guide
test: add integration tests for connector registry
chore: update dependencies
refactor: simplify governance routing logic
```

Use the imperative mood in the subject line ("add feature" not "added feature").

## Pull Request Process

1. **Fill out the PR template** completely.
2. **Link related issues** using `Fixes #123` or `Closes #123`.
3. **Ensure CI passes** — all tests, linting, and type checks must be green.
4. **Keep PRs focused** — one logical change per PR. Split large changes into smaller PRs.
5. **Update documentation** if your change affects public APIs or behavior.

A maintainer will review your PR and may request changes. Once approved, it will be merged.

## Reporting Bugs

Use the [Bug Report](https://github.com/council-os/council-sdk/issues/new?template=bug_report.md) issue template. Include as much detail as possible: SDK version, environment, steps to reproduce, and expected vs. actual behavior.

## Requesting Features

Use the [Feature Request](https://github.com/council-os/council-sdk/issues/new?template=feature_request.md) issue template. Describe your use case and the problem you're trying to solve.

## Security Vulnerabilities

**Do NOT open public issues for security vulnerabilities.** Please see [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Please report unacceptable behavior to hello@meetcouncil.com.

## Questions?

Reach out at **hello@meetcouncil.com** or open a [Discussion](https://github.com/council-os/council-sdk/discussions) on GitHub.

Thank you for contributing to Council OS!
