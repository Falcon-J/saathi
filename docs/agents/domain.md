# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root, if it exists.
- `docs/adr/` for architectural decisions related to the area being changed.

If these files do not exist, proceed without treating their absence as a problem. The domain-modeling workflow creates them lazily when terms or decisions are resolved.

## File structure

This is a single-context repository:

```
/
├── CONTEXT.md
└── docs/
    └── adr/
```

## Use the glossary vocabulary

When naming a domain concept in an issue, refactor proposal, or test, use the term defined in `CONTEXT.md`. If a needed concept is not defined, resolve the terminology through the domain-modeling workflow before introducing it.

## Flag ADR conflicts

If a proposed change contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it.
