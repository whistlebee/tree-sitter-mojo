#!/usr/bin/env bash

set -eu

expected='Mojo 1.0.0b2 (2cf4d08a)'
mojo="$MOJO_PREFIX/bin/mojo"
lsp="$MOJO_PREFIX/bin/mojo-lsp-server"
version_status=0
version_output="$("$mojo" --version)" || version_status=$?
if test "$version_status" -ne 0; then
  printf 'Mojo version command failed with status %s: %s\n' \
    "$version_status" "$mojo" >&2
  exit 1
fi
if test "$version_output" != "$expected"; then
  printf 'Mojo version mismatch: expected %s, got %s\n' \
    "$expected" "$version_output" >&2
  exit 1
fi
test -x "$lsp"
output_root="$(mktemp -d "${TMPDIR:-/tmp}/mojo-b2-fixtures.XXXXXX")"
trap 'rm -rf -- "$output_root"' EXIT

case "$mojo" in
  /*) ;;
  *)
    printf '%s\n' 'MOJO_PREFIX must be an absolute path' >&2
    exit 1
    ;;
esac

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "$repo_root"

printf 'Mojo compiler: %s\n' "$mojo"
printf 'Mojo LSP: %s\n' "$lsp"
printf 'Mojo version: %s\n' "$expected"

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

tree_sitter_parse() {
  fixture=$1
  tree_output=$2

  if ! npx --yes tree-sitter-cli@0.25.10 parse "$fixture" >"$tree_output" 2>&1; then
    cat "$tree_output" >&2
    die "Tree-sitter ERROR: $fixture"
  fi

  if grep -Eq '\(ERROR([[:space:]]|\))' "$tree_output"; then
    cat "$tree_output" >&2
    die "Tree-sitter ERROR: $fixture"
  fi
}

check_positive() {
  fixture=$1
  name="$(basename -- "$fixture" .mojo)"

  "$mojo" format - <"$fixture" >"$output_root/$name.formatted.mojo"
  "$mojo" build "$fixture" -o "$output_root/positive-$name"
  tree_sitter_parse "$fixture" "$output_root/$name.tree"
  printf 'positive: %s\n' "$(basename -- "$fixture")"
}

check_removed_fn() {
  fixture=$1
  name="$(basename -- "$fixture" .mojo)"
  diagnostic="$output_root/$name.compiler.txt"
  removed_evidence="error: 'fn' has been removed; use 'def' instead"

  if "$mojo" build "$fixture" -o "$output_root/negative-$name" \
    >"$diagnostic" 2>&1; then
    die "syntax-negative fixture compiled successfully: $fixture"
  fi

  if ! grep -Fq "$removed_evidence" "$diagnostic"; then
    cat "$diagnostic" >&2
    die "removed_fn fixture lacks exact b2 frontend evidence: $fixture"
  fi

  printf 'syntax-negative: %s\n' "$(basename -- "$fixture")"
}

observe_deprecated_tree_sitter() {
  fixture=$1
  tree_output=$2
  parse_status=0

  npx --yes tree-sitter-cli@0.25.10 parse "$fixture" \
    >"$tree_output" 2>&1 || parse_status=$?
  if grep -Eq '\(ERROR([[:space:]]|\))' "$tree_output"; then
    printf 'observed grammar gap for Task 8: %s (Tree-sitter ERROR)\n' \
      "$(basename -- "$fixture")"
    return
  fi

  if test "$parse_status" -ne 0; then
    cat "$tree_output" >&2
    die "Tree-sitter parse command failed: $fixture"
  fi

  printf 'deprecated parse: %s (no Tree-sitter ERROR)\n' \
    "$(basename -- "$fixture")"
}

check_deprecated() {
  fixture=$1
  name="$(basename -- "$fixture" .mojo)"
  diagnostic="$output_root/$name.compiler.txt"
  warning="warning: 'alias' is deprecated; use 'comptime'"

  if ! "$mojo" build "$fixture" -o "$output_root/deprecated-$name" \
    >"$diagnostic" 2>&1; then
    cat "$diagnostic" >&2
    die "deprecated fixture did not compile successfully: $fixture"
  fi

  if ! grep -Fq "$warning" "$diagnostic"; then
    cat "$diagnostic" >&2
    die "deprecated fixture lacks the exact alias warning: $fixture"
  fi

  printf 'deprecated: %s (%s)\n' "$(basename -- "$fixture")" "$warning"
  observe_deprecated_tree_sitter "$fixture" "$output_root/$name.tree"
}

check_unknown_name() {
  fixture=$1
  name="$(basename -- "$fixture" .mojo)"
  diagnostic="$output_root/$name.compiler.txt"
  unknown_evidence="error: use of unknown declaration 'missing_name'"

  tree_sitter_parse "$fixture" "$output_root/$name.tree"
  if "$mojo" build "$fixture" -o "$output_root/semantic-$name" \
    >"$diagnostic" 2>&1; then
    die "semantic fixture compiled successfully: $fixture"
  fi

  if ! grep -Fq "$unknown_evidence" "$diagnostic"; then
    cat "$diagnostic" >&2
    die "unknown_name fixture lacks exact semantic evidence: $fixture"
  fi

  printf 'semantic: %s\n' "$(basename -- "$fixture")"
}

positive_root='test/fixtures/b2/positive'
for fixture_name in \
  comptime \
  function_effects \
  ownership_conventions \
  structs_traits \
  mlir_and_strings
do
  check_positive "$positive_root/$fixture_name.mojo"
done

check_removed_fn 'test/fixtures/b2/negative/removed_fn.mojo'
check_deprecated 'test/fixtures/b2/deprecated/deprecated_alias.mojo'
check_unknown_name 'test/fixtures/b2/semantic/unknown_name.mojo'

uv run scripts/lsp_probe.py \
  --server "$MOJO_PREFIX/bin/mojo-lsp-server" \
  --fixture test/fixtures/b2/positive/comptime.mojo \
  >"$output_root/lsp-diagnostics.json"
printf '%s\n' 'LSP diagnostics:'
cat "$output_root/lsp-diagnostics.json"
