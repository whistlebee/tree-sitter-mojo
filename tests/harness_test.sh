#!/usr/bin/env bash

set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
harness="$repo_root/scripts/check-b2-fixtures.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/mojo-b2-harness-test.XXXXXX")"
trap 'rm -rf -- "$tmp_root"' EXIT

fail() {
  printf 'not ok - %s\n' "$1" >&2
  if test "$#" -gt 1; then
    printf '%s\n' "$2" >&2
  fi
  exit 1
}

test -f "$harness" || fail "missing harness: $harness"

fake_bin="$tmp_root/bin"
fake_sdk="$tmp_root/sdk"
mkdir -p "$fake_bin" "$fake_sdk/bin"

cat >"$fake_sdk/bin/mojo" <<'EOF'
#!/bin/sh

set -eu

printf 'mojo' >>"$HARNESS_CALL_LOG"
for argument in "$@"; do
  printf ' %s' "$argument" >>"$HARNESS_CALL_LOG"
done
printf '\n' >>"$HARNESS_CALL_LOG"

if test "$#" -eq 1 && test "$1" = "--version"; then
  case "${FAKE_CASE:-}" in
    wrong-version)
      printf '%s\n' 'Mojo 1.0.0b1 (wrong)'
      exit 0
      ;;
    version-command-fails)
      printf '%s\n' 'Mojo 1.0.0b2 (2cf4d08a)'
      exit 7
      ;;
    *)
      printf '%s\n' 'Mojo 1.0.0b2 (2cf4d08a)'
      exit 0
      ;;
  esac
fi

if test "$#" -gt 0 && test "$1" = "format"; then
  shift
  test "$#" -eq 1 && test "$1" = "-" || {
    printf '%s\n' 'formatter input must be stdin and output must be stdout' >&2
    exit 91
  }
  cat
  exit 0
fi

if test "$#" -gt 0 && test "$1" = "build"; then
  shift
  input=''
  output=''
  while test "$#" -gt 0; do
    case "$1" in
      -o)
        test "$#" -ge 2 || exit 92
        output=$2
        shift 2
        ;;
      *)
        test -z "$input" || exit 93
        input=$1
        shift
        ;;
    esac
  done

  test -n "$input" && test -n "$output" || exit 94
  case "$output" in
    "$HARNESS_TEST_TMPDIR"/mojo-b2-fixtures.*/*) ;;
    *)
      printf 'build output outside TMPDIR: %s\n' "$output" >&2
      exit 95
      ;;
  esac
  test ! -e "$output.seen" || {
    printf 'build output reused: %s\n' "$output" >&2
    exit 96
  }
  : >"$output.seen"

  case "$(basename -- "$input")" in
    removed_fn.mojo)
      case "${FAKE_CASE:-}" in
        semantic-as-negative)
          printf '%s:1:1: error: use of unresolved name fn\n' "$input" >&2
          ;;
        removed-generic-syntax)
          printf '%s:1:1: error: syntax error: expected function declaration\n' \
            "$input" >&2
          ;;
        removed-footer-only)
          ;;
        *)
          printf "%s:1:1: error: 'fn' has been removed; use 'def' instead\n" \
            "$input" >&2
          printf '%s\n%s\n' 'fn legacy_function():' '^~' >&2
          ;;
      esac
      printf '%s\n' \
        'fake-mojo: error: failed to parse the provided Mojo source module' >&2
      exit 1
      ;;
    deprecated_alias.mojo)
      case "${FAKE_CASE:-}" in
        alias-deprecated|output-root|explicit-syntax|semantic-as-negative|semantic-footer|wrong-version|version-command-fails|removed-generic-syntax|semantic-internal-failure)
          printf "%s:1:1: warning: 'alias' is deprecated; use 'comptime'\n" \
            "$input" >&2
          : >"$output"
          chmod +x "$output"
          exit 0
          ;;
        *)
          printf '%s:1:1: error: parse error: expected comptime instead of alias\n' \
            "$input" >&2
          exit 1
          ;;
      esac
      ;;
    unknown_name.mojo)
      if test "${FAKE_CASE:-}" = "semantic-internal-failure"; then
        printf '%s\n' 'fake-mojo: error: internal compiler failure' >&2
      else
        printf "%s:2:11: error: use of unknown declaration 'missing_name'\n" \
          "$input" >&2
        printf '%s\n%s\n' '    print(missing_name)' '          ^~~~~~~~~~~~' >&2
      fi
      printf '%s\n' \
        'fake-mojo: error: failed to parse the provided Mojo source module' >&2
      exit 1
      ;;
    *)
      : >"$output"
      chmod +x "$output"
      exit 0
      ;;
  esac
fi

printf 'unexpected mojo invocation: %s\n' "$*" >&2
exit 97
EOF

cat >"$fake_sdk/bin/mojo-lsp-server" <<'PY'
#!/usr/bin/env python3

import json
import os
import signal
import sys


CALL_LOG = os.environ["HARNESS_CALL_LOG"]
MODE = os.environ.get("FAKE_CASE", "")


def log(message):
    with open(CALL_LOG, "a", encoding="utf-8") as call_log:
        call_log.write(message + "\n")


def fail(message):
    log("lsp failure: " + message)
    print("fake LSP failure: " + message, file=sys.stderr)
    raise SystemExit(70)


def terminated(_signum, _frame):
    log("lsp terminated")
    raise SystemExit(0)


signal.signal(signal.SIGTERM, terminated)
log("lsp start")


def read_message():
    headers = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\n", b"\r\n"):
            break
        name, value = line.decode("ascii").split(":", 1)
        headers[name.lower()] = value.strip()
    length = int(headers["content-length"])
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        raise RuntimeError("truncated request")
    return json.loads(payload)


def send(message):
    payload = json.dumps(message, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(
        b"Content-Length: " + str(len(payload)).encode("ascii") + b"\r\n\r\n"
    )
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def publish(uri, diagnostics):
    send(
        {
            "jsonrpc": "2.0",
            "method": "textDocument/publishDiagnostics",
            "params": {"uri": uri, "diagnostics": diagnostics},
        }
    )


def diagnostic(message, start_line, start_character, end_line, end_character):
    return {
        "range": {
            "start": {"line": start_line, "character": start_character},
            "end": {"line": end_line, "character": end_character},
        },
        "severity": 1,
        "source": "fake-mojo",
        "message": message,
    }


expected_methods = [
    "initialize",
    "initialized",
    "textDocument/didOpen",
    "shutdown",
    "exit",
]
method_index = 0
opened_uri = None
saw_exit = False

while True:
    message = read_message()
    if message is None:
        log("lsp eof")
        if not saw_exit:
            fail("EOF before exit")
        if method_index != len(expected_methods):
            fail("incomplete lifecycle")
        break
    method = message.get("method")
    if method_index >= len(expected_methods) or method != expected_methods[method_index]:
        expected = (
            expected_methods[method_index]
            if method_index < len(expected_methods)
            else "EOF"
        )
        fail("expected {} but received {}".format(expected, method))
    method_index += 1
    log("lsp " + method)

    if method == "initialize":
        send(
            {
                "jsonrpc": "2.0",
                "id": message["id"],
                "result": {"capabilities": {"textDocumentSync": 1}},
            }
        )
    elif method == "textDocument/didOpen":
        opened_uri = message["params"]["textDocument"]["uri"]
        if MODE == "malformed-diagnostics":
            sys.stdout.buffer.write(b"Content-Length: 3\r\n\r\nxxx")
            sys.stdout.buffer.flush()
            log("lsp malformed diagnostics")
        elif MODE == "diagnostics-after-shutdown":
            publish(opened_uri, [])
            log("lsp publish opened empty")
        else:
            publish(
                opened_uri,
                [
                    diagnostic("zeta diagnostic", 2, 1, 2, 4),
                    diagnostic("alpha diagnostic", 0, 0, 0, 1),
                ],
            )
    elif method == "shutdown":
        send({"jsonrpc": "2.0", "id": message["id"], "result": None})
        log("lsp shutdown response")
        if MODE == "diagnostics-after-shutdown":
            publish(
                "file:///000-first.mojo",
                [diagnostic("first-uri", 9, 0, 9, 1)],
            )
            publish(
                opened_uri,
                [
                    diagnostic("range-later", 1, 0, 1, 4),
                    diagnostic("message-z", 0, 0, 0, 5),
                    diagnostic("end-earlier", 0, 0, 0, 2),
                    diagnostic("message-a", 0, 0, 0, 5),
                ],
            )
            publish(
                "file:///zzz-last.mojo",
                [diagnostic("last-uri", 0, 0, 0, 1)],
            )
            log("lsp publish after shutdown")
    elif method == "exit":
        saw_exit = True
PY

cat >"$fake_bin/npx" <<'EOF'
#!/bin/sh

set -eu
printf 'npx' >>"$HARNESS_CALL_LOG"
for argument in "$@"; do
  printf ' %s' "$argument" >>"$HARNESS_CALL_LOG"
done
printf '\n' >>"$HARNESS_CALL_LOG"
test "$#" -eq 4 || exit 81
test "$1" = "--yes" || exit 82
test "$2" = "tree-sitter-cli@0.25.10" || exit 83
test "$3" = "parse" || exit 84

if test "${FAKE_CASE:-}" = "tree-sitter-error" &&
  test "$(basename -- "$4")" = "comptime.mojo"; then
  printf '%s\n' '(module (ERROR (identifier)))'
elif test "${FAKE_CASE:-}" = "alias-deprecated" &&
  test "$(basename -- "$4")" = "deprecated_alias.mojo"; then
  printf '%s\n' '(module (ERROR (identifier)))'
else
  printf '%s\n' '(module)'
fi
EOF

chmod +x "$fake_sdk/bin/mojo" "$fake_sdk/bin/mojo-lsp-server" "$fake_bin/npx"

last_output=''
last_status=0
last_calls=''
last_lsp_output=''
last_lsp_status=0
last_lsp_calls=''
last_resource_output=''
last_resource_status=0
last_resource_calls=''

run_harness() {
  case_name=$1
  case_tmp="$tmp_root/$case_name"
  mkdir -p "$case_tmp"
  : >"$case_tmp/calls.log"

  set +e
  last_output="$(
    cd "$repo_root" &&
      env \
        FAKE_CASE="$case_name" \
        HARNESS_CALL_LOG="$case_tmp/calls.log" \
        HARNESS_TEST_TMPDIR="$case_tmp" \
        MOJO_PREFIX="$fake_sdk" \
        PATH="$fake_bin:$PATH" \
        TMPDIR="$case_tmp" \
        UV_CACHE_DIR="$tmp_root/uv-cache" \
        bash "$harness" 2>&1
  )"
  last_status=$?
  set -e
  last_calls="$(cat "$case_tmp/calls.log")"
}

run_lsp_probe() {
  case_name=$1
  case_tmp="$tmp_root/lsp-$case_name"
  mkdir -p "$case_tmp"
  : >"$case_tmp/calls.log"

  set +e
  last_lsp_output="$(
    cd "$repo_root" &&
      env \
        FAKE_CASE="$case_name" \
        HARNESS_CALL_LOG="$case_tmp/calls.log" \
        UV_CACHE_DIR="$tmp_root/uv-cache" \
        uv run scripts/lsp_probe.py \
          --server "$fake_sdk/bin/mojo-lsp-server" \
          --fixture test/fixtures/b2/positive/comptime.mojo 2>&1
  )"
  last_lsp_status=$?
  set -e
  last_lsp_calls="$(cat "$case_tmp/calls.log")"
}

run_lsp_abort_resource_probe() {
  case_tmp="$tmp_root/lsp-resource-abort"
  mkdir -p "$case_tmp"
  : >"$case_tmp/calls.log"

  set +e
  last_resource_output="$(
    cd "$repo_root" &&
      env HARNESS_CALL_LOG="$case_tmp/calls.log" \
        PYTHONDONTWRITEBYTECODE=1 \
        uv run python - \
          "$repo_root/scripts/lsp_probe.py" \
          "$fake_sdk/bin/mojo-lsp-server" <<'PY'
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("lsp_probe", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

session = module.LspSession(sys.argv[2], 1.0)
session.send(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"capabilities": {}},
    }
)
session.wait_for_response(1)
session.abort()

states = {
    "process": session.process.poll() is not None,
    "stdin": session.process.stdin.closed,
    "stdout": session.process.stdout.closed,
    "stderr": session.stderr_file.closed,
    "reader": not session.reader.is_alive(),
}
open_resources = sorted(name for name, closed in states.items() if not closed)
if open_resources:
    raise SystemExit("resource cleanup failed: " + ",".join(open_resources))
print("abort resources closed")
PY
  )"
  last_resource_status=$?
  set -e
  last_resource_calls="$(cat "$case_tmp/calls.log")"
}

run_lsp_close_resource_probe() {
  case_tmp="$tmp_root/lsp-resource-close"
  mkdir -p "$case_tmp"
  : >"$case_tmp/calls.log"

  set +e
  last_resource_output="$(
    cd "$repo_root" &&
      env HARNESS_CALL_LOG="$case_tmp/calls.log" \
        PYTHONDONTWRITEBYTECODE=1 \
        uv run python - \
          "$repo_root/scripts/lsp_probe.py" \
          "$fake_sdk/bin/mojo-lsp-server" <<'PY'
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("lsp_probe", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

session = module.LspSession(sys.argv[2], 1.0)
session.send(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {"capabilities": {}},
    }
)
session.wait_for_response(1)
session.send({"jsonrpc": "2.0", "method": "initialized", "params": {}})
session.send(
    {
        "jsonrpc": "2.0",
        "method": "textDocument/didOpen",
        "params": {"textDocument": {"uri": "file:///resource-close.mojo"}},
    }
)
session.send(
    {"jsonrpc": "2.0", "id": 2, "method": "shutdown", "params": None}
)
session.wait_for_response(2)
session.send({"jsonrpc": "2.0", "method": "exit", "params": None})
session.close()

states = {
    "process": session.process.poll() is not None,
    "stdin": session.process.stdin.closed,
    "stdout": session.process.stdout.closed,
    "stderr": session.stderr_file.closed,
    "reader": not session.reader.is_alive(),
}
open_resources = sorted(name for name, closed in states.items() if not closed)
if open_resources:
    raise SystemExit("resource cleanup failed: " + ",".join(open_resources))
print("success resources closed")
PY
  )"
  last_resource_status=$?
  set -e
  last_resource_calls="$(cat "$case_tmp/calls.log")"
}

assert_rejected() {
  test "$last_status" -ne 0 || fail "$1" "$last_output"
}

assert_accepted() {
  test "$last_status" -eq 0 || fail "$1" "$last_output"
}

assert_contains() {
  case "$1" in
    *"$2"*) ;;
    *) fail "$3" "$1" ;;
  esac
}

assert_not_contains() {
  case "$1" in
    *"$2"*) fail "$3" "$1" ;;
    *) ;;
  esac
}

assert_equals() {
  test "$1" = "$2" || fail "$3" "expected: $2\nactual: $1"
}

assert_before() {
  first_line="$(printf '%s\n' "$1" | grep -n -m 1 "$2" | cut -d: -f1)"
  second_line="$(printf '%s\n' "$1" | grep -n -m 1 "$3" | cut -d: -f1)"
  test -n "$first_line" && test -n "$second_line" &&
    test "$first_line" -lt "$second_line" || fail "$4" "$1"
}

run_harness version-command-fails
assert_rejected "matching version text with nonzero exit was accepted"
assert_contains "$last_output" 'Mojo version command failed with status 7' \
  "version command failure did not report its status"
assert_equals "$last_calls" 'mojo --version' \
  "version command failure did not short-circuit the harness"
printf '%s\n' 'ok 1 - matching version text with nonzero exit is rejected'

run_harness wrong-version
assert_rejected "wrong mojo version was accepted"
assert_contains "$last_output" \
  'Mojo version mismatch: expected Mojo 1.0.0b2 (2cf4d08a), got Mojo 1.0.0b1 (wrong)' \
  "wrong version rejection did not report expected and actual versions"
assert_equals "$last_calls" 'mojo --version' \
  "wrong version rejection did not short-circuit the harness"
printf '%s\n' 'ok 2 - wrong mojo version is rejected'

run_harness alias-deprecated
assert_accepted "exact alias deprecation evidence was rejected"
assert_contains "$last_output" 'deprecated: deprecated_alias.mojo' \
  "alias deprecation evidence was not recorded"
assert_not_contains "$last_output" 'syntax-negative: deprecated_alias.mojo' \
  "alias deprecation was counted as syntax-negative evidence"
assert_contains "$last_output" \
  'observed grammar gap for Task 8: deprecated_alias.mojo (Tree-sitter ERROR)' \
  "deprecated alias Tree-sitter ERROR was not reported as a Task 8 gap"
printf '%s\n' 'ok 3 - compiler-success alias warning is deprecated evidence only'

run_harness output-root
assert_accepted "outputs below TMPDIR were rejected"
if find "$tmp_root/output-root" -name 'mojo-b2-fixtures.*' -type d -print | grep -q .; then
  fail "temporary output root was not removed" "$last_output"
fi
printf '%s\n' 'ok 4 - every build output stays below TMPDIR'

run_harness tree-sitter-error
assert_rejected "positive Tree-sitter ERROR was accepted"
assert_contains "$last_output" 'Tree-sitter ERROR' \
  "Tree-sitter rejection did not identify the parser error"
printf '%s\n' 'ok 5 - compiler success cannot hide a Tree-sitter ERROR'

run_harness removed-generic-syntax
assert_rejected "generic syntax wording was accepted for removed_fn"
assert_contains "$last_output" 'removed_fn fixture lacks exact b2 frontend evidence' \
  "removed_fn rejection did not require its exact b2 evidence"
printf '%s\n' 'ok 6 - removed_fn requires its exact b2 frontend evidence'

run_harness removed-footer-only
assert_rejected "generic compiler footer was accepted for removed_fn"
assert_contains "$last_output" 'removed_fn fixture lacks exact b2 frontend evidence' \
  "removed_fn footer-only rejection did not identify missing exact evidence"
printf '%s\n' 'ok 7 - generic compiler footer is not removed_fn evidence'

run_harness semantic-as-negative
assert_rejected "semantic compiler error was accepted as syntax-negative evidence"
assert_contains "$last_output" 'removed_fn fixture lacks exact b2 frontend evidence' \
  "semantic rejection did not identify missing removed_fn evidence"
printf '%s\n' 'ok 8 - semantic errors are not syntax-negative evidence'

run_harness semantic-internal-failure
assert_rejected "internal compiler failure was accepted as unknown_name evidence"
assert_contains "$last_output" 'unknown_name fixture lacks exact semantic evidence' \
  "internal failure rejection did not identify missing unknown_name evidence"
printf '%s\n' 'ok 9 - internal failure is not unknown_name evidence'

run_harness semantic-footer
assert_accepted "semantic diagnostic with generic compiler footer was rejected"
assert_contains "$last_output" 'semantic: unknown_name.mojo' \
  "unknown_name was not retained as semantic-only evidence"
assert_not_contains "$last_output" 'syntax-negative: unknown_name.mojo' \
  "unknown_name was counted as syntax-negative evidence"
printf '%s\n' 'ok 10 - exact unknown_name evidence survives the generic footer'

run_harness explicit-syntax
assert_accepted "explicit frontend syntax diagnostics were rejected"
assert_contains "$last_output" 'syntax-negative: removed_fn.mojo' \
  "removed_fn syntax evidence was not recorded"
assert_contains "$last_output" "Mojo compiler: $fake_sdk/bin/mojo" \
  "absolute compiler path was not recorded"
assert_contains "$last_output" "Mojo LSP: $fake_sdk/bin/mojo-lsp-server" \
  "absolute LSP path was not recorded"
assert_before "$last_output" 'alpha diagnostic' 'zeta diagnostic' \
  "LSP diagnostics were not normalized by range"
printf '%s\n' 'ok 11 - exact removed_fn frontend evidence is accepted'

run_lsp_abort_resource_probe
test "$last_resource_status" -eq 0 || fail \
  "LSP abort leaked resources" "$last_resource_output"
assert_equals "$last_resource_calls" \
  'lsp start
lsp initialize
lsp terminated' \
  "LSP abort did not terminate and wait for the fake server"
printf '%s\n' 'ok 12 - abort terminates the server and closes every resource'

run_lsp_close_resource_probe
test "$last_resource_status" -eq 0 || fail \
  "successful LSP lifecycle leaked resources" "$last_resource_output"
assert_equals "$last_resource_calls" \
  'lsp start
lsp initialize
lsp initialized
lsp textDocument/didOpen
lsp shutdown
lsp shutdown response
lsp exit
lsp eof' \
  "successful LSP lifecycle did not reach exit and EOF in order"
printf '%s\n' 'ok 13 - successful lifecycle closes every LSP resource'

run_lsp_probe diagnostics-after-shutdown
test "$last_lsp_status" -eq 0 || fail \
  "post-shutdown diagnostics probe failed" "$last_lsp_output"
lsp_message_order="$(
  printf '%s\n' "$last_lsp_output" |
    uv run python -c \
      'import json, sys; print("|".join(item["message"] for item in json.load(sys.stdin)))'
)"
assert_equals "$lsp_message_order" \
  'first-uri|end-earlier|message-a|message-z|range-later|last-uri' \
  "post-shutdown diagnostics were not drained and fully sorted"
assert_equals "$last_lsp_calls" \
  'lsp start
lsp initialize
lsp initialized
lsp textDocument/didOpen
lsp publish opened empty
lsp shutdown
lsp shutdown response
lsp publish after shutdown
lsp exit
lsp eof' \
  "LSP lifecycle order was incomplete or incorrect"
printf '%s\n' 'ok 14 - post-shutdown diagnostics are drained and deterministically sorted'

run_lsp_probe malformed-diagnostics
test "$last_lsp_status" -ne 0 || fail \
  "malformed LSP payload was accepted" "$last_lsp_output"
assert_contains "$last_lsp_output" 'LSP probe failed: invalid JSON-RPC payload' \
  "malformed payload rejection did not report the protocol error"
assert_equals "$last_lsp_calls" \
  'lsp start
lsp initialize
lsp initialized
lsp textDocument/didOpen
lsp malformed diagnostics
lsp terminated' \
  "malformed payload did not abort and terminate the fake server"
printf '%s\n' 'ok 15 - protocol failure aborts and closes every LSP resource'

printf '%s\n' '1..15'
