## Outcome

<!-- Describe the user-visible or maintainer-visible result. -->

## OpenSpec

<!-- Link the owning change, or explain why this is maintenance-only. -->

## Verification

- [ ] `npm run verify`
- [ ] `npm audit --audit-level=high`
- [ ] `npm run check:public`
- [ ] `PUBLICATION_MANIFEST.txt` matches every added, removed, or renamed public file.
- [ ] Dependency/build-tool changes include regenerated `dist/` outputs when their bytes change.
- [ ] I reviewed the diff for credentials, private provenance, and consumer changes.
- [ ] User-visible UX changes have explicit owner approval.

## Compatibility and security

<!-- State compatibility, filesystem, network, localization, and rollback impact. -->
