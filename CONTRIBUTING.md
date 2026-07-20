# Contributing to The Linear Algebra Calculator 2.0

Thank you for helping make linear algebra more approachable.

## Before proposing a change

- Keep the audience at high-school to early undergraduate level.
- Prefer a clear mathematical explanation over unexplained output.
- Preserve exact arithmetic in the calculator unless a view is explicitly numerical.
- Do not add analytics, accounts, or remote persistence without prior discussion.
- New visual learning tabs require product approval before implementation.

## Development workflow

1. Create a focused branch.
2. Make the smallest complete change that solves the issue.
3. Add or update tests for mathematical and interaction behaviour.
4. Run `npm test`.
5. Describe the learner-facing effect and verification in the pull request.

## Accessibility

All interactive features need a keyboard path, visible focus, concise labels, and a non-colour cue. Honour `prefers-reduced-motion` for movement that is not essential.

## Mathematical changes

Include representative examples, edge cases, and invalid inputs. If a numerical method is approximate, label it clearly and test an appropriate tolerance.
