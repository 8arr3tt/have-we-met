# npm Publish Guide for have-we-met v0.1.0

This guide walks through the manual steps to publish have-we-met to npm and create the GitHub release.

## Pre-Publication Checklist

✅ All tests passing (4329 tests)
✅ Build succeeds (ESM + CJS + TypeScript definitions)
✅ Version set to 0.1.0 in package.json
✅ Git tag v0.1.0 created
✅ CHANGELOG.md complete
✅ RELEASE-NOTES.md created
✅ README.md finalized
✅ All placeholders removed
✅ LICENSE file present (MIT)
✅ Security audit clean (0 high/critical vulnerabilities)

## Step 1: Final Verification

Before publishing, verify everything is ready:

```bash
# Ensure you're on the master branch with latest changes
git status
git log --oneline -5

# Run full test suite
npm test

# Build the package
npm run build

# Verify lint passes
npm run lint

# Dry run npm pack to see what will be published
npm pack --dry-run

# Check for security vulnerabilities
npm audit
```

## Step 2: npm Login

Ensure you're logged into npm with an account that has publish permissions:

```bash
npm whoami  # Check if already logged in
npm login   # Login if needed
```

## Step 3: Publish to npm

**IMPORTANT**: This is a one-way operation. Once published, you cannot unpublish after 72 hours or if the package has downloads.

### Option A: Standard Publish

```bash
# Publish to npm registry
npm publish

# Verify package is live
npm view have-we-met
```

### Option B: Test with a Scoped Tag First (Recommended)

If you want to test the publish process without making it the "latest" version immediately:

```bash
# Publish with a "beta" tag
npm publish --tag beta

# Verify it published
npm view have-we-met@beta

# If all looks good, make it "latest"
npm dist-tag add have-we-met@0.1.0 latest
```

## Step 4: Verify npm Installation

Test that the package can be installed and used:

```bash
# Create a test directory
mkdir test-install
cd test-install
npm init -y

# Install from npm registry
npm install have-we-met

# Test ESM import
node --input-type=module -e "import { HaveWeMet } from 'have-we-met'; console.log(HaveWeMet)"

# Test CJS require
node -e "const { HaveWeMet } = require('have-we-met'); console.log(HaveWeMet)"

# Clean up
cd ..
rm -rf test-install
```

## Step 5: Create GitHub Release

1. Go to: https://github.com/8arr3tt/have-we-met/releases/new

2. Select the existing tag: `v0.1.0`

3. Release title: `have-we-met v0.1.0 - Initial Release`

4. Description: Copy the contents from `RELEASE-NOTES.md`

5. Attachments: The tarball will be automatically attached by GitHub

6. Check "Set as the latest release"

7. Click "Publish release"

### Alternative: Use GitHub CLI

```bash
# Ensure gh CLI is installed and authenticated
gh --version
gh auth status

# Create release from RELEASE-NOTES.md
gh release create v0.1.0 \
  --title "have-we-met v0.1.0 - Initial Release" \
  --notes-file RELEASE-NOTES.md \
  --latest

# Verify release
gh release view v0.1.0
```

## Step 6: Push Changes to GitHub

If you haven't already pushed the latest commits:

```bash
# Push commits
git push origin master

# Push tag (if not already pushed)
git push origin v0.1.0
```

## Step 7: Update Repository Settings

1. Go to: https://github.com/8arr3tt/have-we-met

2. Add repository description:
   > Identity resolution library for Node.js - match, deduplicate, and merge records with deterministic, probabilistic, and ML-based matching

3. Add repository topics (click the gear icon next to "About"):
   - identity-resolution
   - record-linkage
   - deduplication
   - fuzzy-matching
   - data-quality
   - master-data-management
   - entity-resolution
   - nodejs
   - typescript

4. Set website URL: `https://github.com/8arr3tt/have-we-met#readme`

5. Ensure repository is public (if not already)

## Step 8: Post-Publication Verification

```bash
# Verify package is visible on npm
open https://www.npmjs.com/package/have-we-met

# Verify GitHub release
open https://github.com/8arr3tt/have-we-met/releases/tag/v0.1.0

# Check npm stats
npm info have-we-met

# Verify latest version
npm view have-we-met version
```

## Step 9: Monitor Initial Usage

After publication, monitor for issues:

1. Watch GitHub issues: https://github.com/8arr3tt/have-we-met/issues
2. Monitor npm download stats: https://www.npmjs.com/package/have-we-met
3. Check for any installation issues reported by early adopters
4. Monitor GitHub discussions if enabled

## Troubleshooting

### "You do not have permission to publish"

- Ensure you're logged in: `npm whoami`
- Verify account has publish permissions
- Check if package name is already taken: `npm view have-we-met`

### "Package already exists"

- If the package name is taken, you may need to publish as a scoped package:
  - Update package.json name to `@yourusername/have-we-met`
  - Publish with: `npm publish --access public`

### "Tag v0.1.0 already exists"

- This is fine if the tag was created in ticket 12.19
- Verify tag points to correct commit: `git show v0.1.0`

### "npm audit shows vulnerabilities"

- Check if vulnerabilities are in devDependencies (acceptable)
- If in production dependencies, consider updating before publish

## Rollback (Emergency Only)

If you need to unpublish within 72 hours and there are no downloads:

```bash
# Unpublish specific version
npm unpublish have-we-met@0.1.0

# Or unpublish entire package (dangerous!)
npm unpublish have-we-met --force
```

**WARNING**: Unpublishing is strongly discouraged and may not be possible after 72 hours or if package has downloads.

## Next Steps After Publication

1. ✅ Update PLAN.md status (done automatically by Ralph)
2. ✅ Update progress-tracker.md (done automatically by Ralph)
3. Consider announcing on social media or relevant communities
4. Monitor for issues and user feedback
5. Plan v0.2.0 based on feedback
6. Consider setting up:
   - Documentation site (GitHub Pages, ReadTheDocs)
   - Code coverage badges (Codecov)
   - CI/CD badges in README
   - Discussions on GitHub

## Reference Links

- npm package: https://www.npmjs.com/package/have-we-met
- GitHub repository: https://github.com/8arr3tt/have-we-met
- GitHub releases: https://github.com/8arr3tt/have-we-met/releases
- Documentation: https://github.com/8arr3tt/have-we-met/tree/master/docs
- Issues: https://github.com/8arr3tt/have-we-met/issues

---

**Publication Date**: 2026-02-02
**Version**: 0.1.0
**Author**: Matt Barrett
