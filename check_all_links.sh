#!/bin/bash

base="C:/Users/Matt/Projects/have-we-met"
broken_count=0

# Array of links to check from docs directory
declare -a links=(
    # adapter-guides/typeorm.md
    "docs/adapter-guides/typeorm.md:790:../database-performance.md"
    "docs/adapter-guides/typeorm.md:791:../migration-guide.md"
    "docs/adapter-guides/typeorm.md:792:../../examples/database-adapters/typeorm-example.ts"

    # adapter-guides/prisma.md
    "docs/adapter-guides/prisma.md:625:../database-performance.md"
    "docs/adapter-guides/prisma.md:626:../migration-guide.md"
    "docs/adapter-guides/prisma.md:627:../../examples/database-adapters/prisma-example.ts"

    # adapter-guides/drizzle.md
    "docs/adapter-guides/drizzle.md:701:../database-performance.md"
    "docs/adapter-guides/drizzle.md:702:../migration-guide.md"
    "docs/adapter-guides/drizzle.md:703:../../examples/database-adapters/drizzle-example.ts"

    # api-reference/consolidation-builder.md
    "docs/api-reference/consolidation-builder.md:158:./index.md"
    "docs/api-reference/consolidation-builder.md:185:./index.md"
    "docs/api-reference/consolidation-builder.md:237:./index.md"
    "docs/api-reference/consolidation-builder.md:1277:../consolidation/etl-workflow.md"
    "docs/api-reference/consolidation-builder.md:1277:./index.md"

    # algorithms/comparison.md
    "docs/algorithms/comparison.md:429:../tuning-guide.md"
    "docs/algorithms/comparison.md:430:../../benchmarks/results/febrl-results.md"
    "docs/algorithms/comparison.md:431:../../benchmarks/results/restaurant-results.md"

    # algorithms/string-similarity.md
    "docs/algorithms/string-similarity.md:718:../../benchmarks/PERFORMANCE-REPORT.md"
    "docs/algorithms/string-similarity.md:724:../api/README.md"
    "docs/algorithms/string-similarity.md:725:../../phase-2-plan.md"
    "docs/algorithms/string-similarity.md:726:../../benchmarks/PERFORMANCE-REPORT.md"
    "docs/algorithms/string-similarity.md:727:../../tests/integration/string-similarity.test.ts"

    # consolidation/overview.md
    "docs/consolidation/overview.md:718:../../examples/consolidation/"
    "docs/consolidation/overview.md:719:../../examples/consolidation/manual-workflow.ts"
    "docs/consolidation/overview.md:731:../api-reference/index.md"

    # security.md
    "docs/security.md:265:./guides/advanced-tuning.md"
    "docs/security.md:335:../SECURITY.md"
    "docs/security.md:339:../SECURITY.md"
)

echo "Checking documentation links..."
echo ""

# Check each link
for entry in "${links[@]}"; do
    # Parse entry: file:line:link
    file=$(echo "$entry" | cut -d: -f1)
    line=$(echo "$entry" | cut -d: -f2)
    link=$(echo "$entry" | cut -d: -f3-)

    # Get directory of the file
    file_dir=$(dirname "$base/$file")

    # Resolve the target path
    target="$file_dir/$link"

    # Normalize the path
    target=$(cd "$file_dir" && cd "$(dirname "$link")" 2>/dev/null && pwd)/$(basename "$link") 2>/dev/null

    # Check if file exists
    if [ ! -f "$target" ] && [ ! -d "$target" ]; then
        echo "BROKEN: $file:$line"
        echo "  Link: $link"
        echo "  Expected: $target"
        echo ""
        ((broken_count++))
    fi
done

if [ $broken_count -eq 0 ]; then
    echo "All links are valid!"
else
    echo "Found $broken_count broken links"
fi
