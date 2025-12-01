# Contributing

## Workflow (Trunk-Based)

- `main` is protected. No direct pushes.
- Use short-lived branches and open a Pull Request (PR).
- Merge only when checks pass.

## Branch naming

- `feat/<short-description>` new features
- `fix/<short-description>` bug fixes
- `chore/<short-description>` maintenance/config/refactors
- `docs/<short-description>` documentation

Examples: `feat/auth-jwt`, `chore/docker-compose`, `docs/repo-standards`

## Commit messages (Conventional Commits)

Format: `<type>: <summary>`
Types: `feat`, `fix`, `chore`, `docs`

Examples:

- `feat: add login endpoint`
- `fix: handle empty CSV upload`
- `chore: add alembic config`
- `docs: update local setup`

## PR checklist

- [ ] CI is green
- [ ] Clear description + steps to test
- [ ] No secrets committed
- [ ] Screenshots for UI changes (if applicable)
