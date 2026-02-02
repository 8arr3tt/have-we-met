# Release Checklist

This document outlines the steps to release a new version of have-we-met to npm.

## Pre-Release Checklist

### Code Quality
- [ ] All tests passing locally (`npm test`)
- [ ] Linter passes (`npm run lint`)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Code formatted correctly (`npm run format:check`)
- [ ] Test coverage above 85% (`npm run test:coverage`)
- [ ] Build succeeds (`npm run build`)
- [ ] No TypeScript errors in build output

### Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md updated with release notes
- [ ] All documentation links verified (no broken links)
- [ ] API documentation matches current code
- [ ] Examples are runnable and tested
- [ ] Migration guide included (if breaking changes)

### Package Configuration
- [ ] package.json version number updated
- [ ] package.json metadata complete (description, keywords, author, repository, license)
- [ ] package.json exports, main, module, types fields correct
- [ ] .npmignore configured to exclude test files, docs source, benchmark data
- [ ] LICENSE file present
- [ ] SECURITY.md present

### Security
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] All dependencies necessary and up to date
- [ ] No secrets or credentials in codebase
- [ ] Code reviewed for security issues

### Git
- [ ] All changes committed
- [ ] Working directory clean (`git status`)
- [ ] On correct branch (usually `main` or `master`)
- [ ] Pushed to remote

## Release Steps

### 1. Verify CI Passes
```bash
# Ensure all CI checks pass on GitHub
# Visit: https://github.com/8arr3tt/have-we-met/actions
```

### 2. Update Version
```bash
# Update version in package.json
# For initial release: 0.1.0
# For patches: 0.1.1, 0.1.2, etc.
# For minor: 0.2.0, 0.3.0, etc.
# For major: 1.0.0, 2.0.0, etc.
npm version <major|minor|patch> --no-git-tag-version
```

### 3. Update CHANGELOG.md
```markdown
## [0.1.0] - YYYY-MM-DD

### Added
- Initial release
- Deterministic, probabilistic, and ML-based matching
- String similarity algorithms (Levenshtein, Jaro-Winkler, Soundex, Metaphone)
- Data normalizers (name, email, phone, address, date)
- Blocking strategies (standard, sorted neighbourhood)
- Database adapters (Prisma, Drizzle, TypeORM)
- Human review queue with metrics
- Golden record management with provenance tracking
- External service integration (validation, lookup)
- Pre-trained ML model for person/customer matching
- Comprehensive benchmarks and documentation

### Known Limitations
- Address parsing supports US/Canada only
- Phonetic algorithms (Soundex, Metaphone) are English-only
- ML models focused on person/customer matching
```

### 4. Commit Version Bump
```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.1.0"
git push origin main
```

### 5. Run Local Pre-Publish Checks
```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build

# Run full test suite
npm test

# Create tarball and inspect contents
npm pack
tar -tzf have-we-met-0.1.0.tgz

# Test local installation
mkdir ../test-install
cd ../test-install
npm init -y
npm install ../have-we-met/have-we-met-0.1.0.tgz

# Test ESM import
node --input-type=module -e "import hwm from 'have-we-met'; console.log('ESM import success');"

# Test CJS require
node -e "const hwm = require('have-we-met'); console.log('CJS import success');"

cd ../have-we-met
rm -rf ../test-install
```

### 6. Trigger GitHub Actions Publish Workflow
```bash
# Go to GitHub Actions
# Navigate to: https://github.com/8arr3tt/have-we-met/actions/workflows/publish.yml
# Click "Run workflow"
# Enter version: 0.1.0
# Select tag: latest (or beta/alpha for pre-releases)
# Click "Run workflow"
```

The GitHub Actions workflow will:
1. Verify version matches input
2. Run tests
3. Build package
4. Create tarball and test installation
5. Publish to npm with provenance
6. Create git tag
7. Create GitHub release
8. Upload tarball to release

### 7. Verify Publication

#### npm Registry
```bash
# Wait 1-2 minutes for npm propagation
npm view have-we-met

# Test installation from registry
mkdir ../test-npm-install
cd ../test-npm-install
npm init -y
npm install have-we-met

# Test imports
node --input-type=module -e "import hwm from 'have-we-met'; console.log('ESM import success');"
node -e "const hwm = require('have-we-met'); console.log('CJS import success');"

cd ../have-we-met
rm -rf ../test-npm-install
```

#### GitHub Release
- [ ] Visit: https://github.com/8arr3tt/have-we-met/releases
- [ ] Verify release created with correct tag
- [ ] Verify release notes present
- [ ] Verify tarball attached to release

#### Package Page
- [ ] Visit: https://www.npmjs.com/package/have-we-met
- [ ] Verify version visible
- [ ] Verify description and keywords present
- [ ] Verify README renders correctly

### 8. Update Repository
```bash
# Update repository description and topics on GitHub
# Topics: identity-resolution, deduplication, record-linkage,
#         data-matching, fuzzy-matching, nodejs, typescript
```

### 9. Post-Release Smoke Tests
```bash
# Test basic functionality
npm install -g have-we-met
node -e "
const { HaveWeMet } = require('have-we-met');
const resolver = HaveWeMet
  .schema({ name: { type: 'string' }, email: { type: 'email' } })
  .matching(m => m.field('email').strategy('exact').weight(20))
  .build();
console.log('Basic matching works');
"
npm uninstall -g have-we-met
```

### 10. Announce Release (Optional)
- [ ] Tweet/post on social media
- [ ] Post to relevant communities (Reddit, Discord, forums)
- [ ] Update personal/company website
- [ ] Email interested users

## Post-Release

### Monitor Issues
- [ ] Watch GitHub issues for bug reports
- [ ] Respond to questions in discussions
- [ ] Monitor npm download stats

### Plan Next Release
- [ ] Create milestone for next version
- [ ] Prioritize bug fixes and feature requests
- [ ] Update project roadmap

## Rollback (If Needed)

If a critical issue is discovered immediately after release:

### Option 1: Deprecate Version
```bash
npm deprecate have-we-met@0.1.0 "Critical bug, please upgrade to 0.1.1"
```

### Option 2: Unpublish (Only within 72 hours)
```bash
npm unpublish have-we-met@0.1.0
# WARNING: Only use within 72 hours of publish
# Unpublishing is discouraged and may not be possible for popular packages
```

### Option 3: Publish Patch
```bash
# Fix the issue
# Bump version to 0.1.1
# Follow release steps again
npm version patch
# ... repeat release steps
```

## Version Strategy

### 0.x.x (Pre-1.0)
- Use for initial releases while API stabilizes
- Breaking changes allowed in minor versions
- Gather user feedback before 1.0.0

### 1.x.x (Stable)
- API stable and backward compatible
- Breaking changes require major version bump
- Follow semantic versioning strictly

### Version Bump Guidelines
- **Patch (0.1.x)**: Bug fixes, documentation updates, no API changes
- **Minor (0.x.0)**: New features, backward compatible, no breaking changes
- **Major (x.0.0)**: Breaking changes, API redesign, major features

## Troubleshooting

### "npm publish" fails with 403
- Verify npm account has publish access
- Check NPM_TOKEN secret is set in GitHub
- Ensure package name is available (not taken)
- Consider using scoped package (@yourorg/have-we-met)

### Tests fail in CI but pass locally
- Check Node.js version match (CI uses 18, 20, 22)
- Verify dependencies installed (`npm ci` not `npm install`)
- Check OS-specific issues (Windows vs Linux path separators)
- Review CI logs for specific error messages

### Build outputs missing
- Verify tsup.config.ts is correct
- Check dist/ is not in .gitignore (should be in .npmignore only)
- Run `npm run build` locally and inspect dist/

### Tarball includes unwanted files
- Review .npmignore
- Run `npm pack` and inspect with `tar -tzf`
- Ensure test files, benchmark data, docs source excluded

## Notes

- **Never force push** after tagging a release
- **Never delete published versions** (use deprecate instead)
- **Keep CHANGELOG.md updated** for every release
- **Test installation** from tarball before publishing
- **Verify CI passes** before triggering publish workflow
- **Communicate breaking changes** clearly in release notes
